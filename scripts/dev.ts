import { assertPortsFree, nodeTool, runTool, stopProcess, waitFor } from './process';
import { prepareDemo } from './setup-demo';
import type { ChildProcess } from 'node:child_process';
const children: ChildProcess[] = [];
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children.reverse()) await stopProcess(child);
}
process.on('SIGINT', () => void stop().then(() => process.exit(0)));
process.on('SIGTERM', () => void stop().then(() => process.exit(0)));
try {
  await assertPortsFree([8787, 8791, 8792, 5173]);
  await runTool('wrangler', [
    'd1',
    'execute',
    'collosys',
    '--local',
    '--config',
    'packages/backend/wrangler.jsonc',
    '--persist-to',
    '.local/cloudflare',
    '--file',
    'packages/backend/migrations/0001.sql',
  ]);
  await runTool('wrangler', [
    'd1',
    'execute',
    'collosys',
    '--local',
    '--config',
    'packages/backend/wrangler.jsonc',
    '--persist-to',
    '.local/cloudflare',
    '--file',
    'packages/backend/migrations/0002.sql',
  ]);
  await runTool('wrangler', [
    'd1',
    'execute',
    'collosys',
    '--local',
    '--config',
    'packages/backend/wrangler.jsonc',
    '--persist-to',
    '.local/cloudflare',
    '--file',
    'packages/backend/migrations/0003.sql',
  ]);
  await runTool('wrangler', [
    'd1',
    'execute',
    'collosys',
    '--local',
    '--config',
    'packages/backend/wrangler.jsonc',
    '--persist-to',
    '.local/cloudflare',
    '--file',
    'packages/backend/seed-demo.sql',
  ]);
  children.push(
    nodeTool('wrangler', [
      'dev',
      '--config',
      'packages/backend/wrangler.jsonc',
      '--ip',
      '127.0.0.1',
      '--port',
      '8787',
      '--persist-to',
      '.local/cloudflare',
    ]),
  );
  await waitFor('http://127.0.0.1:8787/api/health', 45000, children[0]);
  const configs = await prepareDemo();
  for (const config of configs)
    children.push(nodeTool('tsx', ['packages/connector/src/cli.ts', config]));
  await Promise.all([
    waitFor('http://127.0.0.1:8791/health', 45000, children[1]),
    waitFor('http://127.0.0.1:8792/health', 45000, children[2]),
  ]);
  children.push(
    nodeTool('vite', ['--config', 'packages/web/vite.config.ts', '--host', '127.0.0.1']),
  );
  await waitFor('http://127.0.0.1:5173', 45000, children[3]);
  console.log(
    '\nColloSys is starting at http://127.0.0.1:5173\nOpen two browser sessions and sign in as Alice / Bob. All services are local.\n',
  );
  for (const child of children)
    child.once('exit', (code) => {
      if (!stopping) {
        console.error(`A service stopped (${code}); stopping the development stack.`);
        void stop().then(() => process.exit(1));
      }
    });
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  await stop();
  process.exit(1);
}
