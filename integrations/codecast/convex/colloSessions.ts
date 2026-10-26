import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query, mutation } from './functions';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { ClientEvent } from './colloProtocol';
import { user, project, fail } from './colloAccess';

export async function indexMessage(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  userId: Id<'users'>,
  event: ClientEvent,
  seq: number,
) {
  if (event.kind !== 'agent.message') return;
  const existing = await ctx.db
    .query('collo_sessions')
    .withIndex('by_session', (q) =>
      q
        .eq('projectId', projectId)
        .eq('workspaceId', event.workspaceId)
        .eq('sessionId', event.payload.sessionId),
    )
    .unique();
  if (existing)
    await ctx.db.patch(existing._id, {
      firstSeq: Math.min(existing.firstSeq, seq),
      lastSeq: Math.max(existing.lastSeq, seq),
      messageCount: existing.messageCount + 1,
      updatedAt: Math.max(existing.updatedAt, event.occurredAt),
    });
  else
    await ctx.db.insert('collo_sessions', {
      projectId,
      workspaceId: event.workspaceId,
      sessionId: event.payload.sessionId,
      userId,
      firstSeq: seq,
      lastSeq: seq,
      messageCount: 1,
      updatedAt: event.occurredAt,
    });
}
// Bounded, repeatable migration for persisted events from the previous version.
// Concurrent ingestion marks its events in the same transaction, preventing double counting.
export const indexHistory = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    const head = await ctx.db
      .query('collo_heads')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique();
    if (!head) return { done: true, cursor: 0 };
    const rows = await ctx.db
      .query('collo_events')
      .withIndex('by_project_seq', (q) =>
        q.eq('projectId', args.projectId).gt('seq', head.sessionCursor ?? 0),
      )
      .take(20);
    for (const row of rows)
      if (row.event.kind === 'agent.message' && !row.sessionIndexed) {
        await indexMessage(ctx, row.projectId, row.userId, row.event, row.seq);
        await ctx.db.patch(row._id, { sessionIndexed: true });
      }
    const cursor = rows[rows.length - 1]?.seq ?? head.sessionCursor ?? 0;
    await ctx.db.patch(head._id, { sessionCursor: cursor });
    return { done: cursor >= head.seq, cursor };
  },
});
export const list = query({
  args: { projectId: v.id('projects'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    const page = await ctx.db
      .query('collo_sessions')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .paginate({
        ...args.paginationOpts,
        numItems: Math.max(1, Math.min(30, args.paginationOpts.numItems)),
      });
    const head = await ctx.db
      .query('collo_heads')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique();
    return { ...page, historyIndexed: !head || (head.sessionCursor ?? 0) >= head.seq };
  },
});
export const messages = query({
  args: {
    projectId: v.id('projects'),
    workspaceId: v.string(),
    sessionId: v.string(),
    after: v.number(),
    throughSeq: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    if (
      !Number.isSafeInteger(args.after) ||
      args.after < 0 ||
      (args.throughSeq !== undefined &&
        (!Number.isSafeInteger(args.throughSeq) || args.throughSeq < 0))
    )
      return fail(400, 'Invalid session cursor');
    const rows = await ctx.db
      .query('collo_events')
      .withIndex('by_session', (q) =>
        q
          .eq('projectId', args.projectId)
          .eq('workspaceId', args.workspaceId)
          .eq('event.kind', 'agent.message')
          .eq('event.payload.sessionId', args.sessionId)
          .gt('seq', args.after),
      )
      .take(21);
    const visible = rows.filter((r) => args.throughSeq === undefined || r.seq <= args.throughSeq);
    const page = visible.slice(0, 20);
    return {
      messages: page.map((r) => ({
        eventId: r.eventId,
        seq: r.seq,
        userId: r.userId,
        occurredAt: r.event.occurredAt,
        ...r.event.payload,
      })),
      cursor: page[page.length - 1]?.seq ?? args.after,
      hasMore: visible.length > 20,
    };
  },
});
