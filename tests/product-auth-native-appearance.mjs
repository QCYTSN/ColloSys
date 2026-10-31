import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { _electron as electron, expect as baseExpect } from '@playwright/test';
import { account } from './product-ui-refinement-data.mjs';
const out = 'docs/product-ui/auth-completion/evidence/native';
await fs.mkdir(out, { recursive: true });
const expect = baseExpect.configure({ timeout: 60000 }),
  checks = [];
const baseEnv = { ...process.env };
delete baseEnv.ELECTRON_RUN_AS_NODE;
delete baseEnv.COLLOSYS_DESKTOP_PROFILE;
delete baseEnv.COLLOSYS_WORKBENCH_PREVIEW;
delete baseEnv.COLLOSYS_DESIGN_LAB;
const launch = (env) =>
  electron.launch({
    executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
    args: [path.resolve('integrations/codecast/desktop/main.cjs')],
    env,
    timeout: 60000,
  });
const windowState = (app) =>
  app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return {
      nativeHandle: !w.getNativeWindowHandle().every((b) => b === 0),
      zoom: w.webContents.getZoomFactor(),
      bounds: w.getBounds(),
      displayScale: screen.getDisplayMatching(w.getBounds()).scaleFactor,
    };
  });
// Metadata allowlist only. No screenshots, business records, tokens or auth keys
// are read from the actual default profile. No preference is written there.
let originalApp = await launch(baseEnv),
  originalPage = await originalApp.firstWindow(),
  profile;
try {
  await expect(
    originalPage.locator('.collo-auth-layout, .collo-topbar, .collo-startup-recovery').first(),
  ).toBeVisible();
  profile = await originalPage.evaluate(async () => ({
    appearance: JSON.parse(localStorage.getItem('collosys.appearance.v1') || 'null'),
    sidebar: JSON.parse(localStorage.getItem('collo.boot.nav') || 'null'),
    viewport: { width: innerWidth, height: innerHeight },
    dpr: devicePixelRatio,
    build: await fetch('/collo-build.json').then((r) => r.json()),
  }));
  profile.window = await windowState(originalApp);
  await fs.writeFile(out + '/actual-profile-metadata.json', JSON.stringify(profile, null, 2));
} finally {
  await originalApp.close();
}
const env = { ...baseEnv, COLLOSYS_DESKTOP_PROFILE: 'test-' + randomUUID() };
let app = await launch(env),
  page = await app.firstWindow();
const snapshot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const appearance = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('collosys.appearance.v1')));
const accent = () =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--collo-accent').trim(),
  );
const settings = async () => {
  await expect(page.locator('.collo-projects')).toBeVisible();
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.focus();
    w.webContents.focus();
    w.webContents.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['control'] });
    w.webContents.sendInputEvent({ type: 'keyUp', keyCode: ',', modifiers: ['control'] });
  });
  await expect(page.locator('.collo-appearance-settings')).toBeVisible();
};
try {
  await expect(page.locator('#email')).toBeVisible();
  await page.evaluate((p) => {
    if (p.appearance) localStorage.setItem('collosys.appearance.v1', JSON.stringify(p.appearance));
    if (p.sidebar) localStorage.setItem('collo.boot.nav', JSON.stringify(p.sidebar));
  }, profile);
  await app.evaluate(({ BrowserWindow }, s) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setBounds(s.bounds);
    w.webContents.setZoomFactor(s.zoom);
  }, profile.window);
  await page.reload();
  await expect(page.locator('#email')).toBeVisible();
  await snapshot('login-matching-user');
  assert.deepEqual(await appearance(), profile.appearance);
  assert.equal((await windowState(app)).zoom, profile.window.zoom);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await expect(page.locator('.collo-companion-scene')).toHaveAttribute('data-paused', 'true');
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.restore();
    w.show();
    w.focus();
  });
  await expect(page.locator('.collo-companion-scene')).toHaveAttribute('data-paused', 'false');
  checks.push(
    'Actual default profile metadata read only; isolated TEST window mirrors appearance/sidebar/zoom/OS scale. Native minimize pauses artwork and restore resumes it.',
  );
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.collo-topbar')).toBeVisible();
  await settings();
  await expect(page.getByRole('region', { name: 'Login methods' })).toBeVisible();
  await expect(page.locator('.collo-login-methods')).toContainText('Email and password');
  await expect(
    page.locator('.collo-login-methods').getByRole('button', { name: 'Link', exact: true }),
  ).toHaveCount(2);
  for (const b of await page
    .locator('.collo-login-methods')
    .getByRole('button', { name: 'Link', exact: true })
    .all())
    await expect(b).toBeDisabled();
  await page.locator('#collo-current-password').fill('TEST-wrong-password');
  await page
    .locator('.collo-method-reverify')
    .getByRole('button', { name: 'Verify', exact: true })
    .click();
  await expect(page.locator('.collo-method-error')).toContainText('Verification failed');
  await page.locator('#collo-current-password').fill(account.a.password);
  await page
    .locator('.collo-method-reverify')
    .getByRole('button', { name: 'Verify', exact: true })
    .click();
  await expect(page.locator('.collo-login-methods')).toContainText(
    'Identity verified for the next five minutes.',
  );
  await expect(page.locator('#collo-current-password')).toHaveValue('');
  await snapshot('login-methods');
  checks.push(
    'Native settings shows current password, unavailable providers, real failed and successful password re-verification; password field cleared.',
  );
  const original = await appearance(),
    originalAccent = await accent();
  await page.getByRole('button', { name: 'Preview unified default', exact: true }).click();
  const previewAccent = await accent();
  assert.notEqual(previewAccent, originalAccent);
  assert.deepEqual(await appearance(), original);
  await snapshot('forest-preview');
  await page.getByRole('button', { name: 'Cancel preview', exact: true }).click();
  assert.equal(await accent(), originalAccent);
  assert.deepEqual(await appearance(), original);
  await page.getByRole('button', { name: 'Preview unified default', exact: true }).click();
  await page.getByRole('button', { name: 'About ColloSys', exact: true }).click();
  assert.equal(await accent(), originalAccent);
  await page.getByRole('button', { name: 'Profile & appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Preview unified default', exact: true }).click();
  await page.getByRole('button', { name: 'Use this appearance', exact: true }).click();
  assert.equal((await appearance()).accent, 'forest');
  await app.close();
  app = await launch(env);
  page = await app.firstWindow();
  await expect(page.locator('.collo-topbar')).toBeVisible();
  await settings();
  assert.equal((await appearance()).accent, 'forest');
  await page.getByRole('button', { name: 'Restore previous choice', exact: true }).click();
  assert.deepEqual(await appearance(), original);
  assert.equal(await accent(), originalAccent);
  await snapshot('restored-user-appearance');
  checks.push(
    'Forest preview changes actual application variables, Cancel and leaving settings restore Iris, adoption persists across native relaunch, Restore previous choice restores original saved mode/accent.',
  );
  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      [
        '--collo-accent',
        '--collo-selection-bg',
        '--collo-selection-ink',
        '--collo-action',
        '--collo-danger',
      ].map((k) => [k, s.getPropertyValue(k).trim()]),
    );
  });
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        checks,
        mirroredProfile: profile,
        finalAppearance: await appearance(),
        tokens,
        window: await windowState(app),
        build: await page.evaluate(() => fetch('/collo-build.json').then((r) => r.json())),
      },
      null,
      2,
    ),
  );
  checks.forEach((c) => console.log('PASS', c));
} finally {
  await app.close().catch(() => {});
}
