import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';

import { internalMutation, internalQuery, mutation, query } from './functions';
import { canAccessProject } from './lib/access';
import { eventSchema, idSchema, sensitivePath, redact, MAX_EVENT_BYTES } from './colloProtocol';
import type { Id } from './_generated/dataModel';

import { fail, user, project, device } from './colloAccess';
import { indexMessage } from './colloSessions';
import { directoryFields } from './colloDirectories';
const MAX_CHECKPOINT_FILES = 20_000;
const MAX_CHECKPOINT_PARTS = MAX_CHECKPOINT_FILES + 1;
const CHECKPOINT_PAGE_BYTES = 1024 * 1024;
async function decorate(ctx: any, row: any) {
  const owner = await ctx.db.get(row.userId);
  return {
    ...row.event,
    seq: row.seq,
    receivedAt: row.receivedAt,
    actor: { id: row.userId, name: owner?.name || owner?.email || 'Member' },
  };
}
export const me = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await user(ctx);
    return { user: { id: row._id, name: row.name || row.email || 'Member' } };
  },
});
// A cold link can name a project outside the currently hydrated workspace.
// Resolve the original short address on the server before switching workspaces.
export const projectByRef = query({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    const id = ctx.db.normalizeId('projects', args.reference);
    const row = id
      ? await ctx.db.get(id)
      : /^pj-[a-z0-9]+$/.test(args.reference)
        ? await ctx.db
            .query('projects')
            .withIndex('by_short_id', (q) => q.eq('short_id', args.reference))
            .unique()
        : null;
    return row && (await canAccessProject(ctx, viewer._id, row)) ? row : null;
  },
});
const membersQuery = {
  args: { projectId: v.id('projects') },
  handler: async (ctx: import('./_generated/server').QueryCtx, args: { projectId: Id<'projects'> }) => {
    const viewer = await user(ctx);
    const p = await project(ctx, viewer._id, args.projectId);
    const ids = new Set<Id<'users'>>([p.user_id]);
    // workspace is the access key. team_id is only routing in Codecast.
    if (p.workspace?.startsWith('team:')) {
      const teamId = ctx.db.normalizeId('teams', p.workspace.slice(5));
      if (teamId)
        for (const row of await ctx.db
          .query('team_memberships')
          .withIndex('by_team_id', (q: any) => q.eq('team_id', teamId))
          .collect())
          ids.add(row.user_id);
    }
    const members = [];
    for (const id of ids) {
      const member = await ctx.db.get(id);
      if (member && (await canAccessProject(ctx, id, p)))
        members.push({ id, name: member.name || member.email || 'Member', role: 'editor' });
    }
    return { members };
  },
};
export const members = internalQuery(membersQuery);
// The UI uses the same membership-filtered roster as the connector API.
export const projectMembers = query(membersQuery);
export const issue = internalMutation({
  args: { projectId: v.id('projects'), workspaceId: v.string(), hash: v.string() },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    if (!/^workspace-[a-f0-9-]{36}$/.test(args.workspaceId) || !/^[a-f0-9]{64}$/.test(args.hash))
      return fail(400, 'Invalid device request');
    const workspace = await ctx.db
      .query('collo_workspaces')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', args.workspaceId))
      .unique();
    if (workspace && (workspace.userId !== viewer._id || workspace.projectId !== args.projectId))
      return fail(403, 'Workspace owner mismatch');
    const old = await ctx.db
      .query('collo_devices')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', args.workspaceId))
      .collect();
    if (old.some((g) => g.userId !== viewer._id || g.projectId !== args.projectId))
      return fail(403, 'Workspace owner mismatch');
    for (const grant of old) await ctx.db.delete(grant._id);
    await ctx.db.insert('collo_devices', {
      ...args,
      userId: viewer._id,
      expiresAt: Date.now() + 30 * 86400_000,
      revoked: false,
    });
    return { userId: viewer._id };
  },
});
export const register = internalMutation({
  args: { projectId: v.id('projects'), hash: v.string(), id: v.string(), label: v.string() },
  handler: async (ctx, args) => {
    const grant = await device(ctx, args.hash, args.projectId);
    if (
      grant.workspaceId !== args.id ||
      !idSchema.safeParse(args.id).success ||
      !args.label.trim() ||
      args.label.length > 80
    )
      return fail(403, 'Workspace scope mismatch');
    const old = await ctx.db
      .query('collo_workspaces')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', args.id))
      .unique();
    if (old && (old.userId !== grant.userId || old.projectId !== args.projectId))
      return fail(403, 'Workspace owner mismatch');
    if (old) await ctx.db.patch(old._id, { ...directoryFields(old), label: args.label, updatedAt: Date.now() });
    else
      await ctx.db.insert('collo_workspaces', {
        workspaceId: args.id,
        directoryVersion: 1,
        directoryId: args.id,
        projectId: args.projectId,
        userId: grant.userId,
        label: args.label,
        updatedAt: Date.now(),
      });
    return { id: args.id, userId: grant.userId };
  },
});
export const ingest = internalMutation({
  args: { projectId: v.id('projects'), hash: v.string(), raw: v.any(), fingerprint: v.string() },
  handler: async (ctx, args) => {
    const grant = await device(ctx, args.hash, args.projectId);
    if (new TextEncoder().encode(JSON.stringify(args.raw)).length > MAX_EVENT_BYTES)
      return fail(413, 'Event too large');
    const parsed = eventSchema.safeParse(args.raw);
    if (!parsed.success) return fail(400, 'Invalid versioned event');
    const event = parsed.data;
    if (event.workspaceId !== grant.workspaceId) return fail(403, 'Workspace scope mismatch');
    const workspace = await ctx.db
      .query('collo_workspaces')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', event.workspaceId))
      .unique();
    if (!workspace || workspace.userId !== grant.userId || workspace.projectId !== args.projectId)
      return fail(403, 'Register this workspace first');
    if (event.kind === 'checkpoint') {
      if (
        event.payload.part > event.payload.parts ||
        event.payload.parts > MAX_CHECKPOINT_PARTS ||
        event.payload.totalFiles > MAX_CHECKPOINT_FILES ||
        event.payload.files.length > event.payload.totalFiles ||
        new Set(event.payload.files.map((f) => f.path)).size !== event.payload.files.length ||
        event.payload.files.some((f) => sensitivePath(f.path))
      )
        return fail(400, 'Excluded file or invalid checkpoint part');
      event.payload.files = event.payload.files.map((f) => ({ ...f, patch: redact(f.patch) }));
    } else event.payload.text = redact(event.payload.text);
    const prior = await ctx.db
      .query('collo_events')
      .withIndex('by_event', (q) => q.eq('projectId', args.projectId).eq('eventId', event.id))
      .unique();
    if (prior) {
      if (
        prior.userId !== grant.userId ||
        prior.workspaceId !== event.workspaceId ||
        prior.fingerprint !== args.fingerprint
      )
        return fail(409, 'Event ID already has different contents');
      return { id: event.id, seq: prior.seq };
    }
    const alias = await ctx.db
      .query('collo_event_aliases')
      .withIndex('by_event', (q) => q.eq('projectId', args.projectId).eq('eventId', event.id))
      .unique();
    if (alias) {
      if (
        alias.userId !== grant.userId ||
        alias.workspaceId !== event.workspaceId ||
        alias.fingerprint !== args.fingerprint
      )
        return fail(409, 'Event ID already has different contents');
      return { id: event.id, seq: alias.seq };
    }
    if (event.kind === 'checkpoint') {
      const data = event.payload;
      // Uniqueness is across the entire checkpoint, not just within one part.
      for (const file of data.files) {
        const key = file.path.toLowerCase();
        const duplicate = await ctx.db
          .query('collo_checkpoint_paths')
          .withIndex('by_path', (q) =>
            q
              .eq('projectId', args.projectId)
              .eq('workspaceId', event.workspaceId)
              .eq('checkpointId', data.checkpointId)
              .eq('path', key),
          )
          .first();
        if (duplicate) return fail(409, 'Checkpoint repeats a file path across parts');
        await ctx.db.insert('collo_checkpoint_paths', {
          projectId: args.projectId,
          workspaceId: event.workspaceId,
          checkpointId: data.checkpointId,
          path: key,
        });
      }
      const part = await ctx.db
        .query('collo_events')
        .withIndex('by_checkpoint_part', (q) =>
          q
            .eq('projectId', args.projectId)
            .eq('workspaceId', event.workspaceId)
            .eq('event.kind', 'checkpoint')
            .eq('event.payload.checkpointId', data.checkpointId)
            .eq('event.payload.part', data.part),
        )
        .first();
      if (part) return fail(409, 'Checkpoint part already has an event');
      const summary = await ctx.db
        .query('collo_checkpoints')
        .withIndex('by_checkpoint', (q) =>
          q
            .eq('projectId', args.projectId)
            .eq('workspaceId', event.workspaceId)
            .eq('checkpointId', data.checkpointId),
        )
        .unique();
      // Existing pre-summary receipts remain readable, but cannot be declared complete
      // from only the subset received after this upgrade.
      const existing = summary
        ? null
        : await ctx.db
            .query('collo_events')
            .withIndex('by_checkpoint_part', (q) =>
              q
                .eq('projectId', args.projectId)
                .eq('workspaceId', event.workspaceId)
                .eq('event.kind', 'checkpoint')
                .eq('event.payload.checkpointId', data.checkpointId),
            )
            .first();
      const baseline =
        summary ??
        (existing
          ? {
              parentId: existing.event.payload.parentId,
              label: existing.event.payload.label,
              occurredAt: existing.event.occurredAt,
              totalParts: existing.event.payload.parts,
              totalFiles: existing.event.payload.totalFiles,
            }
          : null);
      if (
        baseline &&
        (baseline.parentId !== data.parentId ||
          baseline.label !== data.label ||
          baseline.occurredAt !== event.occurredAt ||
          baseline.totalParts !== data.parts ||
          baseline.totalFiles !== data.totalFiles)
      )
        return fail(409, 'Checkpoint metadata differs between parts');
      const receivedParts = (summary?.receivedParts ?? 0) + 1;
      const receivedFiles = (summary?.receivedFiles ?? 0) + data.files.length;
      const verifiedFromStart = summary?.verifiedFromStart ?? !existing;
      if (
        receivedFiles > data.totalFiles ||
        (verifiedFromStart && receivedParts === data.parts && receivedFiles !== data.totalFiles)
      )
        return fail(409, 'Checkpoint file count differs from its declared total');
      if (summary) await ctx.db.patch(summary._id, { receivedParts, receivedFiles });
      else
        await ctx.db.insert('collo_checkpoints', {
          projectId: args.projectId,
          workspaceId: event.workspaceId,
          checkpointId: data.checkpointId,
          parentId: data.parentId,
          label: data.label,
          occurredAt: event.occurredAt,
          totalParts: data.parts,
          totalFiles: data.totalFiles,
          receivedParts,
          receivedFiles,
          verifiedFromStart,
          pathsVerified: !existing,
        });
    }
    if (event.kind === 'agent.message') {
      const duplicate = await ctx.db
        .query('collo_events')
        .withIndex('by_session_message', (q) =>
          q
            .eq('projectId', args.projectId)
            .eq('workspaceId', event.workspaceId)
            .eq('event.kind', 'agent.message')
            .eq('event.payload.sessionId', event.payload.sessionId)
            .eq('event.payload.messageId', event.payload.messageId),
        )
        .first();
      if (duplicate) {
        if (
          duplicate.userId !== grant.userId ||
          duplicate.event.payload.role !== event.payload.role ||
          duplicate.event.payload.text !== event.payload.text
        )
          return fail(409, 'Session message ID already has different contents');
        // Restoring an older local SQLite database can re-import the same source
        // message with a new transport ID and a different nearby checkpoint.
        // Persist that receipt, preserving the first captured source association.
        await ctx.db.insert('collo_event_aliases', {
          projectId: args.projectId,
          eventId: event.id,
          userId: grant.userId,
          workspaceId: event.workspaceId,
          fingerprint: args.fingerprint,
          canonicalEventId: duplicate.eventId,
          seq: duplicate.seq,
        });
        return { id: event.id, seq: duplicate.seq };
      }
    }
    const head = await ctx.db
      .query('collo_heads')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique();
    const seq = (head?.seq ?? 0) + 1;
    if (head)
      await ctx.db.patch(head._id, {
        seq,
        ...((head.sessionCursor ?? 0) === head.seq ? { sessionCursor: seq } : {}),
      });
    else await ctx.db.insert('collo_heads', { projectId: args.projectId, seq, sessionCursor: seq });
    await ctx.db.insert('collo_events', {
      projectId: args.projectId,
      eventId: event.id,
      workspaceId: event.workspaceId,
      userId: grant.userId,
      seq,
      receivedAt: Date.now(),
      fingerprint: args.fingerprint,
      sessionIndexed: event.kind === 'agent.message',
      event,
    });
    await indexMessage(ctx, args.projectId, grant.userId, event, seq);
    await ctx.db.patch(workspace._id, { updatedAt: Date.now() });
    // Convex commits the mutation transaction before the HTTP action can ACK.
    return { id: event.id, seq };
  },
});
export const replay = query({
  args: { projectId: v.id('projects'), after: v.number() },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    if (!Number.isSafeInteger(args.after) || args.after < 0) return fail(400, 'Invalid cursor');
    const rows = await ctx.db
      .query('collo_events')
      .withIndex('by_project_seq', (q) => q.eq('projectId', args.projectId).gt('seq', args.after))
      .take(21);
    const page = rows.slice(0, 20);
    return {
      events: await Promise.all(page.map((row) => decorate(ctx, row))),
      cursor: page[page.length - 1]?.seq ?? args.after,
      hasMore: rows.length > 20,
    };
  },
});
export const eventById = query({
  args: { projectId: v.id('projects'), eventId: v.string() },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    if (!idSchema.safeParse(args.eventId).success) return fail(400, 'Invalid event ID');
    let row = await ctx.db
      .query('collo_events')
      .withIndex('by_event', (q) => q.eq('projectId', args.projectId).eq('eventId', args.eventId))
      .unique();
    if (!row) {
      const alias = await ctx.db
        .query('collo_event_aliases')
        .withIndex('by_event', (q) => q.eq('projectId', args.projectId).eq('eventId', args.eventId))
        .unique();
      if (alias)
        row = await ctx.db
          .query('collo_events')
          .withIndex('by_event', (q) =>
            q.eq('projectId', args.projectId).eq('eventId', alias.canonicalEventId),
          )
          .unique();
    }
    return row ? decorate(ctx, row) : null;
  },
});
export const checkpointParts = query({
  args: {
    projectId: v.id('projects'),
    workspaceId: v.string(),
    checkpointId: v.string(),
    afterPart: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    const after = args.afterPart ?? 0;
    if (
      !idSchema.safeParse(args.workspaceId).success ||
      !idSchema.safeParse(args.checkpointId).success ||
      !Number.isSafeInteger(after) ||
      after < 0
    )
      return fail(400, 'Invalid checkpoint cursor');
    const summary = await ctx.db
      .query('collo_checkpoints')
      .withIndex('by_checkpoint', (q) =>
        q
          .eq('projectId', args.projectId)
          .eq('workspaceId', args.workspaceId)
          .eq('checkpointId', args.checkpointId),
      )
      .unique();
    const range = () =>
      ctx.db
        .query('collo_events')
        .withIndex('by_checkpoint_part', (q) =>
          q
            .eq('projectId', args.projectId)
            .eq('workspaceId', args.workspaceId)
            .eq('event.kind', 'checkpoint')
            .eq('event.payload.checkpointId', args.checkpointId)
            .gt('event.payload.part', after),
        );
    const page = [];
    let bytes = 0,
      hasMore = false;
    // Read at most 21 rows; stop before accumulating an unbounded multipart body.
    for await (const row of range()) {
      const size = new TextEncoder().encode(JSON.stringify(row.event)).byteLength;
      if (page.length >= 20 || (page.length > 0 && bytes + size > CHECKPOINT_PAGE_BYTES)) {
        hasMore = true;
        break;
      }
      page.push(row);
      bytes += size;
    }
    const first =
      page[0] ??
      (summary
        ? null
        : await ctx.db
            .query('collo_events')
            .withIndex('by_checkpoint_part', (q) =>
              q
                .eq('projectId', args.projectId)
                .eq('workspaceId', args.workspaceId)
                .eq('event.kind', 'checkpoint')
                .eq('event.payload.checkpointId', args.checkpointId),
            )
            .first());
    const verified =
      summary?.verifiedFromStart === true && summary.pathsVerified === true && !summary.pathError;
    return {
      events: await Promise.all(page.map((row) => decorate(ctx, row))),
      cursor: page[page.length - 1]?.event.payload.part ?? after,
      hasMore,
      totalParts: summary?.totalParts ?? first?.event.payload.parts ?? null,
      receivedParts: verified ? summary.receivedParts : null,
      verificationAvailable: summary?.verifiedFromStart === true && !summary.pathError,
      pathError: summary?.pathError === true,
      complete: verified
        ? summary.receivedParts === summary.totalParts &&
          summary.receivedFiles === summary.totalFiles
        : null,
      integrity: verified
        ? ('verified' as const)
        : first || summary
          ? ('legacy-unverified' as const)
          : ('missing' as const),
    };
  },
});
export const feed = query({
  args: { projectId: v.id('projects'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    const rows = await ctx.db
      .query('collo_events')
      .withIndex('by_project_seq', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 20) });
    return { ...rows, page: await Promise.all(rows.page.map((row) => decorate(ctx, row))) };
  },
});
export const workspaces = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    await project(ctx, viewer._id, args.projectId);
    const rows = await ctx.db
      .query('collo_workspaces')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect();
    return rows.map((row) => ({ ...row, own: row.userId === viewer._id }));
  },
});
export const revoke = mutation({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const viewer = await user(ctx);
    const grants = await ctx.db
      .query('collo_devices')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', args.workspaceId))
      .collect();
    if (grants.some((g) => g.userId !== viewer._id)) return fail(403, 'Workspace owner mismatch');
    for (const grant of grants) await ctx.db.patch(grant._id, { revoked: true });
    return { ok: true };
  },
});
