// Real loopback backend, SDK account/session persistence and isolated TEST users.
// Only the post-OAuth provider proof is injected; NOT a real provider round trip.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';
const out = 'docs/product-ui/auth-completion/evidence/security';
const privateDir = path.resolve('.local', 'account-links-' + randomUUID());
await fs.mkdir(out, { recursive: true });
await fs.mkdir(privateDir);
const env = {
  ...process.env,
  ...parseEnv(await fs.readFile('.local/codecast-app/local.env', 'utf8')),
};
const url = env.CONVEX_SELF_HOSTED_URL;
assert.equal(url, 'http://127.0.0.1:3408');
const quiet = { log() {}, warn() {}, error() {}, logVerbose() {} };
const client = () => new ConvexHttpClient(url, { logger: quiet });
const admin = client();
admin.setAdminAuth(env.CONVEX_SELF_HOSTED_ADMIN_KEY);
const anonymous = client();
const keys = ['AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'];
const originals = await Promise.all(
  keys.map((name) => admin.query('_system/cli/queryEnvironmentVariables:get', { name })),
);
assert.ok(
  originals.every((v) => !v),
  'Controlled credential fixture must not replace configured real providers.',
);
const update = async (changes) => {
  const r = await fetch(url + '/api/update_environment_variables', {
    method: 'POST',
    headers: {
      Authorization: `Convex ${env.CONVEX_SELF_HOSTED_ADMIN_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ changes }),
  });
  assert.ok(r.ok, 'Local environment update failed');
};
const checks = [];
const check = async (name, run) => {
  await run();
  checks.push(name);
  console.log('PASS', name);
};
const hash = (s) => createHash('sha256').update(s).digest('hex');
const store = (args) => admin.mutation('auth:store', { args });
const append = async (table, rows) => {
  const file = path.join(privateDir, table + '-' + randomUUID() + '.json');
  await fs.writeFile(file, JSON.stringify(rows));
  await promisify(execFile)(
    process.execPath,
    [
      path.resolve('.local/codecast-app/source/packages/convex/node_modules/convex/bin/main.js'),
      'import',
      '--table',
      table,
      '--append',
      file,
    ],
    {
      env,
      cwd: path.resolve('.local/codecast-app/source/packages/convex'),
      windowsHide: true,
      timeout: 120000,
    },
  );
};
const signup = async () => {
  const c = client(),
    email = `links-${randomUUID()}@example.invalid`,
    password = randomBytes(24).toString('hex');
  const signed = await c.action('auth:signIn', {
    provider: 'password',
    params: { email, password, flow: 'signUp' },
  });
  assert.ok(signed.tokens?.token);
  c.setAuth(signed.tokens.token);
  const who = await c.query('colloAuthSession:current', {});
  const sessionId = JSON.parse(
    Buffer.from(signed.tokens.token.split('.')[1], 'base64url'),
  ).sub.split('|')[1];
  return { client: c, password, email, userId: who.userId, sessionId, generation: randomUUID() };
};
const verify = (a) =>
  a.client.action('colloAccountLinks:reverifyPassword', {
    password: a.password,
    generation: a.generation,
  });
const args = (r) => ({ attemptId: r.attemptId, challenge: r.challenge, generation: r.generation });
const start = async (a, provider = 'github', purpose = 'link') => {
  const r = {
    attemptId: randomUUID(),
    challenge: randomBytes(32).toString('hex'),
    generation: a.generation,
    provider,
    purpose,
  };
  await a.client.mutation('colloAccountLinks:create', {
    attemptId: r.attemptId,
    challengeHash: hash(r.challenge),
    generation: r.generation,
    provider,
    purpose,
  });
  const opened = await anonymous.mutation('colloAccountLinks:beginProvider', {
    attemptId: r.attemptId,
  });
  const verifier = new URL(opened.redirect).searchParams.get('code'),
    signature = randomUUID();
  await store({ type: 'verifierSignature', verifier, signature });
  return { ...r, signature, verifier };
};
const proof = (r, subject, email = 'proof@example.invalid') =>
  store({
    type: 'userOAuth',
    provider: r.provider,
    providerAccountId: subject,
    signature: r.signature,
    profile: { name: 'TEST verified identity', email, emailVerified: true },
  });
const confirm = (a, r) => a.client.mutation('colloAccountLinks:confirm', args(r));
const methods = (a) => a.client.query('colloAccountLinks:methods', {});
const loginProvider = async (provider, subject, email) => {
  const result = await anonymous.action('auth:signIn', {
    provider,
    params: { redirectTo: '/auth/complete' },
  });
  assert.ok(result.verifier);
  const signature = randomUUID();
  await store({ type: 'verifierSignature', verifier: result.verifier, signature });
  const code = await store({
    type: 'userOAuth',
    provider,
    providerAccountId: subject,
    signature,
    profile: { email, emailVerified: true, name: 'TEST changed name' },
  });
  const signed = await anonymous.action('auth:signIn', {
    params: { code },
    verifier: result.verifier,
  });
  assert.ok(signed.tokens?.token);
  const c = client();
  c.setAuth(signed.tokens.token);
  return c;
};
try {
  await update(keys.map((name) => ({ name, value: 'TEST-controlled-unused' })));
  const a = await signup(),
    b = await signup();
  const project = await a.client.mutation('projects:webCreate', {
    title: 'TEST account linkage continuity',
    workspace: 'personal',
  });
  await check(
    'Anonymous and missing/stolen/wrong-password re-verification cannot link',
    async () => {
      await assert.rejects(start(a));
      await assert.rejects(
        a.client.action('colloAccountLinks:reverifyPassword', {
          password: b.password,
          generation: a.generation,
        }),
      );
      await assert.rejects(
        anonymous.action('colloAccountLinks:reverifyPassword', {
          password: a.password,
          generation: a.generation,
        }),
      );
      await verify(a);
      await verify(b);
    },
  );
  const subjects = { github: 'TEST-gh-' + randomUUID(), google: 'TEST-google-' + randomUUID() };
  for (const provider of ['github', 'google'])
    await check(
      `${provider}: session-bound staged link, callback replay, same-account SDK login and project continuity`,
      async () => {
        const r = await start(a, provider);
        const publicState = await anonymous.query('colloAccountLinks:browserStatus', {
          attemptId: r.attemptId,
        });
        assert.equal(publicState.userId, undefined);
        assert.equal(await proof(r, subjects[provider], a.email), 'link-complete');
        assert.equal(await proof(r, subjects[provider], a.email), 'link-complete');
        await assert.rejects(proof(r, 'TEST-different-subject'));
        assert.equal(
          (await methods(a)).methods.some((m) => m.provider === provider),
          false,
          'Callback cannot link without explicit originating-window confirmation',
        );
        await assert.rejects(confirm(b, r));
        await assert.rejects(anonymous.mutation('colloAccountLinks:confirm', args(r)));
        await assert.rejects(confirm(a, { ...r, challenge: randomBytes(32).toString('hex') }));
        await assert.rejects(confirm(a, { ...r, generation: 'wrong-generation' }));
        await confirm(a, r);
        await confirm(a, r);
        assert.equal((await methods(a)).methods.filter((m) => m.provider === provider).length, 1);
        const logged = await loginProvider(
          provider,
          subjects[provider],
          'changed-' + randomUUID() + '@example.invalid',
        );
        assert.equal((await logged.query('colloAuthSession:current', {})).userId, a.userId);
        assert.equal(
          (await logged.query('projects:webGet', { id: project.id })).title,
          'TEST account linkage continuity',
        );
        await logged.action('auth:signOut', {});
      },
    );
  await check(
    'A provider identity mapped to another account is rejected without retargeting data',
    async () => {
      const r = await start(b);
      await proof(r, subjects.github);
      assert.equal((await b.client.query('colloAccountLinks:mine', args(r))).status, 'failed');
      await assert.rejects(confirm(b, r));
      assert.equal((await methods(b)).methods.length, 1);
    },
  );
  await check(
    'Verified email collision never silently merges unrelated provider accounts',
    async () => {
      await assert.rejects(
        loginProvider('github', 'TEST-unlinked-' + randomUUID(), a.email),
        /original method|email/,
      );
    },
  );
  await check(
    'Cancelled, expired and revoked originating sessions cannot finish a link',
    async () => {
      const cancelled = await start(b);
      await b.client.mutation('colloAccountLinks:cancel', args(cancelled));
      await assert.rejects(proof(cancelled, 'TEST-cancelled'));
      await assert.rejects(confirm(b, cancelled));
      const expired = {
        attemptId: randomUUID(),
        challenge: randomBytes(32).toString('hex'),
        generation: b.generation,
      };
      await append('collo_account_links', [
        {
          attemptId: expired.attemptId,
          challengeHash: hash(expired.challenge),
          generation: b.generation,
          userId: b.userId,
          sessionId: b.sessionId,
          provider: 'github',
          purpose: 'link',
          status: 'verified',
          candidateSubject: 'TEST-expired',
          candidateLabel: 'TEST expired',
          createdAt: Date.now() - 400000,
          expiresAt: Date.now() - 1000,
        },
      ]);
      await assert.rejects(confirm(b, expired));
      const c = await signup();
      await verify(c);
      const r = await start(c);
      await c.client.action('auth:signOut', {});
      await assert.rejects(proof(r, 'TEST-revoked'));
      await assert.rejects(confirm(c, r));
    },
  );
  await check(
    'Two accounts racing for one stable provider identity have exactly one winner',
    async () => {
      const c = await signup(),
        d = await signup();
      await verify(c);
      await verify(d);
      const cr = await start(c),
        dr = await start(d),
        subject = 'TEST-race-' + randomUUID();
      await proof(cr, subject);
      await proof(dr, subject);
      const results = await Promise.allSettled([confirm(c, cr), confirm(d, dr)]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        (await methods(c)).methods.filter((m) => m.provider === 'github').length +
          (await methods(d)).methods.filter((m) => m.provider === 'github').length,
        1,
      );
    },
  );
  await check(
    'Link confirmation rechecks recent original-method proof, not only creation-time proof',
    async () => {
      const c = await signup(),
        passwordMethod = (await methods(c)).methods[0];
      await append('collo_reauth_proofs', [
        {
          userId: c.userId,
          sessionId: c.sessionId,
          accountId: passwordMethod.accountId,
          generation: c.generation,
          verifiedAt: Date.now() - 400000,
        },
      ]);
      const r = {
        attemptId: randomUUID(),
        challenge: randomBytes(32).toString('hex'),
        generation: c.generation,
      };
      await append('collo_account_links', [
        {
          attemptId: r.attemptId,
          challengeHash: hash(r.challenge),
          generation: c.generation,
          userId: c.userId,
          sessionId: c.sessionId,
          provider: 'github',
          purpose: 'link',
          status: 'verified',
          candidateSubject: 'TEST-stale-proof',
          candidateLabel: 'TEST stale proof',
          createdAt: Date.now() - 400000,
          expiresAt: Date.now() + 60000,
        },
      ]);
      await assert.rejects(confirm(c, r), /Verify an existing/);
    },
  );
  await check('Provider re-verification needs its already-linked stable identity', async () => {
    const bad = await start(a, 'github', 'reauthenticate');
    await proof(bad, 'TEST-wrong-original');
    await assert.rejects(confirm(a, bad));
    const r = await start(a, 'github', 'reauthenticate');
    await proof(r, subjects.github);
    await confirm(a, r);
    const github = (await methods(a)).methods.find((m) => m.provider === 'github');
    await a.client.mutation('colloAccountLinks:unlink', {
      accountId: github.accountId,
      generation: a.generation,
    });
    assert.equal(
      (await methods(a)).methods.some((m) => m.provider === 'github'),
      false,
    );
  });
  await check('Backend rejects removing the last available verified method', async () => {
    const subject = 'TEST-provider-only-' + randomUUID();
    const c = await loginProvider('github', subject, 'only-' + randomUUID() + '@example.invalid');
    const account = { client: c, generation: randomUUID() };
    const r = await start(account, 'github', 'reauthenticate');
    await proof(r, subject);
    await confirm(account, r);
    const github = (await methods(account)).methods.find((m) => m.provider === 'github');
    await assert.rejects(
      c.mutation('colloAccountLinks:unlink', {
        accountId: github.accountId,
        generation: account.generation,
      }),
      /at least one/,
    );
    await assert.rejects(anonymous.mutation('auth:store', { args: { type: 'verifier' } }));
  });
} finally {
  await update(
    keys.map((name, i) => (originals[i] ? { name, value: originals[i].value } : { name })),
  );
  const restored = await anonymous.query('auth:signInProviders', {});
  assert.equal(restored.github, false);
  assert.equal(restored.google, false);
  await fs.writeFile(
    out + '/account-linking.json',
    JSON.stringify(
      {
        checks,
        boundary:
          'Real local Convex backend, authAccounts mappings and SDK sessions. TEST provider proof injected at the internal persistence boundary; no external authorization. Temporary TEST provider settings removed in finally; real credentials were never replaced.',
      },
      null,
      2,
    ),
  );
}
