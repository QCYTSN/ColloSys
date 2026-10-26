import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { relativePathSchema, sensitivePath, MAX_FILE_BYTES } from '../../shared/src/protocol';
import { digest, safePath } from './files';
import type { Snapshots } from './snapshots';
import type { Recovery } from './store';
import { assertNoLinks, readCheckedFile } from './checked-file';
export const MAX_BACKUP_BYTES = 24 * 1024 * 1024;
const fileSchema = z
  .object({
    path: relativePathSchema,
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    content: z.string().max(3 * 1024 * 1024),
  })
  .strict();
const archiveSchema = z
  .object({
    version: z.literal(1),
    checkpointId: z.string().uuid(),
    createdAt: z.number(),
    files: z.array(fileSchema).max(10000),
  })
  .strict();
const MAGIC = Buffer.from('COLLOSYS1');
const key = (passphrase: string, salt: Buffer) => {
  if (passphrase.length < 16 || passphrase.length > 256)
    throw new Error('Backup passphrase must contain 16–256 characters');
  return scryptSync(passphrase, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
};
export async function encryptCheckpoint(
  snapshots: Snapshots,
  checkpointId: string,
  passphrase: string,
) {
  const cp = snapshots.store.get(checkpointId);
  if (!cp) throw new Error('Checkpoint not found');
  const files = [];
  for (const rel of Object.keys(cp.manifest)) {
    if (sensitivePath(rel)) throw new Error('Excluded path in checkpoint');
    const bytes = await snapshots.content(cp, rel);
    files.push({ path: rel, hash: digest(bytes), content: bytes.toString('base64') });
  }
  const raw = gzipSync(
    JSON.stringify({ version: 1, checkpointId: cp.id, createdAt: cp.createdAt, files }),
  );
  if (raw.length > MAX_BACKUP_BYTES - 100)
    throw new Error(
      'Compressed checkpoint exceeds the 24 MiB backup limit; no partial backup was uploaded',
    );
  const salt = randomBytes(16),
    iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(passphrase, salt), iv);
  cipher.setAAD(MAGIC);
  const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), encrypted]);
}
export function decryptArchive(bytes: Buffer, passphrase: string) {
  if (bytes.length < 53 || bytes.length > MAX_BACKUP_BYTES || !bytes.subarray(0, 9).equals(MAGIC))
    throw new Error('Invalid backup format');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(passphrase, bytes.subarray(9, 25)),
    bytes.subarray(25, 37),
  );
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(bytes.subarray(37, 53));
  const raw = Buffer.concat([decipher.update(bytes.subarray(53)), decipher.final()]);
  const archive = archiveSchema.parse(
    JSON.parse(gunzipSync(raw, { maxOutputLength: 150 * 1024 * 1024 }).toString('utf8')),
  );
  const seen = new Set<string>();
  let total = 0;
  for (const file of archive.files) {
    if (sensitivePath(file.path)) throw new Error('Excluded path in backup');
    const normalized = process.platform === 'win32' ? file.path.toLowerCase() : file.path;
    if (seen.has(normalized)) throw new Error('Duplicate backup path');
    seen.add(normalized);
    const data = Buffer.from(file.content, 'base64');
    total += data.length;
    if (data.length > MAX_FILE_BYTES || total > 100 * 1024 * 1024 || digest(data) !== file.hash)
      throw new Error('Backup content integrity check failed');
  }
  return archive;
}
// Always reconstruct into a new managed directory; importing never writes to a user's root.
export async function reconstructArchive(
  bytes: Buffer,
  passphrase: string,
  parent: string,
  id: string,
) {
  const archive = decryptArchive(bytes, passphrase),
    directory = await safePath(parent, id);
  await fs.mkdir(directory); // EEXIST is deliberate: never overwrite an earlier recovery.
  try {
    for (const file of archive.files) {
      const dest = await safePath(directory, file.path);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, Buffer.from(file.content, 'base64'), { flag: 'wx' });
    }
  } catch (error) {
    // Only this newly created managed directory belongs to this operation.
    // The durable recovery job lets cleanup retry if removal also fails or we crash.
    await safePath(parent, id)
      .then((dir) => fs.rm(dir, { recursive: true, force: true }))
      .catch(() => {});
    throw error;
  }
  return {
    directory,
    checkpointId: archive.checkpointId,
    files: archive.files.length,
    manifest: Object.fromEntries(
      archive.files.map((file) => [
        file.path,
        {
          hash: file.hash,
          size: Buffer.byteLength(file.content, 'base64'),
        },
      ]),
    ),
  };
}

// Export only verified files into a directory this operation creates exclusively.
// A partial external export is left for the user; cleanup must never delete user files.
export async function exportRecovery(recovery: Recovery, directory: string) {
  await assertNoLinks(recovery.directory);
  await assertNoLinks(directory, { allowMissing: true });
  await fs.mkdir(directory);
  try {
    for (const [rel, info] of Object.entries(recovery.manifest)) {
      const source = await safePath(recovery.directory, rel);
      const { bytes } = await readCheckedFile(source, MAX_FILE_BYTES);
      if (bytes.length !== info.size || digest(bytes) !== info.hash)
        throw new Error('Recovered file changed; recover the backup again');
      const dest = await safePath(directory, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, bytes, { flag: 'wx' });
    }
  } catch (error) {
    throw new Error(`Export stopped; the new directory was left at ${directory}. ${String(error)}`);
  }
  return {
    directory,
    checkpointId: recovery.checkpointId,
    files: Object.keys(recovery.manifest).length,
  };
}
