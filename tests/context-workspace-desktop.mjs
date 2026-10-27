import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron, expect } from '@playwright/test';

const out = path.resolve(
  process.env.COLLOSYS_VISUAL_EVIDENCE_DIR ?? 'docs/workbench-revision/evidence',
);
await fs.mkdir(out, { recursive: true });
const results = [];
let failed;
for (const scale of [1, 1.25, 1.5]) {
  let app;
  try {
    const env = {
      ...process.env,
      COLLOSYS_WORKBENCH_PREVIEW: '1',
      COLLOSYS_DESKTOP_PROFILE: `test-${randomUUID()}`,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
      args: [
        path.resolve('integrations/codecast/desktop/main.cjs'),
        `--force-device-scale-factor=${scale}`,
      ],
      env,
      timeout: 60000,
    });
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setContentSize(1280, 800);
      w.show();
    });
    await page.locator('.cw-app').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    const native = await app.evaluate(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0],
        p = w.webContents.getLastWebPreferences();
      return {
        visible: w.isVisible(),
        nativeHandle: !w.getNativeWindowHandle().every((v) => v === 0),
        sandbox: p.sandbox,
        contextIsolation: p.contextIsolation,
        nodeIntegration: p.nodeIntegration,
        contentBounds: w.getContentBounds(),
        displayScale: screen.getDisplayMatching(w.getBounds()).scaleFactor,
      };
    });
    assert.equal(native.visible, true);
    assert.equal(native.nativeHandle, true);
    assert.equal(native.sandbox, true);
    assert.equal(native.contextIsolation, true);
    assert.equal(native.nodeIntegration, false);
    const layout = await page.evaluate(() => {
      const r = document.querySelector('.cw-reader-scroll').getBoundingClientRect(),
        p = document.querySelector('.cw-prose p').getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        readerTop: r.top,
        readerHeight: r.height,
        firstText: p.top,
        overflow: document.documentElement.scrollWidth,
        font: document.fonts.check('14px ColloWorkspace'),
        titleX: document.querySelector('.cw-heading-copy').getBoundingClientRect().x,
        transcriptX: document.querySelector('.cw-transcript').getBoundingClientRect().x,
        composerX: document.querySelector('.cw-composer-box').getBoundingClientRect().x,
      };
    });
    assert.ok(Math.abs(layout.dpr - scale) < 0.01);
    assert.equal(layout.overflow, layout.width);
    assert.ok(layout.firstText <= 185);
    assert.ok(layout.readerHeight >= 520);
    assert.equal(layout.font, true);
    assert.ok(
      Math.abs(layout.titleX - layout.transcriptX) <= 1,
      'native title and reader stay aligned with system scrollbars',
    );
    assert.ok(
      Math.abs(layout.composerX - layout.transcriptX) <= 1,
      'native composer and reader share their axis',
    );
    await page.screenshot({ path: path.join(out, `desktop-${scale}.png`), animations: 'allow' });
    await page.getByRole('tab', { name: /文件变化/ }).click();
    await page.locator('diffs-container').first().waitFor();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: '准备交接', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '准备交接', exact: true })).toBeFocused();
    results.push({ scale, native, layout, passed: true });
    console.log('PASS native window', scale);
  } catch (error) {
    failed = error;
    results.push({ scale, passed: false, error: error.message });
    console.error(error);
    break;
  } finally {
    await app?.close();
  }
}
await fs.writeFile(
  path.join(out, 'desktop-validation.json'),
  JSON.stringify(
    {
      passed: !failed,
      results,
      capturedAt: new Date().toISOString(),
      scope:
        'Actual pinned Electron framework with owned Windows adaptation and isolated fixture route; forced device scaling tests, not a different physical monitor.',
    },
    null,
    2,
  ),
);
if (failed) process.exitCode = 1;
