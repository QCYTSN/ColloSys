import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, _electron as electron, expect } from '@playwright/test';

const native = process.argv.includes('--desktop');
let serviceReady = false;
for (let attempt = 0; attempt < 240; attempt++) {
  try {
    serviceReady = (
      await fetch('http://127.0.0.1:3407/design-lab', { signal: AbortSignal.timeout(1500) })
    ).ok;
  } catch {}
  if (serviceReady) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.ok(serviceReady, 'Start the local application before running this audit');
const evidence = path.resolve(
  `.local/codecast-app/design-v2-${native ? 'desktop' : 'browser'}-${Date.now()}`,
);
await fs.mkdir(evidence, { recursive: true });
const errors = [],
  external = [],
  checks = [],
  observations = {};
let browser, app, page;
async function check(name, action) {
  await action();
  checks.push(name);
  console.log('PASS', name);
}
async function capture(name) {
  await page.screenshot({ path: path.join(evidence, `${name}.png`), animations: 'disabled' });
}
async function menu(name) {
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
try {
  if (native) {
    const env = {
      ...process.env,
      COLLOSYS_DESIGN_LAB: '1',
      COLLOSYS_DESKTOP_PROFILE: `test-${randomUUID()}`,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
      args: [path.resolve('integrations/codecast/desktop/main.cjs')],
      env,
      timeout: 60000,
    });
    page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setContentSize(1440, 900);
      w.show();
    });
    observations.native = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      const p = w.webContents.getLastWebPreferences();
      return {
        visible: w.isVisible(),
        sandbox: p.sandbox,
        isolation: p.contextIsolation,
        node: p.nodeIntegration,
      };
    });
    assert.deepEqual(observations.native, {
      visible: true,
      sandbox: true,
      isolation: true,
      node: false,
    });
  } else {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') {
      external.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });
  if (!native)
    await page.goto('http://127.0.0.1:3407/design-lab', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('design-lab').waitFor({ timeout: 60000 });
  await check(
    'Original product route hosts the isolated sample with real local Google Sans',
    async () => {
      await expect(page.getByRole('heading', { name: '让会话回到上次读到的地方' })).toBeVisible();
      await expect(page.getByText('设计样板 · 示例数据', { exact: true })).toBeVisible();
      observations.font = await page.evaluate(async () => {
        await document.fonts.load('500 14px "Collo Google Sans"');
        return {
          loaded: document.fonts.check('500 14px "Collo Google Sans"'),
          family: getComputedStyle(document.querySelector('.pn-lab')).fontFamily,
        };
      });
      assert.ok(observations.font.loaded);
      assert.match(observations.font.family, /Collo Google Sans/);
      observations.hierarchy = await page.evaluate(() => {
        const paragraph = document.querySelector('.pn-message-body p');
        return {
          firstParagraphY: paragraph.getBoundingClientRect().top,
          header: document.querySelector('.pn-context-header').getBoundingClientRect().height,
          footerCount: document.querySelectorAll('.pn-evidence-footer').length,
        };
      });
      assert.ok(
        observations.hierarchy.firstParagraphY < 260,
        JSON.stringify(observations.hierarchy),
      );
      assert.equal(observations.hierarchy.footerCount, 0);
      await capture('01-conversation-1440');
    },
  );
  await check('Member filtering, search and manual-edit state have working controls', async () => {
    await page.getByRole('button', { name: '按成员筛选' }).click();
    await page.getByRole('menuitemradio', { name: '陈一', exact: true }).click();
    assert.equal(await page.locator('[data-activity]').count(), 2);
    await page.getByRole('button', { name: /清除筛选/ }).click();
    await page.getByLabel('搜索动态', { exact: true }).fill('不会有匹配的文字');
    await expect(page.getByText('没有匹配的动态', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '显示所有动态' }).click();
    await page.locator('[data-activity="manual"]').click();
    await page.getByRole('tab', { name: /会话/ }).click();
    await expect(page.getByText('这次是手动保存的改动')).toBeVisible();
    await page.locator('[data-activity="reading"]').click();
  });
  await check(
    'Incoming replay preserves historical reading, then follows explicit return to latest',
    async () => {
      const reader = page.getByTestId('design-conversation');
      await reader.evaluate((e) => {
        e.scrollTop = 0;
        e.dispatchEvent(new Event('scroll'));
      });
      const before = await reader.evaluate((e) => e.scrollTop);
      await menu('回放一条新回复');
      await expect(page.getByRole('button', { name: '有新内容 · 回到最新' })).toBeVisible();
      await expect(page.getByText('正在回放示例回复', { exact: true })).toBeHidden({
        timeout: 10000,
      });
      const after = await reader.evaluate((e) => e.scrollTop);
      assert.ok(Math.abs(before - after) < 3, `${before} -> ${after}`);
      await page.getByRole('button', { name: '有新内容 · 回到最新' }).click();
      await expect
        .poll(() => reader.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop))
        .toBeLessThan(4);
      observations.readerPosition = { before, after };
      await page.locator('[data-activity="navigation"]').click();
      await page.locator('[data-activity="reading"]').click();
      await expect
        .poll(() => reader.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop))
        .toBeLessThan(4);
    },
  );
  await check(
    'Original diff renderer displays actual fixture patch and long file paths',
    async () => {
      await page.getByRole('tab', { name: /文件变化/ }).click();
      await expect(page.getByTestId('design-diff')).toContainText('restoreReadingPosition');
      await expect(page.locator('.pn-diff-totals')).toHaveText('+30−5');
      await capture('02-changes-1440');
      await page.locator('.pn-file-list button').nth(3).click();
      await expect(page.getByTestId('design-diff')).toContainText('scrollToBottom');
      await page.getByRole('tab', { name: /会话/ }).click();
      await page.getByRole('tab', { name: /文件变化/ }).click();
      await expect(page.locator('.pn-file-path')).toContainText('src/legacy/scrollToBottom.ts');
      await page.locator('[data-activity="long"]').click();
      await page.getByRole('tab', { name: /文件变化/ }).click();
      await expect(page.locator('.pn-file-path')).toContainText('混合语言与超长目录');
      await page.locator('[data-activity="reading"]').click();
      await page.getByRole('tab', { name: /文件变化/ }).click();
      await expect(page.locator('.pn-file-path')).toContainText('src/legacy/scrollToBottom.ts');
    },
  );
  await check(
    'Checkpoint preview has explicit test boundaries, confirmation, stale rejection and focus return',
    async () => {
      await page.getByRole('tab', { name: /检查点/ }).click();
      await capture('03-checkpoints-1440');
      const trigger = page.getByRole('button', { name: '查看文件范围', exact: true }).first();
      observations.expansion = await page.evaluate(async () => {
        const toggle = document.querySelector('.pn-scope-toggle');
        const panel = document.getElementById(toggle.getAttribute('aria-controls'));
        const frames = [];
        const start = performance.now();
        toggle.click();
        await new Promise((resolve) => {
          function sample() {
            frames.push({
              ms: Math.round(performance.now() - start),
              height: panel.getBoundingClientRect().height,
            });
            if (performance.now() - start < 300) requestAnimationFrame(sample);
            else resolve();
          }
          requestAnimationFrame(sample);
        });
        return frames;
      });
      assert.ok(observations.expansion.some((f) => f.height > 1));
      const fullHeight = observations.expansion.at(-1).height;
      assert.ok(
        observations.expansion.some((f) => f.height > 1 && f.height < fullHeight - 1),
        'Expansion should have real intermediate frames',
      );
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const scope = page.getByRole('region', { name: '检查点文件范围', exact: true });
      await expect(scope).toContainText('林舟的设备');
      await expect(scope).toContainText('restoreReadingPosition.ts');
      await expect(page.getByRole('button', { name: '确认演练' })).toHaveCount(0);
      await capture('04-teammate-inline');
      await page.getByRole('button', { name: '收起文件范围' }).click();
      await expect(trigger).toBeFocused();
      await page.getByRole('button', { name: '查看文件范围' }).nth(1).click();
      await expect(scope).toContainText('cp-6e19b2');
      await page.locator('[data-activity="manual"]').click();
      await page.getByRole('tab', { name: /检查点/ }).click();
      const ownTrigger = page.getByRole('button', { name: '预览恢复范围', exact: true }).first();
      await ownTrigger.click();
      await expect(page.getByRole('button', { name: '确认演练' })).toBeDisabled();
      await capture('04-restore-dialog');
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: '模拟预览失效' }).click();
      await expect(page.getByRole('alert')).toContainText('文件发生了变化');
      await expect(page.getByRole('button', { name: '确认演练' })).toBeDisabled();
      await page.getByRole('button', { name: '重新预览', exact: true }).click();
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: '确认演练', exact: true }).click();
      await expect(page.getByRole('heading', { name: '恢复流程演练完成' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(ownTrigger).toBeFocused();
      await page.locator('[data-activity="reading"]').click();
    },
  );
  await check(
    'Menu keyboard dismissal, failed/loading/empty states and reduced motion setting',
    async () => {
      const more = page.getByRole('button', { name: '更多操作', exact: true });
      await more.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Escape');
      await expect(more).toBeFocused();
      await menu('连接失败');
      await expect(page.getByText('暂时无法读取动态', { exact: true })).toBeVisible();
      await capture('05-error');
      await page.getByRole('button', { name: '重新连接', exact: true }).click();
      await menu('加载状态');
      await expect(page.getByLabel('正在加载活动')).toBeVisible();
      await menu('空状态');
      await expect(page.getByText('这里还没有动态', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '显示所有动态' }).click();
      await page.getByRole('button', { name: '显示设置', exact: true }).click();
      await page.getByRole('checkbox', { name: /减少动效/ }).check();
      const assertStillSurfaces = async () => {
        const styles = await page.locator('.pn-overlay, .pn-dialog, .pn-menu').evaluateAll((els) =>
          els.map((el) => ({
            animation: getComputedStyle(el).animationName,
            transition: getComputedStyle(el).transitionDuration,
          })),
        );
        assert.ok(styles.length > 0);
        assert.ok(styles.every((style) => style.animation === 'none' && style.transition === '0s'));
      };
      await assertStillSurfaces();
      await page.getByRole('button', { name: '完成', exact: true }).click();
      await expect(page.getByTestId('design-lab')).toHaveClass(/pn-reduce-motion/);
      await more.click();
      await assertStillSurfaces();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '显示设置', exact: true }).click();
      await page.getByRole('checkbox', { name: /减少动效/ }).uncheck();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await assertStillSurfaces();
      await page.getByRole('button', { name: '完成', exact: true }).click();
      await more.click();
      await assertStillSurfaces();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '显示设置', exact: true }).click();
      await page.getByRole('checkbox', { name: /减少动效/ }).check();
      await page.getByRole('button', { name: '完成', exact: true }).click();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      assert.equal(
        await page
          .locator('.pn-inline-preview')
          .first()
          .evaluate((el) => getComputedStyle(el).transitionDuration),
        '0s',
      );
    },
  );
  await check(
    '1280 × 800 and narrow reader retain main controls without page overflow',
    async () => {
      if (native)
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].setContentSize(1280, 800),
        );
      else await page.setViewportSize({ width: 1280, height: 800 });
      await page.getByRole('tab', { name: /会话/ }).click();
      await page.getByTestId('design-conversation').evaluate((el) => {
        el.scrollTop = 0;
        el.dispatchEvent(new Event('scroll'));
      });
      await capture('06-conversation-1280');
      await expect(page.getByRole('tab', { name: /检查点/ })).toBeVisible();
      const separator = page.getByRole('separator', { name: '调整活动列表宽度' });
      await separator.focus();
      for (let step = 0; step < 14; step++) await page.keyboard.press('ArrowRight');
      await expect(page.locator('.pn-compact-evidence > summary')).toBeVisible();
      await page.locator('.pn-compact-evidence > summary').click();
      await expect(page.locator('.pn-compact-evidence')).toContainText('未异地备份');
      await capture('07-narrow-reader');
      await page.locator('.pn-compact-evidence > summary').click();
      observations.overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      assert.ok(observations.overflow.scroll <= observations.overflow.viewport + 1);
      await expect(page.getByRole('tab', { name: /检查点/ })).toBeVisible();
      const persisted = await page.evaluate(() => localStorage.getItem('collo.design.layout.v2'));
      assert.ok(persisted);
      await page.reload();
      await page.getByTestId('design-lab').waitFor();
      assert.equal(
        await page.evaluate(() => localStorage.getItem('collo.design.layout.v2')),
        persisted,
      );
    },
  );
  await check(
    'Reading contrast is at least 4.5 on actual code and muted-text surfaces',
    async () => {
      await page.getByRole('tab', { name: /文件变化/ }).click();
      await page.locator('.pn-file-list button').first().click();
      await expect(page.getByTestId('design-diff')).toContainText('restoreReadingPosition');
      await page.getByTestId('design-diff').locator('diffs-container').waitFor();
      observations.contrast = await page.evaluate(() => {
        const host = document.querySelector('diffs-container');
        const probe = document.createElement('span');
        host.parentElement.append(probe);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        const rgb = (value) => {
          probe.style.color = value.replace(/var\((--[\w-]+)\)/g, (_, token) =>
            getComputedStyle(host).getPropertyValue(token).trim(),
          );
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = getComputedStyle(probe).color;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const luminance = (c) =>
          c
            .map((n) => n / 255)
            .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
            .reduce((s, n, i) => s + n * [0.2126, 0.7152, 0.0722][i], 0);
        const ratio = (a, b) =>
          (Math.max(luminance(a), luminance(b)) + 0.05) /
          (Math.min(luminance(a), luminance(b)) + 0.05);
        // Explicit backgrounds also pin the native renderer's inherited light-surface contract.
        const surfaces = [
          'var(--pn-bg)',
          'var(--diffs-bg-addition-override)',
          'var(--diffs-bg-deletion-override)',
          'var(--diffs-bg-addition-emphasis-override)',
          'var(--diffs-bg-deletion-emphasis-override)',
        ];
        const tokens = [
          '--hljs-number',
          '--hljs-string',
          '--hljs-comment',
          '--hljs-keyword',
          '--hljs-variable',
          '--hljs-function',
          '--hljs-type',
        ];
        const values = tokens.map((token) => ({
          token,
          minimum: Math.min(
            ...surfaces.map((surface) => ratio(rgb(`var(${token})`), rgb(surface))),
          ),
        }));
        values.push({
          token: 'secondary-text',
          minimum: ratio(rgb('var(--pn-muted)'), rgb('var(--pn-shell)')),
        });
        probe.remove();
        return values;
      });
      for (const token of observations.contrast)
        assert.ok(token.minimum >= 4.5, JSON.stringify(token));
    },
  );
  if (!native)
    await check(
      'Narrow layout can return from a detail to search and select another activity',
      async () => {
        await page.setViewportSize({ width: 760, height: 800 });
        await expect(page.getByLabel('搜索动态', { exact: true })).toBeVisible();
        await page.locator('[data-activity="manual"]').click();
        await expect(page.getByRole('heading', { name: '补充本地恢复的边界说明' })).toBeVisible();
        await page.getByRole('button', { name: '显示活动列表', exact: true }).click();
        await page.getByLabel('搜索动态', { exact: true }).fill('阅读位置');
        await page.locator('[data-activity="reading"]').click();
        await expect(page.getByRole('heading', { name: '让会话回到上次读到的地方' })).toBeVisible();
        await capture('08-narrow-navigation');
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
      },
    );
  if (!native) {
    await check('Small-width fallback keeps search, detail and evidence reachable', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: '显示活动列表', exact: true }).click();
      await page.getByLabel('搜索动态', { exact: true }).fill('');
      await page.locator('[data-activity="reading"]').click();
      await capture('09-small-width');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
    await check('The real native Codecast reader renders the identical scenario', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('http://127.0.0.1:3407/design-lab?reference=codecast&activity=reading');
      await expect(page.locator('.pn-native-reference')).toContainText('Codecast 原生会话组件');
      await expect(page.locator('.pn-reference-reader')).toContainText('只有我点击');
      await page.screenshot({
        path: path.join(evidence, '10-native-reference.png'),
        animations: 'disabled',
      });
      await page.getByRole('button', { name: '返回新样板', exact: true }).click();
      await expect(page.getByTestId('design-lab')).toBeVisible();
    });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await fs.writeFile(
    path.join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        checks,
        errors,
        external,
        observations,
        limitation:
          'Design fixture interactions only; preview never writes files. Native run uses actual Electron window.',
      },
      null,
      2,
    ),
  );
  console.log('EVIDENCE', evidence);
} catch (error) {
  await page?.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
  await fs.writeFile(
    path.join(evidence, 'result.json'),
    JSON.stringify({ passed: false, checks, errors, external, failure: error.message }, null, 2),
  );
  console.error('EVIDENCE', evidence);
  throw error;
} finally {
  if (browser) await browser.close();
  if (app) await app.close();
}
