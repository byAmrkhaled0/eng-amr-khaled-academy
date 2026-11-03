'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const expectedSections = [
  'overview','classroom','students','motivation','schedules','attendance',
  'materials','theoryLectures','assignments','exams','payments','bookings',
  'questionBanks','studentRequests','warnings','curriculum','reviews','backup','settings'
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
  assert.match(groups, /المتابعة/);
  assert.match(groups, /إدارة الطلاب/);
  assert.match(groups, /التعليم والتقييم/);
  assert.match(groups, /الطلبات والتواصل/);
  assert.match(groups, /النظام والبيانات/);
  assert.match(admin, /adminLegacySectionAliases=\{operations:'classroom'/);
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

test("navy and gold identity covers public pages, administration, dark mode and phones",()=>{const css=read('assets/v67-learning-hub.css'),admin=read('assets/v674-admin.css');for(const token of ['--tm-navy:#041e34','--tm-gold:#ffca50','--tm-cyan:#05b8d6','.tm-reference-hero{position:relative;isolation:isolate;background:#031a2e','.btn.gold{background:#ffd16a','html[data-theme="dark"]'])assert(css.includes(token),token);for(const token of ['.admin-workspace-switcher{display:grid','.admin-mobile-bottom button.active','.admin-home-secondary{display:grid'])assert(admin.includes(token),token);});

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
