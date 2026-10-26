import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Connector, configSchema } from '../packages/connector/src/connector';
import { assertRoot, within } from '../packages/connector/src/files';
import { assertPortsFree } from './process';
const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    state: { type: 'string' },
    user: { type: 'string', default: 'alice' },
    port: { type: 'string', default: '8793' },
    backend: { type: 'string', default: 'http://127.0.0.1:8787' },
    label: { type: 'string' },
    'codex-log': { type: 'string' },
  },
});
if (!values.root)
  throw new Error(
    'Specify your authorized project directory: npm run connect -- --root "D:\\path\\project" --user alice',
  );
if (!['alice', 'bob'].includes(values.user!))
  throw new Error('This local development bootstrap supports alice or bob');
const root = await assertRoot(path.resolve(values.root)),
  workspaceId = `workspace-${randomUUID()}`;
let state = path.resolve(values.state ?? path.join(os.homedir(), '.collosys', workspaceId));
if (within(root, state) || within(state, root))
  throw new Error('State must be outside the project directory');
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Choose a port between 1024 and 65535');
await assertPortsFree([port]);
await fs.mkdir(state, { recursive: true });
state = await fs.realpath(state);
if (within(root, state) || within(state, root))
  throw new Error('State resolves inside the project directory');
const response = await fetch(values.backend + '/api/dev/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user: values.user }),
});
if (!response.ok) throw new Error('Start the local backend with npm run dev first');
const { token } = (await response.json()) as { token: string };
const config = configSchema.parse({
  root,
  state,
  backend: values.backend,
  projectId: 'demo-project',
  workspaceId,
  userId: values.user,
  label: values.label ?? path.basename(root),
  token,
  port,
  ...(values['codex-log'] ? { codexLog: path.resolve(values['codex-log']) } : {}),
});
const configFile = path.join(state, 'config.json');
await fs.writeFile(configFile, JSON.stringify(config, null, 2), { mode: 0o600, flag: 'wx' });
const connector = new Connector(config);
await connector.start();
console.log(
  `Authorized project: ${root}\nLocal connector: http://127.0.0.1:${config.port}\nConfig for restart: ${configFile}\nSelect this connector URL in the browser's connection settings. No remote snapshot backup is enabled.`,
);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void connector.stop().finally(() => process.exit(0));
  });
