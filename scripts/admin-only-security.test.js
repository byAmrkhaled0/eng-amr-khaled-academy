const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('all server-side administrative authorization requires the verified Admin claim and profile', () => {
  const functions = read('functions/index.js');
  assert.match(functions, /token\?\.admin !== true/);
  assert.match(functions, /token\?\.email_verified !== true/);
  assert.match(functions, /profile\.role !== 'admin'/);
  assert.doesNotMatch(functions, /allowedRoles\.includes/);
});

test('Firestore and Storage resolve every legacy staff helper to the single Admin', () => {
  const firestore = read('firestore.rules');
  const storage = read('storage.rules');
  assert.match(firestore, /function isTeacher\(\) \{ return isAdmin\(\); \}/);
  assert.match(firestore, /function isAssistant\(\) \{ return false; \}/);
  assert.match(firestore, /request\.auth\.token\.admin == true/);
  assert.match(storage, /userData\(\)\.role == 'admin'/);
  assert.match(storage, /request\.auth\.token\.admin == true/);
  assert.doesNotMatch(storage, /role in \['admin', 'teacher'/);
});

test('the browser verifies fresh claims and observes token revocation', () => {
  const sync = read('assets/firebase-sync.js');
  const admin = read('assets/admin.js');
  assert.match(sync, /getIdTokenResult\(true\)/);
  assert.match(sync, /token\.claims\.admin===true/);
  assert.match(admin, /onIdTokenChanged/);
  assert.match(admin, /signOut/);
});
