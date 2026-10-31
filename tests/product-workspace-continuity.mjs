import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, workspaceFixture, eventually } from './product-workspace-data.mjs';
const expect = baseExpect.configure({ timeout: 20000 });
const f = await workspaceFixture();
const out = process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/workspace-polish/evidence/continuity';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const auth = await browser.newContext();
const login = await auth.newPage();
await login.goto('http://127.0.0.1:3407/login');
await login.locator('#email').fill(account.a.email);
await login.locator('#password').fill(account.a.password);
await login.locator('form button[type=submit]').click();
await login.waitForURL(u => u.pathname === '/projects');
await expect(login.locator('.collo-projects')).toBeVisible();
const state = await auth.storageState({ indexedDB: true });
await auth.close();
const context = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'], recordVideo: { dir: '.local/workspace-flow-videos', size: { width: 1440, height: 900 } } });
const profile = JSON.parse(await fs.readFile('docs/product-ui/workspace-polish/evidence/actual-profile.json', 'utf8'));
await context.addInitScript(p => {
  if (location.origin !== 'http://127.0.0.1:3407') return;
  localStorage.setItem('collosys.appearance.v1', JSON.stringify(p.appearance));
  localStorage.setItem('collo.boot.nav', JSON.stringify(p.sidebar));
}, profile);
const checks = [], styles = [], errors = [];
let page = await context.newPage();
context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
page.on('pageerror', e => errors.push(e.message));
const check = s => { checks.push(s); console.log('PASS', s); };
const tab = name => page.locator('.collo-project-tools').getByRole('button', { name, exact: true });
const diff = () => page.locator('.collo-checkpoint-diff');
const fileRow = name => diff().locator(`button[data-diff-file="${name}"]`);
async function go(tabName) {
  await page.goto(`http://127.0.0.1:3407/projects/${f.projectId}?tab=${tabName}#pair=${encodeURIComponent(f.pairing)}`);
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible()) await page.locator('[data-foreign-switch]').click();
    await expect(tabName === 'tasks' ? page.getByText('TEST 工作区评论 · 完整操作与返回位置', { exact: true }) : page.getByTestId('local-workspaces')).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 60000 });
}
async function shot(name) {
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity).length)).toBe(0);
  await page.screenshot({ path: `${out}/${name}.png` });
}
async function file(name, content) {
  await fileRow(name).click();
  await expect(fileRow(name)).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => diff().locator('diffs-container').evaluateAll(els => els.map(e => e.shadowRoot?.textContent ?? '').join('\n'))).toContain(content);
}
async function line() {
  return diff().evaluate(root => {
    const scroller = root.querySelector('[data-follow-diff-scroll]'), top = scroller.getBoundingClientRect().top;
    for (const host of root.querySelectorAll('diffs-container'))
      for (const row of host.shadowRoot?.querySelectorAll('[data-code] [data-line]') ?? [])
        if (row.getBoundingClientRect().bottom > top + 8) return Number(row.dataset.line);
    return null;
  });
}
async function style(label, locator) {
  const value = await locator.evaluate((el, label) => {
    const face = el.querySelector('.collo-trigger-face,.collo-button-face') ?? el;
    const s = getComputedStyle(face), icon = el.querySelector('svg');
    return { label, height: el.getBoundingClientRect().height, font: s.font,
      fontFamily: s.fontFamily, fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight,
      radius: s.borderRadius, padding: s.padding, icon: icon ? { width: icon.getBoundingClientRect().width, height: icon.getBoundingClientRect().height } : null,
      color: s.color, background: s.backgroundColor };
  }, label);
  styles.push(value);
  assert.equal(value.height, label === 'post comment' ? 36 : 32, label);
  assert.equal(value.fontSize, ['file row', 'post comment'].includes(label) ? '14px' : '13px', label);
  assert.equal(value.lineHeight, ['file row', 'post comment'].includes(label) ? '20px' : '18px', label);
  assert.match(value.fontFamily, /Google Sans/);
}
let firstVideo, secondVideo;
try {
  await go('workspaces');
  const eventPage = await f.a.client.query('collo:feed', { projectId: f.projectId, paginationOpts: { numItems: 50, cursor: null } });
  const message = eventPage.page.find(e => e.kind === 'agent.message' && e.payload.sessionId === f.sessions[0]) ?? eventPage.page.find(e => e.kind !== 'checkpoint');
  assert.ok(message);
  await page.getByLabel('Filter activity by member').selectOption(message.actor.id);
  await page.locator(`[data-event-id="${message.id}"]`).click();
  await page.getByRole('button', { name: 'Open conversation', exact: true }).click();
  if (message.payload.sessionId !== f.sessions[0]) {
    await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
    await page.locator(`[data-captured-session="${f.sessions[0]}"]`).click();
  }
  const reader = () => page.getByTestId('captured-conversation').filter({ visible: true });
  for (let i = 0; i < 2; i++) {
    await reader().getByRole('button', { name: 'Load next messages', exact: true }).click();
    await expect(reader().getByRole('button', { name: 'Load next messages', exact: true })).toBeEnabled();
  }
  await reader().locator('[data-sv-feed]').evaluate(el => { el.scrollTop = 1600; });
  const code = reader().locator('.code-block-resizable').first();
  await code.hover();
  await code.getByTitle('Expand to full width', { exact: true }).click();
  const expandedGeometry = await page.evaluate(() => ({ shellScroll: document.querySelector('.collo-shell').scrollLeft, feedLeft: document.querySelector('[data-testid=captured-conversation] [data-sv-feed]').getBoundingClientRect().left }));
  assert.equal(expandedGeometry.shellScroll, 0);
  assert.ok(expandedGeometry.feedLeft >= 0);
  const anchor = await code.locator('xpath=ancestor::*[@data-reading-message][1]').getAttribute('data-reading-message');
  await shot('session-expanded-iris');
  await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  await page.locator(`[data-captured-session="${f.sessions[1]}"]`).click();
  await expect(reader()).toContainText('TEST SESSION B');
  await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  await page.locator(`[data-captured-session="${f.sessions[0]}"]`).click();
  await expect(reader().locator(`[data-reading-message="${anchor}"]`).getByTitle('Collapse', { exact: true })).toBeVisible();
  check('Session A -> B -> A retains acquired pages, visible code expansion and message identity');
  await reader().getByRole('button', { name: 'Load next messages', exact: true }).click();
  await expect(reader().getByRole('button', { name: 'Load next messages', exact: true })).toHaveCount(0);
  await reader().locator('[data-sv-feed]').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(reader()).toContainText('TEST SESSION A MESSAGE 65');
  check('All 65 captured messages remain reachable through actual pagination and virtual scrolling');
  await tab('Activity').click();
  await page.getByRole('button', { name: 'Team activity', exact: true }).click();
  await expect(page.getByLabel('Filter activity by member')).toHaveValue(message.actor.id);
  await page.locator(`[data-event-id="${f.eventId}"]`).click();
  await expect(diff()).toBeVisible();
  if (await page.getByRole('button', { name: 'Split', exact: true }).count()) await page.getByRole('button', { name: 'Split', exact: true }).click();
  await file('one/same.ts', 'TEST one/same.ts');
  await page.getByRole('button', { name: 'Back to activity', exact: true }).click();
  await tab('Conversations').click();
  await expect(reader()).toBeVisible();
  await expect(reader()).toContainText('TEST SESSION A MESSAGE 65');
  await shot('activity-session-file-return');
  check('Real activity -> captured session -> checkpoint file -> session return preserves the current project and acquired message range');
  firstVideo = page.video();
  await page.close();
  page = await context.newPage();
  await go('workspaces&workspaceView=history');
  const cp = page.locator(`[data-local-checkpoint="${f.checkpointId}"]`);
  await cp.getByRole('button', { name: 'Review changes', exact: true }).click();
  await expect(page.getByTestId('checkpoint-completeness')).toContainText('32 of 32');
  await expect(diff().locator('button[data-diff-file]')).toHaveCount(32);
  await file('long.ts', 'line260');
  const scroller = diff().locator('[data-follow-diff-scroll]');
  await scroller.evaluate(el => { el.scrollTop = 2400; });
  await page.waitForTimeout(200);
  const originalLine = await line();
  assert.ok(originalLine > 30, String(originalLine));
  await file('one/same.ts', 'TEST one/same.ts');
  await file('two/same.ts', 'TEST two/same.ts');
  await page.getByRole('button', { name: 'Copy file path', exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'two/same.ts');
  await file('long.ts', 'line260');
  await expect.poll(line).toBeGreaterThan(originalLine - 4);
  await expect.poll(line).toBeLessThan(originalLine + 4);
  check('32 real files: independent same-basename identity, full path copy and per-file line restoration');
  await page.getByRole('button', { name: 'Unified', exact: true }).click();
  await expect.poll(line).toBeGreaterThan(originalLine - 4);
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect.poll(line).toBeLessThan(originalLine + 4);
  for (const width of [1280, 960, 1920, 1440]) {
    await page.setViewportSize({ width, height: width === 960 ? 720 : width === 1280 ? 800 : 900 });
    await expect.poll(line).toBeGreaterThan(originalLine - 8);
    await expect.poll(line).toBeLessThan(originalLine + 8);
    const title = page.locator('.collo-project-title h1');
    await expect(title).toHaveAttribute('title', /LongProjectTitleWithoutSpaces/);
    assert.equal(await title.evaluate(el => getComputedStyle(el).overflow), 'hidden');
    const titleBox = await title.boundingBox(), triggerBox = await page.getByRole('button', { name: 'Project details', exact: true }).boundingBox();
    assert.ok(titleBox.x + titleBox.width <= triggerBox.x, 'Title stays within its axis before the property control');
    await shot(`diff-${width}-iris`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  check('Diff line anchor survives unified/split and 1280, 960, 1920, 1440 resizing');
  // No waiting between targets: all actions are real pointer clicks.
  for (const name of ['one/same.ts', 'two/same.ts', 'file-03.ts']) await fileRow(name).click();
  await expect(fileRow('file-03.ts')).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => diff().locator('diffs-container').evaluateAll(els => els.map(e => e.shadowRoot?.textContent).join(''))).toContain('TEST file-03.ts');
  await page.waitForTimeout(400);
  await expect(fileRow('file-03.ts')).toHaveAttribute('aria-current', 'true');
  for (const [name, text] of [['binary.bin', 'Binary file'], ['large.txt', 'Shared diff truncated'], ['excluded.txt', 'No longer shared']]) {
    await fileRow(name).click();
    await expect(diff()).toContainText(text);
  }
  await file('new-name.txt', 'TEST rename retains bytes');
  await file('old-name.txt', 'TEST rename retains bytes');
  check('Rapid A/B/C keeps C; binary, oversized unavailable diff, excluded content and rename delete/add are explicit');
  await file('long.ts', 'line260');
  await style('file row', fileRow('long.ts'));
  await style('copy path', page.getByRole('button', { name: 'Copy file path', exact: true }));
  await page.getByRole('button', { name: 'Back to history', exact: true }).click();
  await expect(cp).toBeVisible();
  await cp.getByRole('button', { name: 'Review changes', exact: true }).click();
  await expect(fileRow('long.ts')).toHaveAttribute('aria-current', 'true');
  await shot('history-diff-return');
  check('Local history opens the real shared Diff and returns to the same history; checkpoint/file selection survives reopening');
  secondVideo = page.video();
  await page.close();
  page = await context.newPage();
  await go('tasks');
  await page.getByText('TEST 工作区评论 · 完整操作与返回位置', { exact: true }).click();
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  const draft = 'TEST unsent comment survives returning to this task ' + Date.now();
  await page.getByPlaceholder('Leave a comment...').fill(draft);
  await style('post comment', page.getByRole('button', { name: 'Post comment', exact: true }));
  await page.getByTitle('Close (Esc)', { exact: true }).click();
  await expect(page.getByTitle('Close (Esc)', { exact: true })).toHaveCount(0);
  await expect(page.locator('.collo-project-tools')).toBeVisible();
  await page.getByText('TEST 工作区评论 · 完整操作与返回位置', { exact: true }).click();
  await expect(page.getByPlaceholder('Leave a comment...')).toHaveValue(draft);
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await eventually(async () => {
    const task = await f.a.client.query('tasks:webGet', { id: f.taskId });
    assert.ok(task.comments.some(c => c.text === draft));
  });
  await expect(page.getByText(draft, { exact: true })).toBeVisible();
  await shot('task-comment-persisted');
  check('Unsent task comment survives close/reopen; sending uses the actual persisted task mutation');
  await page.getByTitle('Close (Esc)', { exact: true }).click();
  await expect(page.getByTitle('Close (Esc)', { exact: true })).toHaveCount(0);
  await page.locator('.cq-tabs-compact .collo-list-trigger').click();
  await page.locator('.collo-preset-menu[data-state=open]').getByRole('menuitemradio', { name: /^All\b/ }).click();
  await page.getByTitle('Display options', { exact: true }).click();
  const panel = page.locator('.collo-display-panel[data-state=open]');
  await panel.getByRole('button', { name: /^Grouping:/ }).click();
  await page.locator('.collo-setting-menu[aria-label=Grouping]').getByRole('menuitemradio', { name: 'Assignee', exact: true }).click();
  await panel.getByRole('button', { name: /^Sorting:/ }).click();
  await page.locator('.collo-setting-menu[aria-label=Sorting]').getByRole('menuitemradio', { name: 'Title', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByText('TEST 工作区评论 · 完整操作与返回位置', { exact: true }).click();
  await page.getByTitle('Close (Esc)', { exact: true }).click();
  await expect(page.getByTitle('Close (Esc)', { exact: true })).toHaveCount(0);
  await page.getByTitle('Display options', { exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Grouping: Assignee', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Sorting: Title', exact: true })).toBeVisible();
  await expect(page.locator('.cq-tabs-compact .collo-list-trigger')).toHaveAttribute('aria-label', 'All');
  check('Non-default All preset, Assignee grouping and Title sorting remain selected after task detail and return');
  await panel.getByRole('button', { name: 'Board', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByText('TEST 工作区评论 · 完整操作与返回位置', { exact: true }).click();
  assert.match(new URL(page.url()).pathname, /^\/projects\/[^/]+\/[^/]+$/);
  await page.getByTitle('Close (Esc)', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTitle('Close (Esc)', { exact: true })).toHaveCount(0);
  await expect(page.locator('.collo-project-tools')).toBeVisible();
  await page.getByTitle('Display options', { exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Board', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'List', exact: true }).click();
  check('Project Board card and keyboard return retain the same project and Board setting');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Project details', exact: true }).click();
  await style('project property trigger', page.getByRole('button', { name: 'Project details', exact: true }));
  await shot('project-details-iris');
  await page.locator('[data-project-pick=status]').click();
  await page.getByRole('radio', { name: 'Planning', exact: true }).check();
  await eventually(async () => assert.equal((await f.a.client.query('collo:projectByRef', { reference: f.projectId })).status, 'planning'));
  await page.locator('[data-project-pick=status]').click();
  await page.getByRole('radio', { name: 'Active', exact: true }).check();
  await eventually(async () => assert.equal((await f.a.client.query('collo:projectByRef', { reference: f.projectId })).status, 'active'));
  check('Project details nested status control writes through the real project store/backend');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Project details', exact: true })).toBeFocused();
  for (const [mode, accent] of [['Light', 'Forest'], ['Dark', 'Iris']]) {
    await page.locator('.collo-settings-button').click();
    await page.getByRole('button', { name: 'Profile & appearance', exact: true }).click();
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.getByRole('group', { name: 'Application accent' }).getByRole('button', { name: accent, exact: true }).click();
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    await page.getByRole('button', { name: 'Project details', exact: true }).click();
    await shot(`project-details-${mode.toLowerCase()}-${accent.toLowerCase()}`);
    await page.keyboard.press('Escape');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Project details', exact: true }).click();
  assert.equal(await page.locator('.collo-project-property-menu').evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length), 0);
  await page.keyboard.press('Escape');
  await page.locator('.collo-settings-button').click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('collosys.appearance.v1'))), profile.appearance);
  check('Real appearance controls cover Forest/light, Iris/dark and reduced motion; isolated profile returns to original Iris/light');
  await page.close();
  let holdMessages = false, delayed = false;
  const pending = [], releases = [];
  await context.routeWebSocket(/127\.0\.0\.1:3408/, ws => {
    const server = ws.connectToServer(), paths = new Map();
    ws.onMessage(message => {
      try {
        const m = JSON.parse(String(message));
        if (m.type === 'ModifyQuerySet') for (const x of m.modifications) {
          if (x.type === 'Add') paths.set(x.queryId, x.udfPath);
        }
      } catch {}
      server.send(message);
    });
    server.onMessage(message => {
      try {
        const m = JSON.parse(String(message));
        if (holdMessages && m.type === 'Transition' && m.modifications.some(x => paths.get(x.queryId) === 'colloSessions:messages')) delayed = true;
      } catch {}
      // Preserve ordered Convex transitions; release the old result only after
      // the user selected B. No fabricated query data or reordered protocol.
      if (delayed) pending.push(() => ws.send(message));
      else ws.send(message);
    });
    releases.push(() => { holdMessages = false; delayed = false; for (const send of pending.splice(0)) send(); });
  });
  page = await context.newPage();
  await page.goto(`http://127.0.0.1:3407/projects/${f.projectId}?tab=sessions`);
  await expect(page.locator(`[data-captured-session="${f.sessions[0]}"]`)).toBeVisible();
  holdMessages = true;
  await page.locator(`[data-captured-session="${f.sessions[0]}"]`).click();
  await expect.poll(() => pending.length).toBeGreaterThan(0);
  await page.locator('.collo-detail-surface[data-phase=open]').focus();
  await page.keyboard.press('Escape');
  await page.locator(`[data-captured-session="${f.sessions[1]}"]`).click();
  for (const release of releases) release();
  await expect(reader()).toContainText('TEST SESSION B');
  await expect(reader()).not.toContainText('TEST SESSION A');
  await page.waitForTimeout(250);
  assert.equal(new URL(page.url()).searchParams.get('session'), f.sessions[1]);
  check('A real delayed session A response released after selecting B cannot replace B');
  assert.deepEqual(errors, []);
  await fs.writeFile(`${out}/results.json`, JSON.stringify({ passed: true, checks, styles, errors, build: await page.evaluate(() => fetch('/collo-build.json').then(r => r.json())) }, null, 2));
} catch (error) {
  await shot('failure').catch(() => {});
  await fs.writeFile(`${out}/failure.json`, JSON.stringify({ message: String(error), checks, errors, url: page.url(), text: await page.locator('body').innerText().catch(() => '') }, null, 2));
  throw error;
} finally {
  await context.close();
  if (firstVideo) await firstVideo.saveAs(`${out}/activity-session-file-return.webm`);
  if (secondVideo) await secondVideo.saveAs(`${out}/history-diff-file-return.webm`);
  await browser.close();
}
