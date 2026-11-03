// Local visual QA of real production renderer/scripts with synthetic services.
// This is not an authenticated Firebase runtime test.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd(),teacher=fs.readFileSync('teacher-login.html','utf8');
const css=[...teacher.matchAll(/<link[^>]*href="(assets\/[^"?]+\.css)[^"]*"[^>]*>/g)].map(m=>`<link rel="stylesheet" href="/${m[1]}">`).join('');
const scripts=[...teacher.matchAll(/<script defer src="(assets\/[^?]+)\?/g)].map(m=>m[1]).filter(s=>!/firebase-(config|sync)|offline-attendance/.test(s)).map(s=>`<script defer src="/${s}"></script>`).join('');
const fixture=`<!doctype html><html lang="ar" dir="rtl" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="adminRoot"></div><div id="toast"></div>${scripts}<script defer src="/scripts/browser/attendance-fixture.js"></script></body></html>`;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),name=url.pathname;if(name==='/phase3-fixture'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;const results=[];
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader'],headless:true});
 const page=await browser.newPage();await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 await page.goto(origin+'/phase3-fixture');await page.waitForSelector('#adminContent');await page.waitForTimeout(350);
 await page.evaluate(()=>{
  adminData.settings.coursePrices={[GRADES[0]]:300};currentSection='payments';
  MFCloud.getPaymentDashboard=async()=>({rows:adminData.students.slice(0,4).map((student,i)=>({key:'synthetic-'+i,student:{...student,name:i===0?'طالب تجريبي باسم عربي طويل لاختبار التفاف النص':'طالب تجريبي '+i},month:MONTHS[8],academicYear:'2026/2027',expected:i===3?0:300,paid:i===1?150:i===2?300:0,remaining:i===0?300:i===1?150:0,status:i===2?'paid':i===1?'partial':'unpaid',priceConfigured:i!==3})),totals:{today:0,collected:450,expected:900,remaining:450,paid:1,partial:1,unpaid:2},courses:{},generatedAt:new Date().toISOString()});
  MFCloud.getPaymentHistory=async()=>({rows:[],nextCursor:null});renderPayments();
 });await page.waitForSelector('.payment-compact-row');await page.evaluate(()=>syncAdminChrome());
 for(const width of [320,360,390,412,768,1024,1366,1920])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.waitForTimeout(80);
  const metrics=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,row:document.querySelector('.payment-compact-row').getBoundingClientRect().height,columns:getComputedStyle(document.querySelector('#paymentRows')).gridTemplateColumns,buttons:[...document.querySelectorAll('.payment-row-actions button')].filter(x=>!x.disabled).map(x=>{const r=x.getBoundingClientRect();return {w:r.width,h:r.height,left:r.left,right:r.right};})}));
  assert(metrics.page<=width,`overflow ${width} ${theme}: ${metrics.page}`);assert(metrics.buttons.every(b=>b.left>=0&&b.right<=width),`clipped actions ${width}`);
  if(width<=700)assert(metrics.buttons.every(b=>b.h>=44),`small touch target ${width}`);
  if(width>=1366)assert(metrics.row<110,`oversized desktop row ${width}: ${metrics.row}`);
  results.push({width,theme,...metrics});await page.screenshot({path:`verification/phase3b/payments-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
  await page.evaluate(()=>toggleAdminDrawer(true));
  for(const label of ['الرئيسية','الطلاب','التعليم','المالية','المتابعة','التشغيل','الإدارة']){
   await page.locator(`[data-admin-workspace="${label}"]`).click();
   assert.equal(await page.locator('#adminNavList [data-admin-nav-group]:visible').count(),1);
   assert.equal(await page.locator('[data-admin-workspace][aria-expanded="true"]').getAttribute('data-admin-workspace'),label);
  }
  const navMetrics=await page.evaluate(()=>({page:document.documentElement.scrollWidth,touch:[...document.querySelectorAll('[data-admin-workspace]')].map(b=>b.getBoundingClientRect().height)}));
  assert(navMetrics.page<=width);assert(navMetrics.touch.every(h=>h>=44));
  results.push({width,theme,workspaceChecks:7,...navMetrics});
  await page.screenshot({path:`verification/phase3b/navigation-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
  await page.evaluate(()=>{showAdminWorkspace('المالية');toggleAdminDrawer(false);});
 }
 await page.setViewportSize({width:390,height:1000});await page.locator('.payment-compact-row [aria-expanded]').first().click();assert.equal(await page.locator('.payment-history-shell').first().isVisible(),true);
 await page.screenshot({path:'verification/phase3b/payment-history-mobile.png',fullPage:true,animations:'disabled'});
 await page.locator('.payment-history-actions [data-tm-action]').first().click();await page.waitForTimeout(100);
 assert.equal(await page.locator('#monthlyPaymentModal').isVisible(),true);
 await page.screenshot({path:'verification/phase3b/payment-modal-mobile.png',fullPage:true,animations:'disabled'});
 results.push({historyExpansion:true,partialPaymentModal:true});
 await page.evaluate(()=>document.getElementById('monthlyPaymentModal')?.remove());
 await page.evaluate(()=>{Object.assign(MFCloud,{getAdminOperationsDashboard:async()=>({sessions:[],students:[],pending:[],metrics:{}}),getExamDashboard:async()=>({exams:[]}),getHomeworkAdminWorkspace:async()=>({assignments:[],submissions:[]})});});
 for(const width of [320,360,390,412,768,1024,1366,1920])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  for(const section of ['students','attendance','exams','assignments','bookings']){
   await page.evaluate(id=>goAdminSection(id),section);await page.waitForTimeout(70);
   const pageWidth=await page.evaluate(()=>document.documentElement.scrollWidth);assert(pageWidth<=width,`${section} overflow ${width}: ${pageWidth}`);
   results.push({width,theme,section,pageWidth});
   if(width===390&&theme==='light'||width===1366&&theme==='dark')await page.screenshot({path:`verification/phase3b/${section}-${width}-${theme}.png`,animations:'disabled'});
  }
 }
 await page.evaluate(()=>toggleAdminDrawer(true));await page.locator('[data-admin-workspace="التعليم"]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('[data-admin-workspace="التعليم"]').getAttribute('aria-expanded'),'true');
 await page.locator('#adminNavSearch').fill('بنوك');assert.equal(await page.locator('#adminNavList [data-admin-nav]:visible').count(),1);
 await page.locator('[data-admin-nav="questionBanks"]').click();await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>currentSection),'questionBanks');
 results.push({keyboardWorkspace:true,searchAcrossWorkspaces:true,originalRouting:true});

 fs.writeFileSync('verification/phase3b/browser-results.json',JSON.stringify({scope:'Synthetic real-renderer visual QA; not authenticated backend verification',results},null,2));
 console.log(JSON.stringify(results,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
