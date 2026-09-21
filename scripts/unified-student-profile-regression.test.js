'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {calculateMonthlyReport,rowMatchesMonth}=require('../functions/lib/monthly-report');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('submission activity from older content is scored without inflating required counts',()=>{
  const report=calculateMonthlyReport({
    monthKey:'2026-09',now:new Date('2026-09-25T12:00:00Z'),student:{studentCode:'ST-123456'},sessionsComplete:true,
    assignments:[{id:'old-hw',title:'واجب أغسطس',activityOnly:true,dueDate:'2026-08-31',totalScore:15}],
    homeworks:[{id:'sub-1',assignmentId:'old-hw',submittedAt:'2026-09-03',score:14,maxScore:15,status:'graded'}],
    exams:[{id:'old-exam',title:'امتحان أغسطس',activityOnly:true,required:true,finished:true,totalScore:20}],
    examAttempts:[{id:'attempt-1',examId:'old-exam',submittedAt:'2026-09-04',score:18,maxScore:20,status:'corrected'}]
  });
  assert.equal(report.homework.required,0);
  assert.equal(report.homework.submitted,1);
  assert.equal(report.homework.averageGrade,93);
  assert.equal(report.results.requiredExams,0);
  assert.equal(report.results.submittedExams,1);
  assert.equal(report.results.average,90);
});

test('monthly title requires sufficient data and overall policy redistributes missing metrics',()=>{
  const empty=calculateMonthlyReport({monthKey:'2026-09',student:{studentCode:'ST-123456'}});
  assert.equal(empty.monthlyTitle,'بيانات الشهر غير مكتملة');
  const report=calculateMonthlyReport({monthKey:'2026-09',student:{studentCode:'ST-123456'},grades:[{id:'a',score:9,maxScore:10},{id:'b',score:18,maxScore:20}],motivationSummary:{totalPoints:20,transactionCount:2}});
  assert.equal(report.academicScore,90);
  assert.equal(report.baseOverallScore,90);
  assert.equal(report.motivationBonus,2);
  assert.equal(report.overallScore,92);
  assert.equal(report.monthlyTitle,'متفوق الشهر');
});

