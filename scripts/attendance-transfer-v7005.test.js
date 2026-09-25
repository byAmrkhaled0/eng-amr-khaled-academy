'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const backend=fs.readFileSync(path.join(__dirname,'../functions/index.js'),'utf8');
const {membershipAt}=require('../functions/lib/monthly-report');
const domain=require('../functions/lib/attendance-domain');
const slice=(from,to)=>backend.slice(backend.indexOf(from),backend.indexOf(to,backend.indexOf(from)));

function harness(){
  const stores={students:new Map(),groups:new Map(),student_transfer_requests:new Map(),class_sessions:new Map(),attendance:new Map(),recitations:new Map()};
  const student=(code,scheduleId,group)=>({studentCode:code,studentName:code,grade:'برمجة',scheduleId,group,active:true,createdAt:'2026-09-01'});
  stores.students.set('ST1',student('ST1','new','الجديدة'));
  for(const code of ['ST2','ST3','ST4'])stores.students.set(code,student(code,'old','القديمة'));
  stores.groups.set('old',{name:'القديمة',days:'الثلاثاء والجمعة'});
  stores.groups.set('new',{name:'الجديدة',days:'الاثنين والخميس'});
  stores.student_transfer_requests.set('transfer',{studentCode:'ST1',status:'approved',currentScheduleId:'old',currentGroup:'القديمة',targetScheduleId:'new',targetGroup:'الجديدة',effectiveAt:'2026-09-24'});
  stores.class_sessions.set('old_2026-09-22',{date:'2026-09-22',scheduleId:'old',group:'القديمة',status:'open'});
  stores.class_sessions.set('old_2026-09-25',{date:'2026-09-25',scheduleId:'old',group:'القديمة',status:'open'});
  stores.class_sessions.set('new_2026-09-24',{date:'2026-09-24',scheduleId:'new',group:'الجديدة',status:'open'});
  let reads=0,batches=0;
  const doc=(id,row)=>({id,exists:row!==undefined,data:()=>row});
  const db={collection:name=>({doc:id=>({id,get:async()=>{reads++;return doc(id,stores[name]?.get(id));}}),where(field,operator,value){const filters=[[field,operator,value]];return {where(f,o,v){filters.push([f,o,v]);return this;},limit(n){this.max=n;return this;},async get(){reads++;const docs=[...(stores[name]||[])].filter(([,row])=>filters.every(([key,op,expected])=>op==='=='?row[key]===expected:op==='>='?row[key]>=expected:row[key]<expected)).slice(0,this.max||Infinity).map(([id,row])=>doc(id,row));return {docs,size:docs.length,empty:!docs.length};}};}}),batch:()=>{const writes=[];return {set(ref,row){writes.push([ref,row]);},async commit(){batches++;for(const [ref,row] of writes)stores.attendance.set(ref.id,row);}}}};
  const ctx={exports:{},db,CALLABLE_OPTIONS:{},onCall:(_options,handler)=>handler,membershipAt,...domain,
    HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}},requireStaff:async()=>({uid:'staff',email:'staff@test.com'}),rateLimit:async()=>{},normalizeCode:v=>String(v||''),validLegacyOrStrongCode:()=>true,text:v=>String(v||''),cleanDocId:v=>String(v||''),canonicalAcademicLabel:v=>v,sameAcademicValue:(a,b)=>a===b,cairoDateKey:v=>typeof v==='string'?v.slice(0,10):'2026-09-22',FieldValue:{serverTimestamp:()=>''},crypto:{randomUUID:()=> 'request-1'},markLeaderboardDirty:async()=>{},serverActivity:async()=>{},Date,Promise,console};
  ctx.findAttendanceStudentSnapshot=async code=>doc(code,stores.students.get(code));
  ctx.commitAttendanceOnce=async payload=>{stores.attendance.set(payload.id,payload);return {id:payload.id,duplicate:false};};
  vm.createContext(ctx);
  vm.runInContext([
    slice('async function attendanceTransferHistory(', 'async function findAttendanceStudentSnapshot('),
    slice('function attendanceServerPayload(', 'exports.prepareOfflineAttendance ='),
    slice('exports.getClassSessionWorkspace =','function studentResourcePayload('),
    slice('exports.bulkMarkAttendance =','exports.savePaperExamGradesAdmin =')
  ].join('\n'),ctx);
  return {stores,ctx,stats:()=>({reads,batches})};
}

