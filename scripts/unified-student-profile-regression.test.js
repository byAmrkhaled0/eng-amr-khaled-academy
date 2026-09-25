'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {calculateMonthlyReport,rowMatchesMonth,actualSessionsForStudent}=require('../functions/lib/monthly-report');
const {configuredScheduleDays}=require('../functions/lib/attendance-domain');
const {normalizeUnifiedResults}=require('../functions/lib/portal-results');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('eight actual sessions calculate 100% or 87.5% and a new session changes the denominator',()=>{
  const student={studentCode:'ST-123456',scheduleId:'group-a',createdAt:'2026-08-01'};
  const sessions=Array.from({length:8},(_,i)=>({id:`s${i}`,scheduleId:'group-a',date:`2026-09-${String(i+1).padStart(2,'0')}`,status:'closed'}));
  const attendance=sessions.map((session,i)=>({classSessionId:session.id,scheduleId:'group-a',date:session.date,status:i===7?'absent':'present'}));
  const report=(rows,classSessions=sessions)=>calculateMonthlyReport({student,monthKey:'2026-09',now:'2026-09-20',sessions:classSessions,sessionsComplete:true,attendance:rows});
  assert.equal(report(attendance.map(row=>({...row,status:'present'}))).attendance.percentage,100);
  assert.equal(report(attendance).attendance.required,8);
  assert.equal(report(attendance).attendance.percentage,87.5);
  const ninth={id:'s8',scheduleId:'group-a',date:'2026-09-09',status:'closed'};
  assert.equal(report(attendance,[...sessions,ninth]).attendance.required,9);
  assert.equal(report(attendance,[...sessions,ninth]).attendance.absent,2);
  assert.equal(report(attendance,[...sessions,ninth]).attendance.percentage,77.8);
  const cancelled={id:'cancelled',scheduleId:'group-a',date:'2026-09-10',status:'cancelled'};
  assert.equal(report(attendance,[...sessions,cancelled]).attendance.required,8);
  assert.equal(report([],[]).attendance.percentage,null);
  assert.equal(report([],[]).attendance.required,0);
});

test('joining midmonth, transfer and duplicate or edited attendance respect actual sessions',()=>{
  const sessions=[{id:'old-1',scheduleId:'old',date:'2026-09-01',status:'closed'},
    {id:'old-2',scheduleId:'old',date:'2026-09-06',status:'closed'},
    {id:'new-1',scheduleId:'new',date:'2026-09-11',status:'closed'}];
  const student={studentCode:'ST-123456',scheduleId:'new',group:'جديد',createdAt:'2026-09-05'};
  const transfers=[{status:'approved',currentScheduleId:'old',currentGroup:'قديم',targetScheduleId:'new',effectiveAt:'2026-09-10'}];
  const attendance=[{id:'old-absent',classSessionId:'old-2',scheduleId:'old',date:'2026-09-06',status:'absent',updatedAt:'2026-09-06T09:00:00Z'},
    {id:'old-present',classSessionId:'old-2',scheduleId:'old',date:'2026-09-06',status:'present',updatedAt:'2026-09-12T09:00:00Z'},
    {id:'new-present',classSessionId:'new-1',scheduleId:'new',date:'2026-09-11',status:'present'}];
  const input={student,monthKey:'2026-09',now:'2026-09-20',sessions,sessionsComplete:true,transfers,attendance};
  const result=calculateMonthlyReport(input);
  assert.equal(result.attendance.required,2);
  assert.equal(result.attendance.present,2);
  assert.equal(result.attendance.absent,0);
  assert.equal(result.attendance.percentage,100);
  assert.equal(result.motivation.attendancePoints,4);
  assert.equal(calculateMonthlyReport({...input,attendance:attendance.slice(0,1).concat(attendance.slice(2))}).motivation.attendancePoints,0);
  assert.equal(actualSessionsForStudent(student,sessions,attendance,transfers).length,2);
});

