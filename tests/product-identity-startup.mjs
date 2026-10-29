import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, signIn } from './product-ui-refinement-data.mjs';
const expect = baseExpect.configure({ timeout: 45000 }), out = 'docs/product-ui/identity-motion/evidence/startup';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const checks = [], contexts = [];
const fresh = async (values = {}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); contexts.push(context);
  await context.addInitScript(values => {
    if (!sessionStorage.getItem('identity-test-seeded')) { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); sessionStorage.setItem('identity-test-seeded', '1'); }
    window.unauthorizedMounts = 0;
    new MutationObserver(() => { if (document.querySelector('.collo-topbar')) window.unauthorizedMounts++; }).observe(document, { childList: true, subtree: true });
  }, values);
  const page = await context.newPage(); page.setDefaultNavigationTimeout(120000);
  return { context, page };
};
const check = async (name, run) => { await run(); checks.push(name); console.log('PASS', name); };
const key = '__convexAuthJWT_http1270013408';
try {
  await check('Unsigned deep link retains path, query and anchor without mounting protected UI', async () => {
    const { page } = await fresh(); const target = '/projects/pj-missing?tab=sessions#TEST-anchor';
    await page.goto('http://127.0.0.1:3407' + target); await expect(page.locator('#email')).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.get('return_to'), target); assert.equal(await page.evaluate(() => window.unauthorizedMounts), 0);
    await page.screenshot({ path: out + '/signed-out-deep-link.png' });
  });
  for (const token of ['malformed-token', `x.${Buffer.from(JSON.stringify({ sub: 'unknown|unknown', exp: 1 })).toString('base64url')}.invalid`]) {
    await check('Untrusted or expired local token cannot expose workspace content', async () => {
      const { page } = await fresh({ [key]: token }); await page.goto('http://127.0.0.1:3407/projects'); await expect(page.locator('#email')).toBeVisible();
      assert.equal(await page.evaluate(() => window.unauthorizedMounts), 0);
    });
  }
  await check('A stale durable token cannot reopen an explicitly signed-out device', async () => {
    const session = await signIn(account.a); const { page } = await fresh({ [key]: session.token, 'collosys.auth.signed-out.v1': '1', 'collosys.auth.generation.v1': 'TEST-signed-out' });
    await page.goto('http://127.0.0.1:3407/projects'); await expect(page.locator('#email')).toBeVisible(); assert.equal(await page.evaluate(() => window.unauthorizedMounts), 0);
  });
  await check('Slow identity service has recovery controls and no protected flash (controlled transport)', async () => {
    const session = await signIn(account.a), { page, context } = await fresh({ [key]: session.token });
    await context.routeWebSocket('ws://127.0.0.1:3408/**', () => {});
    await page.goto('http://127.0.0.1:3407/projects'); await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.unauthorizedMounts), 0); await expect(page.getByRole('button', { name: 'Read saved work offline' })).toHaveCount(0);
    await page.screenshot({ path: out + '/service-recovery.png' });
    await page.getByRole('button', { name: 'Sign out on this device' }).click(); await expect(page.locator('#email')).toBeVisible();
  });
  await check('Real server session revocation hides already mounted workspace immediately on query update', async () => {
    const session = await signIn(account.a), { page } = await fresh();
    await page.goto('http://127.0.0.1:3407/login'); await page.locator('#email').fill(account.a.email); await page.locator('#password').fill(account.a.password); await page.locator('form button[type=submit]').click(); await expect(page.locator('.collo-projects')).toBeVisible();
    const active = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith('__convexAuthJWT_'))?.[1]);
    assert.ok(active); session.client.setAuth(active);
    await session.client.action('auth:signOut', {}); await expect(page.locator('#email')).toBeVisible(); await expect(page.locator('.collo-topbar')).toHaveCount(0);
    await page.reload(); await expect(page.locator('#email')).toBeVisible();
  });
  await check('Forged and expired OAuth callback show a retryable failure with no workspace', async () => {
    const { page } = await fresh(); await page.goto('http://127.0.0.1:3407/auth/complete?code=TEST-forged');
    await expect(page.getByRole('heading', { name: 'Sign-in did not finish' })).toBeVisible(); await expect(page.getByRole('link', { name: 'Return to sign in' })).toBeVisible();
    assert.equal(await page.evaluate(() => window.unauthorizedMounts), 0); await page.screenshot({ path: out + '/callback-rejected.png' });
  });
  await fs.writeFile(out + '/results.json', JSON.stringify({ checks, boundary: 'Actual product and loopback backend except explicitly blocked WebSocket transport. No synthetic provider success.' }, null, 2));
} finally { for (const context of contexts) await context.close(); await browser.close(); }
