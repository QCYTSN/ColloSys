// Actual prepared DirectoryStorage + Button, isolated transport/principal. No backend claims.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const before = process.argv.includes('--before'),
  web = path.resolve('.local/codecast-app/source/packages/web');
const require = createRequire(path.join(web, 'package.json'));
const bundle = await build({
  absWorkingDir: web,
  outfile: 'isolated.js',
  bundle: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    '@': web,
    react: path.dirname(require.resolve('react/package.json')),
    'react-dom': path.dirname(require.resolve('react-dom/package.json')),
  },
  plugins: [
    {
      name: 'controlled-transport',
      setup(b) {
        b.onResolve({ filter: /^\.\/local$/ }, (a) =>
          a.importer.endsWith('DirectoryStorage.tsx')
            ? { path: 'transport', namespace: 'review' }
            : undefined,
        );
        b.onResolve({ filter: /authPrincipal$/ }, () => ({
          path: 'principal',
          namespace: 'review',
        }));
        b.onLoad({ filter: /.*/, namespace: 'review' }, (a) => ({
          contents:
            a.path === 'principal'
              ? 'export const authPrincipal={epoch:()=>window.principalEpoch}; export const useAuthPrincipal=()=>({epoch:window.principalEpoch});'
              : `export const localRequest=(token,route,body,endpoint)=>new Promise((resolve,reject)=>window.requests.push({token,route,body,endpoint,resolve,reject}));`,
          loader: 'js',
        }));
      },
    },
  ],
  stdin: {
    loader: 'tsx',
    resolveDir: web,
    contents: `
import {createRoot} from 'react-dom/client';import {useState} from 'react';import {DirectoryStorage} from './collo/DirectoryStorage';
window.requests=[];window.principalEpoch=1;
function App(){const [revision,setRevision]=useState(0),[scope,setScope]=useState('A'),[shown,setShown]=useState(true);window.reread=()=>setRevision(v=>v+1);window.switchScope=v=>setScope(v);window.show=setShown;
return shown?<DirectoryStorage key={scope+window.principalEpoch} token={'test-token-'+revision} directory={{workspaceId:scope,projectId:'TEST',url:'http://127.0.0.1/'+scope,root:'TEST source '+scope,label:'TEST '+scope,running:true}} checkpoints={[{id:'test-checkpoint',label:'TEST checkpoint',createdAt:1,fileCount:1,integrity:'complete'}]} onChanged={async()=>{if(window.changedFails)throw new Error('TEST inspection failed')}}/>:null}
createRoot(document.getElementById('root')).render(<App/>);`,
  },
});
const out = `docs/product-ui/review-fixes/evidence/${before ? 'before' : 'after'}/storage-isolated`;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 960, height: 720 } }),
  results = [];
