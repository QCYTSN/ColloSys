import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export async function assertNoLinks(target: string, options: { allowMissing?: boolean } = {}) {
  const absolute = path.resolve(target),
    root = path.parse(absolute).root;
  let cursor = root;
  for (const component of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    try {
      if ((await fs.lstat(cursor)).isSymbolicLink())
        throw new Error('Symlink and junction paths are excluded');
    } catch (error) {
      if (options.allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

export async function readCheckedFile(file: string, maxBytes: number) {
  await assertNoLinks(file);
  const before = await fs.lstat(file);
  if (!before.isFile() || before.size > maxBytes)
    throw new Error('Selected file is not regular or exceeds its size limit');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (opened.ino !== before.ino || opened.size !== before.size || !opened.isFile())
      throw new Error('Selected file changed while opening');
    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    await assertNoLinks(file);
    const after = await fs.lstat(file),
      final = await handle.stat();
    if (
      length !== before.size ||
      final.size !== before.size ||
      final.mtimeMs !== before.mtimeMs ||
      after.ino !== before.ino
    )
      throw new Error('Selected file changed during reading');
    return { bytes: buffer.subarray(0, length), stat: final };
  } finally {
    await handle.close();
  }
}
