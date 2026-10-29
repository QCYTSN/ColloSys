import { v } from 'convex/values';
import { mutation, query } from './functions';
import { user, project } from './colloAccess';
import type { DirectorySummary } from './colloContracts';

// Keep stable IDs and the original protocol-v1 index: event references, grants,
// backups and old connector outboxes all continue to identify the same root.
// The new product API never confuses this directory with a team audience.
export function directoryFields(row: {
  workspaceId: string;
  directoryVersion?: 1;
  directoryId?: string;
}) {
  if (row.directoryVersion === 1 && row.directoryId !== row.workspaceId)
    throw new Error('Directory identity mismatch');
  return { directoryVersion: 1 as const, directoryId: row.workspaceId };
}
export const list = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args): Promise<DirectorySummary[]> => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    const rows = await ctx.db
      .query('collo_workspaces')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect();
    return rows.map((row) => ({
      version: 1,
      directoryId: directoryFields(row).directoryId,
      projectId: row.projectId,
      ownerId: row.userId,
      label: row.label,
      ownedByViewer: row.userId === viewer._id,
    }));
  },
});
export const upgrade = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    const rows = await ctx.db
      .query('collo_workspaces')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect();
    let migrated = 0;
    for (const row of rows) {
      const fields = directoryFields(row);
      if (row.directoryVersion === 1) continue;
      await ctx.db.patch(row._id, fields);
      migrated++;
    }
    return { version: 1, migrated };
  },
});
