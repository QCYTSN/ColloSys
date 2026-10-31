import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { _electron as electron, expect as baseExpect } from '@playwright/test';
import { account } from './product-ui-refinement-data.mjs';
const expect = baseExpect.configure({ timeout: 60000 });
const workspaceOnly = process.argv.includes('--workspace');
const out =
  process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/menu-motion/evidence/native-menus';
await fs.mkdir(out, { recursive: true });
const env = { ...process.env, COLLOSYS_DESKTOP_PROFILE: 'test-' + randomUUID() };
delete env.ELECTRON_RUN_AS_NODE;
delete env.COLLOSYS_WORKBENCH_PREVIEW;
delete env.COLLOSYS_DESIGN_LAB;
const app = await electron.launch({
  executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
  args: [path.resolve('integrations/codecast/desktop/main.cjs')],
  env,
  timeout: 60000,
});
const page = await app.firstWindow(),
  checks = [];
const capture = async (file) => {
  // Electron CDP screenshots can double-apply native DPI + page zoom. Capture
  // the actual webContents surface instead of a cropped CDP viewport.
  const png = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
  );
  await fs.writeFile(file, Buffer.from(png, 'base64'));
};
const contained = async (locator) => {
  await expect(locator).toBeVisible();
  await expect
    .poll(async () =>
      locator.evaluate((e) => e.getAnimations().filter((a) => a.playState === 'running').length),
    )
    .toBe(0);
  const b = await locator.boundingBox(),
    v = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  assert.ok(
    b.x >= 0 && b.y >= 0 && b.x + b.width <= v.w + 1 && b.y + b.height <= v.h + 1,
    JSON.stringify({ b, v }),
  );
};
try {
  await expect(page.locator('#email')).toBeVisible();
  if (!workspaceOnly) {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await expect(page.locator('.collo-companion-scene')).toHaveAttribute('data-paused', 'true');
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.restore();
    w.show();
  });
  await expect(page.locator('.collo-companion-scene')).toHaveAttribute('data-paused', 'false');
  checks.push({
    result:
      'Actual native minimize pauses the scene; restore resumes visibility without moving input focus.',
  });
  }
  if (workspaceOnly) {
    const profile = JSON.parse(await fs.readFile('docs/product-ui/workspace-polish/evidence/actual-profile.json', 'utf8'));
    await page.evaluate(profile => {
      localStorage.setItem('collosys.appearance.v1', JSON.stringify(profile.appearance));
      localStorage.setItem('collo.boot.nav', JSON.stringify(profile.sidebar));
    }, profile);
    await page.reload();
  }
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.collo-projects')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Tasks', exact: true }).click();
  const display = page.getByTitle('Display options', { exact: true }),
    panel = page.locator('.collo-display-panel[data-state=open]');
  for (const factor of [1, 1.25, 1.5, 2]) {
    const native = await app.evaluate(({ BrowserWindow, Menu, screen }, factor) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setBounds({ width: 1280, height: 800 });
      w.webContents.setZoomFactor(factor);
      return {
        zoom: w.webContents.getZoomFactor(),
        displayScale: screen.getDisplayMatching(w.getBounds()).scaleFactor,
        nativeHandle: !w.getNativeWindowHandle().every((x) => x === 0),
        menuVisible: w.isMenuBarVisible(),
        applicationMenu: Menu.getApplicationMenu() !== null,
      };
    }, factor);
    assert.equal(native.zoom, factor);
    assert.ok(native.nativeHandle);
    assert.equal(native.menuVisible, false);
    assert.equal(native.applicationMenu, false);
    await display.click();
    await contained(panel);
    await panel.getByRole('button', { name: /^Grouping:/ }).click();
    const group = page.locator('.collo-setting-menu[aria-label=Grouping][data-state=open]');
    await contained(group);
    await capture(`${out}/display-${factor * 100}.png`);
    await group.getByRole('menuitemradio', { name: 'Session', exact: true }).click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: /^Grouping:/ }).click();
    await group.getByRole('menuitemradio', { name: 'Status', exact: true }).click();
    await panel.getByRole('button', { name: 'Copy link to this view' }).click();
    await expect(panel).toHaveCount(0);
    const preset = page.locator('.cq-tabs-compact .collo-list-trigger');
    await preset.click();
    await contained(page.locator('.collo-preset-menu[data-state=open]'));
    await capture(`${out}/active-${factor * 100}.png`);
    await page.keyboard.press('Escape');
    await expect(preset).toBeFocused();
    checks.push({
      factor,
      native,
      renderer: await page.evaluate(() => ({
        viewport: { width: innerWidth, height: innerHeight },
        dpr: devicePixelRatio,
        visualScale: visualViewport.scale,
      })),
      result:
        'Real native zoom: preset, parent and nested menus within viewport; all grouping options and bottom action reachable; layered focus restoration.',
    });
  }
  if (workspaceOnly) {
    const fixture = JSON.parse(await fs.readFile('.local/workspace-polish-fixture.json', 'utf8'));
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setBounds({ width: 1440, height: 852 });
      w.webContents.setZoomFactor(1);
    });
    await page.goto(`http://127.0.0.1:3407/projects/${fixture.projectId}?tab=workspaces&event=${fixture.eventId}`);
    await expect(async () => {
      if (await page.locator('[data-foreign-switch]').isVisible()) await page.locator('[data-foreign-switch]').click();
      await expect(page.locator('.collo-checkpoint-diff')).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 60000 });
    if (await page.getByRole('button', { name: 'Split', exact: true }).count()) await page.getByRole('button', { name: 'Split', exact: true }).click();
    await page.locator('button[data-diff-file="long.ts"]').click();
    await expect(page.locator('diffs-container')).toBeVisible();
    await capture(`${out}/native-actual-iris-dpr2.png`);
    checks.push({ actualAppearance: await page.evaluate(() => ({ appearance: JSON.parse(localStorage.getItem('collosys.appearance.v1')), dpr: devicePixelRatio, width: innerWidth, height: innerHeight })), result: 'Real native checkpoint Diff at actual Iris light / zoom1 / OS scale2' });
  }
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        checks,
        build: await page.evaluate(() => fetch('/collo-build.json').then((r) => r.json())),
        limits:
          'Actual Electron window and webContents zoom; OS display scale recorded, not changed. Screenshots show renderer content. Native frame evidence is in the separate native regression.',
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
}
console.log('Native menu zoom 100/125/150/200 passed');
