'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Missing start marker: ${start}`);
  assert.notEqual(to, -1, `Missing end marker: ${end}`);
  return source.slice(from, to);
}

test('staff profile checks reuse the verified Firebase token without a forced refresh', () => {
  const sync = read('assets/firebase-sync.js');
  assert.match(sync, /getIdTokenResult\(false\)/);
  assert.doesNotMatch(sync, /getIdTokenResult\(true\)/);
  assert.match(sync, /token\.claims\.admin===true/);
  assert.match(sync, /token\.claims\.email_verified===true/);
});

test('temporary token refresh failures keep the verified workspace open', () => {
  const entry = read('assets/admin-entry.js');
  assert.match(entry, /auth\.onIdTokenChanged/);
  assert.match(entry, /permission-denied\|unauthenticated/);
  assert.match(entry, /تعذر تحديث جلسة الإدارة مؤقتًا/);
  assert.match(entry, /if\(document\.querySelector\('\.admin-page'\)\)location\.reload\(\)/);
});

test('opening exam details and edit mode remain local UI actions', () => {
  const workflow = read('assets/v60-admin-workflow.js');
  const openDetails = sliceBetween(workflow, 'window.openAdminExamDetails=function(id)', 'function resetExamCreatorMode()');
  const editExam = sliceBetween(workflow, 'window.editLiveExam=function(id)', 'function assignmentTypeFields()');
  for (const action of [openDetails, editExam]) {
    assert.doesNotMatch(action, /\bfetch\s*\(/);
    assert.doesNotMatch(action, /MFCloud/);
    assert.doesNotMatch(action, /signOut|location\.(?:assign|replace)|location\.href/);
  }
  assert.match(openDetails, /renderExamsV6061\(\)/);
  assert.match(editExam, /toggleExamCreator\(true,true\)/);
});

test('the login observer cannot race explicit sign-in or duplicate bundle loading', () => {
  const entry = read('assets/admin-entry.js');
  assert.match(entry, /if\(signingIn\|\|user\.uid===suppressedUid\)return/);
  assert.match(entry, /if\(bundlePromise\)return bundlePromise/);
});
