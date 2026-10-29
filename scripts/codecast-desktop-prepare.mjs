import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function prepareDesktop() {
  const original = path.join(root, 'third_party/codecast/upstream');
  const destination = path.join(root, '.local/codecast-app/desktop-framework');
  const prefix = 'platform/packages/desktop/';
  const manifest = JSON.parse(
    await readFile(path.join(root, 'third_party/codecast/source-manifest.json'), 'utf8'),
  );
  const files = manifest.filter(
    ({ file, mode }) =>
      mode !== '120000' && (file.startsWith(prefix + 'src/') || file === prefix + 'package.json'),
  );
  for (const { file } of files) {
    const target = path.join(destination, file.slice(prefix.length));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(original, file), target);
  }
  // This is an owned runtime derivative, not an edit of the generated platform
  // mirror. Its only upstream change admits this exact local product origin.
  const configFile = path.join(destination, 'src/config.js');
  const config = await readFile(configFile, 'utf8');
  const before = 'return new URL(u).protocol === "https:";';
  if (config.split(before).length !== 2) throw new Error('Desktop config anchor changed');
  const after =
    'const parsed = new URL(u); return parsed.protocol === "https:" || (parsed.origin === "http://127.0.0.1:3407" && !parsed.username && !parsed.password);';
  await writeFile(configFile, config.replace(before, after));
  // Bundle the actual upstream bridge so it works with Electron's OS sandbox;
  // no renderer gets Node or a generic IPC transport.
  await build({
    entryPoints: [path.join(root, 'integrations/codecast/desktop/preload.cjs')],
    outfile: path.join(destination, 'preload.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    logLevel: 'silent',
  });
  await copyFile(path.join(original, 'LICENSE'), path.join(destination, 'LICENSE'));
  await writeFile(
    path.join(destination, 'provenance.json'),
    JSON.stringify(
      {
        upstream: '5dfb04f516122fe4f59a61137219b5a4e2e1f9f8',
        source: prefix,
        files: files.length,
        patch: {
          file: 'src/config.js',
          before,
          after,
          sha256: createHash('sha256')
            .update(await readFile(configFile))
            .digest('hex'),
        },
        preload: 'Owned product preload reuses the original bridge once, with versioned auth/appearance IPC and a read-only legacy alias',
      },
      null,
      2,
    ),
  );
}
