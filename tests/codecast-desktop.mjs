import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { _electron as electron } from '@playwright/test';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';

const source = path.resolve(process.argv[2] || '');
if (!source.startsWith(path.resolve('.local/codecast-app/acceptance-')))
  throw new Error('Pass a completed Codecast acceptance folder');
const credentials = JSON.parse(await fs.readFile(path.join(source, 'restart-test.json'), 'utf8'));
const evidence = path.resolve(`.local/codecast-app/desktop-acceptance-${Date.now()}`);
await fs.mkdir(evidence, { recursive: true });
const root = path.join(evidence, 'project');
await fs.mkdir(root);
await fs.writeFile(path.join(root, 'desktop.txt'), 'original desktop file\n');
const profile = `test-${randomUUID()}`;
const env = { ...process.env, COLLOSYS_DESKTOP_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
const options = {
  executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
  args: [path.resolve('integrations/codecast/desktop/main.cjs')],
  env,
  timeout: 60000,
};
const checks = [],
  errors = [];
let app, page;
async function check(name, action) {
  await action();
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function eventually(action) {
  let last;
  for (let n = 0; n < 100; n++) {
    try {
      return await action();
    } catch (e) {
      last = e;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw last;
}
const client = new ConvexHttpClient('http://127.0.0.1:3408');
const auth = await client.action('auth:signIn', {
  provider: 'password',
  params: { ...credentials.a, flow: 'signIn' },
});
client.setAuth(auth.tokens.token);
const pair = await fs.readFile('.local/codecast-app/browser-pairing', 'utf8');
async function local(route, endpoint = 'http://127.0.0.1:3411') {
  const response = await fetch(endpoint + route, {
    headers: { Authorization: `Bearer ${auth.tokens.token}`, 'X-ColloSys-Pairing': pair },
  });
  assert.equal(response.status, 200);
  return response.json();
}
try {
  await check(
    'Real independent Windows window uses original desktop bridge with OS sandbox and isolation',
    async () => {
      app = await electron.launch(options);
      page = await app.firstWindow();
      page.setDefaultTimeout(20000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.locator('#email').waitFor({ timeout: 60000 });
      const state = await app.evaluate(({ app, BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        const prefs = window.webContents.getLastWebPreferences();
        return {
          name: app.name,
          title: window.getTitle(),
          visible: window.isVisible(),
          platform: process.platform,
          sandbox: prefs.sandbox,
          isolated: prefs.contextIsolation,
          node: prefs.nodeIntegration,
        };
      });
      assert.deepEqual(state, {
        name: 'ColloSys',
        title: 'ColloSys',
        visible: true,
        platform: 'win32',
        sandbox: true,
        isolated: true,
        node: false,
      });
      assert.equal(
        await page.evaluate(() => typeof window.__CODECAST_ELECTRON__?.getVersion),
        'function',
      );
      assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
      assert.ok(await page.evaluate(() => !!sessionStorage.getItem('collo.pair')));
      assert.equal(new URL(page.url()).hash, '');
      await page.screenshot({ path: path.join(evidence, 'desktop-login.png') });
    },
  );
  await check(
    'Desktop rejects screen capture, off-origin navigation and non-main-frame IPC',
    async () => {
      assert.equal(
        await page.evaluate(async () => {
          try {
            await window.__CODECAST_ELECTRON__.getDisplaySources();
            return false;
          } catch {
            return true;
          }
        }),
        true,
      );
      const rejected = await app.evaluate(async ({ BrowserWindow, ipcMain }) => {
        const window = BrowserWindow.getAllWindows()[0];
        let navigation = false,
          ipc = false;
        try {
          await window.loadURL('https://example.com');
        } catch {
          navigation = true;
        }
        try {
          await ipcMain._invokeHandlers.get('app:chooseDirectory')({
            senderFrame: { url: 'http://127.0.0.1:3407', parent: {} },
          });
        } catch {
          ipc = true;
        }
        return { navigation, ipc };
      });
      assert.deepEqual(rejected, { navigation: true, ipc: true });
    },
  );
  await check(
    'Real password sign-in and original project workbench operate inside the desktop',
    async () => {
      await page.locator('#email').fill(credentials.a.email);
      await page.locator('#password').fill(credentials.a.password);
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL((url) => url.pathname === '/projects', { timeout: 60000 });
      await page.goto(`http://127.0.0.1:3407/projects/${credentials.projectId}?tab=workspaces`);
      await eventually(async () => {
        if (await page.locator('[data-foreign-switch]').isVisible())
          await page.locator('[data-foreign-switch]').click();
        assert.ok(
          await page.getByRole('button', { name: 'Connect directory', exact: true }).isVisible(),
        );
      });
    },
  );
  let connector;
  await check(
    'Actual Windows folder picker opens and Cancel leaves the directory unselected',
    async () => {
      await page.getByRole('button', { name: 'Connect directory', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Connect your directory' });
      await modal.getByRole('button', { name: 'Browse', exact: true }).click();
      const result = await promisify(execFile)(
        'powershell.exe',
        [
          '-NoProfile',
          '-File',
          path.resolve('tests/codecast-native-picker.ps1'),
          '-DesktopProcessId',
          String(await app.evaluate(() => process.pid)),
          '-EvidencePath',
          path.join(evidence, 'native-folder-picker.png'),
        ],
        { timeout: 30000, windowsHide: true },
      );
      assert.match(result.stdout, /Native folder picker canceled/);
      assert.equal(await modal.getByLabel('Directory path', { exact: true }).inputValue(), '');
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden' });
    },
  );
  await check(
    'Native directory-picker bridge and explicit sharing consent create a real connector',
    async () => {
      // Controlled OS-dialog response only; all product IPC, form, filesystem,
      // authentication and connector work remain real. Manual OS dialog is checked separately.
      await app.evaluate(({ dialog }, selected) => {
        const original = dialog.showOpenDialog;
        dialog.showOpenDialog = async (parent, options) => {
          dialog.showOpenDialog = original;
          if (!parent || !options.properties.includes('openDirectory'))
            throw new Error('Incorrect native picker invocation');
          return { canceled: false, filePaths: [selected] };
        };
      }, root);
      await page.getByRole('button', { name: 'Connect directory', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Connect your directory' });
      await modal.getByRole('button', { name: 'Browse', exact: true }).click();
      await eventually(async () =>
        assert.equal(await modal.getByLabel('Directory path', { exact: true }).inputValue(), root),
      );
      await modal.getByLabel('Directory name', { exact: true }).fill('TEST Desktop directory');
      await modal.getByRole('checkbox').check();
      await modal.getByRole('button', { name: 'Connect and share', exact: true }).click();
      await modal.waitFor({ state: 'hidden' });
      connector = (await local('/api/connectors')).connectors.find((item) => item.root === root);
      assert.ok(connector?.running);
    },
  );
  await check(
    'Saved file changes render in the desktop and confirmed preview restores actual bytes',
    async () => {
      const initial = (await local('/api/checkpoints', connector.url)).checkpoints[0];
      await fs.writeFile(path.join(root, 'desktop.txt'), 'TEST edited from the desktop workflow\n');
      await eventually(async () => {
        let cursor = 0;
        let found = false;
        let more = true;
        while (more && !found) {
          const result = await client.query('collo:replay', {
            projectId: credentials.projectId,
            after: cursor,
          });
          found = result.events.some(
            (event) =>
              event.workspaceId === connector.workspaceId &&
              JSON.stringify(event).includes('TEST edited from the desktop workflow'),
          );
          more = result.hasMore;
          if (more) assert.ok(result.cursor > cursor, 'Replay cursor must advance');
          cursor = result.cursor;
        }
        assert.ok(found, 'The actual edited file must reach the persisted replay, across pages');
      });
      await page.getByRole('button').filter({ hasText: 'TEST Desktop directory' }).first().click();
      await page
        .getByText('TEST edited from the desktop workflow', { exact: true })
        .first()
        .waitFor();
      await page.screenshot({ path: path.join(evidence, 'desktop-workbench.png') });
      await page.getByRole('button', { name: 'Local history', exact: true }).click();
      await page
        .getByRole('button')
        .filter({ hasText: initial.label })
        .filter({ hasText: 'Preview restore' })
        .last()
        .click();
      const preview = page.getByRole('dialog', { name: 'Preview restore', exact: true });
      await preview.waitFor();
      await page.screenshot({ path: path.join(evidence, 'desktop-restore.png') });
      await preview
        .getByRole('button', { name: 'Back up current state and restore', exact: true })
        .click();
      await preview.waitFor({ state: 'hidden' });
      assert.equal(
        await fs.readFile(path.join(root, 'desktop.txt'), 'utf8'),
        'original desktop file\n',
      );
      assert.equal(
        await fs.readFile(path.join(credentials.rootB, 'hello.txt'), 'utf8'),
        'original\n',
      );
    },
  );
  await check(
    'Closing the last native window exits and reopening keeps the signed-in profile',
    async () => {
      // Explicit test response only if there is pending upstream store state.
      await app.evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 1;
      });
      const closed = app.waitForEvent('close');
      await app.evaluate(({ BrowserWindow }) => {
        setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 0);
      });
      await closed;
      app = await electron.launch(options);
      page = await app.firstWindow();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.waitForURL((url) => url.pathname === '/projects', { timeout: 60000 });
      assert.equal(await page.locator('#email').count(), 0);
      assert.equal(
        (await local('/api/connectors')).connectors.find((item) => item.root === root)?.running,
        true,
      );
    },
  );
  await check('Pending-change close prompt honors Keep open and explicit Close now', async () => {
    await page.evaluate(() => {
      window.addEventListener('beforeunload', (event) => {
        event.preventDefault();
        event.returnValue = '';
      });
    });
    await app.evaluate(({ dialog, BrowserWindow }) => {
      globalThis.closePromptObserved = null;
      dialog.showMessageBoxSync = (_window, options) => {
        globalThis.closePromptObserved = options;
        return 0;
      };
      setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 0);
    });
    await eventually(async () => {
      const state = await app.evaluate(({ BrowserWindow }) => ({
        prompt: globalThis.closePromptObserved,
        visible: BrowserWindow.getAllWindows()[0]?.isVisible(),
      }));
      assert.deepEqual(state.prompt?.buttons, ['Keep open', 'Close now']);
      assert.equal(state.visible, true);
    });
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
    });
    const closed = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => {
      setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 0);
    });
    await closed;
    app = undefined;
  });
  assert.deepEqual(errors, []);
} catch (error) {
  if (page) await page.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  if (app) {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 1;
      })
      .catch(() => {});
    await app.close().catch(() => {});
  }
  await fs.writeFile(
    path.join(evidence, 'result.json'),
    JSON.stringify(
      { checks, errors, passed: !process.exitCode, at: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(`Evidence: ${evidence}`);
}
