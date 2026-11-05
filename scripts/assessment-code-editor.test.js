'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const source=fs.readFileSync(path.join(__dirname,'../assets/assessment-code-editor.js'),'utf8');
function fixture(value=''){
 const dom=new JSDOM('<!doctype html><html><head></head><body><form><label>الكود<textarea name="q0" data-assessment-code-editor data-code-language="Python" maxlength="20000" required aria-describedby="hint"></textarea></label><small id="hint">تعليمات</small><button>تسليم</button></form><h3 data-assessment-code-prompt></h3></body></html>',{url:'http://localhost/student.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,area=w.document.querySelector('textarea');area.value=value;w.eval(source);
 const enable=()=>{w.document.querySelector('link').dispatchEvent(new w.Event('load'));w.TMAssessmentEditor.enhance(w.document);};
 const key=(key,options={})=>{const event=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options});area.dispatchEvent(event);return event;};
 return {dom,w,area,enable,key,close:()=>dom.window.close()};
}
test('editor preserves the exact textarea, name, values and submission and initializes only once',()=>{
 const f=fixture('print("<img src=x onerror=alert(1)>")\n# تعليق');try{
  f.enable();f.w.TMAssessmentEditor.enhance(f.w.document);assert.equal(f.w.document.querySelectorAll('textarea').length,1);assert.equal(f.w.document.querySelectorAll('.tm-assessment-code-editor').length,1);
  assert.equal(f.w.document.querySelector('textarea'),f.area);assert.equal(f.area.maxLength,20000);assert(f.area.required);assert.equal(f.area.getAttribute('aria-describedby'),'hint');
  assert.equal(f.area.style.getPropertyValue('background'),'transparent');assert.equal(f.area.style.getPropertyPriority('background'),'important');
  assert.equal(new f.w.FormData(f.area.form).get('q0'),f.area.value);assert(!f.w.document.querySelector('img'));assert(f.w.document.querySelector('.tm-assessment-code-string'));assert.equal(f.w.document.querySelector('.tm-assessment-code-gutter').textContent,'1\n2');
 }finally{f.close();}
});
test('failed or pending optional CSS leaves the original native textarea usable',()=>{
 const f=fixture('print(1)');try{f.w.TMAssessmentEditor.enhance(f.w.document);assert(!f.area.closest('.tm-assessment-code-editor'));f.w.document.querySelector('link').dispatchEvent(new f.w.Event('error'));assert.equal(f.area.value,'print(1)');assert(!f.area.closest('.tm-assessment-code-editor'));}finally{f.close();}
});
test('Tab, Shift Tab, auto-indent and input events preserve draft wiring',()=>{
 const f=fixture('if True:');try{f.enable();let changed=0;f.area.form.addEventListener('input',()=>changed++);f.area.setSelectionRange(8,8);f.key('Enter');assert.equal(f.area.value,'if True:\n    ');f.key('Tab');assert.equal(f.area.value,'if True:\n        ');f.key('Tab',{shiftKey:true});assert.equal(f.area.value,'if True:\n    ');assert.equal(changed,3);
  f.area.value='one\ntwo';f.area.setSelectionRange(0,7);f.key('Tab');assert.equal(f.area.value,'    one\n    two');f.key('Tab',{shiftKey:true});assert.equal(f.area.value,'one\ntwo');
 }finally{f.close();}
});
test('Escape then Tab releases keyboard focus and does not trigger exam exit; composing input stays native',()=>{
 const f=fixture('');try{f.enable();let escaped=0;f.w.document.addEventListener('keydown',e=>{if(e.key==='Escape')escaped++;});f.key('Escape');assert.equal(escaped,0);assert(!f.key('Tab').defaultPrevented);assert(!f.key('Tab',{isComposing:true}).defaultPrevented);f.area.readOnly=true;assert(!f.key('Tab').defaultPrevented);}finally{f.close();}
});
test('indentation never exceeds the original answer limit or mutates unselected answers',()=>{
 const f=fixture('1234');try{f.enable();f.area.maxLength=4;f.area.setSelectionRange(4,4);f.key('Tab');assert.equal(f.area.value,'1234');assert.equal(new f.w.FormData(f.area.form).get('q0'),'1234');}finally{f.close();}
});
test('code question highlighting keeps malicious question text inert',()=>{
 const f=fixture();try{const prompt=f.w.document.querySelector('[data-assessment-code-prompt]');const value='<script>alert(1)</script>\nprint("hello")';prompt.textContent=value;f.enable();assert.equal(prompt.textContent,value);assert(!prompt.querySelector('script'));assert(prompt.querySelector('.tm-assessment-code-keyword'));}finally{f.close();}
});
