// Formal nested handoff form, real local Convex mutations. Read-error transport is labelled.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { reviewFixture, legacyCheckpoint, account } from './product-ui-review-data.mjs';
const before = process.argv.includes('--before'),
  expect = baseExpect.configure({ timeout: 30000 }),
  f = await reviewFixture(),
  cp = await legacyCheckpoint(f);
const out = `docs/product-ui/review-fixes/evidence/${before ? 'before' : 'after'}/buttons`;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: '.local/review-buttons-video' },
  }),
  page = await context.newPage();
const counts = { verify: 0, send: 0, retry: 0 },
  results = [];
let failReads = true,
  holdVerify = false,
  release,
  holdSendReply = false,
  releaseSend;
await context.routeWebSocket(/127\.0\.0\.1:3408/, (ws) => {
  const server = ws.connectToServer(),
    paths = new Map(),
    sends = new Set();
  ws.onMessage((m) => {
    try {
      const j = JSON.parse(String(m));
      if (j.type === 'ModifyQuerySet')
        for (const x of j.modifications) {
          if (x.type === 'Add') {
            paths.set(x.queryId, x.udfPath);
            if (x.udfPath === 'collo:checkpointParts') counts.retry++;
          } else paths.delete(x.queryId);
        }
      if (j.type === 'Mutation') {
        if (j.udfPath === 'colloCheckpoints:verify') {
          counts.verify++;
          if (holdVerify) {
            release = () => server.send(m);
            return;
          }
        }
        if (j.udfPath === 'colloHandoffs:send') {
          counts.send++;
          sends.add(j.requestId);
        }
      }
    } catch {}
    server.send(m);
  });
  server.onMessage((m) => {
    try {
      const j = JSON.parse(String(m));
      if (holdSendReply && j.type === 'MutationResponse' && sends.has(j.requestId)) {
        releaseSend = () => ws.send(m);
        return;
      }
      if (j.type === 'Transition' && failReads) {
        j.modifications = j.modifications.map((x) =>
          x.type === 'QueryUpdated' && paths.get(x.queryId) === 'collo:checkpointParts'
            ? {
                type: 'QueryFailed',
                queryId: x.queryId,
                errorMessage: 'TEST temporary verification read failure',
                errorData: { status: 503, message: 'TEST temporary verification read failure' },
                logLines: [],
                journal: null,
              }
            : x,
        );
        m = JSON.stringify(j);
      }
    } catch {}
    ws.send(m);
  });
});
const events = () =>
  page.evaluate(() => ({
    ...window.formEvents,
    focused: document.activeElement?.getAttribute('aria-label'),
  }));
