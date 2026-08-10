'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const {
  learningTargetMatchesStudent,
  academicAudienceKeysForStudent,
  academicAudienceKeysForItem
} = require('../functions/lib/academic-targeting');
const { scheduledTimeMillis } = require('../functions/lib/assignment-schedule');

test('immutable schedule ids keep content visible after a group rename', () => {
  const student = { grade: 'أولى ثانوي بكالوريا', group: 'الاسم الجديد', scheduleId: 'grp-17' };
  assert.equal(learningTargetMatchesStudent({ grade: student.grade, group: 'الاسم القديم', scheduleId: 'grp-17' }, student), true);
  assert.equal(learningTargetMatchesStudent({ grade: student.grade, group: 'الاسم الجديد', scheduleId: 'grp-18' }, student), false);
  assert.deepEqual(academicAudienceKeysForItem({ grade: student.grade, group: student.group, scheduleId: 'grp-17' }), ['schedule:grp-17']);
  assert(academicAudienceKeysForStudent(student).includes('schedule:grp-17'));
});

test('legacy datetime-local values are interpreted in Egypt time', () => {
  assert.equal(new Date(scheduledTimeMillis('2026-08-10T11:00')).toISOString(), '2026-08-10T08:00:00.000Z');
  assert.equal(new Date(scheduledTimeMillis('2026-01-10T11:00')).toISOString(), '2026-01-10T09:00:00.000Z');
  assert.equal(scheduledTimeMillis('2026-08-10T08:00:00.000Z'), Date.parse('2026-08-10T08:00:00.000Z'));
});

test('exam, homework and resource saves update one document and lock targeting', () => {
  const workflow = read('assets/v60-admin-workflow.js');
  const sync = read('assets/firebase-sync.js');
  assert.doesNotMatch(workflow, /saveAdminDataNow\(/);
  for (const collection of ['exams', 'assignments', 'materials', 'questions']) {
    assert.match(workflow, new RegExp(`saveContent\\('${collection}'`));
  }
  assert.match(sync, /saveContent:saveContentDocument/);
  assert.match(workflow, /scheduleId:selectedScheduleId\(form\)/);
  assert.match(workflow, /correctRaw===''\?null:Number\(correctRaw\)/);
  assert.match(workflow, /name="id"/);
  assert.match(workflow, /حفظ كل التعديلات/);
});

test('student delivery uses targeted queries instead of capped full scans', () => {
  const backend = read('functions/index.js');
  assert.match(backend, /function targetedLearningDocs/);
  assert.match(backend, /where\('audienceKeys', 'array-contains-any', keys\)/);
  assert.match(backend, /targetedLearningDocs\('assignments', student\)/);
  assert.match(backend, /targetedLearningDocs\('exams', found\.data\)/);
  assert.match(backend, /exports\.upsertGroupSchedule/);
  assert.match(backend, /learningTargetMatchesStudent\(lecture, student\)/);
});

test('refresh, admin curriculum and requested visual fixes are part of the release', () => {
  const app = read('assets/app.js');
  const worker = read('service-worker.js');
  const login = read('teacher-login.html');
  const css = read('assets/v61-design.css');
  assert.match(app, /MF_ASSET_VERSION = '63\.0\.3'/);
  assert.match(app, /loadStudentForPortal\(code,\{force:true\}\)/);
  assert.match(worker, /technominds-v63-0-2-production-fixed/);
  const assetFetch = worker.slice(worker.indexOf('if(url.pathname.startsWith("/assets/")'));
  assert.doesNotMatch(assetFetch, /ignoreSearch:true/);
  assert.match(login, /assets\/curriculum-admin\.js\?v=63\.0\.3/);
  assert.doesNotMatch(login, /استخدم البريد الموجود في قائمة Firebase Authentication/);
  assert.match(css, /\.homework-question-card[\s\S]{0,500}var\(--surface-2\)/);
  const indexes = JSON.parse(read('firestore.indexes.json')).indexes;
  for (const collection of ['assignments', 'exams', 'materials', 'questions']) assert(indexes.some(index => index.collectionGroup === collection));
});
