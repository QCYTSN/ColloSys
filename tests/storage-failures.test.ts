import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../packages/connector/src/store';
import { Snapshots } from '../packages/connector/src/snapshots';
import { Connector } from '../packages/connector/src/connector';
import { storageApi } from '../packages/connector/src/storage-api';
import { cleanRetention } from '../packages/connector/src/retention';
import { encryptCheckpoint, MAX_BACKUP_BYTES } from '../packages/connector/src/archive';
import { digest } from '../packages/connector/src/files';
import { git } from '../packages/connector/src/vendor/codecast/git';

const password = 'TEST-long-recovery-passphrase';
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'collosys-storage-failures-'));
  const root = path.join(directory, 'project');
  const workspaceId = 'workspace-storage-failure';
  const state = path.join(directory, 'managed', workspaceId);
  await fs.mkdir(root);
  const store = new Store(state);
  const snapshots = new Snapshots(root, state, workspaceId, store);
  await snapshots.init();
  const connector = new Connector({
    root,
    state,
    workspaceId,
    projectId: 'project-storage-failure',
    userId: 'TEST-user',
    backend: 'http://127.0.0.1:1',
    token: 'collo_' + 'a'.repeat(64),
    credential: 'device',
    label: 'TEST storage',
    port: 12345,
  });
  connector.store = store;
  connector.snapshots = snapshots;
  return { directory, root, state, store, snapshots, connector };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function versions(f: Fixture, count = 3) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    await fs.writeFile(path.join(f.root, 'file.txt'), `TEST version ${i}`);
    ids.push((await f.snapshots.capture())!.id);
  }
  for (const row of f.store.db.prepare('SELECT id FROM outbox').all() as { id: string }[])
    f.store.acknowledge(row.id, 1);
  f.store.set('retention', { maxCheckpoints: 2, maxAgeDays: 30, maxDiskMiB: 512 });
  return ids;
}
async function dispose(f: Fixture) {
  f.store.close();
  await fs.rm(f.directory, { recursive: true, force: true });
}
function recover(f: Fixture) {
  return storageApi(f.connector, '/api/backups/recover', 'POST', {
    id: 'TEST-backup',
    passphrase: password,
    confirmed: true,
  }) as Promise<{ recoveryId: string; checkpointId: string; directory: string; files: number }>;
}
function exportTo(f: Fixture, recoveryId: string, directory: string, confirmed = true) {
  return storageApi(f.connector, '/api/backups/export', 'POST', {
    recoveryId,
    directory,
    confirmed,
  });
}

