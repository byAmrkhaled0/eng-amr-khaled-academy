'use strict';
const crypto=require('node:crypto');
const {assignmentIsReleased,assignmentDueDatePassed,scheduledTimeMillis}=require('./assignment-schedule');
const {homeworkLockId}=require('./homework-domain');
const {studentIsApproved}=require('./student-access');
const {learningTargetMatchesStudent}=require('./academic-targeting');
const dayKey=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
const reminderId=(assignmentId,code,day)=>crypto.createHash('sha256').update(`homework-reminder:${assignmentId}:${code}:${day}`).digest('hex').slice(0,48);
function reminderOpen(row,now){
 return assignmentIsReleased(row,now)&&row.studentVisible!==false&&row.submissionClosed!==true&&!['draft','hidden','ended','مخفي'].includes(row.status||row.lifecycleStatus)&&!assignmentDueDatePassed(row,dayKey(now))&&(!scheduledTimeMillis(row.closeAt)||scheduledTimeMillis(row.closeAt)>now);
}
function createHomeworkReminders({db,Timestamp,HttpsError,fetchStudents,fetchSubmissions,canAccess,now=()=>Date.now()}){
 return async function remind(assignmentId,profile){
  const ref=db.collection('assignments').doc(assignmentId),initial=await ref.get();
  if(!initial.exists)throw new HttpsError('not-found','الواجب غير موجود.');
  if(!reminderOpen(initial.data(),now()))throw new HttpsError('failed-precondition','التنبيه متاح للواجب المنشور والمفتوح فقط.');
  const [students,submissions]=await Promise.all([fetchStudents(),fetchSubmissions(assignmentId)]);
  const submitted=new Set(submissions.map(row=>String(row.studentCode||'').trim().toUpperCase()));
  const seen=new Set(),candidates=students.filter(row=>{
   const code=String(row.studentCode||row.code||row.id||'').trim().toUpperCase();
   if(!code||seen.has(code)||submitted.has(code)||!studentIsApproved(row)||!learningTargetMatchesStudent(initial.data(),{...row,studentCode:code})||!canAccess(initial.data(),row))return false;
   seen.add(code);return true;
  });
  let created=0,duplicate=0,skipped=0;
  // Bounded transactions; daily identity is shared across all Admin accounts.
  for(let offset=0;offset<candidates.length;offset+=50){
   const part=candidates.slice(offset,offset+50),at=now(),day=dayKey(at);
   const counts=await db.runTransaction(async tx=>{
    const assignment=await tx.get(ref);
    if(!assignment.exists||!reminderOpen(assignment.data(),at))throw new HttpsError('failed-precondition','تم غلق الواجب؛ لم يتم إرسال تنبيهات إضافية.');
    const refs=part.flatMap(row=>{
     const code=String(row.studentCode||row.code||row.id).trim().toUpperCase(),lock=homeworkLockId(assignmentId,code);
     return [db.collection('students').doc(row.id),db.collection('account_notifications').doc(reminderId(assignmentId,code,day)),db.collection('homework_submission_locks').doc(lock),db.collection('homework_submissions').doc(lock)];
    });
    const snaps=await tx.getAll(...refs);const result={created:0,duplicate:0,skipped:0};
    part.forEach((row,index)=>{
     const [student,notice,lock,first]=snaps.slice(index*4,index*4+4),code=String(row.studentCode||row.code||row.id).trim().toUpperCase();
     if(!student.exists||String(student.data().studentCode||student.data().code||student.id).trim().toUpperCase()!==code||!studentIsApproved(student.data())||!learningTargetMatchesStudent(assignment.data(),{...student.data(),studentCode:code})||!canAccess(assignment.data(),student.data())||first.exists||Number(lock.data()?.submittedAttempts||0)>0){result.skipped++;return;}
     if(notice.exists){result.duplicate++;return;}
     tx.create(refs[index*4+1],{type:'HOMEWORK',title:'تذكير بتسليم الواجب',body:`لسه مستنيين تسليمك لواجب: ${String(assignment.data().title||'واجب الحصة').slice(0,180)}`,actionTab:'homework',priority:'important',active:true,target:{scope:'students',studentCodes:[code]},audienceKeys:['student:'+code],source:'homework-reminder',reminderDay:day,availableAt:at,expiresAt:at+86400000,createdAt:Timestamp.fromMillis(at),createdBy:profile.uid,contentRef:{collection:'assignments',id:assignmentId,requireMissing:true}});
     result.created++;
    });return result;
   });
   created+=counts.created;duplicate+=counts.duplicate;skipped+=counts.skipped;
  }
  return {ok:true,created,duplicate,skipped,eligible:candidates.length};
 };
}
module.exports={dayKey,reminderId,reminderOpen,createHomeworkReminders};
