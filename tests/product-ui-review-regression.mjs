// Serial browser runs: selected workspace is account-backed, so parallel use
// of the same TEST account would change another test's active project context.
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
const root = 'docs/product-ui/review-fixes/evidence/regression';
await fs.mkdir(root, { recursive: true });
const suites = [
  ['buttons', 'tests/product-ui-review-buttons.mjs'],
  ['pending', 'tests/product-ui-review-pending.mjs'],
  ['storage', 'tests/product-ui-review-storage.mjs'],
  ['storage-isolated', 'tests/product-ui-review-storage-state.mjs'],
  ['detector', 'tests/product-ui-review-detector.mjs'],
  ['counterexamples', 'tests/product-ui-overflow-counterexamples.mjs'],
  ['continuity', 'tests/product-ui-craft.mjs'],
  ['detail', 'tests/product-ui-craft-detail.mjs'],
  ['late-reply', 'tests/product-ui-craft-revocation.mjs'],
  ['storage-review', 'tests/product-ui-craft-storage-race.mjs'],
  ['handoffs', 'tests/product-ui-completion-handoffs.mjs'],
  ['surfaces', 'tests/product-ui-completion-surfaces.mjs', '--skip-static-boot'],
  ['refinement', 'tests/product-ui-refinement.mjs'],
  ['completion', 'tests/product-ui-completion.mjs'],
  ['native-surfaces', 'tests/product-ui-completion-surfaces.mjs', '--native'],
  ['native-completion', 'tests/product-ui-completion.mjs', '--native'],
  ['access', 'tests/product-ui-refinement-access.mjs'],
  ['auth-continuity', 'tests/product-auth-continuity.mjs'],
  ['auth-storage', 'tests/product-auth-storage.mjs'],
];
const only = process.argv.slice(2);
const results = [];
// Some retained suites write their result directly and expect the caller to
// prepare its evidence directory. Do so without changing their assertions.
for (const [name] of suites) {
  if (!only.length || only.includes(name)) await fs.mkdir(`${root}/${name}`, { recursive: true });
}
for (const [name, ...args] of suites) {
  if (only.length && !only.includes(name)) continue;
  const log = await fs.open(`.local/review-regression-${name}.log`, 'w');
  const started = new Date().toISOString();
  console.log('START', name);
  const child = spawn(process.execPath, args, {
    stdio: ['ignore', log.fd, log.fd],
    windowsHide: true,
    env: { ...process.env, COLLOSYS_UI_EVIDENCE_DIR: `${root}/${name}` },
  });
  const exit = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  await log.close();
  const result = {
    name,
    command: `node ${args.join(' ')}`,
    started,
    finished: new Date().toISOString(),
    exit,
  };
  results.push(result);
  console.log(exit === 0 ? 'PASS' : 'FAIL', name);
  await fs.writeFile(
    `${root}/run-${only.length ? only.join('-') : 'all'}.json`,
    JSON.stringify(results, null, 2),
  );
  if (exit !== 0) {
    process.exitCode = 1;
    break;
  }
}