test('pin and policy updates wait for cleanup; pin cannot report success for a deleted checkpoint', async (t) => {
  const f = await fixture();
  try {
    const ids = await versions(f);
    const expired = path.join(f.snapshots.previews, 'TEST-expired');
    await fs.mkdir(expired);
    f.store.savePreview('TEST-expired', { checkpointId: ids[1], expiresAt: 0 });
    let entered!: () => void, release!: () => void;
    const arrived = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rm = fs.rm;
    t.mock.method(
      fs,
      'rm',
      async (target: Parameters<typeof fs.rm>[0], options: Parameters<typeof fs.rm>[1]) => {
        if (target === expired) {
          entered();
          await gate;
        }
        return rm(target, options);
      },
    );
    const cleaning = f.connector.serial(() => cleanRetention(f.snapshots));
    await arrived;
    let pinDone = false;
    const pin = storageApi(f.connector, '/api/storage/pin', 'POST', {
      checkpointId: ids[0],
      pinned: true,
    }).finally(() => {
      pinDone = true;
    });
    const rejectedPin = assert.rejects(pin, /Checkpoint not found/);
    const policy = { maxCheckpoints: 4, maxAgeDays: 3, maxDiskMiB: 256 };
    const changingPolicy = storageApi(f.connector, '/api/storage/policy', 'POST', {
      policy,
      confirmed: true,
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(pinDone, false);
    assert.notDeepEqual(f.store.setting('retention', null), policy);
    release();
    await cleaning;
    await rejectedPin;
    await changingPolicy;
    assert.deepEqual(f.store.setting('retention', null), policy);
    await storageApi(f.connector, '/api/storage/pin', 'POST', {
      checkpointId: ids[1],
      pinned: true,
    });
    assert.deepEqual(f.store.setting('pinnedCheckpoints', []), [ids[1]]);
  } finally {
    t.mock.restoreAll();
    await dispose(f);
  }
});

test('failed Git deletion and GC remain durable jobs retried on restart without losing protected content', async () => {
  const f = await fixture();
  let reopened: Store | undefined;
  try {
    const ids = await versions(f, 4);
    // The second-oldest snapshot is explicitly retained while the oldest expires.
    f.store.set('pinnedCheckpoints', [ids[1]]);
    const removedSha = f.store.get(ids[0])!.sha;
    const ref = `refs/collosys/checkpoints/${ids[0]}`;
    const lock = path.join(f.snapshots.mirror, '.git', ref + '.lock');
    await fs.writeFile(lock, 'TEST injected ref-lock failure', { flag: 'wx' });
    await assert.rejects(() => cleanRetention(f.snapshots));
    assert.equal(f.store.get(ids[0]), null);
    assert.ok(f.store.db.prepare('SELECT 1 FROM checkpoint_deletions WHERE id=?').get(ids[0]));
    assert.equal(f.store.setting('retentionGcPending', false), true);
    f.store.close();
    await fs.unlink(lock);
    reopened = new Store(f.state);
    const restarted = new Snapshots(f.root, f.state, f.snapshots.workspaceId, reopened);
    await restarted.init();
    await assert.rejects(() => git(restarted.mirror, ['rev-parse', '--verify', ref]));
    await assert.rejects(() => git(restarted.mirror, ['cat-file', '-e', removedSha]));
    assert.equal(reopened.db.prepare('SELECT * FROM checkpoint_deletions').all().length, 0);
    assert.equal(reopened.setting('retentionGcPending', true), false);
    assert.equal(
      (await restarted.content(reopened.get(ids[1])!, 'file.txt')).toString(),
      'TEST version 1',
    );
  } finally {
    reopened?.close();
    if (!reopened) f.store.close();
    await fs.rm(f.directory, { recursive: true, force: true });
  }
});

test('GC retries even when all checkpoint deletions already completed before an interruption', async (t) => {
  const f = await fixture();
  try {
    const ids = await versions(f);
    const removedSha = f.store.get(ids[0])!.sha;
    const unlink = fs.unlink;
    t.mock.method(fs, 'unlink', async (target: Parameters<typeof fs.unlink>[0]) => {
      if (String(target).endsWith('wip.head')) throw new Error('TEST interrupted before GC');
      return unlink(target);
    });
    await assert.rejects(() => cleanRetention(f.snapshots), /interrupted before GC/);
    assert.equal(f.store.get(ids[0]), null);
    assert.equal(f.store.db.prepare('SELECT * FROM checkpoint_deletions').all().length, 0);
    assert.equal(f.store.setting('retentionGcPending', false), true);
    t.mock.restoreAll();
    const result = await cleanRetention(f.snapshots);
    assert.equal(result.remove.length, 0);
    assert.equal(f.store.setting('retentionGcPending', true), false);
    await assert.rejects(() => git(f.snapshots.mirror, ['cat-file', '-e', removedSha]));
  } finally {
    t.mock.restoreAll();
    await dispose(f);
  }
});

test('uncommitted snapshot pins are reconciled while pending checkpoint events remain pinned', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.root, 'file.txt'), 'TEST committed bytes');
    const retained = (await f.snapshots.capture())!;
    f.store.db.exec(`CREATE TRIGGER fail_checkpoint BEFORE INSERT ON checkpoints
      BEGIN SELECT RAISE(ABORT,'TEST interrupted checkpoint transaction'); END;`);
    await fs.writeFile(path.join(f.root, 'file.txt'), 'TEST uncommitted bytes');
    await assert.rejects(() => f.snapshots.capture(), /interrupted checkpoint transaction/);
    f.store.db.exec('DROP TRIGGER fail_checkpoint');
    const before = (
      await git(f.snapshots.mirror, [
        'for-each-ref',
        '--format=%(refname)',
        'refs/collosys/checkpoints/',
      ])
    ).split('\n');
    assert.equal(before.length, 2);
    const queued = f.store.pending().map((row) => row.id);
    await cleanRetention(f.snapshots);
    const after = await git(f.snapshots.mirror, [
      'for-each-ref',
      '--format=%(refname)',
      'refs/collosys/checkpoints/',
    ]);
    assert.equal(after, `refs/collosys/checkpoints/${retained.id}`);
    assert.deepEqual(
      f.store.pending().map((row) => row.id),
      queued,
    );
    assert.equal(
      (await f.snapshots.content(f.store.get(retained.id)!, 'file.txt')).toString(),
      'TEST committed bytes',
    );
    assert.ok(await f.snapshots.capture());
  } finally {
    await dispose(f);
  }
});

