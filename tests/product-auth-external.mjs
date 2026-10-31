// Run after configuring a real provider. --native checks the actual native
// handoff through the system browser; the default checks the separate web path.
// Isolated product storage. No tokens, headers or account labels saved.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, _electron as electron } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';
const provider = process.argv.find((a) => a.startsWith('--provider='))?.split('=')[1];
assert.ok(['github', 'google'].includes(provider), 'Use --provider=github or --provider=google');
const backend = new ConvexHttpClient('http://127.0.0.1:3408');
const capability = await backend.query('auth:signInProviders', {});
if (!capability[provider]) {
  console.log(
    'External authorization pending configuration. Follow docs/product-ui/auth-completion/OAUTH_HANDOFF.md. No authorization was attempted.',
  );
  process.exit(2);
}
const native = process.argv.includes('--native');
const env = { ...process.env, COLLOSYS_DESKTOP_PROFILE: 'test-' + randomUUID() };
delete env.ELECTRON_RUN_AS_NODE;
delete env.COLLOSYS_WORKBENCH_PREVIEW;
delete env.COLLOSYS_DESIGN_LAB;
const launchNative = () =>
  electron.launch({
    executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
    args: [path.resolve('integrations/codecast/desktop/main.cjs')],
    env,
    timeout: 60000,
  });
let app, browser, page;
try {
  if (native) {
    app = await launchNative();
    page = await app.firstWindow();
    assert.ok(
      await app.evaluate(
        ({ BrowserWindow }) =>
          !BrowserWindow.getAllWindows()[0]
            .getNativeWindowHandle()
            .every((b) => b === 0),
      ),
    );
  } else {
    browser = await chromium.launch({ channel: 'chrome', headless: false });
    page = await (await browser.newContext()).newPage();
  }
  await page.goto('http://127.0.0.1:3407/login?return_to=%2Fprojects');
  await page
    .getByRole('button', { name: provider === 'github' ? 'GitHub' : 'Google', exact: true })
    .click();
  console.log(
    native
      ? 'Complete consent in the system browser, then approve this desktop request. Waiting for the native ColloSys session.'
      : 'Complete consent in the visible browser. Waiting for a real ColloSys session.',
  );
  await page.waitForURL((u) => u.pathname === '/projects', { timeout: 300000 });
  await page.locator('.collo-topbar').waitFor({ timeout: 60000 });
  const inspect = () =>
    page.evaluate(async () => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('__convexAuthJWT'));
      if (!key) return null;
      const r = await fetch('http://127.0.0.1:3408/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem(key),
        },
        body: JSON.stringify({ path: 'colloAuthSession:current', args: {}, format: 'json' }),
      });
      const data = await r.json();
      return data.value?.status === 'verified' ? data.value.userId : null;
    });
  const identity = await inspect();
  assert.ok(identity, 'A verified backend session is required');
  await page.reload();
  await page.locator('.collo-topbar').waitFor({ timeout: 60000 });
  assert.equal(await inspect(), identity);
  if (native) {
    await app.close();
    app = await launchNative();
    page = await app.firstWindow();
    await page.locator('.collo-topbar').waitFor({ timeout: 60000 });
    assert.equal(
      await inspect(),
      identity,
      'Native relaunch must retain the same verified account',
    );
  }
  const result = {
    provider,
    status: 'real external round trip verified',
    verifiedAt: new Date().toISOString(),
    sameAccountAfterReload: true,
    sameAccountAfterNativeRelaunch: native,
    accountFingerprint: createHash('sha256').update(identity).digest('hex'),
    scope: native
      ? 'Real native handoff, one-time claim, verified session, reload and relaunch. Linking and denial/cancellation remain separate acceptance cases.'
      : 'Separate web authorization and same-account reload. Does not certify native handoff or account linking.',
  };
  const out = 'docs/product-ui/auth-completion/evidence/external';
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(
    `${out}/${provider}-${native ? 'native' : 'browser'}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(
    'Verified provider round trip and same-account reload. No credentials saved to evidence.',
  );
} finally {
  await app?.close();
  await browser?.close();
}
