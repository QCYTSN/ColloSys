import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../packages/connector/src/store';
import { Snapshots } from '../packages/connector/src/snapshots';
import { scanProject, safePath, within } from '../packages/connector/src/files';
import {
  eventSchema,
  redact,
  sensitivePath,
  type ClientEvent,
} from '../packages/shared/src/protocol';
import { parseCodexLog, collectCodex } from '../packages/connector/src/codex';
import { git, SNAPSHOT_IDENTITY } from '../packages/connector/src/vendor/codecast/git';
import { acquireStateLock } from '../packages/connector/src/lock';
import { Connector } from '../packages/connector/src/connector';

async function fixture() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'collosys-test-'));
  const root = path.join(temp, 'project'),
    state = path.join(temp, 'state');
  await fs.mkdir(root);
  const store = new Store(state);
  const snapshots = new Snapshots(root, state, 'workspace-test', store);
  await snapshots.init();
  return { temp, root, state, store, snapshots };
}
function event(): ClientEvent {
  return {
    version: 1,
    id: randomUUID(),
    workspaceId: 'workspace-test',
    occurredAt: Date.now(),
    kind: 'checkpoint',
    payload: {
      checkpointId: randomUUID(),
      parentId: null,
      label: 'TEST FIXTURE',
      files: [],
      totalFiles: 0,
      part: 1,
      parts: 1,
      source: 'local',
      backup: 'local-only',
    },
  };
}

test('protocol rejects forged actors, traversal and unversioned payloads', () => {
  assert.equal(eventSchema.safeParse({ ...event(), userId: 'bob' }).success, false);
  assert.equal(eventSchema.safeParse({ ...event(), version: 2 }).success, false);
  for (const p of [
    '.env',
    'src/.env.production',
    '.aws/credentials',
    '.collosys/config.json',
    'private.key',
    'node_modules/pkg/main.js',
  ])
    assert.equal(sensitivePath(p), true);
  assert.equal(sensitivePath('src/main.ts'), false);
  assert.ok(
    !redact('API_KEY=abcdef-secret password="testing" Bearer abcdefghijklmnopqrstuvwxyz').includes(
      'abcdef-secret',
    ),
  );
});

test('checkpoints and restore handle file-directory transitions without removing excluded content', async () => {
  const f = await fixture();
  try {
    const item = path.join(f.root, 'item');
    await fs.writeFile(item, 'original file');
    const fileState = (await f.snapshots.capture())!;
    await fs.unlink(item);
    await fs.mkdir(path.join(item, 'nested'), { recursive: true });
    await fs.writeFile(path.join(item, 'nested', 'child.txt'), 'directory content');
    const directoryState = (await f.snapshots.capture())!;
    await fs.writeFile(path.join(item, '.env'), 'SECRET=TEST_ONLY');
    const unsafe = await f.snapshots.preview(fileState.id);
    await assert.rejects(() => f.snapshots.restore(unsafe.id, true), /unmanaged/);
    assert.equal(
      await fs.readFile(path.join(item, 'nested', 'child.txt'), 'utf8'),
      'directory content',
    );
    assert.equal(await fs.readFile(path.join(item, '.env'), 'utf8'), 'SECRET=TEST_ONLY');
    await fs.unlink(path.join(item, '.env'));
    const toFile = await f.snapshots.preview(fileState.id);
    await f.snapshots.restore(toFile.id, true);
    assert.equal(await fs.readFile(item, 'utf8'), 'original file');
    const toDirectory = await f.snapshots.preview(directoryState.id);
    await f.snapshots.restore(toDirectory.id, true);
    assert.equal(
      await fs.readFile(path.join(item, 'nested', 'child.txt'), 'utf8'),
      'directory content',
    );
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});

test('snapshot initialization recovers after interruption between git init and the base commit', async () => {
  const f = await fixture();
  try {
    const partial = path.join(f.state, 'interrupted');
    await fs.mkdir(partial);
    await git(partial, ['init', '-q', '-b', 'checkpoints']);
    f.snapshots.mirror = partial;
    await f.snapshots.init();
    await fs.writeFile(path.join(f.root, 'after-restart.txt'), 'captured');
    const cp = await f.snapshots.capture();
    assert.ok(cp);
    assert.equal((await f.snapshots.content(cp, 'after-restart.txt')).toString(), 'captured');
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});

test('scan excludes tracked credentials, nested ignores and junctions without escaping root', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.root, '.env'), 'FAKE_SECRET=test\n');
    await fs.writeFile(path.join(f.root, 'keep.txt'), 'hello\n');
    await git(f.root, ['init', '-q', '-b', 'main']);
    await git(f.root, ['add', '.env']);
    await fs.writeFile(path.join(f.root, '.gitignore'), '.env\n*.log\n');
    await fs.mkdir(path.join(f.root, 'nested'));
    await fs.writeFile(
      path.join(f.root, 'nested', '.gitignore'),
      'hidden.txt\n!keep.log\n!private.log\n',
    );
    await fs.writeFile(path.join(f.root, '.collosysignore'), 'nested/private.log\n');
    await fs.writeFile(path.join(f.root, 'nested', 'keep.log'), 'explicitly included');
    await fs.writeFile(path.join(f.root, 'nested', 'drop.log'), 'ignored');
    await fs.writeFile(path.join(f.root, 'nested', 'private.log'), 'not shared');
    await fs.writeFile(path.join(f.root, 'nested', 'hidden.txt'), 'excluded');
    const outside = path.join(f.temp, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'secret.txt'), 'outside');
    await fs.symlink(outside, path.join(f.root, 'linked'), 'junction');
    const scan = await scanProject(f.root);
    assert.ok(scan.manifest['keep.txt']);
    assert.ok(!scan.manifest['.env']);
    assert.ok(!scan.manifest['nested/hidden.txt']);
    assert.ok(scan.manifest['nested/keep.log']);
    assert.ok(!scan.manifest['nested/drop.log']);
    assert.ok(!scan.manifest['nested/private.log']);
    assert.ok(!scan.manifest['linked/secret.txt']);
    await assert.rejects(() => safePath(f.root, '../outside/secret.txt'));
    await assert.rejects(() => safePath(f.root, 'linked/secret.txt'));
    assert.equal(within(f.root, path.join(f.temp, 'project-sibling', 'x')), false);
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});

