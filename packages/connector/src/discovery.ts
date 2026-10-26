import fs from 'node:fs/promises';
import path from 'node:path';
import { assertRoot, safePath } from './files';
// Called only after the user authorizes this log directory. Metadata-only discovery never uploads logs.
export async function discoverCodex(directory: string, project: string) {
  const root = await assertRoot(path.resolve(directory));
  const found: { path: string; sessionId: string; modifiedAt: number }[] = [];
  let visited = 0;
  const normalize = (s: string) =>
    process.platform === 'win32' ? path.resolve(s).toLowerCase() : path.resolve(s);
  async function walk(dir: string, depth: number) {
    if (depth > 6) return;
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (++visited > 20000)
        throw new Error('Log discovery limit reached; select a narrower directory');
      if (e.isSymbolicLink()) continue;
      const full = await safePath(
        root,
        path.relative(root, path.join(dir, e.name)).split(path.sep).join('/'),
      );
      if (e.isDirectory()) await walk(full, depth + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        const handle = await fs.open(full, 'r');
        try {
          const bytes = Buffer.alloc(16384);
          const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
          const first = bytes.subarray(0, bytesRead).toString('utf8').split('\n')[0];
          let meta;
          try {
            meta = JSON.parse(first);
          } catch {
            continue;
          }
          if (
            meta.type === 'session_meta' &&
            typeof meta.payload?.cwd === 'string' &&
            normalize(meta.payload.cwd) === normalize(project) &&
            typeof meta.payload.id === 'string'
          )
            found.push({
              path: full,
              sessionId: meta.payload.id,
              modifiedAt: (await handle.stat()).mtimeMs,
            });
        } finally {
          await handle.close();
        }
      }
    }
  }
  await walk(root, 0);
  return {
    sources: found.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 100),
    scanned: visited,
  };
}
