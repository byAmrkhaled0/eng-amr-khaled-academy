'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {calculateMonthlyReport,rowMatchesMonth}=require('../functions/lib/monthly-report');
const {normalizeUnifiedResults,latestResults}=require('../functions/lib/portal-results');
const {learningTargetMatchesStudent}=require('../functions/lib/academic-targeting');
const {scheduledTimeMillis}=require('../functions/lib/assignment-schedule');

const backend=fs.readFileSync(path.join(__dirname,'../functions/index.js'),'utf8');
const student={studentCode:'ST-123456',scheduleId:'g1',group:'أ',createdAt:'2026-09-01'};
const exam=(id,openAt='2026-09-10T09:00:00Z')=>({id,title:id,openAt,closeAt:'2026-09-30T23:00:00Z',totalScore:10,published:true});
const attempt=(id,examId,score,maxScore,attemptNumber=1)=>({id,examId,examTitle:examId,submittedAt:'2026-09-15T10:00:00Z',reviewedAt:'2026-10-05T10:00:00Z',score,maxScore,status:'corrected',attemptNumber});
const report=(exams=[],examAttempts=[],grades=[])=>calculateMonthlyReport({student,monthKey:'2026-09',now:'2026-10-10T12:00:00Z',sessionsComplete:true,exams,examAttempts,grades});

function monthlyInput(){
  const code=backend.slice(backend.indexOf('function monthlyReportInput('),backend.indexOf('async function buildStudentMonthlyReport('));
  const reportMonthForRow=(row,fields=[])=>{for(const field of [...fields,'date','submittedAt','createdAt','updatedAt'])if(row[field])return String(row[field]).slice(0,7);return '';};
  const context={rowMatchesMonth,reportMonthForRow,reportPreviousMonthKey:()=> '2026-08',periodFromMonthKey:()=>({academicYear:'2026/2027',monthName:'سبتمبر'}),leaderboardPeriod:()=>({monthKey:'2026-09'}),reportPublicRows:rows=>rows,money:Number,paymentStatus:()=> 'paid',text:String,reportIso:String};
  vm.createContext(context);vm.runInContext(`${code}\nthis.input=monthlyReportInput;this.available=reportAvailableMonths;`,context);
  return context;
}

test('only a published exam for the student is required',()=>{
  const code=backend.slice(backend.indexOf('function examMatchesStudent('),backend.indexOf('exports.getExamDashboard ='));
  const context={learningTargetMatchesStudent,scheduledTimeMillis};
  vm.createContext(context);vm.runInContext(`${code}\nthis.published=examIsPublished;this.open=examIsOpen;`,context);
  const candidate=exam('a');
  const targeted={...candidate,scheduleId:'g1'};
  assert.equal(context.published(targeted),true);
  assert.equal(learningTargetMatchesStudent(targeted,student),true);
  assert.equal(learningTargetMatchesStudent({...candidate,scheduleId:'g2'},student),false);
  for(const inactive of [{published:false},{archived:true},{cancelled:true},{active:false},{status:'مسودة'}]){
    assert.equal(context.published({...candidate,...inactive}),false);
    assert.equal(context.open({...candidate,...inactive},Date.parse('2026-09-15')),false);
  }
  assert.equal(report([targeted]).results.requiredExams,1);
  assert.equal(report([]).results.requiredExams,0);
});

test('one or duplicate attempts yield one exam, with latest valid retake and no legacy override',()=>{
  const item=exam('a'),first=attempt('one','a',5,10,1),second={...attempt('two','a',8,10,2),reviewedAt:'2026-10-02T00:00:00Z'};
  const legacy={id:'old-grade',examId:'a',type:'exam',date:'2026-09-15',updatedAt:'2026-10-12',score:10,maxScore:10,attemptNumber:99};
  const result=report([item],[first,second],[legacy]).results;
  assert.equal(result.requiredExams,1);
  assert.equal(result.attendedExams,1);
  assert.equal(result.gradedExams,1);
  assert.equal(result.examAverage,80);
  assert.equal(result.rows[0].score,8);
  const portal=normalizeUnifiedResults({grades:[legacy],examAttempts:[first,second]});
  assert.equal(portal.length,1);
  assert.equal(portal[0].score,8);
  assert.equal(latestResults(portal).length,1);
  const revised={...second,score:7,reviewedAt:'2026-10-10T09:00:00Z'};
  assert.equal(report([item],[first,revised],[legacy]).results.examAverage,70);
  assert.equal(normalizeUnifiedResults({grades:[legacy],examAttempts:[first,revised]})[0].score,7);
});

