import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initializeHistory, queryHistory, type HistorySQL } from '../packages/backend/src/history';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE,body TEXT)',
  );
  const sql: HistorySQL = {
    exec: (query, ...args) => {
      const statement = db.prepare(query);
      if (!statement.columns().length) {
        statement.run(...args);
        return { toArray: () => [] };
      }
      return { toArray: () => statement.all(...args) as any };
    },
  };
  initializeHistory(sql);
  const add = (id: string, workspace: string, kind: string, payload: unknown) =>
    db.prepare('INSERT INTO events(event_id,body) VALUES(?,?)').run(
      id,
      JSON.stringify({
        version: 1,
        id,
        kind,
        workspaceId: workspace,
        occurredAt: 1000,
        receivedAt: 1000,
        actor: { id: workspace, name: workspace },
        payload,
      }),
    );
  const query = async (route: string) =>
    (await queryHistory(sql, new URL('http://room' + route)).json()) as any;
  return { db, add, query };
}
test('persistent history pages cross 5000 rows without gaps; session pagination holds a fixed head', async () => {
  const { db, add, query } = fixture();
  try {
    db.exec('BEGIN');
    for (let n = 0; n < 5103; n++)
      add('msg' + n, n % 2 ? 'alice' : 'bob', 'agent.message', {
        sessionId: 'session' + Math.floor(n / 17),
        text: 'TEST message ' + n,
        role: 'assistant',
      });
    db.exec('COMMIT');
    const ids = new Set<string>();
    let next: number | null = null,
      head = 0;
    do {
      const page = await query(
        '/history?limit=50' + (next === null ? '' : `&before=${next}&head=${head}`),
      );
      head = page.head;
      for (const row of page.items) {
        assert.equal(ids.has(row.id), false);
        ids.add(row.id);
      }
      next = page.next;
    } while (next !== null);
    assert.equal(ids.size, 5103);
    const sessions = await query('/sessions?limit=50&member=alice');
    add('new-message', 'alice', 'agent.message', {
      sessionId: 'session0',
      text: 'TEST late',
      role: 'assistant',
    });
    const seen = new Set(sessions.items.map((r: any) => r.workspaceId + ':' + r.sessionId));
    next = sessions.next;
    while (next !== null) {
      const page = await query(
        `/sessions?limit=50&member=alice&head=${sessions.head}&before=${next}`,
      );
      for (const row of page.items) {
        const key = row.workspaceId + ':' + row.sessionId;
        assert.equal(seen.has(key), false);
        seen.add(key);
      }
      next = page.next;
    }
    assert.equal(seen.size, 301);
    const found = await query('/history?q=message%205102');
    assert.equal(found.items.length, 1);
    assert.equal(found.items[0].id, 'msg5102');
    assert.equal((await query('/sessions?q=message%205102')).items.length, 1);
  } finally {
    db.close();
  }
});
test('message cursors and durable anchors keep equal timestamps and workspace sessions separate', async () => {
  const { db, add, query } = fixture();
  try {
    for (let n = 0; n < 101; n++) {
      add('a' + n, 'a', 'agent.message', { sessionId: 'same', text: 'TEST ' + n });
      add('b' + n, 'b', 'agent.message', { sessionId: 'same', text: 'TEST other' });
    }
    const base = '/messages?workspace=a&session=same&limit=20';
    const latest = await query(base);
    assert.equal(latest.items.at(-1).id, 'a100');
    assert.equal(latest.newer, null);
    const earlier = await query(base + '&before=' + latest.older);
    assert.equal(earlier.items.at(-1).id, 'a80');
    const around = await query(base + '&around=a40');
    assert.ok(around.items.some((r: any) => r.id === 'a40'));
    assert.ok(around.items.every((r: any) => r.workspaceId === 'a'));
    assert.ok(around.older && around.newer);
    const newer = await query(base + '&after=' + around.newer);
    assert.equal(newer.items[0].seq, around.items.at(-1).seq + 2);
    assert.throws(
      () =>
        queryHistory(
          { exec: () => ({ toArray: () => [] }) },
          new URL('http://room/messages?workspace=a&session=same&around=b40'),
        ),
      /Message not found/,
    );
    assert.equal((await query('/event?id=a0')).id, 'a0');
  } finally {
    db.close();
  }
});
test('checkpoint inventory spans parts, omits patch bytes and reports incomplete or duplicate capture', async () => {
  const { db, add, query } = fixture();
  const file = (path: string) => ({
    path,
    status: 'added',
    binary: false,
    size: 2,
    beforeHash: null,
    afterHash: 'a',
    patch: 'TEST PATCH',
    truncated: false,
  });
  const cp = (part: number, files: unknown[]) => ({
    checkpointId: 'cp',
    label: 'TEST',
    part,
    parts: 2,
    totalFiles: 3,
    files,
  });
  try {
    add('p1', 'a', 'checkpoint', cp(1, [file('a.txt'), file('b.txt')]));
    let page = await query('/checkpoint-files?workspace=a&checkpoint=cp&limit=1');
    assert.equal(page.complete, false);
    assert.equal(page.files[0].patch, undefined);
    assert.equal(page.next, 'a.txt');
    const beforeSearch = await query('/history?q=c.txt');
    assert.equal(beforeSearch.items.length, 0);
    add('p2', 'a', 'checkpoint', cp(2, [file('c.txt')]));
    assert.equal((await query('/history?q=c.txt')).items[0].id, 'p1');
    assert.equal((await query('/history?q=c.txt&after=' + beforeSearch.head)).items[0].id, 'p1');
    assert.equal((await query('/history?q=c.txt&head=' + beforeSearch.head)).items.length, 0);
    page = await query('/checkpoint-files?workspace=a&checkpoint=cp&after=a.txt');
    assert.equal(page.complete, true);
    assert.equal(page.files.length, 2);
    assert.equal(
      (await query('/checkpoint-file?workspace=a&checkpoint=cp&path=c.txt')).patch,
      'TEST PATCH',
    );
    add('p3', 'a', 'checkpoint', cp(2, [file('c.txt')]));
    assert.equal((await query('/checkpoint-files?workspace=a&checkpoint=cp')).complete, false);
    assert.equal((await query('/history')).items.length, 1);
  } finally {
    db.close();
  }
});
