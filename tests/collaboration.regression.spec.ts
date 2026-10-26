import { test, expect } from '@playwright/test';
import { sqliteEnv } from './sqlite-env';
import { collaboration } from '../packages/backend/src/collaboration';
test('older task edits and handoff acceptance refresh persisted versions across pages', async ({
  page,
}) => {
  const { db, env } = sqliteEnv(),
    actor = { id: 'alice', name: 'Alice', tokenHash: 'TEST', expiresAt: Date.now() + 60000 };
  db.prepare("INSERT INTO projects VALUES('test-project','demo-team','TEST')").run();
  db.prepare(
    "INSERT INTO project_members VALUES('test-project','alice','owner'),('test-project','bob','editor')",
  ).run();
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('TEST', 'alice', actor.expiresAt);
  for (let i = 0; i < 65; i++) {
    db.prepare(
      "INSERT INTO tasks(id,project_id,title,description,created_by,updated_at) VALUES(?,'test-project',?,'TEST','alice',1000)",
    ).run('task' + i, 'TEST task ' + i);
    db.prepare(
      "INSERT INTO handoffs VALUES(?,'test-project','bob','alice',?,'TEST context','TEST next',NULL,NULL,'pending',1000)",
    ).run('handoff' + i, 'TEST handoff ' + i);
  }
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'collosys.auth',
      JSON.stringify({ token: 'TEST', user: { id: 'alice', name: 'Alice' } }),
    ),
  );
  let holdNext = false,
    held = false,
    release: (() => void) | undefined;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = {},
      status = 200;
    if (url.pathname === '/api/health') data = { auth: 'production' };
    else if (url.pathname === '/api/projects')
      data = { projects: [{ id: 'test-project', name: 'TEST' }] };
    else if (url.pathname.endsWith('/members'))
      data = {
        members: [
          { id: 'alice', name: 'Alice', role: 'owner' },
          { id: 'bob', name: 'Bob', role: 'editor' },
        ],
      };
    else if (url.pathname.endsWith('/events')) data = { events: [], cursor: 0, hasMore: false };
    else if (url.pathname.endsWith('/history')) data = { items: [], head: 0, next: null };
    else if (url.pathname.endsWith('/ticket')) {
      status = 503;
      data = { error: 'TEST sockets disabled' };
    } else {
      try {
        const response = await collaboration(
          new Request(url, {
            method: route.request().method(),
            body: route.request().postData() ?? undefined,
          }),
          env,
          actor,
          'test-project',
          'owner',
        );
        if (response) {
          status = response.status;
          data = await response.json();
        }
        if (url.pathname.endsWith('/collaboration') && holdNext) {
          holdNext = false;
          held = true;
          await new Promise<void>((resolve) => (release = resolve));
        }
      } catch (e) {
        status = 409;
        data = { error: String(e) };
      }
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '任务与交接', exact: true }).click();
    await expect(page.getByRole('button', { name: '加载更早的任务' })).toBeVisible();
    holdNext = true;
    await expect.poll(() => held, { timeout: 7000 }).toBe(true);
    await page.getByRole('button', { name: '加载更早的任务' }).click();
    release?.();
    const row = page
      .locator('#panel-tasks article')
      .filter({ has: page.getByText('TEST task 0', { exact: true }) });
    await row.getByRole('button', { name: '编辑任务' }).click();
    await page.getByLabel('任务标题', { exact: true }).fill('TEST edited old task');
    await page.getByRole('button', { name: '保存任务' }).click();
    const updated = page
      .locator('#panel-tasks article')
      .filter({ hasText: 'TEST edited old task' });
    await expect(updated).toBeVisible();
    await updated.getByRole('button', { name: '编辑任务' }).click();
    await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('done');
    await page.getByRole('button', { name: '保存任务' }).click();
    await expect(updated).toContainText('完成');
    await page.getByRole('tab', { name: /^交接/ }).click();
    await page.getByRole('button', { name: '加载更早的交接' }).click();
    const handoff = page
      .locator('#panel-handoffs article')
      .filter({ has: page.getByText('TEST handoff 0', { exact: true }) });
    await handoff.getByRole('button', { name: '接收交接' }).click();
    await expect(handoff).toContainText('已接收');
    expect(db.prepare("SELECT version FROM tasks WHERE id='task0'").get()!.version).toBe(3);
  } finally {
    release?.();
    db.close();
  }
});
