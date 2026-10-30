// Supplement the paired workspace measurements with real password-toggle and
// failed-submit timings. This is AFTER-only evidence, not an invented baseline.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const mode = process.argv.includes('--development') ? 'development' : 'production';
const out = `docs/product-ui/menu-motion/evidence/after/${mode}/auth-performance.json`;
const rounds = [];
for (let round = 1; round <= 3; round++) {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3407/login', { timeout: 120000 });
    await expect(page.locator('#email')).toBeVisible({ timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#email').pressSequentially(`TEST-auth-timing-${round}@example.invalid`, { delay: 24 });
    // These are deliberately invalid test strings. No input values, account
    // objects, request bodies, screenshots or credentials enter the report.
    await page.locator('#password').fill('TEST-invalid-password');
    await page.evaluate(() => {
      window.__authTiming = { toggles: [], submit: null };
      document.addEventListener('pointerdown', (e) => {
        const button = e.target.closest('button');
        const label = button?.getAttribute('aria-label');
        if (label === 'Show password' || label === 'Hide password') {
          const start = performance.now();
          const before = document.querySelector('#password').type;
          const observe = () => {
            if (document.querySelector('#password').type === before) return requestAnimationFrame(observe);
            window.__authTiming.toggles.push({ firstFrame: performance.now() - start });
          };
          requestAnimationFrame(observe);
        } else if (button?.matches('form button[type="submit"]')) {
          const sample = window.__authTiming.submit = { start: performance.now(), submittingDOM: null, errorDOM: null, firstFeedbackFrame: null, errorFrame: null };
          const inspect = () => {
            const state = document.querySelector('.collo-companion-scene')?.dataset.state;
            if (state === 'submitting' && sample.submittingDOM == null) sample.submittingDOM = performance.now() - sample.start;
            if (state === 'recoverable-error' && sample.errorDOM == null) sample.errorDOM = performance.now() - sample.start;
          };
          const observer = new MutationObserver(inspect);
          observer.observe(document, { attributes: true, subtree: true, childList: true });
          const frame = () => {
            const state = document.querySelector('.collo-companion-scene')?.dataset.state;
            if ((state === 'submitting' || state === 'recoverable-error') && sample.firstFeedbackFrame == null) sample.firstFeedbackFrame = performance.now() - sample.start;
            if (state === 'recoverable-error' && document.querySelector('.collo-auth-error')?.getBoundingClientRect().height) {
              sample.errorFrame = performance.now() - sample.start;
              observer.disconnect();
            } else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        }
      }, true);
    });
    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: i % 2 ? 'Hide password' : 'Show password', exact: true }).click();
      await page.waitForFunction(n => window.__authTiming.toggles.length === n, i + 1);
    }
    await page.locator('form button[type=submit]').click();
    await page.waitForFunction(() => window.__authTiming.submit?.errorFrame != null);
    const result = await page.evaluate(() => ({
      ...window.__authTiming,
      viewport: { width: innerWidth, height: innerHeight },
      dpr: devicePixelRatio,
      userAgent: navigator.userAgent,
    }));
    assert.equal(result.toggles.length, 10);
    assert.ok(result.submit.submittingDOM != null, 'Real auth.loading was observed');
    assert.ok(result.submit.errorDOM != null, 'Real failed authentication reached error UI');
    rounds.push({ round, ...result, build: await page.evaluate(() => fetch('/collo-build.json').then(r => r.json())) });
    console.log(`${mode} auth round ${round}: 10 real visibility toggles and one real failed submit`);
  } finally { await browser.close(); }
}
const values = rounds.flatMap(r => r.toggles.map(t => t.firstFrame)).sort((a, b) => a - b);
await fs.writeFile(out, JSON.stringify({
  mode,
  method: 'After-only, three independent Chromium processes/contexts, normal motion, 1440x900 DPR1. Real pointerdown to first browser frame with changed password visibility; not hardware presentation. Submit records auth.loading DOM, first feedback frame and actual backend error frame separately. Error latency includes the local authentication request. No credentials or screenshots are captured. Typing comparisons remain in the existing heavy-path report.',
  toggle: { n: values.length, p50: values[14], p95: values[28], max: values[29] },
  rounds,
}, null, 2));
