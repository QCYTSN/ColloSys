import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './functions';
import { internal } from './_generated/api';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { device, fail, project, user } from './colloAccess';
import { idSchema } from './colloProtocol';

export const BACKUP_LIMIT = 24 * 1024 * 1024;
export const BACKUP_CHUNK = 4 * 1024 * 1024;
export const BACKUP_TYPE = 'application/vnd.collosys.encrypted-checkpoint';
const DEFAULT_POLICY = { maxBytes: 256 * 1024 * 1024, maxCount: 100 };
const scopeArgs = { projectId: v.id('projects'), hash: v.optional(v.string()) };
// Devices may recover their owner's backups into another authorized directory,
// but may never read a teammate's ciphertext or claim a teammate's checkpoint.
async function principal(ctx: QueryCtx, args: { projectId: Id<'projects'>; hash?: string }) {
  if (args.hash) return device(ctx, args.hash, args.projectId);
  const viewer = await user(ctx);
  await project(ctx, viewer._id, args.projectId);
  return { userId: viewer._id, workspaceId: undefined };
}
async function record(
  ctx: QueryCtx,
  args: { projectId: Id<'projects'>; hash?: string; id: string },
) {
  const viewer = await principal(ctx, args);
  const row = await ctx.db
    .query('collo_backups')
    .withIndex('by_backup', (q) => q.eq('projectId', args.projectId).eq('backupId', args.id))
    .unique();
  if (!row || row.userId !== viewer.userId) return fail(404, 'Backup not found');
  return row;
}
const policyFor = async (ctx: QueryCtx, projectId: Id<'projects'>) =>
  (await ctx.db
    .query('collo_backup_policies')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .unique()) ?? DEFAULT_POLICY;
const active = (row: { status: string; expiresAt: number }) =>
  row.status === 'complete' || row.expiresAt > Date.now();
