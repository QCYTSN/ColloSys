// Capture actual pre-fix failures. Assertions report observations, never fabricate failures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { reviewFixture, legacyCheckpoint, account } from './product-ui-review-data.mjs';
const expect = baseExpect.configure({ timeout: 30000 }),
  f = await reviewFixture(),
  legacy = await legacyCheckpoint(f);
const out = 'docs/product-ui/review-fixes/evidence/before';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: '.local/review-before-video', size: { width: 1440, height: 900 } },
  }),
  page = await context.newPage(),
  results = [];
let verifyCalls = 0,
  sendCalls = 0;
await context.routeWebSocket(/127\.0\.0\.1:3408/, (ws) => {
  const server = ws.connectToServer();
  ws.onMessage((m) => {
    try {
      const j = JSON.parse(String(m));
      if (j.type === 'Mutation' && j.udfPath === 'colloCheckpoints:verify') verifyCalls++;
      if (j.type === 'Mutation' && j.udfPath === 'colloHandoffs:send') sendCalls++;
    } catch {}
    server.send(m);
  });
  server.onMessage((m) => ws.send(m));
});
const go = async (route) => {
  await page.goto('http://127.0.0.1:3407' + route);
  await expect(async () => {
    const switcher = page.getByRole('button', { name: /^Switch to / });
    if (await switcher.isVisible()) await switcher.click();
    await expect(
      page.locator(
        route.includes('tab=handoffs')
          ? '[data-testid=project-handoffs]'
          : route.includes('tab=workspaces')
            ? '[data-testid=local-workspaces]'
            : '.collo-projects',
      ),
    ).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
};
try {
  await page.goto('http://127.0.0.1:3407/login');
  await page.evaluate(
    (pair) => sessionStorage.setItem('collo.pair', pair),
    (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim(),
  );
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('#password').press('Enter');
  await expect(page.locator('.collo-projects')).toBeVisible();
  await go(
    `/projects/${f.projectId}?tab=handoffs&fromCheckpoint=${legacy.checkpointId}&checkpointWorkspace=${legacy.workspaceId}`,
  );
  const dialog = page.getByRole('dialog', { name: 'New handoff' });
  await expect(
    dialog.getByRole('button', { name: 'Verify checkpoint', exact: true }),
  ).toBeVisible();
  await dialog.locator('form').evaluate((form) => {
    window.reviewFormEvents = { invalid: 0, submit: 0 };
    form.addEventListener('invalid', () => window.reviewFormEvents.invalid++, true);
    form.addEventListener('submit', () => window.reviewFormEvents.submit++, true);
  });
  await dialog.getByRole('button', { name: 'Verify checkpoint', exact: true }).click();
  await expect.poll(() => verifyCalls).toBe(1);
  await expect(dialog.getByText('More parts remain.', { exact: false })).toBeVisible();
  const empty = await page.evaluate(() => ({
    ...window.reviewFormEvents,
    focused: document.activeElement?.getAttribute('aria-label'),
  }));
  await page.screenshot({ path: out + '/r1-empty-verify.png' });
  results.push({
    id: 'R1',
    evidence: 'Formal nested handoff form, real six-part old checkpoint and real verify mutation',
    expected: 'no invalid/submit; exactly one verify; no send',
    actual: { ...empty, verifyCalls, sendCalls },
    reproduced: empty.invalid > 0,
  });
  await page.keyboard.press('Escape');
  await go('/projects');
  await page.getByRole('textbox', { name: 'Find a project' }).fill(f.title);
  await page.getByRole('button', { name: 'Preview ' + f.title, exact: true }).click();
  await expect(page.locator('.collo-project-overview h2')).toHaveText(f.title);
  await expect(page.locator('.collo-project-people')).toContainText('2 members');
  await page.waitForTimeout(600);
  const oldVisible = await page
    .locator('.collo-project-overview')
    .getByText('TEST oldest pending A to B', { exact: true })
    .isVisible();
  assert.equal(
    (await f.a.client.query('colloHandoffs:get', { id: f.oldPendingId })).status,
    'pending',
  );
  results.push({
    id: 'R3',
    evidence:
      'Real database: two old pending records for different recipients, followed by 105 actually handled records',
    actual: { oldPendingVisible: oldVisible, handled: f.handled },
    reproduced: !oldVisible,
  });
  await page.screenshot({ path: out + '/r3-missing-old-pending.png' });
  const s = f.storage;
  await go(
    `/projects/${s.projectId}?tab=workspaces&workspaceView=history&directory=${s.workspaceId}`,
  );
  await page.getByText('This directory · TEST completion source', { exact: true }).click();
  await page.getByRole('button', { name: 'Storage & backups', exact: true }).click();
  const storage = page.getByTestId('directory-storage');
  await expect(storage.getByRole('button', { name: 'Review policy', exact: true })).toBeVisible();
  let fail = true;
  await page.route('**/api/storage', async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'TEST local read failed' }),
      });
    else await route.continue();
  });
  await storage.getByRole('button', { name: 'Refresh storage', exact: true }).click();
  await expect(storage.getByRole('alert')).toContainText('TEST local read failed');
  fail = false;
  await storage.getByRole('button', { name: 'Refresh storage', exact: true }).click();
  await page.waitForTimeout(500);
  const stale = await storage.getByText('TEST local read failed', { exact: true }).isVisible();
  results.push({
    id: 'R2',
    evidence: 'Formal storage page, explicit local HTTP503 followed by real successful read',
    actual: { oldReadErrorVisible: stale },
    reproduced: stale,
  });
  await page.screenshot({ path: out + '/r2-stale-read-error.png' });
  await page.unroute('**/api/storage');
  const recovery = storage.locator('[data-recovery-id]').first();
  await expect(recovery).toBeAttached();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    }),
  );
  const copy = recovery.getByRole('button', { name: 'Copy path', exact: true });
  await copy.scrollIntoViewIfNeeded();
  await copy.click();
  const feedback = storage.getByText('Recovery path copied.', { exact: true });
  await expect(feedback).toBeAttached();
  const position = await feedback.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const panel = e.closest('[role=dialog]');
    const p = panel.getBoundingClientRect();
    return { top: r.top, panelTop: p.top, visible: r.bottom >= p.top && r.top <= p.bottom };
  });
  results.push({
    id: 'R4',
    evidence:
      'Formal lower recovery row; successful clipboard promise substituted for deterministic capture',
    actual: position,
    reproduced: !position.visible,
  });
  await page.screenshot({ path: out + '/r4-feedback-outside-task.png' });
} finally {
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify({ at: new Date().toISOString(), base: '0ffc13a', results }, null, 2),
  );
  const v = page.video();
  await context.close();
  await v.saveAs(out + '/before.webm');
  await browser.close();
  for (const r of results)
    console.log(r.id, r.reproduced ? 'REPRODUCED' : 'NOT REPRODUCED', JSON.stringify(r.actual));
}
