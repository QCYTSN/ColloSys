import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { inspectOverflow } from './product-ui-overflow.mjs';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.setContent(`<style>body{font:14px Arial}section{margin:24px;width:220px}button{height:42px} .clip{overflow:hidden}.ellipsis{width:380px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}</style>
    <section class="clip"><button id="ellipsis-geometry" class="ellipsis" title="A long button with an exact title">A long button with an exact title</button></section>
    <section class="clip" style="height:14px"><button id="vertical-action">A full height action</button></section>
    <section><span id="span-overflow">${'unbroken'.repeat(65)}</span></section>
    <section style="width:120px"><div id="valid-ellipsis" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis" title="Full text available from this exact title">Full text available from this exact title</div></section>`);
  const result = await inspectOverflow(page);
  for (const id of ['ellipsis-geometry', 'vertical-action', 'span-overflow'])
    assert.ok(
      result.faults.some((f) => f.id === id),
      `Missed ${id}`,
    );
  assert.ok(!result.faults.some((f) => f.id === 'valid-ellipsis'));
  assert.ok(result.fullTextCandidates.some((f) => f.id === 'valid-ellipsis'));
  assert.ok(
    !result.legal.some((f) => f.id === 'valid-ellipsis'),
    'A title alone is not verified keyboard access',
  );
  const out =
    process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/craft/evidence/counterexamples';
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(out + '/results.json', JSON.stringify(result, null, 2));
  await page.screenshot({ path: out + '/known-failures.png' });
  console.log(
    'PASS all three known failures detected; title-only ellipsis is an unverified access candidate',
  );
} finally {
  await browser.close();
}
