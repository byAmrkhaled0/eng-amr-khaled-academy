// Phase 5.3 local owner visual evidence; external requests remain blocked.
// Local visual QA of real production renderer/scripts with synthetic services.
// This is not an authenticated Firebase runtime test.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
fs.mkdirSync('verification/phase53/after/screenshots',{recursive:true});
const root=process.cwd(),teacher=fs.readFileSync('teacher-login.html','utf8');
const css=[...teacher.matchAll(/<link[^>]*href="(assets\/[^"?]+\.css)[^"]*"[^>]*>/g)].map(m=>`<link rel="stylesheet" href="/${m[1]}">`).join('');
const scripts=[...teacher.matchAll(/<script\s+defer\b[^>]*\bsrc="(assets\/[^?]+)\?/g)].map(m=>m[1]).filter(s=>!/firebase-(config|sync)|offline-attendance/.test(s)).map(s=>`<script defer src="/${s}"></script>`).join('');
const fixture=`<!doctype html><html lang="ar" dir="rtl" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="adminRoot"></div><div id="toast"></div>${scripts}<script defer src="/scripts/browser/attendance-fixture.js"></script></body></html>`;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),name=url.pathname;if(name==='/phase3-fixture'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}if(name==='/phase53-parent'){let html=fs.readFileSync(path.join(root,'parent.html'),'utf8').replace(/<script[^>]*src="assets\/firebase-(?:config|sync)[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><base href="'+origin+'/"><script>window.MFCloud={ready:false};</script>');res.setHeader('Content-Type','text/html');res.end(html);return;}if(name==='/phase5-student'){let html=fs.readFileSync(path.join(root,'student.html'),'utf8').replace(/<script[^>]*src="assets\/firebase-(?:config|sync)[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><base href="'+origin+'/"><script>window.MFCloud={ready:false};</script>');res.setHeader('Content-Type','text/html');res.end(html);return;}if(name.startsWith('/phase5-public/')){const pageName=name.split('/').pop();if(!['index','student','learning-path','materials','theory-lectures','exams','parent','practical','reviews','questions'].includes(pageName)){res.writeHead(404);res.end();return;}const html=fs.readFileSync(path.join(root,pageName+'.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('<head>','<head><base href="'+origin+'/">');res.setHeader('Content-Type','text/html');res.end(html);return;}const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;const results=[],failures=[],errors=[];
try {
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
 const page=await browser.newPage();const blockedRequests=[];
 await page.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();blockedRequests.push(route.request().url());return route.abort();});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/phase3-fixture');await page.waitForSelector('#adminContent');await page.waitForTimeout(350);
 await page.addScriptTag({url:origin+'/scripts/browser/phase3c-dense-fixture.js'});await page.evaluate(()=>{installPhase3CDenseFixture();adminData.settings.coursePrices=Object.fromEntries(GRADES.map((g,i)=>[g,i===2?0:300]));MFCloud.getPaymentDashboard=async()=>({rows:adminData.students.map((student,i)=>{const expected=i%6>=4?0:300,paid=i%6===0?300:i%6===1?150:0,month=MONTHS[new Date().getMonth()],academicYear='2026/2027';return {key:'qa-pay-'+i,student,expected,paid,remaining:Math.max(0,expected-paid),priceConfigured:i%6!==5,status:paid>=expected&&expected>0?'paid':paid?'partial':'unpaid',month,academicYear,summary:{studentCode:student.studentCode,course:student.grade,month,academicYear,expectedAmount:expected,paidAmount:paid}};}),totals:{today:0,collected:2700,expected:9000,remaining:6300,paid:6,partial:6,unpaid:24},courses:{},nextCursor:null});MFCloud.getPaymentHistory=async()=>({rows:[],nextCursor:null});});
 await page.evaluate(()=>{adminData.settings.siteUrl='http://127.0.0.1';adminData.settings.teacherPhone='01000000000';adminData.materials=Array.from({length:16},(_,i)=>({id:'qa-material-'+i,title:'محاضرة تجريبية محلية بعنوان عربي طويل لاختبار عرض المحتوى '+i,grade:GRADES[i%3],group:'مجموعة تجريبية '+(i%3+1),lectureCategory:i%2?'theory':'practical',materialType:i%2?'theory':'pdf',lectureNumber:i+1,order:i+1,status:i%4?'منشور':'مسودة',active:true,published:true,desc:'وصف محلي طويل لاختبار العرض فقط',fileName:'ملف-محلي.pdf',fileUrl:''}));MFCloud.listCurriculumAdmin=async()=>({rows:Array.from({length:12},(_,i)=>({id:'qa-content-'+i,title:'محتوى تجريبي محلي طويل لاختبار المنهج وبنك الأسئلة '+i,description:'وصف تجريبي فقط',grade:GRADES[i%3],term:'الترم الأول',status:['published','hidden','draft'][i%3],lectureNumber:i+1,order:i+1})),hasMore:false,nextCursor:null});const ranking=MFCloud.getMotivationLeaderboardAdmin;MFCloud.getMotivationLeaderboardAdmin=async args=>(await ranking(args)).map((r,i)=>({...r,maxAbsenceStreak:i%4+2,activeAbsenceDates:['2026-10-08','2026-10-09'],parentPhone:'01000000001'}));});
 await page.locator('#adminAttentionButton').click();await page.waitForSelector('#adminAttentionPanel:not([hidden])');await page.screenshot({path:'verification/phase53/after/screenshots/notifications-desktop.png'});await page.keyboard.press('Escape');assert.equal(await page.locator('#adminAttentionPanel').isVisible(),false);
 const sectionMap=JSON.parse(fs.readFileSync('verification/phase3e/admin-section-map.json'));const sections=sectionMap.map(x=>x.sectionId);
 for(const width of (process.env.QA_INTERACTIONS_ONLY?[]:[320,360,390,430,768,820,1024,1366,1440,1920]))for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  for(const section of sections){
   await page.evaluate(id=>goAdminSection(id),section);await page.waitForTimeout(100);
   const metrics=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,filterHeight:document.querySelector('.student-filter-bar-v38')?.getBoundingClientRect().height||null,searchWidth:document.querySelector('#studentSearchAdmin')?.getBoundingClientRect().width||null,nameWrap:document.querySelector('.v56-student-identity b')?getComputedStyle(document.querySelector('.v56-student-identity b')).whiteSpace:null,touch:[...document.querySelectorAll('.review-admin-actions button,.admin-exam-card button,.homework-file-actions button,.compact-booking-actions button,.academic-actions button,.motivation-admin-ranking button')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height;}).map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})),controls:document.querySelectorAll('#adminContent button,#adminContent input,#adminContent select,#adminContent a').length,records:document.querySelectorAll('#adminContent tbody tr,#adminContent .v56-student-row,#adminContent .review-admin-item,#adminContent .mobile-admin-card,#adminContent .admin-exam-card,#adminContent .admin-content-row,#adminContent .booking-admin-card,#adminContent .transfer-request-card,#motivationAdminRanking>article').length,overflow:[...document.querySelectorAll('#adminContent *')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.right>innerWidth+1||r.left< -1)&&!el.closest('.table-wrap')&&!el.closest('.curriculum-admin-tabs');}).slice(0,8).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,35)}))}));
   const nav=await page.evaluate(()=>({section:currentSection,active:document.querySelector('#adminNavList [aria-current="page"]')?.dataset.adminNav,workspace:document.querySelector('[data-admin-workspace][aria-expanded="true"]')?.dataset.adminWorkspace}));const entry={width,theme,section,...metrics,nav};results.push(entry);if(nav.section!==section||nav.workspace!==sectionMap.find(s=>s.sectionId===section).workspace)failures.push({...entry,reason:'navigation'});
   if(metrics.page>width||metrics.overflow.length)failures.push(entry);
   if(process.env.QA_STAGE!=='before'){if(width<=700&&metrics.touch.some(x=>x.h<44||x.w<44))failures.push({...entry,reason:'touch target'});if(section==='students'&&(metrics.nameWrap!=='normal'||(width<=700&&metrics.searchWidth<width*.65)))failures.push({...entry,reason:'name/search presentation'});}
   if([390,1024,1440].includes(width)&&((width===1440&&theme==='dark')||(width!==1440&&theme==='light'))){const target={students:'#studentsTableBox',attendance:'#attendanceRows',exams:'.admin-exam-grid',assignments:'.homework-admin-file',bookings:'.booking-admin-list',reviews:'#adminContent .grid-2',motivation:'#motivationAdminRanking',studentRequests:'#requestList'}[section];if(['overview','students','attendance','payments','exams','assignments','bookings','curriculum','reviews','settings'].includes(section))await page.screenshot({path:`verification/phase53/after/screenshots/${section}-${width}-${theme}.png`,animations:'disabled'});}
  }
 }
 await page.setViewportSize({width:390,height:1000});await page.evaluate(()=>goAdminSection('students'));await page.waitForTimeout(750);
 await page.locator('.v56-student-actions summary').first().press('Enter');await page.locator('.v56-action-menu').first().waitFor({state:'visible'});
 await page.locator('.v56-action-menu [data-tm-action="openStudentGroupManager"]').first().click();assert(await page.locator('#studentGroupManager').isVisible());await page.screenshot({path:`verification/phase53/after/screenshots/student-group-dialog.png`});await page.evaluate(()=>closeStudentGroupManager());
 await page.evaluate(()=>goAdminSection('assignments'));await page.waitForTimeout(150);assert.equal(await page.locator('#homeworkAttendanceAssignment').inputValue(),'qa-homework-11');assert(await page.locator('.homework-admin-file').count());
 await page.evaluate(()=>toggleHomeworkCreator(true));assert(await page.locator('#assignmentFormV6061').isVisible());await page.evaluate(()=>toggleHomeworkCreator(false));
 assert.equal(await page.locator('[data-admin-workspace]').count(),8);assert.equal(await page.locator('#adminNavList [data-admin-nav]').count(),19);

 // Real existing profile renderer and request path, with a synthetic service response.
 await page.evaluate(()=>{MFCloud.getStudentAdminProfile=async({studentCode})=>({student:adminData.students.find(s=>s.studentCode===studentCode),monthlyReport:{schemaVersion:11,policyVersion:MONTHLY_REPORT_POLICY,student:{studentCode},monthKey:adminReportMonthKey(),monthlyTitle:'تقرير محلي',level:'تجريبي',overallScore:null,attendance:{rows:[]},homework:{rows:[]},results:{rows:[]}},privateNotes:[]});});
 for(const width of [390,1024,1440]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>goAdminSection('students'));await page.waitForTimeout(150);await page.evaluate(()=>editStudent('QA1'));
  assert(await page.locator('.admin-student-detail .profile-hero').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const view of ['attendance','results','homework','payments','notes','reports']){await page.locator(`[data-profile-view="${view}"]`).click();assert.equal(await page.locator(`[data-profile-panel="${view}"]`).getAttribute('hidden'),null);}
  await page.screenshot({path:`verification/phase53/after/screenshots/student-profile-${width}.png`});await page.keyboard.press('Escape');assert.equal(await page.locator('#unifiedStudentProfile').count(),0);
 }
 const interactions=[];
 await page.setViewportSize({width:320,height:1000});
 await page.evaluate(()=>goAdminSection('payments'));await page.waitForSelector('.payment-compact-row');
 await page.locator('.payment-history-actions button').last().click();assert(await page.locator('.payment-history-shell:not([hidden])').count());interactions.push({history:true});
 await page.locator('[data-tm-action="openMonthlyPaymentForm"]:not([disabled])').first().click();assert(await page.locator('#monthlyPaymentForm').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'verification/phase53/after/screenshots/payment-modal-320.png'});await page.evaluate(()=>closeMonthlyPaymentForm());interactions.push({partialPaymentDialog:true});
 await page.evaluate(()=>goAdminSection('schedules'));await page.waitForTimeout(120);await page.locator('[data-tm-action="editSchedule"]').first().click();assert(await page.locator('#scheduleForm').count());interactions.push({groupEditForm:true});
 await page.evaluate(()=>goAdminSection('exams'));await page.waitForTimeout(120);await page.evaluate(()=>toggleExamCreator(true));interactions.push({examCreator:await page.locator('#examFormV6061').isVisible()});
 await page.evaluate(()=>toggleAdminDrawer(true));await page.locator('[data-admin-workspace="التقييمات"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-admin-workspace="التقييمات"]').getAttribute('aria-expanded'),'true');await page.evaluate(()=>toggleAdminDrawer(true));await page.locator('#adminNavSearch').fill('بنوك');assert.equal(await page.locator('#adminNavList [data-admin-nav]:visible').count(),1);const searchGeometry=[];
 for(const searchWidth of [320,360,390,430,768,820])for(const searchTheme of ['light','dark']){
  await page.setViewportSize({width:searchWidth,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,searchTheme);
  await page.evaluate(()=>toggleAdminDrawer(true));await page.locator('#adminNavSearch').fill('بنوك');
  const target=page.locator('[data-admin-nav="questionBanks"]');
  assert(await target.evaluate(el=>document.getElementById('adminSidebar').contains(el)));
  const geometry=await page.evaluate(()=>{const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};return {target:rect('[data-admin-nav="questionBanks"]'),status:rect('#adminNavSearchStatus'),workspace:rect('[data-admin-workspace][aria-expanded="true"]'),drawer:rect('#adminSidebar')};});
  const {target:t,status:st,drawer:d}=geometry;assert(t.x>=d.x&&t.x+t.width<=d.x+d.width+1&&t.y>=d.y&&t.y+t.height<=d.y+d.height+1);assert(t.y>=st.y+st.height||t.y+t.height<=st.y);
  await target.click();assert.equal(await page.evaluate(()=>currentSection),'questionBanks');
  assert(await page.locator('.admin-main #adminNavList').count());assert.equal(await page.locator('#adminNavList [data-admin-nav]').count(),19);
  await page.evaluate(()=>toggleAdminDrawer(true));await page.locator('#adminNavSearch').fill('بنوك');await page.locator('#adminNavSearch').fill('');assert(await page.locator('.admin-main #adminNavList').count());await page.keyboard.press('Escape');
  searchGeometry.push({width:searchWidth,theme:searchTheme,...geometry,result:'PASS'});
 }
 fs.writeFileSync('verification/phase53/after/mobile-search-geometry.json',JSON.stringify(searchGeometry,null,2));
