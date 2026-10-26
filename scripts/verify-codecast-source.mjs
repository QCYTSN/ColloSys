import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(root, 'third_party/codecast');
const source = JSON.parse(await readFile(path.join(vendor, 'SOURCE.json'), 'utf8'));
const entries = JSON.parse(await readFile(path.join(vendor, 'source-manifest.json'), 'utf8'));
const failures = [];
let verified = 0;
let windowsLineEndings = 0;
for (const { file, blob, mode } of entries) {
  if (mode === '120000') {
    if (!Object.hasOwn(source.omittedSymlinks, file))
      failures.push(`${file}: undocumented symlink`);
    continue;
  }
  const target = path.join(vendor, 'upstream', file);
  try {
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('expected an ordinary file');
    const content = await readFile(target);
    const actual = createHash('sha1')
      .update(`blob ${content.length}\0`)
      .update(content)
      .digest('hex');
    if (actual === blob) verified++;
    else {
      const normalized = Buffer.from(content.toString('utf8').replaceAll('\r\n', '\n'));
      const normalizedBlob = createHash('sha1')
        .update(`blob ${normalized.length}\0`)
        .update(normalized)
        .digest('hex');
      if (normalizedBlob === blob) {
        verified++;
        windowsLineEndings++;
      } else failures.push(`${file}: changed from upstream`);
    }
  } catch (e) {
    failures.push(`${file}: ${e.message}`);
  }
}
console.log(
  JSON.stringify(
    {
      commit: source.commit,
      verified,
      windowsLineEndings,
      documentedSymlinks: Object.keys(source.omittedSymlinks).length,
      failureCount: failures.length,
      failures: failures.slice(0, 20),
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
