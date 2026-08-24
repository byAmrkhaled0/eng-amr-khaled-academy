'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('parent report derives required and graded states from assignments plus submissions', () => {
  const app = read('assets/app.js');
  assert.match(app, /const assignmentRows=monthAssignments\.map/);
  assert.match(app, /assignment\.submissionClosed\?'متأخر':'مطلوب الآن'/);
  assert.match(app, /submission\.needsManualReview\|\|submission\.score===null\?'قيد التصحيح':'تم التصحيح'/);
  assert.match(app, /الدرجة:.*row\.score/s);
  assert.match(app, /يستطيع الطالب تسليم الواجب من بوابة الطالب/);
  const parentReport = app.slice(app.indexOf('function parentReportHTML'), app.indexOf('async function showParentReportByCode'));
  assert.doesNotMatch(parentReport, /assignment-answer-form/);
});

test('portal navigation never adds a student code and legacy code queries are cleaned', () => {
  const app = read('assets/app.js');
  assert.match(app, /function clearLegacyPortalCodeFromUrl\(\)/);
  assert.match(app, /url\.searchParams\.delete\('code'\)/);
  assert.doesNotMatch(app, /searchParams\.set\('code'/);
  assert.doesNotMatch(app, /href=[^\n]*[?&]code=/);
  for (const file of ['student.html','parent.html','materials.html','theory-lectures.html','questions.html','exams.html','practical.html']) {
    assert.doesNotMatch(read(file), /href=[^>]*[?&]code=/, `${file} leaks a code in href`);
  }
});

test('service worker excludes every portal page and any query URL from cache writes', () => {
  const worker = read('service-worker.js');
  for (const route of ['/student.html','/parent.html','/materials.html','/questions.html','/exams.html','/practical.html','/teacher-login.html']) {
    assert.match(worker, new RegExp(route.replace('.', '\\.')));
  }
  assert.match(worker, /response\.ok && !url\.search && !SENSITIVE_NAVIGATION\.has\(url\.pathname\)/);
  assert.doesNotMatch(worker, /cache\.put\([^\n]*(?:student|parent|materials|questions|exams)\.html/);
});

test('mobile homework correction binds the tapped button and remains server confirmed', () => {
  const workflow = read('assets/v60-admin-workflow.js');
  const functions = read('functions/index.js');
  assert.match(workflow, /saveHomeworkCorrection\('\$\{safe\(row\.id\)\}',this\)/);
  assert.match(workflow, /activeButton\.setAttribute\('aria-busy','true'\)/);
  assert.match(workflow, /if\(!result\?\.ok\)throw new Error\('الخادم لم يؤكد حفظ التصحيح'\)/);
  assert.match(functions, /reviewerUid:staff\.uid/);
  assert.match(functions, /action:'تصحيح واجب'/);
});

test('homework correction updates only the affected card instead of rebuilding the full section', () => {
  const workflow = read('assets/v60-admin-workflow.js');
  const handler = workflow.slice(workflow.indexOf('window.saveHomeworkCorrection='), workflow.indexOf('function renderMaterialsV6061'));
  assert.match(handler, /await window\.MFCloud\.reviewHomeworkSubmission/);
  assert.match(handler, /activeCard\.replaceWith\(replacement\)/);
  assert.match(handler, /for\(const student of adminData\.students\|\|\[\]\)/);
  assert.doesNotMatch(handler, /renderMaterialsV6061\(\)/);
});

test('admin shows only the current homework submissions while preserving historical filtering', () => {
  const workflow = read('assets/v60-admin-workflow.js');
  const css = read('assets/site.css');
  assert.match(workflow, /const currentAssignment=assignments\.find/);
  assert.match(workflow, /currentSubmissions=currentAssignment\?submissions\.filter/);
  assert.match(workflow, /تسليمات الواجب الحالي/);
  assert.match(workflow, /السجلات السابقة محفوظة في فلتر المتابعة/);
  assert.match(workflow, /homeworkAttendanceAssignment/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
});

test('admin exam workspace hides student data until one isolated exam is opened', () => {
  const workflow = read('assets/v60-admin-workflow.js');
  assert.match(workflow, /tm-admin-open-exam/);
  assert.match(workflow, /openAdminExamDetails/);
  assert.match(workflow, /const currentAttempts=currentExam\?attempts\.filter/);
  assert.match(workflow, /افتح امتحانًا واحدًا لعرض بياناته وطلابه ومحاولاته فقط/);
  assert.match(workflow, /currentExam\?`<section class="admin-selected-exam"/);
  assert.doesNotMatch(workflow, /historicalAttempts/);
});
