import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { mutation, query } from './functions';
import { user, project, fail } from './colloAccess';
import { canAccessTask } from './lib/access';
import { insertTaskComment } from './tasks';
import { idSchema, redact } from './colloProtocol';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

async function taskInProject(
  ctx: QueryCtx,
  taskId: Id<'tasks'>,
  projectId: Id<'projects'>,
  viewers: Id<'users'>[],
) {
  const task = await ctx.db.get(taskId),
    p = await ctx.db.get(projectId);
  if (!task || !p || task.project_id !== projectId || task.workspace !== p.workspace)
    return fail(409, 'Handoff task must belong to the same project and visibility scope');
  for (const viewer of viewers)
    if (!(await canAccessTask(ctx, viewer, task))) return fail(403, 'Task access denied');
  return task;
}
export const send = mutation({
  args: {
    projectId: v.id('projects'),
    requestId: v.string(),
    recipient: v.id('users'),
    title: v.string(),
    context: v.string(),
    nextSteps: v.string(),
    source: v.optional(v.object({ workspaceId: v.string(), sessionId: v.string() })),
    checkpoint: v.optional(v.object({ workspaceId: v.string(), checkpointId: v.string() })),
    taskId: v.optional(v.id('tasks')),
  },
  handler: async (ctx, args) => {
    const sender = await user(ctx);
    await project(ctx, sender._id, args.projectId);
    if (sender._id === args.recipient || !(await ctx.db.get(args.recipient)))
      return fail(400, 'Choose another project member');
    await project(ctx, args.recipient, args.projectId);
    if (
      !idSchema.safeParse(args.requestId).success ||
      !args.title.trim() ||
      args.title.length > 160 ||
      !args.context.trim() ||
      args.context.length > 12000 ||
      args.nextSteps.length > 8000
    )
      return fail(400, 'Invalid handoff content');
    const request = JSON.stringify({
      recipient: args.recipient,
      title: args.title,
      context: args.context,
      nextSteps: args.nextSteps,
      source: args.source ?? null,
      checkpoint: args.checkpoint ?? null,
      taskId: args.taskId ?? null,
    });
    const previous = await ctx.db
      .query('collo_handoffs')
      .withIndex('by_request', (q) =>
        q.eq('projectId', args.projectId).eq('sender', sender._id).eq('requestId', args.requestId),
      )
      .unique();
    if (previous) {
      if (previous.request !== redact(request))
        return fail(409, 'Handoff request ID already has different contents');
      return { id: previous._id, revision: previous.revision, status: previous.status };
    }
    let source;
    if (args.source) {
      const session = await ctx.db
        .query('collo_events')
        .withIndex('by_session', (q) =>
          q
            .eq('projectId', args.projectId)
            .eq('workspaceId', args.source!.workspaceId)
            .eq('event.kind', 'agent.message')
            .eq('event.payload.sessionId', args.source!.sessionId),
        )
        .order('desc')
        .first();
      if (!session) return fail(404, 'Captured session not found in this project');
      source = { ...args.source, throughSeq: session.seq };
    }
    if (args.checkpoint) {
      const cp = await ctx.db
        .query('collo_checkpoints')
        .withIndex('by_checkpoint', (q) =>
          q
            .eq('projectId', args.projectId)
            .eq('workspaceId', args.checkpoint!.workspaceId)
            .eq('checkpointId', args.checkpoint!.checkpointId),
        )
        .unique();
      if (
        !cp?.verifiedFromStart ||
        !cp.pathsVerified ||
        cp.pathError ||
        cp.receivedParts !== cp.totalParts ||
        cp.receivedFiles !== cp.totalFiles
      )
        return fail(409, 'Checkpoint is missing, incomplete or requires integrity verification');
    }
    const task = args.taskId
      ? await taskInProject(ctx, args.taskId, args.projectId, [sender._id, args.recipient])
      : null;
    const id = await ctx.db.insert('collo_handoffs', {
      projectId: args.projectId,
      requestId: args.requestId,
      request: redact(request),
      sender: sender._id,
      recipient: args.recipient,
      title: redact(args.title.trim()),
      context: redact(args.context.trim()),
      nextSteps: redact(args.nextSteps),
      source,
      checkpoint: args.checkpoint,
      taskId: args.taskId,
      status: 'pending',
      revision: 1,
      updatedAt: Date.now(),
    });
    // Use the original comment writer so native Threads, task cache and change log update.
    // It describes human context transfer; it never dispatches an imported Agent session.
    if (task)
      await insertTaskComment(
        ctx,
        task._id,
        {
          author: sender.name || sender.email || 'Member',
          comment_type: 'note',
          text: redact(
            `Context handoff: ${args.title.trim()}\n\n${args.context.trim()}\n\nNext steps:\n${args.nextSteps}`,
          ),
        },
        sender._id,
        undefined,
        { relayToAgent: false },
      );
    return { id, revision: 1, status: 'pending' };
  },
});
export const respond = mutation({
  args: {
    id: v.id('collo_handoffs'),
    revision: v.number(),
    status: v.union(v.literal('accepted'), v.literal('declined'), v.literal('cancelled')),
  },
  handler: async (ctx, args) => {
    const viewer = await user(ctx),
      handoff = await ctx.db.get(args.id);
    if (!handoff) return fail(404, 'Handoff not found');
    await project(ctx, viewer._id, handoff.projectId);
    if (viewer._id !== (args.status === 'cancelled' ? handoff.sender : handoff.recipient))
      return fail(403, 'Only the recipient can respond; only the sender can cancel');
    if (!Number.isSafeInteger(args.revision) || args.revision < 1)
      return fail(400, 'Invalid handoff revision');
    if (handoff.status === args.status && handoff.revision === args.revision + 1)
      return { id: handoff._id, revision: handoff.revision, status: handoff.status };
    if (handoff.status !== 'pending' || handoff.revision !== args.revision)
      return fail(409, 'Handoff changed; reload before responding');
    let commentTask = null;
    if (handoff.taskId) {
      if (args.status === 'accepted')
        commentTask = await taskInProject(ctx, handoff.taskId, handoff.projectId, [viewer._id]);
      else {
        const candidate = await ctx.db.get(handoff.taskId),
          p = await ctx.db.get(handoff.projectId);
        if (
          candidate &&
          p &&
          candidate.project_id === p._id &&
          candidate.workspace === p.workspace &&
          (await canAccessTask(ctx, viewer._id, candidate))
        )
          commentTask = candidate;
      }
    }
    await ctx.db.patch(handoff._id, {
      status: args.status,
      revision: handoff.revision + 1,
      updatedAt: Date.now(),
    });
    if (commentTask)
      await insertTaskComment(
        ctx,
        commentTask._id,
        {
          author: viewer.name || viewer.email || 'Member',
          comment_type: 'note',
          text: `Context handoff ${args.status}: ${handoff.title}`,
        },
        viewer._id,
        undefined,
        { relayToAgent: false },
      );
    return { id: handoff._id, revision: handoff.revision + 1, status: args.status };
  },
});
const publicRow = ({ request, ...row }: any) => row;
// A reactive paginated page can grow as inserts enter its retained range.
// The overview needs a strict small bound and an accurate overflow sentinel.
export const awaitingResponse = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    const rows = await ctx.db.query('collo_handoffs')
      .withIndex('by_project_status', q => q.eq('projectId', args.projectId).eq('status', 'pending'))
      .order('desc').take(5);
    return { page: rows.slice(0, 4).map(publicRow), hasMore: rows.length > 4 };
  },
});
export const list = query({
  args: {
    projectId: v.id('projects'),
    status: v.optional(v.literal('pending')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    const source = ctx.db.query('collo_handoffs');
    const scoped =
      args.status === 'pending'
        ? source.withIndex('by_project_status', (q) =>
            q.eq('projectId', args.projectId).eq('status', 'pending'),
          )
        : source.withIndex('by_project', (q) => q.eq('projectId', args.projectId));
    const page = await scoped.order('desc').paginate({
      ...args.paginationOpts,
      numItems: Math.max(1, Math.min(30, args.paginationOpts.numItems)),
    });
    return { ...page, page: page.page.map(publicRow) };
  },
});
export const get = query({
  args: { id: v.id('collo_handoffs') },
  handler: async (ctx, args) => {
    const viewer = await user(ctx),
      handoff = await ctx.db.get(args.id);
    if (!handoff) return null;
    await project(ctx, viewer._id, handoff.projectId);
    return publicRow(handoff);
  },
});
