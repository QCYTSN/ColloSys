import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account } from './product-ui-refinement-data.mjs';
const production = process.argv.includes('--production'),
  out = `docs/product-ui/menu-motion/evidence/login-${production ? 'production' : 'development'}`;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: '.local/identity-login-videos', size: { width: 1440, height: 900 } },
});
const page = await context.newPage(),
  expect = baseExpect.configure({ timeout: 60000 }),
  checks = [];
page.setDefaultNavigationTimeout(120000);
try {
  await page.goto('http://127.0.0.1:3407/login');
  await expect(page.locator('#email')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [1920, 1440, 1280, 960, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('form button[type=submit]')).toBeInViewport();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (width >= 960) {
        const box = await page.locator('.collo-auth-visual').boundingBox();
        assert.ok(box.width / width > 0.5 && box.width / width < 0.61);
      }
      await page.screenshot({ path: `${out}/${theme}-${width}.png`, animations: 'disabled' });
      if (theme === 'light' && width === 1440)
        await page.locator('.collo-auth-visual').screenshot({ path: `${out}/left-closeup.png`, animations: 'disabled' });
    }
  }
  checks.push(
    '1920/1440/1280/960/390 light and dark: form operable, no horizontal overflow, wide layout has substantive left scene',
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  const scene = page.locator('.collo-companion-scene');
  await page.locator('#email').focus();
  await expect(scene).toHaveAttribute('data-state', 'input-focused');
  await page.waitForTimeout(420);
  await page.screenshot({ path: out + '/input-focused.png' });
  await page.locator('#email').pressSequentially('TEST-typing@example.invalid', { delay: 28 });
  await page.locator('#password').focus();
  await expect(scene).toHaveAttribute('data-state', 'password-focused');
  await page.waitForTimeout(420);
  await page.screenshot({ path: out + '/password-focused.png' });
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await page.locator('#password').focus();
  await expect(scene).toHaveAttribute('data-state', 'password-focused');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  checks.push(
    'Real sequential typing and both password visibility states: focus uses field identity, not its contents or length.',
  );
  await page.evaluate(() => {
    window.__sceneStates = [];
    new MutationObserver(() => {
      const s = document.querySelector('.collo-companion-scene')?.getAttribute('data-state');
      if (s && window.__sceneStates.at(-1)?.state !== s)
        window.__sceneStates.push({ state: s, at: performance.now() });
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
  });
  await page.getByRole('button', { name: 'Google', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not configured');
  await page.screenshot({ path: out + '/provider-unavailable.png' });
  await page.locator('#email').fill('TEST-unknown@example.invalid');
  await page.locator('#password').fill('TEST-incorrect-password');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.collo-auth-error')).toBeVisible();
  await expect(scene).toHaveAttribute('data-state', 'recoverable-error');
  const states = await page.evaluate(() => window.__sceneStates);
  assert.ok(
    states.some((s) => s.state === 'submitting'),
    JSON.stringify(states),
  );
  await fs.writeFile(out + '/actual-email-states.json', JSON.stringify(states, null, 2));
  await page.locator('#email').focus();
  await expect(scene).toHaveAttribute('data-state', 'recoverable-error');
  await page.screenshot({ path: out + '/password-error.png', mask: [page.locator('#password')] });
  checks.push(
    'Actual missing provider configuration and actual invalid password errors remain in the formal form',
  );
  if (!production) {
    await page.goto('http://127.0.0.1:3407/login?_colloAuthPreview=waiting');
    await expect(page.locator('.collo-oauth')).toHaveAttribute('data-phase', 'waiting');
    await expect(scene).toHaveAttribute('data-state', 'oauth-waiting');
    await page.locator('#email').focus();
    await expect(scene).toHaveAttribute('data-state', 'oauth-waiting');
    await page.screenshot({ path: out + '/waiting-component-preview.png' });
    await page.getByRole('button', { name: 'Cancel sign-in' }).click();
    await expect(page.locator('.collo-oauth')).toHaveAttribute('data-phase', 'cancelled');
    await expect(scene).toHaveAttribute('data-state', 'idle');
    await page.screenshot({ path: out + '/cancelled-component-preview.png' });
    checks.push(
      'DEV ONLY controlled waiting/cancel component preview; no external provider authentication occurred',
    );
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page.locator('.collo-fold-breath').evaluate((e) => getComputedStyle(e).animationName),
    'none',
  );
  checks.push('Reduced-motion disables scene animation');
  await page.screenshot({ path: out + '/reduced-motion.png' });
  const fallback = await context.newPage();
  await fallback.route('**/collo-auth/fold.webp', (r) => r.abort());
  await fallback.goto('http://127.0.0.1:3407/login');
  await expect(fallback.locator('svg.collo-fold-art')).toBeVisible();
  await fallback.locator('#email').pressSequentially('asset-fallback@example.invalid');
  await expect(fallback.locator('#email')).toHaveValue('asset-fallback@example.invalid');
  await fallback.screenshot({ path: out + '/asset-fallback.png' });
  await fallback.close();
  checks.push('Asset failure shows a local vector fallback; actual email input remains usable.');
  await page.goto('http://127.0.0.1:3407/login?return_to=%2Fprojects');
  await expect(page.locator('#email')).toBeVisible();
  await page.evaluate(() => {
    window.__verifiedLoginStates = [];
    sessionStorage.setItem('TEST-scene-state-journal', '[]');
    new MutationObserver(() => {
      const state =
        document.querySelector('.collo-companion-scene')?.getAttribute('data-state') ||
        (document.querySelector('.collo-topbar') ? 'workspace' : 'startup');
      if (window.__verifiedLoginStates.at(-1)?.state !== state)
        window.__verifiedLoginStates.push({ state, at: Date.now() });
      sessionStorage.setItem(
        'TEST-scene-state-journal',
        JSON.stringify(window.__verifiedLoginStates),
      );
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
  });
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.collo-projects')).toBeVisible();
  await expect(page.locator('.collo-companion-scene')).toHaveCount(0);
  const verified = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('TEST-scene-state-journal') || '[]'),
  );
  assert.ok(verified.some((s) => s.state === 'submitting'));
  await fs.writeFile(out + '/verified-login-states.json', JSON.stringify(verified, null, 2));
  checks.push(
    'Actual valid email sign-in reaches the requested projects page immediately; transient scene states recorded without waiting for celebration.',
  );
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        checks,
        build: await page.evaluate(() => fetch('/collo-build.json').then((r) => r.json())),
      },
      null,
      2,
    ),
  );
} finally {
  const video = page.video();
  await context.close();
  await video.saveAs(out + '/states.webm');
  await browser.close();
}
