// Real database, indexed pagination and formal project overview. No synthetic rows.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium, expect as baseExpect } from '@playwright/test';
import { reviewFixture, account } from './product-ui-review-data.mjs';
import { inspectOverflow, inspectActions } from './product-ui-overflow.mjs';
const f = await reviewFixture(),
  expect = baseExpect.configure({ timeout: 30000 }),
  out = 'docs/product-ui/review-fixes/evidence/after/pending';
await fs.mkdir(out, { recursive: true });
const checks = [],
  audits = [];
const query = (id = f.projectId, cursor = null, numItems = 15) =>
  f.a.client.query('colloHandoffs:list', {
    projectId: id,
    status: 'pending',
    paginationOpts: { cursor, numItems },
  });
// Clear only this test's prior interrupted pagination fixtures for repeatability.
for (;;) {
  const prior = await query(f.projectId, null, 30);
  const owned = prior.page.filter(
    (h) =>
      h.title.startsWith('TEST indexed pending ') ||
      h.title === 'TEST targeted button semantics' ||
      h.title === 'TEST busy inspect navigation',
  );
  if (!owned.length) break;
  for (const h of owned)
    await (h.sender === f.a.id ? f.a : f.b).client.mutation('colloHandoffs:respond', {
      id: h._id,
      revision: h.revision,
      status: 'cancelled',
    });
}
const original = await query();
assert.ok(original.page.some((h) => h._id === f.oldPendingId));
assert.ok(original.page.some((h) => h._id === f.otherRecipientId));
checks.push(
  'Two older pending handoffs survive 105 newer handled records, including both recipients',
);
const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: '.local/review-pending-video' },
  }),
  page = await context.newPage();
