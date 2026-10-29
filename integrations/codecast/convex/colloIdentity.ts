import { convexAuth, type ConvexAuthConfig } from '@convex-dev/auth/server';
import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import { createAuthConfig } from '@platform/auth/convex';
import { query } from './_generated/server';
import { internal } from './_generated/api';
import { advanceCurrentUserViewRevision } from './principalViewRevisions';
import { deliver } from './emails/send';
import { passwordReset, verifyEmail } from './emails/templates';
import type { MutationCtx } from './_generated/server';

export function providerConfigured(provider: 'github' | 'google') {
  const prefix = `AUTH_${provider.toUpperCase()}`;
  return !!process.env[`${prefix}_ID`] && !!process.env[`${prefix}_SECRET`];
}

// Convex Auth has already verified the provider subject and located its
// authAccounts row before invoking this callback. Email is profile data, not
// an account key. Existing provider mappings remain intact during this upgrade.
export const updateProductIdentity: NonNullable<
  NonNullable<ConvexAuthConfig['callbacks']>['createOrUpdateUser']
> = async (ctx, args) => {
  const { existingUserId, type, provider, profile } = args;
  const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : undefined;
  const verified =
    profile.emailVerified === true && !!email && (type === 'oauth' || type === 'verification');
  let userId = existingUserId;
  if (userId && !(await ctx.db.get(userId))) throw new Error('Account no longer exists');
  if (!userId) {
    if (email) {
      const collision = await (ctx.db as MutationCtx['db'])
        .query('users')
        .withIndex('email', (q) => q.eq('email', email))
        .first();
      if (collision)
        throw new Error(
          'An account already uses this email. Sign in with its original method. Automatic account linking is unavailable.',
        );
    }
    userId = await ctx.db.insert('users', {
      ...(email ? { email } : {}),
      ...(typeof profile.name === 'string' ? { name: profile.name.slice(0, 200) } : {}),
      ...(typeof profile.image === 'string' && profile.image.startsWith('https://')
        ? { image: profile.image }
        : {}),
      ...(verified ? { emailVerificationTime: Date.now() } : {}),
      created_at: Date.now(),
    });
    await advanceCurrentUserViewRevision(ctx.db as any, userId as any);
  } else {
    const user = await ctx.db.get(userId);
    if (
      verified &&
      user &&
      user.email?.trim().toLowerCase() === email &&
      !user.emailVerificationTime
    ) {
      await ctx.db.patch(userId, { emailVerificationTime: Date.now() });
      await advanceCurrentUserViewRevision(ctx.db as any, userId as any);
    }
  }
  if (type === 'oauth' && (provider.id === 'github' || provider.id === 'google')) {
    const db = ctx.db as any;
    const proof = await db
      .query('collo_identity_proofs')
      .withIndex('by_identity', (q: any) => q.eq('userId', userId).eq('provider', provider.id))
      .unique();
    if (proof) await db.patch(proof._id, { verifiedAt: Date.now() });
    else
      await db.insert('collo_identity_proofs', {
        userId,
        provider: provider.id,
        verifiedAt: Date.now(),
      });
  }
  return userId;
};

export function productAuthConfig(): ConvexAuthConfig {
  const config = createAuthConfig({
    redirect: { deepLinkSchemes: [] },
    ...(providerConfigured('github') ? { github: { scope: 'read:user user:email' } } : {}),
    ...(providerConfigured('google') ? { google: { scope: 'openid email profile' } } : {}),
    password: {
      async sendOtp({ email, code, kind }) {
        if (!process.env.RESEND_API_KEY)
          throw new Error('Email recovery is not configured for this service');
        await deliver(
          email,
          kind === 'password-reset' ? passwordReset({ code, email }) : verifyEmail({ code, email }),
          kind,
        );
      },
    },
  });
  // Use state for request binding and S256 PKCE for code interception defence;
  // Google's OIDC nonce is verified by the installed Convex Auth callback.
  for (const provider of config.providers as any[]) {
    if (provider.id === 'github' || provider.options?.id === 'github')
      provider.checks = ['state', 'pkce'];
    if (provider.id === 'google' || provider.options?.id === 'google')
      provider.checks = ['state', 'pkce', 'nonce'];
  }
  config.callbacks = {
    ...config.callbacks,
    createOrUpdateUser: updateProductIdentity,
    redirect: async ({ redirectTo }) => {
      const site = new URL(process.env.SITE_URL!);
      if (
        !['http:', 'https:'].includes(site.protocol) ||
        site.username ||
        site.password ||
        /[\\\u0000-\u0020\u007f]/.test(redirectTo)
      )
        throw new Error('Invalid sign-in destination');
      const url = new URL(redirectTo, site);
      if (
        url.origin !== site.origin ||
        !['/auth/complete', '/auth/desktop'].includes(url.pathname) ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error('Invalid sign-in destination');
      return url.href;
    },
  };
  config.providers.push(
    ConvexCredentials({
      id: 'collosys-desktop-v1',
      authorize: async (args, ctx) => {
        if (typeof args.attemptId !== 'string' || typeof args.claimSecret !== 'string')
          throw new Error('Invalid desktop request');
        return ctx.runMutation((internal as any).colloAuthRelay.claim, {
          attemptId: args.attemptId,
          claimSecret: args.claimSecret,
        });
      },
    }),
  );
  return config;
}
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth(productAuthConfig());
export const signInProviders = query({
  args: {},
  handler: async () => ({
    github: providerConfigured('github'),
    google: providerConfigured('google'),
    password: true,
    emailRecovery: !!process.env.RESEND_API_KEY,
    version: 1,
  }),
});
