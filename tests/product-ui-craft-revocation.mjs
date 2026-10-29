import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect as baseExpect } from '@playwright/test';
import { account, completionFixture } from './product-ui-completion-data.mjs';
const expect=baseExpect.configure({timeout:30000}),f=await completionFixture(),out='docs/product-ui/craft/evidence/late-reply';
await fs.mkdir(out,{recursive:true});
const team=await f.a.client.query('teams:getTeam',{team_id:f.teamId});
const roster=await f.a.client.query('teams:getTeamMembers',{team_id:f.teamId});
const member=roster.find(m=>m.email===account.b.email);assert.ok(member);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
let release=null, removed=false;
await context.routeWebSocket(/127\.0\.0\.1:3408/,ws=>{const server=ws.connectToServer(),held=new Set();ws.onMessage(message=>{try{const m=JSON.parse(String(message));if(m.type==='Mutation'&&m.udfPath==='colloHandoffs:send')held.add(m.requestId)}catch{}server.send(message)});server.onMessage(message=>{try{const m=JSON.parse(String(message));if(m.type==='MutationResponse'&&held.has(m.requestId)){held.delete(m.requestId);release=()=>ws.send(message);return}}catch{}ws.send(message)})});
try {
 await page.goto('http://127.0.0.1:3407/login');await page.locator('#email').fill(account.b.email);await page.locator('#password').fill(account.b.password);await page.locator('#password').press('Enter');await expect(page.locator('.collo-projects')).toBeVisible();
 await page.goto(`http://127.0.0.1:3407/projects/${f.projectId}?tab=handoffs`);
 await expect(async()=>{if(await page.locator('[data-foreign-switch]').isVisible())await page.locator('[data-foreign-switch]').click();await expect(page.getByTestId('project-handoffs')).toBeVisible({timeout:700})}).toPass({timeout:60000});
 await page.getByRole('button',{name:'New handoff',exact:true}).click();const form=page.getByRole('dialog',{name:'New handoff',exact:true});
 const p=await f.a.client.query('collo:projectByRef',{reference:f.projectId});
 await form.getByLabel('Handoff recipient').selectOption(p.user_id);await form.getByLabel('Title',{exact:true}).fill('TEST reply during revocation '+Date.now());await form.getByLabel('Context',{exact:true}).fill('TEST only; source files remain unchanged');await form.getByRole('button',{name:'Send handoff',exact:true}).click();await expect.poll(()=>!!release).toBe(true);
 await f.a.client.mutation('teams:removeMember',{team_id:f.teamId,member_user_id:member._id});removed=true;
 await expect(form).toHaveCount(0);await expect(page.locator('.collo-detail-surface[data-phase=closing]')).toHaveCount(0);await page.screenshot({path:out+'/revoked-before-reply.png'});
 release();release=null;await page.waitForTimeout(200);
 await f.b.client.mutation('teams:joinTeam',{invite_code:team.invite_code});removed=false;
 await expect(async()=>{const open=page.getByRole('button',{name:'New handoff',exact:true});if(await open.isVisible())return;const retry=page.getByRole('button',{name:'Retry',exact:true}).first();if(await retry.isVisible())await retry.click({timeout:1000});await expect(open).toBeVisible({timeout:800})}).toPass({timeout:30000});
 await page.getByRole('button',{name:'New handoff',exact:true}).click();await expect(form.getByLabel('Title',{exact:true})).toBeEnabled();await form.getByLabel('Title',{exact:true}).fill('TEST editable after regrant');await page.screenshot({path:out+'/regranted-editable.png'});
 await fs.writeFile(out+'/results.json',JSON.stringify({passed:true,check:'Real TEST membership revoked while mutation response was held; reply released during denial; regrant and retry reopen an editable new draft'},null,2));console.log('PASS Revocation, late reply and regrant leave no stale draft or permanent busy state');
} finally {release?.();if(removed)await f.b.client.mutation('teams:joinTeam',{invite_code:team.invite_code});await context.close();await browser.close()}
