import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, completionFixture, longUrl, eventually } from './product-ui-completion-data.mjs';
import { inspectOverflow } from './product-ui-overflow.mjs';
const expect = baseExpect.configure({ timeout: 30000 }),
  f = await completionFixture();
const out = 'docs/product-ui/completion/handoffs';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: '.local/completion-handoff-video', size: { width: 1440, height: 900 } },
});
const other = await browser.newContext({ viewport: { width: 1280, height: 800 } }),
  page = await context.newPage(),
  recipient = await other.newPage();
const checks = [],
  faults = [];
let failNext = false,
  injected = 0;
// Exercise the real Convex client error path. Only a query result's transport
// envelope is replaced; actual membership denial below is tested against server.
await context.routeWebSocket(/127\.0\.0\.1:3408/, (ws) => {
  const server = ws.connectToServer(),
    paths = new Map();
  ws.onMessage((message) => {
    try {
      const m = JSON.parse(String(message));
      if (m.type === 'ModifyQuerySet')
        for (const x of m.modifications) {
          if (x.type === 'Add') paths.set(x.queryId, x.udfPath);
          else paths.delete(x.queryId);
        }
    } catch {}
    server.send(message);
  });
  server.onMessage((message) => {
    let text = message;
    try {
      const m = JSON.parse(String(message));
      if (m.type === 'Transition' && failNext) {
        m.modifications = m.modifications.map((x) => {
          if (x.type === 'QueryUpdated' && paths.get(x.queryId)?.includes('colloHandoffs:list')) {
            failNext = false;
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
async function login(p, c) {
  await p.goto('http://127.0.0.1:3407/login');
  await p.locator('#email').fill(c.email);
  await p.locator('#password').fill(c.password);
  await p.locator('form button[type=submit]').click();
  await expect(p.locator('.collo-projects')).toBeVisible();
}
async function go(p, tab) {
  await p.goto(`http://127.0.0.1:3407/projects/${f.projectId}?${tab}`);
  await expect(async () => {
    if (await p.locator('[data-foreign-switch]').isVisible())
      await p.locator('[data-foreign-switch]').click();
    await expect(
      p.getByTestId(tab.includes('tab=handoffs') ? 'project-handoffs' : 'local-workspaces'),
    ).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS', name);
}
async function shot(name) {
  await page.screenshot({ path: path.join(out, name + '.png') });
}
let team,
  removed = false;
try {
  await login(page, account.a);
  await login(recipient, account.b);
  const pair = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
  await page.evaluate((p) => sessionStorage.setItem('collo.pair', p), pair);
  await go(page, `tab=workspaces&workspaceView=history&directory=${f.workspaceId}`);
  await page.getByRole('button', { name: 'Save checkpoint', exact: true }).click();
  const event = await eventually(async () => {
    const head = await f.a.client.query('collo:feed', {
      projectId: f.projectId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    const row = head.page.find((e) => e.kind === 'checkpoint');
    assert.ok(row);
    return row;
  });
  await go(page, `tab=workspaces&event=${event.id}`);
  await check(
    'Verified checkpoint has a real handoff entry and readable full provenance',
    async () => {
      await expect(
        page.getByRole('link', { name: 'Hand off checkpoint', exact: true }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'Hand off checkpoint', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'New handoff', exact: true })).toBeVisible();
      await expect(page.locator('[data-checkpoint-source]')).toHaveAttribute('data-ready', 'true');
    },
  );
  const form = page.getByRole('dialog', { name: 'New handoff', exact: true });
  const members = await f.a.client.query('collo:projectMembers', { projectId: f.projectId });
  const project = await f.a.client.query('collo:projectByRef', { reference: f.projectId });
  const b = members.members.find((m) => m.id !== project.user_id);
  const title = 'TEST checkpoint handoff ' + Date.now(),
    body = `Completed the local review.\n\n${longUrl}\n\n${'long-contact-'.repeat(7)}@example.invalid\nRead the changes, then leave a comment.\nFiles remain independent.`;
  await form.getByLabel('Handoff recipient').selectOption(b.id);
  await form.getByLabel('Title', { exact: true }).fill(title);
  await form.getByLabel('Context', { exact: true }).fill(body);
  await form
    .getByLabel('Next steps', { exact: true })
    .fill('Review the full source.\nDiscuss before applying anything.');
  await form.getByLabel(/Related task/).selectOption(f.taskId);
  await check(
    'Transport service failure keeps an open draft; retry preserves every field and source',
    async () => {
      failNext = true;
      // A separate legitimate record makes the subscribed list update, without
      // mutating or saving the draft being tested.
      await f.a.client.mutation('colloHandoffs:send', {
        projectId: f.projectId,
        requestId: crypto.randomUUID(),
        recipient: b.id,
        title: 'TEST service-failure trigger',
        context: 'TEST isolated transport exercise',
        nextSteps: '',
      });
      await expect(form.getByText('Connection interrupted. Your draft is kept.')).toBeVisible();
      assert.equal(injected, 1);
      await expect(form.getByLabel('Title', { exact: true })).toHaveValue(title);
      await expect(form.getByLabel('Context', { exact: true })).toHaveValue(body);
      await expect(form.getByRole('button', { name: 'Send handoff', exact: true })).toBeDisabled();
      await shot('01-transient-draft');
      await form.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(form.getByRole('button', { name: 'Send handoff', exact: true })).toBeEnabled();
      await expect(form.getByLabel('Context', { exact: true })).toHaveValue(body);
    },
  );
  await check(
    'Temporary offline state and closing/reopening the form preserve the draft',
    async () => {
      await context.setOffline(true);
      await form.getByRole('button', { name: 'Keep draft', exact: true }).click();
      await page.getByRole('button', { name: 'New handoff', exact: true }).click();
      await expect(form.getByLabel('Title', { exact: true })).toHaveValue(title);
      await expect(form.getByLabel('Context', { exact: true })).toHaveValue(body);
      await expect(form.locator('[data-checkpoint-source]')).toHaveCount(1);
      await context.setOffline(false);
      const audit = await inspectOverflow(page, '.collo-handoff-form');
      faults.push(audit);
      assert.deepEqual(audit.faults, []);
      await shot('02-long-draft');
    },
  );
  await form.getByRole('button', { name: 'Send handoff', exact: true }).click();
  await expect(form).toHaveCount(0);
  const record = await eventually(async () => {
    const p = await f.a.client.query('colloHandoffs:list', {
      projectId: f.projectId,
      paginationOpts: { numItems: 30, cursor: null },
    });
    const h = p.page.find((h) => h.title === title);
    assert.ok(h);
    assert.equal(h.checkpoint.checkpointId, event.payload.checkpointId);
    assert.equal(h.taskId, f.taskId);
    return h;
  });
  await check(
    'Recipient inspects the checkpoint and accepts without applying source files',
    async () => {
      const before = await fs.readFile(path.join(f.root, 'readme.txt'), 'utf8');
      await go(recipient, `tab=handoffs&handoff=${record._id}`);
      await expect(
        recipient.getByRole('link', { name: 'Inspect changes →', exact: true }),
      ).toBeVisible();
      await recipient.getByRole('button', { name: 'Accept handoff', exact: true }).click();
      await expect(
        recipient.locator('.collo-handoff-detail [data-status="accepted"]'),
      ).toBeVisible();
      assert.equal(
        (await f.a.client.query('colloHandoffs:get', { id: record._id })).status,
        'accepted',
      );
      assert.equal(await fs.readFile(path.join(f.root, 'readme.txt'), 'utf8'), before);
      await recipient.screenshot({ path: path.join(out, '03-accepted.png') });
    },
  );
  await check(
    'Decline and sender cancellation follow real revision-checked mutations',
    async () => {
      for (const [status, button] of [
        ['declined', 'Decline'],
        ['cancelled', 'Cancel handoff'],
      ]) {
        const h = await f.a.client.mutation('colloHandoffs:send', {
          projectId: f.projectId,
          requestId: crypto.randomUUID(),
          recipient: b.id,
          title: `TEST ${status} flow`,
          context: body,
          nextSteps: 'Read first.',
          checkpoint: { workspaceId: event.workspaceId, checkpointId: event.payload.checkpointId },
        });
        const p = status === 'declined' ? recipient : page;
        await go(p, `tab=handoffs&handoff=${h.id}`);
        await p.getByRole('button', { name: button, exact: true }).click();
        await expect(p.locator(`.collo-handoff-detail [data-status="${status}"]`)).toBeVisible();
        assert.equal((await f.a.client.query('colloHandoffs:get', { id: h.id })).status, status);
      }
    },
  );
  await check(
    'Real membership revocation immediately removes an open draft and cached context',
    async () => {
      await go(recipient, 'tab=handoffs');
      await recipient.getByRole('button', { name: 'New handoff', exact: true }).click();
      await recipient.getByLabel('Title', { exact: true }).fill('TEST MUST BE CLEARED');
      team = await f.a.client.query('teams:getTeam', { team_id: f.teamId });
      await f.a.client.mutation('teams:removeMember', { team_id: f.teamId, member_user_id: b.id });
      removed = true;
      await expect(recipient.getByRole('dialog', { name: 'New handoff', exact: true })).toHaveCount(
        0,
      );
      assert.equal(
        await recipient
          .locator('input')
          .evaluateAll((inputs) => inputs.some((input) => input.value === 'TEST MUST BE CLEARED')),
        false,
      );
    },
  );
} catch (e) {
  await page.screenshot({ path: path.join(out, 'failure.png') });
  await fs.writeFile(
    path.join(out, 'failure.txt'),
    JSON.stringify(
      {
        url: page.url(),
        dialogs: await page.getByRole('dialog').count(),
        labels: await page.locator('.collo-handoff-form label').allTextContents(),
        text: (await page.locator('body').innerText()).slice(-8000),
      },
      null,
      2,
    ),
  );
  throw e;
} finally {
  if (removed) await f.b.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
  await fs.writeFile(
    path.join(out, 'results.json'),
    JSON.stringify(
      { at: new Date().toISOString(), checks, injectedServiceFailures: injected, overflow: faults },
      null,
      2,
    ),
  );
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(path.join(out, 'interaction.webm'));
  await other.close();
  await browser.close();
}
