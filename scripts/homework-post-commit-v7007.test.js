'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domain = require('../functions/lib/homework-domain');
const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
const callable = source.slice(source.indexOf('exports.submitAssignmentAnswer ='), source.indexOf('exports.reviewHomeworkSubmission ='));
assert.ok(callable.startsWith('exports.submitAssignmentAnswer ='));
const plain = value => JSON.parse(JSON.stringify(value));

function fixture({ realInvalidations = false } = {}) {
  const docs = new Map([['assignments/a', { title: 'Fixture', type: 'mcq', choices: ['yes', 'no'], correctIndex: 0, totalScore: 2 }]]);
  const writes = [], logs = [], calls = [];
  let queue = Promise.resolve(), transactionFailure = null;
  const failedWrites = new Set();
  const failure = code => Object.assign(new Error('fixture failure'), { code });
  const merge = (old, data) => Object.fromEntries(Object.entries({ ...old, ...data }).map(([key, value]) => [key, value?.increment ? Number(old?.[key] || 0) + value.increment : value]));
  const snap = ref => ({ id: ref.id, exists: docs.has(ref.path), data: () => docs.get(ref.path) });
  const ref = name => ({
    path: name, id: name.split('/').at(-1), get: async () => snap(ref(name)),
    set: async (data, options) => {
      calls.push(name);
      if (failedWrites.has(name)) throw failure('unavailable');
      docs.set(name, options?.merge ? merge(docs.get(name), data) : data);
      writes.push(name);
    }
  });
  const db = {
    collection: name => ({ doc: id => ref(`${name}/${id}`) }),
    runTransaction: fn => {
      const operation = queue.then(async () => {
        const pending = []; let wrote = false;
        const tx = {
          get: async target => { assert.equal(wrote, false, 'transaction reads precede writes'); return snap(target); },
          create: (target, data) => { wrote = true; assert.equal(docs.has(target.path), false); pending.push([target, data, false]); },
          set: (target, data, options) => { wrote = true; pending.push([target, data, options?.merge]); },
          update: (target, data) => { wrote = true; assert.ok(docs.has(target.path)); pending.push([target, data, true]); }
        };
        const result = await fn(tx);
        if (transactionFailure) throw transactionFailure;
        for (const [target, data, shouldMerge] of pending) {
          docs.set(target.path, shouldMerge ? merge(docs.get(target.path), data) : data);
          writes.push(target.path);
        }
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    }
  };
  const ctx = {
    exports: {}, onCall: (_, handler) => handler, CALLABLE_OPTIONS: {}, db,
    HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
    text: (value, length) => String(value || '').slice(0, length), normalizeCode: value => String(value || '').toUpperCase(), cleanDocId: String,
    validLegacyOrStrongCode: value => value === '12345678',
    requirePortalSession: async (_, code, roles) => { assert.equal(code, '12345678'); assert.deepEqual(plain(roles), ['student']); },
    rateLimitPublic: async () => {}, getStudentPortalByCode: async () => ({ data: { name: 'Synthetic student', grade: 'Fixture grade' } }),
    requireApprovedStudent: () => {}, assignmentIsReleased: () => true, learningTargetMatchesStudent: () => true,
    contentAvailableAfterStudentJoined: () => true, assignmentDueDatePassed: () => false,
    cairoDateKey: () => '2026-10-09', jsonByteSize: value => Buffer.byteLength(JSON.stringify(value)),
    FieldValue: { serverTimestamp: () => 'server-time', increment: value => ({ increment: value }) },
    ...domain, console: { warn: (...args) => logs.push(plain(args)) },
    markLeaderboardDirty: async () => { calls.push('leaderboard'); },
    markStudentMonthlyReportDirty: async () => { calls.push('monthly-report'); }
  };
  vm.createContext(ctx);
  if (realInvalidations) vm.runInContext(source.slice(source.indexOf('const leaderboardStateRef ='), source.indexOf('function cairoDateKey(')), ctx);
  vm.runInContext(callable, ctx);
  return {
    ctx, docs, logs, writes, calls, failedWrites, failure,
    failTransaction: () => { transactionFailure = failure('aborted'); return transactionFailure; },
    submit: (data = {}) => ctx.exports.submitAssignmentAnswer({ data: { studentCode: '12345678', assignmentId: 'a', selectedOption: 0, ...data } }),
    records: () => [...docs.keys()].filter(key => key.startsWith('homework_submissions/'))
  };
}

test('successful commit returns the real canonical projection and unchanged grade', async () => {
  const f = fixture(); const result = plain(await f.submit());
  assert.equal(result.ok, true); assert.equal(result.duplicate, false); assert.equal(result.score, 2); assert.equal(result.attemptNumber, 1);
  assert.deepEqual(result.submission, plain(domain.publicHomeworkProjection(f.docs.get(`homework_submissions/${result.submissionId}`))));
  assert.deepEqual(f.calls, ['leaderboard', 'monthly-report']); assert.equal(f.logs.length, 0);
  assert.equal(f.records().length, 1); assert.equal(f.writes.length, 2);
});

test('failed transaction propagates the original failure and invokes no invalidations', async () => {
  const f = fixture(); const error = f.failTransaction();
  await assert.rejects(f.submit(), actual => actual === error);
  assert.equal(f.records().length, 0); assert.equal(f.writes.length, 0); assert.equal(f.calls.length, 0); assert.equal(f.logs.length, 0);
});

for (const synchronous of [false, true]) for (const dependencies of [['leaderboard'], ['monthly-report'], ['leaderboard', 'monthly-report']]) {
  test(`committed success survives ${synchronous ? 'sync throw' : 'rejection'}: ${dependencies.join(' + ')}; retry is write-free`, async () => {
    const f = fixture();
    for (const dependency of dependencies) f.ctx[dependency === 'leaderboard' ? 'markLeaderboardDirty' : 'markStudentMonthlyReportDirty'] = () => {
      f.calls.push(dependency); const error = f.failure('unavailable');
      if (synchronous) throw error;
      return Promise.reject(error);
    };
    const result = plain(await f.submit());
    assert.equal(result.ok, true); assert.equal(result.score, 2); assert.equal(f.records().length, 1);
    assert.deepEqual(f.calls, ['leaderboard', 'monthly-report']);
    assert.deepEqual(f.logs.map(row => row[1].dependency), dependencies);
    for (const [label, details] of f.logs) {
      assert.equal(label, 'homework-submit-post-commit-failed');
      assert.deepEqual(details, { stage: 'post-commit', dependency: details.dependency, code: 'unavailable', committed: true });
    }
    const before = plain(f.writes); const retry = plain(await f.submit({ selectedOption: 1 }));
    assert.deepEqual(retry, { ...result, duplicate: true });
    assert.deepEqual(f.writes, before); assert.equal(f.records().length, 1); assert.equal(f.calls.length, 2);
    assert.equal(f.docs.get(`homework_submission_locks/${result.submissionId}`).submittedAttempts, 1);
  });
}

test('awaits both outcomes even when one rejects before the other settles', async () => {
  const f = fixture(); let release, finished = false;
  f.ctx.markLeaderboardDirty = async () => { throw f.failure('unavailable'); };
  f.ctx.markStudentMonthlyReportDirty = () => new Promise(resolve => { release = resolve; });
  const pending = f.submit().then(result => { finished = true; return result; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(finished, false); assert.equal(f.records().length, 1);
  release(); assert.equal((await pending).ok, true); assert.equal(f.logs.length, 1);
});

for (const dependencies of [['_system/leaderboard'], ['monthly_reports/12345678_2026-10'], ['_system/leaderboard', 'monthly_reports/12345678_2026-10']]) {
  test(`real invalidation helpers preserve their caught-write diagnostics: ${dependencies.join(' + ')}`, async () => {
    const f = fixture({ realInvalidations: true }); dependencies.forEach(name => f.failedWrites.add(name));
    const result = await f.submit(); assert.equal(result.ok, true); assert.equal(f.records().length, 1);
    assert.equal(f.logs.length, dependencies.length);
    assert.equal(f.logs.some(row => row[0] === 'homework-submit-post-commit-failed'), false, 'helpers already handle ordinary Firestore failures');
    assert.equal(f.calls.length, 2); const count = f.writes.length;
    assert.equal((await f.submit()).submissionId, result.submissionId); assert.equal(f.writes.length, count); assert.equal(f.calls.length, 2);
  });
}

test('two concurrent submissions commit one record, one lock count and one invalidation pair', async () => {
  const f = fixture(); const results = await Promise.all([f.submit(), f.submit()]);
  assert.equal(results[0].submissionId, results[1].submissionId);
  assert.equal(results.filter(result => result.duplicate).length, 1);
  assert.equal(f.records().length, 1); assert.equal(f.writes.length, 2); assert.deepEqual(f.calls, ['leaderboard', 'monthly-report']);
});

test('teacher-granted retake preserves first attempt and consumes the existing grant once', async () => {
  const f = fixture(); const first = await f.submit(); const firstRecord = plain(f.docs.get(`homework_submissions/${first.submissionId}`));
  const grantId = `${first.submissionId}_2`;
  f.docs.set(`homework_attempt_grants/${grantId}`, { status: 'open', attemptNumber: 2 });
  const second = await f.submit({ selectedOption: 1 }); assert.equal(second.attemptNumber, 2); assert.equal(second.score, 0);
  assert.notEqual(second.submissionId, first.submissionId); assert.equal(f.records().length, 2);
  assert.deepEqual(plain(f.docs.get(`homework_submissions/${first.submissionId}`)), firstRecord);
  assert.equal(f.docs.get(`homework_attempt_grants/${grantId}`).status, 'used');
  const count = f.writes.length; const retry = await f.submit(); assert.equal(retry.submissionId, second.submissionId); assert.equal(f.writes.length, count);
});

test('manual-review result remains pending with no invented grade', async () => {
  const f = fixture(); f.docs.set('assignments/a', { type: 'text', title: 'Fixture', totalScore: 2 });
  const result = await f.submit({ answer: 'Synthetic answer' }); assert.equal(result.score, null); assert.equal(result.needsManualReview, true);
  assert.equal(result.submission.answersRevealed, false);
});

for (const gate of ['requirePortalSession', 'requireApprovedStudent', 'learningTargetMatchesStudent', 'assignmentIsReleased', 'contentAvailableAfterStudentJoined', 'rateLimitPublic']) {
  test(`authorization/availability guard remains enforced: ${gate}`, async () => {
    const f = fixture(); const denial = f.failure('permission-denied');
    f.ctx[gate] = gate.startsWith('require') || gate === 'rateLimitPublic' ? () => { throw denial; } : () => false;
    await assert.rejects(f.submit(), error => error.code === 'permission-denied');
    assert.equal(f.records().length, 0); assert.equal(f.writes.length, 0); assert.equal(f.calls.length, 0);
  });
}

test('expired first attempt remains rejected before any write', async () => {
  const f = fixture(); f.ctx.assignmentDueDatePassed = () => true;
  await assert.rejects(f.submit(), error => error.code === 'deadline-exceeded'); assert.equal(f.writes.length, 0);
});

test('existing report source trigger and bounded live leaderboard cache remain available', () => {
  assert.match(source, /REPORT_STUDENT_SOURCES=\[[^\]]*'homework_submissions'/);
  assert.match(source, /sourceRevision===sourceRevision/); // report cache checks persisted source revision
  assert.match(source, /expiresAt:Date\.now\(\)\+5\*60\*1000/);
});

test('existing homework source trigger advances report revision after direct invalidation fails', async () => {
  const f = fixture({ realInvalidations: true });
  f.failedWrites.add('monthly_reports/12345678_2026-10');
  const result = await f.submit(); assert.equal(result.ok, true);
  f.ctx.onDocumentWritten = (_, handler) => handler;
  vm.runInContext(source.slice(source.indexOf('const REPORT_STUDENT_SOURCES='), source.indexOf("for(const collection of ['assignments','exams','class_sessions','materials','groups'])")), f.ctx);
  const row = f.docs.get(`homework_submissions/${result.submissionId}`);
  await f.ctx.exports.invalidateReport_homework_submissions({ data: { before: { data: () => undefined }, after: { data: () => row } }, params: { id: result.submissionId } });
  assert.equal(f.docs.get('monthly_report_state/12345678').version, 1);
  assert.equal(f.records().length, 1);
});
