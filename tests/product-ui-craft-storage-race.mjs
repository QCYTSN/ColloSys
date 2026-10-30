import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, completionFixture } from './product-ui-completion-data.mjs';
const expect=baseExpect.configure({timeout:30000}),f=await completionFixture(),out = process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/craft/evidence/storage-review';
await fs.mkdir(out,{recursive:true});
// Recovery copies expire. This test must not depend on a copy left by an older
// run: prepare a fresh one only inside the known isolated completion fixture.
const existing = await f.local('/api/storage', undefined, f.connector.url);
if (!existing.recoveries.some(r => r.status === 'ready' && r.expiresAt > Date.now())) {
 assert.ok(path.resolve(f.root).startsWith(path.resolve('.local') + path.sep));
 assert.equal(path.basename(f.root), 'TEST-independent-directory');
 const before = await fs.readFile(path.join(f.root, 'readme.txt'));
 const inspection = await f.local('/api/inspect', undefined, f.connector.url);
 const passphrase = 'TEST storage race fixture ' + crypto.randomUUID();
 const backup = await f.local('/api/backups/create', {checkpointId:inspection.checkpoints[0].id,passphrase,confirmed:true}, f.connector.url);
 await f.local('/api/backups/recover', {id:backup.id,passphrase,confirmed:true}, f.connector.url);
 assert.deepEqual(await fs.readFile(path.join(f.root, 'readme.txt')), before);
}
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),checks=[];
let omitted=null;
await page.route('**/api/inspect',async route=>{const response=await route.fetch();const json=await response.json();if(omitted&&json.checkpoints)json.checkpoints=json.checkpoints.filter(c=>c.id!==omitted);await route.fulfill({response,json})});
try {
 await page.goto('http://127.0.0.1:3407/login');const pair=(await fs.readFile('.local/codecast-app/browser-pairing','utf8')).trim();await page.evaluate(v=>sessionStorage.setItem('collo.pair',v),pair);
 await page.locator('#email').fill(account.a.email);await page.locator('#password').fill(account.a.password);await page.locator('#password').press('Enter');await expect(page.locator('.collo-projects')).toBeVisible();
 await page.goto(`http://127.0.0.1:3407/projects/${f.projectId}?tab=workspaces&workspaceView=history&directory=${f.workspaceId}`);
 await expect(async()=>{if(await page.locator('[data-foreign-switch]').isVisible())await page.locator('[data-foreign-switch]').click();await expect(page.getByTestId('local-workspaces')).toBeVisible({timeout:700})}).toPass({timeout:60000});
 await page.getByText('This directory · TEST completion source',{exact:true}).click();await page.getByRole('button',{name:'Storage & backups',exact:true}).click();
 const storage=page.getByTestId('directory-storage'),select=storage.getByLabel('Storage checkpoint',{exact:true}),form=page.getByRole('form',{name:'Confirm storage operation'});
 const selected=await select.inputValue();assert.ok(selected);await storage.getByRole('button',{name:'Create encrypted backup',exact:true}).click();const pass='TEST ephemeral '+crypto.randomUUID();await form.getByLabel('Backup passphrase').fill(pass);await form.getByRole('checkbox').check();
 omitted=selected;
 await expect(form.getByRole('alert')).toContainText('reviewed item',{timeout:45000});await expect(form.locator('button[type=submit]')).toBeDisabled();assert.notEqual(await select.inputValue(),selected);
 assert.equal(await page.evaluate(v=>JSON.stringify(window.__inboxStore.getState()).includes(v),pass),false);
 await page.screenshot({path:out+'/stale-checkpoint-review.png'});checks.push('Injected inspection removes reviewed checkpoint A; visual selection may fall back but submission stays bound to A and disabled, with no store-persisted passphrase');
 await form.getByRole('button',{name:'Cancel',exact:true}).click();omitted=null;await expect(page.getByLabel('Backup passphrase')).toHaveCount(0);
 const recovery=storage.locator('[data-recovery-id]').filter({has:page.getByRole('button',{name:'Export copy',exact:true})}).first();await expect(recovery).toBeVisible();await recovery.getByRole('button',{name:'Export copy',exact:true}).click();
 const input=form.getByLabel('New export directory');await input.fill(path.join(f.evidence,'TEST-review-A'));await form.getByRole('checkbox').check();await input.fill(path.join(f.evidence,'TEST-review-B'));await expect(form.getByRole('checkbox')).not.toBeChecked();await expect(form.locator('button[type=submit]')).toBeDisabled();await page.screenshot({path:out+'/changed-export-review.png'});checks.push('Changing the reviewed export path revokes confirmation; no export was executed');await form.getByRole('button',{name:'Cancel',exact:true}).click();
 await fs.writeFile(out+'/results.json',JSON.stringify({checks},null,2));for(const c of checks)console.log('PASS',c);
} finally {await page.unrouteAll({behavior:'ignoreErrors'});await context.close();await browser.close()}
