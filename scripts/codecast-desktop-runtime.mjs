import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '44.3.0';
const checksum = '26bf9a617d58d81772b3d68305d59ee48272969c15083c06db634a77358a8d9d';
async function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  if (code !== 0) throw new Error(`Desktop runtime preparation failed (${code})`);
}
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function ensureDesktopRuntime() {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('Desktop runtime currently supports Windows x64.');
  const packageDir = path.join(root, 'node_modules/electron');
  const metadata = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
  if (metadata.version !== version) throw new Error('Unexpected Electron dependency version');
  const dist = path.join(packageDir, 'dist');
  const executable = path.join(dist, 'electron.exe');
  try {
    await access(executable);
    if ((await readFile(path.join(dist, 'version'), 'utf8')).trim().replace(/^v/, '') === version)
      return executable;
  } catch {}
  const cache = path.join(root, '.local/codecast-runtime');
  await mkdir(cache, { recursive: true });
  const archive = path.join(cache, `electron-v${version}-win32-x64.zip`);
  let valid = false;
  try {
    valid = (await digest(archive)) === checksum;
  } catch {}
  if (!valid) {
    console.log('Downloading the pinned Windows desktop runtime.');
    const downloadOptions = [
      '--silent',
      '--show-error',
      '--fail',
      '--location',
      '--max-time',
      '240',
      '--connect-timeout',
      '15',
      '--output',
      archive,
    ];
    try {
      await run('curl.exe', [
        ...downloadOptions,
        `https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-win32-x64.zip`,
      ]);
    } catch {
      console.log(
        'Primary download unavailable; using a mirror with the same pinned SHA-256 verification.',
      );
      await run('curl.exe', [
        ...downloadOptions,
        `https://cdn.npmmirror.com/binaries/electron/${version}/electron-v${version}-win32-x64.zip`,
      ]);
    }
  }
  if ((await digest(archive)) !== checksum) throw new Error('Desktop archive checksum mismatch');
  const quoted = (value) => "'" + value.replaceAll("'", "''") + "'";
  await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath ${quoted(archive)} -DestinationPath ${quoted(dist)} -Force`,
  ]);
  if ((await readFile(path.join(dist, 'version'), 'utf8')).trim().replace(/^v/, '') !== version)
    throw new Error('Extracted desktop version mismatch');
  await access(executable);
  await writeFile(path.join(packageDir, 'path.txt'), 'electron.exe');
  return executable;
}
