'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {calculateMonthlyReport}=require('../functions/lib/monthly-report');
const {actualSessionsForStudent,membershipAt}=require('../functions/lib/monthly-report');
const {normalizeUnifiedResults}=require('../functions/lib/portal-results');

function month(input={}){
  return calculateMonthlyReport({monthKey:'2026-09',now:'2026-10-01',student:{studentCode:'ST-123456',scheduleId:'group-1',createdAt:'2026-08-10'},sessionsComplete:true,...input});
}
const session=(id,date)=>({id,scheduleId:'group-1',date,status:'closed'});
const attendance=(id,date,status,updatedAt='2026-09-12')=>({classSessionId:id,scheduleId:'group-1',date,status,updatedAt});

test('one actual session awards +2 or -2, duplicates and edits settle on the final status',()=>{
  const sessions=[session('s1','2026-09-10')];
  assert.equal(month({sessions,attendance:[attendance('s1','2026-09-10','present')]}).motivation.attendancePoints,2);
  assert.equal(month({sessions,attendance:[attendance('s1','2026-09-10','absent')]}).motivation.attendancePoints,-2);
  assert.equal(month({sessions,attendance:[attendance('s1','2026-09-10','present'),attendance('s1','2026-09-10','present')]}).motivation.attendancePoints,2);
  const changed=month({sessions,attendance:[attendance('s1','2026-09-10','present','2026-09-11'),attendance('s1','2026-09-10','absent','2026-09-13')]});
  assert.equal(changed.motivation.attendancePoints,-2);
  assert.equal(changed.attendance.absent,1);
  assert.equal(month({sessions:[]}).motivation.attendancePoints,0);
});

test('exam and homework regrading keep one final grade, no duplicate automatic transactions',()=>{
  const exam={id:'e1',examId:'exam-1',score:8,maxScore:10,submittedAt:'2026-09-10',reviewedAt:'2026-09-16'};
  const homework={id:'h1',assignmentId:'assignment-1',score:9,maxScore:10,submittedAt:'2026-09-12',reviewedAt:'2026-09-18'};
  const input={examAttempts:[{...exam,score:6,reviewedAt:'2026-09-14'},exam],
    grades:[{id:'old-grade',examId:'exam-1',score:2,maxScore:10,date:'2026-09-10'}],
    assignments:[{id:'assignment-1',title:'واجب',publishAt:'2026-09-01'}],
    homeworks:[{...homework,score:4,reviewedAt:'2026-09-15'},homework]};
  const first=month(input),repeated=month(input);
  assert.equal(first.results.gradedCount,1);assert.equal(first.results.average,80);
  assert.equal(first.homework.graded,1);assert.equal(first.homework.averageGrade,90);
  assert.equal(first.overallScore,repeated.overallScore);
  assert.equal(first.motivation.manualPoints,0);
  assert.equal(first.motivation.totalPoints,repeated.motivation.totalPoints);
});

test('level handles strong evidence and no exam as unknown academic data, without payment influence',()=>{
  const sessions=[session('s1','2026-09-10'),session('s2','2026-09-17')],att=sessions.map(row=>attendance(row.id,row.date,'present'));
  const strong=month({sessions,attendance:att,examAttempts:[{id:'e1',examId:'e1',score:9,maxScore:10,submittedAt:'2026-09-12'}],assignments:[{id:'h1',publishAt:'2026-09-01'}],homeworks:[{id:'h1a',assignmentId:'h1',score:9,maxScore:10,submittedAt:'2026-09-13'}],motivationSummary:{totalPoints:3,transactionCount:1}});
  assert.equal(strong.level,'ممتاز');assert.equal(strong.motivation.attendancePoints,4);assert.equal(strong.motivation.totalPoints,7);
  const absentExam=month({sessions,attendance:att});
  assert.equal(absentExam.results.average,null);assert.equal(absentExam.academicScore,null);
  assert.equal(absentExam.academicLevel,'بيانات غير كافية');
  assert.equal(absentExam.overallScore,100);
  assert.match(month().summaryNote,/لا تكفي لتقييم/);
  assert.equal(strong.level,month({sessions,attendance:att,examAttempts:[{id:'e1',examId:'e1',score:9,maxScore:10,submittedAt:'2026-09-12'}],assignments:[{id:'h1',publishAt:'2026-09-01'}],homeworks:[{id:'h1a',assignmentId:'h1',score:9,maxScore:10,submittedAt:'2026-09-13'}],motivationSummary:{totalPoints:3},payment:{status:'unpaid',paidAmount:0}}).level);
});

