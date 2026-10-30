import { spawn } from 'node:child_process';
const mode = process.argv.includes('--development') ? 'development' : 'production';
const commands = [
  ['tests/product-menu-performance.mjs', '--phase=after', `--mode=${mode}`],
  ...[1, 2, 3].map(round => ['tests/product-menu-heavy-performance.mjs', '--phase=after', `--mode=${mode}`, `--round=${round}`]),
  ['tests/product-menu-performance-summary.mjs'],
];
for (const args of commands) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  if (code !== 0) { process.exitCode = 1; break; }
}
