import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, _electron as electron, expect as baseExpect } from '@playwright/test';
import { account, denseFixture, eventually } from './product-ui-refinement-data.mjs';
const native = process.argv.includes('--native');
const expect = baseExpect.configure({ timeout: 30000 });
const out = path.resolve(
  process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/refinement',
  native ? 'native' : 'after',
);
await fs.mkdir(out, { recursive: true });
const checks = [],
  errors = [],
  styles = [];
const origin = 'http://127.0.0.1:3407';
const pairing = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
const fixture = await denseFixture();
let browser, app, page, video;
async function check(name, run) {
  await run();
  checks.push(name);
  console.log('PASS', name);
}
async function shot(name) {
  assert.equal(await page.getByText('StagePane crashed', { exact: true }).count(), 0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(240);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
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
async function go(route) {
  await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(page.locator('.collo-topbar')).toBeVisible();
    if (route.startsWith('/projects/') && route.includes('tab=sessions'))
      await expect(
        page.getByTestId('captured-conversation').or(page.getByTestId('captured-sessions')).first(),
      ).toBeVisible({ timeout: 500 });
    if (route.includes('tab=workspaces'))
      await expect(page.getByTestId('local-workspaces')).toBeVisible({ timeout: 500 });
    if (route.includes('tab=handoffs'))
      await expect(page.getByTestId('project-handoffs')).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 60000 });
}
async function captureStyle(label, locator) {
  await expect(locator).toBeVisible();
  styles.push(
    await locator.evaluate((e, label) => {
      const s = getComputedStyle(e),
        i = e.querySelector('svg');
      return {
        label,
        font: s.font,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        height: s.height,
        transition: s.transition,
        border: s.border,
        radius: s.borderRadius,
        icon: i
          ? { width: i.getBoundingClientRect().width, height: i.getBoundingClientRect().height }
          : null,
      };
    }, label),
  );
}
async function login(credentials) {
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => u.pathname === '/projects');
  await page.waitForSelector('.collo-projects');
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
      recordVideo: {
        dir: path.resolve('.local/refinement-native-video'),
        size: { width: 1440, height: 900 },
      },
      timeout: 60000,
    });
    page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow, dialog }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setContentSize(1440, 900);
      w.show();
      const original = dialog.showMessageBoxSync;
      dialog.showMessageBoxSync = (w, o) => (o.buttons?.includes('Close now') ? 1 : original(w, o));
    });
    await fs.writeFile(
      path.join(out, 'window.json'),
      JSON.stringify(
        await app.evaluate(({ BrowserWindow, screen }) => {
          const w = BrowserWindow.getAllWindows()[0];
          return {
            title: w.getTitle(),
            visible: w.isVisible(),
            native: !w.getNativeWindowHandle().every((v) => !v),
            isolation: w.webContents.getLastWebPreferences().contextIsolation,
            nodeIntegration: w.webContents.getLastWebPreferences().nodeIntegration,
            bounds: w.getBounds(),
            contentBounds: w.getContentBounds(),
            scaleFactor: screen.getDisplayMatching(w.getBounds()).scaleFactor,
          };
        }),
        null,
        2,
      ),
    );
    video = page.video();
  } else {
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
    });
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      recordVideo: {
        dir: path.resolve('.local/refinement-browser-video'),
        size: { width: 1440, height: 900 },
      },
    });
    video = page.video();
  }
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/login#pair=' + encodeURIComponent(pairing));
  await expect(page.locator('#email')).toBeVisible();
  await shot('01-login');
  await login(account.a);
  await go(`/projects/${account.projectId}?tab=workspaces`);
  await expect(page.getByTestId('local-workspaces')).toBeVisible();
  // Close the optional live-conversation rail through its real control if open.
  const rail = page.getByText('No active sessions', { exact: true });
  if (
    await page.evaluate(() => {
      const s = window.__inboxStore.getState().workspace.context;
      return s.pane?.kind === 'sessionList' && s.presentation !== 'collapsed';
    })
  )
    await page.getByRole('button', { name: 'Toggle sessions panel', exact: true }).click();
  await check('Real control size and press feedback survive the product cascade', async () => {
    const b = page.getByRole('button', { name: 'Connect directory', exact: true });
    await captureStyle('small outline button', b);
    const s = styles.at(-1);
    assert.equal(s.fontSize, '12px');
    assert.equal(s.fontWeight, '500');
    assert.equal(s.lineHeight, '16px');
    assert.equal(s.height, '32px');
    assert.match(s.transition, /transform 0.08s/);
    await b.hover();
    await page.mouse.down();
    await page.waitForTimeout(40);
    await shot('02-pressed-control');
    await page.mouse.up();
    if (await page.getByRole('dialog', { name: 'Connect your directory' }).isVisible())
      await page.keyboard.press('Escape');
    await captureStyle(
      'project tab',
      page
        .locator('.collo-project-tools')
        .getByRole('button', { name: 'Conversations', exact: true }),
    );
    await captureStyle('native select', page.locator('.collo-member-filter'));
  });
  await shot('03-activity');
  await go('/projects');
  await page.waitForSelector('.collo-project-row');
  await captureStyle(
    'primary button',
    page.getByRole('button', { name: 'New project', exact: true }),
  );
  await shot('04-projects');
  await check('Ordinary dialog uses a separate backdrop and actual surface', async () => {
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await expect(page.locator('.collo-dialog-surface')).toBeVisible();
    await captureStyle('input', page.getByRole('dialog').getByLabel('Project name'));
    const s = await page.locator('.collo-dialog-backdrop').evaluate((e) => ({
      radius: getComputedStyle(e).borderRadius,
      shadow: getComputedStyle(e).boxShadow,
    }));
    assert.equal(s.radius, '0px');
    assert.equal(s.shadow, 'none');
    await shot('05-project-dialog');
    await page.keyboard.press('Escape');
    await expect(page.locator('.collo-dialog-surface')).toHaveCount(0);
  });
  await check('Settings has real exit, immediate intent and focus return', async () => {
    await page.locator('.collo-settings-button').click();
    await expect(page.locator('.collo-settings-surface')).toBeVisible();
    await captureStyle(
      'settings navigation',
      page.getByRole('button', { name: 'Profile & appearance', exact: true }),
    );
    await captureStyle(
      'icon button',
      page.getByRole('button', { name: 'Close settings', exact: true }),
    );
    await shot('06-settings');
    const surface = await page.locator('.collo-settings-surface').evaluate((e) => ({
      width: e.getBoundingClientRect().width,
      radius: getComputedStyle(e).borderRadius,
    }));
    assert.equal(surface.width, 920);
    assert.equal(surface.radius, '14px');
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    await expect(page.locator('.collo-settings-surface[data-phase="closing"]')).toBeAttached();
    await expect(page.locator('.collo-settings-button')).toBeFocused();
    await page.waitForTimeout(50);
    await page.screenshot({ path: path.join(out, '07-settings-exit-middle.png') });
    await expect(page.locator('.collo-settings-surface')).toHaveCount(0);
    for (let i = 0; i < 3; i++) {
      await page.locator('.collo-settings-button').click();
      await page.getByRole('button', { name: 'Keyboard', exact: true }).click();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(25);
    }
    await expect(page.locator('.collo-settings-surface')).toHaveCount(0);
  });
  await check('Global conversations keep their navigation source on open and return', async () => {
    await go(`/inbox?project=${account.projectId}`);
    await page.locator('[data-captured-session]').first().click();
    await expect(page.getByTestId('captured-conversation')).toBeVisible();
    assert.equal(new URL(page.url()).pathname, '/inbox');
    await shot('08-global-conversation');
    await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
    await expect(page.getByTestId('captured-conversation')).toHaveCount(0);
    assert.equal(new URL(page.url()).pathname, '/inbox');
  });
  await go(`/projects/${account.projectId}?tab=sessions`);
  await page.waitForSelector('[data-captured-session]');
  await shot('09-conversations');
  await page.locator('[data-captured-session]').first().click();
  await page.waitForSelector('[data-testid=captured-conversation]');
  await shot('10-reader');
  await check('Diff uses remaining stage height with one vertical code scroller', async () => {
    await go(`/projects/${account.projectId}?tab=workspaces`);
    await page.locator('[data-event-id]').first().click();
    await expect(page.getByTestId('checkpoint-completeness')).toBeVisible();
    await shot('11-code');
    const geometry = await page.locator('.collo-checkpoint-diff').evaluate((e) => ({
      height: e.getBoundingClientRect().height,
      parentOverflow: getComputedStyle(e.closest('.collo-review')).overflowY,
      remaining: innerHeight - e.getBoundingClientRect().top,
    }));
    assert.ok(geometry.height > geometry.remaining - 70);
    assert.equal(geometry.parentOverflow, 'hidden');
    await page.getByRole('button', { name: 'Back to activity', exact: true }).click();
    await expect(page.locator('.collo-detail-surface[data-phase="closing"]')).toBeAttached();
    await expect(page.locator('.collo-review')).toHaveCount(0);
  });
  await check('Project menu returns focus on Escape and closes on outside click', async () => {
    const trigger = page.getByRole('button', { name: 'Project details', exact: true });
    await trigger.click();
    await expect(page.locator('.collo-project-property-menu')).toBeVisible();
    await captureStyle('project menu trigger', trigger);
    await captureStyle(
      'project menu item',
      page.locator('.collo-project-property-menu button').first(),
    );
    await shot('project-properties');
    await page.keyboard.press('Escape');
    await expect(page.locator('.collo-project-property-menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.locator('.collo-topbar').click({ position: { x: 300, y: 2 } });
    await expect(page.locator('.collo-project-property-menu')).toHaveCount(0);
  });
  for (const [name, route, ready] of [
    [
      '12-handoffs',
      `/projects/${account.projectId}?tab=handoffs`,
      '[data-testid=project-handoffs]',
    ],
    [
      '13-history',
      `/projects/${account.projectId}?tab=workspaces&workspaceView=history`,
      '[data-testid=local-workspaces]',
    ],
    ['14-tasks', '/tasks', '[data-cc-shell]'],
    ['15-connections', '/settings/integrations', '.collo-settings-surface'],
  ]) {
    await go(route);
    await page.waitForSelector(ready);
    await shot(name);
    if (name === '13-history') {
      const directory = page.getByRole('combobox', { name: 'Your local directory', exact: true });
      await expect.poll(() => directory.locator('option').count()).toBeGreaterThan(1);
      await directory.selectOption({ index: 1 });
      await expect(page.getByText('Preview restore', { exact: true }).first()).toBeVisible();
      await shot('history-populated');
    }
  }
  await page.keyboard.press('Escape');
  await check(
    'Long captured conversation restores its authorized page preparation and message anchor',
    async () => {
      await go(
        `/projects/${fixture.projectId}?tab=sessions&workspace=${fixture.workspaceId}&session=${fixture.sessionId}`,
      );
      await page.waitForSelector('[data-testid=captured-conversation]');
      await page.getByRole('button', { name: 'Load next messages', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Load next messages', exact: true }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Load next messages', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Load next messages', exact: true }),
      ).toBeEnabled();
      const scroller = page.locator('[data-testid=captured-conversation] [data-sv-feed]');
      await scroller.evaluate((e) => {
        e.scrollTop = 5200;
      });
      await page.waitForTimeout(400);
      const key = await page.evaluate(
        ({ p, s }) =>
          Object.entries(window.__inboxStore.getState().colloViewState).find(
            ([k]) => k.includes(p + ':conversation:') && k.includes(s),
          ),
        { p: fixture.projectId, s: fixture.sessionId },
      );
      assert.ok(key?.[1].anchor, 'A stable message ID must be recorded');
      const anchor = key[1].anchor;
      assert.ok(key[1].cursor > 20);
      await shot('16-dense-reader');
      await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
      await expect(page.getByTestId('captured-conversation')).toHaveCount(0);
      await page.locator(`[data-captured-session="${fixture.sessionId}"]`).click();
      await expect(page.locator(`[data-reading-message="${anchor}"]`)).toBeVisible({
        timeout: 30000,
      });
      await expect(async () => {
        const offset = await page
          .locator(`[data-reading-message="${anchor}"]`)
          .evaluate(
            (e) =>
              e.getBoundingClientRect().top -
              e.closest('[data-sv-feed]').getBoundingClientRect().top,
          );
        assert.ok(
          Math.abs(offset - key[1].offset) < 24,
          `Reading offset drifted: ${offset} vs ${key[1].offset}`,
        );
      }).toPass({ timeout: 15000 });
      await shot('17-reader-return');
    },
  );
  await check(
    'Unsent handoff draft survives route changes and remains scoped to its project',
    async () => {
      await page.getByRole('button', { name: 'Handoff', exact: true }).click();
      const d = page.getByRole('dialog', { name: 'New handoff' });
      await d.getByLabel('Title', { exact: true }).fill('TEST UNSENT · review continuity');
      await d
        .getByLabel('Context', { exact: true })
        .fill('Keep this local draft while I consult the source.');
      await shot('18-handoff-draft');
      await page.keyboard.press('Escape');
      await page
        .locator('.collo-project-tools')
        .getByRole('button', { name: 'Tasks', exact: true })
        .click();
      await page
        .locator('.collo-project-tools')
        .getByRole('button', { name: 'Handoffs', exact: true })
        .click();
      await page.getByRole('button', { name: 'New handoff', exact: true }).click();
      await expect(d.getByLabel('Title', { exact: true })).toHaveValue(
        'TEST UNSENT · review continuity',
      );
      await page.keyboard.press('Escape');
    },
  );
  await go(`/projects/${fixture.projectId}/${fixture.taskId}`);
  await expect(page.getByRole('button', { name: 'Add comment', exact: true })).toBeVisible();
  await shot('19-task-detail');
  await check('Multi-file review retains the selected original path when returning', async () => {
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
    assert.ok(event, 'The real adapter must have captured all 32 fixture files');
    const checkpoint = page.locator(`[data-event-id="${event.id}"]`);
    for (let batch = 0; batch < 5 && !(await checkpoint.count()); batch++) {
      const count = await page.locator('[data-event-id]').count();
      const more = page.getByRole('button', { name: 'Earlier activity', exact: true });
      await expect(more).toBeEnabled();
      await more.click();
      await expect.poll(() => page.locator('[data-event-id]').count()).toBeGreaterThan(count);
    }
    await checkpoint.click();
    await expect(page.getByTestId('checkpoint-completeness')).toBeVisible();
    const split = page.getByRole('button', { name: 'Split', exact: true });
    if (await split.count()) await split.click();
    await page.locator('button[data-diff-file="TEST-source-28.ts"]').click();
    await expect(async () =>
      assert.ok(
        await page.evaluate(() =>
          Object.values(window.__inboxStore.getState().colloViewState).some(
            (v) => v?.file === 'TEST-source-28.ts',
          ),
        ),
      ),
    ).toPass();
    await shot('20-dense-diff');
    await page.getByRole('button', { name: 'Back to activity', exact: true }).click();
    await expect(page.locator('.collo-review')).toHaveCount(0);
    await checkpoint.click();
    await expect(page.locator('.collo-checkpoint-diff')).toBeVisible();
    await expect(
      page.locator('.collo-checkpoint-diff button[data-diff-file="TEST-source-28.ts"]'),
    ).toHaveClass(/border-l-2/);
    await shot('21-diff-return');
    await page.getByRole('button', { name: 'Unified', exact: true }).click();
  });
  await check('Layout works at 1440×900, 1280×800, 1920×1080 and narrow widths', async () => {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [1920, 1080],
      [960, 720],
    ]) {
      await resize(width, height);
      await go(`/projects/${account.projectId}?tab=workspaces`);
      await page.waitForSelector('.collo-workspaces');
      await shot(`activity-${width}`);
      await page.locator('.collo-settings-button').click();
      await shot(`settings-${width}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.keyboard.press('Escape');
    }
    await resize(1440, 900);
    await page.locator('.collo-settings-button').click();
    await page.getByRole('switch', { name: 'Dark mode', exact: true }).check();
    await page.locator('.collo-settings-body').evaluate((e) => {
      e.scrollTop = 0;
    });
    await shot('settings-dark');
    await page.keyboard.press('Escape');
    await shot('activity-dark');
    await page.locator('.collo-settings-button').click();
    await page.getByRole('switch', { name: 'Dark mode', exact: true }).uncheck();
    await page.keyboard.press('Escape');
  });
  await check('Reduced motion and keyboard exit have a complete path', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.collo-settings-button').click();
    assert.equal(
      await page
        .locator('.collo-settings-surface')
        .evaluate((e) => getComputedStyle(e).animationName),
      'none',
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('.collo-settings-surface')).toHaveCount(0);
    await expect(page.locator('.collo-settings-button')).toBeFocused();
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const doc = await cdp.send('DOM.getDocument');
  const textNode = await cdp.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '.collo-event-copy strong',
  });
  if (textNode.nodeId)
    await fs.writeFile(
      path.join(out, 'actual-fonts.json'),
      JSON.stringify(
        await cdp.send('CSS.getPlatformFontsForNode', { nodeId: textNode.nodeId }),
        null,
        2,
      ),
    );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(out, 'results.json'),
    JSON.stringify(
      { native, passed: true, checks, styles, errors, capturedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
} catch (error) {
  await fs.writeFile(
    path.join(out, 'failure.json'),
    JSON.stringify({ checks, styles, errors, error: String(error) }, null, 2),
  );
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  const recordedPath = video ? await video.path() : null;
  if (app) await app.close();
  if (browser) {
    await page?.context().close();
    await browser.close();
  }
  if (recordedPath) await fs.copyFile(recordedPath, path.join(out, 'continuity.webm'));
}
