'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const admin=fs.readFileSync(require.resolve('../assets/admin.js'),'utf8');
const sync=fs.readFileSync(require.resolve('../assets/firebase-sync.js'),'utf8');

function adminHarness(){
  let month='سبتمبر',calls=0,resolveRequest,refreshes=0;
  const context={currentSection:'students',document:{getElementById:id=>id==='studentsTableBox'?{}:null},
    window:{MFCloud:{getAdminStudentMetricsBatch:()=>{calls++;return new Promise(resolve=>{resolveRequest=resolve;});}},refreshStudentsTable:()=>{refreshes++;}},
    adminWorkspaceContext:()=>({academicYear:'2026/2027',month}),adminReportMonthKey:()=>month==='سبتمبر'?'2026-09':'2026-10',
    stCode:st=>st.studentCode,aToast:()=>{},adminActionErrorMessage:error=>error.message,
    normalizeStudent:st=>st,adminPaymentStatus:()=>null,safe:value=>String(value),Promise};
  vm.runInNewContext(admin.slice(admin.indexOf('const adminStudentMetrics='),admin.indexOf('function badgeStatus(')),context);
  vm.runInNewContext(admin.slice(admin.indexOf('function studentMobileCards('),admin.indexOf('function renderStudents(')),context);
  return {context,setMonth:value=>{month=value;},calls:()=>calls,refreshes:()=>refreshes,resolve:value=>resolveRequest(value),metrics:st=>context.calcStudentAdmin(st),card:st=>context.studentMobileCards([st])};
}

test('admin placeholders, actual zero, report metrics and practical count are distinct',async()=>{
  const admin=adminHarness(),student={studentCode:'ST-1',name:'طالب',grade:'برمجة'};
  assert.match(admin.card(student),/الحضور<\/small><b>—<\/b>/);
  assert.equal(admin.metrics(student).attendancePct,null);
  const pending=admin.context.loadAdminStudentMetricsBatch();
  await Promise.resolve();
  assert.equal(admin.calls(),1);
  assert.match(admin.card(student),/الدرجات<\/small><b>—<\/b>/);
  admin.resolve({monthKey:'2026-09',metricsByStudent:{'ST-1':{attendancePercentage:100,resultsAverage:0,homeworkCompletionPercentage:75,practicalCompleted:3,practicalCount:4}}});
  await pending;
  assert.equal(admin.calls(),1);
  assert.match(admin.card(student),/الحضور<\/small><b>100%<\/b>/);
  assert.match(admin.card(student),/الدرجات<\/small><b>0%<\/b>/);
  assert.match(admin.card(student),/الواجب<\/small><b>75%<\/b>/);
  assert.match(admin.card(student),/التطبيق العملي<\/small><b>3\/4<\/b>/);
  assert.ok(admin.refreshes()>=2);
  admin.setMonth('أكتوبر');
  assert.equal(admin.metrics(student).attendancePct,null);
  assert.match(admin.card(student),/الحضور<\/small><b>—<\/b>/);
  const october=admin.context.loadAdminStudentMetricsBatch();
  await Promise.resolve();
  assert.equal(admin.calls(),2);
  admin.resolve({monthKey:'2026-10',metricsByStudent:{'ST-1':{attendancePercentage:0,resultsAverage:null,homeworkCompletionPercentage:null,practicalCompleted:null,practicalCount:null}}});
  await october;
  assert.match(admin.card(student),/الحضور<\/small><b>0%<\/b>/);
  assert.match(admin.card(student),/الواجب<\/small><b>—<\/b>/);
});

test('students screen starts one batch without per-student monthly requests',()=>{
  const render=admin.slice(admin.indexOf('function renderStudents('),admin.indexOf('function studentsTable('));
  assert.match(render,/loadAdminStudentMetricsBatch\(true\)/);
  assert.doesNotMatch(render,/getStudentMonthlyReportAdmin|getParentMonthlyReport/);
  assert.match(sync,/getAdminStudentMetricsBatch:callable\('getAdminStudentMetricsBatch'\)/);
  assert.doesNotMatch(admin.slice(admin.indexOf('const adminStudentMetrics='),admin.indexOf('function badgeStatus(')),/student\.monthlyReport|st\.attendance|st\.grades/);
});