await page.route('http://127.0.0.1:3999/**', (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: '<html data-product="collosys"><body><div id="root"></div></body></html>',
  }),
);
const local = (count = 7) => ({
  cleanupToken: 'TEST-plan-' + count,
  count,
  bytes: 12,
  protected: [],
  pinned: [],
  remove: [],
  policy: { maxCheckpoints: 200, maxAgeDays: 30, maxDiskMiB: 2048 },
  recoveries: [],
});
const remote = {
  location: 'local-convex-storage',
  remote: false,
  backups: [],
  quota: { usedBytes: 0, maxBytes: 1e6, usedCount: 0, maxCount: 10 },
};
const flush = () =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const requestCount = () => page.evaluate(() => window.requests.length);
const resolve = async (i, value) => {
  await page.evaluate(({ i, value }) => window.requests[i].resolve(value), { i, value });
  await flush();
};
const reject = async (i, message, status = 503) => {
  await page.evaluate(
    ({ i, message, status }) =>
      window.requests[i].reject(Object.assign(new Error(message), { data: { status } })),
    { i, message, status },
  );
  await flush();
};
const reset = async () => {
  await page.goto('http://127.0.0.1:3999/isolated');
  for (const file of await fs.readdir('dist/codecast-app/assets'))
    if (file.endsWith('.css'))
      await page.addStyleTag({ path: path.resolve('dist/codecast-app/assets', file) });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect.poll(requestCount).toBe(2);
};
const text = () => page.locator('body').innerText();
const record = (name, passed, actual) => {
  results.push({ name, passed, actual });
  console.log(passed ? 'PASS' : 'FAIL', name);
};
try {
  await reset();
  await resolve(0, local());
  record(
    'local success independent of unresolved backup read',
    (await text()).includes('7 checkpoints'),
    await text(),
  );
  await resolve(1, remote);
  await page.evaluate(() => window.reread());
  await expect.poll(requestCount).toBe(4);
  await reject(2, 'TEST local read failed');
  await resolve(3, remote);
  await page.evaluate(() => window.reread());
  await expect.poll(requestCount).toBe(6);
  await resolve(4, local(8));
  await resolve(5, remote);
  record(
    'successful local retry clears only its read error',
    !(await text()).includes('TEST local read failed'),
    await text(),
  );
  await reset();
  await page.evaluate(() => window.reread());
  await expect.poll(requestCount).toBe(4);
  await resolve(2, local(22));
  await resolve(3, remote);
  await resolve(0, local(11));
  await resolve(1, remote);
  record(
    'A slow success cannot overwrite newer B',
    (await text()).includes('22 checkpoints'),
    await text(),
  );
  await reset();
  await page.evaluate(() => window.reread());
  await expect.poll(requestCount).toBe(4);
  await resolve(2, local(22));
  await resolve(3, remote);
  await reject(0, 'TEST obsolete failure');
  await resolve(1, remote);
  record(
    'A late error cannot replace newer success',
    !(await text()).includes('TEST obsolete failure'),
    await text(),
  );
  await reset();
  await page.evaluate(() => window.switchScope('B'));
  await expect.poll(requestCount).toBe(4);
  await resolve(2, local(22));
  await resolve(3, remote);
  await reject(0, 'TEST old scope denied', 403);
  await resolve(1, remote);
  record(
    'old scope denial cannot clear new directory',
    (await text()).includes('22 checkpoints'),
    await text(),
  );
  await reset();
  await page.evaluate(() => window.reread());
  await expect.poll(requestCount).toBe(4);
  await resolve(2, local(22));
  await resolve(3, remote);
  await reject(0, 'TEST actual denial', 403);
  record(
    'same-scope confirmed denial clears immediately despite hung sibling',
    (await text()).includes('Directory access has changed'),
    await text(),
  );
  await reset();
  await resolve(0, local());
  await resolve(1, remote);
  await page.getByRole('button', { name: 'Pin checkpoint', exact: true }).click();
  await expect.poll(requestCount).toBe(3);
  await page.evaluate(() => window.reread());
  await expect.poll(requestCount).toBe(5);
  await resolve(2, { ok: true });
  await expect.poll(requestCount).toBe(7);
  await resolve(5, local(44));
  await resolve(6, remote);
  await resolve(3, local(11));
  await resolve(4, remote);
  record(
    'success boundary invalidates reads started DURING the write',
    (await text()).includes('44 checkpoints'),
    await text(),
  );
  await reset();
  await page.evaluate(() => window.show(false));
  await flush();
  await resolve(0, local(11));
  await reject(1, 'TEST closed view denial', 403);
  await page.evaluate(() => window.show(true));
  await expect.poll(requestCount).toBe(4);
  await resolve(2, local(22));
  await resolve(3, remote);
  record(
    'close and reopen ignore late success and denial',
    (await text()).includes('22 checkpoints'),
    await text(),
  );
  await reset();
  await page.evaluate(() => {
    window.principalEpoch++;
    window.reread();
  });
  await expect.poll(requestCount).toBe(4);
  await resolve(2, local(22));
  await resolve(3, remote);
  await resolve(0, local(11));
  await reject(1, 'TEST old account denial', 403);
  record(
    'account epoch changes reject old-account completions',
    (await text()).includes('22 checkpoints'),
    await text(),
  );
  await reset();
  await resolve(0, local());
  await resolve(1, remote);
  await page.evaluate(() => window.reread());
  await expect.poll(requestCount).toBe(4);
  await page.getByRole('button', { name: 'Pin checkpoint', exact: true }).click();
  await expect.poll(requestCount).toBe(5);
  await page.evaluate(() => (window.changedFails = true));
  await resolve(4, { ok: true });
  await expect.poll(requestCount).toBe(7);
  await resolve(5, local(33));
  await resolve(6, remote);
  await resolve(2, local(11));
  await resolve(3, remote);
  record(
    'write completion invalidates pre-write snapshots',
    (await text()).includes('33 checkpoints'),
    await text(),
  );
  record(
    'inspection failure after committed write is not an operation failure',
    !(await text()).includes('TEST inspection failed') &&
      (await text()).includes('Checkpoint pinned'),
    await text(),
  );
  await reset();
  await resolve(0, local());
  await resolve(1, remote);
  await page.getByRole('button', { name: 'Review policy', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save policy', exact: true }).click();
  await expect.poll(requestCount).toBe(3);
  await resolve(2, { ok: true });
  await expect.poll(requestCount).toBe(5);
  await reject(3, 'TEST post-write read failed');
  await resolve(4, remote);
  record(
    'committed policy remains successful when read fails',
    (await text()).includes('Retention policy saved') && !(await page.getByRole('form').count()),
    await text(),
  );
  record(
    'completion focus remains on surviving visible element',
    await page.evaluate(
      () => document.activeElement !== document.body && document.activeElement?.isConnected,
    ),
    await page.evaluate(() => document.activeElement?.outerHTML),
  );
  await page.screenshot({ path: out + '/committed-write-read-failure.png' });
  if (!before) {
    await reset();
    await resolve(0, local());
    await reject(1, 'TEST backup service unavailable');
    record(
      'backup service failure remains local to backups while history stays usable',
      (await text()).includes('7 checkpoints') &&
        (await page.getByRole('button', { name: 'Review policy', exact: true }).isEnabled()) &&
        (await page.getByRole('button', { name: 'Retry backups', exact: true }).count()) === 1,
      await text(),
    );
    const recovery = {
      id: 'TEST-expiring-recovery',
      backupId: 'TEST-backup',
      checkpointId: 'test-checkpoint',
      directory: 'D:\\TEST-recovery',
      status: 'ready',
      expiresAt: Date.now() + 60000,
      files: 1,
    };
    const ready = { ...local(), recoveries: [recovery] };
    await reset();
    await resolve(0, ready);
    await resolve(1, remote);
    await page.getByRole('button', { name: 'Export copy', exact: true }).click();
    await page.getByLabel('New export directory', { exact: true }).fill('D:\\TEST-export');
    await page.getByRole('checkbox').check();
    await page.evaluate(() => window.reread());
    await expect.poll(requestCount).toBe(4);
    await resolve(2, { ...ready, recoveries: [{ ...recovery, expiresAt: 0 }] });
    await resolve(3, remote);
    const form = page.getByRole('form', { name: 'Confirm storage operation' });
    await expect(form.getByRole('alert')).toContainText(
      'reviewed item or cleanup scope has changed',
    );
    await expect(
      form.getByRole('button', { name: 'Export to this directory', exact: true }),
    ).toBeDisabled();
    record(
      'expiry received during export review blocks submission with inline review feedback',
      (await requestCount()) === 4,
      await form.innerText(),
    );
    await page.screenshot({ path: out + '/expired-review.png' });
    await reset();
    await resolve(0, ready);
    await resolve(1, remote);
    await page.getByRole('button', { name: 'Export copy', exact: true }).click();
    await page.getByLabel('New export directory', { exact: true }).fill('D:\\TEST-export');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Export to this directory', exact: true }).click();
    await expect.poll(requestCount).toBe(3);
    await reject(2, 'Recovery is unavailable or expired; recover the backup again', 404);
    await expect(form.getByRole('alert')).toContainText('unavailable or expired');
    record(
      'service expiry rejection stays in current form and focuses surviving confirmation',
      await form.evaluate((e) => document.activeElement === e),
      await form.innerText(),
    );
    await page.screenshot({ path: out + '/expired-service-response.png' });
  }
} finally {
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        evidence: 'Actual prepared component with controlled promise transport; not real backend',
        results,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
if (!before)
  assert.ok(
    results.every((r) => r.passed),
    results
      .filter((r) => !r.passed)
      .map((r) => r.name)
      .join('; '),
  );
