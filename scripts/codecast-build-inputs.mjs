import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function buildFingerprint() {
  const files = [
    'packages/shared/src/protocol.ts',
    'third_party/codecast/collo/vite.config.ts',
    'third_party/codecast/SOURCE.json',
    'scripts/codecast-prepare.mjs',
    'scripts/codecast-brand.mjs',
    'scripts/codecast-desktop-prepare.mjs',
    'scripts/product-build-identity.mjs',
    'scripts/product-oauth-config.mjs',
    'scripts/codecast-reference.mjs',
    'scripts/codecast-start.mjs',
  ];
  async function visit(directory) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Linked integration sources are not allowed');
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else files.push(file);
    }
  }
  await visit('integrations/codecast');
  const hash = createHash('sha256');
  for (const file of files.sort())
    hash.update(file.replaceAll('\\', '/')).update(await readFile(path.join(root, file)));
  return hash.digest('hex');
}
