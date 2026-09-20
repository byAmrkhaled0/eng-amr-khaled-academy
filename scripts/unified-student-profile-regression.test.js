'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {calculateMonthlyReport}=require('../functions/lib/monthly-report');

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

test('backend unions legacy attendance identities and activity dates with bounded queries',()=>{
  const backend=read('functions/index.js');
  assert.match(backend,/legacyFields\.map\(field=>db\.collection\(collection\)\.where\(field,'==',studentCode\)\.get\(\)\)/);
  assert.match(backend,/dateFields:\['date','reviewedAt'\]/);
  assert.match(backend,/dateFields:\['submittedAt','reviewedAt'\]/);
  assert.match(backend,/reportReferencedDocuments\('assignments'/);
  assert.match(backend,/motivation_monthly','motivation_transactions'/);
});

test('unified profile shows motivation transactions and delegates tab navigation',()=>{
  const ui=read('assets/v64-admin-operations.js');
  assert.match(ui,/profile\.motivationTransactions/);
  assert.match(ui,/تم عكس الحركة/);
  assert.match(ui,/event\.target\.closest\('\[data-profile-view\]'\)/);
  assert.match(ui,/rankScopeLabel/);
});