test('an invalid state directory is rejected before creating credentials or databases in the project', async () => {
  const f = await fixture();
  const invalidState = path.join(f.root, 'invalid-state');
  try {
    const connector = new Connector({
      root: f.root,
      state: invalidState,
      backend: 'http://127.0.0.1:1',
      projectId: 'test',
      workspaceId: 'test',
      userId: 'alice',
      label: 'TEST FIXTURE',
      token: 'TEST-FIXTURE-NOT-A-REAL-TOKEN',
      port: 18999,
    });
    await assert.rejects(() => connector.start(), /outside the project/);
    await assert.rejects(() => fs.access(invalidState), /ENOENT/);
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});

test('real checkpoints preserve exact binary/CRLF bytes and the original Git staging area', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.root, 'text.txt'), 'base\n');
    await git(f.root, ['init', '-q', '-b', 'main']);
    await git(f.root, ['config', 'core.autocrlf', 'false']);
    await git(f.root, ['add', 'text.txt']);
    await git(f.root, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'base'], {
      ...process.env,
      ...SNAPSHOT_IDENTITY,
    });
    await fs.writeFile(path.join(f.root, 'text.txt'), 'staged\n');
    await git(f.root, ['add', 'text.txt']);
    await fs.writeFile(path.join(f.root, 'text.txt'), 'working\r\n');
    await fs.writeFile(path.join(f.root, '.gitattributes'), '* text=auto\n');
    await fs.writeFile(path.join(f.root, 'binary.bin'), Buffer.from([0, 1, 255, 128, 10]));
    const index = await fs.readFile(path.join(f.root, '.git', 'index')),
      head = await git(f.root, ['rev-parse', 'HEAD']);
    const cp = await f.snapshots.capture();
    assert.ok(cp);
    assert.deepEqual(await f.snapshots.content(cp, 'text.txt'), Buffer.from('working\r\n'));
    assert.deepEqual(
      await f.snapshots.content(cp, 'binary.bin'),
      Buffer.from([0, 1, 255, 128, 10]),
    );
    assert.deepEqual(await fs.readFile(path.join(f.root, '.git', 'index')), index);
    assert.equal(await git(f.root, ['rev-parse', 'HEAD']), head);
    assert.equal(await f.snapshots.capture(), null);
    assert.equal(f.store.count(), 1);
    assert.equal(
      await git(f.snapshots.mirror, ['rev-parse', `refs/collosys/checkpoints/${cp.id}`]),
      cp.sha,
    );
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});

