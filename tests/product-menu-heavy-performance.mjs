// Heavy-path companion to product-menu-performance. This legacy dropdown is Project details, NOT Active/Display.
// Action wall times include driver/assertion overhead; only raw EventTiming is used for interaction summaries.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, denseFixture } from './product-ui-refinement-data.mjs';
const flag = (key, fallback) =>
  process.argv
    .find((v) => v.startsWith(`--${key}=`))
    ?.split('=')
    .slice(1)
    .join('=') || fallback;
const phase = flag('phase', 'before'),
  mode = flag('mode', 'production'),
  origin = flag('origin', 'http://127.0.0.1:3407');
const out = path.resolve(
  `docs/product-ui/menu-motion/evidence/${phase}/${mode}/flows/round-${flag('round', '1')}`,
);
await fs.mkdir(out, { recursive: true });
const fixture = await denseFixture(),
  expect = baseExpect.configure({ timeout: 45000 });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: '.local/identity-performance-videos', size: { width: 1440, height: 900 } },
  }),
  page = await context.newPage(),
  checks = [];
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(120000);
await context.addInitScript(() => {
  window.__identityMetrics = { longTasks: [], events: [], frames: [], actions: [], startup: [] };
  try {
    new PerformanceObserver((l) =>
      window.__identityMetrics.longTasks.push(
        ...l.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })),
      ),
    ).observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) =>
      window.__identityMetrics.events.push(
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
  let last = performance.now();
  function sample(now) {
    window.__identityMetrics.frames.push({ start: last, gap: now - last });
    last = now;
    if (window.__identityMetrics.frames.length < 50000) requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
  const inspect = () => {
    const key = [
      !!document.querySelector('.collo-topbar'),
      !!document.querySelector('#email'),
      !!document.querySelector('.collo-loading-screen'),
    ].join(':');
    if (window.__identityMetrics.startup.at(-1)?.state !== key)
      window.__identityMetrics.startup.push({ at: performance.now(), state: key });
  };
  new MutationObserver(inspect).observe(document, { subtree: true, childList: true });
});
const saved = [];
const capture = async (label) =>
  saved.push({ label, ...(await page.evaluate(() => window.__identityMetrics)) });
const go = async (route) => {
  console.log('OPEN', route.split('?')[1]);
  await capture('before navigation');
  await page.goto(origin + route);
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(page.locator('.collo-topbar')).toBeVisible({ timeout: 700 });
    if (route.includes('tab=workspaces'))
      await expect(page.getByTestId('local-workspaces')).toBeVisible({ timeout: 700 });
    if (route.includes('tab=sessions'))
      await expect(page.getByTestId('captured-conversation')).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
};
async function action(name, trigger, visible) {
  console.log('ACTION', name);
  await page.evaluate(() => window.__identityMetrics.actions.push({ start: performance.now() }));
  const start = Date.now();
  await trigger();
  await visible();
  await page.evaluate(
    (name) =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const a = window.__identityMetrics.actions.at(-1);
            a.name = name;
            a.feedbackFrame = performance.now();
            a.elapsed = a.feedbackFrame - a.start;
            resolve();
          }),
        ),
      ),
    name,
  );
  checks.push({ name, wallMs: Date.now() - start });
}
let cdp,
  tracing = false;
