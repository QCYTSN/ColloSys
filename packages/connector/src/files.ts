import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ignore, { type Ignore } from 'ignore';
import { createTwoFilesPatch } from 'diff';
import { assertNoLinks, readCheckedFile } from './checked-file';
import {
  MAX_FILE_BYTES,
  redact,
  relativePathSchema,
  sensitivePath,
  type FileChange,
} from '../../shared/src/protocol';

export type FileInfo = { hash: string; size: number; binary: boolean; mode: number };
export type Manifest = Record<string, FileInfo>;
export type Scan = { manifest: Manifest; contents: Map<string, Buffer>; skipped: string[] };
export const digest = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');
export const fingerprint = (manifest: Manifest) =>
  digest(JSON.stringify(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))));
export function within(root: string, target: string) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  );
}
export async function assertRoot(root: string) {
  await assertNoLinks(root);
  const st = await fs.lstat(root);
  if (!st.isDirectory() || st.isSymbolicLink())
    throw new Error('Project must be a real directory, not a symlink');
  return fs.realpath(root);
}
export async function safePath(root: string, rel: string) {
  await assertRoot(root);
  relativePathSchema.parse(rel);
  const target = path.resolve(root, rel);
  if (!within(root, target)) throw new Error('Path escapes project root');
  let cursor = root;
  for (const part of rel.split('/')) {
    cursor = path.join(cursor, part);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) throw new Error('Symlink paths are excluded');
      const real = await fs.realpath(cursor);
      if (!within(root, real)) throw new Error('Path escapes project root');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  return target;
}
export async function scanProject(root: string): Promise<Scan> {
  await assertRoot(root);
  const manifest: Manifest = {},
    contents = new Map<string, Buffer>(),
    skipped: string[] = [];
  let total = 0,
    count = 0;
  type Rule = { base: string; matcher: Ignore; sharing: boolean };
  async function walk(dir: string, relative: string, rules: Rule[]) {
    const localRules = [...rules];
    for (const name of ['.gitignore', '.collosysignore']) {
      const file = path.join(dir, name);
      try {
        await fs.lstat(file);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw e;
      }
      try {
        const { bytes } = await readCheckedFile(file, 65536);
        localRules.push({
          base: relative,
          matcher: ignore().add(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
          sharing: name === '.collosysignore',
        });
      } catch (e) {
        throw new Error(`Cannot safely apply ${name} rules; capture refused`, { cause: e });
      }
    }
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (sensitivePath(rel) || entry.name === '.collosysignore') {
        skipped.push(rel);
        continue;
      }
      if (!relativePathSchema.safeParse(rel).success) {
        skipped.push(rel);
        continue;
      }
      const target = path.join(dir, entry.name),
        stat = await fs.lstat(target);
      if (stat.isSymbolicLink()) {
        skipped.push(rel);
        continue;
      }
      let ignored = false,
        sharingDenied = false;
      for (const { base, matcher, sharing } of localRules) {
        const result = matcher.test(
          (base ? rel.slice(base.length + 1) : rel) + (stat.isDirectory() ? '/' : ''),
        );
        if (sharing) sharingDenied ||= result.ignored;
        else if (result.ignored) ignored = true;
        else if (result.unignored) ignored = false;
      }
      if (ignored || sharingDenied) {
        skipped.push(rel);
        continue;
      }
      if (stat.isDirectory()) {
        const real = await fs.realpath(target);
        if (!within(root, real)) throw new Error('Directory escaped the authorized root');
        await walk(target, rel, localRules);
        continue;
      }
      if (!stat.isFile()) {
        skipped.push(rel);
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) {
        skipped.push(`${rel} (over 2 MiB)`);
        continue;
      }
      if (++count > 10000 || (total += stat.size) > 100 * 1024 * 1024)
        throw new Error(
          'Project scan exceeds 10,000 files or 100 MiB; narrow the authorized directory',
        );
      const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      let content: Buffer;
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.ino !== stat.ino || opened.size !== stat.size)
          throw new Error('File identity changed during scan; retrying');
        content = await handle.readFile();
        const after = await fs.lstat(target),
          final = await handle.stat(),
          real = await fs.realpath(target);
        if (
          !within(root, real) ||
          after.isSymbolicLink() ||
          stat.size !== final.size ||
          stat.mtimeMs !== final.mtimeMs ||
          stat.ino !== after.ino
        )
          throw new Error('Files changed during scan; retrying');
      } finally {
        await handle.close();
      }
      let binary = content.includes(0);
      if (!binary)
        try {
          new TextDecoder('utf-8', { fatal: true }).decode(content);
        } catch {
          binary = true;
        }
      manifest[rel] = {
        hash: digest(content),
        size: content.length,
        binary,
        mode: stat.mode & 0o777,
      };
      contents.set(rel, content);
    }
  }
  await walk(root, '', []);
  return { manifest, contents, skipped };
}
export function changedPaths(before: Manifest, after: Manifest) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((p) => before[p]?.hash !== after[p]?.hash)
    .sort();
}
export function diffFile(
  rel: string,
  before: FileInfo | undefined,
  after: FileInfo | undefined,
  old: Buffer | undefined,
  next: Buffer | undefined,
): FileChange {
  const binary = !!(before?.binary || after?.binary);
  let patch = '';
  let truncated = false;
  if (!binary) {
    const a = old?.toString('utf8') ?? '',
      b = next?.toString('utf8') ?? '';
    if (a.length + b.length > 256000) {
      patch = 'File is too large for an inline diff. Full bytes remain in the local checkpoint.';
      truncated = true;
    } else {
      patch = createTwoFilesPatch(`a/${rel}`, `b/${rel}`, a, b, '', '', { context: 3 });
      if (patch.length > 32000) {
        patch = patch.slice(0, 32000) + '\n… Diff truncated; full file is saved locally.\n';
        truncated = true;
      }
    }
  }
  return {
    path: rel,
    status: !before ? 'added' : !after ? 'deleted' : 'modified',
    binary,
    beforeHash: before?.hash ?? null,
    afterHash: after?.hash ?? null,
    size: after?.size ?? 0,
    patch: redact(patch),
    truncated,
  };
}
