import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { Connector } from '../packages/connector/src/connector';
import { Store } from '../packages/connector/src/store';
import { Snapshots } from '../packages/connector/src/snapshots';
import { retryAfterTime, deliveryRetryTime } from '../packages/connector/src/delivery-retry';

test('actual Convex cron export retains collaboration maintenance without hosted automation schedules', () => {
  const report = JSON.parse(
    execFileSync(process.execPath, ['scripts/codecast-budget.mjs'], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
      windowsHide: true,
    }),
  );
  assert.equal(report.schedules.current.jobs, 8);
  assert.ok(report.schedules.current.monthlyEntries < 60_000);
  assert.ok(report.schedules.original.monthlyEntries > 700_000);
  for (const required of [
    'syncOutbox:recover',
    'cliAuth:sweepExpired',
    'syncLogPrune:pruneSyncActions',
    'colloBackups:collectOrphans',
  ])
    assert.ok(report.schedules.functions.includes(required));
  assert.ok(
    report.schedules.functions.every(
      (name: string) => !/assistant|titleGeneration|cloudWake|agentTasks|sources|emails/.test(name),
    ),
  );
  assert.equal(report.idleLocalInspection.authChecksCached, false);
  assert.equal(report.cloudReady, false);
});

test('retry delay accepts delta/date Retry-After and bounds malformed or excessive values', () => {
  const now = Date.UTC(2026, 9, 25);
  assert.equal(retryAfterTime('120', now), now + 120_000);
  assert.equal(retryAfterTime(new Date(now + 90_000).toUTCString(), now), now + 90_000);
  for (const value of [null, '', '-5', 'not a date', new Date(now - 1000).toUTCString()])
    assert.equal(retryAfterTime(value, now), 0);
  assert.equal(retryAfterTime('99999999999', now), now + 86400_000);
  assert.ok(deliveryRetryTime(1, 429) >= Date.now() + 59_000);
  assert.ok(deliveryRetryTime(1, 401) >= Date.now() + 299_000);
});

async function fixture(handler: http.RequestListener) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'collosys-cost-'));
  const root = path.join(directory, 'project'),
    state = path.join(directory, 'state');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'file.txt'), 'TEST checkpoint for quota retry');
  const backend = http.createServer(handler);
  await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const backendUrl = `http://127.0.0.1:${(backend.address() as { port: number }).port}`;
  const store = new Store(state);
  const snapshots = new Snapshots(root, state, 'TEST-workspace', store);
  await snapshots.init();
  await snapshots.capture();
  const make = (current: Store) => {
    const connector = new Connector({
      root,
      state,
      backend: backendUrl,
      projectId: 'TEST-project',
      workspaceId: 'TEST-workspace',
      userId: 'TEST-owner',
      label: 'TEST',
      token: 'TEST-never-a-real-token',
      port: 18999,
    });
    connector.store = current;
    connector.snapshots = snapshots;
    return connector;
  };
  return { directory, state, store, make, backend, connector: make(store), snapshots };
}
async function finish(f: Awaited<ReturnType<typeof fixture>>) {
  await f.connector.stop();
  await new Promise<void>((resolve) => f.backend.close(() => resolve()));
  // This exact mkdtemp-owned directory is the only recursively removed target.
  assert.ok(path.basename(f.directory).startsWith('collosys-cost-'));
  await fs.rm(f.directory, { recursive: true, force: true });
}

