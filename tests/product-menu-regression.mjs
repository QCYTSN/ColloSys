// Serial acceptance against an already running formal app; never overlaps
// performance sampling. All mutations in these suites use isolated TEST data.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
const root =
  process.env.COLLOSYS_REGRESSION_ROOT || 'docs/product-ui/menu-motion/evidence/regression';
await fs.mkdir(root, { recursive: true });
const suites = [
  ['menus', ['tests/product-menu-acceptance.mjs', '--production']],
  ['native-menus', ['tests/product-menu-native.mjs']],
  ['login', ['tests/product-menu-auth-visual.mjs', '--production']],
  ['startup', ['tests/product-identity-startup.mjs']],
  ['auth-races', ['tests/product-identity-auth-races.mjs']],
  ['security', ['tests/product-identity-security.mjs']],
  ['provider-policy', ['.local/menu-provider-policy.mjs']],
  ['identity', ['tests/product-identity-flows.mjs', '--production']],
  ['native', ['tests/product-identity-native.mjs']],
  ['continuity', ['tests/product-ui-craft.mjs']],
  ['storage', ['tests/product-ui-craft-storage-race.mjs']],
  ['access', ['tests/product-ui-refinement-access.mjs']],
  ['auth-continuity', ['tests/product-auth-continuity.mjs']],
];
const selected = process.argv
  .find((v) => v.startsWith('--suites='))
  ?.slice(9)
  .split(',');
let results = [];
try {
  results = JSON.parse(await fs.readFile(root + '/suite-results.json', 'utf8'));
} catch {}
for (const [name, args] of suites.filter(([name]) => !selected || selected.includes(name))) {
  console.log('START', name);
  if (name === 'provider-policy')
    await build({
      entryPoints: ['tests/product-identity-provider-policy.mjs'],
      outfile: '.local/menu-provider-policy.mjs',
      bundle: true,
      platform: 'node',
      format: 'esm',
      banner: {
        js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
    });
  const output = [],
    started = new Date().toISOString();
  const child = spawn(process.execPath, args, {
    env: { ...process.env, COLLOSYS_UI_EVIDENCE_DIR: `${root}/${name}` },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (data) => output.push(data.toString()));
  child.stderr.on('data', (data) => output.push(data.toString()));
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  await fs.writeFile(
    `${root}/${name}.log`,
    output
      .join('')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED TEST SESSION]')
      .replace(/(authorization: Bearer )[^\s'"\\]+/gi, '$1[REDACTED]'),
  );
  results = results.filter((r) => r.name !== name);
  results.push({ name, args, started, finished: new Date().toISOString(), exitCode: code });
  await fs.writeFile(root + '/suite-results.json', JSON.stringify(results, null, 2));
  console.log('END', name, code);
  if (code !== 0) {
    process.exitCode = 1;
    break;
  }
}
