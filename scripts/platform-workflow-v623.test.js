const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {studentCanOpenPortal,studentIsApproved}=require('../functions/lib/student-access');

test('lectures stay directly accessible and grade/group targeted without a duplicate tab',()=>{
  const app=read('assets/app.js'),workflow=read('assets/v60-admin-workflow.js'),backend=read('functions/index.js');
  assert.match(app,/portalUrl\('materials\.html',st\.studentCode\)/);
  assert.doesNotMatch(app,/data-student-tab="lectures"/);
  assert.match(workflow,/renderLecturesV623/);
  assert.match(workflow,/name="group"/);
  assert.match(backend,/materialsForStudent/);
  assert.match(backend,/learningTargetMatchesStudent\(doc\.data\(\) \|\| \{\}, found\.data\)/);
});

test('homework and exams are interactive while PDF remains lecture-only',()=>{
  const workflow=read('assets/v60-admin-workflow.js');
  const exam=workflow.slice(workflow.indexOf('function renderExamsV6061'),workflow.indexOf('function assignmentTypeFields'));
  const homework=(workflow.match(/<form id="assignmentFormV6061"[\s\S]*?<\/form>/)||[''])[0];
  assert.doesNotMatch(exam,/pdfFile|exam-pdf-upload/);
  assert.doesNotMatch(homework,/name="file"|application\/pdf/);
  assert.match(workflow,/رفع محاضرة أو PDF/);
});

test('admin reports homework completion and QR attendance supports one or more scheduled days',()=>{
  const workflow=read('assets/v60-admin-workflow.js'),admin=read('assets/admin.js');
  assert.match(workflow,/ملفات الواجبات والمتابعة/);
  assert.match(workflow,/targetStudentCodes/);
  assert.match(workflow,/getHomeworkAdminWorkspace/);
  assert.match(workflow,/homeworkAttendanceGrade/);
  assert.match(workflow,/homeworkAttendanceGroup/);
  assert.match(admin,/attendanceScheduleDays/);
  assert.match(admin,/days\.length<1/);
  assert.match(admin,/bulk_absent/);
});

test('student code can resolve the parent portal and legacy grade naming stays compatible',()=>{
  const backend=read('functions/index.js'),targeting=read('functions/lib/academic-targeting.js');
  assert.match(backend,/where\('studentCode', '==', normalized\)/);
  assert.match(targeting,/اولي ثانوي برمجة/);
  assert.match(targeting,/اولي ثانوي بكالوريا/);
});

test('pending booking code opens the student portal while learning actions stay locked',()=>{
  const backend=read('functions/index.js'),app=read('assets/app.js'),worker=read('service-worker.js');
  const lookup=backend.slice(backend.indexOf('async function getStudentPortalByCode'),backend.indexOf('async function getParentPortalByCode'));
  assert.equal(studentCanOpenPortal({active:false,approvalStatus:'قيد التسجيل'}),true);
  assert.equal(studentIsApproved({active:false,approvalStatus:'قيد التسجيل'}),false);
  assert.equal(studentCanOpenPortal({active:false,approvalStatus:'تم رفض الحجز'}),false);
  assert.equal(studentIsApproved({active:true,approvalStatus:'تم القبول والتسجيل كطالب'}),true);
  assert.match(lookup,/studentCanOpenPortal\(canonical\)/);
  assert.doesNotMatch(lookup,/canonical\.active === false/);
  assert.match(backend,/accessStatus: approved \? 'approved' : 'pending'/);
  assert.ok((backend.match(/requireApprovedStudent\(found\.data\)/g)||[]).length>=7);
  assert.match(app,/لم يتم قبول الحجز حتى الآن/);
  assert.match(app,/ستتفعّل المحاضرات والواجبات والاختبارات بعد قبول الحجز/);
  assert.match(worker,/technominds-v63-0-7-operations-final/);
});
