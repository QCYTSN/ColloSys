import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { inspectOverflow } from './product-ui-overflow.mjs';
const before = process.argv.includes('--before'),
  out = `docs/product-ui/review-fixes/evidence/${before ? 'before' : 'after'}/detector`;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  await page.setContent(`<style>body{font:14px Arial;margin:20px}section{margin:14px 0}button{font:inherit;min-width:120px} .test-box{width:280px} .hidden{overflow:hidden} .row{position:relative;width:220px;height:40px} .overlay{position:absolute;inset:0;z-index:5;background:transparent}</style>
 <section class="test-box hidden" style="height:14px"><button id="ancestor" style="height:42px">Ancestor clipped action</button></section>
 <section><button id="self" style="height:14px;line-height:42px;overflow:hidden;padding:0;border:0">自身裁切 action</button></section>
 <section><div style="height:28px;overflow:hidden;width:130px" id="message">多行状态需要完整显示 Mixed-language status has a second line and more content.</div></section>
 <button id="offscreen" style="position:fixed;top:900px">Unreachable action</button>
 <section class="row"><button id="covered" style="height:40px">Covered action</button><div class="overlay"></div></section>
 <section class="row"><button id="svg" aria-label="SVG child" style="height:40px"><svg width="16" height="16"><path d="M0 0h16v16H0z"/></svg></button></section>
 <section class="row"><button id="decoration" style="height:40px">Decorated action</button><div class="overlay" style="pointer-events:none"></div></section>
 <section style="height:70px;width:250px;overflow:auto" id="scroller"><div style="height:220px"></div><button id="reachable">Scroll to reach me</button></section>
 <section inert aria-hidden="true" style="position:fixed;left:-900px"><button id="closed" tabindex="-1">Closed panel action</button></section>
 <section class="row" style="width:150px"><button id="ellipsis" aria-label="Full accessible project title for keyboard and pointer users" style="width:150px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis" title="Full accessible project title for keyboard and pointer users">Full accessible project title for keyboard and pointer users</button></section>
 <pre style="width:230px;overflow:auto"><code>${'legal code column '.repeat(15)}</code></pre>`);
  const r = await inspectOverflow(page);
  const required = ['ancestor', 'self', 'message', 'offscreen'];
  const detection = Object.fromEntries(
    required.map((id) => [id, r.faults.some((f) => f.id === id)]),
  );
  // Interactive checks are a separate capability, never implied by geometry.
  let interactive = null;
  const module = await import('./product-ui-overflow.mjs');
  if (module.inspectActions)
    interactive = await module.inspectActions(
      page,
      page.locator('#offscreen,#covered,#svg,#decoration,#reachable,#ellipsis,#closed'),
    );
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        scope:
          'Synthetic detector counterexamples and legal controls; not application defect screenshots',
        detection,
        geometry: r,
        interactive,
      },
      null,
      2,
    ),
  );
  await page.screenshot({ path: out + '/counterexamples.png' });
  console.log(JSON.stringify({ detection, interactive }));
  if (!before) {
    for (const id of required) assert.equal(detection[id], true, `Missed ${id}`);
    assert.ok(interactive.faults.some((f) => f.id === 'covered'));
    assert.ok(
      interactive.checks
        .find((f) => f.id === 'svg')
        .samples.some((s) => s.hit && ['svg', 'path'].includes(s.target.toLowerCase())),
    );
    assert.ok(
      interactive.faults.some((f) => f.id === 'offscreen' && f.category === 'reachability'),
    );
    for (const id of ['svg', 'decoration', 'reachable', 'ellipsis', 'closed'])
      assert.ok(
        !r.faults.some((f) => f.id === id) && !interactive.faults.some((f) => f.id === id),
        `False positive ${id}`,
      );
    assert.equal(await page.locator('#scroller').evaluate((e) => e.scrollTop), 0);
    // Real keyboard disclosure supplies full text for sighted keyboard users too.
    await page.locator('#ellipsis').evaluate((e) => {
      e.addEventListener('click', () => {
        let p = document.createElement('p');
        p.id = 'full-content';
        p.textContent = e.textContent;
        e.after(p);
      });
    });
    await page.locator('#ellipsis').focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await page.locator('#full-content').innerText(),
      await page.locator('#ellipsis').innerText(),
    );
    assert.ok(
      (await page.locator('#ellipsis').ariaSnapshot()).includes('Full accessible project title'),
    );
    await page.locator('#full-content').screenshot({ path: out + '/keyboard-full-content.png' });
    await page.locator('#self').evaluate((e) => {
      e.style.height = '18px';
      e.style.lineHeight = '51px';
      e.textContent = 'Another clipped action 测试';
    });
    await page.locator('#message').evaluate((e) => {
      e.style.height = '19px';
      e.style.width = '100px';
      e.textContent = 'Different status with more lines 中文 mixed text';
    });
    await page.locator('#offscreen').evaluate((e) => {
      e.style.top = '1070px';
    });
    const variant = await inspectOverflow(page);
    for (const id of required) assert.ok(variant.faults.some((f) => f.id === id));
    await fs.writeFile(out + '/variant.json', JSON.stringify(variant, null, 2));
  }
} finally {
  await browser.close();
}