interactions.push({keyboardWorkspace:true,adminSearch:true});
 fs.writeFileSync('verification/phase53/after/interaction-results.json',JSON.stringify(interactions,null,2));

 const publicStates=[];
 const publicPage=await browser.newPage();
 await publicPage.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 publicPage.on('pageerror',e=>errors.push('public: '+e.message));
 for(const width of [320,360,390,430,768,820,1024,1366,1440,1920])for(const theme of ['light','dark'])for(const name of ['index','student','learning-path','materials','theory-lectures','exams','parent','practical','reviews','questions']){
  await publicPage.setViewportSize({width,height:1000});
  await publicPage.goto(origin+'/phase5-public/'+name);await publicPage.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  const metrics=await publicPage.evaluate(()=>({pageWidth:document.documentElement.scrollWidth,width:innerWidth,rtl:document.documentElement.dir}));
  publicStates.push({page:name,width,theme,...metrics});if(metrics.pageWidth>width||metrics.rtl!=='rtl')failures.push({page:name,width,...metrics,reason:'public overflow/RTL'});
  if([390,820,1366].includes(width))await publicPage.screenshot({path:`verification/phase53/after/screenshots/public-${name}-${width}-${theme}.png`,fullPage:true});
 }
 fs.writeFileSync('verification/phase53/after/public-visual-results.json',JSON.stringify(publicStates,null,2));await publicPage.close();
 const studentPage=await browser.newPage({serviceWorkers:'block'});const studentStates=[];
 await studentPage.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 studentPage.on('pageerror',e=>errors.push('student: '+e.message));
 await studentPage.addInitScript(()=>{Storage.prototype.setItem=function(){};});
 for(const width of [320,360,390,430,768,820,1024,1366,1440,1920])for(const theme of ['light','dark']){
  await studentPage.setViewportSize({width,height:1000});await studentPage.goto(origin+'/phase5-student');
  await studentPage.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await studentPage.locator('#studentQuery').fill('abc');assert.equal(await studentPage.locator('#studentQuery').evaluate(el=>el.checkValidity()),false);
  await studentPage.evaluate(()=>{window.__qaStudentReads=0;MFCloud.ready=true;MFCloud.getStudentByCode=async code=>{window.__qaStudentReads++;if(code==='999999')return null;return {studentCode:'123456',name:'طالب تجريبي محلي باسم عربي طويل لاختبار العرض والتنقل',grade:GRADES[0],active:true,attendance:[],grades:[],homeworks:[],examAttempts:[],assignments:[],materials:[],recitations:[],monthlyPayments:[],transferOptions:[]};};});
  await studentPage.locator('#studentQuery').fill('999999');await studentPage.locator('#studentSearchForm [type="submit"]').click();await studentPage.waitForSelector('#studentResult .portal-empty');assert.equal(await studentPage.evaluate(()=>window.__qaStudentReads),1);
// Wait for the existing capture-phase duplicate-submit guard as well as async UI cleanup.
await studentPage.waitForFunction(()=>{const form=document.querySelector('#studentSearchForm');const button=form?.querySelector('[type="submit"]');return Boolean(button&&!button.disabled&&!form.hasAttribute('aria-busy')&&Number(form.dataset.tmSubmitLockedUntil||0)<=Date.now());});
  await studentPage.locator('#studentQuery').fill('123456');await studentPage.locator('#studentSearchForm [type="submit"]').click();await studentPage.waitForSelector('#studentResult .student-app-dashboard');
  const keys=await studentPage.locator('#studentResult [data-student-tab]').evaluateAll(nodes=>nodes.map(n=>n.dataset.studentTab));assert(keys.includes('attendance')&&keys.includes('payments'));
  if(width<=700){const more=studentPage.locator('#studentResult .tm-nav-more');
   const captureMoreGeometry=async phase=>{
    const geometry=await studentPage.evaluate(()=>{
     const describe=el=>{if(!el)return null;const r=el.getBoundingClientRect(),c=getComputedStyle(el);return {tag:el.tagName,id:el.id,classes:el.className,rect:{x:r.x,y:r.y,width:r.width,height:r.height},position:c.position,zIndex:c.zIndex,overflow:c.overflow,pointerEvents:c.pointerEvents,transform:c.transform,filter:c.filter,contain:c.contain,isolation:c.isolation,animation:c.animation,paddingBottom:c.paddingBottom};};
     const summary=document.querySelector('#studentResult .tm-nav-more summary'),rect=summary?.getBoundingClientRect(),x=rect?rect.x+rect.width/2:0,y=rect?rect.y+rect.height/2:0,hit=document.elementFromPoint(x,y);
     const ancestors=[];for(let el=summary;el;el=el.parentElement)ancestors.push(describe(el));
     return {viewport:{width:innerWidth,height:innerHeight},scroll:{x:scrollX,y:scrollY},summary:describe(summary),more:describe(summary?.parentElement),curriculum:describe(document.querySelector('#studentCurriculumPanel')),empty:describe(document.querySelector('#studentCurriculumPanel .empty-state')),bottom:describe(document.querySelector('.mobile-bottom')),bottomLinks:[...document.querySelectorAll('.mobile-bottom a')].map(describe),panels:[...document.querySelectorAll('[data-student-panel]')].map(el=>({...describe(el),display:getComputedStyle(el).display})),ancestors,center:{x,y},hit:describe(hit),summaryReceivesPointer:Boolean(summary&&(hit===summary||summary.contains(hit)))};
    });
    fs.writeFileSync(`verification/phase53/after/student-more-geometry-${width}-${theme}-${phase}.json`,JSON.stringify(geometry,null,2));
    await studentPage.screenshot({path:`verification/phase53/after/screenshots/student-more-${width}-${theme}-${phase}.png`});
   };
   await captureMoreGeometry('before');
   const moreHit=await more.locator('summary').evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),bottom=document.querySelector('.mobile-bottom')?.getBoundingClientRect();return {receives:hit===el||el.contains(hit),inside:r.top>=0&&r.bottom<=innerHeight,separated:!bottom||r.bottom<=bottom.top};});
   assert(moreHit.inside&&moreHit.receives&&moreHit.separated,'Student More must receive the pointer inside viewport above public bottom navigation');
   try{await more.locator('summary').click();}catch(error){await captureMoreGeometry('failed');throw error;}
