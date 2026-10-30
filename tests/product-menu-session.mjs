// Private, renewable browser setup. Never publish storageState or credentials.
import { chromium, expect } from '@playwright/test';
import { account, denseFixture } from './product-ui-refinement-data.mjs';
const f=await denseFixture(),browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 await page.goto('http://127.0.0.1:3407/login',{timeout:120000});await expect(page.locator('#email')).toBeVisible({timeout:60000});
 await page.locator('#email').fill(account.a.email);await page.locator('#password').fill(account.a.password);await page.locator('form button[type=submit]').click();await expect(page.locator('.collo-projects')).toBeVisible({timeout:60000});
 await page.goto(`http://127.0.0.1:3407/projects/${f.projectId}?tab=tasks`,{timeout:120000});
 await expect(async()=>{if(await page.locator('[data-foreign-switch]').isVisible())await page.locator('[data-foreign-switch]').click();await expect(page.getByTitle('Display options',{exact:true})).toBeVisible({timeout:1000});}).toPass({timeout:60000});
 await context.storageState({path:'.local/menu-auth-state.json',indexedDB:true});console.log('Renewed private TEST browser session; no secrets exported to evidence.');
}finally{await browser.close();}
