// Owned changes applied to the complete generated fork, never the pinned mirror.
const convex = (file, before, after) => ({ file: `packages/convex/convex/${file}`, before, after });
const authFile = 'platform/packages/auth/src/convex/apiTokens.ts';
export const nativeBackendPatches = [
  convex(
    'lib/access.ts',
    '  const uid = String(userId);\n  if (stamp.access_owner === uid) return true;',
    '  const uid = String(userId);\n  // A team-owned workspace requires a current seat, including creators and assignees.\n  if (stamp.access_key?.startsWith("team:") && !(await workspaceGrantsAccess(ctx, userId, stamp.access_key))) return false;\n  if (stamp.access_owner === uid) return true;',
  ),
  convex(
    'lib/accessKeys.ts',
    '  if (stamp.access_owner === userId) return true;',
    '  // Also gates historical sync-log cargo, whose owner/grants survive member removal.\n  if (stamp.access_key?.startsWith("team:") && !heldKeys.has(stamp.access_key)) return false;\n  if (stamp.access_owner === userId) return true;',
  ),
  convex(
    'data.ts',
    '  if (String(doc.user_id) === String(userId)) return true;\n  return (await resolveWorkspaceKey(ctx, doc)) === key;',
    '  const accessKey = await resolveWorkspaceKey(ctx, doc);\n  const boundary = parseWorkspaceKey(accessKey);\n  if (boundary?.type === "team" && !(await isTeamMember(ctx, userId, boundary.teamId))) return false;\n  if (String(doc.user_id) === String(userId)) return true;\n  return accessKey === key;',
  ),
  convex(
    'data.ts',
    '  accessStampFromDoc,\n  authorizedFor,',
    '  accessStampFromDoc,\n  heldKeysFor,\n  authorizedFor,',
  ),
  convex(
    'data.ts',
    '  const heldKeys = new Set<string>([`user:${String(userId)}`]);',
    '  const heldKeys = await heldKeysFor(ctx, userId);',
  ),
  convex(
    'data.ts',
    '  stampEffectiveTeam(records, convMap);\n  return { records, convMap };',
    '  records = records.filter(r => authorizedFor(accessStampFromDoc(table, { ...r, workspace: resolveWorkspaceKeyBatch(r, convMap) }), String(userId), heldKeys));\n  stampEffectiveTeam(records, convMap);\n  return { records, convMap };',
  ),
  convex(
    'projects.ts',
    '    return Promise.all(projects.map((p) => enrichProject(ctx, userId, p)));',
    '    const visible = [];\n    for (const p of projects) if (await canAccessProject(ctx, userId, p)) visible.push(p);\n    return Promise.all(visible.map((p) => enrichProject(ctx, userId, p)));',
  ),
  convex(
    'tasks.ts',
    '    const result = tasks;\n\n    // Compute the delta cursor',
    '    const result = [];\n    for (const task of tasks) if (await canAccessTask(ctx, userId, task)) result.push(task);\n\n    // Compute the delta cursor',
  ),
  convex(
    'tasks.ts',
    '    await enrichTasks(ctx, userId, rows);\n\n    return { page: rows, isDone: result.isDone, continueCursor: result.continueCursor };',
    '    const visibleRows = [];\n    for (const task of rows) if (await canAccessTask(ctx, userId, task)) visibleRows.push(task);\n    rows = visibleRows;\n    await enrichTasks(ctx, userId, rows);\n\n    return { page: rows, isDone: result.isDone, continueCursor: result.continueCursor };',
  ),
  convex(
    'tasks.ts',
    'export async function resolveAssigneeStr(',
    `export async function resolveAssigneeStr(
  ctx: any, assignee: string | undefined, userId: Id<"users">,
  boundary?: AssigneeBoundary, opts: ResolveAssigneeOpts = {},
): Promise<string | undefined> {
  const resolved = await resolveAssigneeStrUnchecked(ctx, assignee, userId, boundary, opts);
  return opts.read ? resolved : colloNativeAssignee(ctx, resolved, boundary);
}

async function resolveAssigneeStrUnchecked(`,
  ),
  convex(
    'tasks.ts',
    'import { matchHandle, teamRoster } from "./lib/mentionResolve";',
    'import { matchHandle, teamRoster } from "./lib/mentionResolve";\nimport { colloNativeAssignee, colloNativeTaskParticipants } from "./colloNativeAccess";',
  ),
  convex(
    'tasks.ts',
    `  if (task.user_id.toString() === userId.toString()) return true;
  if (!task.team_id) return false;
  return !!(await ctx.db
    .query("team_memberships")
    .withIndex("by_user_team", (q: any) => q.eq("user_id", userId).eq("team_id", task.team_id))
    .first());`,
    '  return canAccessTask(ctx, userId, task);',
  ),
  convex(
    'dispatch.ts',
    'import { canAccessConversation, canAccessProject, requireTeamMembership, patchConversationVisibility } from "./lib/access";',
    'import { canAccessConversation, canAccessTask, canAccessProject, requireTeamMembership, patchConversationVisibility } from "./lib/access";',
  ),
  convex(
    'dispatch.ts',
    `        const hasAccess = linkedTask.user_id.toString() === userId.toString()
          || (linkedTask.team_id && !!(await ctx.db
              .query("team_memberships")
              .withIndex("by_user_team", (q: any) => q.eq("user_id", userId).eq("team_id", linkedTask.team_id))
              .first()));`,
    '        const hasAccess = await canAccessTask(ctx as any, userId, linkedTask);',
  ),
  convex(
    'dispatch.ts',
    `        if (!hasAccess) {
          linkedTask = null;
        } else {`,
    `        if (!hasAccess) {
          throw new Error("Task not found");
        } else {`,
  ),
  convex(
    'tasks.ts',
    '  notify?: { tokenOwner: Id<"users">; conversationId?: Id<"conversations"> },\n) {',
    '  notify?: { tokenOwner: Id<"users">; conversationId?: Id<"conversations"> },\n  options?: { relayToAgent?: boolean },\n) {',
  ),
  convex(
    'tasks.ts',
    '    if (actorId && !fields.conversation_id && !actor?.is_bot) {',
    '    if (options?.relayToAgent !== false && actorId && !fields.conversation_id && !actor?.is_bot) {',
  ),
  convex(
    'tasks.ts',
    '    const recipients = commentReaches(task, fields.comment_type, news, mentionedSet);',
    '    const recipients = await colloNativeTaskParticipants(ctx, taskId, commentReaches(task, fields.comment_type, news, mentionedSet));',
  ),
  convex(
    'threadReads.ts',
    'import { isHumanOrigin } from "@codecast/shared/tasks";',
    'import { isHumanOrigin } from "@codecast/shared/tasks";\nimport { colloNativeTaskParticipants } from "./colloNativeAccess";',
  ),
  convex(
    'threadReads.ts',
    '  return { participants: dedupe(members).filter((id) => !muted.has(String(id))), muted };',
    '  return { participants: await colloNativeTaskParticipants(ctx, task._id, dedupe(members).filter((id) => !muted.has(String(id)))), muted };',
  ),
  convex(
    'notificationRouter.ts',
    'import { isTeamMember } from "./privacy";',
    'import { isTeamMember } from "./privacy";\nimport { colloNativeCanReadNotification } from "./colloNativeAccess";',
  ),
  convex(
    'notificationRouter.ts',
    '  let allowed = recipients;',
    `  let allowed: typeof recipients = [];
  for (const recipient of recipients) {
    if (await colloNativeCanReadNotification(ctx, recipient._id, args)) allowed.push(recipient);
  }`,
  ),
  convex(
    'pushRouter.ts',
    'import { canAccessConversation, workspaceGrantsAccess, workspaceKey } from "./lib/access";',
    'import { canAccessConversation, workspaceGrantsAccess, workspaceKey } from "./lib/access";\nimport { colloNativeCanReadNotification } from "./colloNativeAccess";',
  ),
  convex(
    'pushRouter.ts',
    '      if (!n || n.read) {',
    '      if (!n || n.read || !(await colloNativeCanReadNotification(ctx, userId, n))) {',
  ),
  convex(
    'notifications.ts',
    'import { isConversationTeamVisible } from "./privacy";',
    'import { isConversationTeamVisible } from "./privacy";\nimport { colloNativeCanReadEntity, colloNativeCanReadNotification } from "./colloNativeAccess";',
  ),
  convex(
    'notifications.ts',
    '    const enriched = await Promise.all(\n      notifications.map(async (notification) => {',
    `    const visible = [];
    for (const notification of notifications) {
      if (await colloNativeCanReadNotification(ctx, userId, notification)) visible.push(notification);
    }
    const enriched = await Promise.all(
      visible.map(async (notification) => {`,
  ),
  convex(
    'notifications.ts',
    `export const toggleWatch = mutation({
  args: {
    entity_type: ENTITY_TYPE_VALIDATOR,
    entity_id: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");`,
    `export const toggleWatch = mutation({
  args: {
    entity_type: ENTITY_TYPE_VALIDATOR,
    entity_id: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (!(await colloNativeCanReadEntity(ctx, userId, args.entity_type, args.entity_id))) throw new Error("Entity not found");`,
  ),
  // Resolve the owned generated copy, not the dependency junction to the pinned mirror.
  convex(
    'apiTokens.ts',
    'import { makeApiTokenFunctions } from "@platform/auth/convex";',
    'import { makeApiTokenFunctions } from "../../../platform/packages/auth/src/convex/apiTokens";',
  ),
  convex(
    'apiTokens.ts',
    'export { hashToken, verifyApiToken } from "@platform/auth/convex";',
    `export { hashToken } from "../../../platform/packages/auth/src/convex/apiTokens";
import { verifyApiToken as verifyNativeApiToken } from "../../../platform/packages/auth/src/convex/apiTokens";
// Keep the application's generated table ids at the package boundary.
export async function verifyApiToken(...args: Parameters<typeof verifyNativeApiToken>): Promise<{ userId: Id<"users">; tokenId: Id<"api_tokens"> } | null> {
  const result = await verifyNativeApiToken(...args);
  return result ? { userId: result.userId as Id<"users">, tokenId: result.tokenId as Id<"api_tokens"> } : null;
}`,
  ),
  {
    file: authFile,
    before:
      '  const tokenDoc = await findTokenDoc(ctx, token, tables);\n\n  if (!tokenDoc) {\n    return null;\n  }',
    after:
      '  const tokenDoc = await findTokenDoc(ctx, token, tables);\n\n  if (!tokenDoc || !(await ctx.db.get(tokenDoc.user_id))) {\n    return null;\n  }',
  },
  {
    file: authFile,
    before:
      '  const tokenDoc = await findTokenDoc(ctx, setupToken, tables);\n\n  if (!tokenDoc) {\n    return null;\n  }',
    after:
      '  const tokenDoc = await findTokenDoc(ctx, setupToken, tables);\n\n  if (!tokenDoc || !(await ctx.db.get(tokenDoc.user_id))) {\n    return null;\n  }',
  },
  convex(
    'users.ts',
    'import { getUserOrToken } from "./lib/auth";',
    'import { getUserOrToken } from "./lib/auth";\nimport { endMembership } from "./teams";',
  ),
  convex(
    'users.ts',
    '    await ctx.db.delete(userId);\n    totalDeleted++;\n\n    return {\n      completed: true,',
    `    // Membership is authority and consumes a seat; it must not outlive an account.
    const memberships = await ctx.db.query("team_memberships")
      .withIndex("by_user_id", (q) => q.eq("user_id", userId)).collect();
    for (const membership of memberships) await endMembership(ctx, userId, membership.team_id);
    await ctx.db.delete(userId);
    totalDeleted++;

    return {
      completed: true,`,
  ),
];