test('an activity matches every relevant date instead of only its first valid date',()=>{
  const attempt={startedAt:'2026-08-31T18:00:00.000Z',submittedAt:'2026-09-01T09:00:00.000Z'};
  assert.equal(rowMatchesMonth(attempt,['startedAt','submittedAt','reviewedAt'],'2026-08'),true);
  assert.equal(rowMatchesMonth(attempt,['startedAt','submittedAt','reviewedAt'],'2026-09'),true);
  assert.equal(rowMatchesMonth(attempt,['startedAt','submittedAt','reviewedAt'],'2026-10'),false);
  const backend=read('functions/index.js');
  assert.match(backend,/rows\.filter\(row=>rowMatchesMonth\(row,fields,monthKey\)/);
});

test('attendance and an ungraded homework cannot award a strong academic title',()=>{
  const report=calculateMonthlyReport({
    monthKey:'2026-09',now:new Date('2026-09-25T12:00:00Z'),student:{studentCode:'ST-123456',scheduleId:'g1'},sessionsComplete:true,
    sessions:[{id:'s1',scheduleId:'g1',date:'2026-09-01'},{id:'s2',scheduleId:'g1',date:'2026-09-08'}],
    attendance:[{id:'a1',classSessionId:'s1',scheduleId:'g1',date:'2026-09-01',status:'present'},{id:'a2',classSessionId:'s2',scheduleId:'g1',date:'2026-09-08',status:'present'}],
    assignments:[{id:'hw1',title:'واجب سبتمبر',dueDate:'2026-09-20',totalScore:15}],
    homeworks:[{id:'sub1',assignmentId:'hw1',submittedAt:'2026-09-10',score:null,maxScore:15,status:'pending_review',needsManualReview:true}]
  });
  assert.equal(report.academicScore,null);
  assert.equal(report.academicEvidenceSufficient,false);
  assert.equal(report.monthlyTitle,'نجم الحضور');
  assert.doesNotMatch(report.monthlyTitle,/^(متفوق الشهر|مبرمج الشهر|المهندس البارع)$/);
});

test('scheduled group days remain in the monthly attendance denominator',()=>{
  const report=calculateMonthlyReport({
    monthKey:'2026-09',now:new Date('2026-09-21T12:00:00Z'),student:{studentCode:'ST-123456',scheduleId:'g1'},sessionsComplete:true,
    sessions:[
      {id:'g1-01',scheduleId:'g1',date:'2026-09-01'},
      {id:'g1-04',scheduleId:'g1',date:'2026-09-04'},
      {id:'g1-08',scheduleId:'g1',date:'2026-09-08'},
      {id:'g1-11',scheduleId:'g1',date:'2026-09-11'}
    ],
    attendance:[
      {id:'a1',classSessionId:'g1-01',scheduleId:'g1',date:'2026-09-01',status:'present'},
      {id:'a2',classSessionId:'g1-04',scheduleId:'g1',date:'2026-09-04',status:'absent'},
      {id:'a3',classSessionId:'g1-08',scheduleId:'g1',date:'2026-09-08',status:'late'}
    ]
  });
  assert.equal(report.attendance.required,4);
  assert.equal(report.attendance.present,1);
  assert.equal(report.attendance.absent,1);
  assert.equal(report.attendance.late,1);
  assert.equal(report.attendance.unrecorded,1);
  assert.equal(report.attendance.percentage,50);
});

test('homework grades use real submissions and review activity dates',()=>{
  const report=calculateMonthlyReport({
    monthKey:'2026-09',student:{studentCode:'ST-123456'},
    assignments:[{id:'hw1',title:'واجب المنصة',totalScore:15,dueDate:'2026-09-20'}],
    homeworks:[{id:'sub1',assignmentId:'hw1',submittedAt:'2026-09-10',reviewedAt:'2026-09-12',score:14,maxScore:15,status:'تم تصحيح الواجب',approved:true}]
  });
  assert.equal(report.homework.required,1);
  assert.equal(report.homework.submitted,1);
  assert.equal(report.homework.graded,1);
  assert.equal(report.homework.averageGrade,93);
  const backend=read('functions/index.js');
  assert.match(backend,/dateFields:\['submittedAt','reviewedAt','gradedAt','updatedAt'\]/);
  assert.match(backend,/generatedFromGroupSchedule:true/);
});

test('backend unions legacy attendance identities and activity dates with bounded queries',()=>{
  const backend=read('functions/index.js');
  assert.match(backend,/legacyFields\.map\(field=>db\.collection\(collection\)\.where\(field,'==',studentCode\)\.get\(\)\)/);
  assert.match(backend,/const rows=await reportRowsByStudent\(collection,studentCode,studentFields\)/);
  assert.match(backend,/monthKeys\.some\(monthKey=>rowMatchesMonth\(row,dateFields,monthKey\)\)/);
  assert.doesNotMatch(backend,/dateFields\.map\(dateField=>reportRowsForPeriod/);
  assert.match(backend,/dateFields:\['date','submittedAt','reviewedAt','updatedAt'\]/);
  assert.match(backend,/dateFields:\['startedAt','submittedAt','reviewedAt','updatedAt'\]/);
  assert.match(backend,/reportReferencedDocuments\('assignments'/);
  assert.match(backend,/motivation_monthly','motivation_transactions'/);
  assert.match(backend,/historicalScheduleIds=\[\.\.\.new Set\(\[scheduleId,[\s\S]*\]\.map\(String\)\.filter\(Boolean\)\)\]/);
});

test('student profile does not wait for a cold full-platform leaderboard rebuild',()=>{
  const backend=read('functions/index.js'),start=backend.indexOf('exports.getStudentAdminProfile ='),end=backend.indexOf('\nexports.',start+1),source=backend.slice(start,end);
  assert.match(source,/availableStudentReportRanking\(found\.data,periodKey\)/);
  assert.doesNotMatch(source,/studentReportRanking\(found\.data,periodKey\)/);
  assert.match(source,/profileResults=normalizeUnifiedResults/);
  assert.match(source,/homeworks:monthlyReport\.homework\.rows/);
  assert.match(backend,/legacy\/orphan submission visible/);
});

test('unified profile shows motivation transactions and delegates tab navigation',()=>{
  const ui=read('assets/v64-admin-operations.js');
  assert.match(ui,/profile\.motivationTransactions/);
  assert.match(ui,/تم عكس الحركة/);
  assert.match(ui,/event\.target\.closest\('\[data-profile-view\]'\)/);
  assert.match(ui,/rankScopeLabel/);
});

test('parent report uses the backend monthly object across HTML text message and PNG',()=>{
  const app=read('assets/app.js');
  const parent=read('parent.html');
  assert.match(app,/اللقب الشهري: \$\{parentReportTitleIcon\(title\)\} \$\{title\}/);
  assert.match(app,/parent-report-header-v70[\s\S]*report\.monthlyTitle/);
  assert.match(app,/ترتيب المسار: \$\{parentReportRankText\(motivation\)\}/);
  assert.match(app,/ترتيب المجموعة: \$\{parentReportRankText\(motivation,'group'\)\}/);
  assert.doesNotMatch(app,/ترتيب المنصة:/);
  assert.match(app,/canvas\.width=width;canvas\.height=height/);
  assert.match(app,/width=1080,height=1350/);
  assert.match(app,/\(results\.rows\|\|\[\]\)\.slice\(0,3\)/);
  assert.match(app,/trend\.previousScore/);
  assert.match(app,/نقطة مئوية عن الشهر السابق/);
  assert.match(parent,/family=Cairo/);
});

test('client overall has no legacy weighted fallback',()=>{
  const app=read('assets/app.js');
  assert.doesNotMatch(app,/attendancePct\s*\*\s*\.3/);
  assert.doesNotMatch(app,/examGradeAvg\s*\*\s*\.4/);
  assert.match(app,/monthlyOverall===null\|\|monthlyOverall===undefined\|\|monthlyOverall===''\?null/);
  assert.match(app,/لن نعرض أرقامًا تقديرية قبل وصول بيانات الشهر من المصدر الموحّد/);
});
