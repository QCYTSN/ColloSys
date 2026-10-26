import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('This reference launcher currently supports Windows x64.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(root, 'third_party/codecast');
const pin = JSON.parse(await readFile(path.join(vendor, 'runtime-lock.json'), 'utf8'));
const runtime = path.join(root, '.local/codecast-runtime');
const toolRoot = path.join(root, '.local/tools');
const bun = path.join(toolRoot, 'node_modules/@oven/bun-windows-x64/bin/bun.exe');
const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );
async function run(exe, args, cwd) {
  const child = spawn(exe, args, { cwd, stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) throw new Error(`Setup process failed (${code})`);
}
await mkdir(runtime, { recursive: true });
if (!(await exists(bun))) {
  const npm =
    process.env.npm_execpath ||
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  await run(
    process.execPath,
    [npm, 'install', '--prefix', toolRoot, '--no-save', '--ignore-scripts', `bun@${pin.bun}`],
    root,
  );
}
const bunVersion = spawnSync(bun, ['--version'], { encoding: 'utf8', windowsHide: true });
if (bunVersion.status !== 0 || bunVersion.stdout.trim() !== pin.bun)
  throw new Error(
    `The isolated Bun installation must be version ${pin.bun}; rerun its pinned npm install.`,
  );
await run(
  bun,
  [
    'install',
    '--ignore-scripts',
    '--frozen-lockfile',
    '--filter',
    '@codecast/web',
    '--filter',
    '@codecast/convex',
    '--filter',
    '@codecast/shared',
  ],
  path.join(vendor, 'upstream'),
);
const zip = path.join(runtime, 'backend.zip');
if (!(await exists(zip))) {
  const url = `https://github.com/get-convex/convex-backend/releases/download/${pin.backendRelease}/${pin.backendAsset}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Backend download failed (${response.status})`);
  const content = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(content).digest('hex') !== pin.backendZipSha256)
    throw new Error('Backend archive checksum mismatch');
  await writeFile(zip, content, { flag: 'wx' });
}
if (
  createHash('sha256')
    .update(await readFile(zip))
    .digest('hex') !== pin.backendZipSha256
)
  throw new Error('Cached backend archive checksum mismatch');
const bin = path.join(runtime, 'bin');
if (!(await exists(path.join(bin, 'convex-local-backend.exe')))) {
  await mkdir(bin, { recursive: true });
  await run('tar.exe', ['-xf', zip, '-C', bin], runtime);
}
if (
  createHash('sha256')
    .update(await readFile(path.join(bin, 'convex-local-backend.exe')))
    .digest('hex') !== pin.backendExecutableSha256
)
  throw new Error('Backend executable checksum mismatch');
await run(process.execPath, [path.join(root, 'scripts/verify-codecast-source.mjs')], root);
console.log(
  'Full Codecast source and pinned local runtime are ready. Start with npm run codecast:reference.',
);
