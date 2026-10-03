'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom'),{createAdminDOM,tick}=require('./testing/admin-dom');
const entry=fs.readFileSync(path.join(__dirname,'../assets/admin-entry.js'));
async function entryDOM(failIndex){
 const pending=[],requests=[];let observer;
 class Loader extends ResourceLoader{fetch(url){if(url.endsWith('/entry.js'))return Promise.resolve(entry);const index=Number(url.match(/bundle-(\d+)/)?.[1]);requests.push(index);return new Promise((resolve,reject)=>pending.push(()=>index===failIndex?reject(new Error('middle load failure')):resolve(Buffer.from(`window.executed.push(${index});document.addEventListener('DOMContentLoaded',()=>window.initialized.push(${index}));${index===14?"window.__tmAdminBootstrapStart=async()=>{window.bootstrapCalls++;document.getElementById('root').innerHTML='<main class=admin-page>ready</main>';};":''}`))));}}
 const html=`<!doctype html><html><body><div id="root"></div><div id="toast"></div><form id="loginForm"><input name="email"><input name="password"><button type="submit">login</button></form><template id="adminBundles">${Array.from({length:15},(_,i)=>`<script src="/bundle-${i}.js"></script>`).join('')}</template><script defer src="/entry.js"></script></body></html>`;
 const dom=new JSDOM(html,{url:'http://localhost/teacher-login.html',runScripts:'dangerously',resources:new Loader(),pretendToBeVisual:true,virtualConsole:new VirtualConsole(),beforeParse(window){window.executed=[];window.initialized=[];window.bootstrapCalls=0;window.MFCloud={ready:true,auth:{currentUser:{uid:'admin'},onIdTokenChanged:fn=>{observer=fn;fn({uid:'admin'});}},getCurrentStaffProfile:async()=>({uid:'admin',allowed:true})};}});
 for(let i=0;i<100&&pending.length<15;i++)await tick(10);
 assert.equal(pending.length,15,'all requests must start before their completion');
 return {dom,requests,pending,observer:()=>observer({uid:'admin'})};
}
test('successful ordered concurrent loading initializes each enhancement once and bootstraps once',async()=>{
 const fixture=await entryDOM(-1);try{
  const duplicate=fixture.observer();fixture.pending.forEach(release=>release());await duplicate;await tick(80);
  assert.deepEqual([...fixture.dom.window.executed],Array.from({length:15},(_,i)=>i));assert.deepEqual([...fixture.dom.window.initialized],Array.from({length:15},(_,i)=>i));assert.equal(fixture.dom.window.bootstrapCalls,1);assert.equal(fixture.dom.window.__tmAdminBundleState,'ready');assert.ok(fixture.dom.window.document.querySelector('.admin-page'));
  await fixture.observer();assert.equal(fixture.dom.window.bootstrapCalls,1);assert.equal(fixture.requests.length,15);
 }finally{fixture.dom.window.close();}
});
test('a failed middle script latches failure, blocks workspace and requires reload without duplicate initialization',async()=>{
 const fixture=await entryDOM(7);try{
  fixture.pending.forEach(release=>release());await tick(100);
  assert.equal(fixture.dom.window.__tmAdminBundleState,'failed');assert.equal(fixture.dom.window.bootstrapCalls,0);assert.equal(fixture.dom.window.document.querySelector('.admin-page'),null);assert.equal(fixture.dom.window.initialized.length,0);
  await fixture.observer();assert.equal(fixture.requests.length,15);assert.equal(fixture.dom.window.bootstrapCalls,0);assert.match(fixture.dom.window.document.getElementById('toast').textContent,/حدّث الصفحة/);
 }finally{fixture.dom.window.close();}
});
test('the real admin renderer and bootstrap refuse a partially loaded or failed bundle',async()=>{
 const dom=await createAdminDOM();try{
  dom.document.getElementById('adminRoot').innerHTML='login';dom.document.getElementById('adminRoot').className='';
  for(const state of ['loading','failed']){dom.window.__tmAdminBundleState=state;dom.run('renderAdmin()');assert.equal(dom.document.querySelector('.admin-page'),null);await assert.rejects(dom.window.__tmAdminBootstrapStart({uid:'fixture-admin',allowed:true}),/غير مكتملة/);}
 }finally{dom.close();}
});
