import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { chromium, expect as baseExpect } from '@playwright/test';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';
import { account } from './product-ui-refinement-data.mjs';
const out =
  process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/auth-completion/evidence/after/login';
await fs.mkdir(out, { recursive: true });
const expect = baseExpect.configure({ timeout: 30000 }),
  checks = [],
  layouts = [];
const env = parseEnv(await fs.readFile('.local/codecast-app/local.env', 'utf8'));
assert.equal(env.CONVEX_SELF_HOSTED_URL, 'http://127.0.0.1:3408');
const backend = new ConvexHttpClient(env.CONVEX_SELF_HOSTED_URL),
  admin = new ConvexHttpClient(env.CONVEX_SELF_HOSTED_URL);
admin.setAdminAuth(env.CONVEX_SELF_HOSTED_ADMIN_KEY);
const keys = ['AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'];
const original = await Promise.all(
  keys.map((name) => admin.query('_system/cli/queryEnvironmentVariables:get', { name })),
);
assert.ok(
  original.every((v) => !v),
  'Do not replace real configured providers for this controlled test.',
);
const configure = async (enabled) => {
  const r = await fetch(env.CONVEX_SELF_HOSTED_URL + '/api/update_environment_variables', {
    method: 'POST',
    headers: {
      Authorization: `Convex ${env.CONVEX_SELF_HOSTED_ADMIN_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      changes: keys.map((name) => (enabled ? { name, value: 'TEST-controlled-unused' } : { name })),
    }),
  });
  assert.ok(r.ok);
};
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: '.local/auth-completion-videos', size: { width: 1440, height: 900 } },
});
await context.addInitScript(() => {
  window.__testAuthMetrics = { events: [], frames: [], phases: [] };
  try {
    new PerformanceObserver((l) =>
      window.__testAuthMetrics.events.push(
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
  const tick = (now) => {
    window.__testAuthMetrics.frames.push({ start: last, gap: now - last });
    last = now;
    if (window.__testAuthMetrics.frames.length < 30000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest?.('.collo-oauth button');
      const control = button?.textContent.trim();
      if (!button || button.disabled || !['GitHub', 'Google', 'Cancel', 'Retry'].includes(control))
        return;
      const surface = document.querySelector('.collo-oauth');
      const before = surface?.dataset.phase;
      const sample = { control, trustedClick: event.isTrusted, start: performance.now(), before };
      window.__testAuthMetrics.phases.push(sample);
      let previous = '',
        stable = 0;
      const frame = () => {
        if (!surface?.isConnected) return;
        const elapsed = performance.now() - sample.start;
        const phase = surface.dataset.phase;
        if (phase !== before) sample.feedbackOpportunity ??= elapsed;
        const ready =
          phase !== before &&
          ['awaiting-provider', 'cancelled', 'failed', 'expired', 'idle'].includes(phase);
        if (ready) sample.operableOpportunity ??= elapsed;
        const key = phase + ':' + surface.textContent;
        stable = key === previous ? stable + 1 : 0;
        previous = key;
        if (ready && stable >= 3) sample.contentStableOpportunity ??= elapsed;
        if (
          ready &&
          !surface
            .getAnimations({ subtree: true })
            .some(
              (a) =>
                a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime),
            )
        )
          sample.animationSettled ??= elapsed;
        sample.phase = phase;
        if (elapsed < 1500 && (!sample.contentStableOpportunity || !sample.animationSettled))
          requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    true,
  );
  if (!localStorage.getItem('collosys.appearance.v1'))
    localStorage.setItem(
      'collosys.appearance.v1',
      JSON.stringify({ version: 1, mode: 'light', accent: 'iris' }),
    );
  // Only native browser launch is controlled. Relay creation/cancellation remains real.
  window.__testBridge = { mode: 'resolve', calls: [], rejects: [] };
  window.__COLLOSYS_DESKTOP__ = {
    setAppearance: async () => {},
    onVisibilityChange: () => () => {},
    beginSignIn: (request) => {
      window.__testBridge.calls.push(request.attemptId);
      return window.__testBridge.mode === 'hold'
        ? new Promise((resolve, reject) =>
            window.__testBridge.rejects.push(() =>
              reject(Error('TEST delayed browser launch failure')),
            ),
          )
        : Promise.resolve();
    },
  };
});
let holdCapabilities = true,
  capabilityQueue = [];
let disconnected = false,
  sockets = [],
  holdPassword = false,
  held = [],
  counts = { password: 0, github: 0, google: 0, create: 0, cancel: 0 };
await context.routeWebSocket(/127\.0\.0\.1:3408/, (socket) => {
  if (disconnected) {
    socket.close();
    return;
  }
  sockets.push(socket);
  const server = socket.connectToServer();
  const capabilityIds = new Set();
  let queuing = false;
  socket.onMessage((message) => {
    let value;
    try {
      value = JSON.parse(String(message));
    } catch {}
    for (const mod of value?.modifications || [])
      if (mod.udfPath === 'auth:signInProviders') capabilityIds.add(mod.queryId);
    if (value?.type === 'Action' && value.udfPath === 'auth:signIn') {
      const provider = value.args?.[0]?.provider;
      if (provider in counts) counts[provider]++;
      if (provider === 'password' && holdPassword) {
        held.push(() => server.send(message));
        return;
      }
    }
    if (value?.type === 'Mutation' && value.udfPath === 'colloAuthRelay:create') counts.create++;
    if (value?.type === 'Mutation' && value.udfPath === 'colloAuthRelay:cancel') counts.cancel++;
    server.send(message);
  });
  server.onMessage((message) => {
    let value;
    try {
      value = JSON.parse(String(message));
    } catch {}
    if (
      holdCapabilities &&
      (queuing || value?.modifications?.some((mod) => capabilityIds.has(mod.queryId)))
    ) {
      queuing = true;
      capabilityQueue.push(() => socket.send(message));
    } else socket.send(message);
  });
});
const page = await context.newPage();
page.setDefaultNavigationTimeout(120000);
const anchors = () =>
  page.evaluate(() =>
    Object.fromEntries(
      ['.collo-auth-step h1', '#email', '#password'].map((s) => [
        s,
        document.querySelector(s).getBoundingClientRect().y,
      ]),
    ),
  );
const record = async (name, base) => {
  const current = await anchors();
  if (base)
    for (const k of Object.keys(base))
      assert.ok(
        Math.abs(current[k] - base[k]) <= 1,
        `${name} moved ${k}: ${current[k] - base[k]}px`,
      );
  layouts.push({ name, viewport: page.viewportSize(), anchors: current });
};
try {
  await page.goto('http://127.0.0.1:3407/login');
  await page.locator('#email').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-capability=checking]')).toHaveCount(2);
  const checkingBase = await anchors();
  await record('checking initial', checkingBase);
  await page.screenshot({ path: out + '/provider-checking.png' });
  await expect(page.locator('[data-capability=temporarily-unavailable]')).toHaveCount(2);
  await record('capability deadline', checkingBase);
  holdCapabilities = false;
  capabilityQueue.splice(0).forEach((send) => send());
  await page.getByRole('button', { name: 'Retry check', exact: true }).click();
  await expect(page.locator('[data-capability=unconfigured]')).toHaveCount(2);
  await record('capability retry recovered', checkingBase);
  checks.push(
    'Real provider query response held past its 8s deadline: checking → unavailable → Retry → actual unconfigured, without remount or anchor movement.',
  );
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [1920, 1080],
    [960, 720],
  ]) {
    await page.setViewportSize({ width, height });
    const base = await anchors();
    await record('unconfigured', base);
    await page.getByRole('button', { name: 'Refresh check', exact: true }).click();
    await record('refresh capability check', base);
    await page.locator('#email').fill('TEST-layout@example.invalid');
    await page.locator('#password').fill('TEST-invalid-password');
    await page.locator('form button[type=submit]').click();
    await expect(page.locator('.collo-auth-error')).toBeVisible();
    await record('real email error', base);
    await page.locator('.collo-auth-error').evaluate((e) => {
      e.textContent =
        '当前网络连接暂时不可用，请保留已经输入的邮箱地址，检查连接后重试。如果你取消了第三方授权，可以重新发起请求，也可以继续使用原来的登录方式。此处是明确标注的长中文文案排版压力测试。';
    });
    await record('controlled long Chinese copy', base);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({
      path: `${out}/long-error-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.reload();
    await page.locator('#email').waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  checks.push(
    'Actual bundled fonts; title/email/password anchors unchanged within 1px through refresh, real errors and controlled long Chinese copy at 1440/1280/1920/960.',
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = await anchors();
  await page.locator('#email').fill('');
  await page.evaluate(() => {
    window.__testAuthMetrics = {
      events: [],
      frames: [],
      phases: [],
      rangeStart: performance.now(),
    };
  });
  await page.locator('#email').pressSequentially('TEST-art-running@example.invalid', { delay: 28 });
  await page.evaluate(() => {
    window.__testAuthMetrics.rangeEnd = performance.now();
  });
  await page.waitForTimeout(100); // Let buffered EventTiming deliver the final keystroke.
  const typingMetrics = await page.evaluate(() => window.__testAuthMetrics);
  await fs.writeFile(
    out + '/typing-performance.json',
    JSON.stringify(
      {
        viewport: page.viewportSize(),
        build: await page.evaluate(() => fetch('/collo-build.json').then((r) => r.json())),
        metrics: typingMetrics,
        method:
          'Real sequential keyboard input with active artwork; EventTiming and rAF samples, not hardware frame-rate certification.',
      },
      null,
      2,
    ),
  );
  await configure(true);
  await expect(page.locator('[data-capability=ready]')).toHaveCount(2);
  await record('ready', base);
  holdPassword = true;
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill('TEST-wrong-password');
  const before = counts.password;
  await page.locator('form button[type=submit]').evaluate((e) => {
    e.click();
    e.click();
  });
  await expect.poll(() => held.length).toBe(1);
  await expect(page.getByRole('button', { name: 'GitHub', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Google', exact: true }).evaluate((e) => e.click());
  assert.equal(counts.google, 0);
  assert.equal(counts.password - before, 1);
  await record('password submitting', base);
  holdCapabilities = false;
  capabilityQueue.splice(0).forEach((send) => send());
  holdPassword = false;
  held.splice(0).forEach((release) => release());
  await expect(page.locator('.collo-auth-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'GitHub', exact: true })).toBeEnabled();
  checks.push(
    'Real password request held in transport; same-frame double submit sends one request and blocks both provider starts.',
  );
  const beforeCreate = counts.create;
  await page.evaluate(() => {
    window.__testAuthMetrics = { events: [], frames: [], phases: [] };
  });
  await page.getByRole('button', { name: 'GitHub', exact: true }).evaluate((e) => {
    e.click();
    e.click();
  });
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await expect(page.locator('.collo-oauth')).toHaveAttribute('data-phase', 'awaiting-provider');
  assert.equal(counts.create - beforeCreate, 1);
  await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeDisabled();
  await expect(page.locator('form button[type=submit]')).toBeDisabled();
  await record('provider waiting', base);
  await page.screenshot({ path: out + '/provider-waiting.png' });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await record('provider cancelled', base);
  await page.evaluate(() => (window.__testBridge.mode = 'hold'));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__testBridge.rejects.length)).toBe(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => (window.__testBridge.mode = 'resolve'));
  await page.getByRole('button', { name: 'Google', exact: true }).click();
  await expect(page.locator('.collo-oauth')).toHaveAttribute('data-phase', 'awaiting-provider');
  const latest = await page.evaluate(() => window.__testBridge.calls.at(-1));
  await page.evaluate(() => window.__testBridge.rejects.shift()());
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__testBridge.calls.at(-1)), latest);
  await expect(page.locator('.collo-oauth')).toHaveAttribute('data-phase', 'awaiting-provider');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('#email')).toHaveValue(account.a.email);
  await page.waitForTimeout(240); // Observe the final cancel's finite press animation.
  // Performance samples use real pointer input and completed states separately
  // from the synthetic same-frame race assertions above.
  await page.evaluate(() => {
    window.__testAuthMetrics = { events: [], frames: [], phases: [] };
  });
  for (const provider of ['GitHub', 'Google']) {
    await page.getByRole('button', { name: provider, exact: true }).click();
    await expect(page.locator('.collo-oauth')).toHaveAttribute('data-phase', 'awaiting-provider');
    await page.waitForTimeout(240);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForTimeout(240);
  }
  await fs.writeFile(
    out + '/provider-state-performance.json',
    JSON.stringify(
      {
        metrics: await page.evaluate(() => window.__testAuthMetrics),
        build: await page.evaluate(() => fetch('/collo-build.json').then((r) => r.json())),
        method:
          'Real provider-button and Cancel pointer input, actual relay requests, controlled desktop browser launch, active artwork. UI phase readiness, three-frame DOM stability and finite animation completion are after-only observations, not real provider authorization or hardware presentation.',
      },
      null,
      2,
    ),
  );
  checks.push(
    'Real desktop relay requests: provider double click creates once; waiting blocks email/other provider; cancel/retry gets a new ID; delayed old bridge failure cannot overwrite the new attempt; draft retained.',
  );
  await page.reload();
  await page.locator('#email').waitFor();
  disconnected = true;
  sockets.splice(0).forEach((s) => s.close());
  await context.setOffline(true);
  await expect(page.locator('[data-capability=temporarily-unavailable]')).toHaveCount(2);
  await record('provider disconnected', base);
  disconnected = false;
  await context.setOffline(false);
  await expect(page.locator('[data-capability=ready]')).toHaveCount(2);
  await configure(false);
  await expect(page.locator('[data-capability=unconfigured]')).toHaveCount(2);
  await record('configuration removed', base);
  await page.getByRole('button', { name: 'Setup help', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByText('Service owner configuration', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'http://127.0.0.1:3409/api/auth/callback/github',
  );
  await page.keyboard.press('Escape');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      localStorage.setItem(
        'collosys.appearance.v1',
        JSON.stringify({ version: 1, mode: theme, accent: 'iris' }),
      );
    }, theme);
    await page.reload();
    await page.locator('#email').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: `${out}/static-${theme}.png` });
    await page.locator('.collo-auth-visual').screenshot({ path: `${out}/art-${theme}.png` });
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    localStorage.setItem(
      'collosys.appearance.v1',
      JSON.stringify({ version: 1, mode: 'light', accent: 'iris' }),
    );
  });
  await page.reload();
  await page.locator('#email').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const motion = await page.evaluate(async () => {
    const samples = [],
      start = performance.now();
    await new Promise((resolve) => {
      const frame = () => {
        samples.push({
          at: performance.now() - start,
          x: new DOMMatrixReadOnly(
            getComputedStyle(document.querySelector('.collo-water-reflection')).transform,
          ).m41,
          still: getComputedStyle(document.querySelector('.collo-water-still')).transform,
        });
        if (performance.now() - start < 2100) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    return samples;
  });
  assert.ok(motion.every((s) => s.still === 'none' && Math.abs(s.x) <= 9.01));
  assert.ok(Math.max(...motion.map((s) => s.x)) - Math.min(...motion.map((s) => s.x)) > 1);
  await fs.writeFile(out + '/reflection-motion.json', JSON.stringify(motion, null, 2));
  await page.locator('#email').focus();
  await page.waitForTimeout(260);
  assert.ok(
    Math.abs(
      (await page
        .locator('.collo-water-light')
        .evaluate((e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).m41)) - 6,
    ) < 0.05,
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page
      .locator('.collo-water-reflection')
      .evaluate((e) => getComputedStyle(e).animationName),
    'none',
  );
  checks.push(
    'Full-page static light/dark; real 2.1s reflection samples and focus shift; reduced-motion keeps artwork static.',
  );
  await page.goto('http://127.0.0.1:3407/signup');
  await page.locator('#email').waitFor();
  await page.setViewportSize({ width: 960, height: 600 });
  await page.locator('form button[type=submit]').scrollIntoViewIfNeeded();
  await expect(page.locator('form button[type=submit]')).toBeInViewport();
  await page.screenshot({ path: out + '/signup-low-height.png', fullPage: true });
  checks.push(
    'Registration at 960x600 naturally scrolls to every action without clipping messages.',
  );
  await fs.writeFile(
    out + '/layout-and-transaction.json',
    JSON.stringify(
      {
        checks,
        layouts,
        requestCounts: counts,
        boundary:
          'Real built app, bundled fonts and loopback backend. Temporary TEST provider settings; desktop browser launch and password transport delay controlled. No external provider authorization. Long Chinese copy is declared layout stress injection.',
      },
      null,
      2,
    ),
  );
  checks.forEach((c) => console.log('PASS', c));
} finally {
  holdPassword = false;
  held.splice(0).forEach((release) => release());
  await configure(false);
  await page.screenshot({ path: '.local/auth-completion-last.png' }).catch(() => {});
  const video = page.video();
  await context.close();
  await video.saveAs(out + '/states.webm');
  await browser.close();
}
