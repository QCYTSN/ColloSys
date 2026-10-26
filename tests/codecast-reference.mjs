// Acceptance for the complete original frontend against its real local backend.
// This is separate from ColloSys connector acceptance, with explicitly test-only
// identities/records. Start `npm run codecast:reference -- --built` first.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { chromium } from '@playwright/test';

const origin = 'http://127.0.0.1:3297';
const directory = `.local/codecast-reference/acceptance-${Date.now()}`;
await mkdir(directory, { recursive: true });
const identity = `frontend-test-${randomUUID()}@example.test`;
const password = `Test-only-${randomUUID()}`;
const title = `TEST full upstream UI ${randomUUID().slice(0, 8)}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [],
  externalRequests = [],
  checks = [];
async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(r.url()).hostname))
      externalRequests.push(new URL(r.url()).origin);
  });
  return page;
}
try {
  const page = await freshPage();
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').waitFor();
  await page.screenshot({ path: `${directory}/login.png` });
  checks.push('Original login renders');
  await page.goto(`${origin}/signup`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(identity);
  await page.locator('#password').fill(password);
  await page.locator('#confirmPassword').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`${origin}/inbox`, { timeout: 30_000 });
  await page.getByRole('button', { name: 'New', exact: true }).waitFor();
  checks.push('Real password registration reaches original DashboardLayout');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: /^Task/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New task', exact: true });
  await dialog.getByPlaceholder('Task title').fill(title);
  await dialog.getByRole('button', { name: /Create task/ }).click();
  await dialog.waitFor({ state: 'hidden' });
  checks.push('Original create dialog writes a real task');

  const cold = await freshPage();
  await cold.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
  await cold.locator('#email').fill(identity);
  await cold.locator('#password').fill('Deliberately-wrong-test-password');
  await cold.locator('form button[type="submit"]').click();
  await cold.getByText(/Invalid email or password/).waitFor();
  checks.push('Wrong password is rejected');
  await cold.locator('#password').fill(password);
  await cold.locator('form button[type="submit"]').click();
  await cold.waitForURL(`${origin}/inbox`, { timeout: 30_000 });
  await cold.goto(`${origin}/tasks`, { waitUntil: 'domcontentloaded' });
  await cold.getByText(title, { exact: true }).first().waitFor({ timeout: 30_000 });
  await cold.evaluate(() => document.fonts.ready);
  assert.equal(
    await cold.evaluate(async () => (await document.fonts.load('20px Fraunces')).length > 0),
    true,
  );
  assert.equal(await cold.evaluate(() => document.fonts.check("14px 'JetBrains Mono'")), true);
  await cold.screenshot({ path: `${directory}/tasks.png` });
  checks.push('A fresh browser login retrieves the persisted task and local font');
  await cold.goto(`${origin}/settings`, { waitUntil: 'domcontentloaded' });
  await cold.getByText('Display name', { exact: true }).waitFor();
  await cold.getByRole('button', { name: /Minimal.*Neutral, spacious/ }).click();
  await cold.waitForFunction(() => document.documentElement.classList.contains('minimal-style'));
  await cold.screenshot({ path: `${directory}/settings-minimal.png` });
  checks.push('Original settings and Minimal style work');

  const proxyStatus = await new Promise((resolve, reject) => {
    const req = request(
      { hostname: '127.0.0.1', port: 3300, method: 'GET', path: 'https://example.invalid/' },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(proxyStatus, 403);
  checks.push('Reference proxy rejects external fetches');
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  checks.push('No browser page errors or external HTTP requests');
  await writeFile(
    `${directory}/result.json`,
    JSON.stringify(
      {
        ok: true,
        referenceOnly: true,
        checks,
        title,
        errors,
        externalRequests,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: true, checks, directory }, null, 2));
} catch (error) {
  await writeFile(
    `${directory}/result.json`,
    JSON.stringify(
      { ok: false, referenceOnly: true, checks, error: error.message, errors, externalRequests },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
