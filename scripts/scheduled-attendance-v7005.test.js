'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const {actualSessionsForStudent,calculateMonthlyReport,membershipAt}=require('../functions/lib/monthly-report');
const {attendanceDayDecision}=require('../functions/lib/attendance-domain');
const backend=read('functions/index.js'),group=new Map([['old',{days:'الثلاثاء والجمعة'}],['new',{days:'الاثنين والخميس'}]]);
const student={studentCode:'ST1',studentName:'طالب',scheduleId:'old',group:'قديمة',createdAt:'2026-09-15'};
const session=(id,scheduleId,date,extra={})=>({id,scheduleId,date,...extra});
const input=(sessions,attendance=[],options={})=>({student,groupsBySchedule:group,sessions:actualSessionsForStudent(student,sessions,attendance,[],group),attendance,sessionsComplete:true,monthKey:'2026-09',now:'2026-09-30',...options});

test('actual Tuesday and Friday sessions count once; invalid Wednesday, cancelled, and pre-join sessions do not',()=>{
  const sessions=[session('t1','old','2026-09-22'),session('f1','old','2026-09-25'),session('bad','old','2026-09-23'),session('cancel','old','2026-09-29',{status:'cancelled'}),session('early','old','2026-09-08')];
  const rows=[{classSessionId:'t1',scheduleId:'old',date:'2026-09-22',status:'present'},
    {classSessionId:'t1',scheduleId:'old',date:'2026-09-22',status:'present'},
    {date:'2026-09-23',scheduleId:'old',status:'present'}];
  const report=calculateMonthlyReport(input(sessions,rows));
  assert.equal(report.attendance.total,2);assert.equal(report.attendance.required,2);
  assert.equal(report.attendance.present,1);assert.equal(report.attendance.absent,1);
  assert.equal(report.attendance.percentage,50);assert.deepEqual(report.attendance.rows.map(row=>row.date),['2026-09-22','2026-09-25']);
  assert.equal(report.motivation.attendancePoints,0);
  const present=calculateMonthlyReport(input([sessions[0]],[rows[0]]));
  const absent=calculateMonthlyReport(input([sessions[1]],[]));
  assert.equal(present.motivation.attendancePoints,2);assert.equal(absent.motivation.attendancePoints,-2);
  assert.equal(calculateMonthlyReport(input([],rows.slice(2))).motivation.attendancePoints,0);
});

test('valid legacy weekday remains one session; invalid or cancelled legacy never invents entitlement',()=>{
  const rows=[{scheduleId:'old',date:'2026-09-22',status:'present'},{scheduleId:'old',date:'2026-09-22',status:'present'},{scheduleId:'old',date:'2026-09-23',status:'absent'},
    {group:'مجموعة أخرى',date:'2026-09-25',status:'present'}];
  const inferred=actualSessionsForStudent(student,[],rows,[],group);
  assert.equal(inferred.length,1);assert.equal(inferred[0].legacyAttendance,true);
  assert.equal(calculateMonthlyReport(input([],rows)).attendance.total,1);
  assert.equal(actualSessionsForStudent(student,[session('cancel','old','2026-09-22',{cancelled:true})],rows,[],group).filter(row=>row.legacyAttendance).length,0);
  assert.equal(calculateMonthlyReport(input([session('friday','old','2026-09-25')],[rows[3]])).attendance.absent,1);
});

test('transfer uses the previous group before effectiveAt and the new group afterwards',()=>{
  const moved={...student,scheduleId:'new',group:'جديدة'},transfers=[{status:'approved',currentScheduleId:'old',currentGroup:'قديمة',targetScheduleId:'new',effectiveAt:'2026-09-24'}];
  const sessions=[session('old-tue','old','2026-09-22'),session('new-thu','new','2026-09-24'),session('old-fri','old','2026-09-25'),session('new-wed','new','2026-09-23')];
  const valid=actualSessionsForStudent(moved,sessions,[],transfers,group);
  assert.deepEqual(valid.map(row=>row.id),['old-tue','new-thu']);
  const report=calculateMonthlyReport({student:moved,transfers,groupsBySchedule:group,sessions:valid,sessionsComplete:true,monthKey:'2026-09',now:'2026-09-30',attendance:[{classSessionId:'old-tue',scheduleId:'old',date:'2026-09-22',status:'present'}]});
  assert.equal(report.attendance.required,2);assert.equal(report.attendance.absent,1);
});

