import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const source = path.resolve('.local/codecast-app/acceptance-1792911958839');
const fixture = JSON.parse(await fs.readFile(path.join(source, 'restart-test.json'), 'utf8'));
const evidence = path.resolve('.local/codecast-app/design-baseline');
await fs.mkdir(evidence, { recursive: true });
const pair = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/*', (route) =>
  new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
);
try {
  const route = `/projects/${fixture.projectId}?tab=workspaces`;
  await page.goto(
    `http://127.0.0.1:3407/login?return_to=${encodeURIComponent(route)}#pair=${pair}`,
  );
  await page.locator('#email').fill(fixture.a.email);
  await page.locator('#password').fill(fixture.a.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => u.pathname !== '/login');
  await page.goto('http://127.0.0.1:3407' + route);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="local-workspaces"]') ||
      document.querySelector('[data-foreign-switch]'),
  );
  if (await page.locator('[data-foreign-switch]').isVisible())
    await page.locator('[data-foreign-switch]').click();
  await page.getByTestId('local-workspaces').waitFor();
  await page.getByLabel('Your local directory').selectOption(fixture.workspaceA);
  await expect(page.locator('[data-event-id]').first()).toBeVisible();
  await page.screenshot({ path: path.join(evidence, '01-activity.png') });
  const event = page.locator('[data-event-id]').filter({ hasText: 'files' }).first();
  await event.click();
  await expect(page.getByTestId('checkpoint-completeness')).toContainText('Complete checkpoint');
  await page.screenshot({ path: path.join(evidence, '02-changes.png') });
  await page.getByRole('button', { name: 'Back to activity', exact: true }).click();
  const message = page.locator('[data-event-id]').filter({ hasText: 'Codex' }).first();
  await message.click();
  await expect(page.getByTestId('collaboration-detail')).toContainText('Codex message');
  await page.screenshot({ path: path.join(evidence, '03-message.png') });
  await page.getByRole('button', { name: 'Back to activity', exact: true }).click();
  await page.getByRole('button', { name: 'Local history', exact: true }).click();
  await page
    .getByRole('button', { name: /Preview restore/ })
    .first()
    .click();
  await page.getByRole('dialog', { name: 'Preview restore', exact: true }).waitFor();
  await page.screenshot({ path: path.join(evidence, '04-preview.png') });
  await page.keyboard.press('Escape');
  await fs.writeFile(
    path.join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        errors,
        captured: ['activity', 'changes', 'individual message', 'restore preview'],
        limitation:
          'Individual captured message is not a complete session reader. Real prior acceptance data; no baseline mutation or confirmed restore.',
      },
      null,
      2,
    ),
  );
  console.log('Captured four actual baseline states:', evidence);
} finally {
  await browser.close();
}
