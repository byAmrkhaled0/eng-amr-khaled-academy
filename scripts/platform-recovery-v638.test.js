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
  assert.match(entry,/module\.exports=\{\.\.\.base,restoreContentItem,repairLegacyExamFormats\}/);
});

test('all backup entrypoints share the same recursive schema',()=>{
  const entry=read('functions/entry.js'),backend=read('functions/index.js');
  assert.match(entry,/createBackupService/);assert.match(backend,/createBackupService/);
  assert.doesNotMatch(entry,/const restoreAutomaticBackup/);
  const {BACKUP_COLLECTIONS,planRestore}=require('../functions/lib/backup');
  assert(BACKUP_COLLECTIONS.includes('exam_review_history'));
  const result=planRestore({schemaVersion:63,backupFormatVersion:2,project:'test',collections:{student_progress:[{id:'s1',data:{},monthlyEvents:[{id:'m1',data:{value:2}}]}]}},'test');
  assert.equal(result.documents[1].path,'student_progress/s1/monthly_events/m1');assert.equal(result.plan.deletes,0);
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
  assert.match(html,/v638-admin-recovery\.js\?v=64\.0\.0-recovery/);
});
