// Formal product + TEST connector/Convex storage. Only specified read/clipboard faults are injected.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { chromium, expect as baseExpect } from '@playwright/test';
import { completionFixture, account } from './product-ui-completion-data.mjs';
import { inspectOverflow, inspectActions } from './product-ui-overflow.mjs';
const f = await completionFixture(),
  expect = baseExpect.configure({ timeout: 30000 }),
  out = 'docs/product-ui/review-fixes/evidence/after/storage';
await fs.mkdir(out, { recursive: true });
const digest = async (root) => {
  const rows = [];
  async function visit(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      assert.ok(!e.isSymbolicLink());
      const file = path.join(dir, e.name);
      if (e.isDirectory()) await visit(file);
      else
        rows.push([
          path.relative(root, file),
          createHash('sha256')
            .update(await fs.readFile(file))
            .digest('hex'),
        ]);
    }
  }
  await visit(root);
  return rows.sort((a, b) => a[0].localeCompare(b[0]));
};
const peer = path.join(f.evidence, 'TEST-review-untouched-teammate');
await fs.mkdir(peer, { recursive: true });
await fs.writeFile(path.join(peer, 'unchanged.txt'), 'TEST peer independent file');
const original = await digest(f.root),
  peerOriginal = await digest(peer);
const checks = [],
  audits = [],
  writes = {};
const mark = (name) => {
  checks.push(name);
  console.log('PASS', name);
};
const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: '.local/review-storage-video' },
  }),
  page = await context.newPage();
page.on('request', (r) => {
  if (r.method() === 'POST' && /\/api\/(storage|backups)\//.test(r.url())) {
    const route = new URL(r.url()).pathname;
    writes[route] = (writes[route] ?? 0) + 1;
  }
});
const storage = page.getByTestId('directory-storage'),
  panel = page.locator('.collo-storage-dialog'),
  form = page.getByRole('form', { name: 'Confirm storage operation' });
const shot = async (name) =>
  page.screenshot({
    path: out + '/' + name + '.png',
    mask: [page.locator('input[type=password]')],
  });
const visibleInPanel = (locator) =>
  locator.evaluate((e) => {
    const r = e.getBoundingClientRect(),
      p = e.closest('[role=dialog]').getBoundingClientRect();
    return r.top >= p.top && r.bottom <= p.bottom;
  });
