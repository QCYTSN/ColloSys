import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, _electron as electron, expect } from '@playwright/test';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';
const native = process.argv.includes('--native');
const out = process.env.COLLOSYS_UI_EVIDENCE_DIR
  ? path.resolve(process.env.COLLOSYS_UI_EVIDENCE_DIR)
  : path.resolve('docs/product-ui/evidence', native ? 'native' : 'flow');
await fs.mkdir(out, { recursive: true });
const saved = JSON.parse(await fs.readFile('.local/product-ui-context.json', 'utf8'));
const account = JSON.parse(
  await fs.readFile(path.join(saved.acceptanceDir, 'restart-test.json'), 'utf8'),
);
const pair = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
async function clientFor(credentials) {
  const client = new ConvexHttpClient('http://127.0.0.1:3408');
  const result = await client.action('auth:signIn', {
    provider: 'password',
    params: { email: credentials.email, password: credentials.password, flow: 'signIn' },
  });
  client.setAuth(result.tokens.token);
  return client;
}
const client = await clientFor(account.a);
const project = await client.query('collo:projectByRef', { reference: account.projectId });
assert.ok(project);
const members = await client.query('collo:projectMembers', { projectId: project._id });
const teammate = members.members.find((m) => m.id !== project.user_id);
assert.ok(teammate, 'Existing two-member acceptance project is required');
const sessions = await client.query('colloSessions:list', {
  projectId: project._id,
  paginationOpts: { numItems: 30, cursor: null },
});
const session = sessions.page[0];
assert.ok(session, 'A real connector-captured session is required');
const sourceMessages = await client.query('colloSessions:messages', {
  projectId: project._id,
  workspaceId: session.workspaceId,
  sessionId: session.sessionId,
  after: 0,
});
assert.equal(
  session.adapter,
  sourceMessages.messages[0].adapter,
  'List and reader use the same captured Agent identity',
);
const task = await client.mutation('tasks:webCreate', {
  title: `TEST product UI review ${Date.now()}`,
  workspace: 'team',
  team_id: project.team_id,
  project_id: project._id,
});
const checks = [],
  errors = [];
