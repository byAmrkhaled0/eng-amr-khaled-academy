const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('lectures are a dedicated grade and group targeted portal section',()=>{
  const app=read('assets/app.js'),workflow=read('assets/v60-admin-workflow.js'),backend=read('functions/index.js');
  assert.match(app,/data-student-tab="lectures"/);
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

test('admin reports homework completion and QR attendance is limited to two scheduled days',()=>{
  const workflow=read('assets/v60-admin-workflow.js'),admin=read('assets/admin.js');
  assert.match(workflow,/مين سلّم الواجب ومين لسه/);
  assert.match(workflow,/homeworkAttendanceGrade/);
  assert.match(workflow,/homeworkAttendanceGroup/);
  assert.match(admin,/attendanceScheduleDays/);
  assert.match(admin,/days\.length!==2/);
  assert.match(admin,/auto_absent/);
});

test('student code can resolve the parent portal and legacy grade naming stays compatible',()=>{
  const backend=read('functions/index.js'),targeting=read('functions/lib/academic-targeting.js');
  assert.match(backend,/where\('studentCode', '==', normalized\)/);
  assert.match(targeting,/اولي ثانوي برمجة/);
  assert.match(targeting,/اولي ثانوي بكالوريا/);
});
