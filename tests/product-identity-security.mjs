// Real local backend; only provider-proof input is synthetic. Never prints tokens.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { parseEnv, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';
import { account, signIn, denseFixture } from './product-ui-refinement-data.mjs';
const out = process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/identity-motion/evidence/security';
await fs.mkdir(out, { recursive: true });
const privateDir = path.resolve('.local', 'identity-security-' + randomUUID());
await fs.mkdir(privateDir);
const env = { ...process.env, ...parseEnv(await fs.readFile('.local/codecast-app/local.env', 'utf8')) };
assert.equal(env.CONVEX_SELF_HOSTED_URL, 'http://127.0.0.1:3408');
const cli = path.resolve('.local/codecast-app/source/packages/convex/node_modules/convex/bin/main.js');
const append = async (table, rows) => {
  const file = path.join(privateDir, table + '.json');
  await fs.writeFile(file, JSON.stringify(rows));
  await promisify(execFile)(process.execPath, [cli, 'import', '--table', table, '--append', file], { env, cwd: path.resolve('.local/codecast-app/source/packages/convex'), windowsHide: true, timeout: 120000 });
};
const fresh = new ConvexHttpClient('http://127.0.0.1:3408');
const signup = await fresh.action('auth:signIn', { provider: 'password', params: { email: `identity-${randomUUID()}@example.invalid`, password: randomBytes(24).toString('hex'), flow: 'signUp' } });
assert.ok(signup.tokens?.token); fresh.setAuth(signup.tokens.token);
const current = await fresh.query('colloAuthSession:current', {}); assert.equal(current.status, 'verified');
const checks = [], check = async (name, run) => { await run(); checks.push(name); console.log('PASS', name); };
const attempts = Array.from({ length: 6 }, (_, i) => {
  const secret = randomBytes(32).toString('hex');
  return { secret, row: { version: 1, attemptId: randomUUID(), claimHash: createHash('sha256').update(secret).digest('hex'), provider: 'github', createdAt: Date.now() - 3000, expiresAt: Date.now() + (i === 3 ? -1000 : 300000), status: 'pending' } };
});
await append('collo_auth_attempts', attempts.map(a => a.row));
const anonymous = new ConvexHttpClient('http://127.0.0.1:3408');
const claim = a => anonymous.action('auth:signIn', { provider: 'collosys-desktop-v1', params: { attemptId: a.row.attemptId, claimSecret: a.secret } });
await check('Missing provider configuration is rejected by the real backend', async () => {
  const providers = await anonymous.query('auth:signInProviders', {});
  assert.equal(providers.github, false); assert.equal(providers.google, false);
  await assert.rejects(anonymous.mutation('colloAuthRelay:create', { attemptId: randomUUID(), provider: 'github', claimHash: attempts[0].row.claimHash }));
});
await check('Fresh provider proof required; anonymous approval and unapproved claims rejected', async () => {
  await assert.rejects(fresh.mutation('colloAuthRelay:authorize', { attemptId: attempts[0].row.attemptId }));
  await assert.rejects(anonymous.mutation('colloAuthRelay:authorize', { attemptId: attempts[0].row.attemptId }));
  await assert.rejects(claim(attempts[0]));
});
// Deliberately simulate only the external verification input. Everything after
// this is real Convex session issuance, permission checking and atomic state.
await append('collo_identity_proofs', [{ userId: current.userId, provider: 'github', verifiedAt: Date.now() }]);
await check('One authorized claim issues a real same-account ColloSys session; replay/wrong secret fail', async () => {
  const a = attempts[0]; await fresh.mutation('colloAuthRelay:authorize', { attemptId: a.row.attemptId });
  await assert.rejects(claim({ ...a, secret: randomBytes(32).toString('hex') }));
  const result = await claim(a); assert.ok(result.tokens?.token);
  const desktop = new ConvexHttpClient('http://127.0.0.1:3408'); desktop.setAuth(result.tokens.token);
  assert.equal((await desktop.query('colloAuthSession:current', {})).userId, current.userId);
  assert.equal((await anonymous.query('colloAuthRelay:status', { attemptId: a.row.attemptId })).status, 'consumed');
  await assert.rejects(claim(a)); await desktop.action('auth:signOut', {});
});
await check('Cancelled, expired and fabricated requests cannot yield sessions', async () => {
  await anonymous.mutation('colloAuthRelay:cancel', { attemptId: attempts[1].row.attemptId, claimSecret: attempts[1].secret });
  await assert.rejects(claim(attempts[1])); await assert.rejects(claim(attempts[3]));
  await assert.rejects(fresh.mutation('colloAuthRelay:authorize', { attemptId: attempts[3].row.attemptId }));
  await assert.rejects(claim({ secret: attempts[1].secret, row: { attemptId: randomUUID() } }));
});
await check('Revoking the authorizing session prevents a later desktop claim', async () => {
  const a = attempts[4]; await fresh.mutation('colloAuthRelay:authorize', { attemptId: a.row.attemptId });
  await fresh.action('auth:signOut', {}); await assert.rejects(claim(a));
});
const f = await denseFixture(), a = await signIn(account.a), b = await signIn(account.b);
await check('Directory migration preserves IDs and references; repeated execution does not rewrite rows', async () => {
  const before = await a.client.query('collo:workspaces', { projectId: f.projectId });
  await a.client.mutation('colloDirectories:upgrade', { projectId: f.projectId });
  const second = await a.client.mutation('colloDirectories:upgrade', { projectId: f.projectId }); assert.equal(second.migrated, 0);
  const after = await a.client.query('colloDirectories:list', { projectId: f.projectId });
  assert.deepEqual(after.map(r => r.directoryId).sort(), before.map(r => r.workspaceId).sort());
  assert.ok(after.every(r => r.version === 1));
  const original = await a.client.query('collo:workspaces', { projectId: f.projectId });
  for (const row of before) { const now = original.find(r => r._id === row._id); assert.equal(now.workspaceId, row.workspaceId); assert.equal(now.userId, row.userId); assert.equal(now.label, row.label); }
});
await check('Existing project identity migration is idempotent and rejects cross-account mutation', async () => {
  const before = await a.client.query('projects:webGet', { id: f.projectId });
  await a.client.mutation('colloProjectIdentity:upgrade', { projectId: f.projectId });
  const after = await a.client.query('projects:webGet', { id: f.projectId });
  assert.equal(after.title, before.title); assert.equal(after.workspace, before.workspace); assert.equal(after.user_id, before.user_id);
  assert.equal((await a.client.mutation('colloProjectIdentity:upgrade', { projectId: f.projectId })).changed, false);
  const personal = await a.client.mutation('projects:webCreate', { title: 'TEST private migration', workspace: 'personal' });
  await assert.rejects(b.client.mutation('colloProjectIdentity:upgrade', { projectId: personal.id }));
  await assert.rejects(b.client.mutation('colloDirectories:upgrade', { projectId: personal.id }));
});
await check('An interrupted directory migration rolls back earlier writes in the same real transaction', async () => {
  const personal = await a.client.mutation('projects:webCreate', { title: 'TEST migration rollback only', workspace: 'personal' });
  const owner = (await a.client.query('colloAuthSession:current', {})).userId;
  const firstId = randomUUID(), secondId = randomUUID();
  const row = workspaceId => ({ workspaceId, projectId: personal.id, userId: owner, label: 'TEST rollback fixture', updatedAt: Date.now() });
  // Only isolated synthetic records are imported. No production fault-injection API.
  await append('collo_workspaces', [row(firstId)]);
  await append('collo_workspaces', [{ ...row(secondId), directoryVersion: 1, directoryId: 'TEST-deliberately-inconsistent' }]);
  const before = await a.client.query('collo:workspaces', { projectId: personal.id });
  assert.equal(before[0].workspaceId, firstId, 'Legacy row must be patched before the deliberately failing row');
  await assert.rejects(a.client.mutation('colloDirectories:upgrade', { projectId: personal.id }), /Directory identity mismatch/);
  assert.deepEqual(await a.client.query('collo:workspaces', { projectId: personal.id }), before);
});
await fs.writeFile(out + '/results.json', JSON.stringify({ checks, boundary: 'Actual loopback backend and sessions. External OAuth verification proof is seeded for isolated TEST account; this is NOT GitHub/Google end-to-end verification. No provider credentials configured.' }, null, 2));
