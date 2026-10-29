import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, completionFixture, eventually } from './product-ui-completion-data.mjs';
const expect = baseExpect.configure({ timeout: 30000 });
const f = await completionFixture(),
  out = 'docs/product-ui/craft/evidence/continuity';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: '.local/craft-video', size: { width: 1440, height: 900 } },
});
const page = await context.newPage(),
  checks = [],
  metrics = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failOverview = false,
  holdSend = false,
  releaseSend = null,
  injected = 0;
await context.routeWebSocket(/127\.0\.0\.1:3408/, (ws) => {
  const server = ws.connectToServer(),
    paths = new Map(),
    mutations = new Set();
  ws.onMessage((message) => {
    try {
      const m = JSON.parse(String(message));
      if (m.type === 'ModifyQuerySet')
        for (const x of m.modifications) {
          if (x.type === 'Add') paths.set(x.queryId, x.udfPath);
          else paths.delete(x.queryId);
        }
      if (m.type === 'Mutation' && m.udfPath === 'colloHandoffs:send' && holdSend)
        mutations.add(m.requestId);
    } catch {}
    server.send(message);
  });
  server.onMessage((message) => {
    let text = message;
    try {
      const m = JSON.parse(String(message));
      if (m.type === 'MutationResponse' && mutations.has(m.requestId)) {
        mutations.delete(m.requestId);
        releaseSend = () => ws.send(message);
        return;
      }
      if (m.type === 'Transition' && failOverview) {
        m.modifications = m.modifications.map((x) => {
          if (x.type === 'QueryUpdated' && paths.get(x.queryId) === 'colloHandoffs:list') {
            failOverview = false;
            injected++;
            return {
              type: 'QueryFailed',
              queryId: x.queryId,
              errorMessage: 'Temporary service unavailable',
              errorData: { status: 503, message: 'Temporary service unavailable' },
              logLines: [],
              journal: null,
            };
          }
          return x;
        });
        text = JSON.stringify(m);
      }
    } catch {}
    ws.send(text);
  });
});
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS', name);
}
async function go(route) {
  await page.goto('http://127.0.0.1:3407' + route);
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(page.locator('.collo-topbar')).toBeVisible({ timeout: 700 });
    if (route.includes('tab=handoffs'))
      await expect(page.getByTestId('project-handoffs')).toBeVisible({ timeout: 700 });
    if (route.includes('tab=workspaces'))
      await expect(page.getByTestId('local-workspaces')).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
}
const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });
try {
  await page.goto('http://127.0.0.1:3407/login');
  await expect(page.locator('#email')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const h = await page.locator('.collo-auth-step h1').evaluate((e) => {
    const s = getComputedStyle(e);
    return {
      weight: s.fontWeight,
      size: s.fontSize,
      tracking: s.letterSpacing,
      family: s.fontFamily,
    };
  });
  assert.equal(h.weight, '500');
  metrics.push({ auth: h });
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('#password').press('Enter');
  await expect(page.locator('.collo-projects')).toBeVisible();
  const pair = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
  await page.evaluate((v) => sessionStorage.setItem('collo.pair', v), pair);
  await go(`/projects/${f.projectId}?tab=workspaces`);
  await page.getByRole('link', { name: 'ColloSys projects', exact: true }).click();
  await page.locator('.collo-project-select').filter({ hasText: '团队协作' }).click();
  const members = await f.a.client.query('collo:projectMembers', { projectId: f.projectId }),
    project = await f.a.client.query('collo:projectByRef', { reference: f.projectId }),
    recipient = members.members.find((m) => m.id !== project.user_id);
  await check(
    'Overview query failure preserves successful sections and retry restores the failed query',
    async () => {
      await expect(page.locator('.collo-project-overview')).toContainText('Connected directories');
      const heading = await page.locator('.collo-project-overview h2').innerText();
      failOverview = true;
      await f.a.client.mutation('colloHandoffs:send', {
        projectId: f.projectId,
        requestId: crypto.randomUUID(),
        recipient: recipient.id,
        title: 'TEST craft overview refresh',
        context: 'TEST isolated transport fault',
        nextSteps: '',
      });
      await expect(page.locator('.collo-project-overview [role=alert]')).toBeVisible();
      assert.equal(injected, 1);
      await expect(page.locator('.collo-project-overview h2')).toHaveText(heading);
      await expect(page.locator('.collo-project-people')).toBeVisible();
      await expect(
        page.locator('.collo-overview-section').filter({ hasText: 'Connected directories' }),
      ).toContainText('TEST completion source');
      await shot('01-overview-transient');
      await page
        .locator('.collo-project-overview')
        .getByRole('button', { name: 'Retry', exact: true })
        .click();
      await expect(page.locator('.collo-project-overview [role=alert]')).toHaveCount(0);
    },
  );
  await go(`/projects/${f.projectId}?tab=handoffs`);
  await check(
    'Slow handoff submission locks the reviewed draft and cannot clear a later form',
    async () => {
      await page.getByRole('button', { name: 'New handoff', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'New handoff', exact: true });
      await form.getByLabel('Handoff recipient').selectOption(recipient.id);
      await form.getByLabel('Title', { exact: true }).fill('TEST slow craft ' + Date.now());
      await form.getByLabel('Context', { exact: true }).fill('TEST reviewed context');
      holdSend = true;
      await form.getByRole('button', { name: 'Send handoff', exact: true }).click();
      await expect.poll(() => !!releaseSend).toBe(true);
      await expect(form.getByLabel('Title', { exact: true })).toBeDisabled();
      await expect(form.getByRole('button', { name: 'Keep draft', exact: true })).toBeDisabled();
      await shot('02-handoff-pending');
      releaseSend();
      releaseSend = null;
      holdSend = false;
      await expect(form).toHaveCount(0);
      await page.getByRole('button', { name: 'Back to handoffs', exact: true }).click();
      await expect(page.locator('.collo-detail-surface')).toHaveCount(0);
      await page.getByRole('button', { name: 'New handoff', exact: true }).click();
      await form.getByLabel('Title', { exact: true }).fill('TEST later draft retained');
      await form.getByRole('button', { name: 'Keep draft', exact: true }).click();
      await page.getByRole('button', { name: 'New handoff', exact: true }).click();
      await expect(form.getByLabel('Title', { exact: true })).toHaveValue(
        'TEST later draft retained',
      );
      await form.getByRole('button', { name: 'Keep draft', exact: true }).click();
    },
  );
  await check('New URL source intent survives the previous pending submission', async () => {
    await page.getByRole('button', { name: 'New handoff', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'New handoff', exact: true });
    await form.getByLabel('Handoff recipient').selectOption(recipient.id);
    await form.getByLabel('Title', { exact: true }).fill('TEST source version ' + Date.now());
    await form.getByLabel('Context', { exact: true }).fill('TEST pending old source');
    holdSend = true;
    await form.getByRole('button', { name: 'Send handoff', exact: true }).click();
    await expect.poll(() => !!releaseSend).toBe(true);
    await page.evaluate(route => { history.pushState(null, '', route); dispatchEvent(new PopStateEvent('popstate')); }, `/projects/${f.projectId}?tab=handoffs&fromTask=${f.taskId}`);
    await expect(form.getByLabel(/Related task/)).toHaveValue(f.taskId);
    releaseSend(); releaseSend = null; holdSend = false;
    await expect(form.getByLabel('Title', { exact: true })).toBeEnabled();
    await expect(form.getByLabel(/Related task/)).toHaveValue(f.taskId);
    await expect(form.getByLabel('Context', { exact: true })).toHaveValue('TEST pending old source');
    await shot('02b-new-source-retained');
    await form.getByRole('button', { name: 'Keep draft', exact: true }).click();
  });
  await check(
    'Normal close follows actual CSS duration; quick reopen and cancellation retain valid detail',
    async () => {
      const css = await page.addStyleTag({
        content: '.collo-detail-surface[data-phase="closing"] { animation-duration: 650ms; }',
      });
      const row = page.locator('[data-handoff-id]').first();
      await row.click();
      await expect(page.locator('.collo-handoff-detail h2')).toBeVisible();
      await page.getByRole('button', { name: 'Back to handoffs', exact: true }).click();
      await page.waitForTimeout(240);
      await expect(page.locator('.collo-detail-surface[data-phase=closing]')).toBeAttached();
      await shot('03-close-intermediate');
      await row.click();
      await page.waitForTimeout(700);
      await expect(page.locator('.collo-detail-surface[data-phase=open]')).toBeVisible();
      await page.getByRole('button', { name: 'Back to handoffs', exact: true }).click();
      await page
        .locator('.collo-detail-surface')
        .evaluate((e) => e.getAnimations().forEach((a) => a.cancel()));
      await expect(page.locator('.collo-detail-surface')).toHaveCount(0);
      await css.evaluate((e) => e.remove());
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await row.click();
      await page.getByRole('button', { name: 'Back to handoffs', exact: true }).click();
      await expect(page.locator('.collo-detail-surface')).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    },
  );
  await check('Programmatic left and right panel toggles share intermediate geometry', async () => {
    for (const [id, button] of [
      ['sidebar', 'Toggle sidebar'],
      ['session-list', 'Toggle sessions panel'],
    ]) {
      const control =
        id === 'sidebar'
          ? page.locator('.collo-topbar-nav button:visible').first()
          : page.getByRole('button', { name: button, exact: true });
      await page.evaluate((id) => {
        const panel =
          document.getElementById(id) || document.querySelector(`[data-panel-id="${id}"]`);
        if (!panel) throw Error('missing ' + id);
        const group = panel.parentElement;
        window.__craftFrames = [];
        let n = 0;
        function frame() {
          const r = panel.getBoundingClientRect(),
            siblings = [...group.children].filter((e) => e.hasAttribute('data-panel'));
          window.__craftFrames.push({
            width: r.width,
            total: siblings.reduce((v, e) => v + e.getBoundingClientRect().width, 0),
            group: group.clientWidth,
            moving: group.classList.contains('collo-panels-moving'),
          });
          if (n++ < 30) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }, id);
      await control.click();
      await page.waitForTimeout(600);
      const frames = await page.evaluate(() => window.__craftFrames);
      metrics.push({ panel: id, frames });
      assert.ok(
        new Set(frames.map((x) => Math.round(x.width))).size > 3,
        `${id} has no measured intermediate widths`,
      );
      const gaps = frames.map((x) => x.group - x.total);
      assert.ok(Math.max(...gaps) - Math.min(...gaps) < 3, `${id} sibling geometry diverged`);
      await control.click();
      await page.waitForTimeout(250);
    }
  });
  await go(
    `/projects/${f.projectId}?tab=workspaces&workspaceView=history&directory=${f.workspaceId}`,
  );
  await page.getByText('This directory · TEST completion source', { exact: true }).click();
  await page.getByRole('button', { name: 'Storage & backups', exact: true }).click();
  await check('Changing a reviewed policy or checkpoint requires a new review', async () => {
    const storage = page.getByTestId('directory-storage');
    await expect(
      storage.getByRole('button', { name: 'Refresh storage', exact: true }),
    ).toBeEnabled();
    const policy = storage.getByLabel('Checkpoints', { exact: true });
    await policy.fill('9');
    await storage.getByRole('button', { name: 'Review policy', exact: true }).click();
    const form = page.getByRole('form', { name: 'Confirm storage operation' });
    await form.getByRole('checkbox').check();
    await policy.fill('10');
    await expect(form).toHaveCount(0);
    const select = storage.getByLabel('Storage checkpoint', { exact: true });
    await expect(select).toBeVisible();
    const opts = await select
      .locator('option')
      .evaluateAll((es) => es.map((e) => e.value).filter(Boolean));
    assert.ok(opts.length >= 2);
    await select.selectOption(opts[0]);
    await storage.getByRole('button', { name: 'Create encrypted backup', exact: true }).click();
    await form.getByRole('checkbox').check();
    await select.selectOption(opts[1]);
    await expect(form).toHaveCount(0);
    await shot('04-storage-review-reset');
  });
  await page.keyboard.press('Escape');
  await check(
    'Recovery route remains reachable with an existing identity and clears durable sign-in explicitly',
    async () => {
      await page.goto('http://127.0.0.1:3407/login?recover=1&return_to=%2Fprojects');
      await expect(
        page.getByRole('button', { name: 'Retry workspace', exact: true }),
      ).toBeVisible();
      await shot('05-sign-in-recovery');
      await page.getByRole('button', { name: 'Sign out and sign in again', exact: true }).click();
      await expect(page.locator('#email')).toBeVisible();
      await page.reload();
      await expect(page.locator('#email')).toBeVisible();
    },
  );
  assert.deepEqual(errors, []);
} catch (e) {
  await shot('failure').catch(() => {});
  throw e;
} finally {
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify({ at: new Date().toISOString(), checks, metrics, errors }, null, 2),
  );
  const v = page.video();
  await context.close();
  await v.saveAs(out + '/continuity.webm');
  await browser.close();
}
