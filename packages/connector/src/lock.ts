import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { assertNoLinks } from './checked-file';

export async function acquireStateLock(state: string): Promise<() => Promise<void>> {
  const file = path.join(state, 'connector.lock'),
    databaseFile = path.join(state, 'connector-lock.sqlite'),
    nonce = randomUUID(),
    record = { pid: process.pid, nonce };
  await assertNoLinks(state);
  for (const candidate of [file, databaseFile]) {
    try {
      const stat = await fs.lstat(candidate);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('State lock must be a regular file');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  // The PID record is useful for diagnostics and for respecting older writers.
  // Its read/unlink sequence alone is not a lock: two restarts can both read a
  // dead owner, then one can delete the other's newly acquired record. SQLite's
  // OS-backed exclusive lock serializes recovery and is released by a crash.
  let guard: DatabaseSync | undefined;
  try {
    guard = new DatabaseSync(databaseFile);
    guard.exec('BEGIN EXCLUSIVE');
  } catch (e) {
    guard?.close();
    if ((e as { errcode?: number }).errcode === 5)
      throw new Error('A connector already owns this state');
    throw e;
  }
  let released = false;
  const releaseGuard = () => {
    if (released) return;
    released = true;
    try {
      guard!.exec('ROLLBACK');
    } finally {
      guard!.close();
    }
  };
  try {
    let exists = true;
    try {
      await fs.access(file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      exists = false;
    }
    if (exists) {
      let old: { pid: number };
      try {
        old = JSON.parse(await fs.readFile(file, 'utf8'));
      } catch {
        throw new Error(
          'Connector lock is unreadable; inspect the state directory before starting another process',
        );
      }
      if (!Number.isInteger(old.pid) || old.pid < 1) throw new Error('Connector lock is invalid');
      let alive = true;
      try {
        process.kill(old.pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false;
      }
      if (alive) throw new Error(`A connector already owns this state (process ${old.pid})`);
      await fs.unlink(file);
    }
    await fs.writeFile(file, JSON.stringify(record), { flag: 'wx', mode: 0o600 });
  } catch (e) {
    releaseGuard();
    throw e;
  }
  return async () => {
    if (released) return;
    try {
      const current = JSON.parse(await fs.readFile(file, 'utf8'));
      if (current.nonce === nonce) await fs.unlink(file);
    } catch {
    } finally {
      releaseGuard();
    }
  };
}
