'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const expectedSections = [
  'overview','operations','students','motivation','schedules','attendance',
  'materials','theoryLectures','assignments','exams','payments','bookings',
  'studentRequests','warnings','curriculum','reviews','backup','settings'
];

test('admin redesign keeps every existing section and assigns each to one group', () => {
  const admin = read('assets/admin.js');
  const definitions = admin.slice(admin.indexOf('const adminSections'), admin.indexOf('const adminSectionGroups'));
  const descriptions = admin.slice(admin.indexOf('const adminSectionDescriptions'), admin.indexOf('const adminSectionGroups'));
  const groups = admin.slice(admin.indexOf('const adminSectionGroups'), admin.indexOf('function calculatedAdminAcademicYear'));

  for (const id of expectedSections) {
    assert.match(definitions, new RegExp(`\\['${id}','[^']+','[^']+'\\]`), `${id} needs its original route definition`);
    assert.match(descriptions, new RegExp(`${id}:'[^']+'`), `${id} needs a navigation description`);
    const occurrences = [...groups.matchAll(new RegExp(`'${id}'`, 'g'))].length;
    assert.equal(occurrences, 1, `${id} must appear once in the grouped navigation`);
  }
  assert.match(groups, /الرئيسية والمتابعة/);
  assert.match(groups, /الطلاب والحصص/);
  assert.match(groups, /المحتوى والتقييم/);
  assert.match(groups, /الطلبات والتواصل/);
  assert.match(groups, /النظام والبيانات/);
});

test('admin sidebar provides searchable accessible navigation without changing routes', () => {
  const admin = read('assets/admin.js');

  assert.match(admin, /function adminNavigationHtml\(\)/);
  assert.match(admin, /id="adminNavSearch" type="search"/);
  assert.match(admin, /aria-controls="adminNavList"/);
  assert.match(admin, /id="adminNavSearchStatus" aria-live="polite"/);
  assert.match(admin, /function bindAdminNavigationTools\(\)/);
  assert.match(admin, /button\.hidden=!match/);
  assert.match(admin, /event\.key==='\/'/);
  assert.match(admin, /goAdminSection\(btn\.dataset\.adminNav\)/);
});

test('navy and gold identity covers public pages, administration, dark mode and phones', () => {
  const css = read('assets/v67-learning-hub.css');

  assert.match(css, /V67\.3 — navy and gold identity/);
  assert.match(css, /--tm-navy:#081a33/);
  assert.match(css, /--tm-gold:#d3a844/);
  assert.match(css, /\.hero\{background:[^}]+#061223/);
  assert.match(css, /\.admin-nav-search\{/);
  assert.match(css, /\.admin-nav-group>summary\{/);
  assert.match(css, /\.admin-nav-copy em\{/);
  assert.match(css, /html\[data-theme="dark"\] \.admin-command-header/);
  assert.match(css, /@media\(max-width:980px\)[^{]*\{[^}]*\.admin-main/);
  assert.match(css, /\.admin-mobile-bottom button\.active/);
});

test('release metadata is synchronized at 67.8.2', () => {
  const frontend = require(path.join(root, 'package.json'));
  const backend = require(path.join(root, 'functions/package.json'));
  const worker = read('service-worker.js');

  assert.equal(frontend.version, '67.8.2');
  assert.equal(backend.version, frontend.version);
  assert.match(read('assets/app.js'), /MF_ASSET_VERSION = '67\.8\.2'/);
  assert.match(worker, /technominds-v67-8-2-backend-compatibility/);
  assert.match(worker, /ASSET_VERSION = "67\.8\.2"/);
});
