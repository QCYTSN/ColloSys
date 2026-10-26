// ColloSys policy shared by the native Codecast surfaces. No public endpoints.
import {
  canAccessTask,
  canAccessDoc,
  canAccessPlan,
  canAccessConversation,
  isTeamMember,
} from './lib/access';

const protectedTypes = new Set(['task', 'doc', 'plan', 'conversation']);
const entityTables: Record<string, string> = {
  task: 'tasks',
  doc: 'docs',
  plan: 'plans',
  conversation: 'conversations',
};

export async function colloNativeCanReadEntity(
  ctx: { db: any },
  userId: any,
  kind: string,
  ref: string,
): Promise<boolean> {
  if (!protectedTypes.has(kind)) return true;
  const table = entityTables[kind]!;
  const id = ctx.db.normalizeId(table, ref);
  const row = id ? await ctx.db.get(id) : null;
  if (!row) return false;
  switch (kind) {
    case 'task':
      return canAccessTask(ctx, userId, row);
    case 'doc':
      return canAccessDoc(ctx, userId, row);
    case 'plan':
      return canAccessPlan(ctx, userId, row);
    case 'conversation':
      return canAccessConversation(ctx, userId, row);
    default:
      return false;
  }
}

export async function colloNativeCanReadNotification(ctx: { db: any }, userId: any, row: any) {
  if (
    row.entity_type &&
    row.entity_id &&
    !(await colloNativeCanReadEntity(ctx, userId, row.entity_type, row.entity_id))
  )
    return false;
  // A notification can also project a conversation's current title and path.
  if (
    row.conversation_id &&
    !(await colloNativeCanReadEntity(ctx, userId, 'conversation', row.conversation_id))
  )
    return false;
  return true;
}

export async function colloNativeTaskParticipants(ctx: { db: any }, taskId: any, ids: any[]) {
  const task = await ctx.db.get(taskId);
  if (!task) return [];
  const allowed = [];
  for (const id of ids) {
    if ((await ctx.db.get(id)) && (await canAccessTask(ctx, id, task))) allowed.push(id);
  }
  return allowed;
}

export async function colloNativeAssignee(
  ctx: { db: any },
  value: string | undefined,
  boundary?: { team_id?: any },
): Promise<string | undefined> {
  if (!value || value.startsWith('agent:')) return value;
  const userId = ctx.db.normalizeId('users', value);
  if (userId) {
    if (!(await ctx.db.get(userId))) throw new Error('Assignee no longer exists');
    if (boundary?.team_id && !(await isTeamMember(ctx, userId, boundary.team_id)))
      throw new Error('Assignee must be a current member of this workspace');
  } else if (/^[a-z0-9]{32}$/.test(value)) {
    // The upstream resolver already applies role scope checks; reject dangling ids.
    const roleId = ctx.db.normalizeId('org_roles', value);
    if (!roleId || !(await ctx.db.get(roleId))) throw new Error('Assignee not found');
  }
  return value;
}