test('server rejects invalid day for manual, QR, bulk, session creation, and offline preparation/sync',async()=>{
  const ctx={exports:{},CALLABLE_OPTIONS:{},onCall:(_opts,handler)=>handler,attendanceDayDecision,membershipAt,
    HttpsError:class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}},
    requireStaff:async()=>({uid:'staff',email:'staff@example.com'}),rateLimit:async()=>{},
    text:value=>String(value||''),cleanDocId:value=>String(value||''),canonicalAcademicLabel:value=>value,sameAcademicValue:()=>true,
    normalizeCode:value=>String(value||''),validLegacyOrStrongCode:()=>true,cairoDateKey:value=>typeof value==='string'?value.slice(0,10):'2026-09-23',
    configuredScheduleDays:require('../functions/lib/attendance-domain').configuredScheduleDays,firestoreMillis:()=>Date.now()+100000,
    FieldValue:{serverTimestamp:()=>''},crypto:{randomUUID:()=> 'request-1'},Date,console};
  const user={studentCode:'ST1',name:'طالب',scheduleId:'old',group:'قديمة',grade:'برمجة',attendanceCode:'QR1',active:true};
  const snap=(id,data)=>({id,exists:true,data:()=>data});
  const groupDoc=snap('old',{days:'الثلاثاء والجمعة',name:'قديمة'}),studentDoc=snap('ST1',user);
  ctx.findAttendanceStudentSnapshot=async()=>studentDoc;
  ctx.db={collection:name=>{const query={where(){return this;},limit(){return this;},async get(){return {empty:false,docs:name==='students'?[studentDoc]:[]};}};return {doc:id=>({get:async()=>name==='groups'?groupDoc:name==='class_sessions'?snap(id,{date:'2026-09-23',scheduleId:'old',status:'open'}):name==='_attendance_preparations'?snap(id,{uid:'staff',expiresAt:'future',date:'2026-09-23',sessionId:'old_2026-09-23',scheduleId:'old',studentCodes:['ST1']}):snap(id,{})}),where:()=>query};}};
  const parts=[['async function attendanceTransferHistory(','async function findAttendanceStudentSnapshot('],['exports.recordAttendance =','exports.prepareOfflineAttendance ='],['exports.upsertClassSession =','exports.getClassSessionWorkspace ='],['exports.bulkMarkAttendance =','exports.savePaperExamGradesAdmin =']];
  vm.createContext(ctx);
  vm.runInContext(parts.map(([start,end])=>backend.slice(backend.indexOf(start),backend.indexOf(end,backend.indexOf(start)))).join('\n'),ctx);
  await assert.rejects(ctx.validateAttendanceSchedule(user,'2026-09-23'),error=>error.code==='failed-precondition');
  await assert.rejects(ctx.exports.recordAttendance({data:{studentCode:'ST1',date:'2026-09-23',status:'present'}}),error=>error.code==='failed-precondition');
  await assert.rejects(ctx.exports.recordAttendance({data:{attendanceCode:'QR1',date:'2026-09-23'}}),error=>error.code==='failed-precondition');
  await assert.rejects(ctx.exports.bulkMarkAttendance({data:{date:'2026-09-23',scheduleId:'old'}}),error=>error.code==='failed-precondition');
  await assert.rejects(ctx.exports.upsertClassSession({data:{date:'2026-09-23',scheduleId:'old'}}),error=>error.code==='failed-precondition');
  const offline=backend.slice(backend.indexOf('exports.prepareOfflineAttendance ='),backend.indexOf('async function commitAttendanceOnce('));
  vm.runInContext(offline,ctx);
  await assert.rejects(ctx.exports.prepareOfflineAttendance({data:{date:'2026-09-23',scheduleId:'old'}}),error=>error.code==='failed-precondition');
  vm.runInContext(backend.slice(backend.indexOf('exports.syncOfflineAttendance ='),backend.indexOf('exports.bulkMarkAttendance =')),ctx);
  const synced=await ctx.exports.syncOfflineAttendance({data:{events:[{requestId:'retry-1',preparationId:'prep',studentCode:'ST1',date:'2026-09-23',classSessionId:'old_2026-09-23',attendanceCode:'QR1',scannedAt:'2026-09-23T10:00:00Z'}]}});
  assert.equal(synced.saved,0);assert.equal(synced.results[0].ok,false);assert.match(synced.results[0].error,/خارج مواعيد/);
});

