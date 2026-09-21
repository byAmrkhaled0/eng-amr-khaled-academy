'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_STORAGE_EMULATOR_HOST||process.env.GCLOUD_PROJECT!=='demo-technominds')throw new Error('Disposable demo emulators required.');
const admin=require('../functions/node_modules/firebase-admin'),functions=require('../functions/entry'),db=admin.firestore();
const auth={uid:'banks-test-admin',token:{admin:true,email_verified:true,email:'bank@example.test'}};
const call=(name,data,identity=auth)=>functions[name].run({auth:identity,data,rawRequest:{headers:{},socket:{remoteAddress:'127.0.0.1'}}});
const code='BANKTEST001',grade='أساسيات برمجة',lessonId='test-theory-lesson',token='bank-session-'.padEnd(48,'a');
const portal={code,studentCode:code,portalSessionToken:token};
const bank={title:'بنك تجريبي',grade:'مسار آخر',status:'published',lectureId:lessonId,lectureSource:'materials',order:0,content:'سؤال تجريبي'};
test.before(async()=>{
 await db.doc('users/'+auth.uid).set({role:'admin',active:true});
 await db.doc('students/'+code).set({studentCode:code,studentName:'طالب تجريبي',active:true,grade,scheduleId:'banks-group',group:'تجريبية',academicYear:'2026/2027'});
 await db.doc('materials/'+lessonId).set({title:'درس الشروط',grade,lectureCategory:'theory',active:true,published:true,status:'منشور',scheduleId:'banks-group',group:'تجريبية',academicYear:'2026/2027',term:'الترم الأول'});
 await db.doc('_portal_sessions/'+crypto.createHash('sha256').update(token).digest('hex')).set({studentCode:code,mode:'student',expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+3600000)});
});
test('bank save, retry and audience are server-owned; hidden or archived lessons block resource and file access',async()=>{
 const filePath=`curriculum/${grade}/question_banks/fixture.pdf`;
 await admin.storage().bucket().file(filePath).save(Buffer.from('%PDF-1.7\nfixture'),{metadata:{contentType:'application/pdf'}});
 await assert.rejects(call('upsertCurriculumEntity',{collection:'question_banks',id:'test-bank',data:bank},null),/تسجيل دخول/);
 await call('upsertCurriculumEntity',{collection:'question_banks',id:'test-bank',data:{...bank,filePath,fileName:'fixture.pdf'}});
 await call('upsertCurriculumEntity',{collection:'question_banks',id:'test-bank',data:{...bank,filePath,fileName:'fixture.pdf'}});
 const row=(await db.doc('question_banks/test-bank').get()).data();assert.equal(row.grade,grade);assert.equal(row.scheduleId,'banks-group');assert.equal(row.lectureId,lessonId);assert.equal(row.lectureTitle,'درس الشروط');
 const resources=await call('getStudentResources',portal,null);assert(resources.questions.some(item=>item.id==='test-bank'&&item.lectureId===lessonId&&item.lectureSource==='materials'));
 await db.doc('materials/'+lessonId).update({active:false,published:false,status:'مخفي'});
 const hidden=await call('getStudentResources',portal,null);assert(!hidden.questions.some(item=>item.id==='test-bank'));
 await assert.rejects(call('getCurriculumFileUrl',{...portal,collection:'question_banks',id:'test-bank'},null),/الدرس المرتبط/);
 await db.doc('materials/'+lessonId).update({active:true,published:true,status:'منشور',archived:true});
 const archived=await call('getStudentResources',portal,null);assert(!archived.materials.some(item=>item.id===lessonId));assert(!archived.questions.some(item=>item.id==='test-bank'));
 await assert.rejects(call('upsertCurriculumEntity',{collection:'question_banks',id:'test-bank-invalid',data:bank}),/مؤرشف/);
 await db.doc('materials/'+lessonId).update({archived:false});
 await assert.rejects(call('upsertCurriculumEntity',{collection:'question_banks',id:'test-bank-invalid',data:{...bank,filePath:'teacher-files/private.pdf'}}),/مسار/);
 await admin.storage().bucket().file(`curriculum/${grade}/question_banks/wrong.pdf`).save(Buffer.from('not PDF'),{metadata:{contentType:'text/plain'}});
 await assert.rejects(call('upsertCurriculumEntity',{collection:'question_banks',id:'test-bank-invalid',data:{...bank,filePath:`curriculum/${grade}/question_banks/wrong.pdf`}}),/PDF/);
 await admin.storage().bucket().file(`curriculum/${grade}/question_banks/fake.pdf`).save(Buffer.from('not PDF'),{metadata:{contentType:'application/pdf'}});
 await assert.rejects(call('upsertCurriculumEntity',{collection:'question_banks',id:'test-bank-invalid',data:{...bank,filePath:`curriculum/${grade}/question_banks/fake.pdf`}}),/PDF/);
 await assert.rejects(call('getStudentResources',{...portal,portalSessionToken:'expired'.padEnd(48,'0')},null),/دخول|جلسة/);
 await db.doc('students/'+code).update({createdAt:'2026-09-13',contentAccessMode:'from_joining'});
 await db.doc('materials/'+lessonId).update({createdAt:'2026-09-01'});
 const newStudent=await call('getStudentResources',portal,null);assert(!newStudent.materials.some(item=>item.id===lessonId));assert(!newStudent.questions.some(item=>item.id==='test-bank'));
 await assert.rejects(call('getCurriculumFileUrl',{...portal,collection:'question_banks',id:'test-bank'},null),/الدرس المرتبط/);
 await db.doc('students/'+code).update({contentAccessMode:'full',scheduleId:'other-group',group:'أخرى'});
 const otherGroup=await call('getStudentResources',portal,null);assert(!otherGroup.questions.some(item=>item.id==='test-bank'));
 await assert.rejects(call('getCurriculumFileUrl',{...portal,collection:'question_banks',id:'test-bank'},null),/متاح/);
});
test('pagination returns every tied order, includes zero, and excludes other lessons and grades',async()=>{
 const batch=db.batch();for(let i=0;i<67;i++)batch.set(db.doc(`question_banks/page-${String(i).padStart(3,'0')}`),{title:'بنك',grade,term:'الترم الأول',order:0,lectureId:'page-lesson'});
 batch.set(db.doc('question_banks/page-other'),{title:'آخر',grade:'Advanced',term:'الترم الأول',order:0,lectureId:'page-lesson'});
 await batch.commit();
 for(const direction of ['asc','desc']){
  let cursor=null;const ids=[];
  do{const result=await call('listCurriculumAdmin',{collection:'question_banks',lectureId:'page-lesson',grade,term:'الترم الأول',pageSize:30,direction,cursor});assert(result.rows.every(row=>row.grade===grade));ids.push(...result.rows.map(row=>row.id));cursor=result.nextCursor;}while(cursor);
  assert.equal(ids.length,67);assert.equal(new Set(ids).size,67);
 }
});
