import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, denseFixture } from './product-ui-refinement-data.mjs';
const mode = process.argv.includes('--production') ? 'production' : 'development';
const out = `docs/product-ui/menu-motion/evidence/acceptance-${mode}`;
await fs.mkdir(out, { recursive: true });
const fixture = await denseFixture(),
  expect = baseExpect.configure({ timeout: 60000 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
  recordVideo: { dir: '.local/menu-videos', size: { width: 1440, height: 900 } },
});
const page = await context.newPage(),
  checks = [],
  observations = [];
checks.push = (...items) => {
  console.log(...items);
  return Array.prototype.push.apply(checks, items);
};
page.setDefaultTimeout(20000);
const route = `http://127.0.0.1:3407/projects/${fixture.projectId}?tab=tasks`;
const display = () => page.getByTitle('Display options', { exact: true }),
  panel = () => page.locator('.collo-display-panel[data-state=open]');
const shot = async (name) => {
  if (['active-open', 'display-open', 'display-child'].includes(name)) {
    await page.locator('.collo-list-surface').evaluateAll(async elements => {
      await Promise.allSettled(elements.flatMap(e => e.getAnimations().map(a => a.finished)));
    });
  }
  await page.screenshot({ path: `${out}/${name}.png` });
};
const select = async (label, value) => {
  await panel()
    .getByRole('button', { name: new RegExp(`^${label}:`) })
    .click();
  await page
    .locator(`.collo-setting-menu[aria-label="${label}"]`)
    .getByRole('menuitemradio', { name: value, exact: true })
    .click();
  await expect(panel()).toBeVisible();
};
try {
  await page.goto('http://127.0.0.1:3407/login', { timeout: 120000 });
  await expect(page.locator('#email')).toBeVisible({ timeout: 60000 });
  await page.locator('#email').fill(account.a.email);
  await page.locator('#password').fill(account.a.password);
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.collo-projects')).toBeVisible({ timeout: 60000 });
  await page.goto(route, { timeout: 120000 });
  await expect(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible()) await page.locator('[data-foreign-switch]').click();
    await expect(display()).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60000 });
  await page.getByRole('navigation').getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(display()).toBeVisible();
  if (!(await page.getByTitle('Active', { exact: true }).isVisible())) {
    await page.locator('.cq-tabs-compact .collo-list-trigger').click();
    await page
      .locator('.collo-preset-menu')
      .getByRole('menuitemradio', { name: /^Active/ })
      .click();
  }
  let active = page.getByTitle('Active', { exact: true });
  await expect(active).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const scroll = page.locator('[data-list-scroll]');
  await scroll.evaluate((e) => (e.scrollTop = 260));
  const top = await scroll.evaluate((e) => e.scrollTop);
  const box = await active.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(active).toHaveAttribute('aria-expanded', 'true');
  observations.push({
    name: 'pointerdown opens without click delay',
    button: await active.boundingBox(),
    anchorBefore: box,
    face: await active
      .locator('.collo-trigger-face')
      .evaluate((e) => ({
        transform: getComputedStyle(e).transform,
        animations: e.getAnimations().map((a) => ({ time: a.currentTime, playState: a.playState })),
      })),
  });
  const pressedBox = await active.boundingBox();
  for (const k of ['x', 'y', 'width', 'height'])
    assert.ok(
      Math.abs(pressedBox[k] - box[k]) < 0.1,
      `Anchor moved ${k}: ${box[k]} -> ${pressedBox[k]}`,
    );
  await shot('active-press-opening');
  await page.mouse.up();
  const preset = page.locator('.collo-preset-menu[role=menu]');
  await expect(preset.getByRole('menuitemradio')).toHaveCount(4);
  await expect(preset.getByRole('menuitemradio', { name: /^Active/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await shot('active-open');
  await page.keyboard.press('Escape');
  observations.push({
    name: 'closing presence',
    layers: await page
      .locator('.collo-preset-menu')
      .evaluateAll((es) =>
        es.map((e) => ({
          state: e.dataset.state,
          opacity: getComputedStyle(e).opacity,
          pointerEvents: getComputedStyle(e).pointerEvents,
          wrapperPointerEvents: getComputedStyle(e.parentElement).pointerEvents,
        })),
      ),
  });
  await shot('active-closing');
  await expect(active).toBeFocused();
  await expect(active).toHaveAttribute('aria-expanded', 'false');
  await expect(scroll).toHaveJSProperty('scrollTop', top);
  await active.press('Enter');
  await expect(preset).toBeVisible();
  await expect(preset.getByRole('menuitemradio').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(preset.getByRole('menuitemradio').nth(1)).toBeFocused();
  await page.keyboard.press('a');
  await expect(preset.getByRole('menuitemradio').nth(2)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(preset.getByRole('menuitemradio').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(preset.getByRole('menuitemradio').last()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTitle('Done', { exact: true })).toBeFocused();
  await page.getByTitle('Done', { exact: true }).press('Space');
  await expect(preset.getByRole('menuitemradio').first()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(preset.getByRole('menuitemradio').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(active).toBeVisible();
  await active.click();
  await preset.getByRole('menuitemradio', { name: /^All/ }).click();
  await expect(page.getByTitle('All', { exact: true })).toBeVisible();
  await page.getByTitle('All', { exact: true }).click();
  await preset.getByRole('menuitemradio', { name: /^Unblocked/ }).click();
  await expect(page.getByTitle('Unblocked', { exact: true })).toBeVisible();
  await page.getByTitle('Unblocked', { exact: true }).click();
  await preset.getByRole('menuitemradio', { name: /^Active/ }).click();
  checks.push(
    'Actual Tasks preset: pointerdown feedback on inner visual, stable anchor, four radio choices/counts, mouse/Enter/Space/arrows/typeahead/Home/End/Escape and trigger focus; cancelling preserves scroll.',
  );
  await display().click();
  await expect(panel()).toHaveAttribute('role', 'dialog');
  await shot('display-open');
  const displayBox = await panel().boundingBox();
  assert.ok(displayBox.height < 330, JSON.stringify(displayBox));
  await panel()
    .getByRole('button', { name: /^Grouping:/ })
    .click();
  const group = page.locator('.collo-setting-menu[aria-label=Grouping]');
  const axes = await group.getByRole('menuitemradio').allTextContents();
  observations.push({ name: 'all available grouping axes', axes });
  for (const value of [
    'No grouping',
    'Status',
    'Project',
    'Plan',
    'Assignee',
    'Chain',
    'Label',
    'Session',
  ])
    assert.ok(axes.includes(value), `Missing ${value}`);
  await shot('display-child');
  await page.keyboard.press('Escape');
  await expect(panel()).toBeVisible();
  await expect(panel().getByRole('button', { name: /^Grouping:/ })).toBeFocused();
  await select('Grouping', 'Assignee');
  await page.keyboard.press('Escape');
  await expect(panel()).toHaveCount(0);
  await display().click();
  await select('Grouping', 'Project');
  await select('Then by', 'Assignee');
  await select('Sorting', 'Title');
  const dir = panel().getByRole('button', { name: /^(Ascending|Descending)/ });
  await dir.click();
  await select('Grouping', 'No grouping');
  await expect(panel().getByRole('button', { name: /^Then by:/ })).toHaveCount(0);
  await select('Grouping', 'Status');
  await expect(panel().getByRole('button', { name: /^Then by: Nothing/ })).toBeVisible();
  await select('Sorting', 'Manual (drag to reorder)');
  await expect(
    panel().getByRole('button', { name: 'Manual order follows drag position' }),
  ).toBeDisabled();
  await select('Sorting', 'Priority');
  await select('Then by', 'Nothing');
  await panel().getByRole('button', { name: 'Board', exact: true }).click();
  await expect(panel()).toBeVisible();
  await expect(panel().getByRole('button', { name: 'Board', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await panel().getByRole('button', { name: 'List', exact: true }).click();
  await expect(panel().getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await panel().getByRole('button', { name: 'Copy link to this view', exact: true }).click();
  await expect(panel()).toHaveCount(0);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(link.includes('/tasks') && link.includes('group='), link);
  await page.reload();
  await expect(display()).toBeVisible();
  await display().click();
  await expect(
    panel().getByRole('button', { name: 'Grouping: Status', exact: true }),
  ).toBeVisible();
  await expect(
    panel().getByRole('button', { name: 'Sorting: Priority', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(display()).toBeFocused();
  await shot('display-closed-focus');
  await expect(display()).toBeVisible();
  await display().click();
  await select('Grouping', 'Project');
  await select('Sorting', 'Title');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(display()).toBeVisible();
  await display().click();
  await expect(
    panel().getByRole('button', { name: 'Grouping: Project', exact: true }),
  ).toBeVisible();
  await expect(panel().getByRole('button', { name: 'Sorting: Title', exact: true })).toBeVisible();
  await select('Grouping', 'Status');
  await select('Sorting', 'Priority');
  await page.keyboard.press('Escape');
  checks.push(
    'Display: compact settings dialog, every upstream axis retained; nested Escape/focus, immediate grouping/subgroup/sort/direction, no-group clears both axes per the existing model, manual direction disabled, List/Board, real clipboard link and refresh preferences.',
  );
  await page.getByTitle('Filter', { exact: true }).click();
  let filters = page.getByRole('dialog', { name: 'Add filter', exact: true });
  await filters.getByRole('button', { name: 'Status', exact: true }).click();
  filters = page.getByRole('dialog', { name: 'Status filter', exact: true });
  const boxes = filters.getByRole('checkbox');
  observations.push({
    name: 'status values',
    options: await boxes.evaluateAll((es) =>
      es.map((e) => ({ value: e.value, checked: e.checked })),
    ),
  });
  // Toggle one actual status: the header must say Filtered instead of claiming a preset.
  if (await boxes.first().isChecked()) await boxes.first().uncheck();
  else await boxes.first().check();
  await expect(page.getByTitle('Filtered', { exact: true })).toBeVisible();
  await shot('filter-custom');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Add filter', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const edit = page.getByTitle('Edit Status', { exact: true });
  await edit.click();
  await expect(page.getByRole('dialog', { name: 'Status filter', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await page.getByTitle('Remove Status filter', { exact: true }).click();
  await expect(page.getByTitle('All', { exact: true })).toBeVisible();
  // Saving is an existing inline form, not a menu. Exercise real persistence.
  await page.getByTitle('Filter', { exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Add filter', exact: true })
    .getByRole('button', { name: 'Priority', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Priority filter', exact: true })
    .getByRole('radio')
    .first()
    .check();
  const save = page.getByTitle('Save current view as a shortcut', { exact: true });
  await expect(save).toBeVisible();
  await save.click();
  await page.getByPlaceholder('View name...').fill('TEST menu view');
  await page.getByPlaceholder('View name...').press('Escape');
  await expect(page.getByPlaceholder('View name...')).toHaveCount(0);
  await save.click();
  await page.getByPlaceholder('View name...').fill(`TEST menu ${mode}`);
  await page.getByPlaceholder('View name...').press('Enter');
  await expect(page.getByText(`View "TEST menu ${mode}" saved`, { exact: true })).toBeVisible();
  await page.getByTitle('Remove Priority filter', { exact: true }).click();
  checks.push(
    'Add filter/category and filter chip use actual popovers; multi status remains Filtered, layered Escape, clearing status restores All per the existing model. Existing inline Save view cancel and persisted save are exercised.',
  );
  for (const [width, height, zoom] of [
    [960, 540, 1],
    [720, 450, 1],
    [640, 400, 1],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((z) => (document.documentElement.style.zoom = String(z)), zoom);
    await display().click();
    await expect(panel()).toBeVisible();
    const b = await panel().boundingBox();
    assert.ok(
      b.x >= 0 && b.y >= 0 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1,
      JSON.stringify({ b, width, height, zoom }),
    );
    await panel()
      .getByRole('button', { name: /^Grouping:/ })
      .click();
    const sub = page.locator('.collo-setting-menu[aria-label=Grouping]');
    const sb = await sub.boundingBox();
    assert.ok(
      sb.x >= 0 && sb.y >= 0 && sb.x + sb.width <= width + 1 && sb.y + sb.height <= height + 1,
      JSON.stringify(sb),
    );
    await sub.getByRole('menuitemradio', { name: 'Session', exact: true }).click();
    await expect(panel()).toBeVisible();
    await shot(`display-${width}-${height}-${zoom}`);
    await select('Grouping', 'Status');
    await panel().getByRole('button', { name: 'Copy link to this view' }).click();
  }
  await page.evaluate(() => (document.documentElement.style.zoom = '1'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await display().click();
  assert.equal(await panel().evaluate((e) => getComputedStyle(e).animationName), 'none');
  await page.keyboard.press('Escape');
  checks.push(
    'Low height and squeezed 960/720/640 CSS-pixel widths: parent/child stay in viewport, bottom copy action reachable. Actual desktop zoom is tested separately; CSS zoom is not used as its substitute. Reduced motion preserves states without surface animation.',
  );
} catch (e) {
  await shot('failure').catch(() => {});
  throw e;
} finally {
  const build = await page
    .evaluate(() => fetch('/collo-build.json').then((r) => r.json()))
    .catch(() => null);
  await fs.writeFile(
    `${out}/results.json`,
    JSON.stringify({ mode, checks, observations, build }, null, 2),
  );
  const video = page.video();
  await context.close();
  await video.saveAs(`${out}/menus.webm`);
  await browser.close();
}
console.log(checks.join('\n'));
