// Exercise the actual prepared durable store against browser IndexedDB.
// Dummy values and a unique database; no account credentials are inspected.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
const compiled = await build({
  entryPoints: ['.local/codecast-app/source/platform/packages/auth/src/web/durableAuthStorage.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'TestDurableAuth',
  platform: 'browser',
});
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3407/login');
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  const checks = await page.evaluate(async () => {
    const dbName = 'test-auth-storage-' + crypto.randomUUID();
    const api = TestDurableAuth.createDurableAuthStorage({ dbName });
    const key = 'test-jwt-' + crypto.randomUUID();
    const refresh = key + '-RefreshToken';
    const check = (ok, message) => {
      if (!ok) throw new Error(message);
      checks.push(message);
    };
    const checks = [];
    // Waiting for a separate read transaction also drains earlier writes.
    const disk = async (k) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(dbName);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return new Promise((resolve, reject) => {
        const tx = db.transaction('tokens', 'readonly');
        const r = tx.objectStore('tokens').get(k);
        tx.oncomplete = () => {
          db.close();
          resolve(r.result ?? null);
        };
        tx.onerror = () => reject(tx.error);
      });
    };
    api.storage.setItem(key, 'dummy-old');
    await disk(key);
    localStorage.removeItem(key);
    check(
      (await api.storage.getItem(key)) === 'dummy-old',
      'Unintentional localStorage loss still recovers the durable value',
    );
    localStorage.removeItem(key);
    const pending = api.storage.getItem(key);
    await api.purgeDurableAuthValues([key]);
    check(
      (await pending) === null && localStorage.getItem(key) === null && (await disk(key)) === null,
      'An IndexedDB read started before explicit logout cannot restore the removed value',
    );
    api.storage.setItem(key, 'dummy-queued');
    await api.purgeDurableAuthValues([key]);
    check((await disk(key)) === null, 'A queued durable write cannot outlive logout');
    api.storage.setItem(key, 'dummy-old');
    const oldPurge = api.purgeDurableAuthValues([key]);
    api.storage.setItem(key, 'dummy-new');
    await oldPurge;
    check(
      (await api.storage.getItem(key)) === 'dummy-new' && (await disk(key)) === 'dummy-new',
      'An older purge cannot delete a newer explicit sign-in value',
    );
    api.storage.setItem(refresh, 'dummy-refresh');
    await disk(refresh);
    api.storage.removeItem(refresh);
    check(
      (await api.storage.getItem(refresh)) === 'dummy-refresh',
      'Refresh rotation preserves the existing durable recovery behavior',
    );
    await api.purgeDurableAuthValues([key, refresh]);
    check(
      (await api.storage.getItem(refresh)) === null,
      'Explicit logout removes refresh recovery too',
    );
    return checks;
  });
  assert.equal(checks.length, 6);
  await fs.writeFile(
    'docs/product-ui/completion/auth/storage-results.json',
    JSON.stringify({ passed: true, checks, at: new Date().toISOString() }, null, 2),
  );
  checks.forEach((c) => console.log('PASS', c));
} finally {
  await browser.close();
}
