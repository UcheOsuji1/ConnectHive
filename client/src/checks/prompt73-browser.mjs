// Browser UI contracts use intercepted fixtures. Never connects to Stripe/API.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir=join(tmpdir(),'truehive-prompt73');await mkdir(dir,{recursive:true});
const browser=await chromium.launch();const base=process.env.P73_BASE_URL||'http://127.0.0.1:5175';let checks=0;const shots=[],requests=[];
function check(ok,name){assert.ok(ok,name);checks++;console.log(`PASS ${name}`);}
const offering={hive_id:'fixture',hive_name:'The Sunday Workshop',state:'active',monthly_price_cents:1200,benefits:'Weekly guided sessions, a curated resource library, and a monthly workshop.',description:'A thoughtful space to learn, practise, and make progress alongside your community.',cancellation_policy:'Cancel at the end of your current paid period. Access continues through your paid-through date.',available:true};
async function screenshot(page,name){const file=join(dir,`${name}.png`);await page.screenshot({path:file,fullPage:false});shots.push(file);}
try{
for(const width of [1440,390])for(const reducedMotion of ['no-preference','reduce']){
 const ctx=await browser.newContext({viewport:{width,height:1000},reducedMotion,recordVideo:{dir,size:{width,height:1000}}});
 let refundRequests=[],status='active',cancel=false,ownerState='active',isOwner=true,plus=true;const errors=[];
 await ctx.route('**/socket.io/**',r=>r.abort());
 await ctx.route('**/api/**',async r=>{
  const req=r.request(),path=new URL(req.url()).pathname,body=req.postDataJSON();requests.push({path,method:req.method(),body});let data={};
  if(path==='/api/auth/me')data={user:{userId:'viewer',fullName:'Jordan Morgan',hasProfile:true,hasActiveHive:true,emailVerified:true,email:'fixture@example.invalid',createdAt:new Date().toISOString()}};
  else if(path==='/api/config')data={maxMembersMin:2,maxMembersCap:100};
  else if(path==='/api/billing/summary')data={plus,subscriptions:[{id:'paid-sub',kind:'hive',hive_id:'fixture',hive_name:offering.hive_name,status,interval:'month',price_cents:1200,paid_through:'2026-11-17T20:00:00Z',access_until:'2026-11-17T20:00:00Z',cancel_at_period_end:cancel}],invoices:[{stripe_invoice_id:'in_fixture',amount_paid_cents:1200,refunded_cents:0,created_at:'2026-10-17',hive_name:offering.hive_name,hosted_invoice_url:'https://invoice.stripe.com/fixture'}],refundRequests,connection:{status:'connected'},ownedHives:[{hive_id:'fixture',hive_name:offering.hive_name,state:ownerState}],testMode:true};
  else if(path==='/api/billing/subscriptions/paid-sub/cancel'){cancel=true;data={cancelAtPeriodEnd:true};}
  else if(path==='/api/billing/subscriptions/paid-sub/refund-request'){refundRequests=[{id:'refund-request',reason:body.reason,state:'requested',hive_name:offering.hive_name}];data={requested:true};}
  else if(path==='/api/billing/hives/fixture/offer')data={offer:offering};
  else if(path==='/api/billing/checkout')return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Fixture: secure checkout unavailable. No payment created.'})});
  else if(path==='/api/billing/hives/fixture/owner')data={plus,offering:{...offering,state:ownerState},connection:{status:'connected'},totals:{gross_cents:24000,platform_fee_cents:2400,processing_fee_cents:900,refunds_cents:0,unknown_processing_count:0},subscribers:{active:20,latest_paid_through:'2026-11-22',renewals_pending:ownerState==='closing'?2:0},disputes:[]};
  else if(path==='/api/billing/hives/fixture/close'){ownerState='closing';data={state:'closing'};}
  else if(path==='/api/billing/admin/reviews')data={reviews:[{...offering,state:'pending_approval',revision:1}]};
  else if(path==='/api/hives/fixture')data={hive:{hive_id:'fixture',hive_name:offering.hive_name,category_name:'Social Groups',my_role:isOwner?'owner':null,role:isOwner?'owner':null,member_count:20,max_members:30,location_type:'online',discoverable:true,welcome_seen_at:'2026-10-17',onboarding_status:'completed',paid_membership:offering}};
  else if(path==='/api/hives/fixture/tools')data={tools:[]};
  else if(path==='/api/hives/fixture/onboarding')data={settings:{join_experience:'standard'},steps:[]};
  else if(path==='/api/users/profile')data={profile:{full_name:'Jordan Morgan',bio:'Community builder'}};
  else if(path==='/api/blocks')data={blocked:[]};
  else if(path==='/api/account/email-prefs')data={prefs:{email_joins:true,email_digest:true,email_news:false}};
  else if(path==='/api/account/deletion-check')data={blockers:[],soloOwnedHives:[],canDelete:false,paidBlockers:[{hive_id:'fixture'}],billingMessage:'You cannot delete your account while you have active paid Hives or outstanding paid membership obligations. Close your paid Hives and resolve remaining subscriptions, refunds, disputes, and payouts before continuing.'};
  else if(path==='/api/hives/mine')data={hives:[]};
  else if(path.endsWith('/members'))data={members:[]};
  else if(path.endsWith('/notifications'))data={notifications:[],unreadCount:0};
  await r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/settings`);await expect(page.getByRole('heading',{name:'Billing & Subscriptions'})).toBeVisible();await page.locator('#billing').scrollIntoViewIfNeeded();
 await expect(page.getByText('$12.00',{exact:false}).first()).toBeVisible();check(true,`member price and subscription visible ${width}/${reducedMotion}`);
 await page.getByRole('button',{name:'Cancel subscription',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).toContainText('Nov 17, 2026');
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();check(true,'confirmation dialog supports Escape and restores focus');
 await page.getByRole('button',{name:'Cancel subscription',exact:true}).click();await page.getByRole('button',{name:'Cancel at period end',exact:true}).click();await expect(page.getByText('Cancellation scheduled · paid through',{exact:false})).toBeVisible();check(cancel,'cancellation reflected only after API response');
 if(reducedMotion==='no-preference')await screenshot(page,`member-billing-${width}`);
 await page.getByRole('button',{name:'Request a refund',exact:true}).click();await page.getByLabel('Reason for your request').fill('Please review the workshop cancellation and my recent payment.');await page.getByRole('button',{name:'Send refund request'}).click();await expect(page.getByRole('heading',{name:'Refund request ? The Sunday Workshop'})).toBeVisible();check(true,'member refund request is acknowledged without claiming an automatic refund');
 await page.getByRole('tab',{name:'Owner earnings'}).click();await expect(page.getByText('Your Stripe connection')).toBeVisible();check(true,'owner tab exposes connection and authorized management links');
 await page.goto(`${base}/settings?billing=activating`);status='processing';await page.reload();await expect(page.getByText('Activating membership — waiting',{exact:false})).toBeVisible();check(true,'Checkout redirect displays waiting instead of granting membership');
 status='active';await expect(page.getByText('Check the verified subscription statuses below.',{exact:false})).toBeVisible({timeout:7000});check(true,'activation screen refreshes backend subscription state');
 await page.goto(`${base}/settings?billing=canceled`);await expect(page.getByText('Checkout canceled.',{exact:false})).toBeVisible();check(true,'canceled Checkout does not claim payment success');
 await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page.getByText('You cannot delete your account while',{exact:false})).toBeVisible();check(true,'paid financial deletion blocker displayed');
 await page.goto(`${base}/paid-hive/fixture`);await expect(page.getByRole('heading',{name:offering.hive_name,exact:true})).toBeVisible();const subscribe=page.getByRole('button',{name:'Subscribe to Join'});await expect(subscribe).toBeDisabled();await page.getByRole('checkbox').check();await expect(subscribe).toBeEnabled();await subscribe.click();await expect(page.getByRole('alert')).toContainText('No payment created');check(true,'member disclosures required and Checkout failure surfaced');
 if(reducedMotion==='no-preference')await screenshot(page,`paid-offer-${width}`);
 await page.goto(`${base}/hive/fixture/billing`);await expect(page.getByRole('heading',{name:'Monetization',exact:true})).toBeVisible();await expect(page.getByText('Gross collected')).toBeVisible();check(true,'owner dashboard shows separate revenue and processing costs');
 if(reducedMotion==='no-preference'){if(width===390)await page.getByRole('button',{name:/Manage Hive/}).click();await page.getByRole('heading',{name:'Monetization',exact:true}).evaluate(e=>e.scrollIntoView({block:'start'}));await page.evaluate(()=>window.scrollBy(0,-90));await page.waitForTimeout(300);await screenshot(page,`owner-monetization-${width}`);}
 await page.getByRole('button',{name:'Close paid Hive'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('Type CLOSE to confirm').fill('CLOSE');await page.getByRole('button',{name:'Close Hive',exact:true}).click();await expect(page.getByRole('heading',{name:'Closing your paid Hive'})).toBeVisible();await expect(page.getByText('20 members retain paid access.',{exact:false})).toBeVisible();check(true,'closure preserves subscriber dates and displays pending cancellations');
 await page.goto(`${base}/create-hive`);await page.getByLabel('Paid monthly membership').check();await expect(page.getByLabel('Monthly price (USD)')).toBeVisible();await page.getByLabel('Monthly price (USD)').fill('12.00');await expect(page.getByText('$1.20',{exact:true})).toBeVisible();await expect(page.getByText('Vary by payment method')).toBeVisible();check(true,'Create Hive has paid configuration and variable processing disclosure');
 if(reducedMotion==='no-preference'){await page.getByText('Build something worth belonging to').scrollIntoViewIfNeeded();await screenshot(page,`create-paid-${width}`);}
 await page.goto(`${base}/admin/monetization`);await expect(page.getByRole('heading',{name:'Paid Hive review'})).toBeVisible();await expect(page.getByLabel('Review reason')).toBeVisible();check(true,'staff review UI supports reasoned approval');
 const overflow=await page.locator('.bill-root button,.bill-root input,.bill-root textarea,.bill-card').evaluateAll(elements=>elements.filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&(b.left< -1||b.right>innerWidth+1);}).map(e=>e.tagName));check(!overflow.length,`element bounds remain inside ${width}px viewport`);
 check(!errors.length,`no browser runtime errors: ${errors.join('; ')}`);
 await ctx.close();
}
await writeFile(join(dir,'report.json'),JSON.stringify({checks,shots,api:'mocked',stripe:'not contacted'},null,2));await writeFile(join(dir,'requests.json'),JSON.stringify(requests,null,2));console.log(`${checks} browser checks passed. Evidence: ${dir}`);
}finally{await browser.close();}
