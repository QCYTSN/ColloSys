import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, completionFixture } from './product-ui-completion-data.mjs';
const expect = baseExpect.configure({ timeout: 30000 });
const f = await completionFixture(),
  out = process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/craft/evidence/detail-continuity';
await fs.mkdir(out, { recursive: true });
const events = await f.a.client.query('collo:feed', {
  projectId: f.projectId,
  paginationOpts: { numItems: 50, cursor: null },
});
const checkpoints = events.page.filter((e) => e.kind === 'checkpoint').slice(0, 2);
assert.equal(checkpoints.length, 2);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: '.local/craft-detail-video', size: { width: 1440, height: 900 } },
});
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  const original = Element.prototype.animate;
  window.craftAnimations = [];
  Element.prototype.animate = function (frames, options) {
    const animation = original.call(this, frames, options);
    if (this.closest('.collo-detail-surface'))
      window.craftAnimations.push({
        tag: this.tagName,
        className: this.className,
        text: this.textContent?.slice(0, 100),
        frames,
        duration: options?.duration,
      });
    return animation;
  };
});
const route = (e) => `/projects/${f.projectId}?tab=workspaces&event=${e.id}`;
const jump = async (e) =>
  page.evaluate((route) => {
    history.pushState(null, '', route);
    dispatchEvent(new PopStateEvent('popstate'));
  }, route(e));
try {
  await page.goto('http://127.0.0.1:3407/login');
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => u.pathname === '/projects');
  await page.goto('http://127.0.0.1:3407' + route(checkpoints[0]));
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(page.getByTestId('checkpoint-completeness')).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
  await page.evaluate(() => {
    window.craftSurface = document.querySelector('.collo-detail-surface');
    window.craftList = window.craftSurface.previousElementSibling;
    window.craftAnimations = [];
  });
  await jump(checkpoints[1]);
  await expect(page.getByTestId('checkpoint-completeness')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.craftAnimations.length)).toBeGreaterThan(0);
  const observed = await page.evaluate(() => ({
    animations: window.craftAnimations,
    retainedSurface: window.craftSurface === document.querySelector('.collo-detail-surface'),
    retainedList:
      window.craftList === document.querySelector('.collo-detail-surface')?.previousElementSibling,
  }));
  assert.ok(observed.retainedSurface && observed.retainedList);
  assert.ok(
    observed.animations.every(
      (a) =>
        a.duration === 140 &&
        (/collo-(reader|review)-heading/.test(a.className) || /^H[12]$/.test(a.tag)),
    ),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => (window.craftAnimations = []));
  await jump(checkpoints[0]);
  await expect(page.getByTestId('checkpoint-completeness')).toBeVisible();
  assert.deepEqual(await page.evaluate(() => window.craftAnimations), []);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope:
          'Real authorized checkpoint detail; browser history navigation A to B, reduced-motion return',
        observed,
        errors,
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS Real detail A to B keeps surface/list identity, animates only the heading and respects reduced motion',
  );
} catch (error) {
  await fs.writeFile(
    out + '/failure.json',
    JSON.stringify(
      {
        error: String(error),
        url: page.url(),
        state: await page.evaluate(() => ({
          animations: window.craftAnimations,
          retained: window.craftSurface === document.querySelector('.collo-detail-surface'),
          headings: [
            ...document.querySelectorAll(
              '.collo-detail-surface h1,.collo-detail-surface h2,.collo-reader-heading',
            ),
          ].map((e) => ({ tag: e.tagName, cls: e.className, text: e.textContent?.slice(0, 100) })),
        })),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  const video = page.video();
  await context.close();
  await video.saveAs(out + '/detail-selection.webm');
  await browser.close();
}
