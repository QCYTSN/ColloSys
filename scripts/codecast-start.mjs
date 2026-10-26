import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDesktopRuntime } from './codecast-desktop-runtime.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  await access(path.join(root, '.local/codecast-runtime/bin/convex-local-backend.exe'));
  await access(
    path.join(root, 'third_party/codecast/upstream/packages/web/node_modules/vite/bin/vite.js'),
  );
} catch {
  const setup = spawn(process.execPath, [path.join(root, 'scripts/codecast-setup.mjs')], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if ((await new Promise((resolve) => setup.once('exit', resolve))) !== 0)
    throw new Error('Local runtime setup failed');
}
if (process.platform !== 'win32')
  throw new Error('This desktop launcher currently supports Windows only.');
const executable = await ensureDesktopRuntime();
let running = false;
try {
  const { pid } = JSON.parse(
    await readFile(path.join(root, '.local/codecast-app/launcher.lock'), 'utf8'),
  );
  process.kill(pid, 0);
  const ready = await fetch('http://127.0.0.1:3411/health', { signal: AbortSignal.timeout(1000) });
  running = ready.ok;
} catch {}
if (running) {
  // The shell's original single-instance lock focuses an already open window.
  // Attaching to debug services never takes ownership of their shutdown.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = spawn(executable, [path.join(root, 'integrations/codecast/desktop/main.cjs')], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: false,
  });
  process.exitCode = await new Promise((resolve, reject) => {
    desktop.once('exit', resolve);
    desktop.once('error', reject);
  });
} else {
  process.argv.push('--app', '--built', '--desktop');
  await import('./codecast-reference.mjs');
}
