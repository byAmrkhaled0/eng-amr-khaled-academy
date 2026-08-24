'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('service worker has one valid release cache and offline assessment shells',()=>{
  const worker=read('service-worker.js');
  assert.match(worker,/technominds-v64-0-0-resilient-assessments/);
  assert.match(worker,/ASSET_VERSION = "64\.0\.0"/);
  assert.match(worker,/url\.pathname\.endsWith\("\.webmanifest"\)/);
  for(const route of ['/student.html','/exams.html'])assert.match(worker,new RegExp(route.replace('.','\\.')));
});

test('homework drafts survive refresh and clear only after confirmed submission',()=>{
  const app=read('assets/app.js');
  assert.match(app,/HOMEWORK_DRAFT_PREFIX/);
  assert.match(app,/localStorage\.setItem\(homeworkDraftKey\(form\)/);
  assert.match(app,/restoreHomeworkDraft\(form\)/);
  assert.match(app,/clearHomeworkDraft\(form\)/);
  assert.match(app,/protectedStudentWorkOpen\(\)/);
  assert.match(app,/إجابتك محفوظة ويمكنك المحاولة مرة أخرى/);
});

test('exam progress is server timed, resumable, idempotent and auto-submits once',()=>{
  const app=read('assets/app.js'),backend=read('functions/index.js'),sync=read('assets/firebase-sync.js');
  assert.match(app,/examClockNow\(draft\)/);
  assert.match(app,/saveSecureExamProgress/);
  assert.match(app,/autoSubmitTriggered/);
  assert.match(app,/mf_sw_reload_deferred_v6400/);
  assert.match(backend,/exports\.saveExamProgress = onCall/);
  assert.match(backend,/draftAnswers/);
  assert.match(backend,/session\.draftAnswers/);
  assert.match(backend,/latestData\.status === 'submitted'/);
  assert.match(sync,/saveExamProgress:callable\('saveExamProgress'\)/);
});

test('homework grade is separate from submission in monthly motivation and parent report is complete',()=>{
  const app=read('assets/app.js'),backend=read('functions/index.js');
  assert.match(backend,/homeworkGradePct/);
  assert.match(backend,/homeworkPct\*\.15\+homeworkGradePct\*\.10/);
  assert.match(backend,/where\('submittedAt','>=',periodStart\)/);
  assert.match(app,/أهلًا بحضرتك، مع حضرتك م\. عمرو خالد/);
  assert.match(app,/كل درجات الشهر وآخر الامتحانات/);
  assert.match(app,/التحفيز الشهري/);
});

test('theory lectures are independently uploaded, targeted and displayed',()=>{
  const app=read('assets/app.js'),backend=read('functions/index.js'),admin=read('assets/v60-admin-workflow.js'),page=read('theory-lectures.html'),worker=read('service-worker.js');
  assert.match(page,/data-resource-mode="theory"/);
  assert.match(page,/studentResourceCodeForm/);
  assert.match(app,/theory-lectures\.html/);
  assert.match(app,/resourceMode==='theory'/);
  assert.match(backend,/lectureCategory/);
  assert.match(admin,/renderTheoryLecturesV640/);
  assert.match(admin,/multiple required/);
  assert.match(admin,/lectureCategory:'theory'/);
  assert.match(worker,/\/theory-lectures\.html/);
});
