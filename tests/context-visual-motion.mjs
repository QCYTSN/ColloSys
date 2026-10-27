import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

// Human-paced walkthrough of the real isolated workbench, with animations enabled.
const out = path.resolve('docs/workbench-revision/visual-20261027');
await fs.mkdir(path.join(out, 'motion'), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: path.resolve('.local/visual-motion-video'),
    size: { width: 1440, height: 900 },
  },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const pause = (ms = 1000) => page.waitForTimeout(ms);
const frame = (name) =>
  page.screenshot({ path: path.join(out, 'motion', `${name}.png`), animations: 'allow' });
await page.goto('http://127.0.0.1:3407/workbench-preview');
await page.locator('.cw-app').waitFor();
await page.evaluate(() => document.fonts.ready);
await pause();
await page.locator('.cw-index-panel [data-activity="activity-2"]').hover();
await pause(450);
await page.locator('.cw-index-panel [data-activity="activity-2"]').click();
await pause();
await frame('saved-file');
await page.locator('.cw-index-panel [data-activity="activity-1"]').click();
await pause();
await page.locator('.cw-reader-scroll').hover();
await page.mouse.wheel(0, 480);
await pause();
await page
  .getByRole('button', { name: /原始消息引用的检查输出/ })
  .first()
  .click();
await pause();
await frame('expanded-output');
await page.getByRole('tab', { name: /文件变化/ }).click();
await pause();
await page.locator('.cw-file-list button').nth(1).click();
await pause();
await frame('same-name-file');
await page.getByRole('button', { name: '来源与保存', exact: true }).click();
await pause(80);
await frame('source-opening');
await pause();
await frame('source-open');
await page.getByRole('button', { name: '关闭来源面板', exact: true }).click();
await pause();
await page.getByRole('tab', { name: '上下文', exact: true }).click();
await pause();
await page.locator('.cw-index-panel .cw-member-filter').click();
await pause();
await frame('member-menu');
await page.keyboard.press('Escape');
await pause(450);
await page.getByRole('button', { name: '准备交接', exact: true }).click();
await pause();
await page.getByRole('button', { name: '保留交接草稿', exact: true }).hover();
await pause(450);
await page.mouse.down();
await frame('pressed-button');
await page.mouse.up();
await expect(page.getByRole('dialog')).toContainText('交接草稿');
await pause();
await page.keyboard.press('Escape');
await pause();
await page.getByRole('button', { name: '收起活动索引', exact: true }).click();
await pause();
await page.getByRole('button', { name: '打开活动索引', exact: true }).click();
await pause();
await page
  .getByRole('textbox', { name: '写协作评论' })
  .fill('已核对来源说明，保留手动编辑与捕获日志各自的证据。');
await pause();
await frame('composer-ready');
const video = page.video();
await context.close();
await video.saveAs(path.join(out, 'interaction-demo.webm'));
await browser.close();
await fs.writeFile(
  path.join(out, 'motion', 'run.json'),
  JSON.stringify({ errors, capturedAt: new Date().toISOString() }, null, 2),
);
if (errors.length) throw new Error(errors.join('\n'));
console.log('Recorded real workbench interaction-demo.webm');
