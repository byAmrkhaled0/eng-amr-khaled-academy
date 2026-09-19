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
  assert.match(admin, /class="admin-overview-hero"/);
  assert.match(admin, /class="admin-metric-grid admin-action-kpis"/);
  assert.match(admin, /class="admin-task-button primary-task"/);
  assert.match(admin, /onclick="forceFirestoreSync\(\)"/);
  assert.match(admin, /onclick="enableBookingNotifications\(\)"/);
  assert.match(read('assets/app.js'), /refreshCw:/);
  assert.match(read('assets/app.js'), /alertTriangle:/);
  assert.match(read('assets/app.js'), /settings:/);
});

test('admin design covers desktop, dark mode and mobile hierarchy', () => {
  const css = read('assets/v674-admin.css');

  assert.match(css, /V67\.5 — simplified administration with progressive disclosure/);
  assert.match(css, /\.admin-page-v37\{display:grid!important;grid-template-columns:280px/);
  assert.match(css, /\.admin-nav-copy em\{display:none!important\}/);
  assert.match(css, /\.admin-overview-layout\{display:grid;grid-template-columns:/);
  assert.match(css, /html\[data-theme="dark"\] body\.admin-dashboard-active/);
  assert.match(css, /@media\(max-width:980px\)/);
  assert.match(css, /width:min\(88vw,326px\)/);
  assert.match(css, /@media\(max-width:390px\)/);
});

test('release metadata is synchronized at 67.8.8', () => {
  const frontend = require(path.join(root, 'package.json'));
  const backend = require(path.join(root, 'functions/package.json'));
  const worker = read('service-worker.js');

  assert.equal(frontend.version, '67.8.8');
  assert.equal(backend.version, frontend.version);
  assert.match(read('assets/app.js'), /MF_ASSET_VERSION = '67\.8\.8'/);
  assert.match(worker, /technominds-v67-8-8-admin-session/);
  assert.match(worker, /ASSET_VERSION = "67\.8\.8"/);
});
