import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../packages/connector/src/store';
import { Snapshots } from '../packages/connector/src/snapshots';
import { git } from '../packages/connector/src/vendor/codecast/git';

test('long paths capture and restore through the managed mirror without modifying user Git', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'collosys-long-path-'));
  const root = path.join(temp, 'TEST-project'),
    state = path.join(temp, 'managed', 'workspace-long-path');
  await fs.mkdir(root);
  await git(root, ['init', '-q']);
  const originalConfig = await fs.readFile(path.join(root, '.git', 'config'), 'utf8');
  const relative =
    Array.from({ length: 5 }, (_, i) => `${i}-${'long-context-'.repeat(3)}`).join('/') +
    '/same-name.txt';
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, 'before');
  const store = new Store(state),
    snapshots = new Snapshots(root, state, 'workspace-long-path', store);
  try {
    await snapshots.init();
    const cp = await snapshots.capture();
    assert.ok(cp);
    await fs.writeFile(file, 'after');
    const preview = await snapshots.preview(cp.id);
    assert.ok(preview.files.some((f) => f.path === relative));
    await assert.rejects(snapshots.restore(preview.id, false), /confirmation/);
    const result = await snapshots.restore(preview.id, true);
    assert.ok(result.backupId);
    assert.equal(await fs.readFile(file, 'utf8'), 'before');
    assert.equal(await fs.readFile(path.join(root, '.git', 'config'), 'utf8'), originalConfig);
  } finally {
    store.close();
    assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(temp, { recursive: true, force: true });
  }
});
