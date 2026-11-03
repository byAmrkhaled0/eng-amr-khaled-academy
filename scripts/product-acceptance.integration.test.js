'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const s=require('./testing/security-emulator'),{createBackupService,planRestore,digest,BACKUP_COLLECTIONS}=require('../functions/lib/backup');
let tokens,examSession,attempt,submission,backup;const service=createBackupService({db:s.db,admin:s.admin,project:'demo-technominds'});
const monthKey=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).format(new Date());
const p=extra=>s.portal(tokens.token,s.code,extra);
const base={grade:'كل المسارات',group:'كل المجموعات',targetingMode:'students',targetStudentCodes:[s.code],academicYear:'2026/2027',term:'الترم الأول',active:true,published:true,createdAt:new Date(Date.now()-60000).toISOString()};
test.before(async()=>{tokens=await s.seed();await s.db.doc('students/'+s.code).update({contentAccessMode:'full'});});
test('teacher publishes mixed exam and homework to exactly one student',async()=>{
 await s.call('upsertVersionedContent',{collection:'exams',item:{...base,id:'product-exam',title:'Practical assessment',duration:30,totalScore:5,text:'Choose 2\nType: mcq\nMark: 2\nA) 2\nB) 3\nAnswer: A\n\nExplain the steps\nType: essay\nMark: 3\nModel: teacher-private',openAt:new Date(Date.now()-60000).toISOString(),closeAt:new Date(Date.now()+3600000).toISOString()}},s.auth);
 await s.call('upsertVersionedContent',{collection:'assignments',item:{...base,id:'product-homework',title:'Explain and apply',totalScore:5,questions:[{type:'mcq',question:'Choose 2',choices:['2','3'],correctIndex:0,mark:2},{type:'essay',question:'Explain your reasoning',modelAnswer:'teacher-private',mark:3}]}},s.auth);
 const own=await s.call('getStudentResources',p()),peer=await s.call('getStudentResources',s.portal(tokens.otherToken,s.other));
 assert(own.assignments.some(r=>r.id==='product-homework'));assert(!peer.assignments.some(r=>r.id==='product-homework'));
 assert(!JSON.stringify(own).includes('teacher-private'));
});
test('student resumes saved answer, submits once, and teacher grades pending work',async()=>{
 examSession=await s.call('startExam',p({examId:'product-exam'}));await s.call('saveExamProgress',p({sessionId:examSession.sessionId,answers:{0:'0',1:'My reasoning'},revision:1,current:1}));
 const resume=await s.call('startExam',p({examId:'product-exam'}));assert.equal(resume.draft.answers[1],'My reasoning');
 attempt=await s.call('submitExam',p({sessionId:examSession.sessionId,answers:{0:'0',1:'My reasoning'}}));assert.equal(attempt.autoScore,2);assert.equal(attempt.score,null);
 await s.call('submitAssignmentAnswer',p({assignmentId:'product-homework',answers:{0:'0',1:'My reasoning'}}));const found=await s.db.collection('homework_submissions').where('assignmentId','==','product-homework').get();assert.equal(found.size,1);submission=found.docs[0].id;
 await s.call('reviewExamAttempt',{attemptId:attempt.id,awarded:{0:2,1:2}},s.auth);await s.call('reviewHomeworkSubmission',{submissionId:submission,awarded:{0:2,1:3}},s.auth);
 assert.equal((await s.call('submitExam',p({sessionId:examSession.sessionId,answers:{0:'0',1:'My reasoning'}}))).id,attempt.id);
});
test('actual parent-session report contains both final marks and excludes the peer',async()=>{
 const report=await s.call('getParentMonthlyReport',s.portal(tokens.parent,s.code,{monthKey}));assert(report.results.rows.some(r=>r.examId==='product-exam'&&r.score===4));assert(report.homework.rows.some(r=>r.assignment.id==='product-homework'&&r.submission.score===5));
 await s.deny(s.call('getParentMonthlyReport',s.portal(tokens.parent,s.other,{monthKey})));
});
test('real compressed backup restores account, grades, nested progress and inbox state',async()=>{
 await s.db.doc('student_progress/'+s.code+'/lectures/recovery').set({percent:75,at:s.admin.firestore.Timestamp.now()});
 await s.db.doc('account_notifications/recovery-notice').set({title:'Synthetic inbox',active:true});await s.db.doc('account_notification_reads/'+s.code).set({readIds:['recovery-notice']});
 await s.db.doc('payments/recovery-payment').set({studentCode:s.code,amount:100});
 backup=await service.createPlatformBackup('local-product-recovery',{uid:s.auth.uid});
 const [bytes]=await s.admin.storage().bucket().file(backup.name).download(),payload=JSON.parse(zlib.gunzipSync(bytes));assert.equal(payload.manifest.collectionSchemaVersion,2);assert.equal(payload.manifest.storageBytesIncluded,false);assert(!('_portal_sessions' in payload.collections));assert(!('student_push_tokens' in payload.collections));
 await s.db.doc('students/'+s.code).delete();await s.db.doc('exam_attempts/'+attempt.id).delete();await s.db.doc('student_progress/'+s.code+'/lectures/recovery').delete();await s.db.doc('account_notifications/recovery-notice').delete();await s.db.doc('account_notification_reads/'+s.code).delete();
 const result=await service.applyRestore(await service.readBackup(backup.name),{uid:s.auth.uid});assert.equal(result.ok,true);assert(result.safetyBackup);assert.equal((await s.db.doc('exam_attempts/'+attempt.id).get()).data().score,4);assert.equal((await s.db.doc('student_progress/'+s.code+'/lectures/recovery').get()).data().percent,75);assert((await s.db.doc('students/'+s.code).get()).exists);assert((await s.db.doc('account_notifications/recovery-notice').get()).exists);assert.deepEqual((await s.db.doc('account_notification_reads/'+s.code).get()).data().readIds,['recovery-notice']);assert.equal((await s.db.doc('payments/recovery-payment').get()).data().amount,100);
});
test('old complete backup remains readable without deleting current inbox collections',()=>{
 const collections=Object.fromEntries(BACKUP_COLLECTIONS.filter(n=>!['account_notifications','account_notification_reads','monthly_report_state'].includes(n)).map(n=>[n,[]]));
 const result=planRestore({schemaVersion:63,backupFormatVersion:3,project:'demo-technominds',collections,manifest:{complete:true,sha256:digest(collections)}},'demo-technominds');assert(result.plan.preserved.includes('account_notifications'));assert.equal(result.plan.deletes,0);
});
test('corrupted new backup cannot omit durable notification state',async()=>{
 const [bytes]=await s.admin.storage().bucket().file(backup.name).download(),payload=JSON.parse(zlib.gunzipSync(bytes));delete payload.collections.account_notifications;payload.manifest.sha256=digest(payload.collections);assert.throws(()=>planRestore(payload,'demo-technominds'),/Incomplete or corrupt/);
});
test('financial conflict and stale restore preview are rejected without overwriting newer data',async()=>{
 await s.db.doc('payments/recovery-payment').update({amount:200});await assert.rejects(service.applyRestore(await service.readBackup(backup.name),{uid:s.auth.uid}),/بيانات مالية/);assert.equal((await s.db.doc('payments/recovery-payment').get()).data().amount,200);
 await s.db.doc('payments/recovery-payment').update({amount:100});const preview=await service.readBackup(backup.name);await s.db.doc('students/'+s.code).update({studentName:'Newer name'});await assert.rejects(service.applyRestore(preview,{uid:s.auth.uid}),/تغيرت بيانات/);assert.equal((await s.db.doc('students/'+s.code).get()).data().studentName,'Newer name');
});
test('error storage redacts raw secrets, and query variation cannot reset route quota',async()=>{
 await s.call('reportClientError',{kind:'TypeError',message:'SECRET-answer',page:'https://example.test/student.html?token=SECRET#SECRET',userAgent:'SECRET',line:4,column:2});const rows=await s.db.collection('client_errors').get();assert.equal(rows.size,1);assert(!JSON.stringify(rows.docs[0].data()).includes('SECRET'));assert.equal(rows.docs[0].data().line,4);
 for(let i=1;i<5;i++)await s.call('reportClientError',{page:'/student.html?code='+i});await assert.rejects(s.call('reportClientError',{page:'/student.html?code=999'}),e=>e.code==='resource-exhausted');
});
