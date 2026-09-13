'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdminDOM,tick}=require('./testing/admin-dom');
test('all 19 administration sections render through the production script chain',async()=>{
 const ui=await createAdminDOM();
 try{
  const calls=[];
  Object.assign(ui.window.MFCloud,{
   getPaymentDashboard:async()=>({rows:[],totals:{},courses:{}}),
   getAdminOperationsDashboard:async()=>({sessions:[],students:[],pending:[],metrics:{}}),
   getMotivationLeaderboardAdmin:async()=>[],getMotivationSettingsAdmin:async()=>({}),
   listCurriculumAdmin:async data=>{calls.push(data);return {rows:[],hasMore:false,nextCursor:null};},
   listAutomaticBackups:async()=>[],getExamDashboard:async()=>({exams:[]}),
   getHomeworkAdminWorkspace:async()=>({assignments:[],submissions:[]})
  });
  const sections=ui.run('adminSections.map(row=>row[0])');
  for(const section of sections){
   const button=ui.document.querySelector(`[data-admin-nav="${section}"]`);assert(button,`missing navigation: ${section}`);
   button.click();await tick(35);assert.equal(ui.run('currentSection'),section);
   assert.ok(ui.document.querySelector('#adminContent').textContent.trim(),`${section} produced an empty page`);
  }
  assert.equal(sections.length,19);
  const primary=[...ui.document.querySelectorAll('.admin-nav-primary [data-admin-nav]')].map(el=>el.dataset.adminNav);
  assert.equal(primary.indexOf('questionBanks'),primary.indexOf('theoryLectures')+1);
  assert.deepEqual(ui.errors.map(error=>error.message),[]);
 }finally{ui.close();}
});
test('lesson bank editor inherits its lesson, retains focus, and retries a failed save without uploading twice',async()=>{
 const ui=await createAdminDOM();
 try{
  ui.run(`adminData.materials=[{id:'theory-1',title:'درس الشروط',grade:GRADES[0],lectureCategory:'theory',group:'مجموعة تجريبية',scheduleId:'demo-group',term:'الترم الأول'}];`);
  const saved=[],uploads=[];let fail=true;
  Object.assign(ui.window.MFCloud,{
   listCurriculumAdmin:async()=>({rows:[],nextCursor:null,hasMore:false}),
   uploadAttachment:async(file,folder,options)=>{uploads.push({file,folder,options});options.onProgress({percent:50});return {path:'curriculum/grade/question_banks/demo.pdf'};},
   upsertCurriculumEntity:async payload=>{saved.push(payload);if(fail)throw new Error('اختبار انقطاع الاتصال');return {ok:true,id:payload.id};}
  });
  ui.window.renderTheoryLectures();await tick();
  const lesson=ui.document.querySelector('#questionBankLessonFilter');lesson.value='theory-1';lesson.dispatchEvent(new ui.window.Event('change'));await tick();
  const add=ui.document.querySelector('#addQuestionBankButton');add.focus();add.click();
  const form=ui.document.querySelector('#questionBankEditorForm');assert.equal(form.elements.lectureId.value,'theory-1');assert.equal(form.elements.grade.disabled,true);assert.equal(ui.document.activeElement,form.elements.title);
  form.elements.title.value='أسئلة الشروط';
  const pdf=new ui.window.File(['%PDF-1.7\nfixture'],'questions.pdf',{type:'application/pdf'});
  Object.defineProperty(pdf,'slice',{value:()=>({text:async()=>'%PDF-'})}); // jsdom lacks Blob.text; file bytes are separately tested on Storage.
  Object.defineProperty(form.elements.file,'files',{value:[pdf]});
  const submit=()=>form.dispatchEvent(new ui.window.Event('submit',{cancelable:true}));
  submit();submit();await tick(20);
  assert.equal(uploads.length,1);assert.equal(saved.length,1);assert.match(form.querySelector('[data-bank-state]').textContent,/انقطاع/);
  assert.equal(ui.document.querySelector('#questionBankEditorModal')!==null,true);
  fail=false;submit();await tick(20);
  assert.equal(uploads.length,1);assert.equal(saved.length,2);assert.equal(saved[0].id,saved[1].id);
  assert.equal(saved[1].data.lectureSource,'materials');assert.equal(uploads[0].options.private,true);
  assert.equal(ui.document.querySelector('#questionBankEditorModal'),null);assert.equal(ui.document.activeElement,add);
  assert.equal(ui.document.documentElement.classList.contains('question-bank-dialog-open'),false);
 }finally{ui.close();}
});
test('each theory card exposes only its matching lesson banks and bank links call their real collection',async()=>{
 const ui=await createAdminDOM();
 try{
  ui.run(`currentStudentResources={student:{studentCode:'DEMO001'},materials:[],questions:[{id:'bank-1',lectureId:'lesson-1',lectureSource:'materials',sourceCollection:'question_banks',title:'أسئلة الدرس الأول',filePath:'curriculum/x/question_banks/a.pdf'},{id:'bank-2',lectureId:'lesson-2',lectureSource:'materials',sourceCollection:'question_banks',title:'أسئلة الدرس الثاني',filePath:'curriculum/x/question_banks/b.pdf'}]};`);
  ui.document.querySelector('#adminContent').innerHTML=ui.run("resourceCard({id:'lesson-1',title:'الدرس الأول',lectureCategory:'theory'},'material')");
  const card=ui.document.querySelector('.resource-card');assert.match(card.textContent,/بنك الأسئلة/);assert.match(card.textContent,/أسئلة الدرس الأول/);assert.doesNotMatch(card.textContent,/أسئلة الدرس الثاني/);
  const calls=[];ui.window.open=()=>({location:{replace:url=>calls.push(url)},close(){}});
  ui.window.MFCloud.getCurriculumFileUrl=async(...args)=>{calls.push(args);return {url:'https://example.test/private.pdf'};};
  ui.run('bindQuestionBankActions()');card.querySelector('[data-question-bank-file]').click();await tick();
  assert.deepEqual(calls[0],['DEMO001','question_banks','bank-1']);
 }finally{ui.close();}
});
test('lecture file routing, pending completion, retry, and Escape use the actual student module',async()=>{
 const ui=await createAdminDOM();
 try{
  const fs=require('node:fs');ui.run(fs.readFileSync(require('node:path').join(__dirname,'../assets/curriculum-student.js'),'utf8'));
  ui.document.body.insertAdjacentHTML('beforeend','<div id="studentResult"></div>');
  const files=[];let completeResolve,completeReject;
  Object.assign(ui.window.MFCloud,{
   getStudentCurriculum:async()=>({lectures:[{id:'lesson',title:'درس',term:'الترم الأول',lectureNumber:1}]}),
   getLectureContent:async()=>({lecture:{id:'lesson',title:'درس'},questions:[{id:'bank',sourceCollection:'question_banks',title:'أسئلة',filePath:'curriculum/test/question_banks/a.pdf'}]}),
   recordLectureProgress:async(code,id,value)=>value<100?{}:new Promise((resolve,reject)=>{completeResolve=resolve;completeReject=reject;}),
   getCurriculumFileUrl:async(...args)=>{files.push(args);return {url:'https://example.test/file.pdf'};}
  });
  ui.window.open=()=>({location:{replace(){}},close(){}});
  ui.document.dispatchEvent(new ui.window.CustomEvent('technominds:student-loaded',{detail:{code:'DEMO001'}}));await tick();
  const open=ui.document.querySelector('[data-open-lecture]');open.focus();open.click();await tick();
  const modal=ui.document.querySelector('#curriculumLectureModal');modal.querySelector('[data-lecture-tab="questions"]').click();
  modal.querySelector('[data-content-file]').click();await tick();assert.deepEqual(files[0],['DEMO001','question_banks','bank']);
  const complete=modal.querySelector('[data-complete-lecture]');complete.click();await tick();assert(complete.disabled);assert.match(complete.textContent,/جارٍ الحفظ/);
  completeReject(new Error('offline'));await tick();assert(!complete.disabled);assert.match(complete.textContent,/إعادة/);
  complete.click();await tick();completeResolve({ok:true});await tick();assert.match(complete.textContent,/سجلت إكمال/);
  modal.dispatchEvent(new ui.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(ui.document.querySelector('#curriculumLectureModal'),null);assert.equal(ui.document.activeElement,open);assert(!ui.document.documentElement.classList.contains('lecture-dialog-open'));
 }finally{ui.close();}
});
