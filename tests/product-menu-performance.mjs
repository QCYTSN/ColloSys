// Real task-header entries. Browser observations are paint opportunities, not display latency.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { account, denseFixture } from './product-ui-refinement-data.mjs';
const arg = (name, fallback) =>
  process.argv.find((x) => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const phase = arg('phase', 'before'),
  mode = arg('mode', 'production');
const out = path.resolve(
  `${process.env.COLLOSYS_MEASUREMENT_ROOT || 'docs/product-ui/menu-motion/evidence'}/${phase}/${mode}`,
);
const currentMenus = phase === 'after' || process.env.COLLOSYS_CURRENT_MENU_BASELINE === '1';
await fs.mkdir(out, { recursive: true });
const fixture = await denseFixture();
let seeded = false;
try {
  seeded =
    JSON.parse(await fs.readFile('.local/menu-density-ready.json', 'utf8')).projectId ===
    fixture.projectId;
} catch {}
if (!seeded)
  for (let i = 0; i < 200; i++)
    await fixture.a.client.mutation('tasks:webCreate', {
      title: `TEST menu density ${String(i + 1).padStart(3, '0')}`,
      workspace: 'team',
      team_id: fixture.teamId,
      project_id: fixture.projectId,
      status: ['open', 'in_progress', 'done'][i % 3],
      priority: ['low', 'medium', 'high'][i % 3],
      client_key: `menu-motion-density-${i}`,
    });
await fs.writeFile(
  '.local/menu-density-ready.json',
  JSON.stringify({ projectId: fixture.projectId }),
);
const results = [];
for (let round = 1; round <= 3; round++) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (process.env.COLLOSYS_MEASUREMENT_ROOT?.includes('workspace-polish')) {
    const profile = JSON.parse(await fs.readFile('docs/product-ui/workspace-polish/evidence/actual-profile.json', 'utf8'));
    await context.addInitScript(({ appearance, sidebar }) => {
      localStorage.setItem('collosys.appearance.v1', JSON.stringify(appearance));
      localStorage.setItem('collo.boot.nav', JSON.stringify(sidebar));
    }, profile);
  }
  await context.addInitScript(() => {
    window.__menu = { actions: [], events: [], longTasks: [] };
    try {
      new PerformanceObserver((l) =>
        window.__menu.longTasks.push(
          ...l.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })),
        ),
      ).observe({ type: 'longtask', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((l) =>
        window.__menu.events.push(
          ...l
            .getEntries()
            .filter((e) => e.interactionId)
            .map((e) => ({
              name: e.name,
              start: e.startTime,
              duration: e.duration,
              interactionId: e.interactionId,
            })),
        ),
      ).observe({ type: 'event', durationThreshold: 16, buffered: true });
    } catch {}
    document.addEventListener(
      'pointerdown',
      (e) => {
        const spec = window.__armed;
        if (!spec || !e.target.closest(`[data-measure="${spec.name}"]`)) return;
        window.__armed = null;
        const trigger = e.target.closest('button'),
          start = performance.now(),
          a = { name: spec.name, cold: spec.cold, start, eventTimestamp: e.timeStamp };
        window.__menu.actions.push(a);
        let last = '',
          same = 0;
        const tick = () => {
          const panel = document.querySelector(spec.selector),
            rect = panel?.getBoundingClientRect();
          const visible =
            !!rect &&
            rect.width > 0 &&
            rect.height > 0 &&
            getComputedStyle(panel).visibility !== 'hidden' &&
            Number(getComputedStyle(panel).opacity) > 0.01;
          if (
            visible &&
            (!spec.readyLabel || document.querySelector(`[aria-label="${spec.readyLabel}"]`))
          ) {
            a.feedbackOpportunity ??= performance.now() - start;
            if (getComputedStyle(panel).pointerEvents !== 'none')
              a.operableOpportunity ??= performance.now() - start;
            const key = [rect.x, rect.y, rect.width, rect.height, panel.textContent].join(':');
            same = key === last ? same + 1 : 0;
            last = key;
            if (same >= 3) {
              a.stableOpportunity ??= performance.now() - start;
              const active = panel
                .getAnimations({ subtree: true })
                .filter((x) => x.playState === 'running');
              if (!active.length) {
                a.animationSettled = performance.now() - start;
                return;
              }
            }
          }
          if (performance.now() - start < 3000) requestAnimationFrame(tick);
          else a.timeout = true;
        };
        requestAnimationFrame(tick);
      },
      true,
    );
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.goto('http://127.0.0.1:3407/login', { timeout: 120000 });
    await expect(page.locator('#email')).toBeVisible({ timeout: 60000 });
    await page.locator('#email').fill(account.a.email);
    await page.locator('#password').fill(account.a.password);
    await page.locator('form button[type=submit]').click();
    await expect(page.locator('.collo-projects')).toBeVisible({ timeout: 60000 });
    await page.goto(`http://127.0.0.1:3407/projects/${fixture.projectId}?tab=tasks`, {
      timeout: 120000,
    });
    const display = page.getByTitle('Display options', { exact: true });
    await expect(async () => {
      const foreign = page.locator('[data-foreign-switch]');
      if (await foreign.isVisible()) await foreign.click();
      await expect(display).toBeVisible({ timeout: 700 });
    }).toPass({ timeout: 60000 });
    await page.waitForTimeout(1800);
    const initial = await page.locator('body').innerText();
    for (const name of ['Active', 'Display']) {
      const trigger =
        name === 'Display' ? display : page.getByTitle('Active', { exact: true }).first();
      await trigger.evaluate((el, name) => (el.dataset.measure = name), name);
      const selector = !currentMenus
        ? `[data-measure="${name}"] + div`
        : name === 'Active'
          ? '.collo-preset-menu[data-state="open"]'
          : '.collo-display-panel[data-state="open"]';
      for (let i = 0; i < 11; i++) {
        await page.evaluate((spec) => (window.__armed = spec), { name, cold: i === 0, selector });
        await trigger.click();
        await expect(page.locator(selector)).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => !!window.__menu.actions.at(-1)?.animationSettled))
          .toBeTruthy();
        if (i === 0)
          await page.screenshot({ path: `${out}/round-${round}-${name.toLowerCase()}.png` });
        await page.mouse.click(750, 180);
        await expect(page.locator(selector)).toHaveCount(0);
      }
    }
    if (currentMenus) {
      for (let i = 0; i < 10; i++) {
        await display.click();
        const parent = page.locator('.collo-display-panel[data-state=open]');
        await parent.getByRole('button', { name: /^Grouping:/ }).click();
        const value = i % 2 ? 'Status' : 'Assignee',
          choice = page
            .locator('.collo-setting-menu[aria-label=Grouping][data-state=open]')
            .getByRole('menuitemradio', { name: value, exact: true });
        await choice.evaluate((el) => (el.dataset.measure = 'Grouping'));
        await page.evaluate((spec) => (window.__armed = spec), {
          name: 'Grouping',
          cold: false,
          selector: '[data-list-scroll]',
          readyLabel: `Grouping: ${value}`,
        });
        await choice.click();
        await expect(
          parent.getByRole('button', { name: `Grouping: ${value}`, exact: true }),
        ).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => !!window.__menu.actions.at(-1)?.animationSettled))
          .toBeTruthy();
        await page.keyboard.press('Escape');
        await expect(parent).toHaveCount(0);
      }
    }
    results.push({
      round,
      environment: await page.evaluate(() => ({
        dpr: devicePixelRatio,
        viewport: { width: innerWidth, height: innerHeight },
        visualScale: visualViewport.scale,
        userAgent: navigator.userAgent,
      })),
      build: await page.evaluate(() => fetch('/collo-build.json').then((r) => r.json())),
      initialText: initial,
      metrics: await page.evaluate(() => window.__menu),
    });
    console.log(`${phase} ${mode} round ${round}: Active 11 / Display 11`);
  } finally {
    await context.close();
    await browser.close();
    await fs.writeFile(
      out + '/menus.json',
      JSON.stringify(
        {
          phase,
          mode,
          method:
            'Three independent Chrome processes and contexts; same persisted 201-task project and account. Each after context signs in through the real form; before used a saved authenticated context. Sign-in is excluded from the menu timing, which starts after page readiness. First open per entry per process is cold renderer/menu (OS cache is not cleared); ten further opens per entry are warm. Input timestamps are captured in-page on actual pointerdown. Feedback/operable/stable/animation-settled are browser frame observations, not physical presentation. No locator round-trip time is used as latency. Outside click closes both baseline and new panels. Headless measurements do not establish native frame rate.',
          taskCount: 201,
          fixtureProject: fixture.projectId,
          results,
        },
        null,
        2,
      ),
    );
  }
}