test('non-JSON registration quota response persists cooldown across restart and keeps checkpoint bytes', async () => {
  let registrations = 0,
    events = 0,
    limited = true;
  const f = await fixture(async (req, res) => {
    if (req.url?.endsWith('/workspaces')) {
      registrations++;
      if (limited) {
        res.writeHead(429, { 'Retry-After': '120' });
        res.end('TEST provider limit');
      } else res.end(JSON.stringify({ userId: 'TEST-owner' }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    events++;
    res.end(JSON.stringify({ id: JSON.parse(Buffer.concat(chunks).toString()).id, seq: events }));
  });
  try {
    await f.connector.flush();
    const cooldown = f.store.setting<{ nextAt: number }>('deliveryCooldown', { nextAt: 0 });
    assert.ok(cooldown.nextAt > Date.now() + 115_000);
    assert.equal(f.connector.deliveryState, 'retrying');
    for (let i = 0; i < 3; i++) await f.connector.flush();
    f.store.close();
    f.store = new Store(f.state);
    f.connector = f.make(f.store);
    f.store.retryNow(); // Even a local manual retry does not bypass a provider wait.
    await f.connector.flush();
    assert.equal(registrations, 1);
    assert.equal(events, 0);
    assert.ok(f.store.count() > 0);
    limited = false;
    f.store.set('deliveryCooldown', {
      ...f.store.setting<object>('deliveryCooldown', {}),
      nextAt: 0,
    });
    await f.connector.flush();
    assert.equal(f.store.count(), 0);
    assert.equal(f.connector.deliveryState, 'ready');
    assert.equal(
      (await f.snapshots.content(f.store.latest()!, 'file.txt')).toString(),
      'TEST checkpoint for quota retry',
    );
  } finally {
    await finish(f);
  }
});

test('event quota errors keep the same durable event; rotating credentials can retry registration', async () => {
  let registrations = 0,
    events = 0;
  const f = await fixture((req, res) => {
    if (req.url?.endsWith('/workspaces')) {
      registrations++;
      res.end(JSON.stringify({ userId: 'TEST-owner' }));
    } else {
      events++;
      res.writeHead(429, { 'Retry-After': '180' });
      res.end('TEST quota');
    }
  });
  try {
    const event = f.store.pending()[0].id;
    await f.connector.flush();
    f.store.retryNow();
    await f.connector.flush();
    assert.equal(events, 1);
    assert.equal(f.store.pending()[0].id, event);
    f.connector = f.make(f.store);
    f.connector.config.token = 'TEST-rotated-credential';
    await f.connector.flush();
    assert.equal(registrations, 2);
    assert.equal(events, 2);
    assert.equal(f.store.pending()[0].id, event);
  } finally {
    await finish(f);
  }
});

test('registration recovery clears an authorization warning even with an empty outbox', async () => {
  let denied = true;
  const f = await fixture((_req, res) => {
    res.writeHead(denied ? 401 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(denied ? { error: 'TEST expired' } : { userId: 'TEST-owner' }));
  });
  try {
    for (const row of f.store.pending()) f.store.acknowledge(row.id, 1);
    await f.connector.flush();
    assert.equal(f.connector.deliveryState, 'reauth-required');
    denied = false;
    f.store.set('deliveryCooldown', {
      ...f.store.setting<object>('deliveryCooldown', {}),
      nextAt: 0,
    });
    await f.connector.flush();
    assert.equal(f.connector.deliveryState, 'ready');
    assert.equal(f.connector.status().nextDeliveryAt, null);
    assert.equal(f.connector.status().deliveryError, null);
  } finally {
    await finish(f);
  }
});

test('combined inspection performs one live identity check and immediately rejects a revoked session', async () => {
  let identityReads = 0,
    revoked = false;
  const f = await fixture((_req, res) => {
    identityReads++;
    res.writeHead(revoked ? 401 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(revoked ? { error: 'TEST revoked' } : { user: { id: 'TEST-owner' } }));
  });
  try {
    // The actual listener uses an ephemeral test port; production config requires >=1024.
    f.connector.config.port = 0;
    await f.connector.listen();
    const port = (f.connector.server!.address() as { port: number }).port;
    const request = () =>
      fetch(`http://127.0.0.1:${port}/api/inspect`, {
        headers: { Authorization: 'Bearer TEST-only' },
      });
    const response = await request();
    assert.equal(response.status, 200);
    const data = (await response.json()) as {
      status: { workspaceId: string };
      checkpoints: { id: string }[];
    };
    assert.equal(data.status.workspaceId, 'TEST-workspace');
    assert.equal(data.checkpoints[0].id, f.store.latest()!.id);
    assert.equal(identityReads, 1);
    revoked = true;
    const denied = await request();
    assert.equal(denied.status, 401);
    assert.equal(identityReads, 2);
    assert.equal(((await denied.json()) as { checkpoints?: unknown }).checkpoints, undefined);
  } finally {
    await finish(f);
  }
});
