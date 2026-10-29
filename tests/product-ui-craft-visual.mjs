import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, completionFixture, eventually } from './product-ui-completion-data.mjs';
const expect=baseExpect.configure({timeout:30000}),f=await completionFixture(),out = process.env.COLLOSYS_UI_EVIDENCE_DIR || 'docs/product-ui/craft/evidence/visual';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage(),checks=[],contrasts=[],typography=[];
const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name)}
async function go(route){await page.goto('http://127.0.0.1:3407'+route);await expect(async()=>{if(await page.locator('[data-foreign-switch]').isVisible())await page.locator('[data-foreign-switch]').click();await expect(page.locator('.collo-topbar')).toBeVisible({timeout:700});if(route.includes('tab=workspaces'))await expect(page.getByTestId('local-workspaces')).toBeVisible({timeout:700})}).toPass({timeout:60000})}
async function contrast(label,selector,property='color'){
 const result=await page.locator(selector).first().evaluate((el,{label,property})=>{
  const c=document.createElement('canvas');c.width=c.height=1;const cx=c.getContext('2d');
  const rgb=value=>{cx.clearRect(0,0,1,1);cx.fillStyle=value;cx.fillRect(0,0,1,1);return [...cx.getImageData(0,0,1,1).data]};
  let back=[255,255,255,255];const chain=[];for(let e=el;e;e=e.parentElement)chain.unshift(e);
  for(const e of chain){const v=rgb(getComputedStyle(e).backgroundColor);const a=v[3]/255;back=v.slice(0,3).map((n,i)=>n*a+back[i]*(1-a)).concat(255)}
  const s=getComputedStyle(el),fg=rgb(s[property]),a=fg[3]/255,front=fg.slice(0,3).map((n,i)=>n*a+back[i]*(1-a));
  const lum=v=>v.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0);
  const l1=lum(front),l2=lum(back);return{label,property,foreground:front,background:back.slice(0,3),ratio:(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight,borderRadius:s.borderRadius,height:el.getBoundingClientRect().height};
 },{label,property});contrasts.push(result);return result;
}
let shared=false;
const originalShare=(await f.a.client.query('collo:projectByRef',{reference:f.projectId})).share_token ?? null;
try {
 await page.goto('http://127.0.0.1:3407/login');await expect(page.locator('#email')).toBeVisible();
 await check('Actual light auth text, focused control and error contrasts are measurable',async()=>{
  for(const [label,selector]of[['auth title','.collo-auth-step h1'],['auth supporting text','.collo-auth-step > p'],['auth action','.collo-auth-submit']])assert.ok((await contrast(label,selector)).ratio>=4.5,label);
  await page.locator('#email').focus();assert.ok((await contrast('focused input','#email','borderTopColor')).ratio>=3);
  await page.locator('#email').fill(account.a.email);await page.locator('#password').fill('TEST-wrong-password');await page.locator('form button[type=submit]').click();await expect(page.locator('#auth-error')).toBeVisible();assert.ok((await contrast('auth error','#auth-error')).ratio>=4.5);await shot('01-auth-error');
 });
 await page.locator('#password').fill(account.a.password);await page.locator('#password').press('Enter');await expect(page.locator('.collo-projects')).toBeVisible();
 await go(`/projects/${f.projectId}?tab=workspaces`);await page.getByRole('link',{name:'ColloSys projects',exact:true}).click();
 await check('Selected and secondary text plus the real settings action have sufficient contrast in both themes',async()=>{
  for(const mode of ['light','dark']){
   for(const [label,selector]of[['project title','.collo-page-heading h1'],['selected project','.collo-project-row[data-selected=true] strong'],['project metadata','.collo-project-status']])assert.ok((await contrast(mode+' '+label,selector)).ratio>=4.5,label);
   await page.locator('.collo-settings-button').click();await page.getByRole('button',{name:'Profile & appearance',exact:true}).click();
   const input=page.getByPlaceholder('Your name',{exact:true});const before=await input.inputValue();await input.fill('TEST unsaved contrast probe');
   await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeEnabled();assert.ok((await contrast(mode+' save action','.cc-btn-cyan')).ratio>=4.5);await input.fill(before);
   typography.push(await page.locator('.collo-settings-top h1').evaluate(e=>{const s=getComputedStyle(e);return{role:'settings title',font:s.fontFamily,weight:s.fontWeight,size:s.fontSize,tracking:s.letterSpacing}}));
   if(mode==='light')await page.getByRole('switch',{name:'Dark mode',exact:true}).check();else await page.getByRole('switch',{name:'Dark mode',exact:true}).uncheck();
   await page.keyboard.press('Escape');await expect(page.locator('.collo-settings-surface')).toHaveCount(0);
  }
 });
 await go(`/projects/${f.projectId}?tab=workspaces`);
 await check('Reachable local share page uses ColloSys identity and truthful clipboard feedback',async()=>{
  // The same existing store action the ShareControl invokes. The URL remains
  // loopback; no invitation or external message is sent. Restore the token below.
  const token=crypto.randomUUID();await page.evaluate(({id,token})=>window.__inboxStore.getState().setObjectShareLink('project',id,token),{id:f.projectId,token});shared=true;
  await eventually(async()=>assert.equal((await f.a.client.query('collo:projectByRef',{reference:f.projectId})).share_token,token));
  const share=await context.newPage();await share.goto('http://127.0.0.1:3407/share/project/'+token);await expect(share.locator('.share-mark')).toHaveText('ColloSys');await expect(share.locator('.share-mark img')).toBeVisible();assert.equal(await share.locator('a[href*="codecast.sh"]').count(),0);
  await share.getByRole('button',{name:'Copy link',exact:true}).click();await expect(share.getByRole('button',{name:'Copied',exact:true})).toBeVisible();
  await share.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{value:async()=>{throw Error('TEST clipboard denied')}}));await share.getByRole('button',{name:'Copied',exact:true}).click();await expect(share.getByRole('alert')).toBeVisible();await expect(share.locator('.collo-share-copy input')).toHaveValue('http://127.0.0.1:3407/share/project/'+token);
  await share.screenshot({path:out+'/02-share-copy-failure.png'});await share.close();
  await page.evaluate(({id,token})=>window.__inboxStore.getState().setObjectShareLink('project',id,token),{id:f.projectId,token:originalShare});shared=false;
  await eventually(async()=>assert.equal((await f.a.client.query('collo:projectByRef',{reference:f.projectId})).share_token ?? null,originalShare));
  assert.match(await page.title(),/^ColloSys/);
 });
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const dom=await cdp.send('DOM.getDocument');const node=await cdp.send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'.collo-project-title h1'});typography.push({role:'Chinese project title',fonts:await cdp.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId})});
} catch(e){await shot('failure').catch(()=>{});throw e}
finally {if(shared){await page.evaluate(({id,token})=>window.__inboxStore.getState().setObjectShareLink('project',id,token),{id:f.projectId,token:originalShare}).catch(()=>{});await new Promise(r=>setTimeout(r,800))}await fs.writeFile(out+'/results.json',JSON.stringify({checks,contrasts,typography},null,2));await context.close();await browser.close()}
