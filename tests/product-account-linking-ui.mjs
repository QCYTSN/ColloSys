// Actual account-settings UI + backend. Only external proof is injected after
// the real session-bound verifier has been created. No provider network call.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium, expect as baseExpect } from '@playwright/test';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';
const out = 'docs/product-ui/auth-completion/evidence/linking-ui';
await fs.mkdir(out, { recursive: true });
const expect = baseExpect.configure({ timeout: 45000 });
const env = parseEnv(await fs.readFile('.local/codecast-app/local.env', 'utf8'));
assert.equal(env.CONVEX_SELF_HOSTED_URL, 'http://127.0.0.1:3408');
const admin = new ConvexHttpClient(env.CONVEX_SELF_HOSTED_URL);
admin.setAdminAuth(env.CONVEX_SELF_HOSTED_ADMIN_KEY);
const keys = ['AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'];
assert.ok(
  (
    await Promise.all(
      keys.map((name) => admin.query('_system/cli/queryEnvironmentVariables:get', { name })),
    )
  ).every((v) => !v),
);
const configure = async (enabled) => {
  const r = await fetch(env.CONVEX_SELF_HOSTED_URL + '/api/update_environment_variables', {
    method: 'POST',
    headers: {
      Authorization: `Convex ${env.CONVEX_SELF_HOSTED_ADMIN_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      changes: keys.map((name) => (enabled ? { name, value: 'TEST-unused-controlled' } : { name })),
    }),
  });
  assert.ok(r.ok);
};
const signup = async () => {
  const email = `link-ui-${randomUUID()}@example.invalid`,
    password = randomBytes(24).toString('hex'),
    client = new ConvexHttpClient(env.CONVEX_SELF_HOSTED_URL);
  const signed = await client.action('auth:signIn', {
    provider: 'password',
    params: { email, password, flow: 'signUp' },
  });
  client.setAuth(signed.tokens.token);
  return {
    email,
    password,
    client,
    userId: (await client.query('colloAuthSession:current', {})).userId,
  };
};
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const checks = [];
let context, other;
const current = (page) =>
  page.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('__convexAuthJWT'));
    const r = await fetch('http://127.0.0.1:3408/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + localStorage.getItem(key),
      },
      body: JSON.stringify({ path: 'colloAuthSession:current', args: {}, format: 'json' }),
    });
    return (await r.json()).value;
  });
try {
  await configure(true);
  const a = await signup(),
    b = await signup();
  const project = await a.client.mutation('projects:webCreate', {
    title: 'TEST linked account UI continuity',
    workspace: 'personal',
  });
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: '.local/auth-link-ui-video', size: { width: 1440, height: 900 } },
  });
  other = await browser.newContext();
  const page = await context.newPage(),
    bpage = await other.newPage();
  const login = async (p, u) => {
    await p.goto('http://127.0.0.1:3407/login', { timeout: 120000 });
    await p.locator('#email').fill(u.email);
    await p.locator('#password').fill(u.password);
    await p.locator('form button[type=submit]').click();
    await expect(p.locator('.collo-projects')).toBeVisible();
  };
  await login(page, a);
  await login(bpage, b);
  await page.locator('.collo-settings-button').click();
  await expect(page.locator('.collo-login-methods')).toBeVisible();
  await page.locator('#collo-current-password').fill(a.password);
  await page
    .locator('.collo-method-reverify')
    .getByRole('button', { name: 'Verify', exact: true })
    .click();
  await expect(page.locator('.collo-login-methods')).toContainText(
    'Identity verified for the next five minutes.',
  );
  for (const provider of ['github', 'google']) {
    const label = provider === 'github' ? 'GitHub' : 'Google',
      row = page
        .locator('.collo-login-method')
        .filter({ has: page.getByRole('heading', { name: label, exact: true }) });
    const opened = context.waitForEvent('page');
    await row.getByRole('button', { name: 'Link', exact: true }).click();
    const popup = await opened;
    await popup.waitForURL(/auth\/link\?attempt=/);
    const attemptId = new URL(popup.url()).searchParams.get('attempt');
    await expect(
      popup.getByRole('button', { name: `Continue with ${label}`, exact: true }),
    ).toBeVisible();
    const result = await a.client.mutation('colloAccountLinks:beginProvider', { attemptId });
    const verifier = new URL(result.redirect).searchParams.get('code'),
      signature = randomUUID();
    await admin.mutation('auth:store', {
      args: { type: 'verifierSignature', verifier, signature },
    });
    await admin.mutation('auth:store', {
      args: {
        type: 'userOAuth',
        provider,
        providerAccountId: 'TEST-UI-' + randomUUID(),
        signature,
        profile: { name: 'TEST linked ' + label, email: a.email, emailVerified: true },
      },
    });
    await bpage.goto(`http://127.0.0.1:3407/auth/link?attempt=${attemptId}&code=link-complete`);
    await expect(bpage.getByRole('heading', { name: 'Return to ColloSys' })).toBeVisible();
    assert.equal(new URL(bpage.url()).searchParams.has('code'), false);
    assert.equal((await current(bpage)).userId, b.userId);
    await expect(page.locator('.collo-method-pending')).toContainText('TEST linked ' + label);
    await page
      .locator('.collo-method-pending')
      .getByRole('button', { name: 'Confirm link', exact: true })
      .click();
    await expect(row.getByRole('button', { name: 'Reverify', exact: true })).toBeVisible();
    assert.equal((await current(page)).userId, a.userId);
    await page.screenshot({ path: `${out}/${provider}-linked.png` });
    await popup.close();
    checks.push(
      `${label}: password-verified account links through actual settings, explicit verified-identity confirmation and real authAccounts persistence; callback page in another signed-in browser preserves that other account.`,
    );
  }
  assert.equal(
    (await a.client.query('projects:webGet', { id: project.id })).title,
    'TEST linked account UI continuity',
  );
  const githubRow = page
    .locator('.collo-login-method')
    .filter({ has: page.getByRole('heading', { name: 'GitHub', exact: true }) });
  await githubRow.getByRole('button', { name: 'Unlink', exact: true }).click();
  await expect(
    page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Unlink GitHub?' }) }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Unlink login method', exact: true }).click();
  await expect(githubRow.getByRole('button', { name: 'Link', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.reload();
  await expect(page.locator('.collo-projects')).toBeVisible();
  assert.equal((await current(page)).userId, a.userId);
  checks.push(
    'Actual confirmation dialog unlinks GitHub while password and Google remain; reloaded session and original project remain on the same internal user.',
  );
  const video = page.video();
  await context.close();
  context = null;
  await video.saveAs(out + '/settings-linking.webm');
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        checks,
        boundary:
          'Actual UI and local persistent backend with two independent signed-in browser accounts. External provider proof is controlled at the internal SDK persistence boundary; no real provider authorization is claimed.',
      },
      null,
      2,
    ),
  );
  checks.forEach((c) => console.log('PASS', c));
} finally {
  await configure(false);
  await context?.close();
  await other?.close();
  await browser.close();
}