await more.locator('[data-student-tab="attendance"]').click();assert.equal(await studentPage.locator('[data-student-panel="attendance"]').evaluate(el=>el.classList.contains('show')),true);await more.locator('summary').click();await studentPage.keyboard.press('Escape');assert.equal(await more.getAttribute('open'),null);}
  assert.equal(await studentPage.evaluate(()=>window.__qaStudentReads),2);
  const metric=await studentPage.evaluate(()=>({page:document.documentElement.scrollWidth,width:innerWidth}));studentStates.push({width,theme,...metric});if(metric.page>width)failures.push({width,theme,reason:'student overflow'});
  if([390,820,1366].includes(width))await studentPage.screenshot({path:`verification/phase53/after/screenshots/student-dashboard-${width}-${theme}.png`,fullPage:true});
 }
 fs.writeFileSync('verification/phase53/after/student-browser-results.json',JSON.stringify(studentStates,null,2));await studentPage.close();

 // Phase52: actual entry HTML, and actual parent form + renderer with local services.
 const entries=[],parentStates=[],widths52=[320,360,390,430,768,820,1024,1366,1440,1920];
 for(const width of widths52)for(const theme of ['light','dark']){
  for(const name of ['teacher-login','student','parent']){
   const entry=await browser.newPage({viewport:{width,height:1000},serviceWorkers:'block'});
   await entry.route('**/*',r=>new URL(r.request().url()).origin===origin&&r.request().method()==='GET'?r.continue():r.abort());
   await entry.addInitScript(()=>{window.__qaLayoutShift=0;try{new PerformanceObserver(list=>{for(const item of list.getEntries())if(!item.hadRecentInput)window.__qaLayoutShift+=item.value;}).observe({type:'layout-shift',buffered:true});}catch{}});
   await entry.goto(origin+'/'+name+'.html',{waitUntil:'domcontentloaded'});await entry.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const form=entry.locator(name==='teacher-login'?'#loginForm':name==='student'?'#studentSearchForm':'#parentSearchForm');await form.waitFor({state:'visible'});
   const field=form.locator('input:not([type=hidden])').first();await field.fill(name==='teacher-login'?'qa@example.invalid':'123456');
   const metrics=await entry.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,domNodes:document.querySelectorAll('*').length,observedCLS:window.__qaLayoutShift,formCheckMs:performance.now(),headStyles:[...document.head.querySelectorAll('link[rel=stylesheet]')].map(x=>x.getAttribute('href')),resources:performance.getEntriesByType('resource').map(x=>({url:x.name,type:x.initiatorType,transferSize:x.transferSize,duration:x.duration}))}));
   if(metrics.page>width)failures.push({name,width,theme,reason:'entry overflow'});if(name==='teacher-login')assert.equal(metrics.headStyles.length,1);
   entries.push({name,width,theme,scope:'Nonlocal services blocked. Input editability, NOT auth service timing.',...metrics});
   if([390,820,1440].includes(width))await entry.screenshot({path:`verification/phase53/after/screenshots/${name}-entry-${width}-${theme}.png`,fullPage:true});await entry.close();
  }
  const parent=await browser.newPage({viewport:{width,height:1000},serviceWorkers:'block'});await parent.route('**/*',r=>new URL(r.request().url()).origin===origin&&r.request().method()==='GET'?r.continue():r.abort());parent.on('pageerror',e=>errors.push('parent: '+e.message));
  await parent.addInitScript(()=>{Storage.prototype.setItem=function(){};});await parent.goto(origin+'/phase53-parent');await parent.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await parent.evaluate(()=>{window.__qaParentReads=0;window.__qaParentReports=0;MFCloud.ready=true;MFCloud.getParentStudent=async code=>{window.__qaParentReads++;return {studentCode:code,name:'طالب تجريبي محلي باسم عربي طويل لاختبار تقرير ولي الأمر',grade:GRADES[0],active:true};};MFCloud.getParentMonthlyReport=async(code,monthKey)=>{window.__qaParentReports++;return {schemaVersion:11,policyVersion:MONTHLY_REPORT_POLICY,monthKey,student:{studentCode:code,name:'طالب تجريبي محلي باسم عربي طويل لاختبار تقرير ولي الأمر',grade:GRADES[0],group:'مجموعة محلية'},monthlyTitle:'بيانات غير كافية',level:'بيانات غير كافية',overallScore:null,attendance:{rows:[],percentage:null,present:0,absent:0},homework:{rows:[],completionPercentage:null,submitted:0,required:0},results:{rows:[],average:null},motivation:{},warnings:[],deliveryState:{firstDelivery:true}};};});
  await parent.locator('#parentCode').fill('123456');await parent.locator('#parentSearchForm [type=submit]').click();await parent.waitForSelector('#parentResult .parent-monthly-report-v70');
  assert.equal(await parent.evaluate(()=>__qaParentReads),1);assert.equal(await parent.evaluate(()=>__qaParentReports),1);
  const metric=await parent.evaluate(()=>({page:document.documentElement.scrollWidth,width:innerWidth,controls:document.querySelectorAll('#parentResult button,#parentResult select').length}));if(metric.page>width)failures.push({width,theme,reason:'parent report overflow'});
  parentStates.push({width,theme,scope:'Synthetic local services; actual code form and monthly renderer.',...metric});if([390,820,1440].includes(width))await parent.screenshot({path:`verification/phase53/after/screenshots/parent-report-${width}-${theme}.png`,fullPage:true});await parent.close();
 }
 fs.writeFileSync('verification/phase53/after/entry-performance.json',JSON.stringify(entries,null,2));fs.writeFileSync('verification/phase53/after/parent-browser-results.json',JSON.stringify(parentStates,null,2));
 const smoke=[];let attendanceScheduleEvidence;
 for(const [section,action] of [['students','editStudent'],['attendance','setAttendanceStatus'],['exams','editLiveExam'],['assignments','grantHomeworkRetakeAdmin'],['bookings','approveBooking']]){await page.evaluate(id=>goAdminSection(id),section);await page.waitForTimeout(150);// QA-only fixed schedule dates: Sunday must remain blocked; Saturday must be usable.
 if(section==='attendance'){
  const scheduleEvidence=await page.evaluate(()=>{
   const student=adminData.students.find(row=>row.studentCode==='QA1');
   // The fixture supplies the entire synthetic transfer history; no network load is needed.
   adminAttendanceTransfersLoaded=true;
   attendanceDate='2026-10-11';renderAttendance();
   return {studentCode:student.studentCode,scheduleId:student.scheduleId,systemDate:isoDateAdmin(),invalid:attendanceDayAllowed(student),invalidDate:attendanceDate};
  });
  assert.equal(scheduleEvidence.scheduleId,'qa-group-0');
  assert.equal(scheduleEvidence.invalid.ok,false);assert.equal(scheduleEvidence.invalid.day,'الأحد');
  assert.equal(scheduleEvidence.invalid.message,'هذا اليوم خارج مواعيد مجموعة الطالب.');
  assert(await page.locator('[data-tm-action="setAttendanceStatus"]').first().isDisabled());
  assert.equal(await page.locator('[data-tm-action="setAttendanceStatus"]').first().getAttribute('title'),scheduleEvidence.invalid.message);
  const valid=await page.evaluate(()=>{attendanceDate='2026-10-10';renderAttendance();return attendanceDayAllowed(adminData.students.find(row=>row.studentCode==='QA1'));});
  assert.equal(valid.ok,true);assert.equal(valid.day,'السبت');
  assert(await page.locator('[data-tm-action="setAttendanceStatus"]').first().isEnabled());
  assert.deepEqual(JSON.parse(await page.locator('[data-tm-action="setAttendanceStatus"]').first().getAttribute('data-tm-args')),['QA1','present']);
  attendanceScheduleEvidence={...scheduleEvidence,validDate:'2026-10-10',valid};
 }
 const locator=page.locator(`[data-tm-action="${action}"]`).first();if(await locator.count()){await page.evaluate(name=>{window.__qaOriginal=window[name];window.__qaActionCalls=[];window[name]=(...args)=>window.__qaActionCalls.push({name,args});},action);await locator.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});await locator.click();const calls=await page.evaluate(()=>__qaActionCalls);if(section==='attendance')assert.deepEqual(calls,[{name:action,args:['QA1','present']}]);await page.evaluate(name=>{window[name]=window.__qaOriginal;},action);smoke.push({section,action,calls,pass:calls.length===1,...(section==='attendance'?{scheduleEvidence:attendanceScheduleEvidence}:{})});}else smoke.push({section,action,pass:false,reason:'hook absent'});}
 await page.evaluate(()=>goAdminSection('settings'));await page.waitForTimeout(120);assert(await page.locator('#settingsForm').count());await page.locator('#settingsForm input').first().fill('http://127.0.0.1/local-synthetic');smoke.push({section:'settings',inputUsable:true});
 fs.writeFileSync('verification/phase53/after/handler-smoke.json',JSON.stringify(smoke,null,2));
 fs.writeFileSync('verification/phase53/after/network-boundary.json',JSON.stringify({scope:'All outgoing requests outside loopback fixture origin aborted; Firebase SDKs not loaded',blockedRequests},null,2));
 const controls=[];for(const section of sections){await page.evaluate(id=>goAdminSection(id),section);await page.waitForTimeout(100);controls.push({section,controls:await page.evaluate(()=>[...document.querySelectorAll('#adminContent button,#adminContent a,#adminContent input,#adminContent select,#adminContent textarea,#adminContent summary')].map(el=>({tag:el.tagName,id:el.id,name:el.name||'',type:el.type||'',onclick:el.getAttribute('onclick'),onchange:el.getAttribute('onchange'),oninput:el.getAttribute('oninput'),action:el.getAttribute('data-tm-action'),args:el.getAttribute('data-tm-args'),href:el.getAttribute('href')})))});}fs.writeFileSync('verification/phase53/after/control-capture.json',JSON.stringify(controls,null,2));
 const stateResults=[];await page.evaluate(()=>{for(const key of ['students','groups','bookings','exams','examAttempts','assignments','materials','questions','reviews','studentTransferRequests'])adminData[key]=[];MFCloud.getPaymentDashboard=async()=>({rows:[],totals:{},courses:{}});MFCloud.getMotivationLeaderboardAdmin=async()=>[];MFCloud.getHomeworkAdminWorkspace=async()=>({students:[]});MFCloud.listCurriculumAdmin=async()=>({rows:[],hasMore:false,nextCursor:null});});
 for(const width of [320,1366]){await page.setViewportSize({width,height:1000});for(const section of sections){await page.evaluate(id=>goAdminSection(id),section);await page.waitForTimeout(100);const pageWidth=await page.evaluate(()=>document.documentElement.scrollWidth);stateResults.push({section,width,state:'empty',pageWidth});if(pageWidth>width)failures.push({section,width,page:pageWidth,reason:'empty overflow'});}}
 fs.writeFileSync('verification/phase53/after/empty-states.json',JSON.stringify(stateResults,null,2));

 const asyncStates=[];
 for(const width of [320,1366]){await page.setViewportSize({width,height:1000});for(const section of ['payments','warnings','curriculum','questionBanks']){await page.evaluate(()=>{window.__qaReject=null;const deferred=()=>new Promise((resolve,reject)=>{window.__qaReject=reject;});MFCloud.getPaymentDashboard=deferred;MFCloud.getMotivationLeaderboardAdmin=deferred;MFCloud.listCurriculumAdmin=deferred;});await page.evaluate(id=>goAdminSection(id),section);await page.waitForTimeout(150);for(const state of ['loading','error']){if(state==='error'){await page.evaluate(()=>window.__qaReject?.(new Error('خطأ تجريبي محلي طويل لاختبار رسالة التعذر وإعادة المحاولة')));await page.waitForTimeout(100);}const metrics=await page.evaluate(()=>({pageWidth:document.documentElement.scrollWidth,content:document.querySelector('#adminContent').innerText.slice(-600)}));asyncStates.push({section,width,state,...metrics});if(metrics.pageWidth>width)failures.push({section,width,page:metrics.pageWidth,reason:state+' overflow'});}}}
 fs.writeFileSync('verification/phase53/after/async-states.json',JSON.stringify(asyncStates,null,2));
 fs.writeFileSync(`verification/phase53/after/browser-acceptance.json`,JSON.stringify({scope:'Synthetic real-renderer visual QA, not authenticated Firebase browser verification',browser:await browser.version(),interactions:{keyboardStudentMenu:true,studentGroupDialog:true,homeworkFile:true,homeworkCreator:true,workspaces:8,sections:19},results,failures,errors},null,2));
 fs.writeFileSync('verification/phase53/after/admin-section-acceptance.json',JSON.stringify(sectionMap.map(s=>({sectionId:s.sectionId,workspace:s.workspace,desktopStatus:failures.some(x=>x.section===s.sectionId&&x.width>700)?'FAIL':'PASS',mobileStatus:failures.some(x=>x.section===s.sectionId&&x.width<=700)?'FAIL':'PASS',actionsReachable:'NOT FULLY VERIFIED',filtersReachable:'NOT FULLY VERIFIED',overflow:failures.filter(x=>x.section===s.sectionId),notes:'Synthetic real renderer, no authenticated Firebase runtime; populated fixture only'})),null,2));console.log(JSON.stringify({cases:results.length,failures:failures.map(x=>({section:x.section,width:x.width,page:x.page})),errors}));
 if(failures.length||errors.length)process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
