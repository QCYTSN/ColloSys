import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account } from './product-ui-refinement-data.mjs';
const expect = baseExpect.configure({ timeout: 45000 }), out = 'docs/product-ui/identity-motion/evidence/auth-races';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await context.newPage(), checks = [];
page.setDefaultNavigationTimeout(120000);
let release;
try {
  await page.goto('http://127.0.0.1:3407/login'); await page.locator('#email').fill(account.a.email); await page.locator('#password').fill(account.a.password); await page.locator('form button[type=submit]').click(); await expect(page.locator('.collo-projects')).toBeVisible();
  const sibling = await context.newPage(); await sibling.goto('http://127.0.0.1:3407/projects'); await expect(sibling.locator('.collo-projects')).toBeVisible();
  let intercepted = false;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('http://127.0.0.1:3408/api/action', async route => {
    const raw = route.request().postData() || '';
    if (!raw.includes('auth:signIn') || !raw.includes('refreshToken')) return route.continue();
    const reply = await route.fetch(); intercepted = true; await held; await route.fulfill({ response: reply }).catch(() => {});
  });
  await page.reload({ waitUntil: 'domcontentloaded' }); await expect.poll(() => intercepted).toBe(true);
  await expect(async () => {
    if (!await sibling.getByRole('button', { name: 'Sign out', exact: true }).isVisible()) await sibling.getByRole('button', { name: 'User menu', exact: true }).click();
    await expect(sibling.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15000 });
  await sibling.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(sibling.locator('#email')).toBeVisible();
  release(); await expect(page.locator('#email')).toBeVisible(); await page.waitForTimeout(500);
  for (const p of [page, sibling]) { await expect(p.locator('.collo-topbar')).toHaveCount(0); assert.equal(await p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('__convexAuthJWT_') && localStorage.getItem(k))), false); }
  await page.reload(); await expect(page.locator('#email')).toBeVisible(); checks.push('Actual SDK refresh response, held after real server response, released after sibling logout cannot restore JWT or workspace');
  await page.unroute('http://127.0.0.1:3408/api/action'); await sibling.close();
  await page.locator('#email').fill(account.a.email); await page.locator('#password').fill(account.a.password); await page.locator('form button[type=submit]').click(); await expect(page.locator('.collo-projects')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('collosys.verified-device.v1'))).toBe(true);
  await context.routeWebSocket('ws://127.0.0.1:3408/**', socket => socket.close());
  await context.route('http://127.0.0.1:3408/**', route => route.abort('internetdisconnected'));
  await page.reload(); await expect(page.getByRole('button', { name: 'Read saved work offline' })).toBeVisible(); await expect(page.locator('.collo-topbar')).toHaveCount(0);
  await page.screenshot({ path: out + '/offline-consent.png' });
  await page.getByRole('button', { name: 'Read saved work offline' }).click(); await expect(page.locator('.collo-topbar')).toBeVisible();
  checks.push('Controlled offline cold load needs consent for matching unexpired verified identity; saved local workspace remains readable');
  await fs.writeFile(out + '/results.json', JSON.stringify({ checks, boundary: 'Real password sessions and SDK. Controlled delay of real refresh response and controlled backend disconnection; no provider mocks.' }, null, 2));
  checks.forEach(c => console.log('PASS', c));
} finally { release?.(); await page.screenshot({ path: '.local/identity-auth-race-last.png' }).catch(() => {}); await context.close(); await browser.close(); }
