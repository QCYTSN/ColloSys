import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const out = path.resolve('docs/product-ui/evidence/layout');
await fs.mkdir(out, { recursive: true });
const { acceptanceDir } = JSON.parse(await fs.readFile('.local/product-ui-context.json', 'utf8'));
const account = JSON.parse(
  await fs.readFile(path.join(acceptanceDir, 'restart-test.json'), 'utf8'),
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [],
  checks = [];
await page.addInitScript(() => {
  // A previous version's cached palette must not replace the product palette.
  localStorage.setItem(
    'codecast-color-theme',
    JSON.stringify({ light: { '--sol-bg': '#ec1234' }, dark: { '--sol-bg': '#ec1234' } }),
  );
});
page.on('pageerror', (e) => errors.push(e.message));
const route = `/projects/${account.projectId}?tab=workspaces`;
async function goto(route) {
  await page.goto('http://127.0.0.1:3407' + route);
  await page.waitForTimeout(700);
  if (route.includes('tab=workspaces')) {
    await expect(async () => {
      if (await page.locator('[data-foreign-switch]').isVisible())
        await page.locator('[data-foreign-switch]').click();
      await expect(page.getByTestId('local-workspaces')).toBeVisible();
    }).toPass({ timeout: 30000 });
  }
  await page.evaluate(() => document.fonts.ready);
}
async function snapshot(name) {
  // Capture the settled state after the actual 150ms input transition.
  // Animations remain enabled; the native recording covers the transition.
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, name + '.png') });
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    font: getComputedStyle(document.body).fontFamily,
    palette: getComputedStyle(document.documentElement).getPropertyValue('--sol-bg').trim(),
    dark: document.documentElement.classList.contains('dark'),
  }));
  assert.ok(geometry.scroll <= geometry.width + 1, `${name}: unexpected document overflow`);
  assert.match(geometry.font, /Google Sans/);
  assert.equal(
    geometry.palette,
    geometry.dark ? '#202127' : '#ffffff',
    'Legacy cached colors must not override ColloSys',
  );
  checks.push({ name, ...geometry });
}
try {
  await goto('/login');
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => u.pathname === '/projects');
  for (const width of [1440, 1120, 960]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 720 });
    await goto(route);
    await expect(
      page.getByRole('button', { name: 'Connect directory', exact: true }),
    ).toBeVisible();
    await snapshot(`activity-${width}`);
    await goto('/settings');
    await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
    await snapshot(`settings-${width}`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeHidden();
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Dark mode', exact: true });
  await toggle.check();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await snapshot('settings-dark');
  await page.keyboard.press('Escape');
  await goto(route);
  await snapshot('activity-dark');
  await goto('/settings');
  await toggle.uncheck();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await goto(route);
  const duration = await page
    .getByRole('button', { name: 'Connect directory', exact: true })
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  // Upstream keeps a 0.01ms duration so transition-end cleanup still fires.
  assert.ok(duration.split(',').every((value) => parseFloat(value) <= 0.00001));
  checks.push({
    name: 'Reduced motion removes owned control transitions; Escape closes settings',
    duration,
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`PASS ${checks.length} layout and interaction checks`);
} finally {
  await browser.close();
}