test('admin eligibility, shared report projections, bounded read-only audit and policy gate',()=>{
  const admin=read('assets/admin.js'),snippet=admin.slice(admin.indexOf('function attendanceTransferDate('),admin.indexOf('function attendanceSelectedDateLabel('));
  const context={adminData:{groups:[{id:'old',days:'الثلاثاء والجمعة'}],studentTransferRequests:[]},attendanceDate:'2026-09-23',adminSameAcademic:()=>true,adminAttendanceTransfersLoaded:true,isoDateAdmin:()=> '2026-09-25'};
  vm.createContext(context);vm.runInContext(`${snippet}\nthis.allowed=attendanceDayAllowed;`,context);
  assert.equal(context.allowed({scheduleId:'old',scheduleDays:'الأربعاء'},'2026-09-23').ok,false,'group overrides stale student days');
  assert.equal(context.allowed({scheduleId:'old'},'2026-09-22').ok,true);
  assert.equal(context.allowed({scheduleId:'old'},'2026-09-25').ok,true);
  assert.equal(attendanceDayDecision('الثلاثاء والجمعة','2026-09-21').allowed,false);
  assert.match(backend,/attendance:monthlyReport\.attendance\.rows/);
  assert.match(backend,/sessions:actualSessionsForStudent\(st,applicableSessions,att,studentTransfers,groupsBySchedule\)/);
  assert.match(backend,/attendancePercentage:row\.attendancePct/);
  assert.match(backend,/classDates=new Set\(attendanceResult\.rows\.map\(recordDate\)/);
  assert.match(backend,/const attendance=attendanceMetrics\.flatMap/);
  const adminProfile=read('assets/v63-admin-experience.js');
  assert.match(adminProfile,/monthly=profileData\?\.monthlyReport/);
  assert.match(adminProfile,/monthly\.attendance\?\.present/);
  assert.doesNotMatch(adminProfile,/attendance=profileData\?\.attendance\|\|\[\],present=/);
  assert.match(read('assets/v64-admin-operations.js'),/attendanceKnown:false/);
  const app=read('assets/app.js'),rowsSource=app.slice(app.indexOf('function getAttendanceRows('),app.indexOf('function attendanceSummaryHTML('));
  const portal={compatibleMonthlyReport:report=>!!report};vm.createContext(portal);vm.runInContext(`${rowsSource}\nthis.rows=getAttendanceRows;`,portal);
  assert.equal(portal.rows({studentCode:'ST1',attendance:[{date:'2026-09-23',status:'present'}]}).length,0);
  assert.equal(portal.rows({studentCode:'ST1',attendance:[{date:'2026-09-23',status:'present'}],monthlyReport:{attendance:{rows:[{date:'2026-09-22',status:'present'}]}}})[0].date,'2026-09-22');
  for(const file of ['functions/index.js','functions/lib/monthly-report.js','assets/app.js'])assert.match(read(file),/monthly-v12-scheduled-session-attendance/);
  assert.match(read('service-worker.js'),/technominds-v70-0-5-complete-report-attendance-v12/);
  const audit=read('scripts/audit-invalid-attendance.js');assert.doesNotMatch(audit,/\.set\(|\.delete\(|\.update\(|\.commit\(/);
  assert.match(audit,/\.limit\(limit\+1\)/);assert.doesNotMatch(read('scripts/build.js'),/audit-invalid-attendance/);
});
