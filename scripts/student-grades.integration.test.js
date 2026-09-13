'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||process.env.GCLOUD_PROJECT!=='demo-technominds')throw new Error('Disposable demo emulator required.');
const admin=require('../functions/node_modules/firebase-admin'),functions=require('../functions/entry'),db=admin.firestore();
const reader=require('../assets/student-grade-records'),results=require('../functions/lib/portal-results');
const auth={uid:'grade-test-admin',token:{admin:true,email_verified:true}},code='GRADETEST001';
const call=(name,data)=>functions[name].run({auth,data,rawRequest:{headers:{},socket:{remoteAddress:'127.0.0.1'}}});
test('student-scoped grade pages include more than 300 homework records and deduplicate legacy grade copies',async()=>{
 for(let start=0;start<621;start+=250){const batch=db.batch();for(let i=start;i<Math.min(621,start+250);i++)batch.set(db.doc('homework_submissions/grade-page-'+String(i).padStart(4,'0')),{studentCode:code,assignmentId:'grade-assignment-'+i,score:i===620?10:5,maxScore:10,submittedAt:'2026-09-13'});await batch.commit();}
 await db.doc('grades/grade-page-duplicate').set({code,assignmentId:'grade-assignment-620',score:8,maxScore:10});
 await db.doc('homework_submissions/grade-page-unrelated').set({studentCode:'SOMEONEELSE',assignmentId:'hidden',score:1,maxScore:10});
 let requests=0;
 const records=await reader.load([code],async({collection,field,codes,cursor,pageSize})=>{requests++;let query=db.collection(collection).where(field,'in',codes).orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);if(cursor)query=query.startAfter(cursor);const snap=await query.get();return {rows:snap.docs.map(doc=>({...doc.data(),id:doc.id})),nextCursor:snap.size===pageSize?snap.docs.at(-1).id:null};});
 assert.equal(records.homeworks.length,621);assert.equal(records.grades.length,1);assert.equal(requests,6);
 const unified=results.normalizeUnifiedResults({homeworks:records.homeworks,grades:records.grades,examAttempts:records.attempts});assert.equal(unified.length,621);assert.equal(unified.find(row=>row.activityId==='grade-assignment-620').score,10);
});
test('actual homework correction and grade revision reach the student profile with one academic result',async()=>{
 await db.doc('users/'+auth.uid).set({role:'admin',active:true});const studentCode='GRADECORRECT01';
 await db.doc('students/'+studentCode).set({studentCode,studentName:'اختبار التصحيح',active:true,grade:'أساسيات برمجة',academicYear:'2026/2027'});
 await db.doc('homework_submissions/grade-correction').set({studentCode,assignmentId:'grade-lesson',homeworkTitle:'واجب الشروط',score:null,maxScore:10,needsManualReview:true,answers:[{question:'فسر',answer:'مثال',mark:10}],submittedAt:'2026-09-13',attemptNumber:1});
 const before=await call('getStudentAdminProfile',{studentCode});const pending=before.results.find(row=>row.activityId==='grade-lesson');assert.equal(pending.score,null);
 await call('reviewHomeworkSubmission',{submissionId:'grade-correction',awarded:{0:8}});
 const first=await call('getStudentAdminProfile',{studentCode});assert.equal(first.results.filter(row=>row.activityId==='grade-lesson').length,1);assert.equal(first.results.find(row=>row.activityId==='grade-lesson').percentage,80);
 await call('reviewHomeworkSubmission',{submissionId:'grade-correction',awarded:{0:10}});
 const updated=await call('getStudentAdminProfile',{studentCode});assert.equal(updated.results.filter(row=>row.activityId==='grade-lesson').length,1);assert.equal(updated.results.find(row=>row.activityId==='grade-lesson').percentage,100);
 const history=await db.collection('homework_review_history').where('submissionId','==','grade-correction').get();assert.equal(history.size,2);assert(history.docs.some(doc=>doc.data().oldGrade===null));
});
