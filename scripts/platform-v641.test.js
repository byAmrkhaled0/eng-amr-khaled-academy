'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {calculateMonthlyReport,attachTrend}=require('../functions/lib/monthly-report');

test('teacher schedules are interpreted and displayed in Cairo timezone',()=>{
  const app=read('assets/app.js');
  assert.match(app,/function localDateTimeToIso[\s\S]+timeZone:'Africa\/Cairo'/);
  assert.match(app,/function isoToLocalDateTimeInput[\s\S]+timeZone:'Africa\/Cairo'/);
});

test('hidden true-false options never remain required',()=>{
  for(const file of ['assets/admin.js','assets/v60-admin-workflow.js']){
    const source=read(file);
    assert.match(source,/const hidden=type==='truefalse'&&index>1/);
    assert.match(source,/required=.*!hidden/);
  }
});

test('background record hydration preserves open admin editors',()=>{
  const admin=read('assets/admin.js');
  assert.match(admin,/const openEditor=/);
  assert.match(admin,/#examCreatorPanel:not\(\[hidden\]\)/);
  assert.match(admin,/#assignmentFormV6061:not\(\[hidden\]\)/);
});

test('monthly report separates academic level from study commitment and lists missing homework',()=>{
  const report=calculateMonthlyReport({
    monthKey:'2026-08',student:{studentCode:'ST-123456',name:'طالب'},
    attendance:[{date:'2026-08-01',status:'present'},{date:'2026-08-08',status:'absent'}],
    grades:[{id:'g1',score:80,maxScore:100}],
    assignments:[{id:'a1',title:'واجب 1',dueDate:'2026-08-10'},{id:'a2',title:'واجب 2',dueDate:'2026-08-12'}],
    homeworks:[{id:'h1',assignmentId:'a1',submittedAt:'2026-08-09T10:00:00Z',score:9,maxScore:10,approved:true}],
    lectureProgress:[{lectureId:'l1',viewed:true,percent:100}],recitations:[{date:'2026-08-01',completed:true}]
  });
  assert.equal(report.homework.required,2);assert.equal(report.homework.submitted,1);assert.equal(report.homework.missing,1);
  assert.equal(report.results.average,80);assert.equal(report.study.lecturesCompleted,1);
  assert.notEqual(report.academicScore,null);assert.notEqual(report.commitmentScore,null);
  assert.match(report.concerns.join(' '),/واجب لم يتم تسليمه/);
});

test('monthly trend reports improvement decline and insufficient data honestly',()=>{
  assert.equal(attachTrend({overallScore:80},{overallScore:70}).trend.status,'improved');
  assert.equal(attachTrend({overallScore:60},{overallScore:70}).trend.status,'declined');
  assert.equal(attachTrend({overallScore:null},{overallScore:70}).trend.status,'insufficient');
});

test('server owns complete monthly reports and prepares previous month automatically',()=>{
  const backend=read('functions/index.js'),sync=read('assets/firebase-sync.js'),app=read('assets/app.js');
  assert.match(backend,/exports\.getStudentMonthlyReportAdmin = onCall/);
  assert.match(backend,/exports\.getParentMonthlyReport = onCall/);
  assert.match(backend,/exports\.prepareMonthlyParentReports = onSchedule/);
  assert.match(backend,/schedule:'15 8 1 \* \*'/);
  assert.doesNotMatch(backend,/sendPreparedMonthlyReports|WHATSAPP_ACCESS_TOKEN|graph\.facebook\.com/);
  assert.match(sync,/getParentMonthlyReport:callable\('getParentMonthlyReport'\)/);
  assert.match(app,/function parentMonthlyReportText/);
  assert.match(app,/التقدم مقارنة بالشهر السابق/);
  assert.match(app,/الالتزام والمذاكرة/);
});

test('QR attendance survives offline use and syncs idempotently after reconnect',()=>{
  const offline=read('assets/offline-attendance.js'),admin=read('assets/admin.js'),app=read('assets/app.js'),backend=read('functions/index.js'),sync=read('assets/firebase-sync.js'),worker=read('service-worker.js'),page=read('teacher-login.html');
  assert.match(offline,/indexedDB\.open/);assert.match(offline,/studentDate/);assert.match(offline,/async function enqueue/);assert.match(offline,/async function sync/);
  assert.match(admin,/offline_qr_pending/);assert.match(admin,/syncOfflineAttendanceNow/);assert.match(admin,/tryOfflineStaffWorkspace/);
  assert.match(admin,/__adminQrOfflinePrepared/);assert.match(admin,/MFAssets\?\.loadQrScanner/);
  assert.match(backend,/exports\.syncOfflineAttendance = onCall/);assert.match(backend,/offlineRequestId/);assert.match(backend,/cairoDateKey\(new Date\(scannedMillis\)\)!==date/);
  assert.match(sync,/syncOfflineAttendance:callable\('syncOfflineAttendance'\)/);
  assert.match(worker,/technominds-attendance-sync/);assert.match(worker,/\/teacher-login\.html/);assert.match(worker,/cache\.put\(request,response\.clone\(\)\)/);
  assert.match(app,/assets\/vendor\/html5-qrcode-2\.3\.8\.min\.js/);
  assert.match(page,/assets\/offline-attendance\.js/);
});

test('mobile admin navigation remains visible with full-size touch targets',()=>{
  const css=read('assets/v56.css');
  assert.doesNotMatch(css,/\.mobile-bottom,\.admin-mobile-bottom\{display:none/);
  assert.match(css,/\.compact-student-actions \.small-btn[^}]+min-height:44px!important/);
});

test('teacher login keeps one password reset action',()=>{
  const upgrade=read('assets/v53-upgrades.js'),page=read('teacher-login.html');
  assert.match(page,/id="adminPasswordReset"/);
  assert.match(upgrade,/getElementById\('adminPasswordReset'\)/);
});

test('teacher exam and homework builders auto-save and restore local drafts',()=>{
  const workflow=read('assets/v60-admin-workflow.js');
  assert.match(workflow,/ADMIN_BUILDER_DRAFT_PREFIX/);assert.match(workflow,/saveAdminBuilderDraft/);assert.match(workflow,/restoreAdminBuilderDraft/);assert.match(workflow,/clearAdminBuilderDraft\('exam'/);assert.match(workflow,/clearAdminBuilderDraft\('homework'/);assert.match(workflow,/data-admin-draft-note/);
});
