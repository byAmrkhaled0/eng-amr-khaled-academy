'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),s=require('./testing/security-emulator');
let tokens,old,newId;const p=extra=>s.portal(tokens.token,s.code,extra),T=s.admin.firestore.Timestamp;
test.before(async()=>{tokens=await s.seed();await s.db.doc('exams/recovery-security').set({title:'Synthetic recovery',grade:s.grade,active:true,published:true,duration:20,text:'Question\nType: essay\nMark: 1\nAnswer: model',openAt:new Date(Date.now()-3600000).toISOString(),closeAt:new Date(Date.now()+86400000).toISOString()});});
test('real authorized legacy recovery: missing revisions stay missing; unauthorized and partial requests fail atomically',async()=>{
 old=await s.call('startExam',p({examId:'recovery-security'}));await s.call('saveExamProgress',p({sessionId:old.sessionId,revision:1,answers:{0:'historical answer'}}));
 await s.db.doc('exam_sessions/'+old.sessionId).update({expiresAt:T.fromMillis(Date.now()-180000)});
 await assert.rejects(s.call('startExam',p({examId:'recovery-security'})),e=>e.code==='deadline-exceeded');
 const request={collection:'exams',item:{id:'recovery-security'},examRecoveryOnly:true,reopenExpiredStudentCodes:[s.code]};
 await s.deny(s.call('upsertVersionedContent',request));
 await assert.rejects(s.call('upsertVersionedContent',{...request,reopenExpiredStudentCodes:[s.code,s.other]},s.auth),e=>e.code==='failed-precondition');assert.equal((await s.db.doc('exams/recovery-security').get()).data().examRecoveryGrants,undefined);
 await s.call('upsertVersionedContent',request,s.auth);const exam=(await s.db.doc('exams/recovery-security').get()).data();assert.equal(exam.scheduleRevision,undefined);assert.equal(exam.scheduleChangedAt,undefined);
 const [a,b]=await Promise.all([s.call('startExam',p({examId:'recovery-security'})),s.call('startExam',p({examId:'recovery-security'}))]);newId=a.sessionId;assert.equal(a.sessionId,b.sessionId);assert.notEqual(newId,old.sessionId);
 assert.equal((await s.db.doc('exam_sessions/'+old.sessionId).get()).data().draftAnswers[0],'historical answer');
});
test('actual ownership, portal auth, expired bearer and old-attempt writes reject without corruption',async()=>{
 for(const name of ['saveExamProgress','submitExam']){
  await assert.rejects(s.call(name,p({sessionId:old.sessionId,revision:2,answers:{0:'stale'}})),e=>e.code==='failed-precondition');
  await s.deny(s.call(name,s.portal(tokens.otherToken,s.other,{sessionId:newId,revision:2,answers:{0:'foreign'}})));
  await s.deny(s.call(name,{studentCode:s.code,sessionId:newId,revision:2,answers:{0:'unauthenticated'}}));
  const expired=await s.session(s.code,'student',Date.now()-1000);await s.deny(s.call(name,s.portal(expired,s.code,{sessionId:newId,revision:2,answers:{0:'expired bearer'}})));
 }
 assert.equal((await s.db.doc('exam_sessions/'+newId).get()).data().draftAnswers,undefined);
});
test('actual concurrent draft/submit, response replay and lock preserve one result/count; submitted recovery denied',async()=>{
 const ops=await Promise.all([s.call('saveExamProgress',p({sessionId:newId,revision:1,answers:{0:'saved'}})),s.call('submitExam',p({sessionId:newId,answers:{0:'final'}})),s.call('submitExam',p({sessionId:newId,answers:{0:'final'}}))]);assert.equal(ops[1].id,ops[2].id);
 const again=await s.call('submitExam',p({sessionId:newId,answers:{0:'other'}}));assert.equal(again.id,ops[1].id);assert.equal((await s.db.doc('student_attempts/'+s.code).get()).data().count,1);assert.equal((await s.db.collection('exam_attempts').where('examId','==','recovery-security').get()).size,1);
 const result=(await s.db.doc('exam_attempts/'+again.id).get()).data();assert.equal(result.answers[0].answer,'final');assert((await s.db.doc('exam_locks/recovery-security_'+s.code).get()).exists);
 await s.db.doc('exams/recovery-security').update({scheduleRevision:5,scheduleChangedAt:T.now()});await assert.rejects(s.call('startExam',p({examId:'recovery-security'})),e=>e.code==='already-exists');await assert.rejects(s.call('upsertVersionedContent',{collection:'exams',item:{id:'recovery-security'},examRecoveryOnly:true,reopenExpiredStudentCodes:[s.code]},s.auth),e=>e.code==='failed-precondition');
});
test('normal exam save preserves server-issued grant and revision; cannot forge recovery via metadata',async()=>{
 const before=(await s.db.doc('exams/recovery-security').get()).data();await s.call('upsertVersionedContent',{collection:'exams',item:{...before,id:'recovery-security',title:'Renamed synthetic exam',examRecoveryGrants:{[s.code]:{sessionId:newId,authorizedAt:T.now()}},scheduleChangedAt:T.fromMillis(1)}},s.auth);
 const after=(await s.db.doc('exams/recovery-security').get()).data();assert.equal(after.examRecoveryGrants[s.code].sessionId,old.sessionId);assert.equal(after.scheduleRevision,before.scheduleRevision);assert.equal(after.scheduleChangedAt.toMillis(),before.scheduleChangedAt.toMillis());
});
