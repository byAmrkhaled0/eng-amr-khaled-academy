'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('portal compatibility follows the API schema instead of the deployment release', () => {
  const sync = read('assets/firebase-sync.js');

  assert.match(sync, /const FRONTEND_VERSION='70\.0\.1'/);
  assert.match(sync, /const API_SCHEMA_VERSION='portal-v64\.0\.0'/);
  assert.match(sync, /if\(!result\|\|result\.apiSchemaVersion!==API_SCHEMA_VERSION\)/);
  assert.doesNotMatch(sync, /result\.backendVersion!==FRONTEND_VERSION/);
  assert.match(sync, /publicCallable\('\/api\/portal\/student',payload,calls\.getPortalStudent,6500,0\)/);
  assert.match(sync, /timeoutError\.code='request-timeout'/);
  for (const route of ['/api/exams/dashboard', '/api/exams/start', '/api/exams/progress', '/api/exams/submit', '/api/parent/monthly-report']) {
    assert.equal(sync.includes(route), true, `missing same-origin client route: ${route}`);
  }
});

test('every secure portal page requests a fresh firebase sync bundle', () => {
  const pages = [
    'index.html',
    'student.html',
    'parent.html',
    'exams.html',
    'materials.html',
    'theory-lectures.html',
    'questions.html',
    'reviews.html',
    'teacher-login.html'
  ];

  for (const page of pages) {
    assert.match(read(page), /assets\/firebase-sync\.js\?v=70\.0\.1/, `${page} must bypass the stale sync bundle`);
  }
});

test('release and service-worker cache versions are synchronized', () => {
  const frontend = require(path.join(root, 'package.json'));
  const backend = require(path.join(root, 'functions/package.json'));
  const worker = read('service-worker.js');

  assert.equal(frontend.version, '70.0.1');
  assert.equal(backend.version, frontend.version);
  assert.match(worker, /technominds-v70-0-1-complete-report/);
  assert.match(worker, /ASSET_VERSION = "70\.0\.1"/);
});
