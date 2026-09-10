'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function functionBody(name){
  const source=read('functions/index.js');
  const start=source.indexOf(`exports.${name} =`);
  assert.notEqual(start,-1,`${name} must exist`);
  const next=source.indexOf('\nexports.',start+10);
  return source.slice(start,next<0?source.length:next);
}

test('grading dialog has one bounded touch-scroll surface on desktop and mobile',()=>{
  const css=read('assets/v67-learning-hub.css'),admin=read('assets/admin.js');
  assert.match(css,/\.correction-card-v40\{[\s\S]*grid-template-rows:auto minmax\(0,1fr\) auto!important[\s\S]*height:min\(900px,calc\(100dvh - 20px\)\)[\s\S]*overflow:hidden!important/);
  assert.match(css,/\.correction-list-v40\{[\s\S]*overflow-y:auto!important[\s\S]*touch-action:pan-y!important[\s\S]*-webkit-overflow-scrolling:touch/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.correction-card-v40\{width:100vw!important;height:100dvh!important/);
  assert.match(admin,/role="dialog" aria-modal="true"/);
  assert.match(admin,/correctionModalKeydown[\s\S]*event\.key==='Escape'/);
  assert.match(admin,/document\.body\.classList\.add\('correction-open'\)/);
});

test('automatic and previously reviewed exams stay editable after the exam closes',()=>{
  const admin=read('assets/admin.js'),review=functionBody('reviewExamAttempt');
  assert.match(admin,/return 'تعديل التصحيح التلقائي'/);
  assert.match(admin,/return 'مراجعة وتعديل التصحيح'/);
  assert.match(admin,/حتى بعد انتهاء الامتحان/);
  assert.match(admin,/data-awarded-index/);
  assert.match(admin,/correctionReason/);
  assert.doesNotMatch(review,/exam\.active|closeAt|contentIsOpen/);
  assert.match(review,/automatic_override/);
  assert.match(review,/reviewRevision:FieldValue\.increment\(1\)/);
  assert.match(review,/exam_review_history/);
});

test('assessment changes invalidate ranking and any locked parent monthly report',()=>{
  const backend=read('functions/index.js');
  assert.match(backend,/async function markStudentMonthlyReportDirty/);
  assert.match(backend,/lockedAt&&!existing\.data\(\)\?\.invalidatedAt/);
  assert.match(backend,/invalidatedAt:FieldValue\.delete\(\)/);
  for(const name of ['submitExam','reviewExamAttempt','submitAssignmentAnswer','reviewHomeworkSubmission']){
    const body=functionBody(name);
    assert.match(body,/markLeaderboardDirty\(/,`${name} must invalidate ranking`);
    assert.match(body,/markStudentMonthlyReportDirty\(/,`${name} must invalidate the parent report`);
  }
});

test('leaderboard deduplicates exam sources and exposes exam and homework scores',()=>{
  const backend=read('functions/index.js'),app=read('assets/app.js');
  assert.match(backend,/normalizeUnifiedResults\(\{grades:currentMonthRows[\s\S]*examAttempts:currentMonthRows/);
  assert.match(backend,/gradePct\*config\.weights\.exams/);
  assert.match(backend,/homeworkGradePct\*config\.weights\.homeworkGrade/);
  assert.match(app,/درجات الامتحانات/);
  assert.match(app,/درجات الواجبات/);
  assert.match(app,/motivation-score-breakdown-v683/);
});

test('monthly parent report keeps one current exam result and the latest corrected score',()=>{
  const {calculateMonthlyReport}=require('../functions/lib/monthly-report');
  const report=calculateMonthlyReport({
    monthKey:'2026-09',student:{studentCode:'12345678',name:'طالب'},attendance:[],assignments:[],homeworks:[],exams:[],recitations:[],lectureProgress:[],
    grades:[{id:'legacy-grade',examId:'exam-1',activityName:'اختبار سبتمبر',date:'2026-09-10',score:4,maxScore:10}],
    examAttempts:[{id:'attempt-1',examId:'exam-1',examTitle:'اختبار سبتمبر',submittedAt:'2026-09-10T09:00:00.000Z',score:8,maxScore:10}]
  });
  assert.equal(report.results.gradedCount,1);
  assert.equal(report.results.average,80);
  assert.equal(report.results.rows[0].score,8);
});
