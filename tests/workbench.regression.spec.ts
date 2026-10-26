import { test, expect, type Page } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { queryHistory, initializeHistory, type HistorySQL } from '../packages/backend/src/history';

async function fixture(page: Page) {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE,body TEXT)',
  );
  const sql: HistorySQL = {
    exec: (query, ...args) => {
      const s = db.prepare(query);
      if (!s.columns().length) {
        s.run(...args);
        return { toArray: () => [] };
      }
      return { toArray: () => s.all(...args) as any };
    },
  };
  initializeHistory(sql);
  const files = (count = 1) =>
    Array.from({ length: count }, (_, i) => ({
      path: `file-${String(i).padStart(3, '0')}.ts`,
      status: 'added',
      binary: false,
      beforeHash: null,
      afterHash: 'a'.repeat(64),
      size: 24,
      patch: '--- a/file.ts\n+++ b/file.ts\n@@ -0,0 +1,1 @@\n+export const TEST = 42;\n',
      truncated: false,
    }));
  const add = (id: string, kind: string, payload: unknown) =>
    db.prepare('INSERT INTO events(event_id,body) VALUES(?,?)').run(
      id,
      JSON.stringify({
        version: 1,
        id,
        workspaceId: 'ws',
        kind,
        occurredAt: 1000,
        receivedAt: 1000,
        actor: { id: 'owner', name: 'TEST Owner' },
        payload,
      }),
    );
  const cp = (n: number) =>
    add('cp' + n, 'checkpoint', {
      checkpointId: 'checkpoint' + n,
      parentId: null,
      label: 'TEST change ' + n,
      files: files(),
      totalFiles: 1,
      part: 1,
      parts: 1,
      source: 'local',
      backup: 'local-only',
    });
  const message = (n: number) =>
    add('msg' + n, 'agent.message', {
      adapter: 'codex',
      sessionId: 'long-session',
      messageId: 'm' + n,
      role: n % 2 ? 'assistant' : 'user',
      text: `## TEST message ${n}\n\nA readable **Markdown** paragraph with [a link](https://example.com).\n\n- First point\n- Second point\n\n\`\`\`ts\nexport const item = ${n};\n\`\`\``,
      checkpointId: null,
      association: 'observed-nearby',
    });
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'collosys.auth',
      JSON.stringify({ token: 'TEST-browser-session', user: { id: 'owner', name: 'TEST Owner' } }),
    ),
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let heldRoute: string | null = null,
    release: (() => void) | null = null,
    held = false;
  let failNext: string | null = null;
  const hold = (route: string) => {
    heldRoute = route;
    held = false;
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()),
      name = url.pathname.split('/').at(-1)!;
    let data: unknown = {},
      status = 200;
    if (name === 'health') data = { auth: 'production' };
    else if (name === 'projects')
      data = { projects: [{ id: 'test-project', name: 'TEST workbench' }] };
    else if (name === 'members')
      data = { members: [{ id: 'owner', name: 'TEST Owner', role: 'owner' }] };
    else if (name === 'events') {
      const after = Number(url.searchParams.get('after') ?? 0);
      const rows = db.prepare('SELECT seq,body FROM events WHERE seq>? ORDER BY seq').all(after);
      data = {
        events: rows.map((r) => ({ ...JSON.parse(r.body as string), seq: r.seq })),
        cursor: rows.at(-1)?.seq ?? after,
        hasMore: false,
      };
    } else if (name === 'ticket') {
      status = 503;
      data = { error: 'TEST transport uses polling' };
    } else if (
      ['history', 'sessions', 'messages', 'event', 'checkpoint-files', 'checkpoint-file'].includes(
        name,
      )
    ) {
      if (failNext === name) {
        failNext = null;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'TEST detail interrupted' }),
        });
        return;
      }
      const response = queryHistory(sql, new URL(`http://room/${name}${url.search}`));
      status = response.status;
      data = await response.json();
      if (name === heldRoute && !held) {
        held = true;
        await new Promise<void>((resolve) => (release = resolve));
        heldRoute = null;
      }
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return {
    db,
    cp,
    message,
    add,
    files,
    errors,
    hold,
    fail: (name: string) => (failNext = name),
    isHeld: () => held,
    release: () => {
      release?.();
      release = null;
    },
    close: () => {
      release?.();
      db.close();
    },
  };
}

