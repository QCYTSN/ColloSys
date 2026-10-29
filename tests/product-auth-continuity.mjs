// Real local sign-in/out. No token values, test credentials or auth state are
// written to evidence; only boolean presence and the actual rendered fonts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account } from './product-ui-refinement-data.mjs';
const expect = baseExpect.configure({ timeout: 30000 });
const out = process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/completion/auth';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: '.local/completion-auth-video', size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const checks = [];
try {
  await page.goto('http://127.0.0.1:3407/login');
  await expect(page.locator('#email')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const dom = await cdp.send('DOM.getDocument');
  const node = await cdp.send('DOM.querySelector', {
    nodeId: dom.root.nodeId,
    selector: '.collo-auth-step h1',
  });
  const fonts = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: node.nodeId });
  assert.ok(fonts.fonts.some((f) => f.isCustomFont && f.familyName.includes('Google Sans')));
  await fs.writeFile(out + '/english-fonts.json', JSON.stringify(fonts, null, 2));
  for (let i = 0; i < 3; i++) {
    const credentials = i === 1 ? account.b : account.a;
    await page.locator('#email').fill(credentials.email);
    await page.locator('#password').fill(credentials.password);
    await page.locator('form button[type=submit]').click();
    await expect(page.locator('.collo-projects')).toBeVisible();
    const sibling = await context.newPage();
    await sibling.goto('http://127.0.0.1:3407/projects');
    await expect(sibling.locator('.collo-projects')).toBeVisible();
    await expect(async () => {
      if (!(await page.getByRole('button', { name: 'Sign out', exact: true }).isVisible()))
        await page.getByRole('button', { name: 'User menu', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible({
        timeout: 500,
      });
    }).toPass({ timeout: 15000 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    for (const p of [page, sibling]) {
      await expect(p.locator('#email')).toBeVisible();
      await expect(p.locator('.collo-projects')).toHaveCount(0);
      assert.equal(
        await p.evaluate(() =>
          Object.keys(localStorage).some(
            (k) => k.startsWith('__convexAuthJWT') && localStorage.getItem(k),
          ),
        ),
        false,
      );
    }
    await page.reload();
    await expect(page.locator('#email')).toBeVisible();
    await sibling.close();
    checks.push(`Real logout cycle ${i + 1}: both windows clear, reloading stays signed out`);
    console.log('PASS', checks.at(-1));
  }
  await page.screenshot({ path: out + '/signed-out.png' });
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify({ passed: true, checks, at: new Date().toISOString() }, null, 2),
  );
} catch (e) {
  const states = [];
  for (const p of context.pages())
    states.push(
      await p.evaluate(() => {
        const el = document.querySelector('.collo-shell,.collo-auth-layout');
        let f = el?.[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
        const providers = [];
        while (f) {
          const v = f.memoizedProps?.value;
          if (v && typeof v === 'object' && ('isAuthenticated' in v || 'token' in v))
            providers.push({
              isAuthenticated: v.isAuthenticated,
              isLoading: v.isLoading,
              hasToken: typeof v.token === 'string',
            });
          f = f.return;
        }
        return {
          path: location.pathname,
          jwtPresent: Object.keys(localStorage).some(
            (k) => k.startsWith('__convexAuthJWT') && localStorage.getItem(k),
          ),
          markers: Object.fromEntries(
            Object.keys(localStorage)
              .filter((k) => k.startsWith('collo-auth-revision:'))
              .map((k) => [k, localStorage.getItem(k)?.split(':')[0]]),
          ),
          providers,
        };
      }),
    );
  await fs.writeFile(out + '/failure-state.json', JSON.stringify(states, null, 2));
  await page.screenshot({ path: out + '/failure.png' }).catch(() => {});
  throw e;
} finally {
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(out + '/continuity.webm');
  await browser.close();
}
