// Real local services; delay delivery of one unchanged response to test ordering.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';

const source = path.resolve(process.argv[2] || '');
assert.match(path.relative(path.resolve('.local/codecast-app'), source), /^acceptance-[^\\/]+$/);
assert.equal(JSON.parse(await fs.readFile(path.join(source, 'result.json'), 'utf8')).passed, true);
const fixture = JSON.parse(await fs.readFile(path.join(source, 'restart-test.json'), 'utf8'));
const relativeRoot = path.relative(source, path.resolve(fixture.rootA));
assert.ok(relativeRoot && !relativeRoot.startsWith('..') && !path.isAbsolute(relativeRoot));
const evidence = path.resolve(`.local/codecast-app/cost-audit-${Date.now()}`);
await fs.mkdir(evidence, { recursive: true });
const checks = [],
  errors = [],
  observations = {};
const client = new ConvexHttpClient('http://127.0.0.1:3408');
const auth = await client.action('auth:signIn', {
  provider: 'password',
  params: { ...fixture.a, flow: 'signIn' },
});
const pair = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
async function local(route, body, endpoint = 'http://127.0.0.1:3411') {
  assert.equal(new URL(endpoint).hostname, '127.0.0.1');
  const response = await fetch(endpoint + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${auth.tokens.token}`,
      'X-ColloSys-Pairing': pair,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function eventually(action) {
  let failure;
  for (let i = 0; i < 100; i++) {
    try {
      return await action();
    } catch (error) {
      failure = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw failure;
}
let browser,
  release = () => {},
  created = false;
const file = path.join(fixture.rootA, `TEST-cost-${randomUUID()}.txt`);
try {
  const connector = (await local('/api/connectors')).connectors.find(
    (c) => c.workspaceId === fixture.workspaceA,
  );
  assert.ok(connector?.running);
  await eventually(async () =>
    assert.equal((await local('/api/status', undefined, connector.url)).pending, 0),
  );
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const route = `/projects/${fixture.projectId}?tab=workspaces`;
  await page.goto(
    `http://127.0.0.1:3407/login?return_to=${encodeURIComponent(route)}#pair=${pair}`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.locator('#email').fill(fixture.a.email);
  await page.locator('#password').fill(fixture.a.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname !== '/login');
  await page.goto('http://127.0.0.1:3407' + route, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="local-workspaces"]') ||
      document.querySelector('[data-foreign-switch]'),
  );
  if (await page.locator('[data-foreign-switch]').isVisible())
    await page.locator('[data-foreign-switch]').click();
  await page.getByTestId('local-workspaces').waitFor();
  await page.getByLabel('Your local directory').selectOption(fixture.workspaceA);
  await page.getByRole('button', { name: 'Local history', exact: true }).click();
  const previews = page.getByRole('button').filter({ hasText: 'Preview restore' });
  await expect(previews.first()).toBeVisible();
  const summary = page.locator('summary').filter({ hasText: 'This directory' });
  if (!(await summary.evaluate((element) => element.parentElement.open))) await summary.click();

  let reads = 0;
  page.on('request', (request) => {
    if (request.url() === connector.url + '/api/inspect' && request.method() === 'GET') reads++;
  });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  const afterRefresh = reads;
  await page.waitForTimeout(8000);
  assert.equal(reads, afterRefresh, 'Idle workbench must not retain the old 2.5s polling loop');
  checks.push('Actual idle workbench makes no repeated inspection requests in eight seconds');
  observations.idleRequestsInEightSeconds = reads - afterRefresh;
  console.log('PASS ' + checks.at(-1));

  let held, newer;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(connector.url + '/api/inspect', async (intercepted) => {
    if (intercepted.request().method() !== 'GET') return intercepted.continue();
    const response = await intercepted.fetch();
    assert.equal(response.status(), 200);
    const data = await response.json();
    if (!held) {
      held = data;
      await gate;
    } else newer = data;
    await intercepted.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await eventually(async () => assert.ok(held));
  await fs.writeFile(file, 'TEST actual saved file for inspection order\n', { flag: 'wx' });
  created = true;
  await local('/api/capture', {}, connector.url);
  await eventually(async () =>
    assert.ok(newer && newer.checkpoints.length > held.checkpoints.length),
  );
  await expect(previews).toHaveCount(newer.checkpoints.length);
  const count = newer.checkpoints.length;
  release();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.waitForTimeout(1000);
  await expect(previews).toHaveCount(count);
  checks.push(
    'New captured checkpoint triggers inspection; a late older real response cannot roll back history',
  );
  observations.oldCheckpointCount = held.checkpoints.length;
  observations.newCheckpointCount = count;
  console.log('PASS ' + checks.at(-1));
  await page.screenshot({ path: path.join(evidence, 'history-after-delayed-response.png') });
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  release();
  await browser?.close();
  if (created) await fs.unlink(file);
  await fs.writeFile(
    path.join(evidence, 'result.json'),
    JSON.stringify({ passed: !process.exitCode, checks, observations, errors }, null, 2),
  );
  console.log(`Evidence: ${evidence}`);
}
