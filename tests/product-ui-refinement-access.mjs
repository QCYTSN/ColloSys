// Real permission changes on the isolated TEST team; no production membership changes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, denseFixture } from './product-ui-refinement-data.mjs';
const expect = baseExpect.configure({ timeout: 30000 });
const fixture = await denseFixture();
const team = await fixture.a.client.query('teams:getTeam', { team_id: fixture.teamId });
const roster = await fixture.a.client.query('teams:getTeamMembers', { team_id: fixture.teamId });
if (!roster.some((m) => m.email === account.b.email))
  await fixture.b.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: '.local/refinement-access-video' },
});
const page = await context.newPage();
const out = 'docs/product-ui/refinement/access';
await fs.mkdir(out, { recursive: true });
const checks = [];
let removed = false;
async function login(p, credentials) {
  await p.goto('http://127.0.0.1:3407/login');
  await p.locator('#email').fill(credentials.email);
  await p.locator('#password').fill(credentials.password);
  await p.locator('form button[type=submit]').click();
  await p.waitForURL((u) => u.pathname === '/projects');
}
async function project(p, tab) {
  await p.goto(`http://127.0.0.1:3407/projects/${fixture.projectId}?${tab}`);
  await expect(async () => {
    if (await p.locator('[data-foreign-switch]').isVisible())
      await p.locator('[data-foreign-switch]').click();
    await expect(p.locator('.collo-project-tools')).toBeVisible({ timeout: 500 });
    assert.equal(await p.locator('[data-foreign-switch]').count(), 0);
  }).toPass({ timeout: 60000 });
}
try {
  await login(page, account.b);
  await project(page, `tab=sessions&workspace=${fixture.workspaceId}&session=${fixture.sessionId}`);
  await expect(page.getByTestId('captured-conversation')).toBeVisible();
  await page.locator('[data-sv-feed]').evaluate((e) => {
    e.scrollTop = 700;
  });
  const draft = await context.newPage();
  await project(draft, 'tab=handoffs');
  await draft.getByRole('button', { name: 'New handoff', exact: true }).click();
  await draft.getByLabel('Title', { exact: true }).fill('TEST PRIVATE UNSENT DRAFT');
  const members = await fixture.a.client.query('teams:getTeamMembers', { team_id: fixture.teamId });
  const member = members.find((m) => m.email === account.b.email);
  assert.ok(member);
  await fixture.a.client.mutation('teams:removeMember', {
    team_id: fixture.teamId,
    member_user_id: member._id,
  });
  removed = true;
  await assert.rejects(
    fixture.b.client.query('colloSessions:messages', {
      projectId: fixture.projectId,
      workspaceId: fixture.workspaceId,
      sessionId: fixture.sessionId,
      after: 0,
    }),
    /access denied/i,
  );
  for (const p of [page, draft]) {
    await expect(p.getByTestId('captured-conversation')).toHaveCount(0);
    await expect(p.getByRole('dialog', { name: 'New handoff' })).toHaveCount(0);
    await expect(async () =>
      assert.equal(
        await p.evaluate(
          (id) =>
            Object.keys(window.__inboxStore.getState().colloViewState).filter((k) =>
              k.includes(':' + id + ':'),
            ).length,
          fixture.projectId,
        ),
        0,
      ),
    ).toPass({ timeout: 30000 });
    assert.equal(await p.locator('.collo-detail-surface[data-phase=closing]').count(), 0);
  }
  await page.screenshot({ path: out + '/revoked-reader.png' });
  await draft.screenshot({ path: out + '/revoked-draft.png' });
  checks.push('Revocation removes the real reader, open draft and scoped UI hints in both windows');
  await fixture.b.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
  removed = false;
  await expect(async () => {
    if (await page.getByTestId('captured-conversation').isVisible()) return;
    const retry = page.getByRole('button', { name: 'Retry', exact: true }).first();
    if (await retry.isVisible()) await retry.click({ timeout: 1000 }).catch(() => {});
    const row = page.locator(`[data-captured-session="${fixture.sessionId}"]`);
    if (await row.isVisible()) await row.click({ timeout: 1000 }).catch(() => {});
    await expect(page.getByTestId('captured-conversation')).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 30000 });
  checks.push('Restored membership can retry and read through a fresh authorized query');
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
  await expect(async () => {
    if (!(await signOut.isVisible()))
      await page.getByRole('button', { name: 'User menu', exact: true }).click();
    await expect(signOut).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15000 });
  await signOut.click();
  await page.waitForURL((u) => u.pathname === '/login');
  assert.equal(await page.getByTestId('captured-conversation').count(), 0);
  await login(page, account.a);
  await expect(async () => {
    await expect(page.locator('.collo-projects')).toBeVisible({ timeout: 1000 });
    assert.equal(
      await page.evaluate(() => Object.keys(window.__inboxStore.getState().colloViewState).length),
      0,
    );
  }).toPass({ timeout: 30000 });
  checks.push('Sign-out and account switch do not retain reader position or unsent draft');
  await fs.writeFile(out + '/results.json', JSON.stringify({ passed: true, checks }, null, 2));
  console.log(checks.map((s) => 'PASS ' + s).join('\n'));
} catch (e) {
  await page.screenshot({ path: out + '/failure.png' });
  throw e;
} finally {
  if (removed) await fixture.b.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
  await context.close();
  await page.video()?.saveAs(out + '/permission-continuity.webm');
  await browser.close();
}
