import { ConnectorManager } from '../packages/connector/src/manager';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Connector, configSchema } from '../packages/connector/src/connector';

const data = path.resolve('.local/codecast-app');
const backend = process.env.COLLOSYS_CODECAST_SITE;
if (backend !== 'http://127.0.0.1:3409') throw new Error('Explicit local Codecast site required');
const pairFile = path.join(data, 'browser-pairing');
let pair: string;
try {
  pair = await fs.readFile(pairFile, 'utf8');
} catch (e: any) {
  if (e.code !== 'ENOENT') throw e;
  pair = randomBytes(32).toString('hex');
  await fs.writeFile(pairFile, pair, { flag: 'wx', mode: 0o600 });
}
const manager = new ConnectorManager(path.join(data, 'connectors'), backend, pair, 3411, {
  origins: ['http://127.0.0.1:3407'],
  deviceCredentials: true,
});
manager.ready = false;
await manager.start();
// Only explicitly configured roots are resumed. Invalid, linked or overlapping
// directories are rejected by Connector.start, exactly as on first connection.
for (const entry of await fs.readdir(manager.directory, { withFileTypes: true })) {
  if (
    !entry.isDirectory() ||
    entry.isSymbolicLink() ||
    !/^workspace-[a-f0-9-]{36}$/.test(entry.name)
  )
    continue;
  try {
    const state = path.join(manager.directory, entry.name);
    const config = configSchema.parse(
      JSON.parse(await fs.readFile(path.join(state, 'config.json'), 'utf8')),
    );
    if (
      config.state !== state ||
      config.backend !== backend ||
      config.credential !== 'device' ||
      !config.autoStart
    )
      continue;
    const connector = new Connector(config);
    await connector.start();
    manager.connectors.set(config.workspaceId, connector);
  } catch {
    console.error('A saved directory could not be resumed; reconnect it in the application.');
  }
}
await fs.writeFile(
  path.join(data, 'launcher.json'),
  JSON.stringify({ url: `http://127.0.0.1:3407/projects#pair=${pair}` }),
  { mode: 0o600 },
);
console.log('Local connector manager ready on 127.0.0.1:3411');
manager.ready = true;
let stopped = false;
async function stop() {
  if (stopped) return;
  stopped = true;
  await manager.stop();
  process.exit();
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
