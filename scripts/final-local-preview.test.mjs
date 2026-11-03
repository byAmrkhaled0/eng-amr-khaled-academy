import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin='http://127.0.0.1:5188',browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});const results=[];
try{
for(const width of [320,360,390,430,768,820,1024,1366,1440,1920]){
for(const name of ['index','student','parent','teacher-login','admin-local']){
 const p=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());await p.goto(origin+'/'+name+'.html');await p.waitForTimeout(200);
 if(name==='admin-local')await p.waitForSelector('#adminContent');
 if(name==='student'){await p.locator('#studentQuery').fill('123456');await p.locator('#studentSearchForm [type=submit]').click();await p.waitForSelector('.student-app-dashboard');}
 if(name==='parent'){await p.locator('#parentCode').fill('123456');await p.locator('#parentSearchForm [type=submit]').click();await p.waitForSelector('.parent-monthly-report-v70');}
 if(width<=430&&name==='student'){
  const more=p.locator('.student-tabbar .tm-nav-more>summary');await more.waitFor({state:'visible'});await more.click();await p.locator('.tm-nav-more-list [data-student-tab="attendance"]').click();assert(await p.locator('[data-student-panel="attendance"]').evaluate(e=>e.classList.contains('show')));
  assert.equal(await p.locator('.mobile-bottom').isVisible(),false);
 }
 if(width<=430&&['index','student','parent'].includes(name)){
  const buttons=p.locator('nav.mobile-bottom:visible>a,.student-tabbar.tm-compact-tabs>button,.student-tabbar.tm-compact-tabs>details>summary');
  for(const button of await buttons.all()){const m=await button.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:e.textContent,visible:r.width>0,rect:r.toJSON(),hit:hit?.outerHTML.slice(0,500),receives:hit===e||e.contains(hit)};});if(m.visible&&!m.receives){console.log(name,width,m);await p.screenshot({path:'verification/final-mobile/after/screenshots/blocked-local-nav.png'});}if(m.visible)assert(m.receives,name+' nav is blocked');}
 }
 const metrics=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,realLogo:!!document.querySelector('img[src*="technominds-logo"],.logo-mark'),styles:[...document.styleSheets].length,helperBottom:document.getElementById('studentHelpButton')?.getBoundingClientRect().bottom||null}));assert.equal(metrics.overflow,0,name+'/'+width);assert.equal(errors.length,0,errors.join('\n'));
 results.push({name,width,...metrics});if([390,820,1440].includes(width))await p.screenshot({path:`verification/final-mobile/after/screenshots/owner-preview-${name}-${width}.png`,animations:'disabled',fullPage:false});await p.close();
}}
fs.writeFileSync('verification/final-mobile/after/local-preview-acceptance.json',JSON.stringify({cases:results.length,pass:true,scope:'Synthetic isolated server. No authenticated production services.',results},null,2));console.log('PASS: '+results.length+' isolated route/viewport cases; Student More and navigation pointer checks passed.');
}finally{await browser.close();}
