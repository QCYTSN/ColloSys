import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { assertPortsFree, nodeTool, root, runTool, stopProcess, waitFor } from './process';
import { ConnectorManager } from '../packages/connector/src/manager';
import { serveWeb } from './local-web';
const data = path.resolve(
  process.env.COLLOSYS_DATA ??
    path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'ColloSys', 'data'),
);
const backend = process.env.COLLOSYS_BACKEND ?? 'http://127.0.0.1:8787';
const url = new URL(backend);
if (
  !(
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  ) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== '/'
)
  throw new Error('Backend must be an HTTPS origin or loopback HTTP origin');
let worker: ChildProcess | undefined,
  manager: ConnectorManager | undefined,
  web: Awaited<ReturnType<typeof serveWeb>> | undefined,
  stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await web?.stop();
  await manager?.stop();
  if (worker) await stopProcess(worker);
};
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => void stop().then(() => process.exit(0)));
try {
  await assertPortsFree([5173, 8790, ...(!process.env.COLLOSYS_BACKEND ? [8787] : [])]);
  await fs.mkdir(data, { recursive: true });
  if (!process.env.COLLOSYS_BACKEND) {
    const persistence = path.join(data, 'cloudflare'),
      envFile = path.join(data, 'local-auth.env');
    try {
      await fs.writeFile(envFile, `AUTH_PEPPER=${randomBytes(48).toString('hex')}\n`, {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    for (const file of ['0001.sql', '0002.sql', '0003.sql'])
      await runTool('wrangler', [
        'd1',
        'execute',
        'collosys',
        '--local',
        '--config',
        'packages/backend/wrangler.jsonc',
        '--persist-to',
        persistence,
        '--file',
        'packages/backend/migrations/' + file,
      ]);
    worker = nodeTool('wrangler', [
      'dev',
      '--config',
      'packages/backend/wrangler.jsonc',
      '--ip',
      '127.0.0.1',
      '--port',
      '8787',
      '--inspector-port',
      '0',
      '--persist-to',
      persistence,
      '--env-file',
      envFile,
      '--var',
      'AUTH_MODE:production',
      '--var',
      'BACKUP_LOCATION:local-object-storage',
    ]);
    await waitFor(backend + '/api/health', 60000, worker);
  }
  const pairing = randomBytes(32).toString('hex');
  manager = new ConnectorManager(path.join(data, 'connectors'), backend, pairing);
  manager.onShutdown = () => void stop().then(() => process.exit(0));
  await manager.start();
  web = await serveWeb(path.join(root, 'dist', 'web'), backend);
  // Only the local launcher can pair a browser; no pairing token is printed to logs.
  await fs.writeFile(
    path.join(data, 'launcher.json'),
    JSON.stringify({ url: `http://127.0.0.1:5173/#pair=${pairing}`, pid: process.pid }),
    { mode: 0o600 },
  );
  console.log(
    'ColloSys is ready at http://127.0.0.1:5173. Use the launcher browser window to connect project directories.',
  );
  if (process.platform === 'win32' && process.env.COLLOSYS_NO_BROWSER !== '1')
    spawn('explorer.exe', [`http://127.0.0.1:5173/#pair=${pairing}`], {
      windowsHide: true,
      stdio: 'ignore',
    }).unref();
  worker?.once('exit', () => {
    if (!stopping) void stop().then(() => process.exit(1));
  });
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  await stop();
  process.exit(1);
}