async function listing(ctx: QueryCtx, args: { projectId: Id<'projects'>; hash?: string }) {
  const viewer = await principal(ctx, args);
  const rows = await ctx.db
    .query('collo_backups')
    .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
    .collect();
  const policy = await policyFor(ctx, args.projectId);
  const charged = rows.filter(active);
  return {
    location: 'local-convex-storage',
    remote: false,
    quota: {
      maxBytes: policy.maxBytes,
      maxCount: policy.maxCount,
      usedBytes: charged.reduce((n, r) => n + r.size, 0),
      usedCount: charged.length,
    },
    backups: rows
      .filter((r) => r.userId === viewer.userId && active(r))
      .map((r) => ({
        id: r.backupId,
        workspaceId: r.workspaceId,
        checkpoint_id: r.checkpointId,
        size: r.size,
        digest: r.digest,
        status: r.status,
        created_at: r._creationTime,
        expiresAt: r.status === 'pending' ? r.expiresAt : null,
      })),
  };
}
export const list = query({ args: { projectId: v.id('projects') }, handler: listing });
export const listInternal = internalQuery({ args: scopeArgs, handler: listing });
export const lookup = internalQuery({ args: { ...scopeArgs, id: v.string() }, handler: record });
export const reserve = internalMutation({
  args: {
    ...scopeArgs,
    id: v.string(),
    checkpointId: v.string(),
    size: v.number(),
    digest: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await principal(ctx, args);
    if (!viewer.workspaceId)
      return fail(403, 'Create backups through the authorized local directory');
    if (
      !idSchema.safeParse(args.id).success ||
      !idSchema.safeParse(args.checkpointId).success ||
      !Number.isSafeInteger(args.size) ||
      args.size < 53 ||
      args.size > BACKUP_LIMIT ||
      !/^[a-f0-9]{64}$/.test(args.digest)
    )
      return fail(400, 'Invalid encrypted backup manifest');
    const checkpoint = await ctx.db
      .query('collo_checkpoints')
      .withIndex('by_checkpoint', (q) =>
        q
          .eq('projectId', args.projectId)
          .eq('workspaceId', viewer.workspaceId!)
          .eq('checkpointId', args.checkpointId),
      )
      .unique();
    if (
      !checkpoint?.verifiedFromStart ||
      !checkpoint.pathsVerified ||
      checkpoint.pathError ||
      checkpoint.receivedParts !== checkpoint.totalParts
    )
      return fail(409, 'Sync the complete checkpoint before backing it up');
    const rows = await ctx.db
      .query('collo_backups')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect();
    const prior = rows.find((r) => r.backupId === args.id);
    if (prior) {
      if (
        prior.userId !== viewer.userId ||
        prior.workspaceId !== viewer.workspaceId ||
        prior.checkpointId !== args.checkpointId ||
        prior.size !== args.size ||
        prior.digest !== args.digest
      )
        return fail(409, 'Backup ID already has different contents');
      if (active(prior)) return { id: args.id, status: prior.status };
      await ctx.db.delete(prior._id);
    }
    const policy = await policyFor(ctx, args.projectId),
      charged = rows.filter(active);
    if (
      charged.length >= policy.maxCount ||
      charged.reduce((n, r) => n + r.size, 0) + args.size > policy.maxBytes
    )
      return fail(
        409,
        'Project backup quota exceeded; delete an unneeded backup or adjust the quota',
      );
    const id = await ctx.db.insert('collo_backups', {
      backupId: args.id,
      projectId: args.projectId,
      workspaceId: viewer.workspaceId,
      userId: viewer.userId,
      checkpointId: args.checkpointId,
      size: args.size,
      digest: args.digest,
      status: 'pending',
      expiresAt: Date.now() + 3600_000,
    });
    await ctx.scheduler.runAfter(3600_000, (internal as any).colloBackups.expire, { id });
    return { id: args.id, status: 'pending' };
  },
});
export const commit = internalMutation({
  args: {
    ...scopeArgs,
    id: v.string(),
    reservation: v.id('collo_backups'),
    storageIds: v.array(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    // Recheck authorization and the reservation after body streaming and storage.
    const row = await record(ctx, args);
    if (row._id !== args.reservation || !active(row))
      return fail(409, 'Backup reservation expired or was replaced');
    if (row.status === 'complete') {
      for (const storageId of args.storageIds) await ctx.storage.delete(storageId);
      return { id: args.id, verified: true, location: 'local-convex-storage', remote: false };
    }
    if (
      args.storageIds.length !== Math.ceil(row.size / BACKUP_CHUNK) ||
      new Set(args.storageIds).size !== args.storageIds.length
    )
      return fail(409, 'Invalid backup chunk manifest');
    let size = 0;
    for (const [index, storageId] of args.storageIds.entries()) {
      const metadata = await ctx.db.system.get(storageId);
      if (
        !metadata ||
        metadata.size !== Math.min(BACKUP_CHUNK, row.size - index * BACKUP_CHUNK) ||
        metadata.contentType !== BACKUP_TYPE
      )
        return fail(409, 'Stored backup metadata differs from its reservation');
      size += metadata.size;
      await ctx.db.insert('collo_backup_chunks', { backupId: row._id, storageId });
    }
    if (size !== row.size) return fail(409, 'Incomplete backup chunk manifest');
    await ctx.db.patch(row._id, { status: 'complete', storageIds: args.storageIds });
    return { id: args.id, verified: true, location: 'local-convex-storage', remote: false };
  },
});
export const remove = internalMutation({
  args: { ...scopeArgs, id: v.string() },
  handler: async (ctx, args) => {
    const row = await record(ctx, args);
    for (const storageId of row.storageIds ?? []) await ctx.storage.delete(storageId);
    for (const chunk of await ctx.db
      .query('collo_backup_chunks')
      .withIndex('by_backup', (q) => q.eq('backupId', row._id))
      .collect())
      await ctx.db.delete(chunk._id);
    await ctx.db.delete(row._id);
    return { ok: true };
  },
});
export const expire = internalMutation({
  args: { id: v.id('collo_backups') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row?.status === 'pending' && row.expiresAt <= Date.now()) await ctx.db.delete(row._id);
  },
});
export const setQuota = mutation({
  args: { projectId: v.id('projects'), maxBytes: v.number(), maxCount: v.number() },
  handler: async (ctx, args) => {
    const viewer = await user(ctx),
      p = await project(ctx, viewer._id, args.projectId);
    if (p.user_id !== viewer._id)
      return fail(403, 'Only the project owner can change backup quotas');
    if (
      !Number.isSafeInteger(args.maxBytes) ||
      args.maxBytes < BACKUP_LIMIT ||
      args.maxBytes > 2 * 1024 ** 3 ||
      !Number.isSafeInteger(args.maxCount) ||
      args.maxCount < 1 ||
      args.maxCount > 100
    )
      return fail(400, 'Quota must allow 1–100 backups and 24–2048 MiB');
    const current = await listing(ctx, args);
    if (current.quota.usedBytes > args.maxBytes || current.quota.usedCount > args.maxCount)
      return fail(409, 'Quota is smaller than currently reserved storage');
    const existing = await ctx.db
      .query('collo_backup_policies')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, args);
    else await ctx.db.insert('collo_backup_policies', args);
    return { maxBytes: args.maxBytes, maxCount: args.maxCount };
  },
});
// Recover orphaned bytes after a process crash between storage.store and commit.
// Never touch original Codecast files or expose unrevocable storage URLs.
export const collectOrphans = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.system
      .query('_storage')
      .paginate({ numItems: 50, cursor: args.cursor ?? null });
    for (const blob of page.page) {
      if (blob.contentType !== BACKUP_TYPE || blob._creationTime > Date.now() - 2 * 3600_000)
        continue;
      const attached = await ctx.db
        .query('collo_backup_chunks')
        .withIndex('by_storage', (q) => q.eq('storageId', blob._id))
        .first();
      if (!attached) await ctx.storage.delete(blob._id);
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, (internal as any).colloBackups.collectOrphans, {
        cursor: page.continueCursor,
      });
  },
});
