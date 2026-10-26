import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
export const root = path.resolve(import.meta.dirname, '..');
export function nodeTool(
  tool: string,
  args: string[],
  options: { quiet?: boolean; env?: NodeJS.ProcessEnv } = {},
) {
  const files: Record<string, string> = {
    tsx: 'tsx/dist/cli.mjs',
    wrangler: 'wrangler/bin/wrangler.js',
    vite: 'vite/bin/vite.js',
  };
  return spawn(process.execPath, [path.join(root, 'node_modules', files[tool]), ...args], {
    cwd: root,
    windowsHide: true,
    stdio: options.quiet ? 'pipe' : 'inherit',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', ...options.env },
  });
}
export async function runTool(tool: string, args: string[]) {
  const child = nodeTool(tool, args);
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${tool} exited ${code}`)),
    );
  });
}
export async function assertPortsFree(ports: number[]) {
  for (const port of ports) {
    await new Promise<void>((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', () =>
        reject(
          new Error(
            `Local port ${port} is already in use. Stop its existing service or choose a different port.`,
          ),
        ),
      );
      probe.listen(port, '127.0.0.1', () =>
        probe.close((error) => (error ? reject(error) : resolve())),
      );
    });
  }
}
export async function waitFor(url: string, timeout = 45000, child?: ChildProcess) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (child && (child.exitCode !== null || child.signalCode !== null))
      throw new Error(`Service exited before becoming ready: ${url}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
export async function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32')
    await new Promise<void>((resolve) => {
      const task = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      task.once('error', () => resolve());
      task.once('exit', () => resolve());
    });
  else child.kill('SIGTERM');
}
