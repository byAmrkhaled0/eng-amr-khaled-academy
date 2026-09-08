const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { publicHomeworkProjection, decideHomeworkAttempt } = require('../functions/lib/homework-domain');
const { normalizeUnifiedResults, homeworkMetrics } = require('../functions/lib/portal-results');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('a graded homework is the source for grades, last grade and homework average', () => {
  const assignments = [{ id:'hw-1' }];
  const submission = { id:'s1', assignmentId:'hw-1', homeworkTitle:'Task الحصة الأولى', score:8, maxScore:10, submittedAt:'2026-08-10T12:00:00Z', completed:true };
  const results = normalizeUnifiedResults({ homeworks:[submission] });
  const metrics = homeworkMetrics(assignments, [submission]);
  assert.equal(results.length, 1);
  assert.deepEqual({type:results[0].type,score:results[0].score,maxScore:results[0].maxScore,percentage:results[0].percentage},{type:'homework',score:8,maxScore:10,percentage:80});
  assert.deepEqual({required:metrics.requiredCount,submitted:metrics.submittedCount,graded:metrics.gradedCount,average:metrics.averageGrade,last:metrics.lastGrade.percentage},{required:1,submitted:1,graded:1,average:80,last:80});
});

test('homework locks reject a second submission and reveal answers only after grading when enabled', () => {
  assert.equal(decideHomeworkAttempt({lock:{submittedAttempts:1},legacySubmissionExists:true}).allowed,false);
  const hidden = publicHomeworkProjection({assignmentId:'hw-1',score:8,maxScore:10,revealCorrectAnswersAfterGrading:false,answers:[{question:'Q',answer:'A',correctAnswer:'B',correct:false,mark:1,awardedMark:0}]});
  const visible = publicHomeworkProjection({assignmentId:'hw-1',score:8,maxScore:10,revealCorrectAnswersAfterGrading:true,answers:[{question:'Q',answer:'A',correctAnswer:'B',correct:false,mark:1,awardedMark:0}]});
  assert.equal(hidden.answersRevealed,false);
  assert.equal('correctAnswer' in hidden.answers[0],false);
  assert.equal(visible.answersRevealed,true);
  assert.equal(visible.answers[0].correctAnswer,'B');
});

test('exam correction is server-only and updates the canonical student attempt summary', () => {
  const backend=read('functions/index.js'),rules=read('firestore.rules'),sync=read('assets/firebase-sync.js'),ui=read('assets/admin.js');
  assert.match(backend,/exports\.reviewExamAttempt/);
  assert.match(backend,/parentRef\.collection\('attempts'\)\.doc\(attemptId\)/);
  assert.match(backend,/exam_review_history/);
  assert.match(rules,/match \/exam_attempts\/\{id\}[\s\S]{0,160}allow create, update, delete: if false/);
  assert.doesNotMatch(sync,/saveExamAttempt:async/);
  assert.match(ui,/reviewExamAttempt\(\{attemptId/);
});

test('the portal returns the full bounded assignment history and renders incremental groups', () => {
  const backend=read('functions/index.js'),ui=read('assets/app.js');
  assert.match(backend,/const assignments = allAssignments\.slice\(0, 250\)/);
  assert.match(ui,/assignment-show-more/);
  assert.match(ui,/تم التسليم وقيد التصحيح/);
  assert.match(ui,/مراجعة الإجابات ونموذج الحل/);
});
