'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  decideHomeworkAttempt,
  publicHomeworkProjection,
  homeworkLockId,
  submissionIdForAttempt
} = require('../functions/lib/homework-domain');
const {
  scorePercent,
  normalizeUnifiedResults,
  homeworkMetrics,
  configurableOverallAverage
} = require('../functions/lib/portal-results');
const { attendanceDayDecision } = require('../functions/lib/attendance-domain');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

class AtomicHomeworkStore {
  constructor() { this.locks = new Map(); this.submissions = new Map(); this.grants = new Map(); this.queue = Promise.resolve(); }
  submit(assignmentId, studentCode) {
    const operation = this.queue.then(() => {
      const lockId = homeworkLockId(assignmentId, studentCode);
      const lock = this.locks.get(lockId) || null;
      const next = Number(lock?.submittedAttempts || 0) + 1;
      const grant = this.grants.get(`${lockId}_${next}`) || null;
      const decision = decideHomeworkAttempt({ lock, legacySubmissionExists: this.submissions.has(lockId), grant });
      if (!decision.allowed) throw Object.assign(new Error('already-submitted'), { code: 'already-exists' });
      const id = submissionIdForAttempt(lockId, decision.attemptNumber);
      assert.equal(this.submissions.has(id), false);
      this.submissions.set(id, { assignmentId, studentCode, attemptNumber: decision.attemptNumber });
      this.locks.set(lockId, { submittedAttempts: decision.attemptNumber });
      if (grant) grant.status = 'used';
      return this.submissions.get(id);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  grant(assignmentId, studentCode, reason) {
    assert.ok(reason.length >= 3);
    const lockId = homeworkLockId(assignmentId, studentCode);
    const attemptNumber = Number(this.locks.get(lockId)?.submittedAttempts || 0) + 1;
    this.grants.set(`${lockId}_${attemptNumber}`, { id: `${lockId}_${attemptNumber}`, attemptNumber, status: 'open', reason });
  }
}

test('first homework submission succeeds and a second submission is rejected', async () => {
  const store = new AtomicHomeworkStore();
  assert.equal((await store.submit('hw-1', 'STUDENT1')).attemptNumber, 1);
  await assert.rejects(store.submit('hw-1', 'STUDENT1'), error => error.code === 'already-exists');
  assert.equal(store.submissions.size, 1);
});

test('two simultaneous tabs atomically create one immutable attempt', async () => {
  const store = new AtomicHomeworkStore();
  const results = await Promise.allSettled([store.submit('hw-2', 'STUDENT2'), store.submit('hw-2', 'STUDENT2')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(store.submissions.size, 1);
});

test('a teacher grant opens exactly one additional attempt', async () => {
  const store = new AtomicHomeworkStore();
  await store.submit('hw-3', 'STUDENT3');
  store.grant('hw-3', 'STUDENT3', 'غياب بعذر');
  assert.equal((await store.submit('hw-3', 'STUDENT3')).attemptNumber, 2);
  await assert.rejects(store.submit('hw-3', 'STUDENT3'));
  assert.equal(store.submissions.size, 2);
});

test('public homework response never leaks correction data before teacher opt-in and close', () => {
  const source = { assignmentId:'hw',score:8,maxScore:10,revealCorrectAnswersAfterClose:false,answers:[{question:'q',answer:'a',correctAnswer:'secret',correct:true,awardedMark:1}] };
  const projected = publicHomeworkProjection(source, Date.now());
  assert.equal(JSON.stringify(projected).includes('secret'), false);
  assert.equal(projected.answers[0].correct, null);
  assert.equal(projected.answers[0].awardedMark, null);
  const revealed = publicHomeworkProjection({ ...source, revealCorrectAnswersAfterClose:true, dueDate:'2026-08-01' }, Date.parse('2026-08-03T12:00:00Z'));
  assert.equal(revealed.answers[0].correctAnswer, 'secret');
  assert.equal(revealed.answersRevealed, true);
});

test('8 out of 10 is displayed as 80 percent and unified results deduplicate sources', () => {
  assert.equal(scorePercent(8, 10), 80);
  const results = normalizeUnifiedResults({
    grades:[{examId:'exam-1',title:'اختبار',score:8,maxScore:10,date:'2026-08-01'}],
    examAttempts:[{examId:'exam-1',examTitle:'اختبار',score:8,maxScore:10,submittedAt:'2026-08-01'}]
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].percentage, 80);
  assert.equal(results[0].source, 'examAttempts');
});

test('homework compliance uses required assignment ids, not attendance days', () => {
  const assignments = [{id:'a'},{id:'b'},{id:'c'}];
  const submissions = [
    {assignmentId:'a',submittedAt:'2026-08-01',score:8,maxScore:10},
    {assignmentId:'b',submittedAt:'2026-08-01',score:5,maxScore:10},
    {assignmentId:'outside',submittedAt:'2026-08-01',score:10,maxScore:10}
  ];
  const metrics = homeworkMetrics(assignments, submissions);
  assert.equal(metrics.requiredCount, 3);
  assert.equal(metrics.submittedCount, 2);
  assert.equal(metrics.submissionPercentage, 66.67);
  assert.equal(metrics.averageGrade, 65);
});

test('overall result weights are configurable', () => {
  const results = [
    {type:'exam',status:'graded',percentage:100},
    {type:'homework',status:'graded',percentage:50}
  ];
  assert.equal(configurableOverallAverage(results,{exam:50,homework:50}).percentage,75);
  assert.equal(configurableOverallAverage(results,{exam:80,homework:20}).percentage,90);
});

test('one-day groups are valid in Africa/Cairo attendance logic', () => {
  const monday = attendanceDayDecision('الاثنين', '2026-08-10');
  assert.equal(monday.allowed, true);
  assert.deepEqual(monday.days, ['الاثنين']);
  assert.equal(attendanceDayDecision('الثلاثاء', '2026-08-10').allowed, false);
});

test('student UI locks the form and has no resubmission action', () => {
  const app = read('assets/app.js');
  assert.match(app, /assignment-locked/);
  assert.doesNotMatch(app, /button\.innerHTML=.*إعادة التسليم/);
  assert.match(app, /تم تسليم الواجب بنجاح/);
});

test('server preserves homework grades from student writes and keeps review history', () => {
  const functions = read('functions/index.js');
  assert.match(functions, /tx\.create\(submissionRef/);
  assert.match(functions, /homework_review_history/);
  assert.match(functions, /تم تسليم الواجب بالفعل ولا يمكن استبدال الإجابة أو الدرجة/);
});

test('security rules close student data, attendance and operational collections', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/attendance\/\{id\} \{ allow read: if isStaff\(\); allow write: if false; \}/);
  for (const collection of ['_portal_sessions','homework_submission_locks','homework_attempt_grants']) {
    assert.match(rules, new RegExp(`match /${collection.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
  }
  assert.match(rules, /affectedKeys\(\)\.hasOnly/);
});

test('exam add/edit state resets ids and content updates are versioned', () => {
  const ui = read('assets/v60-admin-workflow.js');
  const functions = read('functions/index.js');
  assert.match(ui, /resetExamCreatorMode/);
  assert.match(ui, /form\.elements\.id\.value=''/);
  assert.match(ui, /وضع التعديل/);
  assert.match(functions, /assessment_versions/);
  assert.match(functions, /questionsSnapshot/);
});

test('pagination is ordered, bounded and content deletion is archival', () => {
  const functions = read('functions/index.js');
  assert.match(functions, /exports\.getAdminCollectionPage/);
  assert.match(functions, /orderBy\(orderField, 'desc'\)\.orderBy\(admin\.firestore\.FieldPath\.documentId\(\), 'desc'\)/);
  assert.match(functions, /startAfter\(cursor\.orderValue, cursor\.id\)/);
  assert.match(functions, /query\.limit\(pageSize\)/);
  assert.match(functions, /exports\.archiveContentItem/);
  assert.match(functions, /lifecycleStatus: 'archived'/);
});

test('service worker never caches portal URLs carrying access codes', () => {
  const worker = read('service-worker.js');
  assert.match(worker, /if\(response\.ok && !url\.search\)/);
  assert.doesNotMatch(worker, /cache\.put\(request,response\.clone\(\)\).*mode===\"navigate\"/s);
});