test('legacy attendance proves one real session without creating all recurring weekdays',()=>{
  const student={studentCode:'ST-123456',scheduleId:'group-a',scheduleDays:'الثلاثاء والجمعة'};
  const attendance=[{date:'2026-09-08',scheduleId:'group-a',status:'present'},
    {date:'2026-09-08',scheduleId:'group-a',status:'present'}];
  const sessions=actualSessionsForStudent(student,[],attendance,[]);
  assert.equal(sessions.length,1);
  const report=calculateMonthlyReport({student,monthKey:'2026-09',now:'2026-09-20',sessions,sessionsComplete:true,attendance});
  assert.equal(report.attendance.required,1);
  assert.equal(report.attendance.percentage,100);
  assert.equal(report.motivation.attendancePoints,2);
});

test('one legacy attendance row cannot mark two actual sessions on the same day',()=>{
  const student={studentCode:'ST-123456',scheduleId:'group-a'};
  const sessions=[{id:'morning',date:'2026-09-08',scheduleId:'group-a'},
    {id:'evening',date:'2026-09-08',scheduleId:'group-a'}];
  const report=calculateMonthlyReport({student,monthKey:'2026-09',now:'2026-09-09',sessions,sessionsComplete:true,
    attendance:[{id:'legacy',date:'2026-09-08',scheduleId:'group-a',status:'present'}]});
  assert.equal(report.attendance.required,2);
  assert.equal(report.attendance.present,1);
  assert.equal(report.attendance.absent,1);
  assert.equal(report.attendance.percentage,50);
  assert.equal(report.motivation.attendancePoints,0);
});

