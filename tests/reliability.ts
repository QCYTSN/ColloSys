// Isolated local acceptance: test-only accounts, data, persistence and loopback listeners.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { root, nodeTool, runTool, assertPortsFree, waitFor, stopProcess } from '../scripts/process';
import { ConnectorManager } from '../packages/connector/src/manager';
const directory = path.join(
  root,
  '.local/reliability',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
await fs.mkdir(directory, { recursive: true });
const persistence = path.join(directory, 'cloudflare'),
  base = 'http://127.0.0.1:8977';
const checks: string[] = [];
let worker: ReturnType<typeof nodeTool> | undefined, manager: ConnectorManager | undefined;
async function request(
  route: string,
  token = '',
  data?: unknown,
  method = data === undefined ? 'GET' : 'POST',
) {
  const response = await fetch(base + route, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: response.status, data: (await response.json()) as any };
}
function slow(route: string, token: string, data: Buffer, method: string) {
  let finishResponse!: (value: { status: number; body: string }) => void;
  const result = new Promise<{ status: number; body: string }>(
    (resolve) => (finishResponse = resolve),
  );
  const outgoing = http.request(
    base + route,
    {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.length,
      },
    },
    (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        finishResponse({ status: response.statusCode!, body: Buffer.concat(chunks).toString() }),
      );
    },
  );
  outgoing.on('error', (error) => finishResponse({ status: 0, body: error.message }));
  outgoing.write(data.subarray(0, 1));
  return { result, finish: () => outgoing.end(data.subarray(1)) };
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function until(check: () => boolean) {
  const end = Date.now() + 25000;
  while (!check()) {
    if (Date.now() > end) throw new Error('Timed out waiting for acknowledged delivery');
    await sleep(100);
  }
}
try {
  await assertPortsFree([8977, 8978]);
  for (const file of [
    'migrations/0001.sql',
    'migrations/0002.sql',
    'migrations/0003.sql',
    'seed-demo.sql',
  ])
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
      'packages/backend/' + file,
    ]);
  worker = nodeTool(
    'wrangler',
    [
      'dev',
      '--config',
      'packages/backend/wrangler.jsonc',
      '--ip',
      '127.0.0.1',
      '--port',
      '8977',
      '--inspector-port',
      '0',
      '--persist-to',
      persistence,
    ],
    { quiet: true },
  );
  const log = createWriteStream(path.join(directory, 'worker.log'));
  worker.stdout?.pipe(log);
  worker.stderr?.pipe(log);
  await waitFor(base + '/api/health', 60000, worker);
  let alice = (await request('/api/dev/login', '', { user: 'alice' })).data.token as string;
  const bob = (await request('/api/dev/login', '', { user: 'bob' })).data.token as string;
  const project = '/api/projects/demo-project';
  for (const sameBytes of [false, true]) {
    const id = 'TEST-backup-reuse-' + sameBytes;
    const old = Buffer.alloc(128, 65),
      fresh = Buffer.alloc(128, sameBytes ? 65 : 66);
    assert.equal(
      (
        await request(project + '/backups', alice, {
          id,
          checkpointId: 'old',
          size: old.length,
          digest: digest(old),
        })
      ).status,
      200,
    );
    const upload = slow(project + '/backups/' + id, alice, old, 'PUT');
    await sleep(1200);
    assert.equal(
      (await request(project + '/backups/' + id, alice, undefined, 'DELETE')).status,
      200,
    );
    assert.equal(
      (
        await request(project + '/backups', alice, {
          id,
          checkpointId: 'new',
          size: fresh.length,
          digest: digest(fresh),
        })
      ).status,
      200,
    );
    upload.finish();
    assert.equal((await upload.result).status, 409);
    assert.equal((await request(project + '/backups/' + id, alice)).status, 409);
    const freshUpload = await fetch(base + project + '/backups/' + id, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + alice, 'Content-Length': String(fresh.length) },
      body: fresh,
    });
    assert.equal(freshUpload.status, 200);
    const download = await fetch(base + project + '/backups/' + id, {
      headers: { Authorization: 'Bearer ' + alice },
    });
    assert.equal(download.status, 200);
    assert.equal(digest(Buffer.from(await download.arrayBuffer())), digest(fresh));
    checks.push(
      `Stale same-ID upload cannot complete a new reservation (identical bytes: ${sameBytes}); fresh upload restores exact bytes`,
    );
  }

  await request(project + '/workspaces', bob, { id: 'TEST-bob-workspace', label: 'TEST' });
  const event = {
    version: 1,
    id: 'TEST-delayed-event',
    workspaceId: 'TEST-bob-workspace',
    occurredAt: Date.now(),
    kind: 'checkpoint',
    payload: {
      checkpointId: 'TEST-cp',
      parentId: null,
      label: 'TEST',
      files: [],
      totalFiles: 0,
      part: 1,
      parts: 1,
      source: 'local',
      backup: 'local-only',
    },
  };
  const pending = slow(project + '/events', bob, Buffer.from(JSON.stringify(event)), 'POST');
  const pendingComment = slow(
    project + '/comments',
    bob,
    Buffer.from(JSON.stringify({ text: 'TEST delayed comment', taskId: null })),
    'POST',
  );
  await sleep(1200);
  assert.equal(
    (
      await request('/api/teams/demo-team/project-access', alice, {
        projectId: 'demo-project',
        userId: 'bob',
        role: null,
      })
    ).status,
    200,
  );
  pending.finish();
  pendingComment.finish();
  assert.equal((await pending.result).status, 403);
  assert.equal((await pendingComment.result).status, 403);
  assert.equal((await request(project + '/events', alice)).data.events.length, 0);
  checks.push(
    'Revocation completed before a delayed request body prevents its event from being committed',
  );
  await Promise.all([
    request('/api/teams/demo-team/project-access', alice, {
      projectId: 'demo-project',
      userId: 'bob',
      role: 'editor',
    }),
    request('/api/teams/demo-team/members/bob', alice, undefined, 'DELETE'),
  ]);
  assert.equal((await request(project + '/events', bob)).status, 403);
  assert.equal(
    (await request('/api/teams/demo-team/members/bob', alice, undefined, 'DELETE')).status,
    200,
  );
  checks.push(
    'Concurrent team removal and project grant leave no residual project access; retry is idempotent',
  );

  const pairing = 'TEST-pairing-only-'.repeat(4),
    projectRoot = path.join(directory, 'project');
  await fs.mkdir(projectRoot);
  await fs.writeFile(path.join(projectRoot, 'file.txt'), 'TEST initial bytes');
  manager = new ConnectorManager(path.join(directory, 'manager'), base, pairing, 8978);
  await manager.start();
  const manage = async (route: string, token: string, data: unknown) => {
    const response = await fetch('http://127.0.0.1:8978/api/connectors/' + route, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'X-ColloSys-Pairing': pairing,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return { status: response.status, data: (await response.json()) as any };
  };
  const created = await manage('create', alice, {
    root: projectRoot,
    projectId: 'demo-project',
    label: 'TEST lifecycle',
    confirmed: true,
  });
  assert.equal(created.status, 200);
  const workspaceId = created.data.workspaceId as string;
  const connector = manager.connectors.get(workspaceId)!;
  await until(() => connector.store.count() === 0);
  assert.equal((await request('/api/logout', alice, {})).status, 200);
  await fs.writeFile(path.join(projectRoot, 'file.txt'), 'TEST saved after logout');
  await connector.serial(() => connector.scan());
  await connector.flush();
  assert.ok(connector.store.count() > 0);
  assert.equal(connector.status().deliveryState, 'reauth-required');
  alice = (await request('/api/dev/login', '', { user: 'alice' })).data.token;
  const queuedIds = connector.store.pending().map((row) => row.id);
  assert.equal((await manage('start', alice, { workspaceId })).status, 200);
  await until(() => manager!.connectors.get(workspaceId)!.store.count() === 0);
  const events = (await request(project + '/events', alice)).data.events as { id: string }[];
  for (const id of queuedIds) assert.equal(events.filter((event) => event.id === id).length, 1);
  const concurrent = await Promise.all([
    manage('start', alice, { workspaceId }),
    manage('start', alice, { workspaceId }),
  ]);
  assert.ok(concurrent.every((result) => result.status === 200));
  assert.equal(manager.connectors.size, 1);
  checks.push(
    'Logout/login and concurrent explicit reconnects preserve and deliver queued edits exactly once',
  );
  const outsider = (await request('/api/dev/login', '', { user: 'outsider' })).data.token;
  for (const route of [
    '/history',
    '/sessions',
    '/messages?workspace=ws&session=x',
    '/event?id=test',
    '/checkpoint-files?workspace=ws&checkpoint=cp',
    '/checkpoint-file?workspace=ws&checkpoint=cp&path=file.txt',
    '/tasks',
    '/comments',
    '/handoffs',
  ])
    assert.equal((await request(project + route, outsider)).status, 403);
  const history = (await request(project + '/history', alice)).data;
  assert.ok(history.items.length > 0);
  assert.equal((await request(project + '/event?id=' + events[0].id, alice)).data.id, events[0].id);
  checks.push(
    'All paginated history, message, checkpoint and collaboration reads enforce real Worker project membership',
  );
  await fs.writeFile(
    path.join(directory, 'result.json'),
    JSON.stringify({ checks, passed: checks.length, at: new Date().toISOString() }, null, 2),
  );
  console.log('RELIABILITY PASSED', checks.length, directory);
} finally {
  await manager?.stop();
  if (worker) await stopProcess(worker);
}
