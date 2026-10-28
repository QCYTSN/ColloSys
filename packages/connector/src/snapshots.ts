import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTurnSnapshot } from './vendor/codecast/treeSnapshot';
import { git, gitBytes, SNAPSHOT_IDENTITY } from './vendor/codecast/git';
import { verifiedSnapshotTree, verifyStoredTree } from './snapshot-tree';
import {
  changedPaths,
  assertRoot,
  digest,
  diffFile,
  fingerprint,
  safePath,
  scanProject,
  within,
  type Manifest,
  type Scan,
} from './files';
import { Store, type LocalCheckpoint } from './store';
import type { ClientEvent, FileChange } from '../../shared/src/protocol';
import { cleanRetention, defaultRetention, diskBytes } from './retention';
import { assertNoLinks } from './checked-file';
export type Preview = {
  id: string;
  checkpointId: string;
  createdAt: number;
  expiresAt: number;
  expected: string;
  directory: string;
  files: FileChange[];
  before: Manifest;
  target: Manifest;
};

export class Snapshots {
  mirror: string;
  previews: string;
  recoveries: string;
  lastSkipped: string[] = [];
  constructor(
    public root: string,
    public state: string,
    public workspaceId: string,
    public store: Store,
  ) {
    this.mirror = path.join(state, 'snapshot-repo');
    this.previews = path.join(state, 'previews');
    this.recoveries = path.join(state, 'recoveries');
  }
  async init() {
    if (within(this.root, this.state) || within(this.state, this.root))
      throw new Error('Connector state must be outside the project directory');
    await assertNoLinks(this.mirror, { allowMissing: true });
    await assertNoLinks(this.previews, { allowMissing: true });
    await assertNoLinks(this.recoveries, { allowMissing: true });
    await fs.mkdir(this.mirror, { recursive: true });
    await fs.mkdir(this.previews, { recursive: true });
    await fs.mkdir(this.recoveries, { recursive: true });
    await assertRoot(this.mirror);
    try {
      await fs.access(path.join(this.mirror, '.git'));
    } catch {
      await git(this.mirror, [
        '-c',
        'init.templateDir=',
        'init',
        '--object-format=sha1',
        '-q',
        '-b',
        'checkpoints',
      ]);
    }
    await assertRoot(path.join(this.mirror, '.git'));
    if (
      path.resolve(await git(this.mirror, ['rev-parse', '--absolute-git-dir'])) !==
        path.resolve(this.mirror, '.git') ||
      path.resolve(await git(this.mirror, ['rev-parse', '--show-toplevel'])) !==
        path.resolve(this.mirror)
    )
      throw new Error('Managed Git repository points outside its authorized state directory');
    await git(this.mirror, ['config', 'core.autocrlf', 'false']);
    // A managed mirror's absolute prefix is longer than the user's directory.
    // Allow Windows Git to read those valid files without changing user/global Git.
    if (process.platform === 'win32') await git(this.mirror, ['config', 'core.longpaths', 'true']);
    await git(this.mirror, ['config', 'core.hooksPath', path.join(this.state, 'disabled-hooks')]);
    try {
      await git(this.mirror, ['rev-parse', '--verify', 'HEAD']);
    } catch {
      await git(
        this.mirror,
        ['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'ColloSys snapshot base'],
        SNAPSHOT_IDENTITY,
      );
    }
    await fs.mkdir(path.join(this.mirror, '.git', 'info'), { recursive: true });
    await fs.writeFile(
      path.join(this.mirror, '.git', 'info', 'attributes'),
      '* -text -filter -ident -working-tree-encoding\n',
    );
    // Finish durable cleanup jobs before quota checks or new snapshots.
    await cleanRetention(this);
  }
  async content(cp: LocalCheckpoint, rel: string): Promise<Buffer> {
    if (cp.integrity === 'invalid')
      throw new Error('This legacy checkpoint is incomplete and cannot be restored');
    if (!cp.manifest[rel]) return Buffer.alloc(0);
    const bytes = await gitBytes(this.mirror, ['show', `${cp.sha}:${rel}`]);
    if (digest(bytes) !== cp.manifest[rel].hash)
      throw new Error('Stored checkpoint bytes do not match its manifest');
    return bytes;
  }
  async validateLegacy(cp: LocalCheckpoint) {
    if (cp.integrity) return cp.integrity === 'verified';
    try {
      await verifyStoredTree(this.mirror, cp.sha, cp.manifest);
      cp.integrity = 'verified';
    } catch {
      cp.integrity = 'invalid';
      cp.integrityError = '旧版本检查点内容不完整，无法用于恢复；原记录已保留。';
    }
    this.store.db
      .prepare('UPDATE checkpoints SET data=? WHERE id=?')
      .run(JSON.stringify(cp), cp.id);
    return cp.integrity === 'verified';
  }
  async synchronizeMirror(scan: Scan) {
    const walk = async (dir: string, base = '') => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (!base && e.name === '.git') continue;
        const rel = base ? `${base}/${e.name}` : e.name,
          full = path.join(dir, e.name);
        if (e.isSymbolicLink()) throw new Error('Managed snapshot contains a symlink');
        if (e.isDirectory()) {
          await walk(full, rel);
          // Only remove empty managed directories. A directory may have become a file.
          if (!(await fs.readdir(full)).length) await fs.rmdir(full);
        } else if (!scan.manifest[rel]) await fs.unlink(full);
      }
    };
    await walk(this.mirror);
    for (const [rel, bytes] of scan.contents) {
      const dest = await safePath(this.mirror, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      let same = false;
      try {
        same = (await fs.readFile(dest)).equals(bytes);
      } catch {}
      if (!same) await fs.writeFile(dest, bytes);
    }
  }
  async capture(
    label = '保存文件',
    force = false,
    provided?: Scan,
  ): Promise<LocalCheckpoint | null> {
    const scan = provided ?? (await scanProject(this.root));
    this.lastSkipped = scan.skipped;
    let previous = this.store.latest();
    if (previous && !(await this.validateLegacy(previous))) {
      label = `重新建立当前文件基线；旧检查点 ${previous.id} 不完整`;
      previous = null;
    }
    if (previous && !force && fingerprint(previous.manifest) === fingerprint(scan.manifest))
      return null;
    const policy = this.store.setting('retention', defaultRetention);
    const reservation = [...scan.contents.values()].reduce((n, b) => n + b.length * 2, 65536);
    if ((await diskBytes(this.state)) + reservation > policy.maxDiskMiB * 1024 * 1024)
      throw new Error(
        'Storage quota reached; clean retained checkpoints or increase the limit. This state was not captured.',
      );
    await this.synchronizeMirror(scan);
    const tree = await verifiedSnapshotTree(this.mirror, scan);
    const snap = await createTurnSnapshot(this.mirror, { tree });
    if (!snap) throw new Error('Snapshot repository could not create a checkpoint');
    const id = randomUUID(),
      createdAt = Date.now(),
      files: FileChange[] = [];
    for (const rel of changedPaths(previous?.manifest ?? {}, scan.manifest)) {
      const excluded =
        !scan.manifest[rel] &&
        scan.skipped.some((p) => p === rel || p.startsWith(rel + ' (') || rel.startsWith(p + '/'));
      if (excluded) {
        files.push({
          path: rel,
          status: 'excluded',
          binary: previous!.manifest[rel].binary,
          beforeHash: previous!.manifest[rel].hash,
          afterHash: null,
          size: 0,
          patch: '文件已超出当前纳管范围；这不代表磁盘文件被删除。当前内容未保存。',
          truncated: false,
        });
        continue;
      }
      files.push(
        diffFile(
          rel,
          previous?.manifest[rel],
          scan.manifest[rel],
          previous?.manifest[rel] ? await this.content(previous, rel) : undefined,
          scan.contents.get(rel),
        ),
      );
    }
    // Pin every retained checkpoint: upstream's bounded chain is an optimization, not our retention policy.
    await git(this.mirror, ['update-ref', `refs/collosys/checkpoints/${id}`, snap.sha]);
    const groups: FileChange[][] = [[]];
    let bytes = 0;
    for (const file of files) {
      const cost = Buffer.byteLength(JSON.stringify(file));
      if (groups.at(-1)!.length >= 100 || bytes + cost > 220000) {
        groups.push([]);
        bytes = 0;
      }
      groups.at(-1)!.push(file);
      bytes += cost;
    }
    const events: ClientEvent[] = groups.map((group, index) => ({
      version: 1,
      id: randomUUID(),
      workspaceId: this.workspaceId,
      occurredAt: createdAt,
      kind: 'checkpoint',
      payload: {
        checkpointId: id,
        parentId: previous?.id ?? null,
        label,
        files: group,
        totalFiles: files.length,
        part: index + 1,
        parts: groups.length,
        source: 'local',
        backup: 'local-only',
      },
    }));
    const cp: LocalCheckpoint = {
      id,
      parentId: previous?.id ?? null,
      sha: snap.sha,
      createdAt,
      label,
      fileCount: Object.keys(scan.manifest).length,
      eventCount: events.length,
      source: 'local',
      manifest: scan.manifest,
      integrity: 'verified',
    };
    this.store.checkpoint(cp, events);
    return cp;
  }
  async preview(checkpointId: string): Promise<Preview> {
    const target = this.store.get(checkpointId);
    if (!target) throw new Error('Checkpoint not found on this device');
    if (!(await this.validateLegacy(target))) throw new Error(target.integrityError);
    const current = await scanProject(this.root),
      id = randomUUID(),
      directory = path.join(this.previews, id);
    await fs.mkdir(directory, { recursive: true });
    const targetContents = new Map<string, Buffer>();
    for (const rel of Object.keys(target.manifest)) {
      const bytes = await this.content(target, rel);
      targetContents.set(rel, bytes);
      const dest = await safePath(directory, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, bytes);
    }
    const files = changedPaths(current.manifest, target.manifest).map((rel) =>
      diffFile(
        rel,
        current.manifest[rel],
        target.manifest[rel],
        current.contents.get(rel),
        targetContents.get(rel),
      ),
    );
    const preview: Preview = {
      id,
      checkpointId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60000,
      expected: fingerprint(current.manifest),
      directory,
      files,
      before: current.manifest,
      target: target.manifest,
    };
    this.store.savePreview(id, preview);
    return preview;
  }
  async restore(previewId: string, confirmed: boolean) {
    if (confirmed !== true) throw new Error('Explicit confirmation is required');
    const preview = this.store.preview<Preview>(previewId);
    if (!preview || preview.expiresAt < Date.now())
      throw new Error('Restore preview expired; preview again');
    const target = this.store.get(preview.checkpointId);
    if (!target) throw new Error('Checkpoint is unavailable');
    const current = await scanProject(this.root);
    if (fingerprint(current.manifest) !== preview.expected)
      throw new Error('Files changed after preview; preview again before restoring');
    if (!preview.files.length) {
      this.store.consumePreview(previewId);
      return { restored: 0, backupId: null, checkpointId: null };
    }
    const deleted = new Set(
      preview.files.filter((f) => !target.manifest[f.path]).map((f) => f.path),
    );
    // Replacing a directory must never discard ignored, oversized, or newly created files.
    const inspectDirectory = async (directory: string, prune = false) => {
      const rel = path.relative(this.root, directory).split(path.sep).join('/');
      await safePath(this.root, rel);
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const child = path.join(directory, entry.name);
        const childRel = path.relative(this.root, child).split(path.sep).join('/');
        await safePath(this.root, childRel);
        if (entry.isDirectory()) await inspectDirectory(child, prune);
        else if (prune || !deleted.has(childRel))
          throw new Error(`Restore would replace an unmanaged or changed file: ${childRel}`);
      }
      if (prune) await fs.rmdir(directory);
    };
    for (const file of preview.files) {
      try {
        const dest = await safePath(this.root, file.path);
        if (target.manifest[file.path]) {
          const st = await fs.lstat(dest).catch((e: NodeJS.ErrnoException) => {
            if (e.code === 'ENOENT') return null;
            throw e;
          });
          if (st?.isDirectory()) await inspectDirectory(dest);
        }
      } catch (e) {
        const segments = file.path.split('/');
        const replacingParent = segments.some(
          (_, i) => i > 0 && deleted.has(segments.slice(0, i).join('/')),
        );
        if ((e as NodeJS.ErrnoException).code !== 'ENOTDIR' || !replacingParent) throw e;
      }
    }
    const backup = await this.capture('恢复前备份', true, current);
    const latest = await scanProject(this.root);
    if (fingerprint(latest.manifest) !== preview.expected)
      throw new Error('Files changed while saving backup; nothing restored');
    const plan = [];
    for (const file of preview.files) {
      const dest = path.resolve(this.root, file.path);
      if (!within(this.root, dest)) throw new Error('Restore path escapes project');
      plan.push({
        file,
        dest,
        bytes: target.manifest[file.path] ? await this.content(target, file.path) : null,
      });
    }
    // Remove old files first so a former file can become a directory and vice versa.
    plan.sort((a, b) => Number(a.bytes !== null) - Number(b.bytes !== null));
    // No reset/checkout touches the user's repository. Recheck each file immediately before replacement.
    const completed: string[] = [];
    try {
      for (const item of plan) {
        await safePath(this.root, item.file.path);
        if (item.bytes !== null) {
          const st = await fs.lstat(item.dest).catch((e: NodeJS.ErrnoException) => {
            if (e.code === 'ENOENT') return null;
            throw e;
          });
          if (st?.isDirectory()) await inspectDirectory(item.dest, true);
        }
        const expected = current.contents.get(item.file.path);
        let actual: Buffer | undefined;
        try {
          actual = await fs.readFile(item.dest);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        if (!!actual !== !!expected || (actual && expected && !actual.equals(expected)))
          throw new Error(`File changed during restore: ${item.file.path}`);
        if (item.bytes === null) {
          await fs.unlink(item.dest);
        } else {
          await fs.mkdir(path.dirname(item.dest), { recursive: true });
          const temp = item.dest + `.collosys-${randomUUID()}.tmp`;
          await fs.writeFile(temp, item.bytes);
          try {
            await safePath(this.root, item.file.path);
            await fs.rename(temp, item.dest);
          } finally {
            await fs.unlink(temp).catch(() => {});
          }
        }
        completed.push(item.file.path);
      }
    } catch (e) {
      this.store.consumePreview(previewId);
      throw new Error(
        `Restore stopped after ${completed.length} files. Current-state backup ${backup!.id} is retained. ${String(e)}`,
      );
    }
    this.store.consumePreview(previewId);
    const restored = await this.capture('从检查点恢复', true);
    return { restored: completed.length, backupId: backup!.id, checkpointId: restored!.id };
  }
}