test('history refresh spans a burst larger than one page; deep links and mobile Back preserve navigation', async ({
  page,
}) => {
  const f = await fixture(page);
  try {
    for (let n = 0; n < 80; n++) f.cp(n);
    f.fail('event');
    await page.goto('/');
    await expect(page.locator('.event-card')).toHaveCount(30);
    await expect(
      page.getByRole('alert').filter({ hasText: 'TEST detail interrupted' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.locator('.detail-header')).toContainText('TEST change 79');
    for (let n = 80; n < 125; n++) f.cp(n);
    await page.getByRole('button', { name: '刷新活动' }).click();
    await expect(page.locator('.event-card')).toHaveCount(75);
    await page.getByRole('button', { name: '加载更早的活动' }).click();
    await expect(page.locator('.event-card')).toHaveCount(105);
    await page.getByRole('button', { name: '加载更早的活动' }).click();
    await expect(page.locator('.event-card')).toHaveCount(125);
    await expect(page.locator('.event-card').filter({ hasText: 'TEST change 80' })).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.event-card').filter({ hasText: 'TEST change 0' }).click();
    await expect(page.getByRole('button', { name: '返回活动列表' })).toBeVisible();
    const link = page.url();
    expect(link).toContain('event=cp0');
    await page.goBack();
    await expect(page.locator('.event-list')).toBeVisible();
    await page.goto(link);
    await expect(page.locator('.detail-header')).toContainText('TEST change 0');
    await expect(page.locator('diffs-container [data-code]')).toContainText(
      'export const TEST = 42;',
    );
    await page.getByLabel('并排对比', { exact: true }).check();
    await expect(page.locator('diffs-container [data-code]').first()).toBeVisible();
    await page.screenshot({ path: '.local/verification/workbench-mobile.png' });
    expect(f.errors).toEqual([]);
  } finally {
    f.close();
  }
});

test('long session renders Markdown, keeps the reading anchor when prepending and reconciles an in-flight update', async ({
  page,
}) => {
  const f = await fixture(page);
  try {
    for (let n = 0; n < 120; n++) f.message(n);
    f.hold('messages');
    await page.goto('/?project=test-project&view=agent');
    await expect.poll(f.isHeld).toBe(true);
    f.message(120);
    await page.getByRole('button', { name: '刷新活动' }).click();
    await expect(page.locator('.event-card')).toContainText('120');
    f.release();
    await expect(page.locator('.conversation')).toContainText('TEST message 120');
    await expect(page.locator('.conversation h2').last()).toContainText('TEST message 120');
    expect(await page.locator('.transcript-message').count()).toBeLessThan(30);
    const scroll = page.locator('.conversation');
    await scroll.hover();
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(300);
    const anchor = async () =>
      scroll.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const row = [...el.querySelectorAll<HTMLElement>('[data-message-id]')].find(
          (x) => x.getBoundingClientRect().bottom > box.top,
        );
        return {
          id: row?.dataset.messageId,
          y: row ? row.getBoundingClientRect().top - box.top : 0,
        };
      });
    const before = await anchor();
    await page.getByRole('button', { name: '加载更早的消息' }).click();
    await expect(page.getByRole('button', { name: '加载更早的消息' })).toBeEnabled();
    await expect.poll(async () => (await anchor()).id).toBe(before.id);
    await expect.poll(async () => Math.abs((await anchor()).y - before.y)).toBeLessThan(8);
    f.message(121);
    await page.getByRole('button', { name: '刷新活动' }).click();
    await expect(page.getByRole('button', { name: '查看最新消息' })).toBeVisible();
    await page.getByRole('button', { name: '查看最新消息' }).click();
    await expect(scroll).toContainText('TEST message 121');
    await page.screenshot({ path: '.local/verification/workbench-session.png' });
    expect(f.errors).toEqual([]);
  } finally {
    f.close();
  }
});

test('checkpoint waits for all parts, refreshes an in-flight inventory and reads files beyond the first page', async ({
  page,
}) => {
  const f = await fixture(page),
    all = f.files(55);
  const part = (part: number, files: unknown[]) => ({
    checkpointId: 'large',
    parentId: null,
    label: 'TEST multipart',
    files,
    totalFiles: 55,
    part,
    parts: 2,
    source: 'local',
    backup: 'local-only',
  });
  try {
    f.add('first', 'checkpoint', part(1, all.slice(0, 30)));
    f.hold('checkpoint-files');
    await page.goto('/');
    await expect.poll(f.isHeld).toBe(true);
    f.add('second', 'checkpoint', part(2, all.slice(30)));
    await page.getByRole('button', { name: '刷新活动' }).click();
    await page.waitForTimeout(300);
    f.release();
    await expect(page.locator('.diff-bar')).toContainText('55 / 55');
    await expect(page.getByText('正在等待完整检查点', { exact: false })).toHaveCount(0);
    await page.getByRole('button', { name: '加载更多文件' }).click();
    f.fail('checkpoint-file');
    await page.getByRole('button', { name: /file-054.ts/ }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'TEST detail interrupted' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '重新读取', exact: true }).click();
    await expect(page.locator('diffs-container [data-code]')).toContainText(
      'export const TEST = 42;',
    );
    await page.getByLabel('搜索活动').fill('file-054.ts');
    await expect(page.locator('.event-card')).toHaveCount(1);
    await page.screenshot({ path: '.local/verification/workbench-diff.png' });
    expect(f.errors).toEqual([]);
  } finally {
    f.close();
  }
});
