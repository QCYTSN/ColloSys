import { v, ConvexError } from 'convex/values';
import { getAuthSessionId, getAuthUserId, retrieveAccount } from '@convex-dev/auth/server';
import { action, internalQuery, query } from './_generated/server';
import { mutation, internalMutation } from './functions';
import { internal } from './_generated/api';

const provider = v.union(v.literal('github'), v.literal('google'));
const lifetime = 5 * 60_000;
const configured = (name: string) =>
  !!process.env[`AUTH_${name.toUpperCase()}_ID`] &&
  !!process.env[`AUTH_${name.toUpperCase()}_SECRET`];
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
async function identity(ctx: any) {
  const userId = await getAuthUserId(ctx),
    sessionId = await getAuthSessionId(ctx);
  const session = sessionId && (await ctx.db.get(sessionId));
  if (
    !userId ||
    !session ||
    session.userId !== userId ||
    session.expirationTime <= Date.now() ||
    !(await ctx.db.get(userId))
  )
    throw new ConvexError('Sign in again to manage login methods.');
  return { userId, sessionId: session._id };
}
const accounts = (ctx: any, userId: any) =>
  ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q: any) => q.eq('userId', userId))
    .collect();
const request = (ctx: any, attemptId: string) =>
  ctx.db
    .query('collo_account_links')
    .withIndex('by_attempt', (q: any) => q.eq('attemptId', attemptId))
    .unique();