let browser, app, page, video;
let failure;
async function mark(name) {
  checks.push(name);
  console.log('PASS', name);
}
async function capture(name) {
  await expect(async () => {
    await page.evaluate(() => document.fonts.ready);
  }).toPass({ timeout: 10000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, name + '.png') });
}
async function navigate(route) {
  await page.goto('http://127.0.0.1:3407' + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(650);
  if (route.includes('tab=workspaces')) {
    await expect(async () => {
      if (await page.locator('[data-foreign-switch]').isVisible())
        await page.locator('[data-foreign-switch]').click();
      await expect(page.getByTestId('local-workspaces')).toBeVisible();
    }).toPass({ timeout: 30000 });
  }
  if (await page.locator('[data-foreign-switch]').isVisible())
    await page.locator('[data-foreign-switch]').click();
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
        dir: path.resolve('.local/product-ui-video'),
        size: { width: 1440, height: 960 },
      },
      timeout: 60000,
    });
    page = await app.firstWindow();
    video = page.video();
    // These test route reloads explicitly confirm leaving the current document.
    // The separate native desktop test verifies both Keep open and Close now.
    await app.evaluate(({ dialog }) => {
      const original = dialog.showMessageBoxSync;
      dialog.showMessageBoxSync = (window, options) =>
        options.buttons?.includes('Close now') ? 1 : original(window, options);
    });
    await app.evaluate(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0];
      const area = screen.getPrimaryDisplay().workArea;
      w.setBounds({
        x: area.x + 16,
        y: area.y + 16,
        width: Math.min(1440, area.width - 32),
        height: Math.min(960, area.height - 32),
      });
      w.show();
    });
    const state = await app.evaluate(({ app, BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0],
        p = w.webContents.getLastWebPreferences();
      return {
        name: app.name,
        title: w.getTitle(),
        visible: w.isVisible(),
        native: !w.getNativeWindowHandle().every((v) => !v),
        sandbox: p.sandbox,
        isolation: p.contextIsolation,
        node: p.nodeIntegration,
        url: w.webContents.getURL().split('#')[0],
        profile: app.getPath('userData'),
      };
    });
    assert.equal(state.name, 'ColloSys');
    assert.equal(state.native, true);
    assert.equal(state.sandbox, true);
    assert.equal(state.isolation, true);
    assert.equal(state.node, false);
    assert.ok(!state.url.includes('workbench-preview'));
    await fs.writeFile(path.join(out, 'window.json'), JSON.stringify(state, null, 2));
  } else {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(`http://127.0.0.1:3407/login#${new URLSearchParams({ pair })}`);
  }
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  if (native) {
    // The platform restores the initial window after creating it; wait for
    // that navigation before interacting with the sign-in document.
    await page.waitForURL((u) => u.pathname === '/login');
    await page.waitForLoadState('networkidle');
  }
  await page.locator('#email').waitFor({ timeout: 60000 });
  await capture('01-login');
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => u.pathname === '/projects');
  await capture('02-projects');
  await mark('Normal entry signs in to the actual project application');
  await navigate(`/projects/${project._id}?tab=workspaces`);
  await expect(page.locator('[data-testid="local-workspaces"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect directory', exact: true })).toBeEnabled();
  await capture('03-workspaces');
  if (native)
    await promisify(execFile)(
      'powershell.exe',
      [
        '-NoProfile',
        '-File',
        path.resolve('tests/codecast-native-window.ps1'),
        '-DesktopProcessId',
        String(await app.evaluate(() => process.pid)),
        '-EvidencePath',
        path.join(out, '03-native-frame.png'),
      ],
      { timeout: 30000, windowsHide: true },
    );
  await page
    .locator('.collo-project-tools')
    .getByRole('button', { name: 'Conversations', exact: true })
    .click();
  await page.locator(`[data-captured-session="${session.sessionId}"]`).click();
  await expect(page.getByTestId('captured-conversation')).toBeVisible();
  await expect(page.getByTestId('captured-conversation')).toContainText(
    sourceMessages.messages[0].text,
  );
  await capture('04-conversation');
  await mark('Captured messages are read through the mature ConversationView');
  await page.getByRole('button', { name: 'Handoff', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New handoff' });
  await expect(dialog).toBeVisible();
  const title = `TEST UI handoff ${Date.now()}`;
  await dialog.getByLabel('Handoff recipient').selectOption(teammate.id);
  await dialog.getByLabel('Title', { exact: true }).fill(title);
  await dialog
    .getByLabel('Context', { exact: true })
    .fill(
      '本地验收：检查已捕获的会话与文件变化。This handoff is created through the actual product form.',
    );
  await dialog
    .getByLabel('Next steps', { exact: true })
    .fill('Review the captured changes, then accept this handoff. 不会自动应用他人的文件。');
  const options = await dialog
    .getByLabel(/Related task/)
    .locator('option')
    .evaluateAll((rows) => rows.map((r) => r.value));
  if (options.includes(task.id)) await dialog.getByLabel(/Related task/).selectOption(task.id);
  await capture('05-handoff-form');
  await dialog.getByRole('button', { name: 'Send handoff', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.collo-handoff-detail h2')).toHaveText(title);
  const handoffId = new URL(page.url()).searchParams.get('handoff');
  assert.ok(handoffId);
  const stored = await client.query('colloHandoffs:get', { id: handoffId });
  assert.equal(stored.title, title);
  assert.equal(stored.source.sessionId, session.sessionId);
  assert.equal(stored.status, 'pending');
  const receiptBrowser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const receiver = await receiptBrowser.newPage({ viewport: { width: 1440, height: 960 } });
    receiver.on('pageerror', (e) => errors.push(e.message));
    await receiver.goto(
      `http://127.0.0.1:3407/projects/${project._id}?tab=handoffs&handoff=${handoffId}`,
    );
    await receiver.locator('#email').fill(account.b.email);
    await receiver.locator('#password').fill(account.b.password);
    await receiver.locator('form button[type="submit"]').click();
    await receiver.waitForURL((u) => u.searchParams.get('handoff') === handoffId);
    await expect(async () => {
      if (await receiver.locator('[data-foreign-switch]').isVisible())
        await receiver.locator('[data-foreign-switch]').click();
      await expect(
        receiver.getByRole('button', { name: 'Accept handoff', exact: true }),
      ).toBeVisible();
    }).toPass({ timeout: 30000 });
    await receiver.getByRole('button', { name: 'Accept handoff', exact: true }).click();
    await expect(receiver.locator('.collo-handoff-detail [data-status="accepted"]')).toBeVisible();
    await receiver.screenshot({ path: path.join(out, '06-recipient-accept.png') });
  } finally {
    await receiptBrowser.close();
  }
  await expect(page.locator('.collo-handoff-detail [data-status="accepted"]')).toBeVisible();
  await capture('06-handoff-accepted');
  await page.reload();
  await expect(page.locator('.collo-handoff-detail h2')).toHaveText(title);
  await mark('Handoff persists, pins its source and reacts to recipient acceptance');
  await navigate(`/projects/${project._id}?tab=workspaces`);
  await page.locator('[data-event-id]').first().click();
  await expect(page.getByTestId('checkpoint-completeness')).toBeVisible();
  await capture('07-code-review');
  await mark('Checkpoint uses the real file tree and Diff viewer');
  await navigate(`/projects/${project._id}/${task.id}`);
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  const comment = `TEST UI comment ${Date.now()} · 保留当前任务上下文`;
  await page.getByPlaceholder('Leave a comment...').fill(comment);
  await page.getByPlaceholder('Leave a comment...').press('Enter');
  await expect
    .poll(async () =>
      (await client.query('tasks:webGet', { id: task.id })).comments.some(
        (c) => c.text === comment,
      ),
    )
    .toBe(true);
  assert.ok(new URL(page.url()).pathname.includes('/projects/'));
  await mark('Native task comment writer persists without leaving the task');
  await capture('08-task');
  await navigate(`/projects/${project._id}?tab=workspaces&workspaceView=history`);
  await capture('09-history');
  await navigate('/settings/integrations');
  await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
  await capture('10-connections');
  await page.getByRole('button', { name: 'About ColloSys', exact: true }).click();
  await expect(page.locator('.collo-about-brand')).toContainText('ColloSys');
  await capture('11-about');
  await page.keyboard.press('Escape');
  await navigate('/projects');
  await capture('12-return');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'New project' });
  const projectTitle = `TEST UI created project ${Date.now()}`;
  await create.getByLabel('Project name', { exact: true }).fill(projectTitle);
  await create.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(create).toBeHidden();
  await expect(page.locator('[data-project-title]')).toHaveText(projectTitle);
  assert.ok(!page.url().includes('undefined'));
  const createdRef = new URL(page.url()).pathname.split('/')[2];
  assert.equal(
    (await client.query('collo:projectByRef', { reference: createdRef })).title,
    projectTitle,
  );
  await mark('Project creation uses the original persistent business store');
  await mark('Core routes share the same shell and return to projects');
  assert.deepEqual(errors, []);
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  console.error(error);
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await fs.writeFile(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        native,
        passed: !failure,
        failure,
        checks,
        errors,
        capturedAt: new Date().toISOString(),
        data: 'Existing persisted local acceptance account, real connector data and API mutations. No screenshot fixtures.',
      },
      null,
      2,
    ),
  );
  if (app) {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 1;
      })
      .catch(() => {});
    await app.close();
  }
  if (video) await video.saveAs(path.join(out, 'continuous-demo.webm'));
  if (browser) await browser.close();
}
