import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCodexLog, collectCodex } from '../packages/connector/src/codex';
import { acquireStateLock } from '../packages/connector/src/lock';
import { Store } from '../packages/connector/src/store';
import { Snapshots } from '../packages/connector/src/snapshots';
import { git } from '../packages/connector/src/vendor/codecast/git';
import { Connector } from '../packages/connector/src/connector';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

async function fixture() {
  const base = path.resolve('.local/connector-safety');
  await fs.mkdir(base, { recursive: true });
  const directory = await fs.mkdtemp(path.join(base, 'case-'));
  const root = path.join(directory, 'project');
  const state = path.join(directory, 'state');
  await fs.mkdir(root);
  const store = new Store(state);
  const snapshots = new Snapshots(root, state, 'connector-safety', store);
  await snapshots.init();
  return { directory, root, state, store, snapshots };
}

test('Codex project attribution follows each turn cwd and excludes messages from another project', async () => {
  const f = await fixture();
  const other = path.join(f.directory, 'other-project');
  const message = (text: string) => ({
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'assistant',
      channel: 'final',
      content: [{ type: 'output_text', text }],
    },
  });
  try {
    const text = [
      { type: 'session_meta', payload: { id: 'changing-project-session', cwd: f.root } },
      message('TEST first project message'),
      { type: 'turn_context', payload: { cwd: other } },
      message('TEST PRIVATE OTHER PROJECT MESSAGE'),
      { type: 'turn_context', payload: { cwd: f.root } },
      message('TEST returned project message'),
    ]
      .map((row) => JSON.stringify(row))
      .join('\n');
    assert.deepEqual(
      parseCodexLog(text, f.root).map((m) => m.text),
      ['TEST first project message', 'TEST returned project message'],
    );
    const file = path.join(f.directory, 'session.jsonl');
    await fs.writeFile(file, text);
    assert.equal(await collectCodex(file, f.root, 'connector-safety', f.store), 2);
    assert.ok(!f.store.pending().some((row) => row.event.includes('PRIVATE OTHER PROJECT')));
  } finally {
    f.store.close();
  }
});

test('malformed Codex records cannot stop subsequent valid authored messages', () => {
  const root = path.resolve('.local/connector-safety/source');
  const text = [
    null,
    { type: 'session_meta', payload: { id: 'test-session', cwd: root } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: 'invalid' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [null] } },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'TEST valid message' }],
      },
    },
  ]
    .map((row) => JSON.stringify(row))
    .join('\n');
  assert.deepEqual(
    parseCodexLog(text, root).map((m) => m.text),
    ['TEST valid message'],
  );
});

test('stale lock recovery excludes a second writer while the old lock record is inspected', async (t) => {
  const f = await fixture();
  const file = path.join(f.state, 'connector.lock');
  await fs.writeFile(file, JSON.stringify({ pid: 2147483647, nonce: 'dead-owner' }));
  const originalRead = fs.readFile.bind(fs);
  let entered!: () => void, resume!: () => void;
  const reading = new Promise<void>((r) => {
    entered = r;
  });
  const gate = new Promise<void>((r) => {
    resume = r;
  });
  let reads = 0;
  t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
    const bytes = await originalRead(...args);
    if (String(args[0]) === file) {
      reads++;
      entered();
      await gate;
    }
    return bytes;
  });
  const first = acquireStateLock(f.state);
  let second: Promise<() => Promise<void>> | undefined;
  try {
    await reading;
    second = acquireStateLock(f.state);
    void second.catch(() => {});
    await new Promise<void>((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(reads, 1, 'only the lock owner may inspect/remove a stale record');
  } finally {
    resume();
    t.mock.restoreAll();
    for (const result of await Promise.allSettled([first, ...(second ? [second] : [])]))
      if (result.status === 'fulfilled') await result.value();
    f.store.close();
  }
});

test('the OS-backed state lock is released if a connector process is killed', async () => {
  const f = await fixture();
  const module = pathToFileURL(path.resolve('packages/connector/src/lock.ts')).href;
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `const { acquireStateLock } = await import(${JSON.stringify(module)});
     await acquireStateLock(process.argv[1]);
     process.stdout.write('LOCKED'); setInterval(() => {}, 1000);`,
      f.state,
    ],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  let release: (() => Promise<void>) | undefined;
  const exited = once(child, 'exit');
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Lock fixture process did not start')),
        10000,
      );
      child.stdout.once('data', () => {
        clearTimeout(timeout);
        resolve();
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    await assert.rejects(() => acquireStateLock(f.state), /already owns/);
    child.kill('SIGKILL');
    await exited;
    release = await acquireStateLock(f.state);
    await assert.rejects(() => acquireStateLock(f.state), /already owns/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    await release?.();
    f.store.close();
  }
});

