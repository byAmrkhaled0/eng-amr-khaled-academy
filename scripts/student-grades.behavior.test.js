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

test('remote-only homework correction updates cached file, summary and reopened filters without another read',async()=>{
 const ui=await createAdminDOM();
 try{
  ui.run(`adminData.students=[];adminData.assignments=[{id:'remote-hw',title:'Remote homework',active:true,totalScore:10}];`);
  let reads=0,resolve,reject;
  ui.window.MFCloud.getHomeworkAdminWorkspace=async payload=>{if(!payload.assignmentId)return [];reads++;return {students:[{studentCode:'REMOTE1',name:'Remote student',submission:{id:'remote-sub',assignmentId:'remote-hw',score:null,maxScore:10,needsManualReview:true,answers:[{question:'Explain',answer:'Answer',mark:10}]}}]};};
  ui.window.MFCloud.reviewHomeworkSubmission=()=>new Promise((a,b)=>{resolve=a;reject=b;});
  ui.window.renderAssignments();ui.window.openHomeworkAdminFile('remote-hw');await tick(30);
  const box=ui.document.getElementById('homeworkAttendanceRows');
  const button=box.querySelector('[data-tm-action="saveHomeworkCorrection"]');assert(button);
  button.closest('details').open=true;
  box.querySelector('[data-homework-award]').value='8';
  const first=ui.window.saveHomeworkCorrection('remote-sub',button);await tick();
  assert.match(box.textContent,/المصحح 0/);
  reject(new Error('offline'));await first;
  assert.match(box.textContent,/يحتاج تصحيحًا/);
  const retry=ui.window.saveHomeworkCorrection('remote-sub',button);await tick();resolve({ok:true,score:8,maxScore:10});await retry;
  assert.match(box.textContent,/المصحح 1/);assert.match(box.textContent,/المتوسط 80%/);
  assert.doesNotMatch(box.textContent,/يحتاج تصحيحًا/);assert.match(box.textContent,/8 من 10/);
  assert.equal(box.querySelector('details.assignment-submission-row').open,true);
  ui.window.openHomeworkAdminFile('remote-hw');await tick();
  assert.match(box.textContent,/المصحح 1/);assert.doesNotMatch(box.textContent,/يحتاج تصحيحًا/);
  assert.equal(reads,1);
  const edit=box.querySelector('[data-homework-edit-correction]');assert(edit);edit.click();
  assert.equal(box.querySelector('[data-homework-award]').value,'8');
  box.querySelector('[data-homework-award]').value='2';
  box.querySelector('[data-homework-cancel="true"]').click();
  assert.match(box.textContent,/8 من 10/);assert(!box.querySelector('[data-homework-award]'));
  box.querySelector('[data-homework-edit-correction]').click();
  assert.equal(box.querySelector('[data-homework-award]').value,'8');box.querySelector('[data-homework-award]').value='0';
  const save=box.querySelector('[data-tm-action="saveHomeworkCorrection"]');
  const revised=ui.window.saveHomeworkCorrection('remote-sub',save);await tick();
  assert.match(box.textContent,/8 من 10/);resolve({ok:true,score:0,maxScore:10});await revised;
  assert.match(box.textContent,/0 من 10/);assert.match(box.textContent,/المتوسط 0%/);assert.match(box.textContent,/المصحح 1/);
  ui.window.openHomeworkAdminFile('remote-hw');assert.match(box.textContent,/0 من 10/);assert.equal(reads,1);
 }finally{ui.close();}
});

test('manual missing homework button confirms, prevents double clicks and reports only server acknowledgments',async()=>{
 const ui=await createAdminDOM();
 try{
  ui.run(`adminData.assignments=[{id:'reminder-ui',title:'Homework',active:true}];`);
  ui.window.renderAssignments();ui.window.openHomeworkAdminFile('reminder-ui');await tick(30);
  const button=ui.document.querySelector('[data-homework-remind]');assert(button);
  let calls=0,resolve;ui.window.MFCloud.remindMissingHomeworkAdmin=payload=>{assert.deepEqual(JSON.parse(JSON.stringify(payload)),{assignmentId:'reminder-ui'});calls++;return new Promise(r=>resolve=r);};
  ui.window.confirm=()=>false;button.click();await tick();assert.equal(calls,0);
  ui.window.confirm=()=>true;button.click();button.click();await tick();assert.equal(calls,1);assert(button.disabled);
  resolve({ok:true,created:3,duplicate:1});await tick();assert(!button.disabled);assert.match(ui.document.getElementById('toast').textContent,/3 تنبيه/);
 }finally{ui.close();}
});
