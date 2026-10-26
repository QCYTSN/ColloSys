// Run against an already running product after a completed real acceptance:
// node tests/codecast-agent-preview-audit.mjs .local/codecast-app/acceptance-...
// Only network delivery is delayed. Preview/connect responses, accounts,
// connector state, captures and excluded events come from the real services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';

const source = path.resolve(process.argv[2] || '');
const sourceRelative = path.relative(path.resolve('.local/codecast-app'), source);
assert.match(sourceRelative, /^acceptance-[^\\/]+$/, 'Pass one completed local Codecast acceptance folder');
assert.equal(JSON.parse(await fs.readFile(path.join(source, 'result.json'), 'utf8')).passed, true);
const fixture = JSON.parse(await fs.readFile(path.join(source, 'restart-test.json'), 'utf8'));
const rootA = path.resolve(fixture.rootA);
const rootRelative = path.relative(source, rootA);
assert.ok(rootRelative && !rootRelative.startsWith('..') && !path.isAbsolute(rootRelative), 'Only the completed acceptance rootA may be edited');
const origin = 'http://127.0.0.1:3407';
const pairing = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
const evidence = path.resolve(`.local/codecast-app/agent-preview-audit-${Date.now()}-${randomUUID().slice(0, 8)}`);
await fs.mkdir(evidence, { recursive: true });
const logA = path.join(evidence, 'TEST-source-A.jsonl');
const logB = path.join(evidence, 'TEST-source-B.jsonl');
const binaryName = `TEST-excluded-binary-${randomUUID()}.bin`;
const binaryPath = path.join(rootA, binaryName);
const checks = [], errors = [], externalRequests = [];
let browser, connector, priorSource, sourceChanged = false, binaryCreated = false;
let releasePreview = () => {}, releaseConnect = () => {};
const client = new ConvexHttpClient('http://127.0.0.1:3408');
let token;