try {
  await page.goto(origin + '/');
  await expect(page.locator('#email')).toBeVisible({ timeout: 120000 });
  await page.screenshot({ path: out + '/cold-login.png' });
  await capture('cold startup without credentials');
  for (let i = 0; i < 3; i++) {
    await action(
      'login email input',
      async () => {
        await page.locator('#email').press('Control+A');
        await page
          .locator('#email')
          .pressSequentially(`test-perf-${i}@example.invalid`, { delay: 24 });
      },
      () => expect(page.locator('#email')).toHaveValue(`test-perf-${i}@example.invalid`),
    );
  }
  await capture('real sequential typing before authentication navigation');
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.collo-projects')).toBeVisible();
  await page.reload();
  await expect(page.locator('.collo-projects')).toBeVisible();
  await capture('valid session cold reload');
  cdp = await context.newCDPSession(page);
  await cdp.send('Tracing.start', {
    categories:
      mode === 'production'
        ? 'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-v8.cpu_profiler,disabled-by-default-devtools.screenshot'
        : 'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline.frame',
    transferMode: 'ReturnAsStream',
  });
  tracing = true;
  await go(`/projects/${fixture.projectId}?tab=workspaces`);
  await expect(page.getByTestId('local-workspaces')).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Project details', exact: false });
  for (let i = 0; i < 12; i++) {
    await action(
      i ? 'dropdown repeated' : 'dropdown first',
      () => trigger.click(),
      () => expect(page.locator('.collo-project-property-menu')).toBeVisible(),
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('.collo-project-property-menu')).toHaveCount(0);
  }
  for (let i = 0; i < 8; i++) {
    const toggle = page.getByRole('button', { name: /^(Hide|Show) sidebar$/ });
    await action(
      'sidebar toggle',
      () => toggle.click(),
      async () => {
        await page.waitForTimeout(240);
      },
    );
  }
  const handles = page.locator(
    '[role=separator][data-panel-resize-handle-id],[data-separator][role=separator]',
  );
  if (await handles.count()) {
    const box = await handles.first().boundingBox();
    if (box)
      await action(
        'sidebar drag',
        async () => {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + 90, box.y + box.height / 2, { steps: 20 });
          await page.mouse.move(box.x, box.y + box.height / 2, { steps: 20 });
          await page.mouse.up();
        },
        async () => {},
      );
  }
  await go(
    `/projects/${fixture.projectId}?tab=sessions&workspace=${fixture.workspaceId}&session=${fixture.sessionId}`,
  );
  await expect(page.getByTestId('captured-conversation')).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Load next messages', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Load next messages', exact: true }),
    ).toBeEnabled();
  }
  await page
    .locator('[data-testid=captured-conversation] [data-sv-feed]')
    .evaluate((e) => (e.scrollTop = 5200));
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
    await action(
      'long conversation return',
      () => page.locator(`[data-captured-session="${fixture.sessionId}"]`).click(),
      () => expect(page.getByTestId('captured-conversation')).toBeVisible(),
    );
  }
  await go(`/projects/${fixture.projectId}?tab=workspaces`);
  let cursor = null,
    event;
  do {
    const result = await fixture.a.client.query('collo:feed', {
      projectId: fixture.projectId,
      paginationOpts: { numItems: 20, cursor },
    });
    event = result.page.find((e) => e.kind === 'checkpoint' && e.payload.totalFiles === 32);
    cursor = result.isDone ? null : result.continueCursor;
  } while (!event && cursor);
  assert.ok(event);
  const row = page.locator(`[data-event-id="${event.id}"]`);
  for (let i = 0; i < 5 && !(await row.count()); i++) {
    await page.getByRole('button', { name: 'Earlier activity', exact: true }).click();
    await page.waitForTimeout(200);
  }
  await row.evaluate((element) => {
    element.addEventListener(
      'pointerdown',
      () => {
        const start = performance.now(),
          timeline = { start };
        window.__identityMetrics.diffTimeline = timeline;
        let same = 0,
          prior = '';
        const sample = () => {
          if (document.querySelector('[data-testid=checkpoint-completeness]'))
            timeline.selectionFeedback ??= performance.now() - start;
          const content = document.querySelector('.collo-checkpoint-diff');
          if (content && content.querySelectorAll('button[data-diff-file]').length === 32) {
            timeline.allFilesOperable ??= performance.now() - start;
            const key = content.textContent;
            same = key === prior ? same + 1 : 0;
            prior = key;
            if (same >= 3) {
              timeline.contentStable = performance.now() - start;
              return;
            }
          }
          if (performance.now() - start < 10000) requestAnimationFrame(sample);
          else timeline.timeout = true;
        };
        requestAnimationFrame(sample);
      },
      { once: true, capture: true },
    );
  });
  await action(
    '32-file diff first',
    () => row.click(),
    () => expect(page.getByTestId('checkpoint-completeness')).toBeVisible(),
  );
  await expect(page.locator('button[data-diff-file="TEST-source-28.ts"]')).toBeVisible();
  const split = page.getByRole('button', { name: 'Split', exact: true });
  if (await split.count()) await split.click();
  await expect(page.locator('button[data-diff-file="TEST-source-28.ts"]')).toBeVisible();
  for (const file of ['01', '28', '04', '27', '09', '32'])
    await action(
      'diff file selection',
      () => page.locator(`button[data-diff-file="TEST-source-${file}.ts"]`).click(),
      async () => {},
    );
  await page.screenshot({ path: out + '/real-diff.png' });
  await capture('multi-file diff');
} finally {
  if (tracing) {
    const completed = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end');
    const { stream } = await completed;
    const gzip = createGzip(),
      destination = createWriteStream(out + '/runtime-trace.json.gz');
    gzip.pipe(destination);
    for (;;) {
      const part = await cdp.send('IO.read', { handle: stream, size: 1048576 });
      if (!gzip.write(part.base64Encoded ? Buffer.from(part.data, 'base64') : part.data))
        await once(gzip, 'drain');
      if (part.eof) break;
    }
    await cdp.send('IO.close', { handle: stream });
    gzip.end();
    await finished(destination);
  }
  await capture('last page').catch(() => {});
  const video = page.video();
  const env = await page
    .evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      dpr: devicePixelRatio,
      userAgent: navigator.userAgent,
    }))
    .catch(() => ({ error: 'Page unavailable' }));
  env.build = await page
    .evaluate(() => fetch('/collo-build.json').then((r) => r.json()))
    .catch(() => null);
  await context.close();
  await video.saveAs(out + '/flow.webm');
  await browser.close();
  await fs.writeFile(
    out + '/performance.json',
    JSON.stringify(
      {
        phase,
        mode,
        origin,
        environment: env,
        method:
          'Real actions; EventTiming durations and browser long-task/frame observations. Action elapsed includes Playwright round trips and two animation frames (paint opportunity), not a hardware display latency measurement. Sidebar toggle samples include a declared 240ms settling wait and are not used for the 100ms feedback target. CDP trace begins after login; no credentials recorded.',
        data: { messages: 65, files: 32, fixtureProject: fixture.projectId },
        checks,
        samples: saved,
      },
      null,
      2,
    ),
  );
}
console.log('Captured actual ' + phase + ' ' + mode + ' performance and startup evidence');
