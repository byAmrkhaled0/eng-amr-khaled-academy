'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const s=require('./testing/security-emulator');
const {createHomeworkReminders,reminderId,dayKey}=require('../functions/lib/homework-reminders');
const {homeworkLockId}=require('../functions/lib/homework-domain');
let tokens;const assignmentId='reminder-assignment';
const base={title:'واجب التنبيه',grade:s.grade,group:'اختبار',scheduleId:'sec-group',active:true,published:true,academicYear:'2026/2027',createdAt:new Date(Date.now()-60000).toISOString()};
test.before(async()=>{tokens=await s.seed();await s.db.doc('students/'+s.code).update({contentAccessMode:'full'});await s.db.doc('students/'+s.other).update({contentAccessMode:'full'});await s.db.doc('assignments/'+assignmentId).set(base);});
test('manual homework reminder denies anonymous and non-admin requests',async()=>{
 await s.deny(s.call('remindMissingHomeworkAdmin',{assignmentId}));
 await s.db.doc('users/reminder-teacher').set({role:'teacher',active:true});
 await s.deny(s.call('remindMissingHomeworkAdmin',{assignmentId},{uid:'reminder-teacher',token:{teacher:true,email_verified:true}}));
 await assert.rejects(s.call('remindMissingHomeworkAdmin',{assignmentId:'a/b'},s.auth),e=>e.code==='invalid-argument');
});
test('targets only eligible missing submissions, and concurrent Admin retries create one daily notice',async()=>{
 await s.db.doc('students/WRONG-GRADE').set({studentCode:'WRONG-GRADE',grade:'تانية ثانوي بكالوريا',active:true,group:'اختبار',contentAccessMode:'full'});
 await s.db.doc('students/WRONG-GROUP').set({studentCode:'WRONG-GROUP',grade:s.grade,active:true,group:'تانية',scheduleId:'other-group',contentAccessMode:'full'});
 await s.db.doc('students/PENDING1').set({studentCode:'PENDING1',grade:s.grade,active:true,group:'اختبار',accessStatus:'pending',approvalStatus:'pending',contentAccessMode:'full'});
 await s.db.doc('homework_submissions/legacy-submitted').set({assignmentId,studentCode:s.other,needsManualReview:true});
 const results=await Promise.all([s.call('remindMissingHomeworkAdmin',{assignmentId},s.auth),s.call('remindMissingHomeworkAdmin',{assignmentId},s.auth)]);
 assert.equal(results.reduce((n,r)=>n+r.created,0),1);assert.equal(results.reduce((n,r)=>n+r.duplicate,0),1);
 const found=await s.db.collection('account_notifications').where('source','==','homework-reminder').get();assert.equal(found.size,1);
 const notice=found.docs[0].data();assert.deepEqual(notice.target.studentCodes,[s.code]);assert.equal(notice.actionTab,'homework');assert.equal(notice.contentRef.requireMissing,true);
 const own=await s.call('getStudentAccountNotifications',s.portal(tokens.token),null);assert(own.rows.some(n=>n.source==='homework-reminder'));
 const peer=await s.call('getStudentAccountNotifications',s.portal(tokens.otherToken,s.other),null);assert(!peer.rows.some(n=>n.source==='homework-reminder'));
});
test('submitting after a reminder hides it from the inbox and prevents further reminders',async()=>{
 const id=homeworkLockId(assignmentId,s.code);await s.db.doc('homework_submission_locks/'+id).set({assignmentId,studentCode:s.code,submittedAttempts:1});
 const own=await s.call('getStudentAccountNotifications',s.portal(tokens.token));assert(!own.rows.some(n=>n.source==='homework-reminder'));
 const result=await s.call('remindMissingHomeworkAdmin',{assignmentId},s.auth);assert.equal(result.created,0);
});
test('closed, draft, future and archived homework cannot send reminders',async()=>{
 for(const patch of [{archived:true},{published:false},{submissionClosed:true},{dueDate:'2020-01-01'},{closeAt:'2020-01-01T00:00:00Z'},{publishAt:'2099-01-01T00:00:00Z'},{status:'draft'}]){
  await s.db.doc('assignments/closed-reminder').set({...base,...patch});
  await assert.rejects(s.call('remindMissingHomeworkAdmin',{assignmentId:'closed-reminder'},s.auth),e=>e.code==='failed-precondition');
 }
});
test('individual targeting uses server audience rather than supplied student codes',async()=>{
 await s.db.doc('assignments/individual-reminder').set({...base,targetingMode:'students',targetStudentCodes:[s.other]});
 const result=await s.call('remindMissingHomeworkAdmin',{assignmentId:'individual-reminder',studentCodes:[s.code]},s.auth);assert.equal(result.created,1);
 const notices=await s.db.collection('account_notifications').where('source','==','homework-reminder').get();
 const notice=notices.docs.find(d=>d.data().contentRef.id==='individual-reminder').data();assert.deepEqual(notice.target.studentCodes,[s.other]);
});
test('a later Cairo date allows one new reminder without modifying yesterday notice',async()=>{
 let now=Date.parse('2026-11-05T20:00:00Z');
 await s.db.doc('assignments/nextday-reminder').set({...base,targetingMode:'students',targetStudentCodes:[s.other]});
 const send=createHomeworkReminders({db:s.db,Timestamp:s.admin.firestore.Timestamp,HttpsError:require('node:module').createRequire(require.resolve('../functions/package.json'))('firebase-functions/v2/https').HttpsError,now:()=>now,canAccess:()=>true,fetchStudents:async()=>[{id:s.other,...(await s.db.doc('students/'+s.other).get()).data()}],fetchSubmissions:async()=>[]});
 assert.equal((await send('nextday-reminder',s.auth)).created,1);assert.equal((await send('nextday-reminder',s.auth)).duplicate,1);
 const yesterday=reminderId('nextday-reminder',s.other,dayKey(now));now+=86400000;
 assert.equal((await send('nextday-reminder',s.auth)).created,1);assert((await s.db.doc('account_notifications/'+yesterday).get()).exists);
});

test('server accepts repeated correction including zero and preserves review history',async()=>{
 const id='revision-submission';await s.db.doc('homework_submissions/'+id).set({assignmentId,studentCode:s.code,studentName:s.code,score:8,maxScore:10,needsManualReview:false,answers:[{question:'Explain',answer:'Answer',mark:10,awardedMark:8}],submittedAt:new Date().toISOString()});
 const zero=await s.call('reviewHomeworkSubmission',{submissionId:id,awarded:{0:0}},s.auth);assert.equal(zero.score,0);
 const revised=await s.call('reviewHomeworkSubmission',{submissionId:id,awarded:{0:5}},s.auth);assert.equal(revised.score,5);
 const stored=(await s.db.doc('homework_submissions/'+id).get()).data();assert.equal(stored.score,5);assert.equal(stored.needsManualReview,false);assert.equal(stored.answers[0].awardedMark,5);
 const history=await s.db.collection('homework_review_history').where('submissionId','==',id).get();assert.equal(history.size,2);
});
