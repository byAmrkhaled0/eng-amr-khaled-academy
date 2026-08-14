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
  assert.match(app,/تُحتسب كبونص شهري يساعدك في ترتيب طلاب مسارك/);
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
  assert.match(experience,/بحث في جميع الطلاب/);
  assert.match(experience,/studentMonthlyReportV637/);
  assert.match(experience,/loadMoreStudentsV637/);
});

test('student and parent portals refresh in place and expose monthly alerts',()=>{
  const app=read('assets/app.js');
  assert.match(app,/studentPortalAutoRefreshBound/);
  assert.match(app,/parentPortalAutoRefreshBound/);
  assert.match(app,/portal-action-alert deadline/);
  assert.match(app,/parent-month-filter-v637/);
  assert.match(app,/renderParentMonth/);
});

test('admin preview asset and cache use release 63.0.7',()=>{
  assert.match(read('teacher-login.html'),/v63-admin-experience\.js\?v=63\.0\.7/);
  assert.match(read('service-worker.js'),/technominds-v63-0-7-operations-final/);
  assert.equal(require(path.join(root,'package.json')).version,'63.0.7');
});
