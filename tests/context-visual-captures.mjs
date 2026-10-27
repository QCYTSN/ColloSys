import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const phase = process.argv[2] ?? 'after';
if (!['before', 'after'].includes(phase)) throw new Error('Use before or after');
const out = path.resolve('docs/workbench-revision/visual-20261027', phase);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const measurements = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const url = 'http://127.0.0.1:3407/workbench-preview';
for (const [width, height] of [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
]) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await page.locator('.cw-app').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const shot = async (name) => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `${name}-${width}.png`), animations: 'allow' });
  };
  measurements.push(
    await page.evaluate(() => {
      const box = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        width: innerWidth,
        height: innerHeight,
        reader: box('.cw-reader-scroll'),
        heading: box('.cw-heading-copy'),
        transcript: box('.cw-transcript'),
        composer: box('.cw-composer'),
        firstText: box('.cw-prose p'),
        scrollTop: document.querySelector('.cw-reader-scroll').scrollTop,
        firstMessage: document.querySelector('[data-message-id]').getAttribute('data-message-id'),
      };
    }),
  );
  await shot('context');
  await page.getByRole('button', { name: '准备交接', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot('dialog');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.locator('.cw-index-panel .cw-member-filter').click();
  await expect(page.getByRole('menu')).toBeVisible();
  await shot('menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.getByRole('tab', { name: /文件变化/ }).click();
  await page.locator('diffs-container').first().waitFor();
  await shot('changes');
  await page.getByRole('tab', { name: '上下文', exact: true }).click();
  await page.getByRole('button', { name: '预览场景', exact: true }).click();
  await page.getByRole('menuitem', { name: '10 人 · 100 条活动', exact: true }).click();
  await expect(page.locator('.cw-index-panel [data-activity]')).toHaveCount(100);
  await shot('dense');
  console.log('Captured', phase, width, height);
}
await fs.writeFile(
  path.join(out, 'measurements.json'),
  JSON.stringify(
    {
      phase,
      measurements,
      errors,
      fixtureHash: createHash('sha256')
        .update(await fs.readFile('integrations/codecast/web/ContextScenario.ts'))
        .digest('hex'),
      capturedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
