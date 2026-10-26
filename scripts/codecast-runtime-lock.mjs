import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = path.join(root, '.local/codecast-app/launcher.lock');
export async function assertNotRunning() {
  try {
    const { pid } = JSON.parse(await readFile(lock, 'utf8'));
    if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid application lock');
    if (pid === process.pid) return;
    try {
      process.kill(pid, 0);
    } catch (e) {
      if (e.code === 'ESRCH') return;
      throw e;
    }
    throw new Error('ColloSys is already running. Stop it before rebuilding its source.');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
export async function acquireApplicationLock() {
  await mkdir(path.dirname(lock), { recursive: true });
  try {
    await writeFile(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    await assertNotRunning();
    await unlink(lock);
    await writeFile(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 });
  }
  process.once('exit', () => {
    try {
      if (JSON.parse(readFileSync(lock, 'utf8')).pid === process.pid) unlinkSync(lock);
    } catch {}
  });
}
