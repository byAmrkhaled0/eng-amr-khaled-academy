'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const {
  normalizeStudentName,
  studentNameKey,
  phoneMatchesStudent,
  studentRecordIsRejected
} = require('../functions/lib/student-identity');

test('Arabic student names are normalized consistently', () => {
  assert.equal(normalizeStudentName('  أَحْمــد   مُحَمَّد '), 'احمد محمد');
  assert.equal(studentNameKey('على إبراهيم'), studentNameKey('علي ابراهيم'));
});

test('existing code recovery requires a saved phone match', () => {
  const student = { studentPhone: '٠١٠١٢٣٤٥٦٧٨', parentPhone: '01123456789' };
  assert.equal(phoneMatchesStudent(student, '01012345678', ''), true);
  assert.equal(phoneMatchesStudent(student, '', '01123456789'), true);
  assert.equal(phoneMatchesStudent(student, '01200000000', '01500000000'), false);
  assert.equal(studentRecordIsRejected({ approvalStatus: 'تم رفض الحجز' }), true);
});

test('booking is deduplicated atomically and returns the existing code', () => {
  const backend = read('functions/index.js');
  const app = read('assets/app.js');
  const rules = read('firestore.rules');
  assert.match(backend, /registeredStudentForName\(name, nameKey, (?:body\.studentPhone|studentPhone), parentPhone\)/);
  assert.match(backend, /batch\.create\(nameRegistryRef/);
  assert.match(backend, /phoneMatchesStudent\(record, studentPhone, parentPhone\)/);
  assert.match(backend, /alreadyExists: true/);
  assert.match(app, /الطالب موجود بالفعل — تم استرجاع الكود المسجل/);
  assert.match(app, /existing-student-pass/);
  assert.match(rules, /match \/_student_names\/\{nameHash\}/);
  assert.match(rules, /allow read, write: if false/);
});

test('homework correction is server-only and cannot bypass audit rules', () => {
  const sync = read('assets/firebase-sync.js');
  const workflow = read('assets/v60-admin-workflow.js');
  const rules = read('firestore.rules');
  const backend = read('functions/index.js');
  assert.doesNotMatch(sync, /reviewHomeworkSubmissionDirect/);
  assert.match(sync, /calls\.reviewHomeworkSubmission/);
  assert.match(rules, /match \/homework_submissions\/\{id\}[\s\S]*?allow update: if false/);
  assert.match(backend, /db\.runTransaction/);
  assert.match(backend, /homework_review_history/);
  assert.match(backend, /oldGrade,oldMaxScore,newGrade:score,newMaxScore:maxScore/);
  assert.match(workflow, /جارٍ حفظ التصحيح/);
  assert.match(workflow, /activeButton\.disabled=true/);
  assert.match(workflow, /Number\.isFinite\(value\)/);
});

test('duplicate recovery and homework correction are touch friendly', () => {
  const css = read('assets/v61-design.css');
  assert.match(css, /@media\(max-width:1024px\)/);
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /\.booking-form-compact input[\s\S]{0,180}font-size:16px/);
  assert.match(css, /\.homework-admin-answer-list input\[type="number"\][\s\S]{0,120}min-height:48px/);
  assert.match(css, /\.compact-portal-links[\s\S]{0,300}grid-template-columns:1fr/);
});
