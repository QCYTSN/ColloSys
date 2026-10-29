import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
const production = process.argv.includes('--production'), out = `docs/product-ui/identity-motion/evidence/login-${production ? 'production' : 'development'}`;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: '.local/identity-login-videos', size: { width: 1440, height: 900 } } });
const page = await context.newPage(), expect = baseExpect.configure({ timeout: 60000 }), checks = [];
page.setDefaultNavigationTimeout(120000);
try {
  await page.goto('http://127.0.0.1:3407/login'); await expect(page.locator('#email')).toBeVisible(); await page.evaluate(() => document.fonts.ready);
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [1920, 1440, 1280, 960, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('form button[type=submit]')).toBeInViewport();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (width >= 960) { const box = await page.locator('.collo-auth-visual').boundingBox(); assert.ok(box.width / width > 0.5 && box.width / width < 0.61); }
      await page.screenshot({ path: `${out}/${theme}-${width}.png` });
    }
  }
  checks.push('1920/1440/1280/960/390 light and dark: form operable, no horizontal overflow, wide layout has substantive left scene');
  await page.setViewportSize({ width: 1440, height: 900 }); await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Google', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('not configured'); await page.screenshot({ path: out + '/provider-unavailable.png' });
  await page.locator('#email').fill('TEST-unknown@example.invalid'); await page.locator('#password').fill('TEST-incorrect-password'); await page.locator('form button[type=submit]').click(); await expect(page.locator('.collo-auth-error')).toBeVisible(); await page.screenshot({ path: out + '/password-error.png', mask: [page.locator('#password')] });
  checks.push('Actual missing provider configuration and actual invalid password errors remain in the formal form');
  if (!production) {
    await page.goto('http://127.0.0.1:3407/login?_colloAuthPreview=waiting'); await expect(page.locator('.collo-oauth')).toHaveAttribute('data-phase', 'waiting');
    await page.screenshot({ path: out + '/waiting-component-preview.png' }); await page.getByRole('button', { name: 'Cancel sign-in' }).click(); await expect(page.locator('.collo-oauth')).toHaveAttribute('data-phase', 'cancelled');
    await page.screenshot({ path: out + '/cancelled-component-preview.png' });
    checks.push('DEV ONLY controlled waiting/cancel component preview; no external provider authentication occurred');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.collo-scene-companion').evaluate(e => getComputedStyle(e).animationName), 'none');
  checks.push('Reduced-motion disables scene animation');
  await fs.writeFile(out + '/results.json', JSON.stringify({ checks, build: await page.evaluate(() => fetch('/collo-build.json').then(r => r.json())) }, null, 2));
} finally { const video = page.video(); await context.close(); await video.saveAs(out + '/states.webm'); await browser.close(); }
