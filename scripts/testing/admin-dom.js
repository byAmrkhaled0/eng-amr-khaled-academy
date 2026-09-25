'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'../..');
const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
async function createAdminDOM(){
 const errors=[],observers=[],console=new VirtualConsole();
 console.on('jsdomError',error=>errors.push(error));
 const dom=new JSDOM('<!doctype html><html lang="ar" dir="rtl" data-theme="light"><body><div id="adminRoot"></div><div id="toast"></div></body></html>',{url:'http://localhost/teacher-login.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
 const window=dom.window,context=dom.getInternalVMContext();
 const NativeObserver=window.MutationObserver;
 window.MutationObserver=class extends NativeObserver{constructor(callback){super(callback);observers.push(this);}};
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 window.HTMLElement.prototype.scrollIntoView=function(){};window.scrollTo=()=>{};
 window.alert=()=>{};window.confirm=()=>true;
 window.fetch=async()=>{throw new Error('External requests disabled in DOM tests');};
 window.MFCloud={ready:false};
 const html=fs.readFileSync(path.join(root,'teacher-login.html'),'utf8');
 const sources=[...html.matchAll(/<script defer src="(assets\/[^?]+)\?/g)].map(match=>match[1]);
 for(const source of sources){
  if(/firebase-(?:config|sync)|offline-attendance/.test(source))continue;
  vm.runInContext(fs.readFileSync(path.join(root,source),'utf8'),context,{filename:source});
 }
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/browser/attendance-fixture.js'),'utf8'),context);
 for(let waited=0; !window.document.getElementById('adminContent') && waited<5000; waited+=25){
  await tick(25);
 }
 if(!window.document.getElementById('adminContent')) throw new Error('Admin DOM did not initialize within 5000ms');
 const run=source=>vm.runInContext(source,context);
 return {window,document:window.document,errors,run,tick,close(){observers.forEach(observer=>observer.disconnect());window.close();}};
}
module.exports={createAdminDOM,tick};
