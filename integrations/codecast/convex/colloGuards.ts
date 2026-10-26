import { ConvexError } from 'convex/values';
import { getAuthSessionId, getAuthUserId } from '@convex-dev/auth/server';
import {
  query as rawQuery,
  mutation as rawMutation,
  action as rawAction,
} from './_generated/server';
import { internal } from './_generated/api';

// Preserve internal builders for low-level callers without an import cycle through functions.ts.
export * from './_generated/server';

// JWT verification alone does not consult the session row deleted on sign-out.
// Anonymous public queries stay anonymous; a revoked authenticated principal
// cannot silently fall back to public access in the same request.
export function withActiveSession(definition: any): any {
  const invoke = typeof definition === 'function' ? definition : definition.handler;
  const handler = async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (userId) {
      const sessionId = await getAuthSessionId(ctx);
      const session = sessionId ? await ctx.db.get(sessionId) : null;
      if (
        !session ||
        session.userId !== userId ||
        session.expirationTime <= Date.now() ||
        !(await ctx.db.get(userId))
      )
        throw new ConvexError({
          status: 401,
          code: 'UNAUTHENTICATED',
          retryable: true,
          message: 'Session expired; sign in again',
        });
    }
    return invoke(ctx, args);
  };
  return typeof definition === 'function' ? handler : { ...definition, handler };
}

export function withActiveActionSession(definition: any): any {
  const invoke = typeof definition === 'function' ? definition : definition.handler;
  const handler = async (ctx: any, args: any) => {
    if (await getAuthUserId(ctx)) await ctx.runQuery((internal as any).collo.me, {});
    return invoke(ctx, args);
  };
  return typeof definition === 'function' ? handler : { ...definition, handler };
}

export const query = ((definition: any) =>
  rawQuery(withActiveSession(definition))) as typeof rawQuery;
export const mutation = ((definition: any) =>
  rawMutation(withActiveSession(definition))) as typeof rawMutation;
export const action = ((definition: any) =>
  rawAction(withActiveActionSession(definition))) as typeof rawAction;

// Put the ColloSys seat rule at the mutation writer boundary, so native join,
// invitation acceptance, operator restores and other upstream insertion paths
// share the same transactional capacity check. Do not fork upstream auth/team logic.
export function withTeamLimit(db: any): any {
  return new Proxy(db, {
    get(target, property) {
      if (property === 'insert')
        return async (table: string, value: any) => {
          if (table === 'team_memberships') {
            const seats = await target
              .query('team_memberships')
              .withIndex('by_team_id', (q: any) => q.eq('team_id', value.team_id))
              .take(10);
            if (seats.length >= 10)
              throw new ConvexError({ status: 409, message: 'Team is full (10 members)' });
          }
          return target.insert(table, value);
        };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
