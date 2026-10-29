// Isolated contract test of the actual prepared components and built CSS.
// This is not a screenshot of a product page or a substitute for native tests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const web = path.resolve('.local/codecast-app/source/packages/web');
const require = createRequire(path.join(web, 'package.json'));
const bundle = await build({
  absWorkingDir: web,
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
  stdin: {
    loader: 'tsx',
    resolveDir: web,
    contents: `
    import { createRoot } from 'react-dom/client';
    import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from './collo/ProductTooltip';
    import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from './components/ui/dropdown-menu';
    const Hint = ({name}) => <Tooltip><TooltipTrigger asChild><button>{name}</button></TooltipTrigger><TooltipContent>{name} help</TooltipContent></Tooltip>;
    createRoot(document.getElementById('root')).render(<TooltipProvider delayDuration={0}>
      <div style={{padding:40,display:'grid',gap:50,justifyItems:'start'}}>
        <Hint name="Page action" />
        <div className="collo-settings-surface" style={{position:'static',transform:'none',animation:'none',padding:20,width:300,height:100,minHeight:0}}><Hint name="Settings action" /></div>
        <div className="collo-dialog-surface" style={{position:'static',transform:'none',translate:'none',animation:'none',padding:20,width:300,height:100,minHeight:0}}><Hint name="Dialog action" /></div>
      </div>
      <div style={{position:'fixed',right:15,bottom:15}}><DropdownMenu>
        <DropdownMenuTrigger>Edge menu</DropdownMenuTrigger>
        <DropdownMenuContent align="end"><Hint name="Menu action" /></DropdownMenuContent>
      </DropdownMenu></div>
    </TooltipProvider>);
  `,
  },
});
const out = 'docs/product-ui/craft/evidence/tooltip-contract';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [],
  layers = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.setContent('<html data-product="collosys"><body><div id="root"></div></body></html>');
  for (const name of await fs.readdir('dist/codecast-app/assets'))
    if (name.endsWith('.css'))
      await page.addStyleTag({ path: path.resolve('dist/codecast-app/assets', name) });
  await page.addStyleTag({
    content:
      ':root{--sol-bg:#fff;--sol-bg-alt:#f0f1f3;--sol-text:#262830;--sol-text-muted:#565c68;--sol-text-dim:#6b707c;--sol-border:#dfe2e7;--sol-violet:#7568b6} body{margin:0}button{padding:8px 12px}',
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const [name, z] of [
    ['Page action', 140],
    ['Settings action', 160],
    ['Dialog action', 205],
  ]) {
    const trigger = page.getByRole('button', { name, exact: true });
    if (name === 'Page action') await trigger.hover();
    else await trigger.focus();
    const hint = page
      .locator(
        '[data-collo-hint][data-state="instant-open"], [data-collo-hint][data-state="delayed-open"]',
      )
      .filter({ hasText: name + ' help' });
    await expect(hint).toBeVisible();
    const actual = await hint.evaluate((e) => Number(getComputedStyle(e).zIndex));
    assert.equal(actual, z);
    layers.push({ name, z: actual });
    await page.mouse.move(480, 5);
    await trigger.evaluate((e) => e.blur());
  }
  await page.getByRole('button', { name: 'Edge menu', exact: true }).click();
  const menu = page.locator('.collo-menu-surface');
  await expect(menu).toBeVisible();
  await page.getByRole('button', { name: 'Menu action', exact: true }).focus();
  const hint = page.locator('[data-collo-hint]').filter({ hasText: 'Menu action help' });
  await expect(hint).toBeVisible();
  const actual = await hint.evaluate((e) => ({
    z: Number(getComputedStyle(e).zIndex),
    rect: e.getBoundingClientRect().toJSON(),
  }));
  const menuZ = await menu.evaluate((e) => Number(getComputedStyle(e).zIndex));
  assert.ok(actual.z > menuZ && menuZ > 205);
  assert.ok(
    actual.rect.left >= 0 &&
      actual.rect.right <= 960 &&
      actual.rect.top >= 0 &&
      actual.rect.bottom <= 720,
  );
  layers.push({ name: 'Menu action', ...actual, menuZ });
  await page.screenshot({ path: out + '/isolated-layer-contract.png' });
  await page.keyboard.press('Escape');
  await expect(hint).toHaveCount(0);
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edge menu', exact: true })).toBeFocused();
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        scope: 'Isolated actual component contract, not a formal product screenshot',
        at: new Date().toISOString(),
        layers,
        errors,
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS Actual tooltip adapter follows page/settings/dialog/menu layers, edge collision and focus return',
  );
} finally {
  await browser.close();
}