test('warnings require real due work or active absence and disappear when corrected',()=>{
  const sessions=[session('s1','2026-09-10'),session('s2','2026-09-17'),session('s3','2026-09-24')];
  const old=[attendance('s1','2026-09-10','absent'),attendance('s2','2026-09-17','absent')];
  assert.match(month({sessions,attendance:old}).concerns.join(' '),/تحذير غياب/);
  assert.doesNotMatch(month({sessions,attendance:[...old,attendance('s3','2026-09-24','present')]}).concerns.join(' '),/تحذير غياب/);
  assert.doesNotMatch(month({sessions:[],assignments:[]}).concerns.join(' '),/واجب/);
  assert.doesNotMatch(month({sessions:[],examAttempts:[]}).concerns.join(' '),/متوسط الاختبارات/);
  const missing=month({assignments:[{id:'h1',title:'واجب',dueDate:'2026-09-10',publishAt:'2026-09-01'}]});
  assert.match(missing.concerns.join(' '),/واجب مستحق/);
  const resolved=month({assignments:[{id:'h1',title:'واجب',dueDate:'2026-09-10',publishAt:'2026-09-01'}],homeworks:[{assignmentId:'h1',submittedAt:'2026-09-11'}]});
  assert.doesNotMatch(resolved.concerns.join(' '),/واجب مستحق/);
});

