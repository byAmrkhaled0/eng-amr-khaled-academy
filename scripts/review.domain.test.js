'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {calculateMonthlyReport,attachTrend,dateKey}=require('../functions/lib/monthly-report');
const {planRestore,BACKUP_COLLECTIONS,digest}=require('../functions/lib/backup');
const {buildPaymentDashboard}=require('../functions/lib/payment-dashboard');
const {requestIp}=require('../functions/lib/request-ip');
const student={studentCode:'TEST0001',name:'طالب تجريبي',grade:'أساسيات برمجة',group:'ب',scheduleId:'b',createdAt:'2026-09-10',notes:'PRIVATE NEVER EXPOSE'};
const base={student,monthKey:'2026-09',now:'2026-09-30T20:00:00Z'};

test('old restore keeps omitted collections; incomplete or foreign payload is rejected before mutation',()=>{
 const payload={schemaVersion:63,backupFormatVersion:2,project:'demo-technominds',collections:{students:[{id:'TEST0001',data:student}]}};
 const result=planRestore(payload,'demo-technominds');assert.equal(result.plan.deletes,0);assert(result.plan.preserved.includes('motivation_monthly'));
 assert.throws(()=>planRestore({...payload,project:'production'},'demo-technominds'));
 assert.throws(()=>planRestore({...payload,collections:{students:null}},'demo-technominds'));
 assert.throws(()=>planRestore({...payload,collections:{students:[{id:'../bad',data:{}}]}},'demo-technominds'));
 const collections=Object.fromEntries(BACKUP_COLLECTIONS.map(name=>[name,[]]));
 const full={...payload,backupFormatVersion:3,collections,manifest:{complete:true,sha256:digest(collections)}};
 assert.equal(planRestore(full,'demo-technominds').plan.writes,0);collections.students.push({id:'x',data:{}});assert.throws(()=>planRestore(full,'demo-technominds'));
});
test('nested legacy progress events are planned without changing document IDs',()=>{
 const p={schemaVersion:63,backupFormatVersion:2,project:'demo-technominds',collections:{student_progress:[{id:'s',data:{},monthlyEvents:[{id:'e',data:{lectureId:'l'}}]}]}};
 assert.equal(planRestore(p,'demo-technominds').documents[1].path,'student_progress/s/monthly_events/e');
});
test('ledger totals include 1201 students and 610 summaries without depending on the UI page',()=>{
 const students=Array.from({length:1201},(_,i)=>({studentCode:`S${i}`,grade:'course',active:true}));
 const summaries=students.slice(0,610).map(s=>({...s,course:'course',paidAmount:100,expectedAmount:100,month:'سبتمبر',academicYear:'2026/2027'}));
 const result=buildPaymentDashboard({students,summaries,todayTransactions:[],prices:{course:100},filters:{query:'',grade:'all',month:'سبتمبر',academicYear:'2026/2027',status:'all'}});
 assert.equal(result.totals.expected,120100);assert.equal(result.totals.collected,61000);assert.equal(result.totals.unpaid,591);assert.equal(result.rows.length,1201);
});
test('latest exam attempt is one exam; pending score is not zero and manual notes stay private',()=>{
 const input={...base,exams:[{id:'e',title:'اختبار',finished:true,required:true}],examAttempts:[{examId:'e',attemptNumber:1,score:18,maxScore:20,status:'submitted'},{examId:'e',attemptNumber:2,score:0,maxScore:20,status:'pending_manual',needsManualReview:true}]};
 const report=calculateMonthlyReport(input);assert.equal(report.results.count,1);assert.equal(report.results.pendingReview,1);assert.equal(report.results.gradedCount,0);assert.equal(report.academicScore,null);assert.equal(report.teacherNotes,'');
 input.examAttempts[1]={...input.examAttempts[1],score:10,needsManualReview:false,status:'corrected'};assert.equal(calculateMonthlyReport(input).results.average,50);
});
test('different maximum marks are normalized before averaging; zero remains a real grade',()=>{
 const report=calculateMonthlyReport({...base,grades:[{id:'a',score:10,maxScore:20},{id:'b',score:50,maxScore:100},{id:'c',score:null,maxScore:100}]});assert.equal(report.results.average,50);assert.equal(report.results.gradedCount,2);
 assert.equal(calculateMonthlyReport({...base,grades:[{id:'z',score:0,maxScore:20}]}).results.average,0);
});
test('new join, excused absence, cancellation and transfer use actual session membership',()=>{
 const sessions=[['before','a','2026-09-05'],['old','a','2026-09-12'],['wrong','b','2026-09-12'],['new','b','2026-09-20'],['cancel','b','2026-09-24']].map(([id,scheduleId,date])=>({id,scheduleId,date,status:id==='cancel'?'cancelled':'closed'}));
 const transfers=[{status:'approved',currentScheduleId:'a',currentGroup:'أ',targetScheduleId:'b',reviewedAt:'2026-09-15T09:00:00Z'}];
 const report=calculateMonthlyReport({...base,sessions,sessionsComplete:true,transfers,attendance:[{classSessionId:'old',scheduleId:'a',date:'2026-09-12',status:'excused'},{classSessionId:'new',scheduleId:'b',date:'2026-09-20',status:'late'}]});
 assert.equal(report.attendance.required,2);assert.equal(report.attendance.excused,1);assert.equal(report.attendance.late,1);assert.equal(report.attendance.percentage,100);
});
test('empty month, unrecorded session and lecture opening cannot manufacture achievement',()=>{
 const report=calculateMonthlyReport({...base,sessionsComplete:true,sessions:[{id:'b1',scheduleId:'b',date:'2026-09-20'}],lectureProgress:[{viewed:true,percent:100,completed:true}]});
 assert.equal(report.attendance.absent,0);assert.equal(report.attendance.unrecorded,1);assert.equal(report.attendance.percentage,null);assert.equal(report.study.lecturesCompleted,0);assert.equal(attachTrend(report,report).trend.status,'insufficient');
 assert.equal(calculateMonthlyReport(base).overallScore,null);
});
test('Cairo month handles UTC midnight boundary in summer and winter',()=>{
 assert.equal(dateKey('2026-08-31T22:30:00Z'),'2026-09-01');assert.equal(dateKey('2026-01-31T22:30:00Z'),'2026-02-01');
});
test('untrusted forwarded header cannot choose rate-limit identity',()=>{
 const rawRequest={socket:{remoteAddress:'10.0.0.2'},ip:'1.2.3.4',headers:{'x-forwarded-for':'spoofed, 8.8.8.8, 35.1.1.1'}};
 assert.equal(requestIp({rawRequest},{}),'10.0.0.2');assert.equal(requestIp({rawRequest},{TM_TRUSTED_PROXY_HOPS:'2'}),'8.8.8.8');
});

