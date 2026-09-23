'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {calculateMonthlyReport,rowMatchesMonth}=require('../functions/lib/monthly-report');
const {homeworkMetrics,normalizeUnifiedResults,latestResults}=require('../functions/lib/portal-results');
const {paymentTotals,paymentStatus,money}=require('../functions/payment-domain');

const backend=fs.readFileSync(require.resolve('../functions/index.js'),'utf8');
const code=backend.slice(backend.indexOf('function monthlyReportInput('),backend.indexOf('async function buildStudentMonthlyReport('));
const context={rowMatchesMonth,reportMonthForRow:(row,fields=[])=>{for(const field of [...fields,'date','submittedAt','createdAt','updatedAt'])if(row[field])return String(row[field]).slice(0,7);return '';},
  periodFromMonthKey:()=>({academicYear:'2026/2027',monthName:'سبتمبر'}),leaderboardPeriod:(_year,month)=>({monthKey:month==='سبتمبر'?'2026-09':'2026-10'}),
  reportPublicRows:rows=>rows,money,paymentStatus,text:String,reportIso:String};
vm.runInNewContext(`${code}\nthis.monthlyReportInput=monthlyReportInput;`,context);

test('one student, one month: report and portal projections follow changing attendance, work, grades, payment and motivation',()=>{
  const student={studentCode:'ST-FINAL-001',scheduleId:'group-1',createdAt:'2026-08-20',grade:'برمجة'};
  const sessions=Array.from({length:8},(_,i)=>({id:`session-${i}`,scheduleId:'group-1',date:`2026-09-${String(2+i*3).padStart(2,'0')}`,status:'closed'}));
  const attendance=sessions.map(row=>({classSessionId:row.id,scheduleId:'group-1',date:row.date,status:'present'}));
  const assignments=Array.from({length:4},(_,i)=>({id:`homework-${i}`,title:`واجب ${i}`,publishAt:`2026-09-${String(2+i).padStart(2,'0')}`,dueDate:'2026-09-25',totalScore:10}));
  const homeworks=assignments.slice(0,3).map((row,i)=>({id:`submission-${i}`,assignmentId:row.id,score:8,maxScore:10,submittedAt:'2026-09-12T10:00:00Z',reviewedAt:'2026-10-03T10:00:00Z'}));
  const exams=[{id:'exam-1',title:'امتحان سبتمبر',published:true,required:true,totalScore:10,openAt:'2026-09-12T00:00:00Z',closeAt:'2026-09-19T00:00:00Z'}];
  const examAttempts=[{id:'attempt-1',examId:'exam-1',score:8,maxScore:10,status:'corrected',submittedAt:'2026-09-17T10:00:00Z',reviewedAt:'2026-10-04T10:00:00Z'}];
  const grades=[{id:'old-exam-grade',examId:'exam-1',score:3,maxScore:10,updatedAt:'2026-10-15'}];
  let payment=paymentTotals({},0,100),motivationSummary={totalPoints:0,transactionCount:0};
  const reportFor=monthKey=>{
    const source={sessions,sessionsComplete:true,transfers:[],attendance,assignments,homeworks,exams,examAttempts,grades,
      recitations:[],progress:[],materials:[],payments:[{...payment,academicYear:'2026/2027',month:'سبتمبر'}],
      motivation:[{...motivationSummary,academicYear:'2026/2027',month:'سبتمبر'}]};
    return calculateMonthlyReport({...context.monthlyReportInput(student,source,monthKey),now:'2026-10-20'});
  };
  const report=()=>reportFor('2026-09');
  const allPresent=report();
  assert.equal(allPresent.student.studentCode,student.studentCode);
  assert.deepEqual([allPresent.attendance.required,allPresent.attendance.present,allPresent.attendance.percentage],[8,8,100]);
  assert.deepEqual([allPresent.homework.required,allPresent.homework.submitted,allPresent.homework.missingAssignments,allPresent.homework.completionPercentage],[4,3,1,75]);
  assert.equal(homeworkMetrics(assignments,homeworks).submissionPercentage,75);
  assert.deepEqual([allPresent.results.requiredExams,allPresent.results.gradedCount,allPresent.results.average],[1,1,80]);
  assert.equal(latestResults(normalizeUnifiedResults({grades,examAttempts,homeworks})).filter(row=>row.type==='exam').length,1);
  assert.equal(allPresent.payment.status,'unpaid');
  assert.equal(allPresent.motivation.totalPoints,16);
  assert.match(allPresent.concerns.join(' '),/واجب مستحق/);

  attendance[7].status='absent';
  attendance.push({...attendance[7],id:'duplicate-attendance'});
  payment=paymentTotals(payment,40,100);
  let current=report();
  assert.deepEqual([current.attendance.present,current.attendance.absent,current.attendance.percentage],[7,1,87.5]);
  assert.equal(current.motivation.attendancePoints,12);
  assert.equal(current.payment.status,'partial');
  attendance[6].status='absent';attendance.splice(8,1);
  examAttempts[0].score=4;
  const risk=report();
  assert.match(risk.concerns.join(' '),/تحذير غياب/);
  assert.match(risk.concerns.join(' '),/متوسط الاختبارات المصححة أقل من 60%/);
  attendance[6].status='present';examAttempts[0].score=8;
  assert.doesNotMatch(report().concerns.join(' '),/تحذير غياب|متوسط الاختبارات المصححة أقل من 60%/);
  payment=paymentTotals(payment,60,100);
  motivationSummary={totalPoints:5,transactionCount:1};
  assert.equal(report().payment.status,'paid');
  assert.equal(report().motivation.totalPoints,17);

  examAttempts[0].score=9;
  homeworks[0].score=10;
  current=report();
  assert.deepEqual([current.results.gradedCount,current.results.average,current.results.rows.find(row=>row.examId==='exam-1').percentage],[1,90,90]);
  assert.equal(current.homework.rows.filter(row=>row.submission).find(row=>row.assignment.id==='homework-0').submission.percentage,100);
  assert.equal(homeworkMetrics(assignments,homeworks).averageGrade,current.homework.averageGrade);
  assert.equal(current.overallScore,Math.min(100,Math.round(current.baseOverallScore+current.motivationBonus)));
  motivationSummary={totalPoints:0,transactionCount:2};
  payment=paymentTotals(payment,-100,100);
  assert.equal(report().motivation.totalPoints,12);
  assert.equal(report().payment.status,'unpaid');
  assert.equal(report().student.studentCode,student.studentCode);

  const october=reportFor('2026-10');
  assert.equal(october.homework.activitySubmitted,0);
  assert.equal(october.results.gradedCount,0);
  assert.equal(october.results.average,null);
  assert.equal(october.homework.completionPercentage,null);
  assert.doesNotMatch(october.concerns.join(' '),/واجب مستحق|متوسط الاختبارات/);
});