function manualLedger(){
  const backend=fs.readFileSync(require.resolve('../functions/index.js'),'utf8');
  const code=backend.slice(backend.indexOf('function motivationPeriodId('),backend.indexOf('function publicExamSession('));
  const docs=new Map([['students/ST-123456',{studentCode:'ST-123456',name:'طالب',grade:'برمجة',active:true}]]);
  const ref=(name,id)=>({name,id:id||crypto.randomUUID(),get:async()=>snapshot(name,id)});
  const snapshot=(name,id)=>{const value=docs.get(`${name}/${id}`);return {id,exists:!!value,data:()=>value?structuredClone(value):undefined};};
  let serial=Promise.resolve(),dirtied=0;
  const db={collection:name=>({doc:id=>ref(name,id),where:(field,op,value)=>({name,field,value,limit(){return this;},get:async()=>({docs:[...docs].filter(([key,row])=>key.startsWith(`${name}/`)&&row[field]===value).map(([key,row])=>({id:key.slice(name.length+1),data:()=>row}))})})}),runTransaction:fn=>{
    const task=serial.then(async()=>{const writes=[],tx={get:async r=>snapshot(r.name,r.id),create:(r,value)=>writes.push([r,value]),set:(r,value)=>writes.push([r,value])};await fn(tx);for(const [r,value] of writes){const key=`${r.name}/${r.id}`;docs.set(key,{...docs.get(key),...value});}});
    serial=task.catch(()=>{});return task;
  }};
  class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
  const context={exports:{},db,FieldValue:{serverTimestamp:()=> '2026-09-21T00:00:00Z'},HttpsError,
    onCall:(_options,handler)=>handler,onSchedule:(_options,handler)=>handler,CALLABLE_OPTIONS:{},
    requireStaff:async()=>({uid:'admin-1',email:'admin@example.org'}),rateLimit:async()=>{},
    text:(value,length)=>String(value??'').slice(0,length||1000),normalizeCode:value=>String(value??''),cleanDocId:value=>value,
    validLegacyOrStrongCode:value=>!!value,validPaymentAcademicYear:value=>value==='2026/2027',
    PAYMENT_MONTH_NAMES:['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
    hash:value=>crypto.createHash('sha256').update(value).digest('hex'),firestoreMillis:value=>Date.parse(value)||0,
    invalidateStudentReportInTransaction:()=>{},markLeaderboardDirty:async()=>{dirtied++;},
    leaderboardPeriod:(year,month)=>({academicYear:year||'2026/2027',monthName:month||'سبتمبر',monthKey:'2026-09'}),
    previousPeriodFor:()=>({academicYear:'2026/2027',monthName:'أغسطس'}),
    leaderboardRowsForPeriod:async()=>[],enrichLeaderboardRows:rows=>rows,
    canonicalAcademicLabel:value=>value,canonicalLeaderboardGrade:value=>value,
    ACADEMIC_GRADES:[],onSchedule:(_opt,handler)=>handler,console};
  vm.runInNewContext(code,context);
  const add=(requestId,points=5)=>context.exports.addStudentMotivationPoints({data:{studentCode:'ST-123456',academicYear:'2026/2027',month:'سبتمبر',points,reason:'مشاركة',notes:'تقدير المعلم',requestId}});
  const reverse=(transactionId,requestId)=>context.exports.reverseStudentMotivationTransaction({data:{transactionId,requestId,reason:'تصحيح'}});
  return {add,reverse,docs,functions:context.exports,dirtied:()=>dirtied};
}

test('manual transaction is attributable and idempotent; reverse updates monthly total once',async()=>{
  const ledger=manualLedger();
  const [first,retry]=await Promise.all([ledger.add('request-1'),ledger.add('request-1')]);
  assert.equal([first,retry].filter(row=>row.duplicate).length,1);
  assert.equal(first.transaction.source,'manual');assert.equal(first.transaction.recordedByUid,'admin-1');
  assert.equal(ledger.dirtied(),1);
  await assert.rejects(ledger.add('request-1',10),{code:'already-exists'});
  const after=await ledger.add('request-2',2);
  assert.equal(after.totalPoints,7);
  const reversal=await ledger.reverse(first.transaction.id,'reverse-1');
  assert.equal(reversal.totalPoints,2);
  const second=await ledger.reverse(first.transaction.id,'reverse-1');assert.equal(second.duplicate,true);
  assert.equal(ledger.dirtied(),3);
  const history=await ledger.functions.getStudentMotivationAdmin({data:{studentCode:'ST-123456'}});
  assert.equal(history.summaries[0].totalPoints,2);
  assert.equal(history.transactions.filter(row=>row.reversalOf===first.transaction.id).length,1);
  assert.equal(history.transactions.find(row=>row.reversalOf===first.transaction.id).source,'manual_reversal');
  assert.equal(month({motivationSummary:ledger.docs.get([...ledger.docs.keys()].find(key=>key.startsWith('motivation_monthly/')))}).motivation.totalPoints,2);
});

test('profile, portal, monthly report and leaderboard reference the same level and points',()=>{
  const backend=fs.readFileSync(require.resolve('../functions/index.js'),'utf8');
  const portal=fs.readFileSync(require.resolve('../assets/app.js'),'utf8');
  const admin=fs.readFileSync(require.resolve('../assets/v64-admin-operations.js'),'utf8');
  const adminForm=fs.readFileSync(require.resolve('../assets/admin.js'),'utf8');
  const studentEditor=fs.readFileSync(require.resolve('../assets/v63-admin-experience.js'),'utf8');
  assert.match(backend,/const monthlyEvaluation=calculateMonthlyReport\(/);
  assert.match(backend,/level:monthlyEvaluation\.level/);
  assert.match(backend,/attendancePoints=monthlyEvaluation\.motivation\.attendancePoints/);
  assert.match(backend,/missingHomeworkCount=monthlyEvaluation\.homework\.missing/);
  assert.match(backend,/archiveLeaderboardPeriod\(period\)[\s\S]*recalculate:true/);
  assert.match(backend,/refreshFrozenMotivationMonth\(result\.academicYear, result\.month\)/);
  assert.match(portal,/const motivationCurrent=monthlyReport\?\.motivation\|\|null/);
  assert.match(portal,/monthlyReport\.concerns\.slice\(0,2\)/);
  assert.match(admin,/report\.concerns\|\|\[\]/);
  assert.match(backend,/cached\?\.report\?\.schemaVersion===11&&cached\.report\.policyVersion==='monthly-v11-student-level-homework-progress'/);
  assert.match(adminForm,/requestId:form\.dataset\.motivationRequestId/);
  assert.match(studentEditor,/requestId:motivationForm\.dataset\.motivationRequestId/);
  assert.match(studentEditor,/نقاط يدوية ·/);
  assert.match(adminForm,/loadAccurateMonthlyReport\(s\)/);
  assert.match(adminForm,/getStudentMotivationAdmin\?\.\(code\)/);
  assert.match(backend,/alertsOnly===true\?rows\.filter/);
  assert.match(backend,/\{studentCode,scheduleId,group,activeAbsenceDates,\.\.\.row\}/);
});

function leaderboardHarness(){
  const backend=fs.readFileSync(require.resolve('../functions/index.js'),'utf8');
  const code=backend.slice(backend.indexOf('const canonicalLeaderboardGrade ='),backend.indexOf('async function currentLeaderboardRows()'));
  const data={students:[{studentCode:'ST-123456',name:'طالب',grade:'برمجة',scheduleId:'group-1',active:true,createdAt:'2026-08-01'}],
    attendance:[attendance('s1','2026-09-10','present')],grades:[],exam_attempts:[{id:'attempt-1',studentCode:'ST-123456',examId:'exam-1',status:'graded',score:8,maxScore:10,submittedAt:'2026-09-15'}],
    homework_submissions:[],recitations:[],assignments:[],motivation_monthly:[{studentCode:'ST-123456',academicYear:'2026/2027',month:'سبتمبر',totalPoints:5}],
    exam_absences:[],class_sessions:[session('s1','2026-09-10')],student_transfer_requests:[],leaderboard_archives:[]};
  for(const rows of Object.values(data))for(const row of rows)if(!row.studentCode&&['attendance','class_sessions'].length&&row.classSessionId)row.studentCode='ST-123456';
  let version=1,current='2026-09-23';
  const snap=rows=>({docs:rows.map((row,index)=>({id:row.id||String(index),data:()=>row})),empty:rows.length===0});
  function query(name){const filters=[];return {where(field,op,value){filters.push([field,op,value]);return this;},limit(){return this;},async get(){return snap((data[name]||[]).filter(row=>filters.every(([field,op,value])=>op==='=='?row[field]===value:op==='>='?row[field]>=value:row[field]<value)));}};}
  const db={collection:name=>({where:(field,op,value)=>query(name).where(field,op,value),doc:()=>({get:async()=>({exists:true,data:()=>name==='settings'?{}:{}})})})};
  const leaderboardStateRef={get:async()=>({exists:true,data:()=>({version})})};
  const context={db,leaderboardStateRef,leaderboardCacheByPeriod:new Map(),
    ACADEMIC_GRADES:['برمجة'],PAYMENT_MONTH_NAMES:['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
    cairoDateKey:value=>value instanceof Date?current:value?String(value).slice(0,10):current,
    normalizeCode:value=>String(value||''),text:value=>String(value||''),canonicalAcademicLabel:value=>value,
    calculateMonthlyReport,actualSessionsForStudent,membershipAt,normalizeUnifiedResults,
    leaderboardRecordDate:row=>String(row.submittedAt||row.date||row.examDate||row.createdAt||''),
    assignmentIsReleased:()=>true,learningTargetMatchesStudent:()=>true,contentAvailableAfterStudentJoined:()=>true,
    publicStudentName:value=>value,
    fetchAllCollectionDocuments:async(name,configure=q=>q)=>configure(query(name)).get(),
    HttpsError:class extends Error{}};
  vm.runInNewContext(`${code}\nthis.getRows=leaderboardRowsForPeriod;`,context);
  return {data,context,month:()=>context.getRows('2026/2027','سبتمبر'),advance:()=>{version++;},setCurrent:value=>{current=value;}};
}

test('leaderboard derives attendance and level from the report and refreshes after reverse or attendance edit',async()=>{
  const board=leaderboardHarness(),row=(await board.month())[0];
  assert.equal(row.attendancePoints,2);assert.equal(row.motivationPoints,7);
  const reference=month({sessions:[session('s1','2026-09-10')],attendance:[attendance('s1','2026-09-10','present')],examAttempts:board.data.exam_attempts,motivationSummary:board.data.motivation_monthly[0]});
  assert.equal(row.level,reference.level);
  board.data.motivation_monthly[0].totalPoints=0;board.advance();
  assert.equal((await board.month())[0].motivationPoints,2);
  board.data.attendance[0].status='absent';board.data.attendance.push({...board.data.attendance[0],id:'duplicate'});board.advance();
  const revised=(await board.month())[0];
  assert.equal(revised.motivationPoints,-2);assert.equal(revised.attendancePoints,-2);
  assert.equal(revised.level,month({sessions:[session('s1','2026-09-10')],attendance:[attendance('s1','2026-09-10','absent')],examAttempts:board.data.exam_attempts}).level);
});

test('leaderboard uses attendance percentage once while retaining +/-2 in motivation and capping manual bonus',async()=>{
  const board=leaderboardHarness();
  board.data.motivation_monthly[0].totalPoints=0;
  const present=(await board.month())[0];
  assert.equal(present.attendancePct,100);
  assert.equal(present.attendancePoints,2);
  assert.equal(present.motivationPoints,2);
  assert.equal(present.score,present.baseScore+present.motivationBonus-present.penaltyTotal);
  assert.equal(present.motivationBonus,0);
  board.data.attendance[0].status='absent';board.advance();
  const absent=(await board.month())[0];
  assert.equal(absent.attendancePct,0);
  assert.equal(absent.attendancePoints,-2);
  assert.equal(absent.motivationPoints,-2);
  assert.equal(absent.penaltyReasons.some(reason=>/غياب حص/.test(reason.label)),false);
  assert.equal(absent.score,Math.max(0,absent.baseScore+absent.motivationBonus-absent.penaltyTotal));
  board.data.motivation_monthly[0].totalPoints=1000;board.advance();
  const bonus=(await board.month())[0];
  assert.equal(bonus.motivationBonus,5);
  assert.equal(bonus.motivationPoints,998);
});

test('one admin batch returns report-derived metrics for selected month with 100% attendance and 3/4 homework',async()=>{
  const board=leaderboardHarness();
  board.data.class_sessions=Array.from({length:8},(_,index)=>session(`s${index+1}`,`2026-09-${String(index+3).padStart(2,'0')}`));
  board.data.attendance=board.data.class_sessions.map(row=>({...attendance(row.id,row.date,'present'),studentCode:'ST-123456'}));
  board.data.assignments=Array.from({length:4},(_,index)=>({id:`h${index+1}`,title:`واجب ${index+1}`,publishAt:`2026-09-${String(index+3).padStart(2,'0')}`}));
  board.data.homework_submissions=board.data.assignments.slice(0,3).map((row,index)=>({assignmentId:row.id,studentCode:'ST-123456',submittedAt:`2026-09-${String(index+10).padStart(2,'0')}`,status:'submitted'}));
  const rows=await board.context.getRows('2026/2027','سبتمبر',{includeAll:true});
  assert.equal(rows.length,1);
  assert.equal(rows[0].attendancePct,100);
  assert.equal(rows[0].homeworkPct,75);
  const backend=fs.readFileSync(require.resolve('../functions/index.js'),'utf8');
  const callable=backend.slice(backend.indexOf('exports.getAdminStudentMetricsBatch ='),backend.indexOf('function enrichLeaderboardRows('));
  let calls=0;
  const context={exports:{},CALLABLE_OPTIONS:{},onCall:(_config,handler)=>handler,requireStaff:async()=>({uid:'staff'}),rateLimit:async()=>{},text:value=>String(value||''),validPaymentAcademicYear:value=>value==='2026/2027',PAYMENT_MONTH_NAMES:['سبتمبر'],HttpsError:class extends Error{},leaderboardPeriod:()=>({monthKey:'2026-09'}),leaderboardRowsForPeriod:async(...args)=>{calls++;assert.equal(args[0],'2026/2027');assert.equal(args[1],'سبتمبر');assert.equal(args[2].includeAll,true);return rows;}};
  vm.runInNewContext(callable,context);
  const response=await context.exports.getAdminStudentMetricsBatch({data:{academicYear:'2026/2027',month:'سبتمبر'}});
  assert.equal(calls,1);
  assert.equal(response.monthKey,'2026-09');
  assert.equal(response.metricsByStudent['ST-123456'].attendancePercentage,100);
  assert.equal(response.metricsByStudent['ST-123456'].resultsAverage,80);
  assert.equal(response.metricsByStudent['ST-123456'].homeworkCompletionPercentage,75);
});

test('archived leaderboard is bypassed after the source revision changes, without writing other months',async()=>{
  const board=leaderboardHarness();board.setCurrent('2026-10-02');
  board.data.leaderboard_archives=[{monthKey:'2026-09',sourceVersion:1,rows:[{studentCode:'ST-123456',motivationPoints:99,score:99}]}];
  assert.equal((await board.month())[0].motivationPoints,99);
  board.data.motivation_monthly[0].totalPoints=0;board.advance();
  assert.equal((await board.month())[0].motivationPoints,2);
  assert.equal(board.data.leaderboard_archives[0].sourceVersion,1);
});

test('admin alert counts require a real overdue assignment or an active absence streak',async()=>{
  const board=leaderboardHarness();
  assert.equal((await board.month())[0].missingHomeworkCount,0);
  board.data.assignments.push({id:'h1',grade:'برمجة',publishAt:'2026-09-01',dueDate:'2026-09-05'});
  board.data.class_sessions.push(session('s2','2026-09-17'),session('s3','2026-09-20'));
  board.data.attendance.push({...attendance('s2','2026-09-17','absent'),studentCode:'ST-123456'},
    {...attendance('s3','2026-09-20','absent'),studentCode:'ST-123456'});
  board.advance();
  const risky=(await board.month())[0];
  assert.equal(risky.missingHomeworkCount,1);assert.equal(risky.maxAbsenceStreak,2);
  board.data.homework_submissions.push({studentCode:'ST-123456',assignmentId:'h1',submittedAt:'2026-09-08',status:'submitted'});
  board.data.attendance.find(row=>row.classSessionId==='s3').status='present';board.advance();
  const resolved=(await board.month())[0];
  assert.equal(resolved.missingHomeworkCount,0);assert.equal(resolved.maxAbsenceStreak,0);
});

test('admin warning list reads the same active session streak as the leaderboard',async()=>{
  const admin=fs.readFileSync(require.resolve('../assets/admin.js'),'utf8');
  const code=admin.slice(admin.indexOf("let warningLeaderboardRows=[]"),admin.indexOf('function absenceWhatsAppText('));
  let current=[{studentCode:'ST-123456',studentName:'طالب',maxAbsenceStreak:2,activeAbsenceDates:['2026-09-10','2026-09-17']}];
  const context={adminData:{students:[{studentCode:'ST-123456',name:'طالب',active:true}]},
    window:{MFCloud:{getMotivationLeaderboardAdmin:async()=>current}},
    currentSection:'warnings',adminWorkspaceContext:()=>({academicYear:'2026/2027',month:'سبتمبر'}),
    stCode:row=>row.studentCode,normalizeStudent:row=>row,applyWarningFilters:()=>{},
    document:{getElementById:()=>null},adminActionErrorMessage:()=>''};
  vm.runInNewContext(`${code}\nthis.warningRows=warningRows;this.loadWarnings=loadWarningLeaderboardRows;`,context);
  await context.loadWarnings();assert.equal(context.warningRows()[0].warning.count,2);
  current=[{...current[0],maxAbsenceStreak:0,activeAbsenceDates:[]}];
  await context.loadWarnings();assert.equal(context.warningRows().length,0);
});
