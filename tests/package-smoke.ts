import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { root, waitFor, stopProcess, assertPortsFree } from '../scripts/process';
const exec = promisify(execFile),
  archive = process.argv[2];
if (!archive) throw new Error('Provide the built Windows ZIP path');
await assertPortsFree([5173, 8787, 8790]);
const directory = path.join(
  root,
  '.local',
  'installation',
  new Date().toISOString().replaceAll(':', '-'),
);
await exec(
  'powershell.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(root, 'packaging', 'VerifyInstall.ps1'),
    '-Archive',
    path.resolve(archive),
    '-Directory',
    directory,
  ],
  { windowsHide: true, timeout: 300000, maxBuffer: 1024 * 1024 },
);
const app = path.join(directory, 'installed', 'app'),
  data = path.join(directory, 'data'),
  log = await fs.open(path.join(directory, 'launch.log'), 'a');
const child = spawn(
  path.join(app, 'runtime', 'node.exe'),
  ['--import', 'tsx', 'scripts/start.ts'],
  {
    cwd: app,
    windowsHide: true,
    env: {
      ...process.env,
      COLLOSYS_DATA: data,
      COLLOSYS_NO_BROWSER: '1',
      WRANGLER_SEND_METRICS: 'false',
    },
    stdio: ['ignore', log.fd, log.fd],
  },
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await waitFor('http://127.0.0.1:5173/api/health', 90000, child);
  const health = (await (await fetch('http://127.0.0.1:5173/api/health')).json()) as {
    auth: string;
  };
  assert.equal(health.auth, 'production');
  const launch = JSON.parse(await fs.readFile(path.join(data, 'launcher.json'), 'utf8')) as {
    url: string;
  };
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(launch.url);
  await page.getByRole('button', { name: '创建新账号' }).click();
  await page.getByLabel('用户名', { exact: true }).fill('installed_test');
  await page.getByLabel('显示名称').fill('Installed test');
  await page.getByLabel('密码', { exact: true }).fill('TEST-installed-long-password');
  await page.getByRole('button', { name: '注册并登录' }).click();
  await page.getByRole('button', { name: /团队与账号/ }).waitFor();
  assert.ok(!(await page.getByRole('button', { name: /进入 Alice/ }).count()));
  const auth = await page.evaluate(() => JSON.parse(sessionStorage.getItem('collosys.auth')!));
  const pairing = await page.evaluate(() => sessionStorage.getItem('collosys.pairing'));
  assert.ok(pairing);
  const request = async (route: string, input: unknown) => {
    const r = await fetch('http://127.0.0.1:5173' + route, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    assert.ok(r.ok);
    return (await r.json()) as any;
  };
  const team = await request('/api/teams', { name: 'Installed test team' }),
    project = await request(`/api/teams/${team.id}/projects`, { name: 'Installed test project' });
  const projectRoot = path.join(directory, 'project');
  await fs.mkdir(projectRoot);
  await fs.writeFile(path.join(projectRoot, 'test.txt'), 'Installed exact bytes');
  const connected = await page.evaluate(
    async ({ token, projectId, root }) => {
      const r = await fetch('http://127.0.0.1:8790/api/connectors/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-ColloSys-Pairing': sessionStorage.getItem('collosys.pairing')!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ root, projectId, label: 'Installed project', confirmed: true }),
      });
      return { status: r.status, value: await r.json() };
    },
    { token: auth.token, projectId: project.id, root: projectRoot },
  );
  assert.equal(connected.status, 200, JSON.stringify(connected.value));
  await page.reload();
  await page.getByRole('button', { name: 'Installed test project', exact: true }).waitFor();
  await page.getByText('实时连接', { exact: true }).waitFor();
  await page
    .locator('.event-card')
    .filter({ hasText: 'test.txt' })
    .first()
    .waitFor({ timeout: 20000 });
  await page.locator('.event-card').filter({ hasText: 'test.txt' }).first().click();
  await page
    .locator('diffs-container [data-code]')
    .filter({ hasText: 'Installed exact bytes' })
    .waitFor({ timeout: 20000 });
  await fs.writeFile(path.join(projectRoot, 'test.txt'), 'Installed real update');
  await page.locator('.event-card').filter({ hasText: 'test.txt' }).first().click();
  await page.waitForFunction(
    () => document.querySelectorAll('.event-card').length >= 2,
    undefined,
    {
      timeout: 20000,
    },
  );
  await page.locator('.event-card').filter({ hasText: 'test.txt' }).first().click();
  await page
    .locator('diffs-container [data-code]')
    .filter({ hasText: 'Installed real update' })
    .waitFor({ timeout: 20000 });
  await page.screenshot({ path: path.join(directory, 'installed-app.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(directory, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        archive: path.resolve(archive),
        checks: [
          'archive extraction',
          'isolated installation',
          'bundled runtime startup',
          'production mode rejects demo login',
          'real browser registration',
          'browser pairing',
          'real project capture',
          'static UI WebSocket proxy',
          'packaged lazy diff renderer and persisted checkpoint detail',
          'saved-file update reaches the installed workbench',
        ],
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log('INSTALLATION PASSED: ' + directory);
} finally {
  await browser?.close();
  await stopProcess(child);
  await log.close();
}
