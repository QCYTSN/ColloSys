import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sqliteEnv } from './sqlite-env';
import { backups } from '../packages/backend/src/backups';
import { teams } from '../packages/backend/src/teams';
import { collaboration } from '../packages/backend/src/collaboration';
const actor = { id: 'alice', name: 'Alice', tokenHash: 'TEST', expiresAt: Date.now() + 60000 };
test('backup migration preserves legacy object download/delete and does not reset new generations on rerun', async () => {
  const { db, env, migrate } = sqliteEnv();
  const bytes = Buffer.alloc(128, 65),
    digest = createHash('sha256').update(bytes).digest('hex');
  const objects = new Map<string, Buffer>([['demo-project/alice/old', bytes]]);
  env.BACKUPS = {
    get: async (key: string) => (objects.has(key) ? { body: objects.get(key) } : null),
    delete: async (key: string) => {
      objects.delete(key);
    },
  } as any;
  const request = (id: string, method = 'GET', data?: unknown) =>
    backups(
      new Request('http://local/api/projects/demo-project/backups' + id, {
        method,
        body: data ? JSON.stringify(data) : undefined,
      }),
      env,
      actor,
      'demo-project',
    );
  try {
    db.prepare('INSERT INTO backup_objects VALUES(?,?,?,?,?,?,?,?)').run(
      'old',
      'demo-project',
      'alice',
      'cp',
      bytes.length,
      digest,
      'complete',
      1000,
    );
    migrate('migrations/0003.sql');
    migrate('migrations/0003.sql');
    const response = await request('/old');
    assert.equal(response!.status, 200);
    assert.deepEqual(Buffer.from(await response!.arrayBuffer()), bytes);
    await request('/old', 'DELETE');
    assert.equal(objects.size, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM backup_generations').get()!.n, 0);
    await request('', 'POST', { id: 'old', checkpointId: 'cp', size: bytes.length, digest });
    const generation = db.prepare('SELECT generation FROM backup_generations').get()!.generation;
    assert.notEqual(generation, 'legacy');
    migrate('migrations/0003.sql');
    assert.equal(
      db.prepare('SELECT generation FROM backup_generations').get()!.generation,
      generation,
    );
  } finally {
    db.close();
  }
});
test('team removal can retry its authorization barrier after metadata deletion', async () => {
  const { db, env } = sqliteEnv();
  let calls = 0;
  env.PROJECTS = {
    idFromName: (id: string) => id,
    get: () => ({ fetch: async () => new Response('', { status: ++calls === 1 ? 503 : 200 }) }),
  } as any;
  const request = () =>
    teams(
      new Request('http://local/api/teams/demo-team/members/bob', { method: 'DELETE' }),
      env,
      actor,
    );
  try {
    await assert.rejects(request, /retry to finish/);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM project_members WHERE user_id='bob'").get()!.n,
      0,
    );
    assert.equal((await request())!.status, 200);
    assert.equal(calls, 2);
  } finally {
    db.close();
  }
});
test('collaboration pages retain equal-time older rows while tasks change', async () => {
  const { db, env } = sqliteEnv();
  try {
    const insert = db.prepare(
      "INSERT INTO tasks(id,project_id,title,description,created_by,updated_at) VALUES(?,'demo-project',?,'','alice',1000)",
    );
    for (let i = 0; i < 125; i++) insert.run('task' + i, 'TEST ' + i);
    const read = async (suffix = '') =>
      (await (await collaboration(
        new Request('http://local/api/projects/demo-project/tasks' + suffix),
        env,
        actor,
        'demo-project',
        'owner',
      ))!.json()) as any;
    const first = await read();
    assert.equal(first.tasks.length, 50);
    db.prepare("UPDATE tasks SET title='TEST edited',updated_at=2000 WHERE id='task0'").run();
    const second = await read('?before=' + first.next.tasks),
      third = await read('?before=' + second.next.tasks);
    const all = [...first.tasks, ...second.tasks, ...third.tasks];
    assert.equal(new Set(all.map((x) => x.id)).size, 125);
    assert.equal(third.next.tasks, null);
    assert.equal(all.find((x) => x.id === 'task0').title, 'TEST edited');
  } finally {
    db.close();
  }
});

test('a concurrent revoke/regrant cannot acknowledge a collaboration insert that never committed', async () => {
  const { db, env } = sqliteEnv();
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('TEST', 'alice', actor.expiresAt);
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (query: string) => {
    const statement = prepare(query);
    if (query.startsWith('INSERT INTO comments')) {
      const run = statement.run.bind(statement);
      statement.run = (async () => {
        db.prepare(
          "DELETE FROM project_members WHERE project_id='demo-project' AND user_id='alice'",
        ).run();
        const result = await run();
        db.prepare("INSERT INTO project_members VALUES('demo-project','alice','owner')").run();
        return result;
      }) as typeof statement.run;
    }
    return statement;
  };
  try {
    await assert.rejects(
      () =>
        collaboration(
          new Request('http://local/api/projects/demo-project/comments', {
            method: 'POST',
            body: JSON.stringify({ text: 'TEST', taskId: null }),
          }),
          env,
          actor,
          'demo-project',
          'owner',
        ),
      /not committed/,
    );
    assert.equal(db.prepare('SELECT COUNT(*) n FROM comments').get()!.n, 0);
  } finally {
    db.close();
  }
});
