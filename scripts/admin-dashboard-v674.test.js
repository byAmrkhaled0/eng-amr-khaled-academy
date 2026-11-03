'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the focused admin stylesheet is isolated and loaded last', () => {
  const html = read('teacher-login.html');
  const publicHtml = read('index.html');
  const oldLayer = html.indexOf('assets/v67-learning-hub.css');
  const adminLayer = html.indexOf('assets/v674-admin.css');

  assert.ok(oldLayer >= 0 && adminLayer > oldLayer);
  assert.doesNotMatch(publicHtml, /v674-admin\.css/);
  assert.match(read('service-worker.js'), /\/assets\/v674-admin\.css/);
});

test('dashboard shell adds context without removing commands or routes', () => {
  const admin = read('assets/admin.js');

  assert.match(admin, /const adminGroupIcons/);
  assert.match(admin, /function adminSectionIcon\(id\)/);
  assert.match(admin, /class="admin-staff-card"/);
  assert.match(admin, /id="adminDesktopSectionDescription"/);
  assert.match(admin, /class="admin-overview-hero admin-overview-hero-v69"/);
  assert.match(admin, /class="admin-glance-grid-v69"/);
  assert.match(admin, /class="admin-task-button primary-task"/);
  assert.match(admin, /id="adminAttentionButton"/);
  assert.match(admin, /onclick="forceFirestoreSync\(\)"/);
  assert.match(admin, /onclick="enableBookingNotifications\(\)"/);
  assert.match(read('assets/app.js'), /refreshCw:/);
  assert.match(read('assets/app.js'), /alertTriangle:/);
  assert.match(read('assets/app.js'), /settings:/);
});

test("admin design covers desktop, dark mode and mobile hierarchy",()=>{const css=read('assets/v674-admin.css'),shared=read('assets/v67-learning-hub.css');assert.match(css,/\.admin-page\{display:grid;grid-template-columns:200px minmax\(0,1fr\)/);assert.match(css,/width:min\(88vw,300px\)/);assert.match(css,/\.admin-command-more:not\(\[open\]\)>\.admin-command-actions\{display:none/);assert.match(css,/\.admin-mobile-bottom\{display:grid/);assert.match(shared,/html\[data-theme="dark"\]/);assert.match(css,/padding:12px 12px calc\(88px \+ env\(safe-area-inset-bottom,0px\)\)/);});

test('release metadata is synchronized at 70.0.11', () => {
  const frontend = require(path.join(root, 'package.json'));
  const backend = require(path.join(root, 'functions/package.json'));
  const worker = read('service-worker.js');

  assert.equal(frontend.version, '70.0.11');
  assert.equal(backend.version, '70.0.11');
  assert.match(read('assets/app.js'), /MF_ASSET_VERSION = '70\.0\.11'/);
  assert.match(worker, /technominds-v70-0-11-complete-report/);
  assert.match(worker, /ASSET_VERSION = "70\.0\.11"/);
});