test('cancelled-only calendar does not count a retained attendance record as entitlement',()=>{
 const report=calculateMonthlyReport({...base,sessionsComplete:true,sessions:[{id:'c',date:'2026-09-20',scheduleId:'b',cancelled:true}],attendance:[{classSessionId:'c',date:'2026-09-20',status:'present'}]});
 assert.equal(report.attendance.required,0);assert.equal(report.attendance.total,0);assert.equal(report.attendance.percentage,null);
});
test('missing required homework and unopened lectures remain visible without submissions',()=>{
 const report=calculateMonthlyReport({...base,assignments:[{id:'hw-1',title:'واجب سبتمبر',publishAt:'2026-09-05',dueDate:'2026-09-10',totalScore:1}],homeworkSubmissions:[],lectureMaterials:[{id:'lesson-1',title:'المحاضرة الأولى',createdAt:'2026-09-03'}],lectureProgress:[],grades:[{id:'exam-1',activityName:'امتحان سبتمبر',score:13,maxScore:15,date:'2026-09-10'}]});
 assert.equal(report.homework.required,1);assert.equal(report.homework.submitted,0);assert.equal(report.homework.missing,1);assert.equal(report.homework.rows[0].submission,null);
 assert.equal(report.study.lecturesAvailable,1);assert.equal(report.study.lecturesOpened,0);assert.match(report.summaryNote,/الواجبات/);
});
