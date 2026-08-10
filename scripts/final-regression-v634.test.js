'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('parent report derives required and graded states from assignments plus submissions', () => {
  const app = read('assets/app.js');
  assert.match(app, /const assignmentRows=\(st\.assignments\|\|\[\]\)\.map/);
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
  for (const file of ['student.html','parent.html','materials.html','questions.html','exams.html','practical.html']) {
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