const observe = async (name) => {
  const actual = { ...(await events()), ...counts };
  const passed = actual.invalid === 0 && actual.submit === 0 && counts.send === 0;
  results.push({ name, passed, actual });
  console.log(passed ? 'PASS' : 'FAIL', name, JSON.stringify(actual));
  if (!before) assert.ok(passed, name);
};
try {
  await page.goto('http://127.0.0.1:3407/login');
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('#password').press('Enter');
  await expect(page.locator('.collo-projects')).toBeVisible();
  await page.goto(
    `http://127.0.0.1:3407/projects/${f.projectId}?tab=handoffs&fromCheckpoint=${cp.checkpointId}&checkpointWorkspace=${cp.workspaceId}`,
  );
  const dialog = page.getByRole('dialog', { name: 'New handoff' }),
    form = dialog.locator('form');
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(dialog).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
  await form.evaluate((e) => {
    window.formEvents = { invalid: 0, submit: 0 };
    e.addEventListener('invalid', () => window.formEvents.invalid++, true);
    e.addEventListener('submit', () => window.formEvents.submit++, true);
  });
  const retry = dialog.getByRole('button', { name: 'Retry verification', exact: true });
  await expect(retry).toBeVisible();
  await retry.click();
  await page.waitForTimeout(200);
  await observe('empty form, Retry mouse (injected read error)');
  await retry.press('Enter');
  await page.waitForTimeout(200);
  await observe('empty form, Retry Enter');
  if (!before) {
    await dialog.getByLabel('Handoff recipient', { exact: true }).selectOption(f.b.id);
    await dialog.getByLabel('Title', { exact: true }).fill('TEST valid auxiliary retry');
    await dialog.getByLabel('Context', { exact: true }).fill('TEST complete fields');
    await retry.press('Enter');
    await page.waitForTimeout(200);
    await observe('valid form, Retry Enter does not send');
    await dialog.getByLabel('Handoff recipient', { exact: true }).selectOption('');
    await dialog.getByLabel('Title', { exact: true }).fill('');
    await dialog.getByLabel('Context', { exact: true }).fill('');
  }
  failReads = false;
  await retry.press('Space');
  if (before && counts.retry === 1) {
    results.push({
      name: 'Retry releases failed subscription and reaches server again',
      passed: false,
      actual: { ...counts },
    });
    await page.screenshot({ path: out + '/retry-no-resubscription.png' });
    console.log('FAIL shared receipt retains failed query after Retry');
  }
  const verify = dialog.getByRole('button', { name: 'Verify checkpoint', exact: true });
  await expect(verify).toBeVisible();
  await observe('empty form, Retry Space and actual query recovery');
  await page.screenshot({ path: out + '/retry-form.png' });
  if (before) {
    await verify.click();
    await expect(dialog.getByText('More parts remain.', { exact: false })).toBeVisible();
    await observe('empty form, Verify mouse (real legacy migration)');
  } else {
    holdVerify = true;
    await verify.click();
    await expect.poll(() => counts.verify).toBe(1);
    await expect(dialog.getByRole('button', { name: 'Verifying…', exact: true })).toBeDisabled();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    assert.equal(counts.verify, 1);
    holdVerify = false;
    release();
    await expect(dialog.getByText('More parts remain.', { exact: false })).toBeVisible();
    await observe('empty form, slow Verify and repeated activation');
    await dialog.getByLabel('Handoff recipient', { exact: true }).selectOption(f.b.id);
    await dialog.getByLabel('Title', { exact: true }).fill('TEST targeted button semantics');
    await dialog.getByLabel('Context', { exact: true }).fill('TEST actual checkpoint handoff');
    await verify.press('Enter');
    await expect(dialog.locator('[data-checkpoint-source]')).toHaveAttribute('data-ready', 'true');
    await observe('valid form, Verify Enter completes six-part migration');
    await dialog.getByLabel('Title', { exact: true }).fill('');
    await dialog.getByRole('button', { name: 'Send handoff', exact: true }).click();
    assert.ok((await events()).invalid > 0);
    assert.equal(counts.send, 0);
    results.push({ name: 'actual Send preserves native required validation', passed: true });
    await dialog.getByLabel('Title', { exact: true }).fill('TEST targeted button semantics');
    await dialog.getByRole('button', { name: 'Send handoff', exact: true }).dblclick();
    await expect(dialog).toHaveCount(0);
    assert.equal(counts.send, 1);
    results.push({
      name: 'actual valid Send double activation persists exactly once',
      passed: true,
    });
    const bad = await legacyCheckpoint(f, 'TEST conflicting checkpoint', true);
    await page.goto(
      `http://127.0.0.1:3407/projects/${f.projectId}?tab=handoffs&fromCheckpoint=${bad.checkpointId}&checkpointWorkspace=${bad.workspaceId}`,
    );
    await expect(verify).toBeVisible();
    await form.evaluate((e) => {
      window.formEvents = { invalid: 0, submit: 0 };
      e.addEventListener('invalid', () => window.formEvents.invalid++, true);
      e.addEventListener('submit', () => window.formEvents.submit++, true);
    });
    await verify.press('Space');
    await expect(dialog.getByText('File paths conflict.', { exact: false })).toBeVisible();
    assert.deepEqual(
      { ...(await events()), focused: undefined },
      { invalid: 0, submit: 0, focused: undefined },
    );
    assert.equal(counts.send, 1);
    await expect(dialog.getByRole('button', { name: 'Send handoff', exact: true })).toBeDisabled();
    results.push({
      name: 'Verify Space: actual conflicting paths fail integrity without form validation or send',
      passed: true,
    });
    await page.screenshot({ path: out + '/conflict-blocked.png' });
    await page.goto(
      `http://127.0.0.1:3407/projects/${f.projectId}?tab=handoffs&fromCheckpoint=${cp.checkpointId}&checkpointWorkspace=${cp.workspaceId}`,
    );
    await expect(dialog.locator('[data-checkpoint-source]')).toHaveAttribute('data-ready', 'true');
    await dialog.getByLabel('Handoff recipient', { exact: true }).selectOption(f.b.id);
    await dialog.getByLabel('Title', { exact: true }).fill('TEST busy inspect navigation');
    await dialog
      .getByLabel('Context', { exact: true })
      .fill('TEST draft survives allowed inspect link');
    holdSendReply = true;
    await dialog.getByRole('button', { name: 'Send handoff', exact: true }).click();
    await expect.poll(() => !!releaseSend).toBe(true);
    await expect(dialog.getByLabel('Title', { exact: true })).toBeDisabled();
    await dialog.getByRole('link', { name: 'Inspect changes →', exact: true }).click();
    await expect(page.getByTestId('local-workspaces')).toBeVisible();
    await page.goBack();
    await expect(dialog).toBeVisible();
    releaseSend();
    holdSendReply = false;
    await page.waitForTimeout(200);
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue(
      'TEST busy inspect navigation',
    );
    await expect(dialog.getByLabel('Context', { exact: true })).toHaveValue(
      'TEST draft survives allowed inspect link',
    );
    assert.equal(counts.send, 2);
    results.push({
      name: 'Busy fieldset keeps the read-only Inspect changes link usable; returning draft survives old send reply',
      passed: true,
    });
    await page.screenshot({ path: out + '/busy-navigation-draft.png' });
  }
} finally {
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        base: '0ffc13a',
        evidence:
          'Formal page + real six-part legacy checkpoint; read errors explicitly injected at WebSocket response only',
        results,
      },
      null,
      2,
    ),
  );
  const video = page.video();
  await context.close();
  await video.saveAs(out + '/buttons.webm');
  await browser.close();
}
