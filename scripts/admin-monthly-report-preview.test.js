'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdminDOM,tick}=require('./testing/admin-dom');

async function fixture(){
  const ui=await createAdminDOM();let reads=0;
  const student={studentCode:'DEMO1',name:'طالب تجربة التقرير',grade:'تانية ثانوي بكالوريا',group:'أ'};
  const report={schemaVersion:11,policyVersion:'monthly-v12-scheduled-session-attendance',monthKey:ui.run('adminReportMonthKey()'),student,overallScore:84,level:'جيد جدًا',monthlyTitle:'متقدم',attendance:{percentage:75,present:3,absent:1,required:4,rows:[{date:'2026-10-01',status:'present'}]},results:{average:80,gradedCount:1,submittedExams:1,requiredExams:1,rows:[{examTitle:'اختبار الوحدة',score:8,maxScore:10,status:'graded'}]},homework:{averageGrade:90,submitted:1,required:1,graded:1,rows:[{assignment:{title:'واجب الوحدة'},submission:{score:9,maxScore:10},status:'submitted'}]},study:{lecturesAvailable:2,lecturesCompleted:1,rows:[]},practical:{completed:2},payment:{status:'paid'},motivation:{rank:2,totalStudents:10,totalPoints:5},warnings:['بيانات تجربة محلية'],teacherNotes:'استمر في المراجعة'};
  ui.window.MFCloud.getStudentAdminProfile=async()=>{reads++;return {student,monthlyReport:report,reportDeliveries:[],privateNotes:[]};};
  await ui.window.editStudent('DEMO1');await tick(20);
  return {ui,report,reads:()=>reads};
}

test('monthly report opens in the existing profile and retains the full report sections',async()=>{
  const {ui,reads}=await fixture();
  try{
    assert.equal(ui.document.querySelector('#adminStudentMonthlyReport'),null,'report must render lazily');
    const button=ui.document.querySelector('.profile-actions [data-profile-view="reports"]');assert(button);
    assert.equal(button.hasAttribute('data-tm-action'),false);button.click();
    const sheet=ui.document.querySelector('#adminStudentMonthlyReport');assert(sheet);
    for(const text of ['طالب تجربة التقرير','سجل الحضور خلال الشهر','اختبار الوحدة','واجب الوحدة','ملاحظة المدرس','استمر في المراجعة','ملخص المتابعة','الدفع'])assert(sheet.textContent.includes(text),text);
    assert.equal(sheet.querySelector('.parent-report-toolbar-v70'),null);
    assert.equal(ui.document.querySelector('#parentMonthlyReport'),null,'no Parent portal duplicate IDs');
    assert.equal(ui.document.querySelector('[data-profile-panel="reports"]').hidden,false);
    for(const key of ['summary','activity','info','attendance','results','homework','lectures','payments','motivation','notes'])assert(ui.document.querySelector(`[data-profile-panel="${key}"]`),key);
    for(let i=0;i<3;i++){ui.document.querySelector('[data-profile-view="summary"]').click();button.click();}
    assert.equal(ui.document.querySelectorAll('#adminStudentMonthlyReport').length,1);
    assert.equal(reads(),1,'report preview reuses the loaded profile');
    assert.deepEqual(ui.errors.map(x=>x.message),[]);
  }finally{ui.close();}
});

test('printing and report sharing retain their original actions after opening the inline report',async()=>{
  const {ui}=await fixture();
  try{
    let printed='',shared='';ui.window.printStudentReport=code=>{printed=code;};ui.window.sendParentMonthlyReport=code=>{shared=code;};
    ui.document.querySelector('.profile-actions [data-profile-view="reports"]').click();
    for(const name of ['printStudentReport','sendParentMonthlyReport'])ui.window.invokeRenderAction(ui.document.querySelector(`.profile-report-actions [data-tm-action="${name}"]`));
    assert.equal(printed,'DEMO1');assert.equal(shared,'DEMO1');
    const nav=ui.document.querySelector('.profile-tabs-v688 [data-profile-view="reports"]');assert.equal(nav.getAttribute('aria-pressed'),'true');
  }finally{ui.close();}
});
