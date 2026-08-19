'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Firebase functions use the recovery entrypoint without dropping existing exports',()=>{
  const pkg=JSON.parse(read('functions/package.json'));
  const entry=read('functions/entry.js');
  assert.equal(pkg.main,'entry.js');
  assert.match(entry,/const base = require\('\.\/index'\)/);
  assert.match(entry,/module\.exports=\{\.\.\.base,restoreAutomaticBackup,restoreContentItem,repairLegacyExamFormats\}/);
});

test('schema 63 backups restore with a safety backup and nested progress',()=>{
  const entry=read('functions/entry.js');
  assert.match(entry,/RESTORE-V63/);
  assert.match(entry,/\[53,54,60,63\]\.includes\(payload\.schemaVersion\)/);
  assert.match(entry,/createSafetyBackup\('pre-restore',staff\)/);
  assert.match(entry,/name==='student_attempts'/);
  assert.match(entry,/name==='student_progress'/);
  assert.match(entry,/row\.lectures/);
});

test('archive restore is admin-only and limited to exams and homework',()=>{
  const entry=read('functions/entry.js');
  assert.match(entry,/request\.auth\.token\?\.admin!==true/);
  assert.match(entry,/request\.auth\.token\?\.email_verified!==true/);
  assert.match(entry,/row\.role!=='admin'/);
  assert.match(entry,/\['assignments','exams'\]\.includes\(collection\)/);
  assert.match(entry,/archived:false,active:true,published:true/);
});

test('legacy exam repair creates a safety backup and leaves structured exams untouched',()=>{
  const entry=read('functions/entry.js');
  assert.match(entry,/if\(!source\|\|isStructuredExam\(source\)\)continue/);
  assert.match(entry,/createSafetyBackup\('pre-exam-format-repair',staff\)/);
  assert.match(entry,/النوع: mcq/);
  assert.match(entry,/النوع: essay/);
  assert.match(entry,/repaired\+=chunk\.length/);
});

test('admin recovery loads unordered legacy content and exposes safe remove and restore controls',()=>{
  const ui=read('assets/v638-admin-recovery.js');
  const html=read('teacher-login.html');
  assert.match(ui,/unorderedCollection\('exams'\)/);
  assert.match(ui,/unorderedCollection\('assignments'\)/);
  assert.match(ui,/حذف من المنصة/);
  assert.match(ui,/استعادة للمنصة/);
  assert.match(ui,/repairLegacyExamFormats/);
  assert.match(ui,/function adminRows\(collection\)/);
  assert.match(ui,/typeof adminData!=='undefined'/);
  assert.match(html,/v638-admin-recovery\.js\?v=63\.0\.7-recovery/);
});
