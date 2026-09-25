'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('admin navigation keeps every operational service and exposes maintenance safely',()=>{
  const admin=read('assets/admin.js');
  for(const section of ['students','schedules','attendance','materials','assignments','exams','payments','bookings','studentRequests','curriculum','backup','settings']){
    assert.match(admin,new RegExp(`\\['${section}'`),`missing admin section ${section}`);
  }
  assert.match(admin,/adminSectionGroups/);
  assert.match(admin,/backup:renderBackup,settings:renderSettings/);
});

test('academic workspace context is session-only and drives year term and month',()=>{
  const admin=read('assets/admin.js');
  assert.match(admin,/tm-admin-academic-year/);
  assert.match(admin,/tm-admin-term/);
  assert.match(admin,/tm-admin-month/);
  assert.match(admin,/sessionStorage\.setItem/);
  assert.doesNotMatch(admin,/localStorage\.setItem\(['"]tm-admin-(?:academic-year|term|month)/);
  const payments=read('assets/v60-payments.js');
  assert.match(payments,/adminWorkspaceContext\?\.\(\)\.month/);
  assert.match(payments,/adminWorkspaceContext\?\.\(\)\.academicYear/);
});

test('payment confirmation is immediate, idempotent and does not wait for a second full dashboard read',()=>{
  const payments=read('assets/v60-payments.js'),backend=read('functions/index.js'),login=read('teacher-login.html');
  assert.match(payments,/requestId:newRequestId\(\)/);
  assert.match(payments,/applyPaymentResult\(row,result,payload\.paymentDate\)/);
  assert.match(payments,/scheduleDashboardRefresh\(\)/);
  assert.doesNotMatch(payments,/createPaymentTransaction\(payload\)[\s\S]{0,500}await loadDashboard\(\{force:true\}\)/);
  assert.match(backend,/requestFingerprint/);
  assert.match(payments,/adminSameAcademic\(r\.summary\?\.course\|\|r\.student\.grade,course\)/);
  assert.match(backend,/sameAcademicValue\(requestedCourse, student\.grade\)/);
  assert.match(backend,/invalidateStudentReportInTransaction\(tx, studentCode, summary\.academicYear, summary\.month, 'payment-updated'\)/);
  assert.match(login,/v60-payments\.js\?v=70\.0\.5/);
});

test('payment cards explain zero prices and never leave the primary action silently disabled',()=>{
  const payments=read('assets/v60-payments.js'),backend=read('functions/index.js');
  assert.match(payments,/missingPrice\?'حدد السعر أولًا'/);
  assert.match(payments,/if\(number\(row\.expected\)<=0\)return focusCoursePrice/);
  assert.match(payments,/editor\.open=true/);
  assert.match(payments,/applySavedCoursePrices\(\)/);
  assert.doesNotMatch(payments,/saveSettings\(adminData\.settings\)[\s\S]{0,300}await loadDashboard/);
  for(const field of ['expectedAmount:duplicateExpected','paidAmount:duplicatePaid','remainingAmount:duplicateRemaining'])assert.match(backend,new RegExp(field));
});

test('V60.6 restores every payment handler after the V55 compatibility hook',()=>{
  const payments=read('assets/v60-payments.js');
  assert.match(payments,/const v606PaymentHandlers=\{[\s\S]*refreshPaymentRows:window\.refreshPaymentRows,[\s\S]*refreshPaymentDashboard:window\.refreshPaymentDashboard,[\s\S]*saveCoursePrices:window\.saveCoursePrices,[\s\S]*exportCenterSubscriptionsCSV:window\.exportCenterSubscriptionsCSV/);
  assert.match(payments,/Object\.assign\(window,v606PaymentHandlers,\{renderPayments:renderPaymentsV606\}\)/);
});

test('student file opens synchronously before cloud history so popup blockers do not swallow it',()=>{
  const admin=read('assets/admin.js'),start=admin.indexOf('window.printStudentReport=async function'),end=admin.indexOf('window.sendParentMonthlyReport',start),source=admin.slice(start,end);
  assert.ok(source.indexOf("window.open('','_blank')")>=0);
  assert.ok(source.indexOf("window.open('','_blank')")<source.indexOf('await Promise.allSettled'));
  assert.match(source,/جارٍ تجهيز ملف الطالب/);
  assert.match(source,/w\.opener=null/);
});

test('parent report delivery is fresh, student-bound and protected from duplicate clicks',()=>{
  const admin=read('assets/admin.js'),backend=read('functions/index.js'),studentList=read('assets/v56-fixes.js');
  assert.match(admin,/getStudentMonthlyReportAdmin\(\{studentCode:stCode\(st\),monthKey:adminReportMonthKey\(\),includeRanking:true,includeDeliveryState\}\)/);
  assert.match(admin,/loadAccurateMonthlyReport\(s,true\)/);
  assert.match(admin,/parentReportDeliveryPending\.has\(code\)/);
  assert.match(admin,/report\?\.student\?\.studentCode!==code/);
  assert.match(backend,/studentReportRanking\(found\.data,monthKey\)/);
  assert.match(studentList,/onclick="editStudent\('\$\{safe\(student\.studentCode\)\}'\)">الملف/);
});

test('content targeting previews exact active audience before save',()=>{
  const workflow=read('assets/v60-admin-workflow.js');
  assert.match(workflow,/data-target-preview/);
  assert.match(workflow,/scheduleId\|\|student\.groupId/);
  assert.match(workflow,/سيصل إلى \$\{students\.length\} طالب/);
});

test('curriculum UI does not duplicate operational homework and exam delivery',()=>{
  const curriculum=read('assets/curriculum-admin.js');
  const sectionDeclaration=curriculum.match(/const sections=\[([\s\S]*?)\];/)?.[1]||'';
  assert.doesNotMatch(sectionDeclaration,/assignments_v2/);
  assert.doesNotMatch(sectionDeclaration,/monthly_exams/);
  assert.match(sectionDeclaration,/lectures/);
  assert.match(sectionDeclaration,/bank_questions/);
  assert.match(curriculum,/أدوات الصيانة والترحيل/);
});

test('student editor waits for cloud success and keeps values on failure',()=>{
  const experience=read('assets/v63-admin-experience.js');
  assert.match(experience,/await window\.MFCloud\.saveStudent\(updated\);Object\.assign\(student,updated\)/);
  assert.match(experience,/احتفظنا بالقيم للمحاولة مرة أخرى/);
  assert.match(experience,/button\.disabled=true/);
  assert.match(experience,/event\.key==='Escape'/);
  assert.match(experience,/motivationFormV63/);
  assert.match(experience,/addStudentMotivationPoints/);
});

test('student portal keeps essential tabs without a more menu and shows motivation',()=>{
  const app=read('assets/app.js');
  assert.doesNotMatch(app,/data-student-more-toggle/);
  assert.match(app,/data-student-panel="motivation"/);
  assert.match(app,/نقاط تحفيز الشهر/);
  assert.match(app,/getStudentLeaderboardPosition/);
});

test('attendance persists one record per class date and reads legacy identities',()=>{
  const functions=read('functions/index.js');
  const app=read('assets/app.js');
  assert.match(functions,/cleanDocId\(`\$\{studentCode\}_\$\{date\}`\)/);
  assert.match(functions,/\['studentCode','studentId','code'\]/);
  assert.match(app,/data-attendance-month-select/);
  assert.match(app,/currentAttendanceMonth/);
  assert.match(app,/يبدأ عداد كل شهر من الصفر/);
});

test('advanced admin workflows are server-backed, realtime and auditable',()=>{
  const backend=read('functions/index.js'),sync=read('assets/firebase-sync.js'),admin=read('assets/admin.js'),experience=read('assets/v63-admin-experience.js');
  for(const endpoint of ['reverseStudentMotivationTransaction','getMotivationLeaderboardAdmin','searchStudentsAdmin','getStudentAdminProfile'])assert.match(backend,new RegExp(`exports\\.${endpoint}`));
  assert.match(backend,/exports\.getHomeworkAdminWorkspace/);
  assert.match(backend,/targetStudentCodes/);
  assert.match(backend,/exports\.getStudentLeaderboardPosition/);
  assert.match(backend,/motivationBonus/);
  assert.match(admin,/\['motivation','star','التحفيز والترتيب'\]/);
  assert.match(admin,/renderMotivationAdmin/);
  assert.match(backend,/reversalOf/);
  assert.match(sync,/subscribeToHomeworkSubmissions/);
  assert.match(sync,/subscribeToExamAttempts/);
  assert.match(admin,/adminNotifications/);
  assert.match(admin,/section==='assignments'/);
  assert.match(admin,/stopAdminSectionLiveData/);
  assert.match(experience,/بحث في جميع الطلاب/);
  assert.match(experience,/studentMonthlyReportV637/);
  assert.match(experience,/loadMoreStudentsV637/);
});

test('student and parent portals refresh in place and expose monthly alerts',()=>{
  const app=read('assets/app.js');
  assert.match(app,/studentPortalAutoRefreshBound/);
  assert.match(app,/parentPortalAutoRefreshBound/);
  assert.match(app,/portal-action-alert deadline/);
  assert.match(app,/parent-report-toolbar-v70/);
  assert.match(app,/renderParentMonth/);
});

test('admin preview asset and cache use the current release',()=>{
  assert.match(read('teacher-login.html'),/v63-admin-experience\.js\?v=70\.0\.5&rev=[a-f0-9]+/);
  assert.match(read('service-worker.js'),/technominds-v70-0-5-complete-report/);
  assert.equal(require(path.join(root,'package.json')).version,'70.0.5');
});
