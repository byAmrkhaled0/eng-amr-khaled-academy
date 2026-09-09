'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('the platform has one final mobile-first layer with safe touch targets',()=>{
  const css=read('assets/v67-learning-hub.css');
  assert.match(css,/V67\.5 — one mobile-first visual layer/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/\.btn,\.primary-btn\{min-height:48px!important/);
  assert.match(css,/font-size:16px!important/);
  assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
});

test('home, portals and resources keep their content in clearer phone layouts',()=>{
  const css=read('assets/v67-learning-hub.css');
  assert.match(css,/\.hero-stats\{display:grid!important;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.student-resource-access-grid,\.parent-hero-grid-v29\{grid-template-columns:1fr!important/);
  assert.match(css,/\.student-kpi-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.student-tabbar\{position:sticky!important;top:70px!important/);
  assert.match(css,/\.resources-grid-v31\{grid-template-columns:1fr!important/);
});

test('exam and homework controls stay reachable across phone orientations',()=>{
  const css=read('assets/v67-learning-hub.css');
  assert.match(css,/\.exam-box,\.exam-app-shell\{width:100vw!important;height:100dvh!important/);
  assert.match(css,/\.exam-option\{grid-template-columns:22px 30px minmax\(0,1fr\)!important;min-height:58px!important/);
  assert.match(css,/\.exam-navigation #examSubmitBtn\{grid-column:1\/-1\}/);
  assert.match(css,/\.homework-step-navigation\{position:sticky/);
  assert.match(css,/@media\(max-width:760px\) and \(orientation:landscape\) and \(max-height:520px\)/);
});

test('mobile administration exposes daily work first without removing advanced tools',()=>{
  const css=read('assets/v674-admin.css');
  const admin=read('assets/admin.js');
  assert.match(css,/V67\.5 — phone-first administration/);
  assert.match(css,/\.admin-all-tools>summary\{min-height:49px!important/);
  assert.match(css,/\.admin-command-actions\{position:sticky;top:72px/);
  assert.match(css,/\.admin-mobile-bottom\{right:8px!important/);
  assert.match(admin,/id="adminAllTools"/);
  assert.match(admin,/const adminPrimarySections=\['overview','operations','students','attendance','theoryLectures','assignments','exams'\]/);
});
