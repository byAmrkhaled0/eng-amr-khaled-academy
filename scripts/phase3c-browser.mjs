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
let browser;const results=[],failures=[],errors=[];
try {
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
 const page=await browser.newPage();
 await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/phase3-fixture');await page.waitForSelector('#adminContent');await page.waitForTimeout(350);
 await page.addScriptTag({url:origin+'/scripts/browser/phase3c-dense-fixture.js'});await page.evaluate(()=>installPhase3CDenseFixture());
 const sections=process.env.QA_SECTIONS?process.env.QA_SECTIONS.split(','):['students','attendance','exams','assignments','bookings','reviews','motivation','studentRequests'];
 for(const width of (process.env.QA_INTERACTIONS_ONLY?[]:[320,360,390,412,768,1024,1366,1920]))for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  for(const section of sections){
   await page.evaluate(id=>goAdminSection(id),section);await page.waitForTimeout(100);
   const metrics=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,filterHeight:document.querySelector('.student-filter-bar-v38')?.getBoundingClientRect().height||null,searchWidth:document.querySelector('#studentSearchAdmin')?.getBoundingClientRect().width||null,nameWrap:document.querySelector('.v56-student-identity b')?getComputedStyle(document.querySelector('.v56-student-identity b')).whiteSpace:null,touch:[...document.querySelectorAll('.review-admin-actions button,.admin-exam-card button,.homework-file-actions button,.compact-booking-actions button,.academic-actions button,.motivation-admin-ranking button')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height;}).map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})),controls:document.querySelectorAll('#adminContent button,#adminContent input,#adminContent select,#adminContent a').length,records:document.querySelectorAll('#adminContent tbody tr,#adminContent .v56-student-row,#adminContent .review-admin-item,#adminContent .mobile-admin-card,#adminContent .admin-exam-card,#adminContent .admin-content-row,#adminContent .booking-admin-card,#adminContent .transfer-request-card,#motivationAdminRanking>article').length,overflow:[...document.querySelectorAll('#adminContent *')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.right>innerWidth+1||r.left< -1)&&!el.closest('.table-wrap');}).slice(0,8).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,35)}))}));
   const entry={width,theme,section,...metrics};results.push(entry);
   if(metrics.page>width||metrics.overflow.length)failures.push(entry);
   if(process.env.QA_STAGE!=='before'){if(width<=700&&metrics.touch.some(x=>x.h<44||x.w<44))failures.push({...entry,reason:'touch target'});if(section==='students'&&(metrics.nameWrap!=='normal'||(width<=700&&metrics.searchWidth<width*.65)))failures.push({...entry,reason:'name/search presentation'});}
   if(width===390&&theme==='light'||width===1366&&theme==='dark'){const target={students:'#studentsTableBox',attendance:'#attendanceRows',exams:'.admin-exam-grid',assignments:'.homework-admin-file',bookings:'.booking-admin-list',reviews:'#adminContent .grid-2',motivation:'#motivationAdminRanking',studentRequests:'#requestList'}[section];const list=page.locator(target).first();if(await list.count())await list.scrollIntoViewIfNeeded();await page.screenshot({path:`verification/phase3c/${process.env.QA_STAGE||'after'}-${section}-${width}-${theme}.png`,animations:'disabled'});}
  }
 }
 await page.setViewportSize({width:390,height:1000});await page.evaluate(()=>goAdminSection('students'));await page.waitForTimeout(750);
 await page.locator('.v56-student-actions summary').first().press('Enter');await page.locator('.v56-action-menu').first().waitFor({state:'visible'});
 await page.locator('.v56-action-menu [data-tm-action="openStudentGroupManager"]').first().click();assert(await page.locator('#studentGroupManager').isVisible());await page.screenshot({path:`verification/phase3c/${process.env.QA_STAGE||'after'}-student-group-dialog.png`});await page.evaluate(()=>closeStudentGroupManager());
 await page.evaluate(()=>goAdminSection('assignments'));await page.waitForTimeout(150);assert.equal(await page.locator('#homeworkAttendanceAssignment').inputValue(),'qa-homework-11');assert(await page.locator('.homework-admin-file').count());
 await page.evaluate(()=>toggleHomeworkCreator(true));assert(await page.locator('#assignmentFormV6061').isVisible());await page.evaluate(()=>toggleHomeworkCreator(false));
 assert.equal(await page.locator('[data-admin-workspace]').count(),7);assert.equal(await page.locator('#adminNavList [data-admin-nav]').count(),19);
 fs.writeFileSync(`verification/phase3c/browser-${process.env.QA_STAGE||'after'}.json`,JSON.stringify({scope:'Synthetic real-renderer visual QA, not authenticated Firebase browser verification',browser:await browser.version(),interactions:{keyboardStudentMenu:true,studentGroupDialog:true,homeworkFile:true,homeworkCreator:true,workspaces:7,sections:19},results,failures,errors},null,2));
 console.log(JSON.stringify({cases:results.length,failures:failures.map(x=>({section:x.section,width:x.width,page:x.page})),errors}));
 if(failures.length||errors.length)process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
