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
test('zero-price payment action immediately opens and focuses the matching price field',async()=>{
 const ui=await createAdminDOM();
 try{
  const student=ui.run('adminData.students[0]'),month=ui.run('MONTHS[8]'),year='2026/2027';
  ui.run(`adminData.settings.coursePrices={[GRADES[0]]:0};window.adminWorkspaceContext=()=>({month:MONTHS[8],academicYear:'2026/2027'});`);
  Object.assign(ui.window.MFCloud,{getPaymentDashboard:async()=>({rows:[{key:'payment-test',student,summary:null,month,academicYear:year,expected:0,paid:0,remaining:0,status:'unpaid'}],totals:{expected:0,collected:0,remaining:0,today:0,paid:0,partial:0,unpaid:1},courses:{},nextCursor:null,generatedAt:new Date().toISOString()})});
  ui.window.renderPayments();await tick(20);
  const button=ui.document.querySelector('.quick-paid-button');assert(button);assert.equal(button.disabled,false);assert.match(button.textContent,/حدد السعر/);
  ui.run(button.getAttribute('onclick'));
  const editor=ui.document.querySelector('.course-price-editor'),input=editor.querySelector('[data-course-price]');
  assert.equal(editor.open,true);assert.equal(ui.document.activeElement,input);assert.match(ui.document.querySelector('#toast').textContent,/حدد سعر الصف/);
 }finally{ui.close();}
});
test('paid button shows feedback immediately and blocks a duplicate request while the network is pending',async()=>{
 const ui=await createAdminDOM();
 try{
  const student=ui.run('adminData.students[0]'),month=ui.run('MONTHS[8]'),year='2026/2027';let calls=0,resolvePayment;
  ui.run(`adminData.settings.coursePrices={[GRADES[0]]:300};window.adminWorkspaceContext=()=>({month:MONTHS[8],academicYear:'2026/2027'});`);
  Object.assign(ui.window.MFCloud,{
   getPaymentDashboard:async()=>({rows:[{key:'payment-test',student,summary:null,month,academicYear:year,expected:300,paid:0,remaining:300,status:'unpaid'}],totals:{expected:300,collected:0,remaining:300,today:0,paid:0,partial:0,unpaid:1},courses:{},nextCursor:null,generatedAt:new Date().toISOString()}),
   createPaymentTransaction:async()=>{calls++;return new Promise(resolve=>{resolvePayment=resolve;});}
  });
  ui.window.renderPayments();await tick(20);const button=ui.document.querySelector('.quick-paid-button'),handler=button.getAttribute('onclick'),started=Date.now();
  const pending=ui.run(handler);ui.run(handler);await tick();
  assert.equal(calls,1);assert.equal(ui.document.querySelector('.quick-paid-button').disabled,true);assert.match(ui.document.querySelector('.quick-paid-button').textContent,/جارٍ الحفظ/);assert.ok(Date.now()-started<1000);
  resolvePayment({transactionStatus:'active',expectedAmount:300,paidAmount:300,remainingAmount:0,status:'paid'});await pending;
  assert.equal(ui.document.querySelector('.quick-paid-button').disabled,true);assert.match(ui.document.querySelector('.quick-paid-button').textContent,/تم الدفع/);
 }finally{ui.close();}
});
test('saving a course price updates the payment card without a second immediate dashboard read',async()=>{
 const ui=await createAdminDOM();
 try{
  const student=ui.run('adminData.students[0]'),month=ui.run('MONTHS[8]'),year='2026/2027';let dashboardCalls=0,saveCalls=0,resolveSave;
  ui.run(`adminData.settings.coursePrices={[GRADES[0]]:0};window.adminWorkspaceContext=()=>({month:MONTHS[8],academicYear:'2026/2027'});`);
  Object.assign(ui.window.MFCloud,{
   getPaymentDashboard:async()=>{dashboardCalls++;return {rows:[{key:'payment-price-test',student,summary:null,month,academicYear:year,expected:0,paid:0,remaining:0,status:'unpaid'}],totals:{expected:0,collected:0,remaining:0,today:0,paid:0,partial:0,unpaid:1},courses:{[student.grade]:{expected:0,paid:0,students:1}},nextCursor:null,generatedAt:new Date().toISOString()};},
   saveSettings:async()=>{saveCalls++;return new Promise(resolve=>{resolveSave=resolve;});}
  });
  ui.window.renderPayments();await tick(20);const input=ui.document.querySelector(`[data-course-price="${student.grade}"]`),button=ui.document.querySelector('#saveCoursePricesButton');input.value='300';
  const pending=ui.window.saveCoursePrices();ui.window.saveCoursePrices();await tick();assert.equal(saveCalls,1);assert.equal(button.disabled,true);
  resolveSave({ok:true});await pending;assert.equal(dashboardCalls,1);assert.equal(button.disabled,false);assert.equal(ui.document.querySelector('.quick-paid-button').disabled,false);assert.match(ui.document.querySelector('.quick-paid-button').textContent,/تم الدفع/);
 }finally{ui.close();}
});
test('parent report button requests fresh matching data once and restores its state',async()=>{
 const ui=await createAdminDOM();
 try{
  ui.run(`adminData.students[0].parentPhone='01000000000';`);const button=ui.document.createElement('button');let reportCalls=0,deliveries=0,resolveReport,payload;
  ui.window.MFCloud.getStudentMonthlyReportAdmin=async input=>{reportCalls++;payload=input;return new Promise(resolve=>{resolveReport=resolve;});};
  ui.window.deliverParentMonthlyReport=async()=>{deliveries++;return true;};
  const first=ui.window.sendParentMonthlyReport('DEMO1',button);ui.window.sendParentMonthlyReport('DEMO1',button);await tick();
  assert.equal(reportCalls,1);assert.equal(button.disabled,true);assert.equal(payload.force,undefined);
  assert.equal(payload.includeRanking,true);
  resolveReport({student:{studentCode:'DEMO1'},monthKey:'2026-09'});await first;
  assert.equal(deliveries,1);assert.equal(button.disabled,false);assert.equal(button.classList.contains('is-loading'),false);
 }finally{ui.close();}
});
test('student file shows a loading window before payment history resolves',async()=>{
 const ui=await createAdminDOM();
 try{
  const writes=[];let opened=false,resolveHistory;
  ui.window.open=()=>{opened=true;return {opener:{},closed:false,document:{open(){},write(value){writes.push(value);},close(){}}};};
  ui.window.MFCloud.getStudentPaymentHistory=async()=>{assert.equal(opened,true);return new Promise(resolve=>{resolveHistory=resolve;});};
  const pending=ui.window.printStudentReport('DEMO1');await tick();
  assert.match(writes[0],/جارٍ تجهيز ملف الطالب/);resolveHistory({summaries:[],transactions:[]});await pending;
  assert.equal(writes.length,2);assert.match(writes[1],/student-app-dashboard/);
 }finally{ui.close();}
});
test('student file button opens the unified server profile instead of the legacy print window',async()=>{
 const ui=await createAdminDOM();
 try{
  let profileCalls=0,popupCalls=0;
  ui.window.open=()=>{popupCalls++;return null;};
  ui.window.MFCloud.getStudentAdminProfile=async input=>{profileCalls++;return {student:{studentCode:input.studentCode,name:'طالب تجريبي',grade:'الصف الأول الثانوي',group:'أ'},attendance:[],homeworks:[],results:[],monthlyPayments:[],motivationSummaries:[],motivationTransactions:[],privateNotes:[]};};
  ui.window.renderStudents();await tick();
  const fileButton=[...ui.document.querySelectorAll('button')].find(button=>button.textContent.trim()==='الملف');assert(fileButton);ui.run(fileButton.getAttribute('onclick'));await tick();
  assert.equal(profileCalls,1);assert.equal(popupCalls,0);assert(ui.document.querySelector('#unifiedStudentProfile'));assert.match(ui.document.querySelector('#unifiedProfileBody').textContent,/ملف الطالب الموحد/);
 }finally{ui.close();}
});
test('WhatsApp parent summary includes monthly title and exact ranking scopes',async()=>{
 const ui=await createAdminDOM();
 try{
  const message=ui.window.parentReportWhatsAppIntro({monthKey:'2026-09',monthlyTitle:'متفوق الشهر',student:{studentCode:'DEMO1',name:'طالب تجريبي',grade:'الأول الثانوي',group:'أ'},level:'جيد جدًا',overallScore:82,trend:{status:'improved',delta:6,previousScore:76},attendance:{present:3,total:4,absent:1,late:0,percentage:75,rows:[{date:'2026-09-12',status:'absent'}]},results:{rows:[{activityName:'امتحان سبتمبر',score:18,maxScore:20,percentage:90}],submittedExams:1,requiredExams:1,average:90},homework:{submitted:2,required:2,averageGrade:88},study:{lecturesAvailable:2,lecturesOpened:2,lecturesCompleted:1},motivation:{rank:2,totalStudents:18,groupRank:1,groupTotalStudents:6,totalPoints:6,transactionCount:1},payment:null});
  assert.match(message,/اللقب الشهري: .*متفوق الشهر/);assert.match(message,/ترتيب المسار: 2 \/ 18/);assert.match(message,/ترتيب المجموعة: 1 \/ 6/);assert.match(message,/امتحان سبتمبر: 18 من 20/);assert.doesNotMatch(message,/ترتيب المنصة/);
  assert.match(message,/تحسن 6 نقطة مئوية عن الشهر السابق — من 76% إلى 82%/);
 }finally{ui.close();}
});
test('compact parent HTML renders only backend monthly values and caps long activity lists',async()=>{
 const ui=await createAdminDOM();
 try{
  const report={monthKey:'2026-09',monthlyTitle:'متفوق الشهر',student:{studentCode:'DEMO1',name:'طالب تجريبي',grade:'أساسيات برمجة',group:'أ'},overallScore:91,trend:{status:'improved',delta:6,previousScore:85},attendance:{present:5,total:6,required:6,absent:1,late:0,excused:0,percentage:83},results:{average:90,submittedExams:4,requiredExams:4,rows:[1,2,3,4].map(index=>({activityName:`امتحان ${index}`,score:9,maxScore:10,percentage:90,status:'graded',date:'2026-09-10'}))},homework:{submitted:1,required:1,missing:0,graded:1,averageGrade:93,rows:[]},study:{lecturesAvailable:4,lecturesOpened:3,lecturesCompleted:2,lectureCompletionPercentage:50},motivation:{rank:18,totalStudents:28,groupRank:5,groupTotalStudents:13,totalPoints:7,transactionCount:2,lastReason:'التزام'},payment:{status:'paid'},strengths:['نتائج ممتازة'],concerns:[]};
  const html=ui.run(`parentMonthlyReportHTML(${JSON.stringify(report)})`);
  assert.match(html,/متفوق الشهر/);assert.match(html,/91%/);assert.match(html,/83%/);assert.match(html,/18 \/ 28/);assert.match(html,/5 \/ 13/);assert.match(html,/↑ تحسن 6 نقطة/);assert.match(html,/\+ 1 امتحانات أخرى/);assert.doesNotMatch(html,/ترتيب المنصة/);
 }finally{ui.close();}
});
test('calcStudent never invents an overall when the backend monthly report is absent',async()=>{
 const ui=await createAdminDOM();
 try{
  assert.equal(ui.run(`calcStudent({attendance:[{date:'2026-09-01',status:'present'}],grades:[{id:'g1',score:10,maxScore:10}],homeworks:[],recitations:[]}).final`),null);
  assert.equal(ui.run(`calcStudent({monthlyReport:{overallScore:null,level:'بيانات غير كافية'},attendance:[],grades:[],homeworks:[],recitations:[]}).final`),null);
  assert.equal(ui.run(`calcStudent({monthlyReport:{overallScore:87,level:'جيد جدًا'},attendance:[],grades:[],homeworks:[],recitations:[]}).final`),87);
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
