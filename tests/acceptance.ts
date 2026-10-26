import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import WebSocket from 'ws';
import http from 'node:http';
import { Connector, type ConnectorConfig } from '../packages/connector/src/connector';
import type { StoredEvent, ClientEvent } from '../packages/shared/src/protocol';
import { assertPortsFree, nodeTool, root, runTool, stopProcess, waitFor } from '../scripts/process';

const runDir = path.join(
  root,
  '.local',
  'acceptance',
  new Date().toISOString().replaceAll(':', '-'),
);
await fs.mkdir(runDir, { recursive: true });
const persistence = path.join(runDir, 'cloudflare'),
  backend = 'http://127.0.0.1:8887',
  project = 'demo-project';
const checks: { name: string; at: string }[] = [];
let worker: ChildProcess | undefined;
let alice: Connector | undefined, bob: Connector | undefined;
const sockets: WebSocket[] = [];
let faultProxy: http.Server | undefined;
const mark = (name: string) => {
  checks.push({ name, at: new Date().toISOString() });
  console.log(`PASS ${name}`);
};
async function until<T>(fn: () => Promise<T>, condition: (v: T) => boolean, timeout = 20000) {
  const end = Date.now() + timeout;
  let latest: T | undefined;
  while (Date.now() < end) {
    try {
      latest = await fn();
      if (condition(latest)) return latest;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Condition timed out; last result ${JSON.stringify(latest).slice(0, 300)}`);
}
async function request(route: string, token = '', data?: unknown) {
  const response = await fetch(backend + route, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, data: (await response.json()) as any };
}
async function events(token: string) {
  const out: StoredEvent[] = [];
  let cursor = 0,
    more = true;
  while (more) {
    const r = await request(`/api/projects/${project}/events?after=${cursor}`, token);
    assert.equal(r.status, 200);
    out.push(...r.data.events);
    cursor = r.data.cursor;
    more = r.data.hasMore;
  }
  return out;
}
async function startWorker() {
  worker = nodeTool(
    'wrangler',
    [
      'dev',
      '--config',
      'packages/backend/wrangler.jsonc',
      '--ip',
      '127.0.0.1',
      '--port',
      '8887',
      '--inspector-port',
      '0',
      '--persist-to',
      persistence,
    ],
    { quiet: true, env: { WRANGLER_SEND_METRICS: 'false' } },
  );
  const log = createWriteStream(path.join(runDir, 'backend.log'), { flags: 'a' });
  worker.stdout?.pipe(log);
  worker.stderr?.pipe(log);
  await waitFor(backend + '/api/health', 45000, worker);
}
async function socket(token: string) {
  const ticket = await request(`/api/projects/${project}/ticket`, token, {});
  assert.equal(ticket.status, 200);
  const ws = new WebSocket(
    `${backend.replace('http:', 'ws:')}/api/projects/${project}/live?ticket=${ticket.data.ticket}`,
  );
  sockets.push(ws);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket timeout')), 6000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
  return ws;
}
async function local(connector: Connector, route: string, token: string, data: unknown) {
  const r = await fetch(`http://127.0.0.1:${connector.config.port}${route}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return { status: r.status, data: (await r.json()) as any };
}

try {
  await assertPortsFree([8887, 8888, 8891, 8892]);
  await runTool('wrangler', [
    'd1',
    'execute',
    'collosys',
    '--local',
    '--config',
    'packages/backend/wrangler.jsonc',
    '--persist-to',
    persistence,
    '--file',
    'packages/backend/migrations/0001.sql',
  ]);
  await runTool('wrangler', [
    'd1',
    'execute',
    'collosys',
    '--local',
    '--config',
    'packages/backend/wrangler.jsonc',
    '--persist-to',
    persistence,
    '--file',
    'packages/backend/migrations/0002.sql',
  ]);
  await runTool('wrangler', [
    'd1',
    'execute',
    'collosys',
    '--local',
    '--config',
    'packages/backend/wrangler.jsonc',
    '--persist-to',
    persistence,
    '--file',
    'packages/backend/migrations/0003.sql',
  ]);
  await runTool('wrangler', [
    'd1',
    'execute',
    'collosys',
    '--local',
    '--config',
    'packages/backend/wrangler.jsonc',
    '--persist-to',
    persistence,
    '--file',
    'packages/backend/seed-demo.sql',
  ]);
  await startWorker();
  const a = (await request('/api/dev/login', '', { user: 'alice' })).data.token,
    b = (await request('/api/dev/login', '', { user: 'bob' })).data.token,
    out = (await request('/api/dev/login', '', { user: 'outsider' })).data.token;
  const configs: ConnectorConfig[] = [];
  for (const [i, user] of ['alice', 'bob'].entries()) {
    const dir = path.join(runDir, user, 'project');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'hello.txt'), `hello from ${user}\n`);
    await fs.writeFile(path.join(dir, 'binary.bin'), Buffer.from([0, 255, 1, 128]));
    await fs.writeFile(path.join(dir, '.env'), 'FAKE_TEST_SECRET=must-not-upload\n');
    configs.push({
      root: dir,
      state: path.join(runDir, user, 'state'),
      backend,
      projectId: project,
      workspaceId: `acceptance-${user}`,
      userId: user,
      label: `TEST ${user}`,
      token: i === 0 ? a : b,
      port: 8891 + i,
    });
  }
  alice = new Connector(configs[0]);
  bob = new Connector(configs[1]);
  await Promise.all([alice.start(), bob.start()]);
  await until(
    () => events(b),
    (list) => list.length === 2,
  );
  const original = alice.store.latest()!;
  const bobBytes = await fs.readFile(path.join(configs[1].root, 'hello.txt'));
  mark('Two real roots and connectors publish authenticated persistent initial checkpoints');
  const bSocket = await socket(b);
  let notified = false;
  bSocket.on('message', (raw) => {
    if (JSON.parse(raw.toString()).type === 'events.available') notified = true;
  });
  await fs.writeFile(path.join(configs[0].root, 'hello.txt'), 'Alice saved real code\n');
  await fs.writeFile(path.join(configs[0].root, 'added.ts'), 'export const answer = 42;\n');
  const edits = await until(
    () => events(b),
    (list) =>
      list.some(
        (e) => e.kind === 'checkpoint' && e.payload.files.some((f) => f.path === 'added.ts'),
      ),
  );
  assert.ok(
    edits.some(
      (e) =>
        e.kind === 'checkpoint' &&
        e.payload.files.some((f) => f.patch.includes('Alice saved real code')),
    ),
  );
  assert.ok(notified);
  mark(
    'Manual saved-file edit and addition reach Bob through real WebSocket notification and diff replay',
  );
  await fs.unlink(path.join(configs[0].root, 'added.ts'));
  await until(
    () => events(b),
    (list) =>
      list.some(
        (e) =>
          e.kind === 'checkpoint' &&
          e.payload.files.some((f) => f.path === 'added.ts' && f.status === 'deleted'),
      ),
  );
  mark('File deletion is captured');
  const all = await events(a);
  assert.ok(!JSON.stringify(all).includes('must-not-upload'));
  assert.ok(!JSON.stringify(all).includes('"path":".env"'));
  mark('Sensitive file bytes and paths never enter events');
  assert.equal((await request(`/api/projects/${project}/events`, out)).status, 403);
  assert.equal((await request(`/api/projects/${project}/ticket`, out, {})).status, 403);
  const delivered = alice.store.db.prepare('SELECT event FROM delivered LIMIT 1').get() as {
    event: string;
  };
  const first = JSON.parse(delivered.event) as ClientEvent;
  const count = (await events(a)).length;
  const duplicate = await request(`/api/projects/${project}/events`, a, first);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.duplicate, true);
  assert.equal((await events(a)).length, count);
  assert.equal((await request(`/api/projects/${project}/events`, b, first)).status, 403);
  assert.equal(
    (await request(`/api/projects/${project}/events`, a, { ...first, userId: 'bob' })).status,
    400,
  );
  const modified = structuredClone(first);
  if (modified.kind === 'checkpoint') modified.payload.label = 'changed duplicate';
  assert.equal((await request(`/api/projects/${project}/events`, a, modified)).status, 409);
  mark(
    'Nonmember access, workspace forgery and actor forgery rejected; duplicate IDs do not duplicate records',
  );
  const badOrigin = await fetch(backend + '/api/dev/login', {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: 'alice' }),
  });
  assert.equal(badOrigin.status, 403);
  const tooLarge = await request(`/api/projects/${project}/events`, a, {
    padding: 'x'.repeat(530000),
  });
  assert.equal(tooLarge.status, 413);
  mark('Untrusted browser origin and oversized messages are rejected');
  let dropped = false;
  faultProxy = http.createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = await fetch(backend + (req.url ?? '/'), {
        method: req.method,
        headers: {
          Authorization: req.headers.authorization ?? '',
          'Content-Type': 'application/json',
        },
        body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      });
      const text = await response.text();
      if (!dropped && req.method === 'POST' && req.url?.endsWith('/events') && response.ok) {
        dropped = true;
        res.destroy();
        return;
      }
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(text);
    } catch {
      res.destroy();
    }
  });
  await new Promise<void>((resolve) => faultProxy!.listen(8888, '127.0.0.1', resolve));
  alice.config.backend = 'http://127.0.0.1:8888';
  await fs.writeFile(
    path.join(configs[0].root, 'ack-lost.txt'),
    'persisted despite lost receipt\n',
  );
  await until(
    () => events(b),
    (list) =>
      list.some(
        (e) => e.kind === 'checkpoint' && e.payload.files.some((f) => f.path === 'ack-lost.txt'),
      ),
  );
  assert.equal(dropped, true);
  await until(
    async () => alice!.store.count(),
    (n) => n === 0,
  );
  const ackLostEvents = (await events(b)).filter(
    (e) => e.kind === 'checkpoint' && e.payload.files.some((f) => f.path === 'ack-lost.txt'),
  );
  assert.equal(ackLostEvents.length, 1);
  alice.config.backend = backend;
  await new Promise<void>((resolve) => faultProxy!.close(() => resolve()));
  faultProxy = undefined;
  mark('Lost HTTP acknowledgement after persistence is retried without duplicate activity');
  for (let i = 0; i < 9; i++) await socket(i % 2 ? a : b);
  assert.equal(sockets.filter((s) => s.readyState === WebSocket.OPEN).length, 10);
  mark(
    'Ten simultaneous local WebSocket clients connected (two identities, not ten remote people)',
  );
  sockets.forEach((s) => s.close());
  await new Promise((r) => setTimeout(r, 150));
  const prior = (await events(b)).length;
  await stopProcess(worker!);
  worker = undefined;
  await fs.writeFile(path.join(configs[0].root, 'hello.txt'), 'edited while backend stopped\n');
  await until(
    async () => alice!.store.count(),
    (n) => n > 0,
  );
  await alice.stop();
  alice = undefined;
  await bob.stop();
  bob = undefined;
  mark(
    'Backend stopped; edits are captured and persisted to local outbox before connector shutdown',
  );
  await startWorker();
  assert.equal((await events(b)).length, prior);
  alice = new Connector(configs[0]);
  bob = new Connector(configs[1]);
  await Promise.all([alice.start(), bob.start()]);
  alice.store.retryNow();
  await until(
    () => events(b),
    (list) =>
      list.some(
        (e) =>
          e.kind === 'checkpoint' &&
          e.payload.files.some((f) => f.patch.includes('edited while backend stopped')),
      ),
  );
  await until(
    async () => alice!.store.count(),
    (n) => n === 0,
  );
  mark('Restarted backend retains events; restarted connector replays persisted offline events');
  const preview = await local(alice, '/api/restore/preview', a, { checkpointId: original.id });
  assert.equal(preview.status, 200);
  assert.equal(
    await fs.readFile(path.join(preview.data.directory, 'hello.txt'), 'utf8'),
    'hello from alice\n',
  );
  assert.equal(
    (
      await local(alice, '/api/restore/confirm', a, {
        previewId: preview.data.id,
        confirmed: false,
      })
    ).status,
    400,
  );
  await fs.writeFile(path.join(configs[0].root, 'hello.txt'), 'new work after preview\n');
  assert.equal(
    (await local(alice, '/api/restore/confirm', a, { previewId: preview.data.id, confirmed: true }))
      .status,
    409,
  );
  mark('Restore preview is independent and stale/unguarded confirmation is refused');
  const fresh = await local(alice, '/api/restore/preview', a, { checkpointId: original.id });
  const restored = await local(alice, '/api/restore/confirm', a, {
    previewId: fresh.data.id,
    confirmed: true,
  });
  assert.equal(restored.status, 200);
  assert.ok(restored.data.backupId);
  assert.equal(
    await fs.readFile(path.join(configs[0].root, 'hello.txt'), 'utf8'),
    'hello from alice\n',
  );
  assert.deepEqual(
    await fs.readFile(path.join(configs[0].root, 'binary.bin')),
    Buffer.from([0, 255, 1, 128]),
  );
  assert.deepEqual(await fs.readFile(path.join(configs[1].root, 'hello.txt')), bobBytes);
  assert.equal(
    (await local(alice, '/api/restore/preview', b, { checkpointId: original.id })).status,
    403,
  );
  mark(
    'Confirmed restore retains a backup, restores real files and binary bytes, and leaves Bob untouched',
  );
  await fs.writeFile(path.join(configs[0].root, 'last.txt'), 'queue toggle test\n');
  await until(
    async () => alice!.store.latest()?.manifest['last.txt'] !== undefined,
    (v) => v,
  );
  await local(alice, '/api/offline', a, { offline: true });
  await fs.writeFile(path.join(configs[0].root, 'last.txt'), 'paused-send data\n');
  await until(
    async () => alice!.store.count(),
    (n) => n > 0,
  );
  await local(alice, '/api/offline', a, { offline: false });
  await until(
    async () => alice!.store.count(),
    (n) => n === 0,
  );
  mark('Explicit pause/resume queues and drains real events');
  const log = path.join(runDir, 'TEST-FIXTURE-codex.jsonl'),
    sessionId = 'TEST-FIXTURE-codex-session';
  const row = (text: string, channel = 'final') => ({
    type: 'response_item',
    timestamp: new Date().toISOString(),
    payload: {
      type: 'message',
      role: 'assistant',
      channel,
      content: [{ type: 'output_text', text }],
    },
  });
  await fs.writeFile(
    log,
    [
      { type: 'session_meta', payload: { id: sessionId, cwd: configs[0].root } },
      row('TEST FIXTURE: existing public message'),
      row('HIDDEN_REASONING', 'analysis'),
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n',
  );
  assert.equal(
    (await local(alice, '/api/agent/preview', a, { path: log })).data.assistantMessages,
    1,
  );
  assert.equal(
    (
      await local(alice, '/api/agent/connect', a, {
        path: log,
        importHistory: false,
        confirmed: true,
      })
    ).status,
    200,
  );
  await fs.appendFile(log, JSON.stringify(row('TEST FIXTURE: new public message')) + '\n');
  await until(
    () => events(b),
    (list) =>
      list.some((e) => e.kind === 'agent.message' && e.payload.text.includes('new public message')),
  );
  const agentEvents = (await events(b)).filter((e) => e.kind === 'agent.message');
  assert.equal(agentEvents.length, 1);
  assert.ok(!JSON.stringify(agentEvents).includes('HIDDEN_REASONING'));
  mark(
    'Opt-in Codex source reaches Bob; existing history and private reasoning stay excluded (marked test fixture)',
  );
  await runTool('wrangler', [
    'd1',
    'execute',
    'collosys',
    '--local',
    '--config',
    'packages/backend/wrangler.jsonc',
    '--persist-to',
    persistence,
    '--command',
    "INSERT INTO project_members(project_id,user_id,role) VALUES('demo-project','outsider','viewer')",
  ]);
  assert.equal((await request(`/api/projects/${project}/events`, out)).status, 200);
  assert.equal(
    (
      await request(`/api/projects/${project}/workspaces`, out, {
        id: 'viewer-workspace',
        label: 'TEST FIXTURE viewer',
      })
    ).status,
    403,
  );
  const one = (await events(a))[0];
  const { actor: _actor, receivedAt: _receivedAt, seq: _seq, ...client } = one;
  assert.equal(
    (await request(`/api/projects/${project}/events`, out, { ...client, id: randomUUID() })).status,
    403,
  );
  mark(
    'A real read-only project member can read events but cannot register a workspace or publish',
  );

  const revokedSocket = await socket(out);
  let revokeTimer: NodeJS.Timeout | undefined;
  let rejectClose: (error: Error) => void = () => {};
  const closed = new Promise<number>((resolve, reject) => {
    rejectClose = reject;
    revokedSocket.once('close', (code) => {
      if (revokeTimer) clearTimeout(revokeTimer);
      resolve(code);
    });
  });
  await runTool('wrangler', [
    'd1',
    'execute',
    'collosys',
    '--local',
    '--config',
    'packages/backend/wrangler.jsonc',
    '--persist-to',
    persistence,
    '--command',
    "DELETE FROM project_members WHERE project_id='demo-project' AND user_id='outsider'",
  ]);
  // Start the socket deadline after the database tool finishes changing membership.
  // Wrangler startup time is unrelated to revocation propagation.
  if (revokedSocket.readyState === WebSocket.OPEN)
    revokeTimer = setTimeout(() => rejectClose(new Error('Revoked socket stayed open')), 6000);
  revokedSocket.send('ping');
  assert.equal(await closed, 1008);
  assert.equal((await request(`/api/projects/${project}/events`, out)).status, 403);
  assert.equal((await request(`/api/projects/${project}/ticket`, out, {})).status, 403);
  mark(
    'Membership revocation blocks fresh reads and tickets and closes an existing live connection',
  );

  const temporarySession = (await request('/api/dev/login', '', { user: 'alice' })).data.token;
  const shortTicket = (await request(`/api/projects/${project}/ticket`, temporarySession, {})).data
    .ticket;
  await request('/api/logout', temporarySession, {});
  assert.equal((await request('/api/me', temporarySession)).status, 401);
  const ticketDenied = await new Promise<number>((resolve, reject) => {
    const ws = new WebSocket(
      `${backend.replace('http:', 'ws:')}/api/projects/${project}/live?ticket=${shortTicket}`,
    );
    sockets.push(ws);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Ticket rejection timed out'));
    }, 6000);
    ws.on('error', () => {});
    ws.once('open', () => {
      clearTimeout(timer);
      ws.terminate();
      reject(new Error('Revoked ticket was accepted'));
    });
    ws.once('unexpected-response', (req, response) => {
      clearTimeout(timer);
      response.resume();
      req.destroy();
      resolve(response.statusCode ?? 0);
    });
  });
  assert.equal(ticketDenied, 401);
  mark('Logging out invalidates the session and previously issued socket tickets');
  await fs.writeFile(
    path.join(runDir, 'result.json'),
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        limits: [
          'Ten clients are local with two identities',
          'Agent source adapter is verified separately; this suite does not run a paid model',
        ],
      },
      null,
      2,
    ),
  );
  console.log(`\n${checks.length} acceptance checks passed. Evidence: ${runDir}`);
} catch (e) {
  await fs.writeFile(
    path.join(runDir, 'result.json'),
    JSON.stringify(
      { passed: checks.length, checks, error: e instanceof Error ? e.stack : String(e) },
      null,
      2,
    ),
  );
  throw e;
} finally {
  for (const s of sockets) s.terminate();
  await alice?.stop();
  await bob?.stop();
  if (faultProxy) await new Promise<void>((r) => faultProxy!.close(() => r()));
  if (worker) await stopProcess(worker);
}
