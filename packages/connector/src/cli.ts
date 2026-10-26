import fs from 'node:fs/promises';
import { Connector, configSchema } from './connector';
const configPath = process.argv[2];
if (!configPath) {
  console.error('Usage: npm run connector -- path/to/connector.json');
  process.exit(1);
}
const config = configSchema.parse(JSON.parse(await fs.readFile(configPath, 'utf8')));
const connector = new Connector(config);
await connector.start();
console.log(`Connector ready: ${config.label} · http://127.0.0.1:${config.port} · ${config.root}`);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void connector.stop().finally(() => process.exit(0));
  });
