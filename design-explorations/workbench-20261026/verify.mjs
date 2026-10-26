import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:3417';
const dir = path.resolve('docs/design/evidence/candidates');
await fs.mkdir(dir, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true });
const page = await b.newPage();
const errors = [],
  external = [],
  checks = [],
  dimensions = [];
const capture = !process.argv.includes('--interactions-only');
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (!['127.0.0.1'].includes(new URL(r.url()).hostname)) external.push(r.url());
});
async function run(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS', name);
}
try {
  if (capture)
    for (const layout of ['queue', 'focus'])
      for (const [width, height] of [
        [1440, 900],
        [1280, 800],
        [1920, 1080],
        [800, 900],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await page.goto(`${origin}/?layout=${layout}&work=CW-42`);
        await page.getByRole('button', { name: '准备交接', exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: path.join(dir, `${layout}-${width}.png`),
          animations: 'disabled',
        });
        const dims = await page.evaluate(() => ({
          viewport: innerWidth,
          scroll: document.documentElement.scrollWidth,
          main: document.querySelector('main').getBoundingClientRect().toJSON(),
          detail: document.querySelector('.detail-body').getBoundingClientRect().toJSON(),
          font: getComputedStyle(document.body).fontFamily,
        }));
        dimensions.push({ layout, width, height, ...dims });
        assert.ok(dims.scroll <= width + 1, `${layout} ${width} overflow`);
      }
  if (capture)
    checks.push(
      'A/B rendered at 1440×900, 1280×800, 1920×1080, 800×900 and 390×844 without document horizontal overflow',
    );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/?layout=queue&work=CW-42`);
  await run('search and empty result recovery', async () => {
    await page.getByLabel('搜索工作', { exact: true }).fill('nothing-matches');
    await expect(page.getByText('没有匹配的工作', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    await expect(page.getByRole('button', { name: '准备交接', exact: true })).toBeVisible();
  });
  await run('comment disabled when empty; preview comment added to selected work', async () => {
    await expect(page.getByRole('button', { name: '添加预览评论' })).toBeDisabled();
    await page.getByLabel('写评论', { exact: true }).fill('审查测试：缺少证据时应保留来源未知。');
    await page.getByRole('button', { name: '添加预览评论' }).click();
    await expect(
      page.getByText('审查测试：缺少证据时应保留来源未知。', { exact: true }),
    ).toHaveCount(1);
  });
  await run('handoff dialog traps focus, Esc closes and returns focus', async () => {
    const trigger = page.getByRole('button', { name: '准备交接', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 10; i++) await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
    await dialog.evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((a) => a.finished));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    assert.equal(await dialog.evaluate((el) => getComputedStyle(el).opacity), '1');
    assert.equal(
      await dialog.evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgb(255, 255, 255)',
    );
    await page.screenshot({ path: path.join(dir, 'handoff-dialog.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
  await run('member menu keyboard selection and dismissal', async () => {
    await page.getByRole('button', { name: '所有工作 6', exact: true }).click();
    await page.getByRole('button', { name: '成员', exact: true }).click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.getByRole('button', { name: '成员', exact: true }).click();
    await page.getByRole('menuitemradio', { name: '林舟', exact: true }).click();
    await expect(page.locator('.work-row')).toHaveCount(2);
    await page.getByRole('button', { name: '林舟', exact: true }).click();
    await page.getByRole('menuitemradio', { name: '所有成员', exact: true }).click();
  });
  await run('command dialog searches files and selects work', async () => {
    await page.keyboard.press('Control+k');
    await page.getByLabel('查找工作内容').fill('restore.ts');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /恢复前/ })
      .click();
    await expect(page.locator('.work-row.selected')).toContainText('CW-39');
  });
  await run('own restore preview rejects simulated staleness; no write action exists', async () => {
    await page.getByRole('tab', { name: '来源与保存', exact: true }).click();
    await page.getByRole('button', { name: '预览本地恢复', exact: true }).click();
    await page.getByRole('button', { name: '模拟预览后继续编辑', exact: true }).click();
    await expect(page.getByText('预览已过期', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '重新生成预览', exact: true }).click();
    await expect(page.getByText('恢复影响预览 · 演示', { exact: true })).toBeVisible();
  });
  await run('unknown origin does not invent an Agent or restoration permission', async () => {
    await page.locator('.work-row').filter({ hasText: 'EV-18' }).click();
    await expect(page.locator('.source-sheet')).toContainText('缺少 Agent 证据');
    await expect(page.getByRole('button', { name: '预览本地恢复', exact: true })).toHaveCount(0);
  });
  await run('narrow window switches between readable record and diff', async () => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.getByRole('button', { name: '变更 1', exact: true }).click();
    await expect(page.getByRole('region', { name: '文件变化' })).toBeVisible();
    await page.getByRole('button', { name: '记录', exact: true }).click();
    await expect(page.getByRole('region', { name: '工作记录' })).toBeVisible();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/?layout=focus&work=CW-42`);
  await run('focus workspace expands and collapses context', async () => {
    await page.getByRole('button', { name: '收起变更面板', exact: true }).click();
    await expect(page.getByRole('region', { name: '文件变化' })).not.toBeVisible();
    await page.getByRole('button', { name: '展开变更面板', exact: true }).click();
    await expect(page.getByRole('region', { name: '文件变化' })).toBeVisible();
  });
  await run('collapsed desktop evidence remains reachable after narrow resize', async () => {
    await page.getByRole('button', { name: '收起变更面板', exact: true }).click();
    await page.setViewportSize({ width: 800, height: 900 });
    await page.getByRole('button', { name: '变更 2', exact: true }).click();
    await expect(page.getByRole('region', { name: '文件变化' })).toBeVisible();
    await page.screenshot({
      path: path.join(dir, 'focus-collapsed-to-narrow-changes.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: '展开变更面板', exact: true }).click();
  });
  await run('viewed control has discoverable tooltip and pressed state', async () => {
    const button = page.getByRole('button', { name: '标记已查看', exact: true });
    await button.hover();
    await expect(page.getByRole('tooltip')).toContainText('标记已查看');
    await button.click();
    await expect(
      page.getByRole('button', { name: '已查看 · 点击撤销', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
  await run('handoff creates a retained, inspectable local draft', async () => {
    await page.getByRole('button', { name: '准备交接', exact: true }).click();
    await page.getByRole('button', { name: '生成预览草稿', exact: false }).click();
    const draft = page.getByRole('dialog', { name: '交接草稿', exact: true });
    await expect(draft).toContainText('明确每次变更的执行来源');
    await expect(draft).toContainText('陈一');
    await expect(draft).toContainText('手动编辑与 Agent');
    await draft.evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((a) => a.finished));
    });
    await page.screenshot({ path: path.join(dir, 'handoff-draft.png'), animations: 'disabled' });
    await draft.getByRole('button', { name: '完成', exact: true }).click();
    await page.getByRole('button', { name: '查看交接草稿', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '交接草稿', exact: true })).toContainText(
      'attribution.ts',
    );
    await page.keyboard.press('Escape');
  });
  await run('incoming record waits for the reader', async () => {
    await page.getByRole('button', { name: '体验状态', exact: true }).click();
    await page.getByRole('menuitem', { name: '模拟收到新记录', exact: true }).click();
    await expect(page.getByRole('button', { name: '查看 1 条新记录', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看 1 条新记录', exact: true }).click();
    await expect(page.getByText('示例新记录：已补充来源验证的说明。', { exact: true })).toHaveCount(
      1,
    );
  });
  await run('error, denied and first-use states have exits', async () => {
    for (const [label, text] of [
      ['连接失败', '暂时无法连接'],
      ['无访问权限', '你没有这个项目的访问权限'],
      ['首次使用', '让团队看见你的工作'],
    ]) {
      await page.getByRole('button', { name: '体验状态', exact: true }).click();
      await page.getByRole('menuitem', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: text, exact: true })).toBeVisible();
      await page.screenshot({
        path: path.join(
          dir,
          `state-${label === '连接失败' ? 'error' : label === '首次使用' ? 'empty' : 'denied'}.png`,
        ),
      });
      await page
        .getByRole('button', {
          name: label === '连接失败' ? '查看已有内容' : '返回示例项目',
          exact: true,
        })
        .click();
    }
  });
  await run('reduced motion disables transitions and animations', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '查看交接草稿', exact: true }).click();
    assert.equal(
      await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).animationName),
      'none',
    );
    await page.keyboard.press('Escape');
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  checks.push('No page errors or external requests');
  await fs.writeFile(
    path.join(dir, 'validation.json'),
    JSON.stringify({ passed: true, checks, errors, external, dimensions }, null, 2),
  );
} catch (e) {
  await fs.writeFile(
    path.join(dir, 'validation.json'),
    JSON.stringify(
      { passed: false, error: e.message, checks, errors, external, dimensions },
      null,
      2,
    ),
  );
  await page.screenshot({ path: path.join(dir, 'failure.png') });
  throw e;
} finally {
  await b.close();
}