test('restore requires confirmation, rejects stale previews, backs up current files and handles deletion', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.root, 'a.txt'), 'good\n');
    const original = (await f.snapshots.capture())!;
    await fs.writeFile(path.join(f.root, 'a.txt'), 'broken\n');
    await fs.writeFile(path.join(f.root, 'extra.txt'), 'new\n');
    await f.snapshots.capture();
    const stale = await f.snapshots.preview(original.id);
    assert.equal(await fs.readFile(path.join(stale.directory, 'a.txt'), 'utf8'), 'good\n');
    assert.equal(await fs.readFile(path.join(f.root, 'a.txt'), 'utf8'), 'broken\n');
    await assert.rejects(() => f.snapshots.restore(stale.id, false), /confirmation/);
    await fs.writeFile(path.join(f.root, 'a.txt'), 'new work\n');
    await assert.rejects(() => f.snapshots.restore(stale.id, true), /changed/);
    const preview = await f.snapshots.preview(original.id);
    const result = await f.snapshots.restore(preview.id, true);
    assert.equal(result.restored, 2);
    assert.equal(await fs.readFile(path.join(f.root, 'a.txt'), 'utf8'), 'good\n');
    await assert.rejects(() => fs.access(path.join(f.root, 'extra.txt')));
    const backup = f.store.get(result.backupId!)!;
    assert.equal((await f.snapshots.content(backup, 'a.txt')).toString(), 'new work\n');
    await assert.rejects(() => f.snapshots.restore(preview.id, true), /expired/);
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});

test('outbox survives a process-store restart and acknowledgement is idempotent', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'collosys-outbox-'));
  let store = new Store(directory);
  try {
    const e = event();
    store.enqueue(e);
    store.enqueue(e);
    assert.equal(store.count(), 1);
    store.close();
    store = new Store(directory);
    assert.equal(JSON.parse(store.pending()[0].event).id, e.id);
    store.acknowledge(e.id, 42);
    store.acknowledge(e.id, 42);
    assert.equal(store.count(), 0);
  } finally {
    store.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('state lock refuses two live writers and is released by its owner', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'collosys-lock-'));
  try {
    const release = await acquireStateLock(directory);
    await assert.rejects(() => acquireStateLock(directory), /already owns/);
    await release();
    const second = await acquireStateLock(directory);
    await second();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('a file leaving capture scope is not misreported as a disk deletion', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.root, 'large.txt'), 'original\n');
    await f.snapshots.capture();
    await fs.writeFile(path.join(f.root, 'large.txt'), 'x'.repeat(2 * 1024 * 1024 + 1));
    await f.snapshots.capture();
    const records = f.store.pending().map((r) => JSON.parse(r.event) as ClientEvent);
    const final = records.at(-1)!;
    assert.equal(final.kind, 'checkpoint');
    if (final.kind === 'checkpoint') assert.equal(final.payload.files[0].status, 'excluded');
    assert.ok((await fs.stat(path.join(f.root, 'large.txt'))).size > 2 * 1024 * 1024);
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});

test('Codex real-format adapter scopes cwd, ignores context/tool output, deduplicates replay', async () => {
  const f = await fixture();
  try {
    const rows = [
      { type: 'session_meta', payload: { id: 'test-session', cwd: f.root } },
      {
        type: 'response_item',
        timestamp: new Date().toISOString(),
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'TEST FIXTURE: improve greeting' }],
        },
      },
      {
        type: 'event_msg',
        payload: { type: 'user_message', message: 'TEST FIXTURE: improve greeting' },
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'TEST FIXTURE: greeting updated' }],
        },
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: '<environment_context>private</environment_context>' },
          ],
        },
      },
      {
        type: 'response_item',
        payload: { type: 'function_call_output', output: 'private tool output' },
      },
    ];
    const hidden = {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        channel: 'analysis',
        content: [{ type: 'output_text', text: 'PRIVATE_REASONING_MUST_NOT_BE_SHARED' }],
      },
    };
    const text = [...rows, hidden].map((r) => JSON.stringify(r)).join('\n') + '\n';
    assert.equal(parseCodexLog(text, f.root).length, 2);
    assert.equal(parseCodexLog(text, path.join(f.temp, 'other')).length, 0);
    assert.ok(!JSON.stringify(parseCodexLog(text, f.root)).includes('PRIVATE_REASONING'));
    const file = path.join(f.temp, 'TEST-FIXTURE-codex.jsonl');
    await fs.writeFile(file, text);
    assert.equal(await collectCodex(file, f.root, 'workspace-test', f.store), 2);
    assert.equal(await collectCodex(file, f.root, 'workspace-test', f.store), 0);
    assert.equal(f.store.count(), 2);
  } finally {
    f.store.close();
    await fs.rm(f.temp, { recursive: true, force: true });
  }
});