async function freshProof(ctx: any, who: any, generation: string) {
  const proof = await ctx.db
    .query('collo_reauth_proofs')
    .withIndex('by_session', (q: any) => q.eq('sessionId', who.sessionId))
    .unique();
  const account = proof && (await ctx.db.get(proof.accountId));
  if (
    !proof ||
    proof.userId !== who.userId ||
    proof.generation !== generation ||
    proof.verifiedAt + lifetime <= Date.now() ||
    !account ||
    account.userId !== who.userId ||
    !(account.provider === 'password' ? !!account.secret : configured(account.provider))
  )
    throw new ConvexError('Verify an existing login method again before continuing.');
  return proof;
}
async function saveProof(ctx: any, who: any, accountId: any, generation: string) {
  const old = await ctx.db
    .query('collo_reauth_proofs')
    .withIndex('by_session', (q: any) => q.eq('sessionId', who.sessionId))
    .unique();
  const value = { ...who, accountId, generation, verifiedAt: Date.now() };
  if (old) await ctx.db.patch(old._id, value);
  else await ctx.db.insert('collo_reauth_proofs', value);
}
async function owned(ctx: any, args: { attemptId: string; challenge: string; generation: string }) {
  const who = await identity(ctx),
    row = await request(ctx, args.attemptId);
  if (
    !row ||
    row.userId !== who.userId ||
    row.sessionId !== who.sessionId ||
    row.generation !== args.generation ||
    !/^[a-f0-9]{64}$/.test(args.challenge) ||
    row.challengeHash !== (await hash(args.challenge))
  )
    throw new ConvexError('This account request does not belong to the current session.');
  return { who, row };
}
export const methods = query({
  args: {},
  handler: async (ctx) => {
    const who = await identity(ctx),
      rows = await accounts(ctx, who.userId);
    const proof = await ctx.db
      .query('collo_reauth_proofs')
      .withIndex('by_session', (q) => q.eq('sessionId', who.sessionId))
      .unique();
    return {
      reverifiedUntil: proof ? proof.verifiedAt + lifetime : 0,
      methods: await Promise.all(
        rows
          .filter((a: any) => ['password', 'github', 'google'].includes(a.provider))
          .map(async (a: any) => {
            const label = await ctx.db
              .query('collo_account_labels')
              .withIndex('by_account', (q) => q.eq('accountId', a._id))
              .unique();
            return {
              accountId: a._id,
              provider: a.provider,
              label: label?.label || a.providerAccountId,
              available: a.provider === 'password' ? !!a.secret : configured(a.provider),
            };
          }),
      ),
    };
  },
});
export const passwordAccount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const who = await identity(ctx),
      row = (await accounts(ctx, who.userId)).find(
        (a: any) => a.provider === 'password' && a.secret,
      );
    if (!row) throw new ConvexError('Reverify one of your linked providers instead.');
    return { ...who, accountId: row._id, accountName: row.providerAccountId };
  },
});
export const recordPasswordProof = internalMutation({
  args: {
    userId: v.id('users'),
    sessionId: v.id('authSessions'),
    accountId: v.id('authAccounts'),
    generation: v.string(),
  },
  handler: async (ctx, args) => {
    const who = await identity(ctx),
      account = await ctx.db.get(args.accountId);
    if (
      who.userId !== args.userId ||
      who.sessionId !== args.sessionId ||
      !account ||
      account.userId !== who.userId ||
      account.provider !== 'password'
    )
      throw new ConvexError('The active account changed. Verify again.');
    await saveProof(ctx, who, account._id, args.generation);
    return { verifiedUntil: Date.now() + lifetime };
  },
});
export const reverifyPassword = action({
  args: { password: v.string(), generation: v.string() },
  handler: async (ctx, args): Promise<{ verifiedUntil: number }> => {
    if (!args.password || args.password.length > 1024 || args.generation.length > 100)
      throw new ConvexError('Enter your current password.');
    const who = await ctx.runQuery((internal as any).colloAccountLinks.passwordAccount, {});
    // SDK hashing and rate limiting, without issuing a second session or accepting an arbitrary target email.
    const result = await retrieveAccount(ctx, {
      provider: 'password',
      account: { id: who.accountName, secret: args.password },
    });
    if (result.user._id !== who.userId || result.account._id !== who.accountId)
      throw new ConvexError('The active account changed.');
    return await ctx.runMutation((internal as any).colloAccountLinks.recordPasswordProof, {
      userId: who.userId,
      sessionId: who.sessionId,
      accountId: who.accountId,
      generation: args.generation,
    });
  },
});
export const create = mutation({
  args: {
    attemptId: v.string(),
    provider,
    purpose: v.union(v.literal('link'), v.literal('reauthenticate')),
    challengeHash: v.string(),
    generation: v.string(),
  },
  handler: async (ctx, args) => {
    const who = await identity(ctx);
    if (
      !/^[a-f0-9-]{36}$/.test(args.attemptId) ||
      !/^[a-f0-9]{64}$/.test(args.challengeHash) ||
      args.generation.length > 100
    )
      throw new ConvexError('Invalid account request.');
    if (!configured(args.provider))
      throw new ConvexError('This service has not enabled that sign-in provider.');
    if (await request(ctx, args.attemptId))
      throw new ConvexError('This account request already exists.');
    const linked = (await accounts(ctx, who.userId)).filter(
      (a: any) => a.provider === args.provider,
    );
    const proof = args.purpose === 'link' ? await freshProof(ctx, who, args.generation) : null;
    if (args.purpose === 'reauthenticate' && !linked.length)
      throw new ConvexError('Reverify an existing login method.');
    await ctx.db.insert('collo_account_links', {
      ...args,
      ...who,
      createdAt: Date.now(),
      expiresAt: Date.now() + lifetime,
      status: 'pending',
      ...(proof ? { reauthenticatedAt: proof.verifiedAt } : {}),
    });
    return { expiresAt: Date.now() + lifetime };
  },
});
export const browserStatus = query({
  args: { attemptId: v.string() },
  handler: async (ctx, args) => {
    const row = await request(ctx, args.attemptId);
    if (!row) return { status: 'missing' };
    return {
      status: row.expiresAt <= Date.now() ? 'expired' : row.status,
      provider: row.provider,
      purpose: row.purpose,
      expiresAt: row.expiresAt,
    };
  },
});
export const mine = query({
  args: { attemptId: v.string(), challenge: v.string(), generation: v.string() },
  handler: async (ctx, args) => {
    const { row } = await owned(ctx, args);
    return {
      status: row.expiresAt <= Date.now() ? 'expired' : row.status,
      purpose: row.purpose,
      provider: row.provider,
      expiresAt: row.expiresAt,
      label: row.candidateLabel,
      subject: row.candidateSubject,
      error: row.failure,
    };
  },
});
export const beginProvider = mutation({
  args: { attemptId: v.string() },
  handler: async (ctx, args) => {
    const row = await request(ctx, args.attemptId),
      session = row && (await ctx.db.get(row.sessionId));
    if (
      !row ||
      row.status !== 'pending' ||
      row.expiresAt <= Date.now() ||
      !session ||
      session.userId !== row.userId ||
      session.expirationTime <= Date.now()
    )
      throw new ConvexError('This account request has ended. Start again from ColloSys.');
    if (!configured(row.provider)) throw new ConvexError('This sign-in provider is not enabled.');
    // Same SDK verifier/state/PKCE/nonce flow, deliberately unbound to the system browser's account.
    const verifier = await ctx.db.insert('authVerifiers', {});
    await ctx.db.patch(row._id, { verifierId: verifier, status: 'awaiting-provider' });
    const url = new URL(`/api/auth/signin/${row.provider}`, process.env.CONVEX_SITE_URL!);
    url.searchParams.set('code', verifier);
    url.searchParams.set('redirectTo', `/auth/link?attempt=${encodeURIComponent(row.attemptId)}`);
    return { redirect: url.href };
  },
});

