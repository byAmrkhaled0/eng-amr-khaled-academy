'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('simplified navigation keeps the daily tools visible and every other tool accessible',()=>{
  const admin=read('assets/admin.js');
  const primary=admin.match(/const adminPrimarySections=\[([^\]]+)\]/)?.[1]||'';
  for(const id of ['overview','classroom','students','attendance','assignments'])assert.match(primary,new RegExp(`'${id}'`));
  for(const id of ['operations','theoryLectures','questionBanks','exams'])assert.doesNotMatch(primary,new RegExp(`'${id}'`));
  assert.match(admin,/function adminNavButtonHtml\(id,label\)/);
  assert.match(admin,/id="adminAllTools"/);
  assert.match(admin,/كل أدوات الإدارة/);
  assert.match(admin,/ids\.filter\(id=>!adminPrimarySections\.includes\(id\)\)/);
  assert.match(admin,/secondaryCount=adminSections\.length-adminPrimarySections\.length/);
});

test('search reveals matching advanced tools without expanding the default menu permanently',()=>{
  const admin=read('assets/admin.js');
  assert.match(admin,/const primary=document\.querySelector\('#adminNavList \.admin-nav-primary'\)/);
  assert.match(admin,/allTools\.open=hasVisible/);
  assert.match(admin,/activeNavigation\?\.closest\('\.admin-all-tools'\)\?\.setAttribute\('open',''\)/);
});

test('the simpler dashboard reduces decoration while retaining status and shortcuts',()=>{
  const css=read('assets/v674-admin.css'),admin=read('assets/admin.js');
  assert.match(css,/\.admin-nav-primary\{display:grid/);
  assert.match(css,/\.admin-all-tools>summary\{/);
  assert.match(css,/\.admin-overview-hero:after\{display:none\}/);
  assert.match(css,/\.admin-metric-copy em\{display:none\}/);
  assert.match(admin,/class="admin-task-button primary-task"/);
  assert.match(admin,/class="admin-system-note"/);
  assert.match(admin,/class="card admin-reveal-card-v69"/);
});
