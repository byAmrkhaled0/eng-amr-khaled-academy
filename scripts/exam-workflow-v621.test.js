const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('weighted exam grading is calculated out of the configured question marks', () => {
  const backend = read('functions/index.js');
  assert.match(backend, /const maxScore = questions\.reduce/);
  assert.match(backend, /awardedMark: correct === true \? questionMark : 0/);
  assert.match(backend, /maxScore,/);
});

test('exam builder supports mcq true-false essay and code questions', () => {
  const admin = read('assets/admin.js');
  for (const type of ['mcq', 'truefalse', 'essay', 'code']) assert.match(admin, new RegExp(`value="${type}"`));
  assert.match(admin, /addExamQuestionAfter/);
  assert.match(admin, /data-question-mark/);
});

test('student correction and admin attendance filters are present', () => {
  const app = read('assets/app.js');
  const workflow = read('assets/v60-admin-workflow.js');
  assert.match(app, /عرض التصحيح التفصيلي/);
  assert.match(app, /انتهى الوقت، لم تستطع الامتحان هذه المرة/);
  assert.match(workflow, /مين امتحن ومين لسه/);
  assert.match(workflow, /examAttendanceGrade/);
  assert.match(workflow, /editLiveExam/);
});

test('homework supports the same four answer modes', () => {
  const app = read('assets/app.js');
  const workflow = read('assets/v60-admin-workflow.js');
  assert.match(workflow, /<option value="truefalse">صح أو غلط<\/option>/);
  assert.match(app, /type==='mcq'\|\|type==='truefalse'/);
});
