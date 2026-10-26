import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(process.execPath, [path.join(root, 'scripts/codecast-start.mjs')], {
  cwd: root,
  env: { ...process.env, COLLOSYS_WORKBENCH_PREVIEW: '1' },
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
