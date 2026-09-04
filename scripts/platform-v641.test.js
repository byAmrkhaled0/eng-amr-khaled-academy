'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {calculateMonthlyReport,attachTrend,consecutiveAbsenceWarning}=require('../functions/lib/monthly-report');

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

test('two consecutive absences warn the teacher and appear in the parent report without duplicate sessions',()=>{
  const warning=consecutiveAbsenceWarning([
    {id:'s1',date:'2026-08-01',time:'19:00',status:'absent'},
    {id:'s1',date:'2026-08-01',time:'19:00',status:'absent'},
    {id:'s2',date:'2026-08-04',time:'19:00',status:'absent'}
  ]);
  assert.equal(warning.count,2);
  assert.deepEqual(warning.dates,['2026-08-01','2026-08-04']);
  const report=calculateMonthlyReport({monthKey:'2026-08',student:{name:'طالب'},attendance:[{id:'s1',date:'2026-08-01',status:'absent'},{id:'s2',date:'2026-08-04',status:'absent'}]});
  assert.equal(report.attendance.consecutiveAbsenceWarning.count,2);
  assert.match(report.concerns.join(' '),/حصتين متتاليتين/);
  const admin=read('assets/admin.js'),app=read('assets/app.js');
  assert.match(admin,/حصتين متتاليتين/);
  assert.match(app,/تحذير غياب متتالٍ/);
  assert.match(app,/absenceWarningText/);
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

test('redesign shares a parent report image to the saved parent phone and hides archived exams',()=>{
  const app=read('assets/app.js'),admin=read('assets/admin.js'),backend=read('functions/index.js'),teacher=read('teacher-login.html'),css=read('assets/v65-redesign.css'),indexes=JSON.parse(read('firestore.indexes.json'));
  assert.match(app,/function parentReportImageBlob/);assert.match(app,/parentReportWhatsAppIntro/);assert.match(app,/كود الطالب الموحّد/);assert.match(app,/parent\.html/);
  assert.match(admin,/deliverParentMonthlyReport\(report,phone/);assert.match(admin,/s\.parentPhone/);
  assert.match(backend,/exam\.archived!==true&&exam\.active!==false&&exam\.published!==false/);
  assert.match(backend,/exports\.updateStudentSafely = onCall/);assert.match(backend,/const history=availableMonths\.slice\(0,6\)/);
  assert.match(app,/درجة آخر امتحان/);assert.match(app,/درجة آخر واجب/);assert.match(app,/parent-progress-chart-v65/);
  assert.match(teacher,/v65-enhancements\.js/);assert.match(css,/v65-quick-create/);assert.match(css,/v65-template-tools/);
  assert.ok(indexes.fieldOverrides.some(item=>item.collectionGroup==='public_cache'&&item.ttl===true));
});

test('new students only receive homework and exams published after joining',()=>{
  const backend=read('functions/index.js'),app=read('assets/app.js'),css=read('assets/v65-redesign.css');
  assert.match(backend,/function contentAvailableAfterStudentJoined/);
  assert.match(backend,/student\.acceptedAt\|\|student\.activatedAt\|\|student\.enrolledAt\|\|student\.createdAt/);
  assert.match(backend,/assignmentIsReleased\(item\)[^\n]+contentAvailableAfterStudentJoined\(item, student\)/);
  assert.match(backend,/exam\.archived!==true[^\n]+contentAvailableAfterStudentJoined\(exam,found\.data\)/);
  assert.match(app,/scheduleState\|\|'open'\)!=='inactive'/);
  assert.match(css,/#examCodeForm,#examStudentResult\{grid-column:1\/-1\}/);
  for(const page of ['index.html','student.html','parent.html','exams.html','teacher-login.html'])assert.match(read(page),/v65-redesign\.css\?v=66\.1\.0/);
});

test('mobile exams and homework stay inside the iPhone viewport',()=>{
  const css=read('assets/v65-redesign.css'),app=read('assets/app.js'),backend=read('functions/index.js');
  assert.match(css,/\.exam-overlay\{z-index:7000!important/);assert.match(css,/body\.exam-open \.site-header/);
  assert.match(css,/grid-template-columns:22px 32px minmax\(0,1fr\)!important/);assert.match(css,/height:100svh!important/);
  assert.match(css,/\.assignment-choices label>span[^}]+white-space:normal/);
  assert.match(app,/class="exam-save-exit" id="examExitBtn"/);
  assert.match(css,/\.exam-navigation\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(css,/\.student-assignment-card\[open\] \.student-assignment-head:after/);
  assert.match(app,/function renderExamQuestionHtml/);assert.match(app,/function homeworkQuestionHtml/);
  assert.match(backend,/contentAvailableAfterStudentJoined/);assert.match(backend,/learningTargetMatchesStudent/);
});

test('exam timer uses Cairo time and locks answers after expiry with safe retry',()=>{
  const app=read('assets/app.js'),css=read('assets/v65-redesign.css');
  assert.match(app,/function examCairoDateTime/);assert.match(app,/timeZone:'Africa\/Cairo'/);
  assert.match(app,/role="timer" aria-live="polite"/);assert.match(app,/const lockExpiredExam=/);
  assert.match(app,/form\.querySelectorAll\('input,textarea'\).*disabled=true/);
  assert.match(app,/autoSubmitRetryTimer=setTimeout\(\(\)=>finish\(true\),8000\)/);
  assert.match(css,/\.exam-timer\.warn/);assert.match(css,/\.exam-timer\.danger/);
});

test('a newly enrolled student receives currently open class assessments',()=>{
  const backend=read('functions/index.js');
  assert.match(backend,/today<=dueDate&&assignmentIsReleased\(item\)/);
  assert.match(backend,/closeAt>now&&\(!openAt\|\|openAt<=now\)/);
  assert.match(backend,/Finished historic work stays/);
});

test('leaderboard keeps the latest active month visible at a month boundary',()=>{
  const backend=read('functions/index.js'),app=read('assets/app.js'),css=read('assets/v65-redesign.css');
  assert.match(backend,/function previousLeaderboardPeriod/);assert.match(backend,/leaderboardRowsForGradeWithFallback/);
  assert.match(backend,/isPreviousPeriod:result\.isPreviousPeriod/);assert.match(app,/ترتيب شهر/);
  assert.match(app,/تعذر تحميل ترتيب الطلاب الآن/);assert.match(css,/leaderboard-period-note/);
});

test('monthly motivation is configurable, comparative, archived and included in parent reports',()=>{
  const backend=read('functions/index.js'),app=read('assets/app.js'),admin=read('assets/admin.js'),sync=read('assets/firebase-sync.js');
  assert.match(backend,/DEFAULT_MOTIVATION_CONFIG/);
  assert.match(backend,/enrichLeaderboardRows/);
  assert.match(backend,/exports\.freezeMonthlyLeaderboard/);
  assert.match(backend,/leaderboard_archives/);
  assert.match(backend,/motivation,previousMonth/);
  assert.match(app,/parent-motivation-summary/);
  assert.match(app,/مركزك في المسار/);
  assert.match(admin,/motivationConfigForm/);
  assert.match(sync,/saveMotivationSettingsAdmin/);
});

test('live audit fixes health GET contrast and first paint',()=>{
  const backend=read('functions/index.js'),vercel=JSON.parse(read('vercel.json')),css=read('assets/v65-redesign.css');
  assert.match(backend,/exports\.getPlatformHealthHttp = onRequest/);
  assert.ok(vercel.rewrites.some(item=>item.source==='/api/health'&&item.destination.includes('getPlatformHealthHttp')));
  assert.match(css,/\.tm-reveal\{opacity:1!important/);assert.match(css,/\.page-hero \.hero-title\{color:#10233f!important/);
  assert.match(css,/html:not\(\[data-theme='dark'\]\) \.hero \.btn\.ghost\{background:#102943!important/);
});

test('finished class exams register missing students as absent in admin and parent reports',()=>{
  const report=calculateMonthlyReport({
    monthKey:'2026-08',student:{studentCode:'ST-1',name:'طالب'},
    exams:[{id:'e1',title:'امتحان أول',finished:true},{id:'e2',title:'امتحان ثان',finished:true},{id:'e3',title:'امتحان قادم',finished:false}],
    examAttempts:[{id:'a1',examId:'e1',examTitle:'امتحان أول',score:8,maxScore:10,submittedAt:'2026-08-10T10:00:00Z'}]
  });
  assert.equal(report.results.requiredExams,2);assert.equal(report.results.attendedExams,1);assert.equal(report.results.missedExams,1);
  assert.equal(report.results.rows.find(row=>row.examId==='e2').status,'absent');
  assert.match(report.concerns.join(' '),/امتحان غاب عنه الطالب/);
  const backend=read('functions/index.js'),app=read('assets/app.js'),operations=read('assets/v64-admin-operations.js'),sync=read('assets/firebase-sync.js');
  assert.match(backend,/exports\.finalizeExamAbsences = onSchedule/);assert.match(backend,/exam_absences/);assert.match(backend,/expectedStudentCount/);
  assert.match(app,/غائب عن الامتحان/);assert.match(operations,/refreshExamAbsences/);assert.match(sync,/finalizeExamAbsencesAdmin/);
});

test('QR attendance survives offline use and syncs idempotently after reconnect',()=>{
  const offline=read('assets/offline-attendance.js'),admin=read('assets/admin.js'),app=read('assets/app.js'),backend=read('functions/index.js'),sync=read('assets/firebase-sync.js'),worker=read('service-worker.js'),page=read('teacher-login.html');
  assert.match(offline,/indexedDB\.open/);assert.match(offline,/studentDate/);assert.match(offline,/async function enqueue/);assert.match(offline,/async function sync/);
  assert.match(admin,/offline_qr_pending/);assert.match(admin,/syncOfflineAttendanceNow/);assert.match(admin,/tryOfflineStaffWorkspace/);
  assert.match(admin,/__adminQrOfflinePrepared/);assert.match(admin,/MFAssets\?\.loadQrScanner/);
  assert.match(backend,/exports\.syncOfflineAttendance = onCall/);assert.match(backend,/offlineRequestId/);assert.match(backend,/cairoDateKey\(new Date\(scannedMillis\)\)!==date/);
  assert.match(sync,/syncOfflineAttendance:callable\('syncOfflineAttendance'\)/);
  assert.match(worker,/technominds-attendance-sync/);assert.match(worker,/\/teacher-login\.html/);assert.match(worker,/cache\.put\(request,response\.clone\(\)\)/);
  assert.match(worker,/\/assets\/vendor\/html5-qrcode-2\.3\.8\.min\.js/);assert.match(worker,/v66-1-comfort-theme/);
  assert.match(admin,/qrScanBusy/);assert.match(admin,/offlineQrManualForm/);assert.match(admin,/state\?\.roster/);
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

test('class recording links are targeted, server filtered and mobile friendly',()=>{
  const app=read('assets/app.js'),admin=read('assets/admin.js'),backend=read('functions/index.js'),page=read('materials.html'),css=read('assets/v65-redesign.css');
  assert.match(admin,/\['classLinks','external-link','روابط الحصص'\]/);
  assert.match(admin,/resourceType:'class-link'/);
  assert.match(admin,/MFCloud\.saveContent\('materials',item\)/);
  assert.match(backend,/resourceType: text\(data\.resourceType \|\| data\.materialType/);
  assert.match(backend,/linkUrl,/);
  assert.match(app,/classLinksGrid/);
  assert.match(app,/فتح تسجيل الحصة/);
  assert.match(app,/\['materials\.html','الحصص المسجلة'\]/);
  assert.doesNotMatch(app,/\['learning-path\.html','المسار التعليمي'\]/);
  assert.match(page,/روابط حصصك على Google Drive/);
  assert.match(css,/\.class-links-admin-layout/);
  assert.match(css,/Admin light mode: override every legacy hard-coded surface/);
  assert.match(css,/html:not\(\[data-theme="dark"\]\) \.admin-main/);
  assert.match(css,/@media\(max-width:480px\)/);
});
