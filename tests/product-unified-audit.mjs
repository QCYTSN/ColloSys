import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, denseFixture } from './product-ui-refinement-data.mjs';
import { completionFixture } from './product-ui-completion-data.mjs';
await baseExpect
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
const expect = baseExpect.configure({ timeout: 45000 }),
  f = await denseFixture(),
  c = await completionFixture();
const out = process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/unified/evidence/calibration';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage(),
  records = [];
page.setDefaultNavigationTimeout(120000);
const cdp = await context.newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');
async function fonts(selector) {
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  return nodeId ? (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts : [];
}
const roles = {
  wordmark: '.collo-logo',
  art: '.collo-auth-scene-caption h2',
  authTitle: '.collo-auth-step h1',
  authInput: '#email',
  authButton: '.collo-auth-submit',
  pageTitle: '.collo-page-heading h1',
  objectTitle: '.collo-project-title h1',
  taskTitle: '.collo-task-reading [data-page-head] h1',
  listTitle: '.collo-project-select strong',
  nav: '.collo-navigation a',
  trigger: '.collo-list-trigger',
  triggerFace: '.collo-trigger-face',
  menu: '.collo-list-option',
  display: '.collo-display-panel',
  body: '[data-sv-feed] .prose',
  meta: '.collo-event-directory',
  sectionTitle: '.collo-settings-section-heading h2',
  field: '.collo-input',
  code: '.collo-checkpoint-diff',
  dialog: '.collo-dialog-surface',
  settings: '.collo-settings-surface',
};
async function audit(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(230);
  const data = await page.evaluate((roles) => {
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const visible = (e) =>
      e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
      e.getBoundingClientRect().height > 0;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const colors = new Map();
    const color = (v) => {
      if (colors.has(v)) return [...colors.get(v)];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, 1, 1);
      const d = [...ctx.getImageData(0, 0, 1, 1).data];
      d[3] /= 255;
      colors.set(v, d);
      return [...d];
    };
    const over = (a, b) => {
      const alpha = a[3] + b[3] * (1 - a[3]);
      return alpha
        ? [0, 1, 2].map((i) => (a[i] * a[3] + b[i] * b[3] * (1 - a[3])) / alpha).concat(alpha)
        : [0, 0, 0, 0];
    };
    const lum = (c) =>
      c
        .slice(0, 3)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const style = (e) => {
      const c = getComputedStyle(e);
      return {
        font: c.fontFamily,
        size: c.fontSize,
        weight: c.fontWeight,
        line: c.lineHeight,
        tracking: c.letterSpacing,
        axes: c.fontVariationSettings,
        optical: c.fontOpticalSizing,
        color: c.color,
        background: c.backgroundColor,
        border: c.border,
        outline: c.outline,
        shadow: c.boxShadow,
        radius: c.borderRadius,
        padding: c.padding,
        gap: c.gap,
        ...rect(e),
      };
    };
    const text = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode,
        e = n.parentElement;
      if (
        !e ||
        !n.textContent.trim() ||
        seen.has(e) ||
        !visible(e) ||
        e.closest('svg,script,style,[aria-hidden=true],kbd,[inert],.sr-only')
      )
        continue;
      const r = rect(e);
      if (r.x > innerWidth || r.y > innerHeight || r.y + r.height < 0) continue;
      seen.add(e);
      const c = getComputedStyle(e);
      let fg = color(c.color),
        bg = [0, 0, 0, 0],
        gradient = false,
        opacity = 1;
      for (let p = e; p; p = p.parentElement) {
        const s = getComputedStyle(p),
          b = color(s.backgroundColor);
        fg = over(fg, b);
        bg = over(bg, b);
        const o = Number(s.opacity);
        fg[3] *= o;
        bg[3] *= o;
        opacity *= o;
        if (s.backgroundImage !== 'none') gradient = true;
      }
      fg = over(fg, [255, 255, 255, 1]);
      bg = over(bg, [255, 255, 255, 1]);
      const a = lum(fg),
        b = lum(bg),
        ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      text.push({
        tag: e.tagName,
        class: e.className,
        text: n.textContent.trim().slice(0, 100),
        size: c.fontSize,
        weight: c.fontWeight,
        line: c.lineHeight,
        axes: c.fontVariationSettings,
        opacity,
        gradient,
        ratio,
        fg,
        bg,
        disabled: !!e.closest(':disabled,[aria-disabled=true]'),
        ...r,
      });
    }
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      theme: document.documentElement.dataset.colloAppearance,
      roles: Object.fromEntries(
        Object.entries(roles).map(([k, s]) => {
          const e = [...document.querySelectorAll(s)].find(visible);
          return [k, e ? style(e) : null];
        }),
      ),
      text,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      sidebar: document.getElementById('sidebar') ? rect(document.getElementById('sidebar')) : null,
      firstContent: document.querySelector('.collo-activity-list')
        ? rect(document.querySelector('.collo-activity-list'))
        : null,
    };
  }, roles);
  const renderedFonts = {};
  for (const [role, selector] of Object.entries(roles))
    if (data.roles[role]) renderedFonts[role] = await fonts(selector);
  records.push({ name, ...data, renderedFonts });
  await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' });
  await fs.writeFile(
    `${out}/runtime.json`,
    JSON.stringify(
      {
        build: await page.evaluate(() => fetch('/collo-build.json').then((r) => r.json())),
        records,
      },
      null,
      2,
    ),
  );
  console.log(
    name,
    JSON.stringify({
      lowContrast: data.text
        .filter((v) => !v.disabled && !v.gradient && v.ratio < 4.5)
        .map((v) => ({ text: v.text, ratio: v.ratio, class: v.class })),
      smallText: data.text
        .filter((v) => parseFloat(v.size) < 12)
        .map((v) => ({ text: v.text, size: v.size, class: v.class })),
      overflow: data.overflow,
    }),
  );
}
async function go(route) {
  await page.goto('http://127.0.0.1:3407' + route);
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(page.locator('.collo-topbar')).toBeVisible({ timeout: 700 });
    if (route.includes('tab=workspaces'))
      await expect(page.getByTestId('local-workspaces')).toBeVisible({ timeout: 700 });
    if (route.includes('tab=handoffs'))
      await expect(page.getByTestId('project-handoffs')).toBeVisible({ timeout: 700 });
    if (route.includes('tab=tasks'))
      await expect(page.getByTitle('Display options', { exact: true })).toBeVisible({
        timeout: 700,
      });
    if (route.includes('tab=sessions'))
      await expect(page.getByTestId('captured-conversation')).toBeVisible({ timeout: 700 });
    if (/^\/projects\/[^/?]+\/[^/?]+$/.test(route))
      await expect(page.locator('.collo-task-reading')).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
}
try {
  await page.goto('http://127.0.0.1:3407/login');
  await expect(page.locator('#email')).toBeVisible();
  await audit('login-light');
  await page.locator('#email').focus();
  await audit('login-focus-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await audit('login-dark');
  await page.locator('#email').focus();
  await audit('login-focus-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.collo-projects')).toBeVisible();
  const pair = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
  await page.evaluate((v) => sessionStorage.setItem('collo.pair', v), pair);
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await go(`/projects/${f.projectId}?tab=workspaces`);
    await expect(page.locator('[data-event-id]').first()).toBeVisible();
    await audit('activity-' + theme);
    await go('/projects');
    await page.getByRole('button', { name: /^Preview TEST dense reading/ }).click();
    await expect(page.locator('.collo-project-overview')).not.toContainText('Loading');
    await audit('projects-' + theme);
    await go(`/projects/${f.projectId}?tab=tasks`);
    await expect(page.getByTitle('Display options', { exact: true })).toBeVisible();
    await audit('tasks-' + theme);
    await page.getByTitle('Active', { exact: true }).first().click();
    await audit('active-' + theme);
    await page.keyboard.press('Escape');
    await page.getByTitle('Display options', { exact: true }).click();
    await audit('display-' + theme);
    await page.keyboard.press('Escape');
    await go(
      `/projects/${f.projectId}?tab=sessions&workspace=${f.workspaceId}&session=${f.sessionId}`,
    );
    await expect(page.locator('[data-reading-message]').first()).toBeVisible();
    await audit('reader-' + theme);
    await page.locator('.collo-settings-button').click();
    await page.getByRole('button', { name: 'Profile & appearance', exact: true }).click();
    await expect(page.getByPlaceholder('Your name', { exact: true })).toBeVisible();
    await audit('settings-' + theme);
    await page.keyboard.press('Escape');
    await go(`/projects/${c.projectId}/${c.taskId}`);
    await expect(page.locator('.collo-task-reading')).toBeVisible();
    assert.ok(
      await page
        .locator('.collo-task-reading [data-page-head] h1')
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      'Unbroken task title must wrap within its own column',
    );
    await audit('task-detail-' + theme);
    await go(`/projects/${c.projectId}?tab=handoffs`);
    await expect(page.locator('[data-handoff-id]').first()).toBeVisible();
    await audit('handoffs-' + theme);
    await page.locator('[data-handoff-id]').first().click();
    await expect(page.locator('.collo-handoff-detail')).toBeVisible();
    await audit('handoff-detail-' + theme);
    await go(
      `/projects/${c.projectId}?tab=workspaces&workspaceView=history&directory=${c.workspaceId}`,
    );
    await page.getByText('This directory · TEST completion source', { exact: true }).click();
    await audit('history-' + theme);
    await page.getByRole('button', { name: 'Storage & backups', exact: true }).click();
    await expect(page.getByTestId('directory-storage')).toBeVisible();
    await expect(page.getByTestId('directory-storage')).not.toContainText(
      'Reading encrypted backups...',
    );
    await audit('storage-' + theme);
    await page.keyboard.press('Escape');
  }
  if (process.argv.includes('--matrix')) {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [1920, 1080],
      [960, 720],
    ])
      for (const theme of ['light', 'dark']) {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme: theme });
        await go(`/projects/${f.projectId}?tab=workspaces`);
        await expect(page.locator('[data-event-id]').first()).toBeVisible();
        for (const sidebarWidth of [208, 280]) {
          const separator = page.locator('[data-separator][role=separator]').first();
          const box = await separator.boundingBox();
          assert.ok(box);
          await page.mouse.move(box.x + box.width / 2, box.y + 30);
          await page.mouse.down();
          await page.mouse.move(sidebarWidth, box.y + 30, { steps: 8 });
          await page.mouse.up();
          await page.waitForTimeout(230);
          const w = await page.locator('#sidebar').evaluate((e) => e.getBoundingClientRect().width);
          assert.ok(Math.abs(w - sidebarWidth) < 4, `${w} vs ${sidebarWidth}`);
          await audit(`activity-${width}x${height}-${theme}-sidebar${sidebarWidth}`);
        }
        const toggle = page.getByRole('button', { name: 'Toggle sessions panel', exact: true });
        await toggle.click();
        await page.waitForTimeout(300);
        await audit(`activity-${width}x${height}-${theme}-context`);
        await toggle.click();
      }
  }
} finally {
  await context.close();
  await browser.close();
}
