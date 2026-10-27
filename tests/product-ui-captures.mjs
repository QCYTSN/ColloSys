import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
const phase = process.argv[2] ?? 'after';
if (!['before', 'after'].includes(phase)) throw new Error('phase must be before or after');
const out = path.resolve('docs/product-ui/evidence', phase);
await fs.mkdir(out, { recursive: true });
const local = path.resolve('.local/product-ui-context.json');
let saved;
try {
  saved = JSON.parse(await fs.readFile(local, 'utf8'));
} catch {
  const base = '.local/codecast-app';
  const dirs = (await fs.readdir(base))
    .filter((n) => /^acceptance-\d+$/.test(n))
    .sort()
    .reverse();
  for (const name of dirs) {
    try {
      await fs.access(path.join(base, name, 'restart-test.json'));
      saved = { acceptanceDir: path.resolve(base, name) };
      break;
    } catch {}
  }
  if (!saved) throw new Error('A real persisted local acceptance account is required');
  await fs.writeFile(local, JSON.stringify(saved));
}
const account = JSON.parse(
  await fs.readFile(path.join(saved.acceptanceDir, 'restart-test.json'), 'utf8'),
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:3407/login');
  await page.locator('#email').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, 'login.png') });
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => u.pathname === '/projects');
  for (const [name, route] of [
    ['projects', '/projects'],
    ['workspaces', `/projects/${account.projectId}?tab=workspaces`],
    ['tasks', '/tasks'],
    ['inbox', '/inbox'],
    ['settings', '/settings'],
    ['team', '/settings/team'],
  ]) {
    await page.goto('http://127.0.0.1:3407' + route);
    await page.waitForTimeout(1800);
    if (await page.locator('[data-foreign-switch]').isVisible()) {
      await page.locator('[data-foreign-switch]').click();
      await page.waitForTimeout(1000);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, name + '.png') });
    console.log('Captured', phase, name);
  }
  await fs.writeFile(
    path.join(out, 'capture.json'),
    JSON.stringify(
      {
        phase,
        viewport: { width: 1440, height: 960 },
        projectId: account.projectId,
        errors,
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
if (errors.length) throw new Error(errors.join('\n'));
