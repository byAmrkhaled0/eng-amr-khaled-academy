'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {publicHomeworkProjection}=require('../functions/lib/homework-domain');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('graded homework exposes a model answer only for answers that need correction',()=>{
  const result=publicHomeworkProjection({score:7,maxScore:10,needsManualReview:false,answers:[
    {question:'صحيح',answer:'A',correctAnswer:'A',correct:true,mark:2,awardedMark:2},
    {question:'خطأ',answer:'B',correctAnswer:'C',correct:false,mark:2,awardedMark:0},
    {question:'جزئي',answer:'حل ناقص',correctAnswer:'الحل الكامل',correct:null,mark:3,awardedMark:2}
  ]});
  assert.equal(result.answersRevealed,true);
  assert.equal(result.wrongAnswerCount,2);
  assert.equal('correctAnswer' in result.answers[0],false);
  assert.deepEqual(result.wrongAnswers.map(row=>row.correctAnswer),['C','الحل الكامل']);
});

test('ungraded homework never exposes an answer key',()=>{
  const result=publicHomeworkProjection({score:null,needsManualReview:true,revealCorrectAnswersAfterClose:true,dueDate:'2020-01-01',answers:[{question:'س',answer:'أ',correctAnswer:'سر',correct:false}]},Date.now());
  assert.equal(result.answersRevealed,false);
  assert.equal(result.wrongAnswerCount,0);
  assert.equal(JSON.stringify(result).includes('سر'),false);
});

test('student experience includes corrections, lecture progress, filtering and continue flow',()=>{
  const app=read('assets/app.js'),page=read('theory-lectures.html'),css=read('assets/v67-learning-hub.css');
  assert.match(app,/نموذج حل الأسئلة الخاطئة فقط/);
  assert.match(app,/إجاباتك كلها صحيحة/);
  assert.match(app,/recordLectureProgress\?\.\(code,id,25,'materials'\)/);
  assert.match(app,/data-student-tab="lectures"/);
  assert.match(app,/كمّل من حيث توقفت/);
  assert.match(page,/id="theoryStudentSearch"/);
  assert.match(page,/id="theoryStudentUnit"/);
  assert.match(page,/id="theoryStudentState"/);
  assert.match(css,/\.homework-wrong-review/);
  assert.match(css,/\.theory-progress/);
});

test('admin manages theory lectures as one unit with safe lifecycle and analytics',()=>{
  const ui=read('assets/v60-admin-workflow.js'),backend=read('functions/index.js'),sync=read('assets/firebase-sync.js'),rules=read('firestore.rules');
  for(const marker of ['data-theory-edit','data-theory-copy','data-theory-preview','data-theory-analytics','bulkTheoryLectureState','theoryLectureLoadMore','linkedAssignmentId','linkedExamId'])assert.match(ui,new RegExp(marker));
  assert.match(backend,/exports\.getTheoryLectureAnalytics/);
  assert.match(backend,/db\.collection\('theory_lecture_progress'\)/);
  assert.match(backend,/sourceCollection==='lectures'/);
  assert.match(sync,/getTheoryLectureAnalytics/);
  assert.match(rules,/match \/theory_lecture_progress\/\{id\} \{ allow read, write: if false; \}/);
});

test('V67 assets and cache are wired into source and build checks',()=>{
  assert.equal(require(path.join(root,'package.json')).version,'70.0.0');
  assert.match(read('teacher-login.html'),/v60-admin-workflow\.js\?v=70\.0\.0/);
  assert.match(read('service-worker.js'),/technominds-v70-0-0-complete-report/);
  for(const page of ['teacher-login.html','student.html','parent.html','theory-lectures.html'])assert.match(read(page),/v67-learning-hub\.css\?v=70\.0\.0/);
});
