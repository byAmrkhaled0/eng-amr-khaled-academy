'use strict';

// Read only, bounded maintenance check. Example: node scripts/audit-invalid-attendance.js --month=2026-09
const admin=require(require.resolve('firebase-admin',{paths:[require('node:path').join(__dirname,'../functions')]}));
const {membershipAt}=require('../functions/lib/monthly-report');
const {attendanceDayDecision}=require('../functions/lib/attendance-domain');

async function main(){
  const month=process.argv.find(arg=>arg.startsWith('--month='))?.slice(8);
  const limit=Number(process.argv.find(arg=>arg.startsWith('--limit='))?.slice(8)||500);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Use --month=YYYY-MM and optional --limit=1..1000.');
  admin.initializeApp();const db=admin.firestore();
  const next=new Date(`${month}-01T12:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
  const end=next.toISOString().slice(0,7)+'-01';
  const [attendanceSnap,studentsSnap,groupsSnap,transfersSnap]=await Promise.all([
    db.collection('attendance').where('date','>=',`${month}-01`).where('date','<',end).limit(limit+1).get(),
    db.collection('students').limit(251).get(),db.collection('groups').limit(251).get(),
    db.collection('student_transfer_requests').where('status','==','approved').limit(501).get()
  ]);
  if(attendanceSnap.size>limit||studentsSnap.size>250||groupsSnap.size>250||transfersSnap.size>500)throw Error('Read limit reached; narrow the month or increase the bounded limits in a reviewed local script. No conclusions printed.');
  const students=new Map(studentsSnap.docs.map(doc=>[String(doc.data().studentCode||doc.data().code||doc.id),doc.data()]));
  const groups=new Map(groupsSnap.docs.map(doc=>[doc.id,doc.data()]));
  const transfers=transfersSnap.docs.map(doc=>doc.data());
  for(const doc of attendanceSnap.docs){
    const row=doc.data(),code=String(row.studentCode||row.studentId||row.code||''),student=students.get(code);
    const history=transfers.filter(item=>String(item.studentCode||'')===code),membership=student&&membershipAt(student,history,row.date);
    const scheduleId=String(membership?.scheduleId||''),group=groups.get(scheduleId),configuredDays=group?.days||group?.scheduleDays||(scheduleId===String(student?.scheduleId||student?.groupId||'')?student?.scheduleDays:'');
    const decision=attendanceDayDecision(configuredDays,row.date),reason=!student?'missing-student':!membership?'outside-membership':row.scheduleId&&String(row.scheduleId)!==scheduleId?'wrong-group':!group&&!configuredDays?'missing-group':decision.allowed?'':decision.reason;
    if(reason)console.log(JSON.stringify({type:'INVALID_ATTENDANCE',studentCode:code,studentName:student?.studentName||student?.name||row.studentName||'',date:row.date,status:row.status,scheduleId,group:membership?.group||'',weekday:decision.weekday,configuredDays:decision.days,reason}));
  }
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
