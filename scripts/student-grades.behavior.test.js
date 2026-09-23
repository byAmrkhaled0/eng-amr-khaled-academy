'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdminDOM,tick}=require('./testing/admin-dom');
const {normalizeUnifiedResults,latestResults,configurableOverallAverage,homeworkMetrics}=require('../functions/lib/portal-results');
test('homework enters student grade average once, latest retake wins and pending is not a zero',async()=>{
 const ui=await createAdminDOM();
 try{
  ui.run(`gradeStudent={studentCode:'DEMO001',name:'طالب',grades:[],homeworks:[{id:'hw-1',assignmentId:'a',title:'واجب',score:8,maxScore:10,attemptNumber:1,submittedAt:'2026-09-12'}],attendance:[],recitations:[],gradeRecordsLoaded:true};`);
  assert.equal(ui.run('calcStudent(gradeStudent).avg'),80);assert.equal(ui.run('calcStudent(gradeStudent).gradeCount'),1);
  ui.run(`gradeStudent.grades=[{id:'copy',assignmentId:'a',score:8,maxScore:10},{id:'exam',examId:'e',score:20,maxScore:40}];`);
  assert.equal(ui.run('calcStudent(gradeStudent).avg'),65);assert.equal(ui.run('calcStudent(gradeStudent).gradeCount'),2);
  ui.run(`gradeStudent.homeworks.push({id:'hw-2',assignmentId:'a',score:0,maxScore:10,attemptNumber:2,needsManualReview:true,submittedAt:'2026-09-13'});`);
  assert.equal(ui.run('calcStudent(gradeStudent).avg'),50);assert.equal(ui.run('calcStudent(gradeStudent).gradeCount'),1);
  ui.run(`gradeStudent.homeworks[1].needsManualReview=false;gradeStudent.homeworks[1].score=10;`);
  assert.equal(ui.run('calcStudent(gradeStudent).avg'),75);
  ui.run(`gradeStudent.grades=[];gradeStudent.homeworks[1].score=0;`);
  assert.equal(ui.run('calcStudent(gradeStudent).avg'),0);assert.equal(ui.run('calcStudent(gradeStudent).gradeCount'),1);
  ui.document.body.insertAdjacentHTML('beforeend','<div id="studentGradeCards"></div>');
  const render=()=>{ui.document.getElementById('studentGradeCards').innerHTML=ui.run('studentsTable([gradeStudent])');};

  ui.run(`adminStudentMetrics.monthKey=adminReportMonthKey();adminStudentMetrics.rows={DEMO001:{attendancePercentage:0,resultsAverage:0,homeworkCompletionPercentage:0,practicalCompleted:0,practicalCount:1}};`);
  render();
  assert.match(ui.document.querySelector('#studentGradeCards .v56-student-kpis').textContent,/الدرجات0%/);
  assert.match(ui.document.querySelector('#studentGradeCards .v56-student-kpis').textContent,/التطبيق العملي0\/1/);

  ui.run(`adminStudentMetrics.rows={};`);
  render();
  assert.match(ui.document.querySelector('#studentGradeCards .v56-student-kpis').textContent,/الدرجات—/);

  ui.run(`adminStudentMetrics.rows={DEMO001:{attendancePercentage:null,resultsAverage:null,homeworkCompletionPercentage:null,practicalCompleted:null,practicalCount:null}};`);
  render();
  assert.match(ui.document.querySelector('#studentGradeCards .v56-student-kpis').textContent,/الدرجات—/);

 }finally{ui.close();}
});
test('same result policy ignores pending automatic marks and uses latest homework attempt in weighted averages',()=>{
 const raw=[{assignmentId:'a',score:8,maxScore:10,attemptNumber:1},{assignmentId:'a',score:1,maxScore:10,attemptNumber:2,needsManualReview:true}];
 const results=normalizeUnifiedResults({homeworks:raw});const latest=latestResults(results);assert.equal(latest.length,1);assert.equal(latest[0].score,null);assert.equal(latest[0].percentage,null);
 assert.equal(homeworkMetrics([{id:'a'}],raw).gradedCount,0);assert.deepEqual(configurableOverallAverage(results).typeAverages,{});
});
test('a correction updates the card only after a server acknowledgment and failure keeps its prior grade',async()=>{
 const ui=await createAdminDOM();
 try{
  ui.run(`adminData.students=[{studentCode:'DEMO001',name:'طالب',homeworks:[{id:'hw-test',assignmentId:'a',score:null,maxScore:10,needsManualReview:true,answers:[{mark:10,answer:'x'}]}]}];`);
  ui.document.body.insertAdjacentHTML('beforeend','<details class="assignment-submission-row"><input data-submission-id="hw-test" data-homework-award="0" max="10" value="8"><button type="button" id="save-grade">حفظ</button></details>');
  let resolve,reject;ui.window.MFCloud.reviewHomeworkSubmission=()=>new Promise((a,b)=>{resolve=a;reject=b;});const button=ui.document.querySelector('#save-grade');
  const first=ui.window.saveHomeworkCorrection('hw-test',button);await tick();assert(button.disabled);assert.equal(ui.run('calcStudent(adminData.students[0]).gradeCount'),0);
  reject(new Error('network'));await first;assert.equal(ui.run('calcStudent(adminData.students[0]).gradeCount'),0);
  const retry=ui.window.saveHomeworkCorrection('hw-test',button);await tick();resolve({ok:true,score:8,maxScore:10});await retry;
  assert.equal(ui.run('calcStudent(adminData.students[0]).avg'),80);assert.equal(ui.run('calcStudent(adminData.students[0]).gradeCount'),1);
 }finally{ui.close();}
});
