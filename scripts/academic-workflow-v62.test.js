'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { scheduleMatchesStudent, learningTargetMatchesStudent } = require('../functions/lib/academic-targeting');
const { assignmentIsReleased, assignmentDueDatePassed } = require('../functions/lib/assignment-schedule');

test('scheduled homework remains hidden until its release time', () => {
  const now = Date.parse('2026-07-30T10:00:00.000Z');
  assert.equal(assignmentIsReleased({ active: true, publishAt: '2026-07-30T10:00:01.000Z' }, now), false);
  assert.equal(assignmentIsReleased({ active: true, publishAt: '2026-07-30T10:00:00.000Z' }, now), true);
  assert.equal(assignmentIsReleased({ active: false }, now), false);
  assert.equal(assignmentDueDatePassed({ dueDate: '2026-07-30' }, '2026-07-31'), true);
});

test('groups and learning content match the same normalized academic scope', () => {
  const student = { grade: 'أولى ثانوي برمجة', group: 'مجموعة ١', term: 'الترم الأول', academicYear: '2026/2027' };
  assert.equal(scheduleMatchesStudent({ active: true, grade: 'اولي ثانوي برمجة', term: 'الترم الأول', academicYear: '2026/2027' }, student), true);
  assert.equal(scheduleMatchesStudent({ active: true, grade: 'ثانية ثانوي' }, student), false);
  assert.equal(learningTargetMatchesStudent({ grade: 'أولى ثانوي برمجة', group: 'مجموعة 1', term: 'الترم الأول' }, student), true);
});

test('student and admin bundles contain the complete transfer and warning workflow', () => {
  const app = read('assets/app.js');
  const admin = read('assets/admin.js');
  const sync = read('assets/firebase-sync.js');
  const functions = read('functions/index.js');
  assert.match(app, /data-student-tab="transfer"/);
  assert.match(app, /bindStudentTransferForms/);
  assert.match(admin, /function renderWarnings/);
  assert.match(admin, /function renderStudentRequests/);
  assert.match(sync, /createStudentTransferRequest:callable/);
  assert.match(functions, /exports\.createStudentTransferRequest/);
  assert.match(functions, /exports\.reviewStudentTransferRequest/);
});
