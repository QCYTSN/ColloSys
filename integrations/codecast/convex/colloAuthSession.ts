import { getAuthSessionId, getAuthUserId } from '@convex-dev/auth/server';
import { query } from './_generated/server';

// The startup query must distinguish revocation from a network failure. Its
// only public result is this caller's session; it returns no workspace data.
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx),
      sessionId = await getAuthSessionId(ctx);
    if (!userId || !sessionId) return { status: 'signed-out' as const };
    const session = await ctx.db.get(sessionId),
      user = await ctx.db.get(userId);
    if (!session || !user || session.userId !== userId || session.expirationTime <= Date.now())
      return { status: 'revoked' as const };
    return {
      status: 'verified' as const,
      userId: String(userId),
      expiresAt: session.expirationTime,
      accountLabel: user.name || user.email || 'ColloSys account',
      email: user.email ?? null,
    };
  },
});
