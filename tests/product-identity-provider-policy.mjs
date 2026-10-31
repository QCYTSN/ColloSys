// Synthetic callback-policy inputs against the actual prepared implementation.
// No provider request, credential or OAuth-success claim is involved.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  updateProductIdentity,
  productAuthConfig,
} from '../.local/codecast-app/source/packages/convex/convex/colloIdentity';
import { makeFakeDb } from '../.local/codecast-app/source/platform/packages/auth/src/convex/testDb';
process.env.SITE_URL = 'http://127.0.0.1:3407';
process.env.AUTH_GITHUB_ID = 'TEST-unused-client';
process.env.AUTH_GITHUB_SECRET = 'TEST-unused-secret';
process.env.AUTH_GOOGLE_ID = 'TEST-unused-client';
process.env.AUTH_GOOGLE_SECRET = 'TEST-unused-secret';
const config = productAuthConfig(),
  checks = [];
const providers = config.providers;
const github = providers.find((p) => p.id === 'github' || p.options?.id === 'github');
const google = providers.find((p) => p.id === 'google' || p.options?.id === 'google');
assert.deepEqual(github.checks, ['state', 'pkce']);
assert.deepEqual(google.checks, ['state', 'pkce', 'nonce']);
assert.equal(github.options.authorization.params.scope, 'read:user user:email');
checks.push('Installed provider config keeps login-only scopes, state/PKCE and Google nonce');
const redirect = config.callbacks.redirect;
for (const redirectTo of [
  'https://evil.invalid',
  '//evil.invalid',
  '/auth/complete#token',
  '/auth/desktop\\evil',
  '/projects',
  '/login',
  'http://user@127.0.0.1:3407/auth/complete',
])
  await assert.rejects(redirect({ redirectTo }));
assert.equal(
  await redirect({ redirectTo: '/auth/desktop?attempt=TEST-request' }),
  'http://127.0.0.1:3407/auth/desktop?attempt=TEST-request',
);
checks.push(
  'Exact service callback allowlist rejects external, credential, fragment and unrelated routes',
);
const original = { _id: 'users:a', email: 'a@example.invalid', name: 'Original account' };
const db = makeFakeDb({ users: [original, { _id: 'users:b', email: 'b@example.invalid' }] });
const base = {
  type: 'oauth',
  provider: { id: 'github' },
  profile: {
    email: 'b@example.invalid',
    emailVerified: true,
    name: 'Different name',
    access_token: 'TEST-not-a-token',
  },
};
const id = await updateProductIdentity({ db }, { ...base, existingUserId: 'users:a' });
assert.equal(id, 'users:a');
assert.equal((await db.get(id)).email, 'a@example.invalid');
assert.equal((await db.get(id)).name, 'Original account');
assert.equal((await db.get(id)).access_token, undefined);
checks.push(
  'Previously verified provider subject retains its account despite changed email/display name; provider tokens are not persisted',
);
await assert.rejects(
  updateProductIdentity({ db }, { ...base, existingUserId: null }),
  /original method/,
);
await assert.rejects(
  updateProductIdentity({ db }, { ...base, existingUserId: 'users:missing' }),
  /no longer exists/,
);
checks.push(
  'Verified email alone cannot merge accounts; removed provider account cannot be revived',
);
const out =
  process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/identity-motion/evidence/security';
await fs.mkdir(out, { recursive: true });
await fs.writeFile(
  out + '/provider-policy.json',
  JSON.stringify(
    {
      checks,
      boundary:
        'Synthetic provider callback/profile inputs and fake DB; actual installed product implementation. Not real OAuth verification.',
    },
    null,
    2,
  ),
);
checks.forEach((c) => console.log('PASS', c));