test('chunked backup downloads cancel as soon as actual bytes exceed 24 MiB', async (t) => {
  const f = await fixture();
  try {
    let chunks = 0,
      canceled = false;
    t.mock.method(
      globalThis,
      'fetch',
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              chunks++;
              controller.enqueue(new Uint8Array(1024 * 1024));
            },
            cancel() {
              canceled = true;
            },
          }),
        ),
    );
    await assert.rejects(() => recover(f), /Backup too large/);
    assert.ok(chunks <= MAX_BACKUP_BYTES / (1024 * 1024) + 2);
    assert.equal(canceled, true);
    assert.equal(f.store.recoveries().length, 0);
  } finally {
    t.mock.restoreAll();
    await dispose(f);
  }
});

test('real encrypted bytes use device authentication and recover separately before safe external export', async (t) => {
  const f = await fixture();
  try {
    const [id] = await versions(f, 1);
    const calls: { method: string; headers: Headers }[] = [];
    let uploaded: Uint8Array | undefined;
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      const method = init.method ?? 'GET';
      calls.push({ method, headers });
      if (method === 'POST') return Response.json({ id: JSON.parse(String(init.body)).id });
      if (method === 'PUT') {
        uploaded = init.body as Uint8Array;
        return Response.json({
          id: String(_url).split('/').at(-1),
          verified: true,
          location: 'local-convex-storage',
          remote: false,
        });
      }
      assert.ok(uploaded);
      return new Response(new Uint8Array(uploaded), {
        headers: { 'X-Backup-Digest': digest(uploaded) },
      });
    });
    await storageApi(f.connector, '/api/backups/create', 'POST', {
      checkpointId: id,
      passphrase: password,
      confirmed: true,
    });
    await fs.writeFile(path.join(f.root, 'file.txt'), 'TEST current work stays independent');
    const recovered = await recover(f);
    assert.equal(recovered.checkpointId, id);
    assert.equal(f.store.recoveries().length, 1);
    assert.equal(f.store.recovery(recovered.recoveryId)!.status, 'ready');
    assert.equal(f.store.preview(recovered.recoveryId), null);
    assert.equal(
      await fs.readFile(path.join(f.root, 'file.txt'), 'utf8'),
      'TEST current work stays independent',
    );
    for (const { headers } of calls) {
      assert.equal(headers.get('X-ColloSys-Device'), f.connector.config.token);
      assert.equal(headers.has('Authorization'), false);
    }
    assert.deepEqual(
      calls.map((call) => call.method),
      ['POST', 'PUT', 'GET'],
    );
    const output = path.join(f.directory, 'exported-project');
    await assert.rejects(() => exportTo(f, recovered.recoveryId, output, false));
    await assert.rejects(fs.access(output));
    await exportTo(f, recovered.recoveryId, output);
    assert.equal(await fs.readFile(path.join(output, 'file.txt'), 'utf8'), 'TEST version 0');
    // The exported root can form a fresh independent connector state.
    const exportedStore = new Store(path.join(f.directory, 'other-state'));
    try {
      const exportedSnapshots = new Snapshots(
        output,
        exportedStore.directory,
        'workspace-exported',
        exportedStore,
      );
      await exportedSnapshots.init();
      assert.ok(await exportedSnapshots.capture());
    } finally {
      exportedStore.close();
    }
    await assert.rejects(() => exportTo(f, recovered.recoveryId, output), /EEXIST/);
    assert.equal(await fs.readFile(path.join(output, 'file.txt'), 'utf8'), 'TEST version 0');
  } finally {
    t.mock.restoreAll();
    await dispose(f);
  }
});