test('student portal reads the official attempt even when the old summary has a stale grade',async()=>{
  const code=backend.slice(backend.indexOf('async function attemptSummaries('),backend.indexOf('function publicAssignmentPayload('));
  const canonical={id:'one',data:()=>({...attempt('one','a',8,10),answers:[{question:'q',mark:10,awardedMark:8,correctAnswer:'private'}]})};
  const oldSummary={id:'one',data:()=>({...attempt('one','a',5,10),review:[{question:'q',mark:10,awardedMark:5}],answersRevealed:false})};
  const db={collection:name=>name==='exam_attempts'?{where:()=>({limit:()=>({get:async()=>({docs:[canonical]})})})}:{doc:()=>({collection:()=>({orderBy:()=>({limit:()=>({get:async()=>({docs:[oldSummary]})})})})})}};
  const context={db,cleanDocId:String,text:value=>String(value??''),reportIso:String};
  vm.createContext(context);vm.runInContext(`${code}\nthis.get=attemptSummaries;`,context);
  const rows=await context.get('ST-123456');
  assert.equal(rows.length,1);
  assert.equal(rows[0].score,8);
  assert.equal(rows[0].review[0].awardedMark,8);
  assert.equal(rows[0].review[0].correctAnswer,undefined);
});

test('submission month wins over review, grade edit and exam close month',()=>{
  const context=monthlyInput(),item={...exam('a'),closeAt:'2026-10-01T10:00:00Z'},row=attempt('one','a',8,10);
  const source={sessions:[],transfers:[],attendance:[],grades:[{id:'legacy',examId:'a',date:'2026-10-05',score:10,maxScore:10}],examAttempts:[row],homeworks:[],recitations:[],progress:[],materials:[],payments:[],motivation:[],assignments:[],exams:[item]};
  const september=reportFromInput('2026-09'),october=reportFromInput('2026-10');
  function reportFromInput(month){return calculateMonthlyReport({...context.input(student,source,month),now:'2026-10-10'}).results;}
  assert.equal(september.requiredExams,1);
  assert.equal(september.attendedExams,1);
  assert.equal(september.examAverage,80);
  assert.equal(october.requiredExams,0);
  assert.equal(october.count,0);
  assert.equal(context.available(source,'2026-09').includes('2026-10'),false);
});

test('an exam opened in one month and submitted in the next is never marked absent',()=>{
  const context=monthlyInput(),item={...exam('a','2026-09-29T09:00:00Z'),closeAt:'2026-10-02T18:00:00Z'};
  const submitted={...attempt('one','a',8,10),submittedAt:'2026-10-01T10:00:00Z',reviewedAt:'2026-11-03T10:00:00Z'};
  const source={sessions:[],transfers:[],attendance:[],grades:[],examAttempts:[submitted],homeworks:[],recitations:[],progress:[],materials:[],payments:[],motivation:[],assignments:[],exams:[item]};
  const september=calculateMonthlyReport({...context.input(student,source,'2026-09'),now:'2026-10-10'}).results;
  const october=calculateMonthlyReport({...context.input(student,source,'2026-10'),now:'2026-10-10'}).results;
  assert.equal(september.requiredExams,1);
  assert.equal(september.absentExams,0);
  assert.equal(october.requiredExams,0);
  assert.equal(october.attendedExams,1);
  assert.equal(october.examAverage,80);
});

