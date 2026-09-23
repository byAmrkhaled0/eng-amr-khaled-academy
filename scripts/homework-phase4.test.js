'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {assignmentIsReleased}=require('../functions/lib/assignment-schedule');
const {learningTargetMatchesStudent}=require('../functions/lib/academic-targeting');
const {homeworkMetrics,normalizeUnifiedResults,latestResults}=require('../functions/lib/portal-results');
const {calculateMonthlyReport,rowMatchesMonth}=require('../functions/lib/monthly-report');

const backend=fs.readFileSync(path.join(__dirname,'../functions/index.js'),'utf8');
const student={studentCode:'ST-123456',scheduleId:'g1',group:'أ',createdAt:'2026-08-01'};
const assignment=(id,date='2026-09-05')=>({id,title:id,publishAt:date,dueDate:'2026-09-30',totalScore:10});
const submission=(id,score=8)=>({id:`s-${id}`,assignmentId:id,submittedAt:'2026-09-12T10:00:00Z',reviewedAt:'2026-10-02T09:00:00Z',score,maxScore:10,completed:true,attemptNumber:1});
const input=(assignments,homeworks,monthKey='2026-09')=>({student,monthKey,now:new Date('2026-10-10T12:00:00Z'),sessionsComplete:true,assignments,homeworks});

test('published assignments, not submissions or due dates, set the completion denominator',()=>{
  const assignments=['a','b','c','d'].map(id=>assignment(id));
  for(const [count,percentage] of [[4,100],[3,75],[0,0]]){
    const submissions=assignments.slice(0,count).map(row=>submission(row.id));
    const portal=homeworkMetrics(assignments,submissions);
    const report=calculateMonthlyReport(input(assignments,submissions)).homework;
    assert.equal(portal.requiredCount,4);
    assert.equal(report.required,4);
    assert.equal(portal.submittedCount,count);
    assert.equal(report.submitted,count);
    assert.equal(portal.missingCount,4-count);
    assert.equal(report.missingAssignments,4-count);
    assert.equal(portal.submissionPercentage,percentage);
    assert.equal(report.completionPercentage,percentage);
  }
  assert.equal(homeworkMetrics([],[]).submissionPercentage,null);
  const empty=calculateMonthlyReport(input([],[])).homework;
  assert.equal(empty.completionPercentage,null);
  assert.equal(empty.averageGrade,null);
});

test('duplicate attempts and later regrading yield one current submission and grade',()=>{
  const assignments=[assignment('a')];
  const first=submission('a',5),revised={...submission('a',9),id:'second',reviewedAt:'2026-10-03T09:00:00Z',updatedAt:'2026-10-03T09:00:00Z'};
  const portal=homeworkMetrics(assignments,[first,revised]);
  const report=calculateMonthlyReport(input(assignments,[first,revised])).homework;
  assert.equal(portal.submittedCount,1);
  assert.equal(report.submitted,1);
  assert.equal(portal.gradedCount,1);
  assert.equal(portal.averageGrade,90);
  assert.equal(report.averageGrade,90);
  assert.equal(latestResults(normalizeUnifiedResults({grades:[{type:'homework',assignmentId:'a',date:'2026-09-12',score:5,maxScore:10}],homeworks:[revised]}))[0].score,9);
  const corrected={...revised,score:7,reviewedAt:'2026-10-04T09:00:00Z',updatedAt:'2026-10-04T09:00:00Z'};
  assert.equal(homeworkMetrics(assignments,[first,corrected]).averageGrade,70);
  assert.equal(calculateMonthlyReport(input(assignments,[first,corrected])).homework.averageGrade,70);
  assert.equal(latestResults(normalizeUnifiedResults({homeworks:[first,corrected]}))[0].score,7);
});

