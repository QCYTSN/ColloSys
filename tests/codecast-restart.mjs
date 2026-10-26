// Run `before`, restart the application, then run `after` with the same folder.
// This stops only the test application's verified native backend process.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';
const phase = process.argv[2],
  directory = path.resolve(process.argv[3] || '');
if (
  !['before', 'after'].includes(phase) ||
  !directory.startsWith(path.resolve('.local/codecast-app/acceptance-'))
)
  throw new Error('Pass before|after and a Codecast acceptance directory');
const data = JSON.parse(await fs.readFile(path.join(directory, 'restart-test.json'), 'utf8'));
const client = new ConvexHttpClient('http://127.0.0.1:3408');
const auth = await client.action('auth:signIn', {
  provider: 'password',
  params: { ...data.a, flow: 'signIn' },
});
client.setAuth(auth.tokens.token);
const pair = await fs.readFile('.local/codecast-app/browser-pairing', 'utf8');
async function manager(route, body, endpoint = 'http://127.0.0.1:3411') {
  const response = await fetch(endpoint + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${auth.tokens.token}`,
      'X-ColloSys-Pairing': pair,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function eventually(action) {
  let error;
  for (let i = 0; i < 100; i++) {
    try {
      return await action();
    } catch (e) {
      error = e;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw error;
}
async function events() {
  let after = 0;
  const all = [];
  for (;;) {
    const page = await client.query('collo:replay', { projectId: data.projectId, after });
    all.push(...page.events);
    after = page.cursor;
    if (!page.hasMore) return all;
  }
}
const state = path.join('.local/codecast-app/connectors', data.workspaceA);
if (phase === 'before') {
  const connector = (await manager('/api/connectors')).connectors.find(
    (c) => c.workspaceId === data.workspaceA,
  );
  assert.ok(connector?.running);
  await manager('/api/offline', { offline: false }, connector.url);
  await eventually(async () =>
    assert.equal((await manager('/api/status', undefined, connector.url)).pending, 0),
  );
  const oldEvents = (await events()).map((e) => [e.id, e.seq]);
  // A real connection outage, not the connector's pause switch.
  const stop =
    "$listener = Get-NetTCPConnection -State Listen -LocalPort 3408; $proc = Get-CimInstance Win32_Process -Filter \"ProcessId = $($listener.OwningProcess)\"; if ($proc.Name -eq 'convex-local-backend.exe' -and $proc.CommandLine.Contains('collosys-codecast-app')) { Stop-Process -Id $proc.ProcessId } else { throw 'Unexpected backend process' }";
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-EncodedCommand', Buffer.from(stop, 'utf16le').toString('base64')],
    { windowsHide: true, stdio: 'pipe' },
  );
  const marker = `TEST backend-offline ${randomUUID()}`;
  await fs.writeFile(path.join(data.rootA, 'offline-restart.txt'), marker + '\n');
  await eventually(async () => {
    const db = new DatabaseSync(path.join(state, 'connector.sqlite'), { readOnly: true });
    try {
      assert.ok(
        db
          .prepare('SELECT event FROM outbox')
          .all()
          .some((r) => r.event.includes(marker)),
      );
    } finally {
      db.close();
    }
  });
  await fs.writeFile(
    path.join(directory, 'restart-pending.json'),
    JSON.stringify({ marker, oldEvents }),
  );
  console.log('PASS actual backend outage captured a real edit in the durable SQLite outbox');
} else {
  const pending = JSON.parse(
    await fs.readFile(path.join(directory, 'restart-pending.json'), 'utf8'),
  );
  const connector = await eventually(async () => {
    const found = (await manager('/api/connectors')).connectors.find(
      (c) => c.workspaceId === data.workspaceA,
    );
    assert.ok(found?.running);
    return found;
  });
  await eventually(async () =>
    assert.equal((await manager('/api/status', undefined, connector.url)).pending, 0),
  );
  const all = await events();
  for (const [id, seq] of pending.oldEvents)
    assert.ok(all.some((e) => e.id === id && e.seq === seq));
  assert.equal(all.filter((e) => JSON.stringify(e).includes(pending.marker)).length, 1);
  assert.equal(await fs.readFile(path.join(data.rootB, 'hello.txt'), 'utf8'), 'original\n');
  const history = await manager('/api/checkpoints', undefined, connector.url);
  assert.ok(history.checkpoints.length > 0);
  await fs.writeFile(
    path.join(directory, 'restart-result.json'),
    JSON.stringify(
      {
        passed: true,
        retainedEvents: pending.oldEvents.length,
        replayedExactlyOnce: true,
        realOutage: true,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS account, events, checkpoints and pending outbox survive full backend/manager restart; replay exactly once',
  );
}
