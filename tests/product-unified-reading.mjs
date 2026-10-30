// Isolated test of the actual prepared responsive composition with stateful
// children. It establishes React/DOM continuity, not a backend conversation run.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const out = 'docs/product-ui/unified/evidence/reading-continuity';
await fs.mkdir(out, { recursive: true });
const built = await build({
  stdin: {
    contents: `
    import React, {useRef,useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {ProductReadingSplit} from './integrations/codecast/web/ProductReadingSplit';
    function Reader({name}) { const [draft,setDraft]=useState(''); return <div data-reader={name} style={{height:'100%',overflow:'auto'}}><input aria-label={name+' draft'} value={draft} onChange={e=>setDraft(e.target.value)}/>{Array.from({length:90},(_,i)=><p key={i}>{name} line {i}</p>)}</div> }
    function App(){const ref=useRef(null); return <ProductReadingSplit open layout={{'content-panel':40,'diff-panel':60}} onLayoutChange={()=>{}} groupRef={ref} reading={<Reader name="reading"/>} code={<Reader name="code"/>}/>}
    createRoot(document.getElementById('root')).render(<App/>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
    sourcefile: 'TEST-reading.tsx',
  },
  bundle: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  alias: {
    react: path.resolve('node_modules/react'),
    'react-dom': path.resolve('node_modules/react-dom'),
  },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  plugins: [
    {
      name: 'isolate-unrelated-shortcut-help',
      setup(b) {
        b.onResolve({ filter: /^\.\.\/components\/SegmentedToggle$/ }, () => ({
          path: path.resolve(
            '.local/codecast-app/source/packages/web/components/SegmentedToggle.tsx',
          ),
        }));
        b.onResolve({ filter: /KeyboardShortcutsHelp$/ }, () => ({
          path: 'help',
          namespace: 'TEST',
        }));
        b.onLoad({ filter: /.*/, namespace: 'TEST' }, () => ({
          contents: 'export function ShortcutTooltip({children}){return children}',
          loader: 'js',
        }));
      },
    },
  ],
});
const css = await fs.readFile('integrations/codecast/web/product-ui.css', 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.route('http://127.0.0.1:3407/TEST-reading', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: `<style>html,body,#root{height:100%;margin:0}.cc-split{width:4px;flex:0 0 4px} ${css}</style><div id="root"></div><script>${built.outputFiles[0].text}</script>`,
    }),
  );
  await page.goto('http://127.0.0.1:3407/TEST-reading');
  await expect(page.locator('.collo-reading-split')).toHaveAttribute('data-mode', 'split');
  await page.getByLabel('reading draft').fill('中文 draft survives resizing');
  await page.getByLabel('code draft').fill('selected file state');
  await page.evaluate(() => {
    window.TESTnodes = [...document.querySelectorAll('[data-reader]')];
    TESTnodes[0].scrollTop = 333;
    TESTnodes[1].scrollTop = 555;
  });
  const records = [];
  for (const width of [1064, 960, 1280, 800, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.locator('.collo-reading-split')).toHaveAttribute(
      'data-mode',
      width >= 1064 ? 'split' : 'reading',
    );
    if (width >= 1064)
      await expect
        .poll(() =>
          page.locator('[data-reader=code]').evaluate((e) => e.getBoundingClientRect().width),
        )
        .toBeGreaterThanOrEqual(639);
    if (width < 1064) {
      await page.getByRole('button', { name: 'Files', exact: true }).click();
      await expect(page.getByLabel('code draft')).toBeVisible();
      await page.getByRole('button', { name: 'Conversation', exact: true }).click();
      await expect(page.getByLabel('reading draft')).toBeVisible();
    }
    const record = await page.evaluate(() => ({
      width: innerWidth,
      nodes: TESTnodes.map((node, i) => ({
        same: node === document.querySelectorAll('[data-reader]')[i],
        top: node.scrollTop,
        draft: node.querySelector('input').value,
        width: node.getBoundingClientRect().width,
      })),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    assert.ok(record.nodes.every((n) => n.same));
    assert.deepEqual(
      record.nodes.map((n) => n.top),
      [333, 555],
    );
    assert.deepEqual(
      record.nodes.map((n) => n.draft),
      ['中文 draft survives resizing', 'selected file state'],
    );
    assert.equal(record.overflow, false);
    if (width >= 1064) {
      assert.ok(record.nodes[0].width >= 419, JSON.stringify(record));
      assert.ok(record.nodes[1].width >= 639, JSON.stringify(record));
    }
    records.push(record);
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        records,
        scope:
          'Actual ProductReadingSplit + actual panels and segmented control; stateful test children; unrelated ShortcutTooltip is pass-through. Formal persisted conversation/Diff tested separately.',
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error('Browser errors', errors);
  throw error;
} finally {
  await browser.close();
}
console.log(
  'Responsive reading composition preserves exact DOM nodes, draft and scroll positions.',
);
