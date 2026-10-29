import { v } from 'convex/values';
import { getAuthSessionId, getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query, internalMutation } from './functions';
import { providerConfigured } from './colloIdentity';
import type { QueryCtx } from './_generated/server';

const provider = v.union(v.literal('github'), v.literal('google'));
const idPattern = /^[a-f0-9-]{36}$/;
const secretPattern = /^[a-f0-9]{64}$/;
const sha256 = async (secret: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
const find = (ctx: Pick<QueryCtx, 'db'>, attemptId: string) =>
  ctx.db
    .query('collo_auth_attempts')
    .withIndex('by_attempt', (q) => q.eq('attemptId', attemptId))
    .unique();
function checkId(attemptId: string) {
  if (!idPattern.test(attemptId)) throw new Error('Invalid sign-in request');
}
async function ownedAttempt(ctx: any, attemptId: string, secret: string) {
  checkId(attemptId);
  if (!secretPattern.test(secret)) throw new Error('Invalid sign-in request');
  const row = await find(ctx, attemptId);
  if (!row || row.claimHash !== (await sha256(secret))) throw new Error('Invalid sign-in request');
  return row;
}
export const create = mutation({
  args: { attemptId: v.string(), claimHash: v.string(), provider },
  handler: async (ctx, args) => {
    checkId(args.attemptId);
    if (!secretPattern.test(args.claimHash) || !providerConfigured(args.provider))
      throw new Error('This sign-in provider is not configured');
    if (await find(ctx, args.attemptId)) throw new Error('Sign-in request already exists');
    const createdAt = Date.now(),
      expiresAt = createdAt + 5 * 60_000;
    await ctx.db.insert('collo_auth_attempts', {
      ...args,
      version: 1,
      createdAt,
      expiresAt,
      status: 'pending',
    });
    return { expiresAt };
  },
});
export const status = query({
  args: { attemptId: v.string() },
  handler: async (ctx, { attemptId }) => {
    checkId(attemptId);
    const row = await find(ctx, attemptId);
    if (!row) return { status: 'missing' as const };
    return {
      status: row.expiresAt <= Date.now() ? ('expired' as const) : row.status,
      provider: row.provider,
      expiresAt: row.expiresAt,
    };
  },
});
export const authorize = mutation({
  args: { attemptId: v.string() },
  handler: async (ctx, { attemptId }) => {
    checkId(attemptId);
    const userId = await getAuthUserId(ctx),
      sessionId = await getAuthSessionId(ctx),
      row = await find(ctx, attemptId);
    if (!userId || !sessionId || !row || row.status !== 'pending' || row.expiresAt <= Date.now())
      throw new Error('This sign-in request is no longer available');
    const proof = await ctx.db
      .query('collo_identity_proofs')
      .withIndex('by_identity', (q) => q.eq('userId', userId).eq('provider', row.provider))
      .unique();
    if (!proof || proof.verifiedAt < row.createdAt)
      throw new Error('Complete a fresh sign-in with the requested provider first');
    await ctx.db.patch(row._id, { status: 'authorized', userId, sessionId });
  },
});
export const cancel = mutation({
  args: { attemptId: v.string(), claimSecret: v.string() },
  handler: async (ctx, args) => {
    const row = await ownedAttempt(ctx, args.attemptId, args.claimSecret);
    if (row.status !== 'consumed')
      await ctx.db.patch(row._id, { status: 'cancelled', userId: undefined, sessionId: undefined });
  },
});
export const claim = internalMutation({
  args: { attemptId: v.string(), claimSecret: v.string() },
  handler: async (ctx, args) => {
    const row = await ownedAttempt(ctx, args.attemptId, args.claimSecret);
    if (row.status !== 'authorized' || row.expiresAt <= Date.now() || !row.userId || !row.sessionId)
      throw new Error('Desktop sign-in was not authorized or has expired');
    const session = await ctx.db.get(row.sessionId),
      user = await ctx.db.get(row.userId);
    if (!session || !user || session.userId !== row.userId || session.expirationTime <= Date.now())
      throw new Error('The authorizing account signed out');
    await ctx.db.patch(row._id, {
      status: 'consumed',
      claimHash: '',
      userId: undefined,
      sessionId: undefined,
    });
    return { userId: row.userId };
  },
});
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('collo_auth_attempts')
      .withIndex('by_expiry', (q) => q.lt('expiresAt', Date.now()))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