test('historical attendance uses old membership before transfer and rejects wrong session afterwards',async()=>{
  const {ctx,stores}=harness(),st=stores.students.get('ST1');
  assert.equal((await ctx.validateAttendanceSchedule(st,'2026-09-22')).scheduleId,'old');
  assert.equal((await ctx.validateAttendanceSchedule(st,'2026-09-24')).scheduleId,'new');
  await assert.rejects(ctx.validateAttendanceSchedule(st,'2026-09-25'),error=>error.code==='failed-precondition');
  const old=await ctx.exports.recordAttendance({data:{studentCode:'ST1',date:'2026-09-22',classSessionId:'old_2026-09-22'}});
  assert.equal(old.scheduleId,'old');assert.equal(old.group,'القديمة');
  await assert.rejects(ctx.exports.recordAttendance({data:{studentCode:'ST1',date:'2026-09-24',classSessionId:'old_2026-09-22'}}),error=>error.code==='failed-precondition');
  const workspace=await ctx.exports.getClassSessionWorkspace({data:{sessionId:'old_2026-09-22'}});
  assert.ok(workspace.students.some(row=>row.studentCode==='ST1'&&row.group==='القديمة'));
  const after=await ctx.exports.getClassSessionWorkspace({data:{sessionId:'old_2026-09-25'}});
  assert.equal(after.students.some(row=>row.studentCode==='ST1'),false);
});

test('historical bulk uses one day read, transfer batch and respects legacy and session-specific rows',async()=>{
  const {ctx,stores,stats}=harness();
  stores.attendance.set('legacy-present',{studentCode:'ST1',date:'2026-09-22',status:'present'});
  stores.attendance.set('legacy-absent',{studentCode:'ST2',date:'2026-09-22',status:'absent'});
  stores.attendance.set('specific',{studentCode:'ST3',date:'2026-09-22',scheduleId:'old',classSessionId:'old_2026-09-22',status:'present'});
  stores.attendance.set('wrong-group',{studentCode:'ST4',date:'2026-09-22',scheduleId:'new',status:'present'});
  const result=await ctx.exports.bulkMarkAttendance({data:{date:'2026-09-22',scheduleId:'old',group:'القديمة',grade:'برمجة'}});
  assert.equal(result.totalStudents,4);assert.equal(result.saved,1);assert.equal(result.savedStudentCodes[0],'ST4');
  assert.equal(stores.attendance.get('ST4_old_2026-09-22').status,'absent');
  assert.equal(stores.attendance.has('ST1_old_2026-09-22'),false);
  assert.equal(stores.attendance.has('ST2_old_2026-09-22'),false);
  assert.equal(stores.attendance.has('ST3_old_2026-09-22'),false);
  assert.equal(stats().batches,1);assert.ok(stats().reads<=5,'bounded shared queries, no per-student read');
  const after=await ctx.exports.bulkMarkAttendance({data:{date:'2026-09-25',scheduleId:'old',group:'القديمة',grade:'برمجة'}});
  assert.equal(after.totalStudents,3);assert.equal(after.savedStudentCodes.includes('ST1'),false);
});

test('historical frontend decision follows approved transfer, not current group',()=>{
  const admin=fs.readFileSync(path.join(__dirname,'../assets/admin.js'),'utf8');
  const snippet=admin.slice(admin.indexOf('function attendanceTransferDate('),admin.indexOf('function attendanceSelectedDateLabel('));
  const ctx={adminData:{groups:[{id:'old',name:'القديمة',days:'الثلاثاء والجمعة'},{id:'new',name:'الجديدة',days:'الاثنين والخميس'}],studentTransferRequests:[{studentCode:'ST1',status:'approved',currentScheduleId:'old',currentGroup:'القديمة',effectiveAt:'2026-09-24'}],students:[]},attendanceDate:'2026-09-22',adminSameAcademic:(a,b)=>a===b,adminAttendanceTransfersLoaded:true,isoDateAdmin:()=> '2026-09-25'};
  vm.createContext(ctx);vm.runInContext(`${snippet}\nthis.decide=attendanceDayAllowed;`,ctx);
  const st={studentCode:'ST1',scheduleId:'new',group:'الجديدة',grade:'برمجة'};
  assert.equal(ctx.decide(st,'2026-09-22').scheduleId,'old');assert.equal(ctx.decide(st,'2026-09-22').ok,true);
  assert.equal(ctx.decide(st,'2026-09-24').scheduleId,'new');assert.equal(ctx.decide(st,'2026-09-24').ok,true);
  assert.equal(ctx.decide(st,'2026-09-25').ok,false);
  ctx.adminAttendanceTransfersLoaded=false;assert.match(ctx.decide(st,'2026-09-22').message,/انتظر تحميل سجل نقل/);
});
