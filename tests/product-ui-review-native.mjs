// Real Windows Electron window at 125% webContents zoom. OS target-window capture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { _electron as electron, expect as baseExpect } from '@playwright/test';
import { completionFixture, account } from './product-ui-completion-data.mjs';
import { inspectOverflow, inspectActions } from './product-ui-overflow.mjs';
const expect = baseExpect.configure({ timeout: 30000 }),
  f = await completionFixture(),
  out = 'docs/product-ui/review-fixes/evidence/after/native-125';
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
  checks = [],
  audits = [];
const network = [];
page.on('requestfailed', (r) =>
  network.push({
    route: new URL(r.url()).pathname,
    endpoint: new URL(r.url()).origin,
    error: r.failure()?.errorText,
  }),
);
page.on('console', (m) => {
  if (m.type() === 'error' && /fetch|cors|policy|network|blocked/i.test(m.text()))
    network.push({ console: m.text().slice(0, 700) });
});
const shot = async (name) => {
  await page.screenshot({
    path: out + '/' + name + '.png',
    mask: [page.locator('input[type=password]')],
  });
  await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.resolve('tests/codecast-native-window.ps1'),
      '-DesktopProcessId',
      String(await app.evaluate(() => process.pid)),
      '-EvidencePath',
      path.resolve(out, name + '-window.png'),
    ],
    { windowsHide: true },
  );
};
const zoom = async () => {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25),
  );
  await page.waitForTimeout(250);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
    ),
    1.25,
  );
};
const audit = async (name, selector) => {
  const geometry = await inspectOverflow(page, selector),
    actions = await inspectActions(
      page,
      page
        .locator(selector)
        .locator('button:enabled,input:enabled,select:enabled,textarea:enabled,a[href]')
        .filter({ visible: true }),
    );
  audits.push({ name, geometry, actions });
  assert.deepEqual(geometry.faults, []);
  assert.deepEqual(actions.faults, []);
};
try {
  await app.evaluate(({ BrowserWindow, dialog }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setContentSize(1280, 800);
    w.webContents.setZoomFactor(1.25);
    w.show();
    const original = dialog.showMessageBoxSync;
    dialog.showMessageBoxSync = (w, o) => (o?.buttons?.includes('Close now') ? 1 : original(w, o));
  });
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('#password').press('Enter');
  await expect(page.locator('.collo-projects')).toBeVisible();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25),
  );
  await page.goto(
    `http://127.0.0.1:3407/projects/${f.projectId}?tab=workspaces&workspaceView=history&directory=${f.workspaceId}`,
  );
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(page.getByTestId('local-workspaces')).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
  await zoom();
  await page.getByText('This directory · TEST completion source', { exact: true }).click();
  await page.getByRole('button', { name: 'Storage & backups', exact: true }).click();
  const storage = page.getByTestId('directory-storage');
  await expect(storage.getByRole('button', { name: 'Review policy', exact: true })).toBeVisible();
  await storage.getByRole('button', { name: 'Review policy', exact: true }).click();
  const form = page.getByRole('form', { name: 'Confirm storage operation' });
  await expect(form).toBeFocused();
  await form.getByRole('checkbox').check();
  await expect(form.locator('button[type=submit]')).toBeEnabled();
  await audit('storage confirmation at 125%', '.collo-storage-dialog');
  await shot('storage-confirm');
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  checks.push(
    'Actual native confirmation stays visible, keyboard-focusable and operable at 125%; cancelled without writing',
  );
  const row = storage
    .locator('[data-recovery-id]')
    .filter({
      has: page
        .getByRole('button', { name: 'Export copy', exact: true })
        .and(page.locator(':enabled')),
    })
    .first();
  const actualPath = await row.locator('.collo-path').innerText();
  await row.getByRole('button', { name: 'Copy path', exact: true }).press('Enter');
  await expect(row.getByText('Path copied.', { exact: true })).toBeVisible();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), actualPath);
  await audit('native copy row at 125%', '.collo-storage-dialog');
  await shot('storage-copy');
  checks.push('Real native clipboard promise resolves and actual clipboard contains this row path');
  await page.keyboard.press('Escape');
  await expect(storage).toHaveCount(0);
  const inspection = await f.local('/api/inspect', undefined, f.connector.url),
    cp = inspection.checkpoints[0];
  await page.goto(
    `http://127.0.0.1:3407/projects/${f.projectId}?tab=handoffs&fromCheckpoint=${cp.id}&checkpointWorkspace=${f.workspaceId}`,
  );
  const dialog = page.getByRole('dialog', { name: 'New handoff' });
  await expect(dialog.locator('[data-checkpoint-source]')).toHaveAttribute('data-ready', 'true');
  await zoom();
  await dialog.locator('form').evaluate((e) => {
    window.formEvents = { invalid: 0, submit: 0 };
    e.addEventListener('invalid', () => window.formEvents.invalid++, true);
    e.addEventListener('submit', () => window.formEvents.submit++, true);
  });
  await audit('native nested handoff at 125%', '.collo-handoff-form');
  await shot('handoff');
  await dialog.getByRole('button', { name: 'Remove source', exact: true }).press('Space');
  assert.deepEqual(await page.evaluate(() => window.formEvents), { invalid: 0, submit: 0 });
  await dialog.getByRole('button', { name: 'Keep draft', exact: true }).click();
  checks.push(
    'Native nested handoff source and keyboard auxiliary action fit at 125% without validation/submission',
  );
  const state = {
    ...(await app.evaluate(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return {
        visible: w.isVisible(),
        nativeHandle: !w.getNativeWindowHandle().every((b) => b === 0),
        zoomFactor: w.webContents.getZoomFactor(),
        displayScale: screen.getDisplayMatching(w.getBounds()).scaleFactor,
        bounds: w.getContentBounds(),
        electron: process.versions.electron,
        chromium: process.versions.chrome,
      };
    })),
    ...(await page.evaluate(() => ({
      cssViewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio,
      cssZoom: getComputedStyle(document.documentElement).zoom,
    }))),
  };
  assert.equal(state.zoomFactor, 1.25);
  assert.ok(state.visible && state.nativeHandle);
  await fs.writeFile(out + '/environment.json', JSON.stringify(state, null, 2));
  console.log(checks.map((s) => 'PASS ' + s).join('\n'));
} catch (e) {
  await page.screenshot({ path: out + '/failure.png' }).catch(() => {});
  throw e;
} finally {
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        evidence:
          'Actual visible Windows client, normal desktop framework, isolated TEST profile; native OS captures',
        checks,
        audits,
        network,
      },
      null,
      2,
    ),
  );
  await app.close();
}
