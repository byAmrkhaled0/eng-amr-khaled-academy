'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const {
  ACADEMIC_GRADES,
  canonicalAcademicLabel,
  sameAcademicValue,
  learningTargetMatchesStudent
} = require('../functions/lib/academic-targeting');

test('the platform exposes only the four requested academic tracks', () => {
  const expected = ['أولى ثانوي بكالوريا', 'تانية ثانوي بكالوريا', 'أساسيات برمجة', 'مبتدئين برمجة'];
  assert.deepEqual(ACADEMIC_GRADES, expected);
  assert.match(read('assets/app.js'), /var GRADES = \['أولى ثانوي بكالوريا','تانية ثانوي بكالوريا','أساسيات برمجة','مبتدئين برمجة'\]/);
  const leaderboard = read('index.html').match(/<select id="leaderboardGrade">([\s\S]*?)<\/select>/)?.[1] || '';
  for (const grade of expected) assert.match(leaderboard, new RegExp(`<option>${grade}<\\/option>`));
  for (const removed of ['تانية ثانوي عام', 'أساسيات Python', 'تطبيقات ومراجعة']) assert.doesNotMatch(leaderboard, new RegExp(removed));
  const curriculum = read('assets/curriculum-admin.js');
  for (const grade of expected) assert.match(curriculum, new RegExp(grade));
});

test('legacy grade spellings resolve to the new tracks', () => {
  assert.equal(canonicalAcademicLabel('اولي ثانوي برمجه'), 'أولى ثانوي بكالوريا');
  assert.equal(canonicalAcademicLabel('ثانية ثانوي عام'), 'تانية ثانوي بكالوريا');
  assert.equal(canonicalAcademicLabel('أساسيات Python'), 'أساسيات برمجة');
  assert.equal(canonicalAcademicLabel('تطبيقات ومراجعة'), 'أساسيات برمجة');
  assert.equal(sameAcademicValue('تانيه ثانوي', 'تانية ثانوي بكالوريا'), true);
});

test('exam and homework targeting use the same normalized scope', () => {
  const student = { grade: 'ثانية ثانوي عام', group: 'مجموعة ١', term: 'الترم الأول', academicYear: '2026/2027' };
  assert.equal(learningTargetMatchesStudent({ grade: 'تانية ثانوي بكالوريا', group: 'مجموعة 1', term: 'الترم الأول', academicYear: '2026/2027' }, student), true);
  const backend = read('functions/index.js');
  const examMatcher = backend.slice(backend.indexOf('function examMatchesStudent'), backend.indexOf('function examIsOpen'));
  assert.match(examMatcher, /learningTargetMatchesStudent\(exam, student\)/);
  assert.match(backend, /studentRecords\(studentCode, found\.data\)/);
  assert.match(backend, /questionDocs\.filter\(visible\)\.filter\(doc => learningTargetMatchesStudent/);
});

test('mobile and admin entry pages keep responsive viewport and navigation coverage', () => {
  for (const file of ['index.html', 'student.html', 'exams.html', 'materials.html', 'questions.html', 'teacher-login.html']) {
    const html = read(file);
    assert.match(html, /name="viewport"/i, `${file} viewport`);
  }
  const css = read('assets/v61-design.css') + read('assets/v60-technominds.css');
  assert.match(css, /@media\s*\(\s*max-width:\s*(?:600|620|640|700|720|760|768)px\s*\)/);
  assert.match(read('teacher-login.html'), /id="adminRoot"/);
  assert.match(read('assets/admin.js'), /id="adminContent"/);
});

test('admin exam and homework forms prevent a grade/group targeting conflict', () => {
  const workflow = read('assets/v60-admin-workflow.js');
  const admin = read('assets/admin.js');
  assert.match(workflow, /const targetGroupOptions=/);
  assert.match(workflow, /data-grade=/);
  for (const formId of ['examFormV6061', 'materialFormV6061', 'assignmentFormV6061']) {
    assert.match(workflow, new RegExp(`bindAcademicTarget\\('${formId}'\\)`));
  }
  assert.match(workflow, /option\.hidden=!matches;option\.disabled=!matches/);
  assert.match(admin, /function adminTargetGroupOptions/);
  assert.match(admin, /bindAdminAcademicTarget\('addStudentForm'\)/);
});