test('state directory authorization rejects ancestor junctions before creating any project files', async () => {
  const f = await fixture();
  try {
    const alias = path.join(f.directory, 'project-alias');
    await fs.symlink(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const connector = new Connector({
      root: f.root,
      state: path.join(alias, 'unapproved-state'),
      backend: 'http://127.0.0.1:1',
      projectId: 'safety',
      workspaceId: 'safety',
      userId: 'safety',
      label: 'TEST',
      token: 'TEST_FAKE_TOKEN_NOT_REAL',
      port: 18999,
    });
    await assert.rejects(() => connector.start(), /link|junction/i);
    await assert.rejects(fs.access(path.join(f.root, 'unapproved-state')), { code: 'ENOENT' });
  } finally {
    f.store.close();
  }
});

test('multipart checkpoint persistence rolls back together and a retry retains a pinned usable snapshot', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 101; i++) await fs.writeFile(path.join(f.root, `${i}.txt`), 'TEST');
    f.store.db.exec(`CREATE TRIGGER fail_second_part BEFORE INSERT ON outbox
      WHEN json_extract(NEW.event,'$.payload.part')=2
      BEGIN SELECT RAISE(ABORT,'TEST interrupted multipart persistence'); END;`);
    await assert.rejects(() => f.snapshots.capture(), /interrupted multipart persistence/);
    assert.equal(f.store.latest(), null);
    assert.equal(f.store.count(), 0);
    f.store.db.exec('DROP TRIGGER fail_second_part');
    const cp = (await f.snapshots.capture())!;
    assert.equal(cp.eventCount, 2);
    assert.equal(f.store.count(), 2);
    assert.equal(
      await git(f.snapshots.mirror, ['rev-parse', `refs/collosys/checkpoints/${cp.id}`]),
      cp.sha,
    );
    assert.equal((await f.snapshots.content(cp, '100.txt')).toString(), 'TEST');
  } finally {
    f.store.close();
  }
});

test('restore refuses to modify project files if the mandatory current-state backup fails', async () => {
  const f = await fixture();
  try {
    const file = path.join(f.root, 'a.txt');
    await fs.writeFile(file, 'TEST original');
    const original = (await f.snapshots.capture())!;
    await fs.writeFile(file, 'TEST unsaved-to-history current work');
    const preview = await f.snapshots.preview(original.id);
    const pending = f.store.count();
    f.store.set('retention', { maxCheckpoints: 2, maxAgeDays: 30, maxDiskMiB: 0 });
    await assert.rejects(() => f.snapshots.restore(preview.id, true), /quota/);
    assert.equal(await fs.readFile(file, 'utf8'), 'TEST unsaved-to-history current work');
    assert.equal(f.store.count(), pending);
    assert.equal(f.store.latest()!.id, original.id);
    assert.ok(f.store.preview(preview.id));
  } finally {
    f.store.close();
  }
});

test('lost and invalid persistence receipts keep the same durable event queued until a valid replay ACK', async () => {
  const f = await fixture();
  const receipts = new DatabaseSync(path.join(f.directory, 'server-receipts.sqlite'));
  receipts.exec(
    'CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,body TEXT NOT NULL)',
  );
  let sends = 0;
  const backend = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (req.url?.endsWith('/workspaces')) {
      res.end(JSON.stringify({ userId: 'test-owner' }));
      return;
    }
    receipts
      .prepare('INSERT OR IGNORE INTO events(id,body) VALUES(?,?)')
      .run(body.id, JSON.stringify(body));
    const saved = receipts.prepare('SELECT id,seq FROM events WHERE id=?').get(body.id);
    sends++;
    if (sends === 1) {
      req.socket.destroy();
      return;
    } // persistence succeeded; the receipt was lost
    res.end(JSON.stringify(sends === 2 ? { id: body.id, seq: 0 } : saved));
  });
  try {
    await fs.writeFile(path.join(f.root, 'a.txt'), 'TEST queued bytes');
    await f.snapshots.capture();
    const id = f.store.pending()[0].id;
    await new Promise<void>((r) => backend.listen(0, '127.0.0.1', r));
    const port = (backend.address() as { port: number }).port;
    const connector = new Connector({
      root: f.root,
      state: f.state,
      backend: `http://127.0.0.1:${port}`,
      projectId: 'test-project',
      workspaceId: 'connector-safety',
      userId: 'test-owner',
      label: 'TEST',
      token: 'TEST_FAKE_TOKEN_NOT_REAL',
      port: 18999,
    });
    connector.store = f.store;
    connector.snapshots = f.snapshots;
    await connector.flush();
    assert.equal(f.store.count(), 1);
    assert.equal(f.store.pending()[0].id, id);
    f.store.retryNow();
    await connector.flush();
    assert.equal(f.store.count(), 1);
    assert.match(f.store.pending()[0].error!, /Invalid persistence receipt/);
    f.store.retryNow();
    await connector.flush();
    assert.equal(f.store.count(), 0);
    assert.equal(sends, 3);
    assert.equal(
      (receipts.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n,
      1,
    );
    assert.equal((f.store.db.prepare('SELECT id FROM delivered').get() as { id: string }).id, id);
    assert.equal(connector.deliveryState, 'ready');
  } finally {
    await new Promise<void>((r) => backend.close(() => r()));
    receipts.close();
    f.store.close();
  }
});