/** Called ONLY by the internal auth:store adapter after the existing SDK has
 * validated the external OAuth state, PKCE and (Google) nonce and profile.
 * It stages identity evidence; no account, session or user is created here. */
export async function captureLinkedOAuth(
  ctx: any,
  args: { provider: string; providerAccountId: string; profile: any; signature: string },
): Promise<{ handled: boolean; result?: string }> {
  const verifier = await ctx.db
    .query('authVerifiers')
    .withIndex('signature', (q: any) => q.eq('signature', args.signature))
    .unique();
  const row = verifier
    ? await ctx.db
        .query('collo_account_links')
        .withIndex('by_verifier', (q: any) => q.eq('verifierId', verifier._id))
        .unique()
    : await ctx.db
        .query('collo_account_links')
        .withIndex('by_signature', (q: any) => q.eq('callbackSignature', args.signature))
        .unique();
  if (!row) return { handled: false };
  const session = await ctx.db.get(row.sessionId);
  if (
    row.provider !== args.provider ||
    !session ||
    session.userId !== row.userId ||
    session.expirationTime <= Date.now() ||
    row.expiresAt <= Date.now() ||
    row.status === 'cancelled'
  )
    throw new ConvexError('The account request has ended.');
  if (!args.providerAccountId || args.providerAccountId.length > 512)
    throw new ConvexError('Invalid verified provider identity.');
  if (row.candidateSubject) {
    if (row.candidateSubject !== args.providerAccountId)
      throw new ConvexError('This request already verified a different identity.');
    return { handled: true, result: 'link-complete' };
  }
  const mapping = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q: any) =>
      q.eq('provider', args.provider).eq('providerAccountId', args.providerAccountId),
    )
    .unique();
  const failure =
    mapping && mapping.userId !== row.userId
      ? 'This provider identity belongs to another ColloSys account. Use that account or choose a different provider identity.'
      : row.purpose === 'reauthenticate' && mapping?.userId !== row.userId
        ? 'Choose the provider identity already linked to this account.'
        : undefined;
  const label =
    [args.profile?.name, args.profile?.email]
      .filter((v) => typeof v === 'string' && v.trim())
      .join(' · ')
      .slice(0, 240) || args.providerAccountId;
  await ctx.db.patch(row._id, {
    status: failure ? 'failed' : 'verified',
    candidateSubject: args.providerAccountId,
    candidateLabel: label,
    callbackSignature: args.signature,
    ...(failure ? { failure } : {}),
  });
  if (verifier) await ctx.db.delete(verifier._id);
  // This marker is NOT a sign-in code. /auth/link strips it before SDK mounting;
  // it never exchanges a token or changes the browser's current account.
  return { handled: true, result: 'link-complete' };
}
export const confirm = mutation({
  args: { attemptId: v.string(), challenge: v.string(), generation: v.string() },
  handler: async (ctx, args) => {
    const { who, row } = await owned(ctx, args);
    if (row.status === 'completed') return { completed: true };
    if (row.status !== 'verified' || row.expiresAt <= Date.now() || !row.candidateSubject)
      throw new ConvexError('This account request is not ready or has expired.');
    const mapping = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', row.provider).eq('providerAccountId', row.candidateSubject!),
      )
      .unique();
    if (mapping && mapping.userId !== who.userId)
      throw new ConvexError('This provider identity already belongs to another account.');
    if (row.purpose === 'reauthenticate') {
      if (!mapping || mapping.userId !== who.userId || !configured(row.provider))
        throw new ConvexError('Reverify an existing, enabled login method.');
      await saveProof(ctx, who, mapping._id, args.generation);
    } else {
      await freshProof(ctx, who, args.generation);
      const previous = (await accounts(ctx, who.userId)).find(
        (a: any) => a.provider === row.provider,
      );
      if (previous && previous.providerAccountId !== row.candidateSubject)
        throw new ConvexError(
          'A different identity is already linked. Unlink it first after verifying another method.',
        );
      const accountId = mapping
        ? mapping._id
        : await ctx.db.insert('authAccounts', {
            userId: who.userId,
            provider: row.provider,
            providerAccountId: row.candidateSubject,
          });
      const label = await ctx.db
        .query('collo_account_labels')
        .withIndex('by_account', (q) => q.eq('accountId', accountId))
        .unique();
      if (label) await ctx.db.patch(label._id, { label: row.candidateLabel! });
      else await ctx.db.insert('collo_account_labels', { accountId, label: row.candidateLabel! });
    }
    await ctx.db.patch(row._id, { status: 'completed' });
    return { completed: true };
  },
});
export const cancel = mutation({
  args: { attemptId: v.string(), challenge: v.string(), generation: v.string() },
  handler: async (ctx, args) => {
    const { row } = await owned(ctx, args);
    if (row.status === 'completed') return;
    await ctx.db.patch(row._id, { status: 'cancelled' });
    if (row.verifierId && (await ctx.db.get(row.verifierId))) await ctx.db.delete(row.verifierId);
  },
});
export const unlink = mutation({
  args: { accountId: v.id('authAccounts'), generation: v.string() },
  handler: async (ctx, args) => {
    const who = await identity(ctx);
    await freshProof(ctx, who, args.generation);
    const account = await ctx.db.get(args.accountId);
    if (
      !account ||
      account.userId !== who.userId ||
      !['github', 'google'].includes(account.provider)
    )
      throw new ConvexError('This login method cannot be removed.');
    const remaining = (await accounts(ctx, who.userId)).filter(
      (a: any) =>
        a._id !== account._id &&
        (a.provider === 'password'
          ? !!a.secret
          : ['github', 'google'].includes(a.provider) && configured(a.provider)),
    );
    if (!remaining.length)
      throw new ConvexError('Keep at least one verified, currently available login method.');
    const codes = await ctx.db
      .query('authVerificationCodes')
      .withIndex('accountId', (q) => q.eq('accountId', account._id))
      .collect();
    for (const code of codes) await ctx.db.delete(code._id);
    const label = await ctx.db
      .query('collo_account_labels')
      .withIndex('by_account', (q) => q.eq('accountId', account._id))
      .unique();
    if (label) await ctx.db.delete(label._id);
    await ctx.db.delete(account._id);
    return { removed: true };
  },
});
