import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Snapshots, Preview } from './snapshots';
import type { LocalCheckpoint } from './store';
import { git, SNAPSHOT_IDENTITY } from './vendor/codecast/git';
import { safePath } from './files';
export const retentionSchema = z
  .object({
    maxCheckpoints: z.number().int().min(2).max(10000),
    maxAgeDays: z.number().int().min(1).max(3650),
    maxDiskMiB: z.number().int().min(64).max(102400),
  })
  .strict();
export const defaultRetention = { maxCheckpoints: 200, maxAgeDays: 30, maxDiskMiB: 2048 };
export async function diskBytes(directory: string): Promise<number> {
  let total = 0;
  for (const e of await fs.readdir(directory, { withFileTypes: true })) {
    if (e.isSymbolicLink()) throw new Error('Managed storage contains a link');
    const full = path.join(directory, e.name);
    total += e.isDirectory() ? await diskBytes(full) : (await fs.lstat(full)).size;
  }
  return total;
}
export function retentionPlan(snapshots: Snapshots) {
  const store = snapshots.store,
    policy = retentionSchema.parse(store.setting('retention', defaultRetention));
  const rows = (
    store.db.prepare('SELECT data FROM checkpoints ORDER BY created_at DESC,rowid DESC').all() as {
      data: string;
    }[]
  ).map((r) => JSON.parse(r.data) as LocalCheckpoint);
  const protectedIds = new Set<string>(rows.slice(0, 2).map((cp) => cp.id));
  for (const row of store.db.prepare('SELECT event FROM outbox').all() as { event: string }[]) {
    const event = JSON.parse(row.event);
    if (event.kind === 'checkpoint') protectedIds.add(event.payload.checkpointId);
  }
  for (const row of store.db.prepare('SELECT data FROM previews').all() as { data: string }[]) {
    const preview = JSON.parse(row.data) as Preview;
    if (preview.expiresAt > Date.now()) protectedIds.add(preview.checkpointId);
  }
  for (const id of store.setting<string[]>('pinnedCheckpoints', [])) protectedIds.add(id);
  const remove = rows.filter(
    (cp, i) =>
      !protectedIds.has(cp.id) &&
      (i >= policy.maxCheckpoints || cp.createdAt < Date.now() - policy.maxAgeDays * 86400000),
  );
  return {
    policy,
    remove: remove.map((cp) => cp.id),
    protected: Array.from(protectedIds),
    count: rows.length,
  };
}
export async function cleanRetention(snapshots: Snapshots) {
  const plan = retentionPlan(snapshots),
    store = snapshots.store;
  for (const row of store.db.prepare('SELECT id,data FROM previews').all() as {
    id: string;
    data: string;
  }[]) {
    const preview = JSON.parse(row.data) as Preview;
    if (preview.expiresAt > Date.now()) continue;
    const dir = await safePath(snapshots.previews, row.id);
    await fs.rm(dir, { recursive: true, force: true });
    store.db.prepare('DELETE FROM previews WHERE id=?').run(row.id);
  }
  for (const recovery of store.recoveries()) {
    if (recovery.status === 'ready' && recovery.expiresAt > Date.now()) continue;
    const dir = await safePath(snapshots.recoveries, recovery.id);
    await fs.rm(dir, { recursive: true, force: true });
    store.db.prepare('DELETE FROM recoveries WHERE id=?').run(recovery.id);
  }
  // A crash can leave a pinned Git snapshot whose SQLite insert never committed.
  // Enumerate only our managed checkpoint namespace, never the user's repository.
  const prefix = 'refs/collosys/checkpoints/';
  const refs = (await git(snapshots.mirror, ['for-each-ref', '--format=%(refname)', prefix]))
    .split('\n')
    .filter(Boolean);
  const orphans = refs
    .filter((ref) => !store.get(ref.slice(prefix.length)))
    .map((ref) => ref.slice(prefix.length));
  store.transaction(() => {
    for (const id of [...plan.remove, ...orphans]) {
      store.db.prepare('INSERT OR IGNORE INTO checkpoint_deletions VALUES(?)').run(id);
      store.db.prepare('DELETE FROM checkpoints WHERE id=?').run(id);
    }
    if (plan.remove.length || orphans.length) store.set('retentionGcPending', true);
  });
  for (const { id } of store.db.prepare('SELECT id FROM checkpoint_deletions').all() as {
    id: string;
  }[]) {
    if (store.get(id)) throw new Error('Checkpoint deletion conflicts with retained metadata');
    await git(snapshots.mirror, ['update-ref', '-d', prefix + id]);
    store.db.prepare('DELETE FROM checkpoint_deletions WHERE id=?').run(id);
  }
  if (store.setting('retentionGcPending', false)) {
    // Cut upstream parent chains so deleted snapshots do not survive through retained children.
    // Each replacement ref exists before its durable metadata changes, keeping crash recovery safe.
    const rows = store.db.prepare('SELECT data FROM checkpoints').all() as { data: string }[];
    for (const row of rows) {
      const cp = JSON.parse(row.data) as LocalCheckpoint;
      // If a previous rebase stopped between updating the ref and SQLite,
      // pin SQLite's still-authoritative commit before retrying the operation.
      await git(snapshots.mirror, ['update-ref', prefix + cp.id, cp.sha]);
      const tree = await git(snapshots.mirror, ['rev-parse', `${cp.sha}^{tree}`]);
      const sha = await git(
        snapshots.mirror,
        ['commit-tree', tree, '-m', `Retained checkpoint ${cp.id}`],
        SNAPSHOT_IDENTITY,
      );
      await git(snapshots.mirror, ['update-ref', `refs/collosys/checkpoints/${cp.id}`, sha]);
      cp.sha = sha;
      store.db.prepare('UPDATE checkpoints SET data=? WHERE id=?').run(JSON.stringify(cp), cp.id);
    }
    await fs
      .unlink(path.join(snapshots.mirror, '.git', 'codecast', 'wip.head'))
      .catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT') throw e;
      });
    await git(snapshots.mirror, ['reflog', 'expire', '--expire=now', '--all']);
    await git(snapshots.mirror, ['gc', '--prune=now']);
    store.db.exec(
      'DELETE FROM delivered WHERE rowid NOT IN (SELECT rowid FROM delivered ORDER BY rowid DESC LIMIT 1000); PRAGMA wal_checkpoint(TRUNCATE); VACUUM;',
    );
    store.set('retentionGcPending', false);
  }
  return { ...plan, removed: plan.remove.length, bytes: await diskBytes(snapshots.state) };
}
