import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { account, denseFixture } from './product-ui-refinement-data.mjs';
const phase = process.argv[2] || 'before';
const out = `docs/product-ui/unified/evidence/${phase}/screens`;
await fs.mkdir(out, { recursive: true });
await expect
  .poll(
    async () => {
      try {
        return (await fetch('http://127.0.0.1:3407/login')).status;
      } catch {
        return 0;
      }
    },
    { timeout: 120000, intervals: [1000] },
  )
  .toBe(200);
const f = await denseFixture();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(120000);
const records = [];
const shot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' });
  records.push({
    name,
    styles: await page.evaluate(() => {
      const selectors = [
        '.collo-topbar',
        '.collo-page-heading h1',
        '.collo-project-title h1',
        '.collo-auth-step h1',
        '.collo-auth-submit',
        '#email',
        '.collo-list-trigger',
        '.collo-display-panel',
        '.collo-list-option',
        '.collo-settings-top h1',
        '.collo-checkpoint-diff',
      ];
      return Object.fromEntries(
        selectors.map((s) => {
          const e = document.querySelector(s);
          if (!e) return [s, null];
          const c = getComputedStyle(e),
            b = e.getBoundingClientRect();
          return [
            s,
            {
              font: c.fontFamily,
              size: c.fontSize,
              line: c.lineHeight,
              weight: c.fontWeight,
              tracking: c.letterSpacing,
              radius: c.borderRadius,
              padding: c.padding,
              border: c.border,
              shadow: c.boxShadow,
              color: c.color,
              background: c.backgroundColor,
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
            },
          ];
        }),
      );
    }),
  });
};
async function go(route) {
  await page.goto(`http://127.0.0.1:3407${route}`);
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(page.locator('.collo-topbar')).toBeVisible({ timeout: 700 });
    if (route.includes('tab=workspaces'))
      await expect(page.getByTestId('local-workspaces')).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
}
try {
  await page.goto('http://127.0.0.1:3407/login');
  await expect(page.locator('#email')).toBeVisible();
  await shot('login');
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.collo-projects')).toBeVisible();
  await go(`/projects/${f.projectId}?tab=workspaces`);
  await shot('activity');
  await go('/projects');
  await page.getByRole('button', { name: /^Preview TEST dense reading/ }).click();
  await expect(page.locator('.collo-project-overview')).not.toContainText('Loading');
  await shot('projects');
  await go(`/projects/${f.projectId}?tab=tasks`);
  await shot('tasks');
  await page.getByTitle('Active', { exact: true }).first().click();
  await shot('active');
  await page.keyboard.press('Escape');
  await page.getByTitle('Display options', { exact: true }).click();
  await shot('display');
  await page.keyboard.press('Escape');
  await go(
    `/projects/${f.projectId}?tab=sessions&workspace=${f.workspaceId}&session=${f.sessionId}`,
  );
  await expect(page.getByTestId('captured-conversation')).toBeVisible();
  await shot('conversation');
  await go(`/projects/${f.projectId}?tab=workspaces`);
  let cursor = null,
    event;
  do {
    const result = await f.a.client.query('collo:feed', {
      projectId: f.projectId,
      paginationOpts: { numItems: 20, cursor },
    });
    event = result.page.find((e) => e.kind === 'checkpoint' && e.payload.totalFiles === 32);
    cursor = result.isDone ? null : result.continueCursor;
  } while (!event && cursor);
  if (!event) throw Error('Missing persisted 32-file checkpoint');
  const row = page.locator(`[data-event-id="${event.id}"]`);
  for (let i = 0; i < 10 && !(await row.count()); i++) {
    const earlier = page.getByRole('button', { name: 'Earlier activity', exact: true });
    await expect
      .poll(async () => !!(await row.count()) || (await earlier.isVisible()))
      .toBeTruthy();
    if (await row.count()) break;
    const count = await page.locator('[data-event-id]').count();
    await earlier.click();
    await expect
      .poll(
        async () =>
          !!(await row.count()) || (await page.locator('[data-event-id]').count()) > count,
      )
      .toBeTruthy();
  }
  await row.click();
  await expect(page.locator('button[data-diff-file]')).toHaveCount(32);
  await shot('diff');
  const selected = page.locator('button[data-diff-file]').nth(15);
  const filename = await selected.getAttribute('data-diff-file');
  await selected.click();
  const diffRecords = [];
  for (const [width, height] of [
    [960, 720],
    [1280, 800],
    [1920, 1080],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(`span[data-diff-file="${filename}"]`)).toBeVisible();
    await page.waitForTimeout(250);
    const geometry = await page.locator('.collo-checkpoint-diff').evaluate((e) => {
      const r = e.getBoundingClientRect();
      const code = [];
      function visit(root) {
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) visit(el.shadowRoot);
          if (el.matches('pre,code,[data-line]') && el.textContent.trim() && code.length < 8) {
            const s = getComputedStyle(el);
            code.push({
              tag: el.tagName,
              size: s.fontSize,
              line: s.lineHeight,
              font: s.fontFamily,
            });
          }
        }
      }
      visit(e);
      return {
        height: r.height,
        width: r.width,
        bottom: r.bottom,
        viewport: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        code,
      };
    });
    assert.equal(geometry.overflow, false);
    assert.ok(geometry.height >= 240 && geometry.bottom <= height + 1);
    const showTree = page.getByTitle('Show file tree (b)', { exact: true }).first();
    if (await showTree.isVisible()) {
      await showTree.click();
      await expect(page.locator('button[data-diff-file]')).toHaveCount(32);
      await page.locator(`button[data-diff-file="${filename}"]`).click();
      await expect(page.locator(`span[data-diff-file="${filename}"]`)).toBeVisible();
    }
    diffRecords.push({
      viewportWidth: width,
      viewportHeight: height,
      selectedFile: filename,
      ...geometry,
    });
    await shot(`diff-${width}`);
  }
  await fs.writeFile(`${out}/diff-continuity.json`, JSON.stringify(diffRecords, null, 2));
  await go('/settings');
  await shot('settings');
  await go('/settings/integrations');
  await shot('directories');
  if (!(await page.locator('.collo-settings-surface').isVisible()))
    await page.locator('.collo-settings-button').click();
  await page.getByRole('button', { name: 'Profile & appearance', exact: true }).click();
  await shot('appearance');
  await fs.writeFile(
    `${out}/capture.json`,
    JSON.stringify(
      {
        phase,
        capturedAt: new Date().toISOString(),
        build: await page.evaluate(() => fetch('/collo-build.json').then((r) => r.json())),
        viewport: { width: 1440, height: 900 },
        dpr: 1,
        records,
      },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({ path: `${out}/failure.png` });
  throw e;
} finally {
  await context.close();
  await browser.close();
}
