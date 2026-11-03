'use strict';
const fs=require('node:fs'),path=require('node:path');
const test=require('node:test'),assert=require('node:assert/strict'),model=require('../assets/learning-progress');
test('viewed and valid last-open timestamps mean started without inventing progress',()=>{
 for(const row of [{viewed:true},{lastOpenedAt:1720000000000},{lastOpenedAt:'2026-10-01T12:00:00Z'},{lastOpenedAt:{seconds:1720000000}},{lastOpenedAt:{_seconds:1720000000}},{lastOpenedAt:{toMillis:()=>1720000000000}}]){assert.equal(model.state({...row,progress:0}),'started');assert.equal(model.percent({...row,progress:0}),0);}
 for(const row of [{},{viewed:false},{viewed:'false'},{lastOpenedAt:'bad'},{lastOpenedAt:0},{lastOpenedAt:{seconds:'bad'}}])assert.equal(model.state(row),'new');
 assert.equal(model.state({viewed:true,progress:100}),'completed');assert.equal(model.state({progress:1}),'started');
});
test('resume prioritizes visited pending lessons and completion summary remains truthful',()=>{
 const rows=[{id:'new',progress:0},{id:'viewed',viewed:true,progress:0},{id:'done',viewed:true,progress:100}];
 assert.equal(model.next(rows).id,'viewed');assert.deepEqual(model.summary(rows),{completed:1,total:3,percent:33});assert.equal(model.next([{progress:100}]),null);
});
test('actual curriculum renderer and filters agree for viewed zero, unopened and completed lessons',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<div id="studentResult"><section class="show" data-student-panel="lectures"></section></div>',{url:'http://localhost/student.html',runScripts:'outside-only'}),w=dom.window;
 try{
 w.TMLearningProgress=model;w.MFCloud={getStudentCurriculum:async()=>({units:[],lectures:[{id:'viewed',title:'Viewed',viewed:true,progress:0},{id:'new',title:'New',progress:0},{id:'done',title:'Done',progress:100}]})};
 w.eval(fs.readFileSync(path.join(__dirname,'../assets/curriculum-student.js'),'utf8'));
 w.TMStudentCurriculum.setStudent({studentCode:'123456',materials:[]});await w.TMStudentCurriculum.show('123456');
 const card=id=>w.document.querySelector(`[data-learning-row="lectures:${id}"]`),filter=w.document.querySelector('[data-learning-state]');
 assert.match(card('viewed').textContent,/قيد الدراسة/);assert.equal(card('viewed').querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'0');
 for(const [state,id]of [['started','viewed'],['new','new'],['completed','done']]){filter.value=state;filter.dispatchEvent(new w.Event('change'));assert.deepEqual([...w.document.querySelectorAll('[data-learning-row]')].filter(x=>!x.hidden).map(x=>x.dataset.learningRow),['lectures:'+id]);}
 assert.match(w.document.querySelector('[data-learning-continue]').textContent,/Viewed/);
 }finally{w.close();}
});

