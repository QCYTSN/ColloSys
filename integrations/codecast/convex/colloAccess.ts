import { ConvexError } from 'convex/values';
import { getAuthUserId, getAuthSessionId } from '@convex-dev/auth/server';
import { canAccessProject } from './lib/access';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

export const fail = (status: number, message: string): never => {
  throw new ConvexError({
    status,
    message,
    ...(status === 401 ? { code: 'UNAUTHENTICATED', retryable: true } : {}),
  });
};
export async function user(ctx: QueryCtx) {
  const id = await getAuthUserId(ctx);
  if (!id) return fail(401, 'Sign in required');
  const sessionId = await getAuthSessionId(ctx);
  const session = sessionId ? await ctx.db.get(sessionId) : null;
  if (!session || session.userId !== id || session.expirationTime <= Date.now())
    return fail(401, 'Session expired; sign in again');
  const row = await ctx.db.get(id);
  if (!row) return fail(401, 'Account unavailable');
  return row;
}
export async function project(ctx: QueryCtx, userId: Id<'users'>, projectId: Id<'projects'>) {
  const row = await ctx.db.get(projectId);
  if (!row || !(await canAccessProject(ctx, userId, row)))
    return fail(403, 'Project access denied');
  return row;
}
export async function device(ctx: QueryCtx, hash: string, projectId: Id<'projects'>) {
  const grant = await ctx.db
    .query('collo_devices')
    .withIndex('by_hash', (q) => q.eq('hash', hash))
    .unique();
  if (!grant || grant.revoked || grant.expiresAt <= Date.now())
    return fail(401, 'Reconnect this directory to renew its access');
  if (grant.projectId !== projectId) return fail(403, 'Device is scoped to a different project');
  if (!(await ctx.db.get(grant.userId))) return fail(401, 'Account unavailable');
  await project(ctx, grant.userId, projectId);
  return grant;
}