test('an assignment belongs to publication month; review never creates a new activity',()=>{
  const code=backend.slice(backend.indexOf('function monthlyReportInput('),backend.indexOf('async function buildStudentMonthlyReport('));
  const reportMonthForRow=(row,fields=[])=>{for(const field of [...fields,'date','submittedAt','createdAt','updatedAt'])if(row[field])return String(row[field]).slice(0,7);return '';};
  const context={rowMatchesMonth,reportMonthForRow,reportPreviousMonthKey:()=> '2026-08',periodFromMonthKey:()=>({academicYear:'2026/2027',monthName:'سبتمبر'}),leaderboardPeriod:()=>({monthKey:'2026-09'}),reportPublicRows:rows=>rows,money:Number,paymentStatus:()=> 'paid',text:String,reportIso:String};
  vm.createContext(context);vm.runInContext(`${code}\nthis.monthlyReportInput=monthlyReportInput;this.availableMonths=reportAvailableMonths;`,context);
  const source={sessions:[],transfers:[],attendance:[],grades:[],examAttempts:[],homeworks:[submission('a')],recitations:[],progress:[],materials:[],payments:[],motivation:[],exams:[],assignments:[{...assignment('a'),dueDate:'2026-10-05'}]};
  const september=calculateMonthlyReport({...context.monthlyReportInput(student,source,'2026-09'),now:'2026-10-10'}).homework;
  const october=calculateMonthlyReport({...context.monthlyReportInput(student,source,'2026-10'),now:'2026-10-10'}).homework;
  assert.equal(september.required,1);
  assert.equal(september.submitted,1);
  assert.equal(september.averageGrade,80);
  assert.equal(october.required,0);
  assert.equal(october.activitySubmitted,0);
  assert.equal(october.completionPercentage,null);
  assert.equal(context.availableMonths(source,'2026-09').includes('2026-10'),false);
});

test('other groups, archived work and enrollment date exclude unrelated requirements',()=>{
  const code=backend.slice(backend.indexOf('function contentAvailableAfterStudentJoined('),backend.indexOf('async function assignmentsForStudent('));
  const context={firestoreMillis:value=>Date.parse(value)||0,normalizeCode:String,cairoDateKey:()=> '2026-10-10',assignmentIsReleased,scheduledTimeMillis:value=>Date.parse(value)||0};
  vm.createContext(context);vm.runInContext(`${code}\nthis.visible=contentAvailableAfterStudentJoined;`,context);
  const enrolled={...student,createdAt:'2026-09-10'};
  const old={...assignment('old','2026-09-01'),dueDate:'2026-09-05'};
  const otherGroup={...assignment('other'),scheduleId:'g2'};
  assert.equal(learningTargetMatchesStudent(otherGroup,enrolled),false);
  assert.equal(learningTargetMatchesStudent({...otherGroup,scheduleId:'g1'},enrolled),true);
  assert.equal(context.visible(old,enrolled),false);
  assert.equal(context.visible({...old,publishAt:'2026-09-11'},enrolled),true);
  assert.equal(assignmentIsReleased({...assignment('archived'),archived:true}),false);
  assert.equal(assignmentIsReleased({...assignment('cancelled'),cancelled:true}),false);
  assert.match(backend,/assignmentIsReleased\(item\) && learningTargetMatchesStudent\(item, student\) && contentAvailableAfterStudentJoined\(item, student\)/);
  assert.match(backend,/membershipAt\(st,studentTransfers,cairoDateKey\(item\.publishAt/);
});

test('server, browser and report use shared homework metrics and cache policy',()=>{
  const client=fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8');
  assert.match(client,/student\.homeworkMetrics=window\.TMResults\.homeworkMetrics\(/);
  assert.match(backend,/const homeworkSummary = homeworkMetrics\(allAssignments, rawHomeworks\)/);
  assert.match(backend,/homeworkPct=monthlyEvaluation\.homework\.completionPercentage/);
  assert.match(backend,/cached\?\.report\?\.schemaVersion===11/);
});