test('admin dashboard, leaderboard, portal and report use the server attendance result',()=>{
  const backend=read('functions/index.js'),app=read('assets/app.js');
  assert.match(backend,/const monthlyEvaluation=calculateMonthlyReport\(\{monthKey:period\.monthKey/);
  assert.match(backend,/const attendanceResult=monthlyEvaluation\.attendance/);
  assert.match(backend,/const result=calculateMonthlyReport\(\{student,monthKey:date\.slice\(0,7\)/);
  assert.match(backend,/const current=calculateMonthlyReport\(monthlyReportInput\(student,source,monthKey\)\)/);
  assert.match(app,/const attendancePct = monthly\?\.attendance\?\.percentage\?\?null/);
  assert.match(app,/summary=monthlyReport\?\.monthKey===key\?monthlyReport\.attendance:null/);
});

test('monthly report attributes assessments to submission month and payment to billing period',()=>{
  const backend=read('functions/index.js');
  const code=backend.slice(backend.indexOf('function monthlyReportInput('),backend.indexOf('async function buildStudentMonthlyReport('));
  const dateKey=value=>value?String(value).slice(0,10):'';
  const reportMonthForRow=(row,fields=[])=>{
    for(const field of [...fields,'date','submittedAt','createdAt','updatedAt'])if(row[field])return dateKey(row[field]).slice(0,7);
    return '';
  };
  const context={rowMatchesMonth,reportMonthForRow,reportPreviousMonthKey:()=> '2026-08',
    periodFromMonthKey:()=>({academicYear:'2026/2027',monthName:'سبتمبر'}),
    leaderboardPeriod:()=>({monthKey:'2026-09'}),reportPublicRows:rows=>rows,
    money:Number,paymentStatus:()=> 'paid',text:String,reportIso:String};
  vm.createContext(context);
  vm.runInContext(`${code}\nthis.getInput=monthlyReportInput;this.available=reportAvailableMonths;`,context);
  const source={attendance:[],grades:[{id:'manual',date:'2026-08-20',reviewedAt:'2026-09-03'}],
    examAttempts:[{id:'exam',startedAt:'2026-08-30',submittedAt:'2026-08-31',reviewedAt:'2026-09-04'}],
    homeworks:[{id:'hw',assignmentId:'old-hw',submittedAt:'2026-08-31',gradedAt:'2026-09-05'}],
    payments:[{id:'pay',academicYear:'2026/2027',month:'سبتمبر',updatedAt:'2026-10-01',expectedAmount:100,paidAmount:100}],
    motivation:[],sessions:[],transfers:[],assignments:[],exams:[],recitations:[],progress:[],materials:[]};
  const august=context.getInput({},source,'2026-08'),september=context.getInput({},source,'2026-09');
  assert.equal(august.grades.length,1);
  assert.equal(august.examAttempts.length,1);
  assert.equal(august.homeworks.length,1);
  assert.equal(september.grades.length,0);
  assert.equal(september.examAttempts.length,0);
  assert.equal(september.homeworks.length,0);
  assert.equal(september.payment.paidAmount,100);
  assert.equal(august.payment,null);
  assert.equal(context.available(source,'2026-09').includes('2026-10'),false);
});

test('one historical student has consistent attendance, corrected exam, homework, payment and motivation',()=>{
  const backend=read('functions/index.js');
  const code=backend.slice(backend.indexOf('function monthlyReportInput('),backend.indexOf('async function buildStudentMonthlyReport('));
  const month=value=>String(value||'').slice(0,7);
  const reportMonthForRow=(row,fields=[])=>{
    for(const field of [...fields,'date','submittedAt','createdAt','updatedAt'])if(row[field])return month(row[field]);
    return '';
  };
  const context={rowMatchesMonth,reportMonthForRow,reportPreviousMonthKey:()=> '2026-07',
    periodFromMonthKey:key=>({academicYear:'2026/2027',monthName:key==='2026-08'?'أغسطس':'سبتمبر'}),
    leaderboardPeriod:(_year,monthName)=>({monthKey:monthName==='أغسطس'?'2026-08':'2026-09'}),
    reportPublicRows:rows=>rows,money:Number,paymentStatus:()=> 'paid',text:String,reportIso:String};
  vm.createContext(context);vm.runInContext(`${code}\nthis.input=monthlyReportInput;`,context);
  const student={studentCode:'ST-123456',studentName:'طالب تجريبي',scheduleId:'group-1',group:'مجموعة أ',createdAt:'2026-08-01'};
  const attempt={id:'attempt-1',examId:'exam-1',submittedAt:'2026-08-19',reviewedAt:'2026-09-03',score:18,maxScore:20,status:'corrected'};
  const homework={id:'hw-sub-1',assignmentId:'hw-1',submittedAt:'2026-08-20',reviewedAt:'2026-09-05',score:9,maxScore:10,status:'graded'};
  const source={sessions:[{id:'session-1',scheduleId:'group-1',date:'2026-08-18'}],sessionsComplete:true,transfers:[],
    attendance:[{id:'attendance-1',classSessionId:'session-1',scheduleId:'group-1',date:'2026-08-18',status:'present'}],
    grades:[{id:'legacy-exam',examId:'exam-1',type:'exam',date:'2026-08-19',updatedAt:'2026-09-09',score:5,maxScore:20},
      {id:'legacy-homework',assignmentId:'hw-1',type:'homework',date:'2026-08-20',score:9,maxScore:10}],
    examAttempts:[attempt],homeworks:[homework],recitations:[],progress:[],materials:[],
    assignments:[{id:'hw-1',title:'واجب',publishAt:'2026-08-10',dueDate:'2026-08-21',totalScore:10}],
    exams:[{id:'exam-1',title:'امتحان',openAt:'2026-08-19',closeAt:'2026-08-20',totalScore:20,finished:true}],
    payments:[{id:'pay-1',academicYear:'2026/2027',month:'أغسطس',updatedAt:'2026-09-10',expectedAmount:100,paidAmount:100}],
    motivation:[{academicYear:'2026/2027',month:'أغسطس',totalPoints:4,transactionCount:2}]};
  const august=calculateMonthlyReport({...context.input(student,source,'2026-08'),now:'2026-09-15'});
  const september=calculateMonthlyReport({...context.input(student,source,'2026-09'),now:'2026-09-15'});
  const portal=normalizeUnifiedResults({grades:source.grades,examAttempts:[attempt],homeworks:[homework]});
  assert.equal(august.student.studentCode,student.studentCode);
  assert.equal(august.attendance.present,1);
  assert.equal(august.results.count,1);
  assert.equal(august.results.rows[0].score,18);
  assert.equal(portal.find(row=>row.type==='exam'&&row.activityId==='exam-1').score,18);
  assert.equal(august.homework.submitted,1);
  assert.equal(august.homework.averageGrade,90);
  assert.equal(august.payment.paidAmount,100);
  assert.equal(august.motivation.totalPoints,6);
  assert.equal(september.results.count,0);
  assert.equal(september.homework.submitted,0);
  assert.equal(september.payment,null);
  assert.match(backend,/monthlyReport=calculateMonthlyReport\(monthlyReportInput\(found\.data,source,periodKey\)\)/);
  assert.match(backend,/const current=calculateMonthlyReport\(monthlyReportInput\(student,source,monthKey\)\)/);
});

test('cached report with the old schema is recomputed',async()=>{
  const backend=read('functions/index.js');
  const code=backend.slice(backend.indexOf('async function buildStudentMonthlyReport('),backend.indexOf('exports.getStudentMonthlyReportAdmin ='));
  let sourceReads=0,writes=0;
  const ref={get:async()=>({data:()=>({report:{schemaVersion:10},sourceRevision:1,contentRevision:1})})};
  const stateRef={get:async()=>({data:()=>({version:1})})};
  const contentRef={get:async()=>({data:()=>({version:1})})};
  const db={collection:()=>({doc:()=>ref}),doc:()=>contentRef,runTransaction:async fn=>fn({get:async target=>target.get(),set:()=>{writes++;}})};
  db.collection=()=>({doc:id=>id==='ST-123456'?stateRef:ref});
  const context={db,cleanDocId:String,normalizeCode:String,FieldValue:{serverTimestamp:()=>null,delete:()=>null},
    loadStudentMonthlyReportSource:async()=>{sourceReads++;return {};},monthlyReportInput:()=>({}),
    calculateMonthlyReport:()=>({schemaVersion:11,student:{grade:'أولى'}}),
    reportPreviousMonthKey:()=> '2026-08',reportAvailableMonths:()=>[],attachTrend:current=>current,
    HttpsError:Error};
  vm.createContext(context);vm.runInContext(`${code}\nthis.build=buildStudentMonthlyReport;`,context);
  const report=await context.build({studentCode:'ST-123456'},'2026-09');
  assert.equal(report.schemaVersion,11);
  assert.equal(sourceReads,1);
  assert.equal(writes,1);
});

test('submission activity from older content is scored without inflating required counts',()=>{
  const report=calculateMonthlyReport({
    monthKey:'2026-09',now:new Date('2026-09-25T12:00:00Z'),student:{studentCode:'ST-123456'},sessionsComplete:true,
    assignments:[{id:'old-hw',title:'واجب أغسطس',activityOnly:true,dueDate:'2026-08-31',totalScore:15}],
    homeworks:[{id:'sub-1',assignmentId:'old-hw',submittedAt:'2026-09-03',score:14,maxScore:15,status:'graded'}],
    exams:[{id:'old-exam',title:'امتحان أغسطس',activityOnly:true,required:true,finished:true,totalScore:20}],
    examAttempts:[{id:'attempt-1',examId:'old-exam',submittedAt:'2026-09-04',score:18,maxScore:20,status:'corrected'}]
  });
  assert.equal(report.homework.required,0);
  assert.equal(report.homework.submitted,0);
  assert.equal(report.homework.activitySubmitted,1);
  assert.equal(report.homework.averageGrade,93.33);
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

test('unrecorded scheduled days remain visible without being counted as absences',()=>{
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
  assert.equal(report.attendance.absent,2);
  assert.equal(report.attendance.late,1);
  assert.equal(report.attendance.unrecorded,0);
  assert.equal(report.attendance.percentage,50);
});

test('an attendance warning takes priority over a high academic title',()=>{
  const report=calculateMonthlyReport({
    monthKey:'2026-09',now:new Date('2026-09-21T12:00:00Z'),student:{studentCode:'ST-123456',scheduleId:'g1'},sessionsComplete:true,
    sessions:[{id:'s1',scheduleId:'g1',date:'2026-09-01'},{id:'s2',scheduleId:'g1',date:'2026-09-08'},{id:'s3',scheduleId:'g1',date:'2026-09-15'}],
    attendance:[{id:'a1',classSessionId:'s1',scheduleId:'g1',date:'2026-09-01',status:'present'},{id:'a2',classSessionId:'s2',scheduleId:'g1',date:'2026-09-08',status:'absent'}],
    grades:[{id:'g1',score:15,maxScore:15},{id:'g2',score:20,maxScore:20}]
  });
  assert.equal(report.attendance.percentage,33.3);
  assert.equal(report.attendance.unrecorded,0);
  assert.equal(report.monthlyTitle,'إنذار غياب');
  assert.equal(report.monthlyTitleTone,'negative');
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
  assert.equal(report.homework.averageGrade,93.33);
  const backend=read('functions/index.js');
  assert.match(backend,/dateFields:\['submittedAt','reviewedAt','gradedAt','updatedAt'\]/);
  assert.match(backend,/actualSessionsForStudent\(student,sessionGroups\.flat\(\),attendance,transfers,groupsBySchedule\)/);
});

test('a corrected homework remains visible when its old assignment document is missing',()=>{
  const report=calculateMonthlyReport({
    monthKey:'2026-09',student:{studentCode:'ST-123456'},assignments:[],
    homeworks:[{id:'legacy-submission',assignmentId:'archived-homework',homeworkTitle:'واجب قديم محفوظ',submittedAt:'2026-09-10',score:8,maxScore:10,status:'graded'}]
  });
  assert.equal(report.homework.required,0);
  assert.equal(report.homework.submitted,0);
  assert.equal(report.homework.activitySubmitted,1);
  assert.equal(report.homework.graded,1);
  assert.equal(report.homework.averageGrade,80);
  assert.equal(report.homework.rows[0].assignment.title,'واجب قديم محفوظ');
  assert.equal(report.homework.rows[0].assignment.activityOnly,true);
});

test('legacy homework identities and marks remain connected to their assignment',()=>{
  const report=calculateMonthlyReport({
    monthKey:'2026-09',student:{studentCode:'ST-123456'},
    assignments:[{id:'hw-legacy',title:'واجب قديم',totalScore:15,dueDate:'2026-09-20'}],
    homeworks:[{id:'sub-legacy',homeworkId:'hw-legacy',submittedAt:'2026-09-10',earnedScore:14,totalMarks:15,status:'graded'}]
  });
  assert.equal(report.homework.required,1);
  assert.equal(report.homework.submitted,1);
  assert.equal(report.homework.averageGrade,93.33);
  assert.match(read('functions/index.js'),/row\.earnedScore/);
  assert.match(read('functions/index.js'),/row\.totalMarks/);
});

test('group schedule accepts formal colloquial and English weekday spellings',()=>{
  assert.deepEqual(configuredScheduleDays('التلات والجمعة'),['الثلاثاء','الجمعة']);
  assert.deepEqual(configuredScheduleDays(['Tuesday','Fri']),['الثلاثاء','الجمعة']);
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
});

test('unified profile shows motivation transactions and delegates tab navigation',()=>{
  const ui=read('assets/v64-admin-operations.js');
  assert.match(ui,/profile\.motivationTransactions/);
  assert.match(ui,/تم عكس الحركة/);
  assert.match(ui,/event\.target\.closest\('\[data-profile-view\]'\)/);
  assert.match(ui,/rankScopeLabel/);
});

test('student profile merges corrected homework with exam results before finding the latest grade',()=>{
  const app=read('assets/app.js');
  assert.match(app,/normalizeUnifiedResults\(\{grades:\[\.\.\.\(st\.results\|\|\[\]\),\.\.\.\(st\.grades\|\|\[\]\)\],examAttempts:attempts,homeworks:st\.homeworks\|\|\[\]\}\)/);
  assert.match(app,/latestHomework=grades\.find/);
  assert.match(app,/متوسط الدرجات المصححة/);
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
  assert.match(app,/width=1080,height=1600/);
  assert.match(app,/\(results\.rows\|\|\[\]\)\.slice\(0,3\)/);
  assert.match(app,/trend\.previousScore/);
  assert.match(app,/نقطة مئوية عن الشهر السابق/);
  assert.match(parent,/family=Cairo/);
  const reportSection=app.slice(app.indexOf('function parentMonthlyReportText'),app.indexOf('window.printParentReport'));
  assert.match(reportSection,/المحاضرات المكتملة/);
  assert.match(reportSection,/study\.lecturesCompleted/);
  assert.match(reportSection,/خطة متابعة ولي الأمر/);
});

test('client overall has no legacy weighted fallback',()=>{
  const app=read('assets/app.js');
  assert.doesNotMatch(app,/attendancePct\s*\*\s*\.3/);
  assert.doesNotMatch(app,/examGradeAvg\s*\*\s*\.4/);
  assert.match(app,/monthlyOverall===null\|\|monthlyOverall===undefined\|\|monthlyOverall===''\?null/);
  assert.match(app,/لن نعرض أرقامًا تقديرية قبل وصول بيانات الشهر من المصدر الموحّد/);
});
