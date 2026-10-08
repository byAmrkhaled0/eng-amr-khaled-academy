'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./exam-recovery-v7007.test');
test('real Firestore transaction retry: simultaneous starts, saves/submits, isolated history and exact result count', {skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^127\.0\.0\.1:/);
 const admin=require('firebase-admin/app'),firestore=require('firebase-admin/firestore');const app=admin.initializeApp({projectId:'demo-technominds-exam-hotfix'});const db=firestore.getFirestore(app);
 const f=fixture();f.ctx.db={collection:db.collection.bind(db),runTransaction:fn=>db.runTransaction(async tx=>await fn(tx))};f.ctx.Timestamp=firestore.Timestamp;f.ctx.FieldValue=firestore.FieldValue;
 await db.doc('exams/e').set({duration:1,active:true,title:'Exam'});
 const [a,b]=await Promise.all([f.call('startExam'),f.call('startExam')]);assert.equal(a.sessionId,b.sessionId);
 await f.call('saveExamProgress',{sessionId:a.sessionId,answers:{0:'history'},revision:1});f.time(1070000);
 await db.doc('exams/e').update({scheduleRevision:1,scheduleChangedAt:firestore.Timestamp.fromMillis(1070000)});
 const [c,d]=await Promise.all([f.call('startExam'),f.call('startExam')]);assert.equal(c.sessionId,d.sessionId);assert.notEqual(c.sessionId,a.sessionId);
 for(const method of ['saveExamProgress','submitExam'])await assert.rejects(f.call(method,{sessionId:a.sessionId,answers:{0:'stale'},revision:5}),e=>e.code==='failed-precondition');
 const ops=await Promise.all([f.call('saveExamProgress',{sessionId:c.sessionId,answers:{0:'draft'},revision:1}),f.call('submitExam',{sessionId:c.sessionId,answers:{0:'final'}}),f.call('submitExam',{sessionId:c.sessionId,answers:{0:'final'}})]);
 assert.equal(ops[1].id,ops[2].id);assert.equal((await db.doc('student_attempts/12345678').get()).data().count,1);assert.equal((await db.collection('exam_attempts').get()).size,1);assert.equal((await db.doc('exam_sessions/'+a.sessionId).get()).data().draftAnswers[0],'history');assert.equal((await db.doc('exam_attempts/'+ops[1].id).get()).data().answers[0].answer,'final');
 await admin.deleteApp(app);
});
