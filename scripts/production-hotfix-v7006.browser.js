'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.TM_PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'..');let browser;
const csp=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'))).headers.flatMap(x=>x.headers).find(x=>x.key==='Content-Security-Policy').value;
test.before(async()=>{browser=await chromium.launch({executablePath:process.env.TM_CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox']});console.log('Chromium',browser.version());});
test.after(async()=>browser?.close());
async function pageFor(file,width,theme){
 const page=await browser.newPage({viewport:{width,height:1000}});
 await page.addInitScript(theme=>{localStorage.setItem('mf_theme',theme);window.MFCloud={ready:false};},theme);
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='tm-hotfix.invalid')return route.abort();const name=decodeURIComponent(u.pathname).slice(1)||file;if(/firebase-(config|sync)/.test(name))return route.abort();const local=path.resolve(root,name);if(!local.startsWith(root+'/')||!fs.existsSync(local)||!fs.statSync(local).isFile())return route.abort();return route.fulfill({body:fs.readFileSync(local),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':'image/png',headers:name.endsWith('.html')?{'Content-Security-Policy':csp}:{}});});
 await page.goto('https://tm-hotfix.invalid/'+file);await page.waitForFunction(()=>typeof renderUnifiedResourcesPage==='function');
 await page.evaluate(({theme})=>{document.documentElement.dataset.theme=theme;currentStudentResources={student:{studentCode:'ST001234',name:'طالب الاختبار',grade:'أساسيات برمجة',group:'مجموعة أولى'},materials:[{id:'unit1',title:'محاضرة الوحدة الأولى',description:'شرح ومراجعة للمحتوى',lectureCategory:document.body.dataset.resourceMode==='theory'?'theory':'practical',unit:'الوحدة الأولى',fileUrl:'https://drive.google.com/file/d/test/view',driveUrl:'https://drive.google.com/file/d/test/view',progress:30}]};renderUnifiedResourcesPage();},{theme});
 return page;
}
for(const file of ['theory-lectures.html','materials.html'])for(const theme of ['light','dark'])for(const width of [360,390,768,1366,1920])test(`${file} ${theme} ${width}: actual renderer/cascade readable and contained`,async()=>{
 const page=await pageFor(file,width,theme);try{
 const result=await page.evaluate(()=>{
  const rgb=s=>{const m=s.match(/[\d.]+/g);return m?.slice(0,3).map(Number);};const lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const checks=[];for(const sel of ['#resourceStudentSummary h2','#resourceStudentSummary p','#resourceStudentSummary small','#resourceStudentSummary code','.resource-card h3','.resource-card p','.theory-learning-card h3','.theory-student-toolbar input','.theory-student-toolbar select']){for(const n of document.querySelectorAll(sel)){if(!n.getClientRects().length)continue;let bg=n;while(bg&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;const a=lum(rgb(getComputedStyle(n).color)),b=lum(rgb(getComputedStyle(bg||document.body).backgroundColor));checks.push({sel,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});}}
  return {checks,overflow:document.documentElement.scrollWidth>innerWidth+1,summary:document.querySelector('#resourceStudentSummary').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('#resourceStudentSummary button,.resource-actions .btn')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().toJSON())};
 });assert(result.checks.length>=4);for(const c of result.checks)assert(c.ratio>=4.5,JSON.stringify(c));assert(!result.overflow,'horizontal overflow');assert(result.summary.x>=0&&result.summary.right<=width+1);for(const b of result.buttons)assert(b.width>0&&b.x>=0&&b.right<=width+1);
 await page.evaluate(()=>{currentStudentResources.materials=[];renderUnifiedResourcesPage();});assert(await page.locator('.portal-empty').isVisible());
 }finally{await page.close();}
});

for(const theme of ['light','dark'])test(`payment feedback ${theme}: actual admin card/button/toast render`,async()=>{
 const page=await browser.newPage({viewport:{width:390,height:1000}});
 const html=fs.readFileSync(path.join(root,'teacher-login.html'),'utf8'),sources=[...html.matchAll(/<script defer src="(assets\/[^?]+)\?/g)].map(m=>m[1]).filter(s=>!/(firebase-(?:config|sync)|offline-attendance)/.test(s));
 await page.addInitScript(()=>{window.MFCloud={ready:false};});
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='tm-hotfix.invalid')return r.abort();if(u.pathname==='/teacher-login.html')return r.fulfill({contentType:'text/html; charset=utf-8',headers:{'Content-Security-Policy':csp},body:`<html dir="rtl"><head><meta charset="utf-8">${[...html.matchAll(/<link href="(assets\/[^"?]+\.css)[^"]*" rel="stylesheet"/g)].map(m=>`<link href="/${m[1]}" rel="stylesheet">`).join('')}</head><body><div id="adminRoot"></div><div id="toast"></div>${sources.map(s=>`<script defer src="/${s}"></script>`).join('')}<script defer src="/scripts/browser/attendance-fixture.js"></script></body></html>`});const f=path.join(root,u.pathname.slice(1));if(!f.startsWith(root+'/')||!fs.existsSync(f)||!fs.statSync(f).isFile())return r.abort();return r.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8'});});
 try{await page.goto('https://tm-hotfix.invalid/teacher-login.html');await page.waitForSelector('.attendance-control-card');await page.waitForTimeout(150);
 await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;currentSection='payments';adminData.students=[{studentCode:'ST123456',name:'طالب الدفع',grade:'أساسيات برمجة',active:true}];adminData.settings={coursePrices:{'أساسيات برمجة':500},academicYear:'2026/2027'};window.MFCloud={ready:true,getPaymentDashboard:async()=>({rows:[{key:'ST123456|2026/2027|سبتمبر|أساسيات برمجة',student:adminData.students[0],month:'سبتمبر',academicYear:'2026/2027',expected:500,paid:0,remaining:500,status:'unpaid',priceConfigured:true}],totals:{expected:500,collected:0,remaining:500,paid:0,partial:0,unpaid:1,today:0},courses:{},nextCursor:null}),createPaymentTransaction:async()=>({transactionStatus:'active',expectedAmount:500,paidAmount:500,remainingAmount:0,status:'paid'})};renderPayments();},theme);
 await page.waitForSelector('.quick-paid-button');await page.locator('.quick-paid-button').click();await page.waitForFunction(()=>document.querySelector('.monthly-payment-card')?.textContent.includes('مدفوع بالكامل'));
 const result=await page.evaluate(()=>{const n=document.querySelector('.monthly-payment-card');return {width:n.getBoundingClientRect().width,name:n.textContent,toast:document.querySelector('#toast').textContent,color:getComputedStyle(n).color,bg:getComputedStyle(n).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+1};});assert(result.width>0);assert.match(result.name,/طالب الدفع/);assert.match(result.toast,/تم تأكيد الدفعة/);assert.notEqual(result.color,result.bg);assert(!result.overflow);
 }finally{await page.close();}
});
