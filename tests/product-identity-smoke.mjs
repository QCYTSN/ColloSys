import fs from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account } from './product-ui-refinement-data.mjs';
const expect = baseExpect.configure({ timeout: 90000 });
const output = '.local/identity-smoke'; await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.addInitScript(() => { window.__protectedMounts = []; new MutationObserver(() => { if (document.querySelector('.collo-topbar')) window.__protectedMounts.push(location.pathname); }).observe(document, { subtree: true, childList: true }); });
  await page.goto('http://127.0.0.1:3407/', { timeout: 120000 });
  await expect(page.locator('#email')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__protectedMounts)).toEqual([]);
  await page.screenshot({ path: output + '/login.png' });
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not configured');
  await page.screenshot({ path: output + '/configuration-unavailable.png' });
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.collo-projects')).toBeVisible();
  await page.screenshot({ path: output + '/signed-in.png' });
  await page.reload();
  await expect(page.locator('.collo-projects')).toBeVisible();
  console.log('Cold signed-out startup, provider configuration feedback, real password sign-in and valid session reload passed.');
} finally {
  await page.screenshot({ path: output + '/last-state.png' }).catch(() => {});
  await fs.writeFile(output + '/browser-errors.json', JSON.stringify(errors, null, 2));
  console.log('Browser errors:', errors.map(e => e.slice(0, 400)));
  await browser.close();
}
