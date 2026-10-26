import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { root } from './process';
const exec = promisify(execFile);
if (process.platform !== 'win32') throw new Error('Build this package on Windows');
const stamp = new Date().toISOString().replace(/[:.]/g, '-'),
  directory = path.join(root, 'dist', `ColloSys-Windows-${stamp}`);
await fs.mkdir(directory, { recursive: true });
for (const name of ['packages', 'scripts', 'node_modules', 'third_party'])
  await fs.cp(path.join(root, name), path.join(directory, 'app', name), {
    recursive: true,
    filter: (src) => {
      // The isolated upstream reference is not the integrated ColloSys app.
      // Its full dependency tree must not silently enter the old installer.
      if (
        ['upstream', 'collo'].some(
          (part) => src === path.join(root, 'third_party', 'codecast', part),
        )
      )
        return false;
      const name = path.basename(src);
      return (
        !['.git', '.wrangler', '.local'].includes(name) &&
        !((name.startsWith('.env') || name.startsWith('.dev.vars')) && !name.endsWith('.example'))
      );
    },
  });
for (const name of [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'README.md',
  'PLAN.md',
  'THIRD_PARTY_NOTICES.md',
])
  await fs.copyFile(path.join(root, name), path.join(directory, 'app', name));
await fs.cp(path.join(root, 'dist', 'web'), path.join(directory, 'app', 'dist', 'web'), {
  recursive: true,
});
await fs.cp(path.join(root, 'docs'), path.join(directory, 'app', 'docs'), { recursive: true });
await fs.mkdir(path.join(directory, 'app', 'runtime'));
await fs.copyFile(process.execPath, path.join(directory, 'app', 'runtime', 'node.exe'));
const nodeLicense = path.join(root, 'third_party', 'node', 'LICENSE');
await fs.copyFile(nodeLicense, path.join(directory, 'app', 'runtime', 'NODE-LICENSE.txt'));
for (const file of ['Install.ps1', 'Install.cmd', 'Launch.vbs', 'Launch.ps1', 'Uninstall.ps1'])
  await fs.copyFile(path.join(root, 'packaging', file), path.join(directory, file));
await exec(
  'powershell.exe',
  [
    '-NoProfile',
    '-File',
    path.join(root, 'packaging', 'Compress.ps1'),
    '-Source',
    directory,
    '-Destination',
    path.join(root, 'dist', `ColloSys-Windows-${stamp}.zip`),
  ],
  { windowsHide: true, timeout: 300000 },
);
const zip = path.join(root, 'dist', `ColloSys-Windows-${stamp}.zip`),
  checksum = createHash('sha256')
    .update(await fs.readFile(zip))
    .digest('hex');
await fs.writeFile(zip + '.sha256', checksum + '  ' + path.basename(zip) + '\n');
console.log(JSON.stringify({ directory, zip, sha256: checksum }));
