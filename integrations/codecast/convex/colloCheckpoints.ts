import { v } from 'convex/values';
import { internalMutation, mutation } from './functions';
import { device, project, user } from './colloAccess';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

// Upgrade pre-path-index receipts in bounded transactions. No new event can be
// acknowledged until every old part has been checked against the same path index.
export async function verifyPaths(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  workspaceId: string,
  checkpointId: string,
) {
  const summary = await ctx.db
    .query('collo_checkpoints')
    .withIndex('by_checkpoint', (q) =>
      q.eq('projectId', projectId).eq('workspaceId', workspaceId).eq('checkpointId', checkpointId),
    )
    .unique();
  if (!summary || summary.pathsVerified) return { ready: true, valid: true };
  if (summary.pathError) return { ready: true, valid: false };
  const rows = await ctx.db
    .query('collo_events')
    .withIndex('by_checkpoint_part', (q) =>
      q
        .eq('projectId', projectId)
        .eq('workspaceId', workspaceId)
        .eq('event.kind', 'checkpoint')
        .eq('event.payload.checkpointId', checkpointId)
        .gt('event.payload.part', summary.pathsCursor ?? 0),
    )
    .take(6);
  for (const row of rows.slice(0, 5))
    for (const file of row.event.payload.files) {
      const key = file.path.toLowerCase();
      const old = await ctx.db
        .query('collo_checkpoint_paths')
        .withIndex('by_path', (q) =>
          q
            .eq('projectId', projectId)
            .eq('workspaceId', workspaceId)
            .eq('checkpointId', checkpointId)
            .eq('path', key),
        )
        .first();
      if (old) {
        await ctx.db.patch(summary._id, { pathError: true });
        return { ready: true, valid: false };
      }
      await ctx.db.insert('collo_checkpoint_paths', {
        projectId,
        workspaceId,
        checkpointId,
        path: key,
      });
    }
  const ready = rows.length <= 5;
  await ctx.db.patch(summary._id, {
    pathsCursor: rows[Math.min(rows.length, 5) - 1]?.event.payload.part ?? summary.pathsCursor ?? 0,
    pathsVerified: ready,
  });
  return { ready, valid: true };
}
export const prepare = internalMutation({
  args: { projectId: v.id('projects'), hash: v.string(), checkpointId: v.string() },
  handler: async (ctx, args) => {
    const grant = await device(ctx, args.hash, args.projectId);
    return verifyPaths(ctx, args.projectId, grant.workspaceId, args.checkpointId);
  },
});
export const verify = mutation({
  args: { projectId: v.id('projects'), workspaceId: v.string(), checkpointId: v.string() },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    return verifyPaths(ctx, args.projectId, args.workspaceId, args.checkpointId);
  },
});
