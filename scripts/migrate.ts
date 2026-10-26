import { runTool } from './process';
const persistence = process.env.COLLOSYS_PERSIST ?? '.local/cloudflare';
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
