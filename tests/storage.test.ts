import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../packages/connector/src/store';
import { Snapshots } from '../packages/connector/src/snapshots';
import {
  encryptCheckpoint,
  decryptArchive,
  reconstructArchive,
} from '../packages/connector/src/archive';
import { cleanRetention, retentionPlan } from '../packages/connector/src/retention';
import { discoverCodex } from '../packages/connector/src/discovery';
import { collectCodex } from '../packages/connector/src/codex';
import { git } from '../packages/connector/src/vendor/codecast/git';
async function fixture() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'collosys-storage-')),
    root = path.join(temp, 'project'),
    state = path.join(temp, 'state');
  await fs.mkdir(root);
  const store = new Store(state),
    snapshots = new Snapshots(root, state, 'workspace-storage', store);
  await snapshots.init();
  return { temp, root, state, store, snapshots };
}
test('encrypted archive verifies bytes, rejects wrong keys and tampering, reconstructs independently', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.root, 'binary.bin'), Buffer.from([0, 255, 128, 13, 10]));
    await fs.writeFile(path.join(f.root, 'hello.txt'), 'original\r\n');
    await fs.writeFile(path.join(f.root, '.env'), 'SHOULD_NOT_ARCHIVE=1');
    const cp = (await f.snapshots.capture())!,
      password = 'test-only-long-backup-passphrase';
    const encrypted = await encryptCheckpoint(f.snapshots, cp.id, password);
    assert.ok(!encrypted.includes(Buffer.from('original')));
    assert.equal(decryptArchive(encrypted, password).files.length, 2);
    assert.throws(() => decryptArchive(encrypted, 'wrong-long-test-passphrase'));
    const broken = Buffer.from(encrypted);
    broken[broken.length - 1] ^= 1;
    assert.throws(() => decryptArchive(broken, password));
    await fs.writeFile(path.join(f.root, 'hello.txt'), 'new work');
    const output = await reconstructArchive(
      encrypted,
      password,
      f.snapshots.previews,
      'recovery-test',
    );
    assert.equal(
      await fs.readFile(path.join(output.directory, 'hello.txt'), 'utf8'),
      'original\r\n',
    );
    assert.equal(await fs.readFile(path.join(f.root, 'hello.txt'), 'utf8'), 'new work');
    assert.deepEqual(
      await fs.readFile(path.join(output.directory, 'binary.bin')),
      Buffer.from([0, 255, 128, 13, 10]),
    );
    await assert.rejects(fs.access(path.join(output.directory, '.env')));
    await assert.rejects(() =>
      reconstructArchive(encrypted, password, f.snapshots.previews, '../escape'),
    );
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});
test('retention protects pending, pinned, live previews and latest two; retained objects survive GC', async () => {
  const f = await fixture();
  try {
    const ids = [];
    for (let i = 0; i < 7; i++) {
      await fs.writeFile(path.join(f.root, 'file.txt'), `version ${i}`);
      ids.push((await f.snapshots.capture())!.id);
    }
    f.store.set('retention', { maxCheckpoints: 2, maxAgeDays: 30, maxDiskMiB: 128 });
    assert.equal(retentionPlan(f.snapshots).remove.length, 0);
    for (const row of f.store.db.prepare('SELECT id FROM outbox').all() as { id: string }[])
      f.store.acknowledge(row.id, 1);
    f.store.set('pinnedCheckpoints', [ids[0]]);
    const preview = await f.snapshots.preview(ids[1]);
    const removedSha = f.store.get(ids[2])!.sha;
    assert.equal(retentionPlan(f.snapshots).remove.length, 3);
    const result = await cleanRetention(f.snapshots);
    assert.equal(result.removed, 3);
    assert.equal(f.store.list().length, 4);
    assert.equal(
      (await f.snapshots.content(f.store.get(ids[0])!, 'file.txt')).toString(),
      'version 0',
    );
    await assert.rejects(() => git(f.snapshots.mirror, ['cat-file', '-e', removedSha]));
    f.store.consumePreview(preview.id);
    await cleanRetention(f.snapshots);
    await assert.rejects(fs.access(preview.directory));
    assert.equal(f.store.preview(preview.id), null);
    await fs.writeFile(path.join(f.root, 'file.txt'), 'new after gc');
    assert.ok(await f.snapshots.capture());
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});
test('quota refuses new checkpoint without discarding pending events or claiming captured state', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.root, 'a.txt'), 'a');
    const cp = (await f.snapshots.capture())!;
    const pending = f.store.count();
    f.store.set('retention', { maxCheckpoints: 2, maxAgeDays: 30, maxDiskMiB: 0 });
    await fs.writeFile(path.join(f.root, 'a.txt'), 'b');
    await assert.rejects(() => f.snapshots.capture(), /quota/);
    assert.equal(f.store.latest()!.id, cp.id);
    assert.equal(f.store.count(), pending);
    const log = path.join(f.temp, 'log.jsonl');
    await fs.writeFile(
      log,
      JSON.stringify({ type: 'session_meta', payload: { id: 'test-session', cwd: f.root } }) +
        '\n' +
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'TEST must remain uncaptured' }],
          },
        }) +
        '\n',
    );
    await assert.rejects(() => collectCodex(log, f.root, 'workspace-storage', f.store), /quota/);
    assert.equal(f.store.count(), pending);
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});
test('authorized source discovery matches project metadata and ignores junctions', async () => {
  const f = await fixture();
  try {
    const logs = path.join(f.temp, 'logs'),
      outside = path.join(f.temp, 'outside');
    await fs.mkdir(logs);
    await fs.mkdir(outside);
    const meta = (cwd: string, id: string) =>
      JSON.stringify({ type: 'session_meta', payload: { cwd, id } }) + '\n';
    await fs.writeFile(path.join(logs, 'match.jsonl'), meta(f.root, 'yes'));
    await fs.writeFile(path.join(logs, 'other.jsonl'), meta(outside, 'no'));
    await fs.writeFile(path.join(outside, 'hidden.jsonl'), meta(f.root, 'hidden'));
    await fs.symlink(outside, path.join(logs, 'link'), 'junction');
    const result = await discoverCodex(logs, f.root);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].sessionId, 'yes');
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});
