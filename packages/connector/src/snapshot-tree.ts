import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, type Scan, type Manifest } from './files';
import { git, gitBytes } from './vendor/codecast/git';

// The scanner is the sole authority for membership and bytes. Git ignore rules,
// attributes, filters and its case-insensitive index cache must not reinterpret it.
export async function verifiedSnapshotTree(mirror: string, scan: Scan): Promise<string> {
  const names = [...scan.contents.keys()].sort();
  if (
    names.length !== Object.keys(scan.manifest).length ||
    names.some((name) => digest(scan.contents.get(name)!) !== scan.manifest[name]?.hash)
  )
    throw new Error('Snapshot bytes do not match the authorized scan manifest');
  const expected = names.map((name) => {
    const bytes = scan.contents.get(name)!;
    return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  });
  if (names.length) {
    const actual = (
      await git(
        mirror,
        ['hash-object', '-w', '--no-filters', '--stdin-paths'],
        undefined,
        names.map((name) => JSON.stringify(name)).join('\n') + '\n',
      )
    ).split('\n');
    if (actual.length !== expected.length || actual.some((hash, i) => hash !== expected[i]))
      throw new Error('Snapshot bytes changed before storage; checkpoint was not published');
  }
  const index = path.join(mirror, '.git', `collosys-index-${randomUUID()}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    await git(mirror, ['read-tree', '--empty'], env);
    if (names.length)
      await git(
        mirror,
        ['update-index', '-z', '--index-info'],
        env,
        names.map((name, i) => `100644 ${expected[i]}\t${name}\0`).join(''),
      );
    const tree = await git(mirror, ['write-tree'], env);
    const records = (await gitBytes(mirror, ['ls-tree', '-rz', '--full-tree', tree]))
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
    const entries = new Map(
      records.map((record) => {
        const tab = record.indexOf('\t');
        return [record.slice(tab + 1), record.slice(0, tab).split(' ')[2]];
      }),
    );
    if (entries.size !== names.length || names.some((name, i) => entries.get(name) !== expected[i]))
      throw new Error('Snapshot tree does not match the authorized file manifest');
    return tree;
  } finally {
    await fs.unlink(index).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export async function verifyStoredTree(mirror: string, sha: string, manifest: Manifest) {
  const records = (await gitBytes(mirror, ['ls-tree', '-rz', '--full-tree', sha]))
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const names = Object.keys(manifest).sort();
  const blobs = new Map(
    records.map((record) => {
      const tab = record.indexOf('\t');
      return [record.slice(tab + 1), record.slice(0, tab).split(' ')[2]];
    }),
  );
  if (blobs.size !== names.length || names.some((name) => !blobs.has(name)))
    throw new Error('Checkpoint is missing captured paths');
  if (!names.length) return;
  const data = await gitBytes(
    mirror,
    ['cat-file', '--batch'],
    undefined,
    names.map((name) => blobs.get(name)).join('\n') + '\n',
  );
  let offset = 0;
  for (const name of names) {
    const newline = data.indexOf(10, offset);
    const header = data.subarray(offset, newline).toString().split(' '),
      size = Number(header[2]);
    if (
      newline < offset ||
      header[1] !== 'blob' ||
      !Number.isSafeInteger(size) ||
      size !== manifest[name].size
    )
      throw new Error('Checkpoint object is invalid');
    offset = newline + 1;
    if (digest(data.subarray(offset, offset + size)) !== manifest[name].hash)
      throw new Error('Checkpoint content hash mismatch');
    offset += size + 1;
  }
  if (offset !== data.length) throw new Error('Checkpoint object stream is inconsistent');
}
