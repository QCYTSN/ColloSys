import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../packages/connector/src/store';
import { Snapshots } from '../packages/connector/src/snapshots';
import { git, gitTry } from '../packages/connector/src/vendor/codecast/git';
import { inspectCodexSource, collectCodex } from '../packages/connector/src/codex';
import { scanProject } from '../packages/connector/src/files';

async function fixture() {
  const base = path.resolve('.local/integrity-tests');
  await fs.mkdir(base, { recursive: true });
  const directory = await fs.mkdtemp(path.join(base, 'case-'));
  const root = path.join(directory, 'project');
  await fs.mkdir(root);
  const state = path.join(directory, 'state'),
    store = new Store(state);
  const snapshots = new Snapshots(root, state, 'integrity-test', store);
  await snapshots.init();
  return { directory, root, state, store, snapshots };
}

test('managed snapshots never inherit repository routing or write the original index/HEAD', async () => {
  const f = await fixture();
  const original = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
  try {
    await git(f.root, ['init', '-q', '-b', 'original']);
    await fs.writeFile(path.join(f.root, 'staged.txt'), 'original staged bytes');
    await git(f.root, ['add', 'staged.txt']);
    const index = await fs.readFile(path.join(f.root, '.git/index'));
    const config = await fs.readFile(path.join(f.root, '.git/config'));
    process.env.GIT_DIR = path.join(f.root, '.git');
    process.env.GIT_WORK_TREE = f.root;
    await f.snapshots.init();
    const cp = (await f.snapshots.capture())!;
    assert.equal((await f.snapshots.content(cp, 'staged.txt')).toString(), 'original staged bytes');
    assert.deepEqual(await fs.readFile(path.join(f.root, '.git/index')), index);
    assert.deepEqual(await fs.readFile(path.join(f.root, '.git/config')), config);
    delete process.env.GIT_DIR;
    delete process.env.GIT_WORK_TREE;
    assert.equal(await gitTry(f.root, ['rev-parse', '--verify', 'HEAD']), null);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    f.store.close();
  }
});

test('snapshot bytes and paths survive Git exclusions, attributes and case-only renames', async () => {
  const f = await fixture();
  try {
    const excludes = path.join(f.directory, 'git-excludes');
    await fs.writeFile(excludes, '*.log\n');
    await git(f.snapshots.mirror, ['config', 'core.excludesFile', excludes]);
    await fs.writeFile(path.join(f.root, '.gitattributes'), '*.log text eol=lf\n');
    await fs.writeFile(path.join(f.root, 'UPPER.log'), 'TEST bytes\r\nwith CRLF\r\n');
    let cp = (await f.snapshots.capture())!;
    assert.equal(
      (await f.snapshots.content(cp, 'UPPER.log')).toString(),
      'TEST bytes\r\nwith CRLF\r\n',
    );
    await fs.rename(path.join(f.root, 'UPPER.log'), path.join(f.root, 'temporary.log'));
    await fs.rename(path.join(f.root, 'temporary.log'), path.join(f.root, 'upper.log'));
    cp = (await f.snapshots.capture())!;
    assert.ok(cp.manifest['upper.log']);
    assert.equal(cp.manifest['UPPER.log'], undefined);
    assert.equal(
      (await f.snapshots.content(cp, 'upper.log')).toString(),
      'TEST bytes\r\nwith CRLF\r\n',
    );
    const preview = await f.snapshots.preview(cp.id);
    assert.equal(
      (await fs.readFile(path.join(preview.directory, 'upper.log'))).toString(),
      'TEST bytes\r\nwith CRLF\r\n',
    );
  } finally {
    f.store.close();
  }
});

test('an unreadable sharing policy refuses the entire capture before publishing any checkpoint', async () => {
  for (const name of ['.collosysignore', '.gitignore']) {
    const f = await fixture();
    try {
      await fs.writeFile(path.join(f.root, name), '#'.repeat(65537) + '\nprivate.txt\n');
      await fs.writeFile(path.join(f.root, 'private.txt'), 'TEST_PRIVATE_EXCLUDED_CONTENT');
      await assert.rejects(() => f.snapshots.capture(), /policy|rules|ignore/i);
      assert.equal(f.store.latest(), null);
      assert.equal(f.store.pending().length, 0);
    } finally {
      f.store.close();
    }
  }
});

test('JSON credential values stay local and never enter shared file patches or Agent messages', async () => {
  const f = await fixture();
  const text = JSON.stringify({
    api_key: 'TEST_PRIVATE_KEY_123456',
    password: 'TEST password with spaces',
  });
  try {
    await fs.writeFile(path.join(f.root, 'settings.json'), text);
    const cp = (await f.snapshots.capture())!;
    assert.equal((await f.snapshots.content(cp, 'settings.json')).toString(), text);
    const log = path.join(f.directory, 'test-session.jsonl');
    await fs.writeFile(
      log,
      [
        { type: 'session_meta', payload: { id: 'test-session', cwd: f.root } },
        {
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            channel: 'final',
            content: [{ type: 'output_text', text }],
          },
        },
      ]
        .map((x) => JSON.stringify(x))
        .join('\n'),
    );
    assert.equal(await collectCodex(log, f.root, 'integrity-test', f.store), 1);
    const queued = f.store
      .pending()
      .map((row) => row.event)
      .join('\n');
    assert.ok(!queued.includes('TEST_PRIVATE_KEY_123456'));
    assert.ok(!queued.includes('TEST password with spaces'));
    assert.ok(queued.includes('[REDACTED]'));
  } finally {
    f.store.close();
  }
});

test('Codex preview and ingestion reject a junction in any ancestor directory', async () => {
  const f = await fixture();
  try {
    const target = path.join(f.directory, 'logs'),
      link = path.join(f.directory, 'linked-logs');
    await fs.mkdir(target);
    await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    await fs.writeFile(
      path.join(target, 'session.jsonl'),
      [
        { type: 'session_meta', payload: { id: 'test-session', cwd: f.root } },
        {
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'TEST' }],
          },
        },
      ]
        .map((x) => JSON.stringify(x))
        .join('\n'),
    );
    await assert.rejects(
      () => inspectCodexSource(path.join(link, 'session.jsonl'), f.root),
      /link|junction/i,
    );
    await assert.rejects(
      () => collectCodex(path.join(link, 'session.jsonl'), f.root, 'integrity-test', f.store),
      /link|junction/i,
    );
    assert.equal(f.store.pending().length, 0);
  } finally {
    f.store.close();
  }
});

test('legacy incomplete checkpoints are identified and current files get a recoverable new baseline', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.root, 'ordinary.txt'), 'original bytes');
    const old = (await f.snapshots.capture())!;
    await fs.writeFile(path.join(f.root, 'missing.log'), 'bytes legacy Git did not store');
    old.manifest = (await scanProject(f.root)).manifest;
    delete old.integrity;
    f.store.db.prepare('UPDATE checkpoints SET data=? WHERE id=?').run(JSON.stringify(old), old.id);
    const repaired = (await f.snapshots.capture())!;
    assert.ok(repaired && repaired.id !== old.id);
    assert.equal(f.store.get(old.id)?.integrity, 'invalid');
    assert.equal(repaired.integrity, 'verified');
    assert.equal(
      (await f.snapshots.content(repaired, 'missing.log')).toString(),
      'bytes legacy Git did not store',
    );
    await assert.rejects(() => f.snapshots.preview(old.id), /不完整/);
    await fs.writeFile(path.join(f.root, 'missing.log'), 'subsequent edit');
    assert.ok(await f.snapshots.capture());
  } finally {
    f.store.close();
  }
});
