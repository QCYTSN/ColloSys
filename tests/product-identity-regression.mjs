import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root = 'docs/product-ui/identity-motion/evidence/regression';
const suites = [
  ['project-appearance', 'tests/product-identity-flows.mjs', '--production'],
  ['login-visual', 'tests/product-identity-visual.mjs', '--production'],
  ['native-window', 'tests/product-identity-native.mjs'],
  ['real-integration', 'tests/codecast-integration.mjs'],
  ['backend-recovery', 'tests/codecast-backend-completion.mjs'],
  ['continuity', 'tests/product-ui-craft.mjs'],
  ['detail', 'tests/product-ui-craft-detail.mjs'],
  ['handoffs', 'tests/product-ui-completion-handoffs.mjs'],
  ['storage-race', 'tests/product-ui-craft-storage-race.mjs'],
  ['access', 'tests/product-ui-refinement-access.mjs'],
  ['durable-auth', 'tests/product-auth-storage.mjs'],
  ['startup', 'tests/product-identity-startup.mjs'],
  ['auth-races', 'tests/product-identity-auth-races.mjs'],
  ['account-cycles', 'tests/product-auth-continuity.mjs'],
];
const only = process.argv.slice(2), results = [];
await fs.mkdir(root, { recursive: true });
const readyBy = Date.now() + 180000;
for (;;) {
  try {
    const [web, manager] = await Promise.all([
      fetch('http://127.0.0.1:3407/collo-build.json', { signal: AbortSignal.timeout(1000) }),
      fetch('http://127.0.0.1:3411/health', { signal: AbortSignal.timeout(1000) }),
    ]);
    if (web.ok && manager.ok) break;
  } catch {}
  if (Date.now() >= readyBy) throw new Error('Product services did not become ready; no regression suites started');
  await new Promise(resolve => setTimeout(resolve, 500));
}
for (const [name, ...args] of suites) {
  if (only.length && !only.includes(name)) continue;
  const evidence = path.join(root, name); await fs.mkdir(evidence, { recursive: true });
  const log = await fs.open(`.local/identity-regression-${name}.log`, 'w'), started = new Date().toISOString();
  console.log('START', name);
  const child = spawn(process.execPath, args, { windowsHide: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, COLLOSYS_UI_EVIDENCE_DIR: evidence } });
  const exit = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }); await log.close();
  results.push({ name, command: `node ${args.join(' ')}`, started, finished: new Date().toISOString(), exit });
  await fs.writeFile(`${root}/${only.length ? only.join('-') : 'all'}.json`, JSON.stringify(results, null, 2));
  console.log(exit === 0 ? 'PASS' : 'FAIL', name);
  if (exit !== 0) { process.exitCode = 1; break; }
}