const submit = async () => {
  await form.getByRole('checkbox').check();
  await form.locator('button[type=submit]').click();
};
const finished = async () => {
  await expect(form).toHaveCount(0, { timeout: 120000 });
  await expect(storage.getByRole('button', { name: 'Refresh storage', exact: true })).toBeEnabled({
    timeout: 120000,
  });
};
try {
  await page.goto('http://127.0.0.1:3407/login');
  await page.evaluate(
    (v) => sessionStorage.setItem('collo.pair', v),
    (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim(),
  );
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('#password').press('Enter');
  await expect(page.locator('.collo-projects')).toBeVisible();
  await page.goto(
    `http://127.0.0.1:3407/projects/${f.projectId}?tab=workspaces&workspaceView=history&directory=${f.workspaceId}`,
  );
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    await expect(page.getByTestId('local-workspaces')).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
  await page.getByText('This directory · TEST completion source', { exact: true }).click();
  await page.getByRole('button', { name: 'Storage & backups', exact: true }).click();
  await expect(storage.getByRole('button', { name: 'Review policy', exact: true })).toBeVisible();
  let readFails = true,
    successfulReads = 0;
  await page.route('**/api/storage', async (route) => {
    if (readFails)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'TEST local read failed' }),
      });
    else {
      await route.continue();
      successfulReads++;
    }
  });
  await storage.getByRole('button', { name: 'Refresh storage', exact: true }).click();
  await expect(storage.getByRole('alert')).toContainText('TEST local read failed');
  readFails = false;
  await storage.getByRole('button', { name: 'Retry local history', exact: true }).click();
  await expect(storage.getByText('TEST local read failed', { exact: false })).toHaveCount(0);
  await expect.poll(() => successfulReads).toBe(1);
  await page.unroute('**/api/storage');
  mark('B1 real page HTTP failure then success clears matching local error');
  await shot('local-read-recovered');
  let releaseRead,
    held = false;
  await page.route('**/api/storage', async (route) => {
    if (!held) {
      held = true;
      const response = await route.fetch();
      await new Promise((resolve) => (releaseRead = resolve));
      await route.fulfill({ response });
    } else await route.continue();
  });
  await storage.getByRole('button', { name: 'Refresh storage', exact: true }).click();
  await expect.poll(() => !!releaseRead).toBe(true);
  const pin = storage.getByRole('button', { name: /^(Unpin|Pin) checkpoint$/ });
  const wasPinned = (await pin.innerText()).startsWith('Unpin');
  await pin.click();
  await expect(
    storage.getByRole('button', {
      name: wasPinned ? 'Pin checkpoint' : 'Unpin checkpoint',
      exact: true,
    }),
  ).toBeVisible();
  releaseRead();
  await page.waitForTimeout(150);
  await expect(
    storage.getByRole('button', {
      name: wasPinned ? 'Pin checkpoint' : 'Unpin checkpoint',
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute('**/api/storage');
  mark(
    'B3 actual pin write interleaved with a held pre-write GET cannot roll back the displayed result',
  );
  let failPostWrite = false;
  await page.route('**/api/storage/policy', async (route) => {
    const response = await route.fetch();
    failPostWrite = true;
    await route.fulfill({ response });
  });
  await page.route('**/api/storage', (route) =>
    failPostWrite
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'TEST post-write read unavailable' }),
        })
      : route.continue(),
  );
  await storage.getByRole('button', { name: 'Review policy', exact: true }).click();
  await submit();
  await expect(form).toHaveCount(0);
  await expect(storage.getByText('Retention policy saved.', { exact: true })).toBeVisible();
  await expect(
    storage.getByText('TEST post-write read unavailable', { exact: false }),
  ).toBeAttached();
  assert.ok(
    await storage.locator('.collo-storage-completed').evaluate((e) => e === document.activeElement),
  );
  assert.equal(writes['/api/storage/policy'], 1);
  await shot('policy-committed-read-failed');
  failPostWrite = false;
  await storage.getByRole('button', { name: 'Refresh storage status', exact: true }).click();
  await expect(storage.getByText('TEST post-write read unavailable', { exact: false })).toHaveCount(
    0,
  );
  await page.unroute('**/api/storage/policy');
  await page.unroute('**/api/storage');
  mark('B6 policy commits once; failed re-read stays a read error and focus stays on completion');
  const pass = 'TEST ephemeral recovery ' + randomUUID();
  const beforeBackups = (await f.local('/api/backups', undefined, f.connector.url)).backups;
  await storage.getByRole('button', { name: 'Create encrypted backup', exact: true }).click();
  await form.getByLabel('Backup passphrase', { exact: true }).fill(pass);
  await submit();
  await finished();
  const backup = (await f.local('/api/backups', undefined, f.connector.url)).backups.find(
    (b) => !beforeBackups.some((old) => old.id === b.id),
  );
  assert.ok(backup);
  const row = storage.locator(`[data-backup-id="${backup.id}"]`);
  await expect(row).toBeAttached();
  mark('Actual encrypted TEST backup persisted through confirmation');
  await row.getByRole('button', { name: 'Recover copy', exact: true }).click();
  await form
    .getByLabel('Backup passphrase', { exact: true })
    .fill('TEST incorrect but sufficiently long');
  await submit();
  await expect(form.getByRole('alert')).toContainText('Could not decrypt');
  await expect(form.getByLabel('Backup passphrase', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  assert.ok(await visibleInPanel(form.getByRole('alert')));
  assert.equal(await form.getByLabel('Backup passphrase', { exact: true }).inputValue(), '');
  await shot('wrong-passphrase-local-error');
  // An unrelated read can fail and recover without clearing this form error.
  let failLocal = true;
  await page.route('**/api/storage', (route) =>
    failLocal
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'TEST parallel local read failure' }),
        })
      : route.continue(),
  );
  await storage.getByRole('button', { name: 'Refresh storage', exact: true }).click();
  await expect(
    storage.getByText('TEST parallel local read failure', { exact: false }),
  ).toBeVisible();
  failLocal = false;
  await storage.getByRole('button', { name: 'Retry local history', exact: true }).click();
  await expect(storage.getByText('TEST parallel local read failure', { exact: false })).toHaveCount(
    0,
  );
  await expect(form.getByRole('alert')).toContainText('Could not decrypt');
  await page.unroute('**/api/storage');
  mark(
    'D1 real wrong passphrase has field association/focus; independent read recovery preserves it',
  );
  const beforeRecoveries = (await f.local('/api/storage', undefined, f.connector.url)).recoveries;
  await form.getByLabel('Backup passphrase', { exact: true }).fill(pass);
  await submit();
  await finished();
  const recovery = (await f.local('/api/storage', undefined, f.connector.url)).recoveries.find(
    (r) => r.status === 'ready' && !beforeRecoveries.some((old) => old.id === r.id),
  );
  assert.ok(recovery);
  await expect(storage.locator('.collo-storage-completed')).toContainText(recovery.directory);
  assert.ok(
    await visibleInPanel(storage.locator('.collo-storage-completed [role=status]').first()),
  );
  await shot('recovery-completed-in-place');
  mark(
    'D2 real recovery result keeps actual returned directory and surviving focus at confirmation position',
  );
  const recoveryRow = storage.locator(`[data-recovery-id="${recovery.id}"]`),
    copy = recoveryRow.getByRole('button', { name: 'Copy path', exact: true });
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => new Promise((r) => (window.finishClipboard = r)) },
    }),
  );
  await copy.scrollIntoViewIfNeeded();
  const scroll = await panel.evaluate((e) => e.scrollTop),
    width = (await copy.boundingBox()).width;
  await copy.click();
  await expect(recoveryRow.getByText('Copying…', { exact: true })).toBeVisible();
  await expect(recoveryRow.getByText('Path copied.', { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.finishClipboard());
  await expect(recoveryRow.getByText('Path copied.', { exact: true })).toBeVisible();
  assert.ok(await visibleInPanel(recoveryRow.getByText('Path copied.', { exact: true })));
  assert.ok(Math.abs((await panel.evaluate((e) => e.scrollTop)) - scroll) < 4);
  assert.equal((await copy.boundingBox()).width, width);
  await shot('row-copy-feedback');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('TEST clipboard unavailable');
        },
      },
    }),
  );
  await copy.press('Enter');
  await expect(recoveryRow.getByRole('textbox', { name: 'Complete recovery path' })).toHaveValue(
    recovery.directory,
  );
  await recoveryRow.getByRole('textbox', { name: 'Complete recovery path' }).focus();
  assert.equal(
    await page.evaluate(
      () => document.activeElement.selectionEnd - document.activeElement.selectionStart,
    ),
    recovery.directory.length,
  );
  await shot('row-copy-manual-fallback');
  mark(
    'D1 clipboard controlled promise reports only after settlement, in the correct row, stable width/scroll; keyboard failure exposes selectable full path',
  );
  await recoveryRow.getByRole('button', { name: 'Export copy', exact: true }).click();
  await form
    .getByLabel('New export directory', { exact: true })
    .fill('relative-invalid-destination');
  await submit();
  await expect(form.getByRole('alert')).toContainText('absolute directory');
  await expect(form.getByLabel('New export directory', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  assert.ok(await visibleInPanel(form.getByRole('alert')));
  await shot('invalid-export-field');
  const target = path.join(f.evidence, 'TEST-review-export-' + randomUUID());
  await form.getByLabel('New export directory', { exact: true }).fill(target);
  await expect(form.getByRole('checkbox')).not.toBeChecked();
  await submit();
  await finished();
  await expect(storage.locator('.collo-storage-completed')).toContainText(target);
  assert.ok((await fs.readdir(target)).length > 0);
  mark(
    'Real invalid export path stays at field; changed target revokes confirmation; successful export shows returned location',
  );
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [960, 720],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    const geometry = await inspectOverflow(page, '.collo-storage-dialog'),
      actions = await inspectActions(
        page,
        panel
          .locator('button:enabled,input:enabled,select:enabled,textarea:enabled')
          .filter({ visible: true }),
      );
    audits.push({ width, height, geometry, actions });
    await shot('storage-' + width);
  }
  await row.getByRole('button', { name: 'Delete backup', exact: true }).click();
  await submit();
  await finished();
  await expect(row).toHaveCount(0);
  assert.ok(
    await storage.locator('.collo-storage-completed').evaluate((e) => e === document.activeElement),
  );
  mark('Real backup deletion focuses surviving completion after its row is removed');
  assert.deepEqual(await digest(f.root), original);
  assert.deepEqual(await digest(peer), peerOriginal);
  mark('Source and independent TEST teammate files remain byte-for-byte unchanged');
} finally {
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        evidence:
          'Formal application with real local services; specified HTTP failures and clipboard promise substituted',
        checks,
        writes,
        audits,
      },
      null,
      2,
    ),
  );
  const video = page.video();
  await context.close();
  await video.saveAs(out + '/storage.webm');
  await browser.close();
}
assert.ok(
  audits.every((a) => !a.geometry.faults.length && !a.actions.faults.length),
  'Inspect storage geometry/action evidence',
);
