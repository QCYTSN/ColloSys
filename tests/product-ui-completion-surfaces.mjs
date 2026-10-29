import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, _electron as electron, expect as baseExpect } from '@playwright/test';
import { account, completionFixture } from './product-ui-completion-data.mjs';
import { inspectOverflow, inspectActions } from './product-ui-overflow.mjs';
const native = process.argv.includes('--native'),
  expect = baseExpect.configure({ timeout: 30000 });
const out = path.resolve(
  process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/completion',
  native ? 'native-surfaces' : 'surfaces',
);
await fs.mkdir(out, { recursive: true });
const f = await completionFixture(),
  checks = [],
  audits = [],
  environments = [],
  motion = [];
let browser, app, context, page;
const origin = 'http://127.0.0.1:3407';
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS', name);
}
async function shot(name) {
  await page.screenshot({ path: path.join(out, name + '.png') });
}
async function audit(name, selector) {
  const r = await inspectOverflow(page, selector);
  // Probe the active surface's key affordances. The Keyboard page contains
  // hundreds of virtualized shortcut editors; it is not a stable action list.
  const actionSelector = selector === '.collo-settings-surface'
    ? '.collo-settings-nav button,.collo-settings-top button,.collo-settings-top input,input[placeholder="Your name"],button.cc-btn-cyan,button[role="switch"]'
    : 'button:enabled,input:enabled,select:enabled,textarea:enabled,a[href]';
  const actions = await inspectActions(page, page.locator(selector).first().locator(actionSelector).filter({visible:true}));
  environments.push({
    name,
    ...(await page.evaluate(() => ({
      cssViewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio,
      cssZoom: getComputedStyle(document.documentElement).zoom,
      userAgent: navigator.userAgent,
    }))),
    ...(app
      ? await app.evaluate(({ BrowserWindow, screen }) => {
          const w = BrowserWindow.getAllWindows()[0];
          return {
            electronZoomFactor: w.webContents.getZoomFactor(),
            windowsDisplayScale: screen.getDisplayMatching(w.getBounds()).scaleFactor,
            electronVersion: process.versions.electron,
            chromeVersion: process.versions.chrome,
          };
        })
      : {}),
  });
  await fs.writeFile(path.join(out, 'environment.json'), JSON.stringify(environments, null, 2));
  audits.push({ name, ...r, actions });
  await fs.writeFile(path.join(out, 'overflow.json'), JSON.stringify(audits, null, 2));
  assert.deepEqual(r.faults, [], name);
  assert.equal(r.documentOverflow, 0, name);
  assert.deepEqual(actions.faults, [], name + ' actionability');
}
async function login(p, credentials = account.a) {
  await p.locator('#email').fill(credentials.email);
  await p.locator('#password').fill(credentials.password);
  await p.locator('form button[type=submit]').click();
  await expect(p.locator('.collo-topbar')).toBeVisible();
}
async function project(tab = 'workspaces') {
  await page.goto(`${origin}/projects/${f.projectId}?tab=${tab}`);
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(
      page.getByTestId(tab === 'workspaces' ? 'local-workspaces' : 'project-handoffs'),
    ).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
}
async function resize(width, height) {
  if (app)
    await app.evaluate(
      ({ BrowserWindow }, { width, height }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(width, height),
      { width, height },
    );
  else await page.setViewportSize({ width, height });
}
try {
  if (native) {
    const env = { ...process.env, COLLOSYS_DESKTOP_PROFILE: `test-${randomUUID()}` };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.COLLOSYS_WORKBENCH_PREVIEW;
    delete env.COLLOSYS_DESIGN_LAB;
    app = await electron.launch({
      executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
      args: [path.resolve('integrations/codecast/desktop/main.cjs')],
      env,
      timeout: 60000,
    });
    page = await app.firstWindow();
    context = page.context();
    await app.evaluate(({ BrowserWindow, dialog }) => {
      BrowserWindow.getAllWindows()[0].show();
      const original = dialog.showMessageBoxSync;
      dialog.showMessageBoxSync = (w, o) =>
        o?.buttons?.includes('Close now') ? 1 : original(w, o);
    });
    await resize(1440, 900);
  } else {
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: { dir: '.local/completion-surfaces-video', size: { width: 1440, height: 900 } },
    });
    page = await context.newPage();
  }
  page.setDefaultTimeout(30000);
  if (!native && !process.argv.includes('--skip-static-boot')) {
    await check(
      'Static boot, React initialization and auth have continuous geometry and no retained overlay',
      async () => {
        await context.addInitScript(() => {
          window.__bootFrames = [];
          const start = performance.now();
          function tick() {
            const staticShell = document.getElementById('boot-shell'),
              loader = document.querySelector('.collo-loading'),
              auth = document.querySelector('.collo-auth-layout'),
              shell = document.querySelector('.collo-topbar');
            const phase = staticShell
              ? 'static'
              : loader
                ? 'react'
                : auth
                  ? 'auth'
                  : shell
                    ? 'workspace'
                    : 'empty';
            const img = document.querySelector(
              '.collo-loading-top img,.collo-auth-brand>.collo-logo img,.collo-topbar img',
            );
            window.__bootFrames.push({
              at: Math.round(performance.now() - start),
              phase,
              mark: img ? img.getBoundingClientRect().toJSON() : null,
              background: getComputedStyle(document.body || document.documentElement)
                .backgroundColor,
            });
            if (!window.__stopBoot && performance.now() - start < 45000)
              requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
        let release;
        const gate = new Promise((r) => (release = r));
        await page.route('**/assets/*.js', async (route) => {
          await gate;
          await new Promise((r) => setTimeout(r, 120));
          await route.continue();
        });
        await page.goto(origin + '/login?reason=session_expired', { waitUntil: 'commit' });
        await expect(page.locator('#boot-shell')).toBeVisible();
        await shot('01-static-boot');
        release();
        await expect(page.locator('#email')).toBeVisible();
        await page.unrouteAll({ behavior: 'wait' });
        await page.evaluate(() => (window.__stopBoot = true));
        const frames = await page.evaluate(() => window.__bootFrames);
        await fs.writeFile(path.join(out, 'boot-frames.json'), JSON.stringify(frames, null, 2));
        assert.ok(frames.some((f) => f.phase === 'static'));
        assert.ok(frames.some((f) => f.phase === 'react'));
        await expect(page.locator('#boot-shell')).toHaveCount(0);
        const first = frames.find((f) => f.phase === 'static' && f.mark),
          react = frames.find((f) => f.phase === 'react' && f.mark);
        assert.ok(Math.abs(first.mark.x - react.mark.x) < 2);
        assert.equal(first.mark.width, react.mark.width);
        await expect(page.getByText(/Your session expired/)).toBeVisible();
        await shot('02-session-expired');
      },
    );
    await check(
      'Validation, error announcement and password manager fields remain functional',
      async () => {
        await page.locator('#email').fill('invalid');
        assert.equal(await page.locator('#email').evaluate((e) => e.checkValidity()), false);
        await page.locator('#email').fill(account.a.email);
        await page.locator('#password').fill('TEST-wrong-password');
        await page.locator('form button[type=submit]').click();
        await expect(page.locator('#auth-error')).toBeVisible();
        await expect(page.locator('#auth-error')).toBeFocused();
        await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'current-password');
        await audit('auth-error', '.collo-auth-layout');
        await shot('03-auth-error');
      },
    );
    await check(
      'Configured local registration validates confirmation and creates a real account',
      async () => {
        const c = await browser.newContext(),
          p = await c.newPage();
        await p.goto(origin + '/signup');
        const password = 'TEST-only-' + randomUUID();
        await p.locator('#email').fill('test-ui-completion-' + randomUUID() + '@example.test');
        await p.locator('#password').fill(password);
        await p.locator('#confirmPassword').fill('TEST-mismatch');
        await p.locator('form button[type=submit]').click();
        await expect(p.getByText('Passwords do not match', { exact: true })).toBeVisible();
        await p.locator('#confirmPassword').fill(password);
        await p.locator('form button[type=submit]').click();
        await expect(p.locator('.collo-projects')).toBeVisible();
        await c.close();
      },
    );
  } else if (native) {
    await page.goto(origin + '/login');
    await expect(page.locator('.collo-auth-layout')).toBeVisible();
    await shot('01-native-login');
  }
  await page.goto(
    origin + '/login?return_to=' + encodeURIComponent(`/projects/${f.projectId}?tab=handoffs`),
  );
  await login(page);
  await expect(page).toHaveURL(/tab=handoffs/);
  await project();
  await check(
    'Container layout survives sidebar drag extremes with the right rail open',
    async () => {
      const rail = page.getByRole('button', { name: 'Toggle sessions panel', exact: true });
      await page.getByRole('link', { name: 'ColloSys projects', exact: true }).click();
      await expect(page.locator('.collo-project-select')).toHaveCount(2);
      if (
        !(await page.evaluate(() => {
          const c = window.__inboxStore.getState().workspace.context;
          return c.pane?.kind === 'sessionList' && c.presentation !== 'collapsed';
        }))
      )
        await rail.click();
      await expect(async () =>
        assert.ok((await page.locator('#session-list').boundingBox()).width >= 199),
      ).toPass({ timeout: 30000 });
      for (const [width, height] of [
        [1440, 900],
        [1280, 800],
        [1920, 1080],
        [960, 720],
      ]) {
        await resize(width, height);
        for (const [label, target] of [
          ['minimum', 190],
          ['maximum', width * 0.49],
        ]) {
          const handle = page.locator('[role=separator][aria-controls=sidebar]');
          const box = await handle.boundingBox();
          await page.mouse.move(box.x + 0.5, box.y + 100);
          await page.mouse.down();
          await page.mouse.move(target, box.y + 100, { steps: 8 });
          await page.mouse.up();
          await page.waitForTimeout(180);
          await audit(`projects-${width}-${label}`, '.collo-work-stage');
          await shot(`04-projects-${width}-${label}`);
        }
      }
      await resize(1440, 900);
      const box = await page.locator('[role=separator][aria-controls=sidebar]').boundingBox();
      await page.mouse.move(box.x + 0.5, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(244, box.y + 100, { steps: 8 });
      await page.mouse.up();
      await rail.click();
    },
  );
  await project();
  await check('Anchored project menu flips and fits, then restores keyboard focus', async () => {
    await resize(960, 720);
    const trigger = page.getByRole('button', { name: 'Project details', exact: true });
    await trigger.click();
    await expect(page.locator('.collo-project-property-menu')).toBeVisible();
    await audit('project-menu', '.collo-project-property-menu');
    await shot('05-project-menu');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await resize(1440, 900);
  });
  await check(
    'Settings, page switching, exit and rapid reopening have interruptible feedback',
    async () => {
      await page.locator('.collo-settings-button').click();
      await expect(page.locator('.collo-settings-surface')).toBeVisible();
      for (const name of [
        'Profile & appearance',
        'Notifications',
        'Keyboard',
        'Connections',
        'About ColloSys',
      ]) {
        await page
          .locator('.collo-settings-surface')
          .getByRole('button', { name, exact: true })
          .click();
        await audit('settings-' + name, '.collo-settings-surface');
        await shot('06-settings-' + name.replaceAll(/[^a-z]/gi, '-'));
      }
      await page.getByRole('button', { name: 'Close settings', exact: true }).click();
      await expect(page.locator('.collo-settings-surface[data-phase=closing]')).toBeAttached();
      motion.push(
        await page.locator('.collo-settings-surface').evaluate((e) => ({
          phase: e.dataset.phase,
          opacity: getComputedStyle(e).opacity,
          animation: getComputedStyle(e).animationName,
        })),
      );
      await expect(page.locator('.collo-settings-surface')).toHaveCount(0);
      for (let i = 0; i < 4; i++) {
        await page.locator('.collo-settings-button').click();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(25);
      }
      await expect(page.locator('.collo-settings-surface')).toHaveCount(0);
      await expect(page.locator('.collo-settings-button')).toBeFocused();
    },
  );
  await check('Text zoom, dark theme and reduced motion remain operable', async () => {
    if (app)
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25),
      );
    else await page.evaluate(() => (document.documentElement.style.zoom = '1.25'));
    await audit('zoom-125', '.collo-project-header');
    await page.locator('.collo-settings-button').click();
    await page.getByRole('button', { name: 'Profile & appearance', exact: true }).click();
    await audit('settings-zoom', '.collo-settings-surface');
    await shot('07-zoom-settings');
    await page.getByRole('switch', { name: 'Dark mode', exact: true }).check();
    await page.locator('.collo-settings-body').evaluate((e) => (e.scrollTop = 0));
    await expect(page.locator('html')).toHaveClass(/dark/);
    await shot('08-dark');
    await page.getByRole('switch', { name: 'Dark mode', exact: true }).uncheck();
    await page.keyboard.press('Escape');
    if (app)
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1),
      );
    else await page.evaluate(() => (document.documentElement.style.zoom = ''));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.collo-settings-button').click();
    const reduced = await page.locator('.collo-settings-surface').evaluate((e) => ({
      name: getComputedStyle(e).animationName,
      duration: getComputedStyle(e).animationDuration,
    }));
    assert.equal(reduced.name, 'none');
    assert.ok(reduced.duration.split(',').every((value) => parseFloat(value) <= 0.00001));
    await page.keyboard.press('Escape');
    await expect(page.locator('.collo-settings-surface')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
  if (app) {
    const data = await app.evaluate(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return {
        visible: w.isVisible(),
        nativeHandle: !w.getNativeWindowHandle().every((b) => b === 0),
        scaleFactor: screen.getDisplayMatching(w.getBounds()).scaleFactor,
        bounds: w.getContentBounds(),
      };
    });
    assert.ok(data.visible && data.nativeHandle);
    await fs.writeFile(path.join(out, 'native-window.json'), JSON.stringify(data, null, 2));
  }
} catch (e) {
  await fs.writeFile(
    path.join(out, 'failure-state.json'),
    JSON.stringify(
      await page
        ?.evaluate(() => ({
          url: location.pathname,
          context: window.__inboxStore?.getState().workspace.context,
          initialized: window.__inboxStore?.getState().clientStateInitialized,
          rail: document.getElementById('session-list')?.getBoundingClientRect().toJSON(),
          panels: ['main', 'sidebar', 'right-content'].map((id) => {
            const el = document.getElementById(id);
            return { id, width: el?.clientWidth };
          }),
        }))
        .catch(() => null),
      null,
      2,
    ),
  );
  await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  throw e;
} finally {
  await fs.writeFile(
    path.join(out, 'results.json'),
    JSON.stringify({ at: new Date().toISOString(), native, checks, motion }, null, 2),
  );
  if (browser) {
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(path.join(out, 'interaction.webm'));
    await browser.close();
  }
  if (app) await app.close();
}
