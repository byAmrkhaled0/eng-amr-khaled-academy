'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/admin.js'),'utf8');
function realFunction(name){const start=source.indexOf(`function ${name}(`);assert(start>=0);return source.slice(start,source.indexOf('\n}',start)+2);}
function fixture(today){
 const context=vm.createContext({Date,Intl,GRADES:['مسار أ','مسار ب','مسار ج'],MONTHS:['يناير'],MFCloud:{},sessionStorage:{removeItem(){},setItem(){}},isoDateAdmin:()=>today});
 context.window=context;
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/browser/phase3c-dense-fixture.js'),'utf8'),context);
 vm.runInContext('installPhase3CDenseFixture();adminAttendanceTransfersLoaded=true;',context);
 for(const name of ['attendanceTransferDate','attendanceMembershipFor','attendanceScheduleDays','attendanceDayAllowed','attendanceRosterHTML'])vm.runInContext(realFunction(name),context);
 Object.assign(context,{attendanceStudents:()=>context.adminData.students,selectedGrade:()=> 'all',selectedGroup:()=> 'all',findAttendance:()=>null,attendanceNeedsSessionSelection:()=>false,findClassProgress:()=>null,safe:String,badgeStatus:()=>'',renderActionAttrs:(name,args)=>`data-tm-action="${name}" data-test-code="${args[0]}"`});
 return context;
}
test('real dense fixture QA1 belongs to Saturday/Monday group; current Sunday is correctly blocked',()=>{
 const c=fixture('2026-10-11');c.attendanceDate='2026-10-11';const student=c.adminData.students[0],result=c.attendanceDayAllowed(student);
 assert.equal(student.studentCode,'QA1');assert.equal(student.scheduleId,'qa-group-0');assert.equal(c.adminData.groups[0].days,'السبت والاثنين');
 assert.equal(result.ok,false);assert.equal(result.day,'الأحد');assert.equal(result.message,'هذا اليوم خارج مواعيد مجموعة الطالب.');
 assert.match(c.attendanceRosterHTML(),/disabled title="هذا اليوم خارج مواعيد مجموعة الطالب\."[^>]*data-tm-action="setAttendanceStatus" data-test-code="QA1"/);
});
test('fixed Saturday produces enabled QA1 action across every execution weekday, without changing schedule',()=>{
 for(const today of ['2026-10-10','2026-10-11','2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16']){
  const c=fixture(today);c.attendanceDate='2026-10-10';const result=c.attendanceDayAllowed(c.adminData.students[0]);assert.equal(result.ok,true,today);assert.equal(result.day,'السبت');
  const button=c.attendanceRosterHTML().match(/<button[^>]*data-tm-action="setAttendanceStatus" data-test-code="QA1"[^>]*>/)[0];assert.doesNotMatch(button,/disabled/);
  c.attendanceDate='2026-10-11';assert.equal(c.attendanceDayAllowed(c.adminData.students[0]).ok,false,today);
 }
});
test('historical date still fails closed when transfer history is not loaded',()=>{
 const c=fixture('2026-10-11');c.adminAttendanceTransfersLoaded=false;c.attendanceDate='2026-10-10';assert.equal(c.attendanceDayAllowed(c.adminData.students[0]).ok,false);assert.match(c.attendanceDayAllowed(c.adminData.students[0]).message,/تحميل سجل نقل/);
});
