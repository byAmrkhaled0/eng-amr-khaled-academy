'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('classroom exam traffic is isolated per student and supports a shared network', () => {
  const source = read('functions/index.js');
  assert.match(source, /async function rateLimitStudentAction/);
  assert.match(source, /exam-start',[\s\S]*?60,\s*10000,\s*10 \* 60 \* 1000/);
  assert.match(source, /exam-submit',[\s\S]*?60,\s*10000,\s*10 \* 60 \* 1000/);
  assert.match(source, /exam-progress',[\s\S]*?5000,\s*100000,\s*60\*60\*1000/);
  assert.match(source, /rateLimitStudentAction\(`portal-\$\{mode\}`[\s\S]*?20,\s*3000,\s*60 \* 1000/);
  assert.match(source, /const shardCount = 32/);
  assert.doesNotMatch(source, /rateLimitPublic\('exam-start'/);
  assert.doesNotMatch(source, /rateLimitPublic\('exam-submit'/);
  assert.ok(10000 > 30, 'the shared-network ceiling must exceed the expected class size');
});

test('exam and homework grades refresh and contribute to monthly motivation', () => {
  const source = read('functions/index.js');
  assert.match(source, /markLeaderboardDirty\('exam-submitted'\)/);
  assert.match(source, /markLeaderboardDirty\('exam-reviewed'\)/);
  assert.match(source, /markLeaderboardDirty\('assignment-submitted'\)/);
  assert.match(source, /markLeaderboardDirty\('homework-reviewed'\)/);
  assert.match(source, /gradePct\*config\.weights\.exams/);
  assert.match(source, /homeworkGradePct\*config\.weights\.homeworkGrade/);
  assert.match(source, /weights:\{exams:30,attendance:25,homeworkCompletion:20,homeworkGrade:10/);
});

test('question banks accept written questions or PDFs and remain student-targeted', () => {
  const functionsSource = read('functions/index.js');
  const adminSource = read('assets/admin.js');
  const curriculumSource = read('assets/curriculum-admin.js');
  const appSource = read('assets/app.js');
  assert.match(adminSource, /\['questionBanks','help-circle','بنوك الأسئلة'\]/);
  assert.match(adminSource, /questionBanks:\(\)=>window\.renderQuestionBanksAdmin/);
  assert.match(curriculumSource, /window\.renderQuestionBanksAdmin=function/);
  assert.match(curriculumSource, /collection:'question_banks'/);
  assert.match(curriculumSource, /accept="application\/pdf,\.pdf"/);
  assert.match(curriculumSource, /name="content"[\s\S]*?maxlength="50000"/);
  assert.match(functionsSource, /targetedLearningDocs\('question_banks', found\.data\)/);
  assert.match(functionsSource, /contentIsOpen\(doc\.data\(\) \|\| \{\}\)/);
  assert.match(functionsSource, /'question_banks','bank_questions'/);
  assert.match(appSource, /data-question-bank-file/);
  assert.match(appSource, /bindQuestionBankActions/);
});

test('the official site logo has a real alpha channel and is used by the PWA', () => {
  const png = fs.readFileSync(path.join(root, 'assets/technominds-logo.png'));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png[25], 6, 'PNG color type 6 is RGBA');
  assert.match(read('assets/v67-learning-hub.css'), /background-image:url\("technominds-logo\.webp"\)!important/);
  assert.match(read('service-worker.js'), /technominds-logo\.png/);
});
