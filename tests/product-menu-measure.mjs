import { spawn } from 'node:child_process';
const mode = process.argv.includes('--development') ? 'development' : 'production';
const phase = process.argv.find((a) => a.startsWith('--phase='))?.slice(8) || 'after';
const commands = [
  ['tests/product-menu-performance.mjs', `--phase=${phase}`, `--mode=${mode}`],
  ...[1, 2, 3].map((round) => [
    'tests/product-menu-heavy-performance.mjs',
    `--phase=${phase}`,
    `--mode=${mode}`,
    `--round=${round}`,
  ]),
  ['tests/product-menu-performance-summary.mjs'],
];
for (const args of commands) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (code !== 0) {
    process.exitCode = 1;
    break;
  }
}
