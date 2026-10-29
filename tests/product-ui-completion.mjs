import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, _electron as electron, expect as baseExpect } from '@playwright/test';
import {
  account,
  completionFixture,
  longChinese,
  longEnglish,
  longUrl,
  eventually,
} from './product-ui-completion-data.mjs';
import { inspectOverflow } from './product-ui-overflow.mjs';
const expect = baseExpect.configure({ timeout: 30000 });
const native = process.argv.includes('--native'),
  out = path.resolve(process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/completion', native ? 'native' : 'after');
await fs.mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:3407',
  fixture = await completionFixture();
const checks = [],
  audits = [],
  errors = [];
let browser, app, context, page;
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS', name);
}
async function shot(name) {
  await expect(page.getByText('StagePane crashed', { exact: true })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, name + '.png') });
}
async function go(route) {
  await page.goto(origin + route);
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(page.locator('.collo-topbar')).toBeVisible();
    await expect(page.getByText('StagePane crashed', { exact: true })).toHaveCount(0);
    if (route.includes('tab=workspaces'))
      await expect(page.getByTestId('local-workspaces')).toBeVisible({ timeout: 700 });
    if (route.includes('tab=sessions'))
      await expect(page.getByTestId('captured-sessions')).toBeVisible({ timeout: 700 });
    if (route.includes('tab=handoffs'))
      await expect(page.getByTestId('project-handoffs')).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
}
async function audit(name, selector) {
  const result = await inspectOverflow(page, selector);
  audits.push({ name, ...result });
  await fs.writeFile(path.join(out, 'overflow.json'), JSON.stringify(audits, null, 2));
  assert.equal(result.documentOverflow, 0, name + ' document');
  assert.deepEqual(result.faults, [], name + ' inner overflow');
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
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    await app.evaluate(({ dialog }) => {
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
      recordVideo: { dir: '.local/completion-video', size: { width: 1440, height: 900 } },
    });
    page = await context.newPage();
  }
  page.on('pageerror', (e) => errors.push(e.message));
  const pairing = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
  await page.goto(origin + '/login');
  await page.evaluate((pair) => sessionStorage.setItem('collo.pair', pair), pairing);
  await check('Independent auth surface, password visibility and keyboard submission', async () => {
    await expect(page.locator('.collo-auth-layout')).toBeVisible();
    await shot('01-login');
    await audit('login', '.collo-auth-layout');
    await page.locator('#email').fill('long-test-account-' + 'a'.repeat(80) + '@example.invalid');
    await page.locator('#password').fill('test-visible-only');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    await page.locator('#email').fill(account.a.email);
    await page.locator('#password').fill(account.a.password);
    await page.locator('#password').press('Enter');
    await expect(page.locator('.collo-projects')).toBeVisible();
  });
  await go(`/projects/${fixture.projectId}?tab=workspaces`);
  await expect(page.getByTestId('local-workspaces')).toBeVisible();
  await page.getByRole('link', { name: 'ColloSys projects', exact: true }).click();
  await expect(page.locator('.collo-project-select')).toHaveCount(2);
  await check(
    'Filtered project preview follows visible results and clears at zero results',
    async () => {
      await page.getByRole('textbox', { name: 'Find a project' }).fill('Unbroken');
      await expect(page.locator('.collo-project-overview h2')).toHaveText(longEnglish);
      await page.getByRole('textbox', { name: 'Find a project' }).fill('nothing-exists');
      await expect(page.locator('.collo-project-overview')).toHaveCount(0);
      await expect(page.getByText('No matching projects')).toBeVisible();
      await page.getByRole('textbox', { name: 'Find a project' }).fill('');
    },
  );
  await check('Long Chinese and unbroken English project titles across window sizes', async () => {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [1920, 1080],
      [960, 720],
    ]) {
      await resize(width, height);
      await audit(`projects-${width}`, '.collo-projects');
      await shot(`02-projects-${width}`);
    }
    await resize(1440, 900);
  });
  await go(`/projects/${fixture.projectId}?tab=workspaces`);
  await expect(page.getByTestId('collaboration-list')).toBeVisible();
  await check('Full project header and manual activity survive long-content bounds', async () => {
    await audit('project-heading', '.collo-project-header');
    await audit('activity', '.collo-workspaces');
    await shot('03-activity');
  });
  await go(`/projects/${fixture.projectId}?tab=sessions`);
  await expect(page.getByTestId('captured-sessions')).toBeVisible();
  await check(
    'Capture filter declares its page scope and opens real paginated conversation',
    async () => {
      await expect(page.getByText(/Filters this page’s/)).toBeVisible();
      await page.locator('.collo-session-row').first().click();
      await expect(page.getByTestId('captured-conversation')).toBeVisible();
      await expect(page.getByText('TEST conversation 1', { exact: false }).first()).toBeVisible();
      await audit('conversation', '.collo-captured-reader');
      await shot('04-conversation');
    },
  );
  await go(
    `/projects/${fixture.projectId}?tab=workspaces&workspaceView=history&directory=${fixture.workspaceId}`,
  );
  await expect(page.getByText('Preview restore', { exact: true }).first()).toBeVisible();
  await page.getByText('This directory · TEST completion source', { exact: true }).click();
  await check(
    'Storage is reachable from directory history with actual quota and checkpoints',
    async () => {
      await page.getByRole('button', { name: 'Storage & backups', exact: true }).click();
      await expect(page.getByTestId('directory-storage')).toBeVisible();
      await expect(
        page
          .getByRole('button', { name: 'Pin checkpoint', exact: true })
          .or(page.getByRole('button', { name: 'Unpin checkpoint', exact: true })),
      ).toBeVisible();
      await audit('storage', '.collo-storage-dialog');
      await shot('05-storage');
    },
  );
  const storage = page.getByTestId('directory-storage');
  await check(
    'Retention policy and cleanup affect only eligible managed test history',
    async () => {
      await storage.getByLabel('Checkpoints', { exact: true }).fill('200');
      await storage.getByRole('button', { name: 'Review policy', exact: true }).click();
      await confirm();
      for (let i = 0; i < 5; i++) {
        await fs.writeFile(
          path.join(fixture.root, 'TEST-retention.txt'),
          `TEST retained version ${Date.now()} ${i}`,
        );
        await fixture.local('/api/capture', {}, fixture.connector.url);
      }
      await eventually(async () =>
        assert.equal(
          (await fixture.local('/api/status', undefined, fixture.connector.url)).pending,
          0,
        ),
      );
      await storage.getByRole('button', { name: 'Refresh storage', exact: true }).click();
      await storage.getByLabel('Checkpoints', { exact: true }).fill('2');
      await storage.getByRole('button', { name: 'Review policy', exact: true }).click();
      await confirm();
      const before = await fixture.local('/api/storage', undefined, fixture.connector.url);
      assert.equal(before.policy.maxCheckpoints, 2);
      assert.ok(before.remove.length > 0);
      const sourceBefore = await fs.readFile(path.join(fixture.root, 'TEST-retention.txt'), 'utf8');
      await storage.getByRole('button', { name: /Review cleanup/ }).click();
      await confirm();
      const after = await fixture.local('/api/storage', undefined, fixture.connector.url);
      assert.equal(after.count, before.count - before.remove.length);
      assert.equal(
        await fs.readFile(path.join(fixture.root, 'TEST-retention.txt'), 'utf8'),
        sourceBefore,
      );
      await shot('05-cleanup');
    },
  );
  await check('Pin persists in the real connector and can be undone', async () => {
    const id = await storage.getByLabel('Storage checkpoint').inputValue();
    const old = await fixture.local('/api/storage', undefined, fixture.connector.url);
    const pinned = old.pinned.includes(id);
    await storage
      .getByRole('button', { name: pinned ? 'Unpin checkpoint' : 'Pin checkpoint', exact: true })
      .click();
    await expect(
      storage.getByRole('button', {
        name: pinned ? 'Pin checkpoint' : 'Unpin checkpoint',
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      (await fixture.local('/api/storage', undefined, fixture.connector.url)).pinned.includes(id),
      !pinned,
    );
  });
  async function confirm() {
    const form = page.getByRole('form', { name: 'Confirm storage operation' });
    await form.getByRole('checkbox').check();
    await form.locator('button[type=submit]').click();
    await expect(form).toHaveCount(0, { timeout: 120000 });
    await expect(storage.getByRole('button', { name: 'Refresh storage', exact: true })).toBeEnabled(
      { timeout: 120000 },
    );
  }
  const passphrase = 'TEST isolated encrypted recovery ' + randomUUID();
  const previousBackups = (
    await fixture.local('/api/backups', undefined, fixture.connector.url)
  ).backups.map((b) => b.id);
  const previousRecoveries = (
    await fixture.local('/api/storage', undefined, fixture.connector.url)
  ).recoveries.map((r) => r.id);
  let createdBackup, createdRecovery;
  await check(
    'Create encrypted backup through the product and verify persisted receipt',
    async () => {
      await storage.getByRole('button', { name: 'Create encrypted backup', exact: true }).click();
      await expect(
        page.locator('.collo-storage-confirm button[type=submit]'),
      ).toBeDisabled();
      await page.getByLabel('Backup passphrase', { exact: true }).fill(passphrase);
      await confirm();
      await expect(storage.locator('[data-backup-id]')).toHaveCount(previousBackups.length + 1);
      createdBackup = (
        await fixture.local('/api/backups', undefined, fixture.connector.url)
      ).backups.find((b) => !previousBackups.includes(b.id)).id;
      await shot('06-backup');
    },
  );
  await check(
    'Recover into a separate copy and export without touching working files',
    async () => {
      const before = await fs.readFile(path.join(fixture.root, 'readme.txt'), 'utf8');
      await storage
        .locator(`[data-backup-id="${createdBackup}"]`)
        .getByRole('button', { name: 'Recover copy', exact: true })
        .click();
      await page.getByLabel('Backup passphrase', { exact: true }).fill(passphrase);
      await confirm();
      await expect(storage.locator('[data-recovery-id]')).toHaveCount(
        previousRecoveries.length + 1,
      );
      createdRecovery = (
        await fixture.local('/api/storage', undefined, fixture.connector.url)
      ).recoveries.find((r) => !previousRecoveries.includes(r.id)).id;
      const destination = path.join(fixture.evidence, 'TEST-export-' + randomUUID());
      await storage
        .locator(`[data-recovery-id="${createdRecovery}"]`)
        .getByRole('button', { name: 'Export copy', exact: true })
        .click();
      await page.getByLabel('New export directory', { exact: true }).fill(destination);
      await confirm();
      assert.equal(await fs.readFile(path.join(fixture.root, 'readme.txt'), 'utf8'), before);
      assert.ok((await fs.readdir(destination)).length > 0);
      await shot('07-recovered-export');
    },
  );
  await check('Delete only the selected isolated encrypted backup with confirmation', async () => {
    await storage
      .locator(`[data-backup-id="${createdBackup}"]`)
      .getByRole('button', { name: 'Delete backup', exact: true })
      .click();
    await expect(
      page.locator('.collo-storage-confirm button[type=submit]'),
    ).toBeDisabled();
    await confirm();
    await expect(storage.locator('[data-backup-id]')).toHaveCount(previousBackups.length);
  });
  await page.keyboard.press('Escape');
  await check('Actual restore preview remains a separate confirmed operation', async () => {
    await page.getByText('Preview restore', { exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await shot('08-restore-preview');
    await page.keyboard.press('Escape');
  });
  assert.deepEqual(errors, []);
  if (app) {
    const meta = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return {
        visible: w.isVisible(),
        title: w.getTitle(),
        bounds: w.getContentBounds(),
        handle: !w.getNativeWindowHandle().every((b) => b === 0),
        prefs: w.webContents.getLastWebPreferences(),
      };
    });
    assert.equal(meta.visible, true);
    assert.equal(meta.handle, true);
    await fs.writeFile(
      path.join(out, 'window.json'),
      JSON.stringify(
        {
          visible: meta.visible,
          title: meta.title,
          bounds: meta.bounds,
          nativeHandle: meta.handle,
          contextIsolation: meta.prefs.contextIsolation,
          nodeIntegration: meta.prefs.nodeIntegration,
        },
        null,
        2,
      ),
    );
  }
} catch (e) {
  await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  throw e;
} finally {
  await fs.writeFile(
    path.join(out, 'results.json'),
    JSON.stringify({ at: new Date().toISOString(), native, checks, errors }, null, 2),
  );
  if (browser) {
    const video = page?.video();
    await context?.close();
    if (video) await video.saveAs(path.join(out, 'interaction.webm'));
    await browser.close();
  }
  if (app) await app.close();
}
