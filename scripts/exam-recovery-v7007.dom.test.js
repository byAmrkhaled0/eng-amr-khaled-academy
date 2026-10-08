'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAdminDOM}=require('./testing/admin-dom');
test('actual Admin exam recovery button uses allowlisted action and sends only chosen exam/codes',async()=>{
 const d=await createAdminDOM();try{
  d.run("adminData.exams=[{id:'recovery-ui',title:'Synthetic recovery',grade:GRADES[0],duration:20,active:true,published:true,text:'Question'}];sessionStorage.setItem('tm-admin-open-exam','recovery-ui');goAdminSection('exams')");await d.tick(100);
  const button=d.document.querySelector('[data-tm-action="recoverExpiredExamSessions"]');assert(button,'recovery action visible');let sent=null;
  d.window.prompt=()=> 'SEC00001, SEC00002';d.window.confirm=()=>true;d.window.MFCloud.saveContent=async(...args)=>{sent=args;return {recoveryAuthorized:2};};button.click();await d.tick(25);
  assert.equal(sent[0],'exams');assert.equal(sent[1].id,'recovery-ui');assert.deepEqual(Array.from(sent[2]),['SEC00001','SEC00002']);assert.equal(d.run('adminData.exams[0].duration'),20);
 }finally{d.close();}
});
