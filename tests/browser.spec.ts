import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConnectorManager } from '../packages/connector/src/manager';
const root = path.resolve(import.meta.dirname, '..');

test('real accounts manage teams, tasks, comments, handoffs, project onboarding and encrypted backup in the browser', async ({
  browser,
}) => {
  test.setTimeout(180000);
  const id = randomUUID().slice(0, 8),
    fixture = path.join(root, '.local', 'verification', `product-${id}`),
    projectRoot = path.join(fixture, 'project'),
    pairing = randomUUID() + randomUUID();
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'hello.txt'), 'TEST browser original');
  const manager = new ConnectorManager(
    path.join(fixture, 'managed'),
    'http://127.0.0.1:8787',
    pairing,
  );
  await manager.start();
  const a = await browser.newContext(),
    b = await browser.newContext();
  await a.addInitScript((value) => sessionStorage.setItem('collosys.pairing', value), pairing);
  const alice = await a.newPage(),
    bob = await b.newPage(),
    errors: string[] = [];
  alice.on('pageerror', (e) => errors.push(e.message));
  bob.on('pageerror', (e) => errors.push(e.message));
  async function register(page: Page, who: string) {
    await page.goto('/');
    await page.getByRole('button', { name: '创建新账号' }).click();
    await page.getByLabel('用户名', { exact: true }).fill(`browser_${who}_${id}`);
    await page.getByLabel('显示名称').fill(who);
    await page.getByLabel('密码', { exact: true }).fill('TEST-browser-long-password');
    await page.getByRole('button', { name: '注册并登录' }).click();
    await expect(page.getByRole('button', { name: /团队与账号/ })).toBeVisible();
  }
  try {
    await register(alice, 'Owner');
    await register(bob, 'Member');
    await alice.getByRole('button', { name: /团队与账号/ }).click();
    let settings = alice.getByRole('dialog', { name: '团队与账号' });
    await settings.getByLabel('团队名称', { exact: true }).fill('Browser test team');
    await settings.getByRole('button', { name: '创建团队', exact: true }).click();
    await expect(settings.getByText('1 / 10 位成员', { exact: false })).toBeVisible();
    await settings.getByLabel('项目名称', { exact: true }).fill('Browser test project');
    await settings.getByRole('button', { name: '创建项目', exact: true }).click();
    await expect(settings.getByRole('combobox', { name: '项目', exact: true })).toContainText(
      'Browser test project',
    );
    await settings
      .getByRole('combobox', { name: '项目', exact: true })
      .selectOption({ label: 'Browser test project' });
    await settings.getByRole('button', { name: '生成一次性加入码' }).click();
    const code = await settings.getByLabel('24 小时有效，请自行交给组员').inputValue();
    expect(code.length).toBeGreaterThan(32);
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await bob.getByRole('button', { name: /团队与账号/ }).click();
    settings = bob.getByRole('dialog', { name: '团队与账号' });
    await settings.getByLabel('加入码', { exact: true }).fill(code);
    await settings.getByRole('button', { name: '加入团队', exact: true }).click();
    await expect(settings.getByText('2 / 10 位成员', { exact: false })).toBeVisible();
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await alice.getByRole('button', { name: '任务与交接', exact: true }).click();
    await bob.getByRole('button', { name: '任务与交接', exact: true }).click();
    await alice.getByRole('button', { name: '新建任务', exact: true }).click();
    await expect(alice.getByRole('combobox', { name: '负责人', exact: true })).toContainText(
      'Member',
      { timeout: 15000 },
    );
    await alice.getByLabel('任务标题', { exact: true }).fill('TEST assigned task');
    await alice.getByLabel('任务说明', { exact: true }).fill('Continue implementation');
    await alice
      .getByRole('combobox', { name: '负责人', exact: true })
      .selectOption({ label: 'Member' });
    await alice.getByRole('button', { name: '创建任务', exact: true }).click();
    await expect(bob.getByText('TEST assigned task', { exact: true }).first()).toBeVisible({
      timeout: 10000,
    });
    await alice.getByRole('tab', { name: /^讨论/ }).click();
    await bob.getByRole('tab', { name: /^讨论/ }).click();
    await bob.getByLabel('评论', { exact: true }).fill('TEST shared discussion');
    await bob.getByRole('button', { name: '发布评论' }).click();
    await expect(alice.getByText('TEST shared discussion', { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await alice.getByRole('tab', { name: /^交接/ }).click();
    await bob.getByRole('tab', { name: /^交接/ }).click();
    await alice.getByRole('button', { name: '新建交接', exact: true }).click();
    await alice
      .getByRole('combobox', { name: '接收成员', exact: true })
      .selectOption({ label: 'Member' });
    await alice.getByLabel('交接标题').fill('TEST context handoff');
    await alice.getByLabel('当前进展与上下文').fill('Implementation is ready for review');
    await alice.getByLabel('下一步', { exact: true }).fill('Review in your independent workspace');
    await alice.getByRole('button', { name: '提交交接' }).click();
    await bob.getByRole('button', { name: '接收交接', exact: true }).click();
    await expect(alice.getByText(/Owner → Member · 已接收/)).toBeVisible({ timeout: 10000 });
    await alice.screenshot({
      path: path.join(root, '.local/verification/collaboration-desktop.png'),
      fullPage: true,
    });
    await alice.getByRole('button', { name: '接入项目目录' }).click();
    const setup = alice.getByRole('dialog', { name: '接入这台电脑的项目' });
    await setup.getByLabel('项目目录', { exact: true }).fill(projectRoot);
    await setup.getByLabel('工作区名称').fill('TEST attached workspace');
    await setup.getByRole('checkbox').check();
    await setup.getByRole('button', { name: '创建并启动连接程序' }).click();
    await expect(setup).not.toBeVisible({ timeout: 30000 });
    await alice.getByRole('button', { name: /团队活动/ }).click();
    await bob.getByRole('button', { name: /团队活动/ }).click();
    await fs.writeFile(path.join(projectRoot, 'hello.txt'), 'TEST newly saved source');
    await expect(bob.locator('.event-card').filter({ hasText: 'hello.txt' }).first()).toBeVisible({
      timeout: 20000,
    });
    await alice.getByRole('button', { name: '我的检查点', exact: true }).click();
    const storage = alice.locator('.storage-panel');
    await expect(
      storage.getByRole('combobox', { name: '选择本地检查点', exact: true }),
    ).toContainText('保存文件');
    const options = await storage
      .getByRole('combobox', { name: '选择本地检查点', exact: true })
      .locator('option')
      .all();
    await storage
      .getByRole('combobox', { name: '选择本地检查点', exact: true })
      .selectOption((await options[1].getAttribute('value')) ?? '');
    await storage
      .getByLabel('备份口令', { exact: true })
      .fill('TEST-browser-encryption-passphrase');
    await storage.getByRole('checkbox').check();
    await storage.getByRole('button', { name: '加密并备份所选检查点' }).click();
    await expect(storage.getByRole('status')).toContainText('本机对象存储已确认保存', {
      timeout: 30000,
    });
    await storage
      .getByLabel('备份口令', { exact: true })
      .fill('TEST-browser-encryption-passphrase');
    await storage.getByRole('button', { name: '解密到独立目录' }).click();
    await expect(storage.getByRole('status')).toContainText('原工作目录未改变', { timeout: 30000 });
    await alice.screenshot({
      path: path.join(root, '.local/verification/storage-desktop.png'),
      fullPage: true,
    });
    await alice.setViewportSize({ width: 390, height: 844 });
    await alice.getByRole('button', { name: '打开导航', exact: true }).click();
    await alice.getByRole('button', { name: '任务与交接', exact: true }).click();
    expect(await alice.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await alice.screenshot({
      path: path.join(root, '.local/verification/collaboration-mobile.png'),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
    await manager.stop();
  }
});
async function login(page: Page, user: 'Alice' | 'Bob') {
  await page.goto('/');
  await page
    .getByRole('button')
    .filter({ hasText: `进入 ${user} 的独立工作区` })
    .click();
  await expect(page.getByRole('heading', { name: '团队活动', exact: true })).toBeVisible();
  await expect(page.getByText('实时连接', { exact: true })).toBeVisible();
}

test('two independent browser identities see real edits and safely restore through the UI', async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const alice = await a.newPage(),
    bob = await b.newPage();
  const errors: string[] = [];
  alice.on('pageerror', (e) => errors.push(e.message));
  bob.on('pageerror', (e) => errors.push(e.message));
  const name = `browser-${randomUUID().slice(0, 8)}.ts`,
    file = path.join(root, '.local/demo/alice/project', name);
  try {
    await Promise.all([login(alice, 'Alice'), login(bob, 'Bob')]);
    await fs.writeFile(file, '// BROWSER ACCEPTANCE: real saved file\nexport const value = 42;\n');
    const card = bob.locator('.event-card').filter({ hasText: name }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(bob.locator('diffs-container [data-code]')).toContainText(
      'export const value = 42;',
    );
    await expect(alice.locator('.event-card').filter({ hasText: name }).first()).toBeVisible({
      timeout: 15000,
    });
    const auth = await alice.evaluate(() => JSON.parse(sessionStorage.getItem('collosys.auth')!));
    const history = await alice.request.get('/connector/alice/api/checkpoints', {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    const cp = (await history.json()).checkpoints[0];
    await fs.writeFile(
      file,
      '// BROWSER ACCEPTANCE: deliberately broken\nexport const value = -1;\n',
    );
    await expect
      .poll(async () => bob.locator('.event-card').filter({ hasText: name }).count(), {
        timeout: 15000,
      })
      .toBeGreaterThan(1);
    await alice.getByRole('button', { name: '我的检查点', exact: true }).click();
    const row = alice.locator('.checkpoint-row').filter({ hasText: cp.id.slice(0, 8) });
    await row.getByRole('button', { name: '预览恢复' }).click();
    const modal = alice.getByRole('dialog', { name: '确认前，先检查恢复范围。' });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: '备份当前状态并恢复' })).toBeDisabled();
    await modal.getByRole('checkbox').check();
    await modal.getByRole('button', { name: '备份当前状态并恢复' }).click();
    await expect(modal).not.toBeVisible();
    await expect(alice.getByRole('alert')).toContainText('已恢复');
    await expect.poll(() => fs.readFile(file, 'utf8')).toContain('value = 42');
    await expect(fs.access(path.join(root, '.local/demo/bob/project', name))).rejects.toThrow();
    await alice.getByRole('button', { name: /团队活动/ }).click();
    await bob.locator('.event-card').filter({ hasText: name }).first().click();
    await fs.mkdir(path.join(root, '.local/verification'), { recursive: true });
    await alice.screenshot({
      path: path.join(root, '.local/verification/alice-desktop.png'),
      fullPage: true,
    });
    await bob.screenshot({
      path: path.join(root, '.local/verification/bob-desktop.png'),
      fullPage: true,
    });
    await alice.setViewportSize({ width: 390, height: 844 });
    await alice.locator('.event-card').filter({ hasText: name }).first().click();
    await alice.getByRole('button', { name: '返回活动列表', exact: true }).click();
    await alice.locator('.event-card').filter({ hasText: name }).first().click();
    await expect(alice.getByLabel(`${name} 的代码差异`)).toBeVisible();
    await alice.getByRole('button', { name: '打开导航', exact: true }).click();
    await alice.getByRole('button', { name: '切换到深色', exact: true }).click();
    await alice.getByRole('button', { name: '关闭导航', exact: true }).click();
    await expect(alice.locator('html')).toHaveClass(/dark/);
    await alice.screenshot({
      path: path.join(root, '.local/verification/mobile.png'),
      fullPage: true,
    });
    expect(await alice.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  } finally {
    await fs.unlink(file).catch(() => {});
    await a.close();
    await b.close();
  }
});

test('nonmember browser cannot read the project', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '以非项目成员验证访问限制' }).click();
  await expect(page.getByRole('heading', { name: '没有项目访问权限' })).toBeVisible();
  expect(await page.locator('.event-card').count()).toBe(0);
});

test('connection settings enforce ownership and require consent before sharing a real-format log fixture', async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const alice = await a.newPage(),
    bob = await b.newPage();
  const id = randomUUID();
  const log = path.join(root, '.local/verification', `TEST-FIXTURE-browser-${id}.jsonl`);
  const row = (text: string) => ({
    type: 'response_item',
    timestamp: new Date().toISOString(),
    payload: {
      type: 'message',
      role: 'assistant',
      channel: 'final',
      content: [{ type: 'output_text', text }],
    },
  });
  let token: string | undefined;
  try {
    await fs.mkdir(path.dirname(log), { recursive: true });
    await fs.writeFile(
      log,
      [
        {
          type: 'session_meta',
          payload: { id, cwd: path.join(root, '.local/demo/alice/project') },
        },
        row(`TEST FIXTURE historical ${id}`),
      ]
        .map((r) => JSON.stringify(r))
        .join('\n') + '\n',
    );
    await Promise.all([login(alice, 'Alice'), login(bob, 'Bob')]);
    token = await alice.evaluate(() => JSON.parse(sessionStorage.getItem('collosys.auth')!).token);
    await alice.getByRole('button', { name: '连接设置', exact: true }).click();
    const dialog = alice.getByRole('dialog', { name: '本地连接设置' });
    await dialog.getByLabel('本地连接程序地址').fill('http://127.0.0.1:8792');
    await dialog.getByRole('button', { name: '连接此工作区' }).click();
    await expect(dialog.getByRole('alert')).toContainText('属于另一成员');
    await dialog.getByLabel('本地连接程序地址').fill('http://127.0.0.1:8791');
    await dialog.getByRole('button', { name: '连接此工作区' }).click();
    await expect(dialog.getByRole('status')).toContainText('已切换');
    await dialog.getByLabel('Codex 日志路径').fill(log);
    await dialog.getByRole('button', { name: '检查日志' }).click();
    await expect(dialog.getByText('日志与当前项目匹配')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '确认接入' })).toBeDisabled();
    await expect(dialog.getByRole('checkbox', { name: /同时导入已有消息/ })).not.toBeChecked();
    await dialog.getByRole('checkbox', { name: /我同意将选定会话/ }).check();
    await dialog.getByRole('button', { name: '确认接入' }).click();
    await expect(dialog.getByRole('status')).toContainText('导入 0 条消息');
    await fs.appendFile(log, JSON.stringify(row(`TEST FIXTURE public new ${id}`)) + '\n');
    const card = bob.locator('.event-card').filter({ hasText: `TEST FIXTURE public new ${id}` });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(bob.locator('.conversation')).toContainText(`TEST FIXTURE public new ${id}`);
    await fs.appendFile(log, JSON.stringify(row(`TEST FIXTURE followup ${id}`)) + '\n');
    await bob.getByRole('button', { name: 'Agent 会话', exact: true }).click();
    const session = bob.locator('.event-card').filter({ hasText: `TEST FIXTURE followup ${id}` });
    await expect(session).toHaveCount(1, { timeout: 15000 });
    await session.click();
    await expect(bob.locator('.conversation')).toContainText(`TEST FIXTURE public new ${id}`);
    await expect(bob.locator('.conversation')).toContainText(`TEST FIXTURE followup ${id}`);
    await expect(bob.locator('.conversation')).not.toContainText(`TEST FIXTURE historical ${id}`);
    await expect(
      bob.locator('.event-card').filter({ hasText: `TEST FIXTURE historical ${id}` }),
    ).toHaveCount(0);
    await dialog.getByRole('button', { name: '停止采集' }).click();
    await expect(dialog.getByRole('status')).toContainText('已停止采集');
    await dialog.getByRole('button', { name: '关闭连接设置' }).focus();
    await alice.keyboard.press('Shift+Tab');
    expect(await alice.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
      true,
    );
    await alice.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  } finally {
    if (token)
      await alice.request
        .post('/connector/alice/api/agent/disconnect', {
          headers: { Authorization: `Bearer ${token}` },
          data: {},
        })
        .catch(() => {});
    await fs.unlink(log).catch(() => {});
    await a.close();
    await b.close();
  }
});

test('authorization failure clears cached activity instead of leaving revoked data visible', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'collosys:v1:alice:demo-project',
      JSON.stringify({ cursor: 10, events: [{ kind: 'checkpoint', payload: null }] }),
    );
  });
  await login(page, 'Alice');
  await expect(page.locator('.event-card').first()).toBeVisible();
  await page.route('**/api/projects/demo-project/events?*', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'TEST FIXTURE: access revoked' }),
    }),
  );
  await page.getByRole('button', { name: '刷新活动' }).click();
  await expect(page.getByText('访问已失效', { exact: true })).toBeVisible();
  await expect(page.locator('.event-card')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('collosys:v1:alice:demo-project')),
  ).toBeNull();
});
