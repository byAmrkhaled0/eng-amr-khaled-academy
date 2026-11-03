const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('student QA respects the real duplicate-submit guard until its deadline',()=>{
 const source=fs.readFileSync('assets/app.js','utf8'),start=source.indexOf('function setupDuplicateSubmitGuard(){'),end=source.indexOf('function loadLazyScript(',start);
 let now=1000,listener;class HTMLFormElement{constructor(){this.dataset={};}}
 const context={window:{},document:{addEventListener:(name,fn,capture)=>{assert.equal(name,'submit');assert.equal(capture,true);listener=fn;}},HTMLFormElement,Date:{now:()=>now},setTimeout:()=>{},toast:()=>{}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'setupDuplicateSubmitGuard();',context);
 const form=new HTMLFormElement();const submit=()=>{const event={target:form,blocked:false,preventDefault(){this.blocked=true;},stopImmediatePropagation(){this.stopped=true;}};listener(event);return event;};
 assert.equal(submit().blocked,false);assert.equal(form.dataset.tmSubmitLockedUntil,'1900');
 now=1001;const blocked=submit();assert.equal(blocked.blocked,true);assert.equal(blocked.stopped,true);
 now=1900;assert.equal(submit().blocked,false);
 const harness=fs.readFileSync('scripts/phase5-browser.mjs','utf8');assert(harness.includes('Number(form.dataset.tmSubmitLockedUntil||0)<=Date.now()'));assert(harness.includes('window.__qaStudentReads),2'));assert(!harness.includes('PHASE5 STUDENT DEBUG'));
});
