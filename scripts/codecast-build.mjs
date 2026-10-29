import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { buildFingerprint } from './codecast-build-inputs.mjs';
import { acquireApplicationLock } from './codecast-runtime-lock.mjs';
if (!process.argv.includes('--prepared')) {
  await acquireApplicationLock();
  await import('./codecast-prepare.mjs');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { inputFingerprint } = JSON.parse(
  await readFile(path.join(root, '.local/codecast-app/fork-manifest.json'), 'utf8'),
);
if (!inputFingerprint || (await buildFingerprint()) !== inputFingerprint)
  throw new Error('Prepared Codecast source is stale; prepare it again before building.');
const child = spawn(
  process.execPath,
  [
    path.join(root, 'third_party/codecast/upstream/packages/web/node_modules/vite/bin/vite.js'),
    'build',
    '--config',
    path.join(root, 'third_party/codecast/collo/vite.config.ts'),
  ],
  {
    cwd: path.join(root, '.local/codecast-app/source/packages/web'),
    env: {
      ...process.env,
      COLLOSYS_CODECAST_BACKEND: 'http://127.0.0.1:3408',
      COLLOSYS_CODECAST_APP: '1',
    },
    stdio: 'inherit',
    windowsHide: true,
  },
);
process.exitCode = await new Promise((resolve, reject) => {
  child.once('exit', resolve);
  child.once('error', reject);
});
if (process.exitCode === 0) {
  if ((await buildFingerprint()) !== inputFingerprint)
    throw new Error('Codecast inputs changed during the build; run the command again.');
  await writeFile(
    path.join(root, 'dist/codecast-app/collo-build.json'),
    await readFile(path.join(root, '.local/codecast-app/product-public/collo-build.json'), 'utf8'),
  );
}
