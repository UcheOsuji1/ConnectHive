import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('../../verify-home-phase2/', import.meta.url));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1536,height:1024},colorScheme:'dark',permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const calls=[];
const hive={hive_id:'11111111-1111-4111-8111-111111111111',hive_name:'LA Creative Builders',category_name:'Project Collaboration',role:'owner',member_count:6};
let posts=[{post_id:'22222222-2222-4222-8222-222222222222',hive_id:hive.hive_id,hive_name:hive.hive_name,category_name:hive.category_name,author_user_id:'test-user',author_name:'Test Member',post_type:'update',headline:'Looking for collaborators on a short film',body:'We are bringing a small team together for a weekend shoot. Share your ideas, find your people, and build something meaningful together.',created_at:new Date(Date.now()-7200000).toISOString(),is_member:true,visibility:'hive',reaction_count:8,comment_count:2},
{post_id:'33333333-3333-4333-8333-333333333333',hive_id:hive.hive_id,hive_name:'Weekend Explorers',category_name:'Social Groups',author_user_id:'other-user',author_name:'Jordan Lee',post_type:'event',headline:'A weekend outside, together',body:'Take a break from the week and join your Hive for a relaxed afternoon outdoors.',media_url:'/product/travel.webp',event_at:new Date(Date.now()+86400000).toISOString(),event_location:'Los Angeles, CA',created_at:new Date(Date.now()-14400000).toISOString(),is_member:true,reaction_count:12,comment_count:3}];
const event={post_id:posts[1].post_id,hive_id:hive.hive_id,headline:'Creative community meetup',event_at:new Date(Date.now()+86400000).toISOString(),event_location:'Los Angeles, CA',hive_name:hive.hive_name,going_count:7,viewer_going:false};
let empty=false, failRsvp=false;
await page.route('**/api/**',async route=>{
 const req=route.request(),u=new URL(req.url()),body=req.postDataJSON();calls.push({path:u.pathname,method:req.method(),body});let data={};
 if(u.pathname==='/api/auth/me')data={user:{userId:'test-user',fullName:'Test Member',email:'test@example.com',emailVerified:true,hasProfile:true}};
 else if(u.pathname==='/api/users/profile')data={profile:{full_name:'Test Member',location:'Los Angeles, CA',bio:'Creator, builder, and community connector.',interests:['Film','Hiking'],connection_purposes:['Professional','Projects']}};
 else if(u.pathname==='/api/hives/mine')data={hives:[hive]};
 else if(u.pathname==='/api/hives/match')data={hives:empty?[]:[{...hive,hive_id:'rec-1',match_score:84,logo_url:'/product/projects.webp',location:'Los Angeles'}, {...hive,hive_id:'rec-2',hive_name:'Startup Builders',category_name:'Professional Networking',match_score:88,logo_url:'/product/professional.webp',join_policy:'request'}, {...hive,hive_id:'rec-3',hive_name:'Weekend Explorers',category_name:'Social Groups',match_score:92,logo_url:'/product/travel.webp'}]};
 else if(u.pathname==='/api/events/upcoming')data={myEvents:empty?[]:[event],suggestedEvents:empty?[]:[{...event,post_id:'suggested-1',headline:'Explore with your community',banner_url:'/product/travel.webp'}],myEventsTotal:empty?0:1};
 else if(u.pathname.endsWith('/rsvp')){if(failRsvp)return route.fulfill({status:503,json:{error:'Unavailable'}});data={going:true,goingCount:8};}
 else if(u.pathname.endsWith('/unread-count'))data={count:3,unread_count:0};
 else if(u.pathname.endsWith('/requests'))data={requests:[]};
 else if(u.pathname.endsWith('/request'))data={joined:true};
 else if(u.pathname==='/api/posts/feed')data={posts:empty?[]:posts};
 else if(u.pathname.endsWith('/save'))data={saved:body.saved};
 else if(u.pathname.endsWith('/react'))data={reacted:true,reaction:'like',reaction_count:9,reaction_summary:[{reaction:'like',count:9}]};
 else if(u.pathname.endsWith('/comments'))data=req.method()==='POST'?{comment:{comment_id:'new-comment',user_id:'test-user',full_name:'Test Member',body:body.body,commented_at:new Date().toISOString()}}:{comments:[]};
 else if(u.pathname==='/api/posts'&&req.method()==='POST'){const p={...posts[0],post_id:'created-post',headline:body.headline};posts=[p,...posts];data={post:p};}
 else if(u.pathname.startsWith('/api/posts/')&&req.method()==='PATCH'){posts=posts.map(p=>p.post_id===u.pathname.split('/').at(-1)?{...p,...body}:p);data=body;}
 else if(req.method()==='DELETE')data={deleted:true};
 await route.fulfill({json:data});
});
await page.goto(`${process.env.HOME_TEST_URL||'http://127.0.0.1:5174'}/home`);
await page.getByText('Welcome back, Test').waitFor();await page.getByText(posts[0].headline).waitFor();
await page.evaluate(()=>document.fonts.ready);
const own=page.locator('.post-card').filter({has:page.locator('.th-post-author',{hasText:'Test Member'})});
assert.equal(await own.locator('.th-post-tools').count(),0);
assert.equal(await page.getByRole('button',{name:'Edit post',exact:true}).count(),0);
const trigger=own.getByRole('button',{name:'Post options'});
await trigger.focus();await trigger.press('ArrowDown');
assert.equal(await page.getByRole('button',{name:'Edit post',exact:true}).evaluate(e=>e===document.activeElement),true);
await page.screenshot({path:output+'post-menu-dark.png',fullPage:true});
await page.getByRole('button',{name:'Edit post',exact:true}).press('Escape');
assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await trigger.evaluate(e=>e===document.activeElement),true);
await trigger.click();await page.locator('.th-welcome').click();assert.equal(await trigger.getAttribute('aria-expanded'),'false');
await trigger.click();await page.getByRole('button',{name:'Edit post',exact:true}).click();
await own.getByLabel('Headline',{exact:true}).fill('A shared idea, ready to build');
await own.getByRole('button',{name:'Save changes'}).click();await own.getByText('A shared idea, ready to build').waitFor();
await own.getByRole('button',{name:'Save',exact:true}).click();assert.equal(await own.getByRole('button',{name:'Saved',exact:true}).getAttribute('aria-pressed'),'true');
await own.getByRole('button',{name:'Saved',exact:true}).click();await own.getByRole('button',{name:'Save',exact:true}).waitFor();
await trigger.click();await page.getByRole('button',{name:'Copy link',exact:true}).click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/home\?post=/);
await own.getByRole('button',{name:'Share',exact:true}).click();
await own.locator('.post-react-btn').click();assert(calls.some(c=>c.path.endsWith('/react')));
await own.locator('.post-comment-btn').click();await own.locator('.post-add-comment textarea').fill('Looking forward to collaborating.');await own.locator('.post-add-comment button[type=submit]').click();await own.getByText('Looking forward to collaborating.').waitFor();
const other=page.locator('.post-card').filter({has:page.locator('.th-post-author',{hasText:'Jordan Lee'})});await other.getByRole('button',{name:'Post options'}).click();
assert.equal(await other.getByRole('button',{name:'Edit post'}).count(),0);await other.getByRole('button',{name:'Report post'}).waitFor();await other.getByRole('button',{name:'Post options'}).press('Escape');
await page.locator('.uec-going-btn').click();await page.locator('.uec-going-btn--active').waitFor();
failRsvp=true;await page.locator('.uec-going-btn').click();await page.getByText('Your RSVP could not be saved. Please try again.').waitFor();failRsvp=false;
await page.getByRole('button',{name:'Share something with your Hives'}).click();await page.locator('.cpm-input').first().fill('Fresh from the community');await page.locator('.cpm-submit-btn').click();await page.getByText('Fresh from the community').waitFor();
const created=page.locator('.post-card').filter({hasText:'Fresh from the community'});
await created.getByRole('button',{name:'Post options'}).click();page.once('dialog',d=>d.accept());await created.getByRole('button',{name:'Delete post',exact:true}).click();await created.waitFor({state:'detached'});posts=posts.filter(p=>p.post_id!=='created-post');
await page.getByRole('button',{name:/Join/}).first().click();await page.getByRole('button',{name:'Joined',exact:true}).waitFor();
// Capture a clean fixture state after interaction checks.
await page.reload();await page.getByText('Welcome back, Test').waitFor();await page.locator('.th-match-ring').first().waitFor();await page.evaluate(()=>document.fonts.ready);
async function theme(value){await page.locator('.nav-user-btn').click();await page.getByLabel('Appearance').selectOption(value);await page.locator('.nav-user-btn').click();await page.waitForTimeout(250);}
async function capture(name){await page.screenshot({path:output+name+'.png',fullPage:true});}
await capture('desktop-dark');
await theme('light');assert.equal(await page.locator('.app-navbar').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(252, 250, 245)');await capture('desktop-light');
await page.setViewportSize({width:390,height:844});await capture('mobile-light');
await theme('dark');await capture('mobile-dark');
for(const width of [390,320]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);for(const value of ['light','dark']){await theme(value);await page.getByRole('button',{name:'Open menu',exact:true}).click();assert.equal(await page.locator('.app-mobile-menu').getAttribute('aria-hidden'),'false');await page.locator('.app-mobile-menu a').first().focus();await page.locator('.app-mobile-menu a').first().press('Escape');await capture(`mobile-${width}-${value}`);}}
await theme('system');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
await page.reload();await page.getByText('Welcome back, Test').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('truehive-theme')),'system');
empty=true;await page.reload();await page.getByText('Your next connection starts here').waitFor();await page.getByText('Your next shared plan starts here.',{exact:false}).waitFor();await capture('mobile-empty-dark');
assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: overflow keyboard/outside/Escape, author controls, edit/delete, share, save/unsave, copy link, reactions, comments, composer, join, RSVP/rollback, both themes, System/persistence, mobile menu, 390/320 overflow, populated and empty screenshots; no runtime errors.');await browser.close();
