import { test, expect } from '@playwright/test';

test('late project responses cannot replace current retention settings or unsaved edits', async ({
  page,
}) => {
  let release!: () => void,
    requested = false;
  const delayed = new Promise<void>((resolve) => (release = resolve));
  const saves: { port: string; policy: { maxCheckpoints: number } }[] = [];
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'collosys.auth',
      JSON.stringify({ token: 'TEST-browser-session-long', user: { id: 'owner', name: 'Owner' } }),
    );
    localStorage.setItem('collosys.connector:owner:project-a', 'http://127.0.0.1:31991');
    localStorage.setItem('collosys.connector:owner:project-b', 'http://127.0.0.1:31992');
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()),
      endpoint = url.pathname;
    const local = ['31991', '31992'].includes(url.port),
      isA = url.port === '31991';
    let data: unknown = {},
      status = 200;
    if (endpoint === '/api/health') data = { auth: 'production' };
    else if (endpoint === '/api/projects')
      data = {
        projects: [
          { id: 'project-a', name: 'TEST Project A' },
          { id: 'project-b', name: 'TEST Project B' },
        ],
      };
    else if (endpoint.endsWith('/members'))
      data = { members: [{ id: 'owner', name: 'Owner', role: 'editor' }] };
    else if (endpoint.endsWith('/workspaces')) data = { workspaces: [] };
    else if (endpoint.endsWith('/events')) data = { events: [], cursor: 0, hasMore: false };
    else if (endpoint.endsWith('/history') || endpoint.endsWith('/sessions'))
      data = { items: [], head: 0, next: null };
    else if (endpoint.endsWith('/ticket')) {
      status = 503;
      data = { error: 'TEST sockets disabled' };
    } else if (local && endpoint === '/api/status')
      data = {
        projectId: isA ? 'project-a' : 'project-b',
        root: 'TEST',
        pending: 0,
        offline: false,
        agent: { source: null, error: null },
        excluded: [],
      };
    else if (local && endpoint === '/api/checkpoints')
      data = {
        checkpoints: [{ id: 'TEST-cp', label: 'TEST checkpoint', createdAt: 1000, fileCount: 1 }],
      };
    else if (local && endpoint === '/api/storage') {
      if (isA) {
        requested = true;
        await delayed;
      }
      data = {
        bytes: 0,
        count: 0,
        remove: [],
        protected: [],
        policy: { maxCheckpoints: isA ? 2 : 200, maxAgeDays: 30, maxDiskMiB: 2048 },
        backup: null,
      };
    } else if (local && endpoint === '/api/backups')
      data = { backups: [], location: 'local-object-storage' };
    else if (local && endpoint === '/api/storage/policy') {
      saves.push({ port: url.port, policy: route.request().postDataJSON().policy });
      data = { ok: true };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'TEST Project A', exact: true }).waitFor();
    await page.getByRole('button', { name: '我的检查点', exact: true }).click();
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByRole('button', { name: '保存策略', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'TEST Project B', exact: true }).click();
    await expect(page.getByLabel('保留数量', { exact: true })).toHaveValue('200');
    release();
    await page.waitForTimeout(300);
    await expect(page.getByLabel('保留数量', { exact: true })).toHaveValue('200');
    await page.getByLabel('保留数量', { exact: true }).fill('175');
    await page
      .getByRole('combobox', { name: '选择本地检查点', exact: true })
      .selectOption('TEST-cp');
    await page.getByRole('button', { name: '固定保留', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('此检查点已固定保留');
    await expect(page.getByLabel('保留数量', { exact: true })).toHaveValue('175');
    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: '保存策略', exact: true }).click();
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0]).toEqual({
      port: '31992',
      policy: { maxCheckpoints: 175, maxAgeDays: 30, maxDiskMiB: 2048 },
    });
    await page.getByRole('button', { name: 'TEST Project A', exact: true }).click();
    await expect(page.getByLabel('保留数量', { exact: true })).toHaveValue('2');
    await page.getByRole('button', { name: 'TEST Project B', exact: true }).click();
    await expect(page.getByLabel('保留数量', { exact: true })).toHaveValue('200');
  } finally {
    release();
  }
});

test('wrong current password keeps the login; an invalid server session signs out', async ({
  page,
}) => {
  let expired = false;
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'collosys.auth',
      JSON.stringify({ token: 'TEST-password-session', user: { id: 'owner', name: 'Owner' } }),
    ),
  );
  await page.route('**/api/**', async (route) => {
    const name = new URL(route.request().url()).pathname;
    let status = 200,
      data: unknown = {};
    if (name === '/api/health') data = { auth: 'production' };
    else if (name === '/api/projects') data = { projects: [{ id: 'test-project', name: 'TEST' }] };
    else if (name === '/api/teams') data = { teams: [] };
    else if (name.endsWith('/members'))
      data = { members: [{ id: 'owner', name: 'Owner', role: 'owner' }] };
    else if (name.endsWith('/history')) data = { items: [], head: 0, next: null };
    else if (name.endsWith('/events')) {
      if (expired) {
        status = 401;
        data = { error: 'Session expired', code: 'SESSION_INVALID' };
      } else data = { events: [], cursor: 0, hasMore: false };
    } else if (name.endsWith('/ticket')) {
      status = 503;
      data = { error: 'TEST sockets disabled' };
    } else if (name === '/api/auth/password') {
      status = 401;
      data = { error: 'Current password is incorrect' };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /团队与账号/ }).click();
  const dialog = page.getByRole('dialog', { name: '团队与账号' });
  await dialog.getByLabel('当前密码', { exact: true }).fill('TEST incorrect');
  await dialog.getByLabel('新密码', { exact: true }).fill('TEST-new-password-long');
  await dialog.getByRole('button', { name: '更改并退出所有会话' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Current password is incorrect');
  expect(await page.evaluate(() => sessionStorage.getItem('collosys.auth'))).not.toBeNull();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  expired = true;
  await page.getByRole('button', { name: '刷新活动' }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('collosys.auth'))).toBeNull();
  await expect(
    page.getByText('登录已过期，请重新登录。待发送的文件活动仍保存在本机。'),
  ).toBeVisible();
});