async function lectureUI(student={},data={}){
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<div id="studentResult"><button data-student-tab="homework">واجب</button><button data-student-tab="exams">امتحان</button><section class="show" data-student-panel="lectures"></section><section data-student-panel="homework"></section><section data-student-panel="exams"></section></div>',{url:'http://localhost/student.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.HTMLElement.prototype.scrollIntoView=function(){};w.open=()=>({location:{replace(){}},close(){}});w.requireHttpsFileUrl=v=>v;w.TMLearningProgress=model;
 w.MFCloud={getStudentCurriculum:async()=>({units:[],lectures:[],...data}),recordLectureProgress:async(...args)=>{calls.push(['progress',...args]);return {percent:args[2]}},getCurriculumFileUrl:async(...args)=>{calls.push(['file',...args]);return {url:'https://example.test/authorized.pdf'}},getLectureContent:async()=>({lecture:{id:'native',title:'محتوى'},materials:[],assignments:[],questions:[],exams:[]})};
 w.eval(fs.readFileSync(path.join(__dirname,'../assets/curriculum-student.js'),'utf8'));w.TMStudentCurriculum.setStudent({studentCode:'123456',materials:[],...student});await w.TMStudentCurriculum.show('123456');return {w,calls,close:()=>w.close()};
}
test('classic cards keep PDF, Drive, linked authorized activities, unit filter and saved completion',async()=>{
 const u=await lectureUI({materials:[{id:'old',title:'درس الدوائر',unit:'الأولى',lectureCategory:'theory',fileUrl:'https://example.test/lesson.pdf',fileType:'application/pdf',linkUrl:'https://drive.google.com/file/d/demo/view',linkedAssignmentId:'hw',linkedExamId:'ex'},{id:'second',title:'درس آخر',unit:'الثانية',lectureCategory:'practical',linkedAssignmentId:'unauthorized'}],assignments:[{id:'hw',title:'واجب الدوائر'}],exams:[{id:'ex',title:'اختبار الدوائر'}]});
 try{const d=u.w.document,card=d.querySelector('[data-learning-row="materials:old"]');assert.equal(card.querySelectorAll('a').length,2);assert.match(card.textContent,/فتح ملف الشرح PDF/);assert.match(card.textContent,/فتح رابط Google Drive/);assert.equal(card.querySelectorAll('[data-learning-tab]').length,2);assert.equal(d.querySelector('[data-learning-row="materials:second"]').querySelectorAll('[data-learning-tab]').length,0);
 d.querySelector('[data-student-tab=homework]').onclick=()=>{d.querySelector('[data-student-panel=homework]').innerHTML='<details class="student-assignment-card"><summary>واجب</summary><form data-assignment-id="hw"></form></details>';};card.querySelector('[data-learning-tab=homework]').click();assert(d.querySelector('.student-assignment-card').open);
 const f=d.querySelector('[data-learning-unit-filter]');f.value='الأولى';f.dispatchEvent(new u.w.Event('change'));assert.equal([...d.querySelectorAll('[data-learning-row]')].filter(n=>!n.hidden).length,1);
 await card.querySelector('[data-learning-complete]').onclick();assert(u.calls.some(x=>x[0]==='progress'&&x[2]==='old'&&x[3]===100&&x[4]==='materials'));assert.equal(d.querySelector('[data-learning-row="materials:old"] [role=progressbar]').getAttribute('aria-valuenow'),'100');
 }finally{u.close();}
});
test('native lecture dialog exposes only populated sections and closes cleanly',async()=>{
 const u=await lectureUI({}, {lectures:[{id:'native',title:'محاضرة'}]});try{const d=u.w.document;await d.querySelector('[data-open-lecture]').onclick();await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelectorAll('[data-lecture-tab]').length,0);assert.equal(d.querySelector('.curriculum-modal-card').dataset.lectureEmpty,'true');assert.match(d.querySelector('.learning-extra-empty').textContent,/لا توجد مرفقات/);d.querySelector('.curriculum-modal-close').click();assert(!d.querySelector('#curriculumLectureModal'));assert(!d.documentElement.classList.contains('lecture-dialog-open'));
 u.w.MFCloud.getLectureContent=async()=>({lecture:{title:'محاضرة'},questions:[{id:'q',title:'أسئلة',content:'سؤال للمراجعة'}]});await d.querySelector('[data-open-lecture]').onclick();await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelectorAll('[data-lecture-tab]').length,1);assert.equal(d.querySelector('[data-lecture-tab]').dataset.lectureTab,'questions');assert.equal(d.querySelector('[data-lecture-tab]').getAttribute('aria-selected'),'true');
 }finally{u.close();}
});
test('attached question bank file uses its authorized collection without a lecture progress write',async()=>{
 const u=await lectureUI({materials:[{id:'old',title:'درس',lectureCategory:'theory'}],questions:[{id:'bank',title:'بنك الدرس',sourceCollection:'question_banks',lectureSource:'materials',lectureId:'old',filePath:'private/bank.pdf',content:'أسئلة مكتوبة'},{id:'other',title:'غير مرتبط',sourceCollection:'question_banks',lectureSource:'materials',lectureId:'other'}]});try{const d=u.w.document;assert.equal(d.querySelectorAll('[data-learning-bank-file]').length,1);await d.querySelector('[data-learning-bank-file]').onclick();assert.deepEqual(u.calls,[['file','123456','question_banks','bank']]);}finally{u.close();}
});

test('legacy resources load once on demand, preserve authorized exam/bank links, and cache completion',async()=>{
 const u=await lectureUI({materials:[{id:'old',title:'ملخص',lectureCategory:'theory'}]});try{let reads=0;u.w.MFCloud.getStudentResources=async()=>{reads++;return {materials:[{id:'old',title:'درس كامل',lectureCategory:'theory',linkedExamId:'ex'}],assignments:[],exams:[{id:'ex',title:'امتحان الدرس'}],questions:[]};};await u.w.document.querySelector('[data-curriculum-refresh]').onclick();await new Promise(r=>setTimeout(r,0));await u.w.TMStudentCurriculum.show('123456');assert.equal(reads,1);assert.match(u.w.document.querySelector('[data-learning-tab=exams]').textContent,/امتحان الدرس/);await u.w.document.querySelector('[data-learning-complete]').onclick();assert.equal(u.w.document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'100');await u.w.TMStudentCurriculum.show('123456');assert.equal(reads,1);}finally{u.close();}
});
test('legacy resources failure retains loaded lectures with an explicit retry instead of a blank screen',async()=>{
 const u=await lectureUI({materials:[{id:'old',title:'درس',lectureCategory:'theory'}]});try{u.w.MFCloud.getStudentResources=async()=>{throw Error('offline')};await u.w.document.querySelector('[data-curriculum-refresh]').onclick();await new Promise(r=>setTimeout(r,0));assert(u.w.document.querySelector('[data-learning-row]'));assert.match(u.w.document.querySelector('[data-curriculum-error]').textContent,/تعذر استكمال/);assert(u.w.document.querySelector('[data-curriculum-refresh]'));}finally{u.close();}
});

test('unit header reports matching lectures honestly when a search hides other cards',async()=>{const u=await lectureUI({materials:[{id:'a',title:'مقاومة',unit:'وحدة',lectureCategory:'theory'},{id:'b',title:'مكثف',unit:'وحدة',lectureCategory:'theory'}]});try{const input=u.w.document.querySelector('[data-learning-search]');input.value='مقاومة';input.dispatchEvent(new u.w.Event('input'));assert.equal(u.w.document.querySelector('[data-learning-unit-count]').textContent,'1 من 2 محاضرة');}finally{u.close();}});
