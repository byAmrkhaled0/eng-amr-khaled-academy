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

test('a temporary session refresh failure keeps the current admin workspace open', () => {
  const admin = read('assets/admin.js');
  const restore = sliceBetween(admin, 'async function tryRestoreSession()', 'async function tryOfflineStaffWorkspace()');
  assert.match(restore, /sessionRejected/);
  assert.match(restore, /if\(sessionRejected\)\{await window\.MFCloud\.signOut/);
  assert.match(restore, /تعذر تحديث جلسة الإدارة مؤقتًا/);
  assert.doesNotMatch(restore, /catch\(e\)\{await window\.MFCloud\.signOut/);
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

test('the token observer cannot race the explicit sign-in profile check', () => {
  const admin = read('assets/admin.js');
  assert.match(admin, /let adminLoginInProgress = false/);
  assert.match(admin, /if\(adminLoginInProgress\)return/);
  assert.match(admin, /finally\{adminLoginInProgress=false;\}/);
});