test('export rejects project/managed destinations, ancestor junctions, existing directories and changed recovered bytes', async (t) => {
  const f = await fixture();
  try {
    const [id] = await versions(f, 1);
    const bytes = await encryptCheckpoint(f.snapshots, id, password);
    t.mock.method(
      globalThis,
      'fetch',
      async () =>
        new Response(new Uint8Array(bytes), { headers: { 'X-Backup-Digest': digest(bytes) } }),
    );
    const recovered = await recover(f);
    for (const destination of [
      path.join(f.root, 'new-root'),
      path.join(path.dirname(f.state), 'new-root'),
    ])
      await assert.rejects(
        () => exportTo(f, recovered.recoveryId, destination),
        /outside the project and managed storage/,
      );
    const alias = path.join(f.directory, 'TEST-alias');
    const outside = path.join(f.directory, 'TEST-outside');
    await fs.mkdir(outside);
    await fs.symlink(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(
      () => exportTo(f, recovered.recoveryId, path.join(alias, 'new-root')),
      /Symlink|junction/i,
    );
    assert.deepEqual(await fs.readdir(outside), []);
    await assert.rejects(() => exportTo(f, recovered.recoveryId, outside), /EEXIST/);
    await fs.writeFile(path.join(recovered.directory, 'file.txt'), 'TEST tampered recovery');
    await assert.rejects(
      () => exportTo(f, recovered.recoveryId, path.join(f.directory, 'tampered-export')),
      /Recovered file changed/,
    );
  } finally {
    t.mock.restoreAll();
    await dispose(f);
  }
});

test('failed extraction and a crashed extraction job are cleaned independently of restore previews', async (t) => {
  const f = await fixture();
  let reopened: Store | undefined;
  try {
    await versions(f, 1);
    await fs.writeFile(path.join(f.root, 'second.txt'), 'TEST second file');
    const cp = (await f.snapshots.capture())!;
    const bytes = await encryptCheckpoint(f.snapshots, cp.id, password);
    t.mock.method(
      globalThis,
      'fetch',
      async () =>
        new Response(new Uint8Array(bytes), { headers: { 'X-Backup-Digest': digest(bytes) } }),
    );
    const write = fs.writeFile;
    let writes = 0;
    t.mock.method(
      fs,
      'writeFile',
      async (target: Parameters<typeof fs.writeFile>[0], ...args: unknown[]) => {
        if (String(target).startsWith(f.snapshots.recoveries) && ++writes === 2)
          throw Object.assign(new Error('TEST disk full during extraction'), { code: 'ENOSPC' });
        return Reflect.apply(write, fs, [target, ...args]);
      },
    );
    await assert.rejects(() => recover(f), /disk full during extraction/);
    const failed = f.store.recoveries()[0];
    assert.equal(failed.status, 'extracting');
    await assert.rejects(fs.access(failed.directory));
    t.mock.restoreAll();
    const crashed = {
      ...failed,
      id: 'recovery-TEST-crashed',
      directory: path.join(f.snapshots.recoveries, 'recovery-TEST-crashed'),
    };
    f.store.saveRecovery(crashed);
    await fs.mkdir(crashed.directory);
    await fs.writeFile(path.join(crashed.directory, 'partial.txt'), 'TEST partial extraction');
    f.store.close();
    reopened = new Store(f.state);
    const restarted = new Snapshots(f.root, f.state, f.snapshots.workspaceId, reopened);
    await restarted.init();
    assert.deepEqual(reopened.recoveries(), []);
    await assert.rejects(fs.access(crashed.directory));
    assert.ok(reopened.get(cp.id));
    assert.ok(reopened.count() > 0);
  } finally {
    t.mock.restoreAll();
    reopened?.close();
    if (!reopened) f.store.close();
    await fs.rm(f.directory, { recursive: true, force: true });
  }
});
