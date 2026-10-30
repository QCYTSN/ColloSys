import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { _electron as electron, expect as baseExpect } from '@playwright/test';
import { account } from './product-ui-refinement-data.mjs';
const designTokens = JSON.parse(await fs.readFile('integrations/codecast/web/design-tokens.json', 'utf8'));
const expect = baseExpect.configure({ timeout: 60000 }), out = process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/identity-motion/evidence/native';
await fs.mkdir(out, { recursive: true });
const profile = 'test-' + randomUUID(), env = { ...process.env, COLLOSYS_DESKTOP_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE; delete env.COLLOSYS_WORKBENCH_PREVIEW; delete env.COLLOSYS_DESIGN_LAB;
const launch = () => electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: [path.resolve('integrations/codecast/desktop/main.cjs')], env, timeout: 60000 });
let app = await launch(); let page = await app.firstWindow(); const checks = [], states = [];
const state = () => app.evaluate(({ BrowserWindow, Menu, screen, nativeTheme }) => {
  const w = BrowserWindow.getAllWindows()[0]; return { visible: w.isVisible(), title: w.getTitle(), nativeHandle: !w.getNativeWindowHandle().every(b => b === 0), applicationMenu: Menu.getApplicationMenu() !== null, menuVisible: w.isMenuBarVisible(), maximized: w.isMaximized(), zoom: w.webContents.getZoomFactor(), bounds: w.getBounds(), displayScale: screen.getDisplayMatching(w.getBounds()).scaleFactor, nativeTheme: nativeTheme.themeSource, background: w.getBackgroundColor() };
});
const shot = async name => {
  states.push({ name, ...await state() });
  // Renderer readiness can precede Windows assigning MainWindowHandle. Keep the
  // exact OS title/process/handle checks, but await native window registration.
  await expect(async () => {
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('tests/codecast-native-window.ps1'), '-DesktopProcessId', String(await app.evaluate(() => process.pid)), '-EvidencePath', path.resolve(out, name + '-window.png')], { windowsHide: true });
  }).toPass({ timeout: 10000 });
};
// Playwright's page.keyboard uses CDP and bypasses Electron before-input-event.
// Target the actual native webContents input path for application shortcuts.
const nativeControl = key => app.evaluate(({ BrowserWindow }, key) => {
  const w = BrowserWindow.getAllWindows()[0]; w.webContents.focus();
  w.webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: ['control'] });
  w.webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: ['control'] });
}, key);
try {
  await expect(page.locator('#email')).toBeVisible();
  let s = await state(); assert.equal(s.applicationMenu, false); assert.equal(s.menuVisible, false); assert.ok(s.nativeHandle); assert.equal(s.title, 'ColloSys');
  await shot('normal-light');
  if (process.argv.includes('--drag')) {
    await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows()[0].focus(); });
    try {
      const drag = await promisify(execFile)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('tests/product-identity-drag.ps1'), '-DesktopProcessId', String(await app.evaluate(() => process.pid))], { windowsHide: true });
      await fs.writeFile(out + '/caption-drag.json', drag.stdout.trim());
      checks.push('Actual Windows caption pointer drag moves the verified TEST window');
    } catch (error) {
      await fs.writeFile(out + '/caption-drag.json', JSON.stringify({ status: 'unverified', reason: 'OS foreground/target-window requirement was not satisfied; native pointer test aborted. See local test log. No other window was clicked.' }, null, 2));
      throw error;
    }
    await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), s.bounds);
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize()); await expect.poll(async () => (await state()).maximized).toBe(true); await shot('maximized');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize());
  for (const factor of [1.25, 1.5]) {
    await app.evaluate(({ BrowserWindow }, factor) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor), factor);
    assert.equal((await state()).zoom, factor); await expect(page.locator('#email')).toBeVisible(); await expect(page.locator('form button[type=submit]')).toBeInViewport(); await shot(`native-zoom-${factor * 100}`);
  }
  await nativeControl('0'); await expect.poll(async () => (await state()).zoom).toBe(1);
  await page.locator('#email').fill('TEST-edit@example.invalid'); await page.locator('#email').focus(); await nativeControl('A'); await page.keyboard.type('TEST-replaced@example.invalid'); await expect(page.locator('#email')).toHaveValue('TEST-replaced@example.invalid');
  checks.push('Actual Windows native frame: no application/menu bar, maximize/unmaximize, 125%/150% webContents zoom, Ctrl+0 and native editing shortcuts');
  const policy = await page.evaluate(async () => {
    const results = [];
    for (const request of [{ version: 1, attemptId: 'https://evil.invalid', provider: 'github' }, { version: 2, attemptId: '00000000-0000-0000-0000-000000000000', provider: 'google' }]) {
      try { await window.__COLLOSYS_DESKTOP__.beginSignIn(request); results.push(false); } catch { results.push(true); }
    }
    return results;
  }); assert.deepEqual(policy, [true, true]); checks.push('Real renderer IPC rejects arbitrary URL and unsupported contract version');
  await page.locator('#email').fill(account.a.email); await page.locator('#password').fill(account.a.password); await page.locator('form button[type=submit]').click(); await expect(page.locator('.collo-projects')).toBeVisible();
  await nativeControl(','); await expect(page.locator('.collo-appearance-settings')).toBeVisible();
  const build = await page.evaluate(() => fetch('/collo-build.json').then(r => r.json()));
  await page.getByRole('button', { name: 'About ColloSys', exact: true }).click();
  await page.getByText('Build diagnostics', { exact: true }).click();
  await expect(page.locator('.collo-build-details')).toContainText(build.fingerprint);
  await page.getByText('Build diagnostics', { exact: true }).click();
  await page.getByRole('button', { name: 'Profile & appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click(); await expect.poll(async () => (await state()).background.toLowerCase()).toBe(designTokens.color.dark['surface-app'].toLowerCase()); await shot('settings-dark');
  await page.getByRole('button', { name: 'Light', exact: true }).click(); await expect.poll(async () => (await state()).background.toLowerCase()).toBe(designTokens.color.light['surface-app'].toLowerCase()); await shot('settings-light');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await app.close(); app = await launch(); page = await app.firstWindow(); await expect(page.locator('.collo-topbar')).toBeVisible();
  await expect.poll(async () => (await state()).nativeTheme).toBe('dark'); await shot('reopened-dark');
  checks.push('Ctrl+, opens real settings; light/dark updates native background and saved native appearance survives relaunch');
  await fs.writeFile(out + '/results.json', JSON.stringify({ checks, states, build: await page.evaluate(() => fetch('/collo-build.json').then(r => r.json())), limits: 'Windows native Electron tested. Zoom is actual webContents 1.25/1.5; displayScale records OS DPI. OS DPI setting was not changed. No provider credentials, so real external OAuth round trip remains unverified.' }, null, 2));
} finally { await app.close().catch(() => {}); }