test('a missed or started but unsubmitted exam has one absence and no invented score',()=>{
  const item=exam('a');
  const missing=report([item]).results;
  assert.equal(missing.absentExams,1);
  assert.equal(missing.attendedExams,0);
  assert.equal(missing.gradedExams,0);
  assert.equal(missing.examAverage,null);
  assert.equal(missing.rows[0].score,null);
  const started=report([item],[{id:'session',examId:'a',startedAt:'2026-09-15',status:'started'}]).results;
  assert.equal(started.startedExams,1);
  assert.equal(started.absentExams,1);
  assert.equal(started.attendedExams,0);
  assert.match(backend,/exam_absences'\)\.doc\(cleanDocId\(`\$\{exam\.id\}_\$\{studentCode\}`\)\)/);
  assert.match(backend,/if \(absenceSnap\.exists\) tx\.delete\(absenceRef\)/);
});

test('absence finalization can run twice without duplicate records or fake attempts',async()=>{
  const code=backend.slice(backend.indexOf('async function finalizeExamAbsenceRecords()'),backend.indexOf('exports.finalizeExamAbsencesAdmin ='));
  const storedExam={...exam('a'),closeAt:'2026-09-15T09:00:00Z',updatedAt:'2026-09-16T00:00:00Z'};
  const absences=new Map(),examRef={data:()=>storedExam};
  const db={collection:name=>({where:()=>({limit:()=>({get:async()=>({docs:[]})})}),doc:id=>({id,collection:name})})};
  const context={Date,db,scheduledTimeMillis,firestoreMillis:value=>Date.parse(value)||0,
    fetchAllCollectionDocuments:async name=>({docs:name==='exams'?[{id:'a',data:()=>storedExam,ref:examRef}]:[{id:'ST-123456',data:()=>student}]}),
    examIsPublished:row=>row.published!==false&&row.archived!==true,learningTargetMatchesStudent:()=>true,
    contentAvailableAfterStudentJoined:()=>true,normalizeCode:String,cleanDocId:String,text:String,
    FieldValue:{serverTimestamp:()=> '2026-09-20T00:00:00Z'},
    commitServerWrites:async writes=>{const batch={set:(ref,data)=>{if(ref===examRef)Object.assign(storedExam,data);else absences.set(ref.id,data);}};writes.forEach(write=>write(batch));}};
  vm.createContext(context);vm.runInContext(`${code}\nthis.finalize=finalizeExamAbsenceRecords;`,context);
  const first=await context.finalize(),again=await context.finalize();
  assert.equal(first.absenceRecords,1);
  assert.equal(again.absenceRecords,0);
  assert.equal(absences.size,1);
  assert.equal(absences.get('a_ST-123456').status,'absent');
});

test('zero exams are unknown and varied maximum scores average percentages',()=>{
  const empty=report().results;
  assert.equal(empty.requiredExams,0);
  assert.equal(empty.examAverage,null);
  const values=report([exam('a'),exam('b')],[attempt('a1','a',8,10),attempt('b1','b',40,50)]).results;
  assert.equal(values.gradedExams,2);
  assert.equal(values.examAverage,80);
  assert.deepEqual(values.rows.map(row=>row.percentage),[80,80]);
});

test('enrollment while an exam is open is eligible at its closing time',()=>{
  const code=backend.slice(backend.indexOf('function contentAvailableAfterStudentJoined('),backend.indexOf('async function assignmentsForStudent('));
  const context={firestoreMillis:value=>Date.parse(value)||0,normalizeCode:String,cairoDateKey:value=>String(value).slice(0,10),assignmentIsReleased:()=>true,scheduledTimeMillis};
  vm.createContext(context);vm.runInContext(`${code}\nthis.visible=contentAvailableAfterStudentJoined;`,context);
  const candidate={...exam('a'),openAt:'2026-09-01T09:00:00Z',closeAt:'2026-09-30T20:00:00Z'};
  assert.equal(context.visible(candidate,{...student,createdAt:'2026-09-15T09:00:00Z'},Date.parse(candidate.closeAt)-1),true);
  assert.equal(context.visible(candidate,{...student,createdAt:'2026-10-01T09:00:00Z'},Date.parse(candidate.closeAt)-1),false);
});
