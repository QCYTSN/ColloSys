import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:3407/workbench-preview';
const out = path.resolve(
  process.env.COLLOSYS_VISUAL_EVIDENCE_DIR ?? 'docs/workbench-revision/evidence',
);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: path.resolve('.local/context-videos'), size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
const devtools = await context.newCDPSession(page);
await devtools.send('DOM.enable');
await devtools.send('CSS.enable');
const errors = [],
  external = [],
  checks = [],
  measurements = [],
  motion = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  const u = new URL(r.url());
  if (['http:', 'https:'].includes(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname))
    external.push(u.origin);
});
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log('PASS', name);
};
const settle = async () => page.waitForTimeout(280);
async function ready(url = origin) {
  await page.goto(url);
  await page.locator('.cw-app').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await settle();
}
async function capture(name) {
  await page.screenshot({ path: path.join(out, name + '.png'), animations: 'allow' });
}
async function scene(name) {
  await page.getByRole('button', { name: '预览场景', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
  await settle();
}
async function select(n) {
  await page.locator(`.cw-index-panel [data-activity="activity-${n}"]`).click();
  await expect(page).toHaveURL(new RegExp(`activity=activity-${n}(?:&|$)`));
  await settle();
}
async function anchor() {
  return page.locator('.cw-reader-scroll').evaluate((e) => {
    const y = e.getBoundingClientRect().top;
    const n = [...e.querySelectorAll('[data-message-id]')].find(
      (n) => n.getBoundingClientRect().bottom > y + 3,
    );
    return {
      top: e.scrollTop,
      id: n?.dataset.messageId,
      offset: n ? n.getBoundingClientRect().top - y : null,
    };
  });
}
async function sampleMotion(selector, action, label) {
  await page.evaluate((selector) => {
    window.__cwFrames = [];
    const start = performance.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) {
        const r = el.getBoundingClientRect(),
          s = getComputedStyle(el);
        window.__cwFrames.push({
          t: performance.now() - start,
          width: r.width,
          opacity: Number(s.opacity),
          visibility: s.visibility,
        });
      }
      if (performance.now() - start < 500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, selector);
  await action();
  await page.waitForTimeout(540);
  const frames = await page.evaluate(() => window.__cwFrames);
  motion.push({ label, frames });
  return frames;
}
let failed;
try {
  await check('reading geometry and real fonts at five viewports', async () => {
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
      [1920, 1080],
      [800, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await ready();
      const m = await page.evaluate(() => {
        const box = (s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return {
          viewport: { width: innerWidth, height: innerHeight },
          reader: box('.cw-reader-scroll'),
          workspace: box('.cw-workspace'),
          heading: box('.cw-heading-copy'),
          transcript: box('.cw-transcript'),
          composerBox: box('.cw-composer-box'),
          firstText: box('.cw-prose p'),
          index: box('.cw-index-panel'),
          font: document.fonts.check('14px ColloWorkspace'),
          overflow: document.documentElement.scrollWidth,
          bodySize: getComputedStyle(document.querySelector('.cw-prose')).fontSize,
          devicePixelRatio,
        };
      });
      assert.equal(m.overflow, width);
      assert.equal(m.font, true);
      assert.equal(m.bodySize, '14px');
      if (width === 1280) {
        const { root } = await devtools.send('DOM.getDocument');
        const { nodeId } = await devtools.send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: '.cw-prose p',
        });
        m.platformFonts = (await devtools.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
        assert.ok(m.platformFonts.some((font) => font.isCustomFont && font.glyphCount > 0));
        assert.ok(m.platformFonts.some((font) => !font.isCustomFont && font.glyphCount > 0));
      }
      if (width >= 1280) {
        assert.ok(m.workspace.x + m.workspace.width <= width - 10, 'workspace has its right inset');
        assert.ok(
          Math.abs(m.heading.x - m.transcript.x) <= 1,
          'title and transcript share an axis',
        );
        assert.ok(
          Math.abs(m.composerBox.x - m.transcript.x) <= 1,
          'composer and transcript share an axis',
        );
        assert.ok(m.firstText.y <= 184, `first text ${m.firstText.y}`);
        assert.ok(m.reader.height >= height - 280);
        assert.ok(m.index.width >= 260 && m.index.width <= 400);
      } else assert.ok(m.index.width < 2);
      measurements.push(m);
      await capture(`context-${width}`);
      await page.getByRole('tab', { name: /文件变化/ }).click();
      await page.locator('diffs-container').first().waitFor();
      await settle();
      m.diff = await page
        .locator('diffs-container')
        .first()
        .evaluate((host) => {
          const code = [...host.shadowRoot.querySelectorAll('[data-code] [data-line]')].find(
            (line) => line.textContent.trim(),
          );
          const r = code.getBoundingClientRect();
          return { firstCodeY: r.y, lineHeight: r.height, width: r.width };
        });
      await capture(`changes-${width}`);
    }
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready();
  await check('actual native component with identical 30 source messages', async () => {
    await scene('Codecast 原生同内容对照');
    await page.locator('.cw-native-reader').waitFor();
    await page
      .locator('#msg-activity-1-message-1')
      .getByText(
        '这次只调整来源表达和恢复入口。手动保存的文件必须独立显示，不能因为附近有一段 Codex 日志就归给 Agent。请先看现有契约，再检查测试。',
        { exact: true },
      )
      .waitFor();
    await settle();
    await capture('native-component-same-content-1280');
    await page.getByRole('button', { name: '返回候选', exact: true }).click();
    await page.locator('.cw-app').waitFor();
  });
  await check(
    'keyboard member filtering, empty search recovery and bounded panel resizing',
    async () => {
      const trigger = page.locator('.cw-index-panel .cw-member-filter');
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menu')).toBeVisible();
      await page.keyboard.press('End');
      await expect(page.getByRole('menuitemradio', { name: '陈一', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(trigger).toContainText('陈一');
      await expect(trigger).toBeFocused();
      await page.getByRole('textbox', { name: '查找活动', exact: true }).fill('不存在的工作');
      await expect(page.getByText('没有匹配的活动', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '清除筛选', exact: true }).click();
      await expect(page.locator('.cw-index-panel [data-activity]')).toHaveCount(9);
      const handle = await page.getByRole('separator', { name: '调整活动索引宽度' }).boundingBox();
      const before = await page.locator('.cw-index-panel').boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + 40);
      await page.mouse.down();
      await page.mouse.move(handle.x + 70, handle.y + 40, { steps: 8 });
      await page.mouse.up();
      await settle();
      const resized = await page.locator('.cw-index-panel').boundingBox();
      assert.ok(resized.width > before.width + 40 && resized.width <= 400);
      await ready();
    },
  );
  await check(
    '100 activities do not move the primary reader; selected activity stays reachable',
    async () => {
      const before = await page.locator('.cw-reader-scroll').boundingBox();
      await scene('10 人 · 100 条活动');
      await expect(page.locator('.cw-index-panel [data-activity]')).toHaveCount(100);
      const after = await page.locator('.cw-reader-scroll').boundingBox();
      assert.equal(before.y, after.y);
      assert.equal(before.height, after.height);
      await select(97);
      await expect(page.locator('.cw-index-panel [data-activity="activity-97"]')).toBeInViewport();
      await capture('dense-100-selected');
      await select(1);
    },
  );
  await check(
    'long conversation pages and activity return preserve measured reading anchor',
    async () => {
      const scroll = page.locator('.cw-reader-scroll');
      await scroll.evaluate((e) => (e.scrollTop = 2600));
      await settle();
      const before = await anchor();
      await select(2);
      await select(1);
      const after = await anchor();
      assert.equal(after.id, before.id);
      assert.ok(Math.abs(after.offset - before.offset) < 5, JSON.stringify({ before, after }));
      await scroll.evaluate((e) => (e.scrollTop = e.scrollHeight));
      await settle();
      const atBottom = await anchor();
      await page.getByRole('button', { name: '加载后续 30 条', exact: true }).click();
      await page.waitForTimeout(350);
      const loaded = await anchor();
      assert.equal(loaded.id, atBottom.id);
      assert.ok(Math.abs(loaded.offset - atBottom.offset) < 5);
      assert.ok((await page.locator('.cw-message').count()) < 30, 'virtual reader is bounded');
      await capture('long-context-page');
    },
  );
  await check('incoming messages wait for reader intent and then land at newest', async () => {
    await page.locator('.cw-reader-scroll').evaluate((e) => (e.scrollTop = 1500));
    await settle();
    const before = await anchor();
    await scene('模拟收到新记录');
    const after = await anchor();
    assert.equal(after.id, before.id);
    assert.ok(Math.abs(after.offset - before.offset) < 3);
    await page.getByRole('button', { name: /1 条新记录/ }).click();
    await expect(page.getByText(/新增捕获记录（模拟）/)).toBeVisible();
    await capture('new-record-reader-intent');
  });
  await check(
    'real diff has context, additions, deletions, original path and line selection',
    async () => {
      await page.getByRole('tab', { name: /文件变化/ }).click();
      await settle();
      const host = page.locator('diffs-container').first();
      const facts = await host.evaluate((e) => {
        const lines = [...e.shadowRoot.querySelectorAll('[data-code] [data-line]')];
        return lines.map((l) => ({
          type: l.dataset.lineType,
          line: l.dataset.line,
          text: l.textContent,
        }));
      });
      assert.ok(facts.some((l) => l.type === 'change-addition'));
      assert.ok(facts.some((l) => l.type === 'change-deletion'));
      assert.ok(facts.some((l) => !l.type.startsWith('change-')));
      assert.ok(facts.some((l) => l.text.includes('checkpointId')));
      const gutter = host
        .locator('[data-gutter] [data-column-number][data-line-type="change-deletion"]')
        .first();
      if (await gutter.count()) {
        await gutter.click();
        await expect(page.locator('.cw-selection')).toBeVisible();
      } else throw Error('Expected real selectable diff line numbers');
      await capture('real-diff-line-selection');
      await page
        .locator('.cw-file-list button')
        .filter({ hasText: 'packages/web/src/capture' })
        .click();
      await expect(page.locator('.cw-file-heading')).toContainText(
        'packages/web/src/capture/describeChange.ts',
      );
      await page
        .locator('.cw-file-list button')
        .filter({ hasText: 'validateCheckpointCompletenessAndOwnership.ts' })
        .click();
      await settle();
      await page.locator('.cw-diff-scroll').hover();
      await page.mouse.wheel(0, 650);
      await settle();
      const offset = await page.locator('.cw-diff-scroll').evaluate((e) => e.scrollTop);
      assert.ok(offset > 200);
      await select(2);
      await select(1);
      await page.waitForTimeout(950);
      assert.ok(
        (await page.locator('.cw-file-heading').innerText()).includes('validateCheckpoint'),
      );
      assert.ok(
        Math.abs((await page.locator('.cw-diff-scroll').evaluate((e) => e.scrollTop)) - offset) < 5,
      );
      await capture('long-path-diff');
    },
  );
  await check('binary, truncated, excluded and path-change cases remain honest', async () => {
    await page.locator('.cw-file-list button').filter({ hasText: 'recovery-flow.png' }).click();
    await expect(page.getByRole('heading', { name: '二进制文件', exact: true })).toBeVisible();
    await page.locator('.cw-file-list button').filter({ hasText: 'large-history.json' }).click();
    await expect(
      page.getByText('仅展示已捕获片段，不能据此恢复完整文件。', { exact: true }),
    ).toBeVisible();
    await page.locator('.cw-file-list button').filter({ hasText: 'private-source.txt' }).click();
    await expect(page.getByRole('heading', { name: '内容未捕获', exact: true })).toBeVisible();
    await page.locator('.cw-file-list button').filter({ hasText: 'restore-old.md' }).click();
    await expect(page.getByText(/协议未声明重命名关系/)).toBeVisible();
  });
  await check('task done, offline pending and no Agent attribution coexist', async () => {
    await select(4);
    await expect(page.locator('.cw-heading-copy')).toContainText('任务已完成');
    await expect(page.locator('.cw-heading-copy')).toContainText('本机待同步 3 条');
    await page.getByRole('button', { name: '来源与保存', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('未关联 Agent 会话');
    await expect(dialog).toContainText('无异机备份证据');
    await capture('independent-status-facts');
    await page.keyboard.press('Escape');
    await settle();
  });
  await check('comment and inspectable unsent handoff with keyboard focus return', async () => {
    await page
      .getByRole('button', { name: '添加评论', exact: true })
      .isDisabled()
      .then((v) => assert.equal(v, true));
    await page
      .getByRole('textbox', { name: '写协作评论' })
      .fill('离线时仍保留本机已保存事实；等待服务确认。');
    await page.getByRole('button', { name: '添加评论', exact: true }).click();
    await expect(page.locator('.cw-comments')).toContainText('离线时仍保留本机已保存事实');
    await expect(page.locator('.cw-comments')).toBeInViewport();
    await page.getByRole('button', { name: '准备交接', exact: true }).click();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.getByRole('dialog').evaluate((e) => e.contains(document.activeElement)));
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '准备交接', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '准备交接', exact: true }).click();
    await page.getByRole('button', { name: '保留交接草稿', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('尚未发送');
    await expect(page.getByRole('dialog')).toContainText('无已关联会话');
    await capture('handoff-retained-draft');
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.getByRole('button', { name: '查看交接草稿', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('无可用关联，不伪造');
    await page.keyboard.press('Escape');
    await settle();
  });
  await check(
    'own unlinked directory history, explicit confirmation and stale preview refusal',
    async () => {
      await page
        .locator('.cw-index-panel')
        .getByRole('button', { name: /我的目录历史/ })
        .click();
      await expect(page.getByRole('dialog')).toContainText('未关联任务');
      await page.getByRole('button', { name: '预览恢复', exact: true }).first().click();
      await expect(page.getByRole('button', { name: '确认演练', exact: true })).toBeDisabled();
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: '模拟目录变化', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('预览已过期');
      await expect(page.getByRole('button', { name: '确认演练', exact: true })).toHaveCount(0);
      await capture('stale-restore-preview');
      await page.getByRole('button', { name: '重新生成预览', exact: true }).click();
      await expect(page.getByRole('checkbox')).not.toBeChecked();
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: '确认演练', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('没有创建真实备份或修改文件');
      await page.keyboard.press('Escape');
      await settle();
      await select(5);
      await page.getByRole('button', { name: '来源与保存', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('共享检查点 1/2 片');
      await expect(page.getByRole('dialog').getByRole('button', { name: /恢复/ })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await settle();
    },
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready();
  await check('actual evidence/index transitions, exits and rapid interruption', async () => {
    const open = await sampleMotion(
      '.cw-evidence',
      () => page.getByRole('button', { name: '来源与保存', exact: true }).click(),
      'evidence-open',
    );
    assert.ok(open.some((f) => f.width > 10 && f.width < 330));
    await capture('evidence-open');
    const close = await sampleMotion(
      '.cw-evidence',
      () => page.getByRole('button', { name: '关闭来源面板', exact: true }).click(),
      'evidence-close',
    );
    assert.ok(close.some((f) => f.width > 10 && f.width < 330));
    assert.ok(close.at(-1).width < 1);
    const index = await sampleMotion(
      '.cw-index-panel',
      () => page.getByRole('button', { name: '收起活动索引', exact: true }).click(),
      'index-close',
    );
    assert.ok(index.some((f) => f.width > 5 && f.width < 295));
    await page.getByRole('button', { name: '打开活动索引', exact: true }).click();
    await settle();
    await page.evaluate(async () => {
      const b = [...document.querySelectorAll('button')].find(
        (x) => x.textContent === '来源与保存',
      );
      for (let i = 0; i < 6; i++) {
        b.click();
        await new Promise((r) => setTimeout(r, 35));
      }
    });
    await settle();
    assert.ok((await page.locator('.cw-evidence').boundingBox()).width < 1);
    await select(2);
    await select(1);
    const work = await sampleMotion(
      '.cw-reading-surface',
      async () => {
        const immediate = await page.evaluate(async () => {
          const start = performance.now();
          document.querySelector('.cw-index-panel [data-activity="activity-2"]').click();
          // Router navigation must happen in the event, without an animation wait.
          // React may commit the DOM after the next frame callback, so measure
          // the commit instead of treating the first callback as a paint.
          const activity = new URL(location.href).searchParams.get('activity');
          let selected;
          do {
            await new Promise(requestAnimationFrame);
            selected = document
              .querySelector('.cw-index-panel [data-activity="activity-2"]')
              .getAttribute('aria-current');
          } while (selected !== 'true' && performance.now() - start < 100);
          return {
            activity,
            selected,
            elapsed: performance.now() - start,
          };
        });
        assert.equal(immediate.activity, 'activity-2');
        assert.equal(immediate.selected, 'true');
        assert.ok(immediate.elapsed < 75, `selection commit took ${immediate.elapsed}ms`);
        motion.push({ label: 'selection-commit', ...immediate });
      },
      'work-switch',
    );
    assert.ok(
      work.length > 2 && work.every((f) => f.opacity === 1),
      'activity switches never fade the reader',
    );
    await select(1);
    const tabs = await sampleMotion(
      '[data-pane="context"]',
      () => page.getByRole('tab', { name: /文件变化/ }).click(),
      'context-to-diff',
    );
    assert.ok(tabs.some((f) => f.opacity > 0 && f.opacity < 1));
    await page.getByRole('tab', { name: '上下文', exact: true }).click();
    await page
      .getByRole('button', { name: /原始消息引用的检查输出/ })
      .first()
      .scrollIntoViewIfNeeded();
    const disclosure = await sampleMotion(
      '.cw-disclosure',
      () =>
        page
          .getByRole('button', { name: /原始消息引用的检查输出/ })
          .first()
          .click(),
      'quoted-output-expand',
    );
    assert.ok(disclosure.some((f) => f.opacity > 0 && f.opacity < 1));
    await page
      .getByRole('button', { name: /原始消息引用的检查输出/ })
      .first()
      .click();
    await page.evaluate(async () => {
      for (const id of [2, 3, 1]) {
        document.querySelector(`.cw-index-panel [data-activity="activity-${id}"]`).click();
        await new Promise((r) => setTimeout(r, 30));
      }
    });
    await settle();
    await expect(page).toHaveURL(/activity=activity-1(?:&|$)/);
    await page.getByRole('button', { name: '准备交接', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await settle();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  await check('narrow navigation, full paths and evidence survive resizing', async () => {
    await page.getByRole('button', { name: '来源与保存', exact: true }).click();
    await settle();
    await page.setViewportSize({ width: 800, height: 900 });
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('来源与保存');
    await page.keyboard.press('Escape');
    await settle();
    await page.getByRole('button', { name: '打开活动索引', exact: true }).click();
    await page.getByRole('dialog').locator('[data-activity="activity-3"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.cw-heading-copy')).toContainText('同名文件');
    await page.getByRole('tab', { name: /文件变化/ }).click();
    await capture('narrow-code-review');
  });
  await check('reduced motion, revocation clears access and unsent state', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '准备交接', exact: true }).click();
    const style = await page.getByRole('dialog').evaluate((e) => ({
      duration: getComputedStyle(e).animationDuration,
      transition: getComputedStyle(e).transitionDuration,
    }));
    assert.equal(style.duration, '0s');
    await page.keyboard.press('Escape');
    await scene('模拟权限失效');
    await expect(page.getByRole('heading', { name: '项目访问已失效' })).toBeVisible();
    await expect(page.locator('.cw-reader-scroll')).toHaveCount(0);
    await expect(page.locator('.cw-activity')).toHaveCount(0);
    await capture('access-revoked');
    await page.getByRole('button', { name: '重新载入演示数据', exact: true }).click();
    await expect(page.getByRole('button', { name: '查看交接草稿', exact: true })).toHaveCount(0);
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
} catch (error) {
  failed = error;
  console.error(error);
  await capture('failure').catch(() => {});
}
const video = page.video();
await context.close();
await video.saveAs(path.join(out, 'interaction-recording.webm'));
await browser.close();
await fs.writeFile(
  path.join(out, 'validation.json'),
  JSON.stringify(
    {
      passed: !failed,
      checks,
      measurements,
      motion,
      errors,
      external,
      failure: failed?.message,
      capturedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
if (failed) process.exitCode = 1;