let holdOverview = false;
const held = [];
await context.routeWebSocket(/127\.0\.0\.1:3408/, (ws) => {
  const server = ws.connectToServer(),
    paths = new Map();
  ws.onMessage((m) => {
    try {
      const j = JSON.parse(String(m));
      if (j.type === 'ModifyQuerySet')
        for (const q of j.modifications) {
          if (q.type === 'Add') paths.set(q.queryId, q.udfPath);
          else paths.delete(q.queryId);
        }
    } catch {}
    server.send(m);
  });
  server.onMessage((m) => {
    let target = false;
    try {
      const j = JSON.parse(String(m));
      target =
        j.type === 'Transition' &&
        j.modifications.some((q) => paths.get(q.queryId) === 'colloHandoffs:awaitingResponse');
    } catch {}
    if (holdOverview && (target || held.length)) {
      held.push(() => ws.send(m));
      return;
    }
    ws.send(m);
  });
});
try {
  await page.goto('http://127.0.0.1:3407/login');
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('#password').press('Enter');
  await expect(page.locator('.collo-projects')).toBeVisible();
  // Select test workspace through an actual route before entering the project grid.
  await page.goto(`http://127.0.0.1:3407/projects/${f.projectId}?tab=handoffs`);
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(page.getByTestId('project-handoffs')).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
  await page.goto('http://127.0.0.1:3407/projects');
  await page.getByRole('textbox', { name: 'Find a project' }).fill(f.title);
  await page.getByRole('button', { name: 'Preview ' + f.title, exact: true }).click();
  const section = page.getByLabel('Project handoffs awaiting response');
  await expect(
    section.getByRole('link', { name: 'TEST oldest pending A to B', exact: true }),
  ).toBeVisible();
  await expect(
    section.getByRole('link', { name: 'TEST oldest pending B to A', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: out + '/old-pending-found.png' });
  checks.push('Formal overview displays the previously omitted records');
  const added = [];
  for (let i = 0; i < 35; i++) {
    const sender = i % 2 ? f.b : f.a,
      recipient = i % 2 ? f.a : f.b;
    added.push({
      ...(await sender.client.mutation('colloHandoffs:send', {
        projectId: f.projectId,
        recipient: recipient.id,
        requestId: randomUUID(),
        title: `TEST indexed pending ${i + 1} ${randomUUID().slice(0, 6)}`,
        context: 'TEST pagination and reactive status',
        nextSteps: 'Review',
      })),
      sender,
      recipient,
    });
  }
  await expect(
    section.getByText('More handoffs are awaiting response.', { exact: true }),
  ).toBeVisible();
  const first = await query(f.projectId, null, 4);
  assert.equal(first.page.length, 4);
  assert.equal(first.isDone, false);
  const all = [];
  let cursor = null;
  do {
    const result = await query(f.projectId, cursor);
    all.push(...result.page);
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  assert.equal(new Set(all.map((h) => h._id)).size, all.length);
  for (const id of [f.oldPendingId, f.otherRecipientId, ...added.map((h) => h.id)])
    assert.ok(all.some((h) => h._id === id));
  assert.ok(all.every((h) => h.projectId === f.projectId && h.status === 'pending'));
  checks.push(
    'Bounded project/status pagination reaches all 37+ pending records once, across recipients',
  );
  const other = await query(f.otherProjectId);
  assert.equal(other.page.length, 1);
  assert.equal(other.page[0]._id, f.foreignId);
  checks.push('Other project remains isolated');
  await section.getByRole('link', { name: 'View all pending handoffs →', exact: true }).click();
  await expect(page).toHaveURL(/status=pending/);
  await expect(page.locator('.collo-session-row')).toHaveCount(30);
  await page.screenshot({ path: out + '/pending-full-list.png' });
  const last = added.at(-1);
  await last.recipient.client.mutation('colloHandoffs:respond', {
    id: last.id,
    revision: 1,
    status: 'accepted',
  });
  await expect(
    page
      .locator(`.collo-session-row`)
      .filter({ hasText: all.find((h) => h._id === last.id).title }),
  ).toHaveCount(0);
  for (const [index, status] of [
    [33, 'declined'],
    [32, 'cancelled'],
  ]) {
    const h = added[index];
    await (status === 'cancelled' ? h.sender : h.recipient).client.mutation(
      'colloHandoffs:respond',
      { id: h.id, revision: 1, status },
    );
  }
  const changed = await query(f.projectId, null, 30);
  for (const h of added.slice(-3)) assert.ok(!changed.page.some((row) => row._id === h.id));
  checks.push(
    'Accept, decline and cancel remove the same authoritative pending records reactively',
  );
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [960, 720],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const geometry = await inspectOverflow(page, '[data-testid=project-handoffs]');
    const actions = await inspectActions(
      page,
      page
        .locator('[data-testid=project-handoffs] button:enabled,[data-testid=project-handoffs] a')
        .filter({ visible: true }),
    );
    audits.push({ width, height, geometry, actions });
    await page.screenshot({ path: `${out}/pending-${width}.png` });
  }
  await page.setViewportSize({ width: 960, height: 720 });
  const firstRow = page.locator('.collo-session-row').first();
  const fullPeople = await firstRow.locator('.collo-session-summary > span').innerText();
  await firstRow.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.collo-handoff-people')).toBeVisible();
  const people = await page.locator('.collo-handoff-people').innerText();
  for (const person of fullPeople.split(' → ')) assert.ok(people.includes(person));
  const detailGeometry = await inspectOverflow(page, '.collo-handoff-detail');
  assert.deepEqual(detailGeometry.faults, []);
  await page.screenshot({ path: out + '/keyboard-full-participants.png' });
  checks.push(
    'Keyboard activation opens full participant names from the truncated narrow row; title alone is not counted as proof',
  );
  // A personal project owned by B is not visible to A, including the new filter.
  const privateProject = await f.b.client.mutation('projects:webCreate', {
    title: 'TEST indexed permission boundary ' + randomUUID().slice(0, 8),
    workspace: 'personal',
  });
  await assert.rejects(() => query(privateProject.id));
  await assert.rejects(() =>
    f.a.client.query('colloHandoffs:awaitingResponse', { projectId: privateProject.id }),
  );
  checks.push('Existing project authorization rejects both indexed queries across ownership');
  for (const h of added.slice(0, -3))
    await h.sender.client.mutation('colloHandoffs:respond', {
      id: h.id,
      revision: 1,
      status: 'cancelled',
    });
  const emptyTitle = 'TEST empty pending ' + randomUUID().slice(0, 8);
  const empty = await f.a.client.mutation('projects:webCreate', {
    title: emptyTitle,
    workspace: 'team',
    team_id: f.teamId,
  });
  await page.goto('http://127.0.0.1:3407/projects');
  holdOverview = true;
  await page.getByRole('textbox', { name: 'Find a project' }).fill(emptyTitle);
  await expect(page.locator('.collo-project-overview h2')).toHaveText(emptyTitle);
  await expect(section.getByText('Loading pending handoffs…', { exact: true })).toBeVisible();
  await page.screenshot({ path: out + '/pending-loading.png' });
  await expect.poll(() => held.length).toBeGreaterThan(0);
  holdOverview = false;
  for (const release of held.splice(0)) release();
  await expect(section.getByText('No handoffs awaiting response.', { exact: true })).toBeVisible();
  assert.deepEqual(
    await f.a.client.query('colloHandoffs:awaitingResponse', { projectId: empty.id }),
    { page: [], hasMore: false },
  );
  await page.screenshot({ path: out + '/pending-empty.png' });
  checks.push(
    'Formal initial loading with held response is distinct from confirmed empty project; real empty query has hasMore false',
  );
  console.log(checks.map((c) => 'PASS ' + c).join('\n'));
} finally {
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify({ evidence: 'Real local backend and formal page', checks, audits }, null, 2),
  );
  const video = page.video();
  await context.close();
  await video.saveAs(out + '/pending.webm');
  await browser.close();
}
assert.ok(
  audits.every((a) => !a.geometry.faults.length && !a.actions.faults.length),
  'Inspect pending-page geometry/action evidence',
);