async function check(name, action) {
  await action();
  checks.push(name);
  console.log('PASS ' + name);
}
async function eventually(action, timeout = 45000) {
  const end = Date.now() + timeout;
  let error;
  do {
    try { return await action(); } catch (e) { error = e; }
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < end);
  throw error;
}
async function local(route, body, endpoint = 'http://127.0.0.1:3411') {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname));
  const response = await fetch(endpoint + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-ColloSys-Pairing': pairing, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(125000),
  });
  const data = await response.json();
  assert.equal(response.status, 200, `${route}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
function logText(sessionId, count) {
  return [
    { type: 'session_meta', payload: { id: sessionId, cwd: rootA } },
    { type: 'turn_context', payload: { cwd: rootA } },
    ...Array.from({ length: count }, (_, i) => ({ type: 'response_item', timestamp: new Date().toISOString(), payload: {
      type: 'message', role: i % 2 ? 'assistant' : 'user', ...(i % 2 ? { channel: 'final' } : {}),
      content: [{ type: i % 2 ? 'output_text' : 'input_text', text: `TEST preview binding ${sessionId} message ${i}` }],
    } })),
  ].map(row => JSON.stringify(row)).join('\n') + '\n';
}

try {
  const auth = await client.action('auth:signIn', { provider: 'password', params: { ...fixture.a, flow: 'signIn' } });
  token = auth.tokens.token;
  client.setAuth(token);
  connector = (await local('/api/connectors')).connectors.find(row => row.workspaceId === fixture.workspaceA);
  assert.ok(connector?.running, 'Start the existing acceptance A directory before this audit');
  assert.equal(path.resolve(connector.root), rootA);
  priorSource = (await local('/api/status', undefined, connector.url)).agent.source;
  await fs.writeFile(logA, logText(`TEST-A-${randomUUID()}`, 2), { flag: 'wx' });
  await fs.writeFile(logB, logText(`TEST-B-${randomUUID()}`, 4), { flag: 'wx' });

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
    externalRequests.push(url.origin);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  const workbench = `${origin}/projects/${fixture.projectId}?tab=workspaces`;
  await check('Existing A account signs in through the original product login and selects its real directory', async () => {
    await page.goto(`${origin}/login?return_to=${encodeURIComponent(`/projects/${fixture.projectId}?tab=workspaces`)}#pair=${pairing}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.locator('#email').fill(fixture.a.email);
    await page.locator('#password').fill(fixture.a.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(url => url.pathname !== '/login', { timeout: 60000 });
    await page.goto(workbench, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('[data-testid="local-workspaces"]') || document.querySelector('[data-foreign-switch]'));
    if (await page.locator('[data-foreign-switch]').isVisible()) {
      await page.locator('[data-foreign-switch]').click();
      await page.goto(workbench, { waitUntil: 'domcontentloaded' });
    }
    await page.getByTestId('local-workspaces').waitFor();
    await expect(page.getByLabel('Your local directory')).toContainText(connector.label);
    await page.getByLabel('Your local directory').selectOption(fixture.workspaceA);
    const summary = page.locator('summary').filter({ hasText: 'This directory' });
    if (!(await summary.evaluate(element => element.parentElement.open))) await summary.click();
    await page.getByRole('button', { name: 'Connect Codex log', exact: true }).click();
  });
  const dialog = page.getByRole('dialog', { name: 'Connect a Codex log', exact: true });
  const input = dialog.getByLabel('Codex log path');
  const history = dialog.getByRole('checkbox', { name: 'Also share existing messages' });
  let previewRequests = 0;
  let heldPreviewSummary;
  const previewGate = new Promise(resolve => { releasePreview = resolve; });
  await page.route(connector.url + '/api/agent/preview', async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    previewRequests++;
    const data = await response.json();
    if (previewRequests === 1) {
      assert.equal(route.request().postDataJSON().path, logA);
      assert.equal(data.userMessages + data.assistantMessages, 2);
      heldPreviewSummary = data;
      await previewGate; // TEST NETWORK DELAY: return unchanged real server bytes later
    }
    await route.fulfill({ response });
  });
  await check('Real preview A response is delayed while editable source/consent controls are locked', async () => {
    await input.fill(logA);
    await dialog.getByRole('button', { name: 'Preview log', exact: true }).click();
    await eventually(async () => assert.ok(heldPreviewSummary));
    await expect(input).toBeDisabled();
    if (await history.count()) await expect(history).toBeDisabled();
    else assert.equal(await history.count(), 0, 'History consent is absent before any preview exists');
    await page.screenshot({ path: path.join(evidence, 'real-preview-response-delayed.png') });
    releasePreview();
    await expect(dialog.getByText('2 messages available', { exact: true })).toBeVisible();
    await expect(input).toBeEnabled();
  });
  await check('Editing the path invalidates preview A; real preview B reports its own distinct message count', async () => {
    await input.fill(logB);
    await expect(dialog.getByText('2 messages available', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Connect and share messages', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Preview log', exact: true }).click();
    await expect(dialog.getByText('4 messages available', { exact: true })).toBeVisible();
    await history.check();
    await page.screenshot({ path: path.join(evidence, 'real-preview-B.png') });
  });
  const connectGate = new Promise(resolve => { releaseConnect = resolve; });
  let heldConnect = false;
  await page.route(connector.url + '/api/agent/connect', async route => {
    const body = route.request().postDataJSON();
    assert.equal(body.path, logB);
    assert.equal(body.importHistory, true);
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    sourceChanged = true;
    heldConnect = true;
    await connectGate; // TEST NETWORK DELAY: the real connector already persisted this source
    await route.fulfill({ response });
  });
  await check('Confirming B locks the history option and the real connector persists exactly source B', async () => {
    await dialog.getByRole('button', { name: 'Connect and share messages', exact: true }).click();
    await eventually(async () => assert.ok(heldConnect));
    await expect(input).toBeDisabled();
    await expect(history).toBeDisabled();
    assert.equal((await local('/api/status', undefined, connector.url)).agent.source, logB);
    releaseConnect();
    await dialog.waitFor({ state: 'hidden' });
    await page.unroute(connector.url + '/api/agent/connect');
    await page.unroute(connector.url + '/api/agent/preview');
  });

  await check('A real binary leaving capture scope says its current bytes were not captured', async () => {
    await fs.writeFile(binaryPath, Buffer.from([0, 1, 255, 128]), { flag: 'wx' });
    binaryCreated = true;
    await local('/api/capture', {}, connector.url);
    await fs.writeFile(binaryPath, Buffer.alloc(2 * 1024 * 1024 + 1));
    await local('/api/capture', {}, connector.url);
    let cursor = 0;
    let excluded;
    await eventually(async () => {
      for (let pages = 0; pages < 500; pages++) {
        const result = await client.query('collo:replay', { projectId: fixture.projectId, after: cursor });
        excluded ??= result.events.find(event => event.workspaceId === fixture.workspaceA && event.kind === 'checkpoint' && event.payload.files.some(file => file.path === binaryName && file.status === 'excluded' && file.binary));
        if (result.hasMore) assert.ok(result.cursor > cursor, 'Real replay cursor must advance');
        cursor = result.cursor;
        if (!result.hasMore) break;
        assert.notEqual(pages, 499, 'Replay exceeded bounded audit pagination');
      }
      assert.ok(excluded, 'The real backend must persist the binary exclusion event');
    });
    await page.goto(workbench + '&event=' + encodeURIComponent(excluded.id), { waitUntil: 'domcontentloaded' });
    const section = page.getByTestId('collaboration-detail').locator('section').filter({ hasText: binaryName });
    await expect(section).toBeVisible();
    await expect(section).toContainText('Current content was not captured');
    assert.doesNotMatch(await section.innerText(), /content retained|backed up|recoverable|captured locally when created/i);
    await page.screenshot({ path: path.join(evidence, 'binary-current-bytes-not-captured.png') });
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
} catch (error) {
  process.exitCode = 1;
  errors.push(error.message);
  await browser?.contexts()[0]?.pages()[0]?.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  releasePreview();
  releaseConnect();
  await browser?.close();
  if (sourceChanged && connector) {
    try {
      if (priorSource) await local('/api/agent/connect', { path: priorSource, importHistory: false, confirmed: true }, connector.url);
      else await local('/api/agent/disconnect', {}, connector.url);
    } catch (error) { errors.push('Restoring the previous test log source failed: ' + error.message); process.exitCode = 1; }
  }
  if (binaryCreated) await fs.unlink(binaryPath).catch(error => { errors.push('Removing the unique TEST binary failed: ' + error.message); process.exitCode = 1; });
  await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify({
    passed: !process.exitCode, checks, errors, externalRequests,
    networkDelay: 'Real preview/connect responses were fetched first; only browser delivery was delayed.',
    source, workspaceA: fixture.workspaceA, logA, logB, binaryName, at: new Date().toISOString(),
  }, null, 2));
  console.log('Evidence: ' + evidence);
}
