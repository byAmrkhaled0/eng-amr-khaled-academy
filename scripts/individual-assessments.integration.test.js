'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),s=require('./testing/security-emulator');
let tokens,session;
const p=(who,extra={})=>s.portal(who==='A'?tokens.token:tokens.otherToken,who==='A'?s.code:s.other,extra);
const base={grade:'كل المسارات',group:'كل المجموعات',scheduleId:'',groupId:'',term:'الترم الأول',academicYear:'2026/2027',active:true,published:true,targetingMode:'students',targetStudentCodes:[s.code],createdAt:new Date(Date.now()-60000).toISOString()};
const exam={...base,id:'only-one-exam',title:'اختبار فردي',text:'أكمل ____\nType: fill\nMark: 2\nModel: yes',duration:20,openAt:new Date(Date.now()-60000).toISOString(),closeAt:new Date(Date.now()+3600000).toISOString()};
const homework={...base,id:'only-one-hw',title:'واجب فردي',type:'multi',questions:[{type:'fill',question:'أكمل ____',mark:2,modelAnswer:'yes'}]};
const save=(collection,item)=>s.call('upsertVersionedContent',{collection,item},s.auth);
test.before(async()=>{tokens=await s.seed();for(const code of [s.code,s.other])await s.db.doc('students/'+code).update({contentAccessMode:'full',term:'الترم الأول'});await save('exams',exam);await save('assignments',homework);});
test('server persists the exact exam/homework targets and student audience keys',async()=>{
 for(const [collection,id] of [['exams',exam.id],['assignments',homework.id]]){const row=(await s.db.doc(collection+'/'+id).get()).data();assert.deepEqual(row.targetStudentCodes,[s.code]);assert.deepEqual(row.audienceKeys,['student:'+s.code]);assert.equal(row.targetingMode,'students');}
});
test('only selected student sees the exam and homework; same-class peer sees neither',async()=>{
 for(const who of ['A','B']){const resources=await s.call('getStudentResources',p(who)),dashboard=await s.call('getExamDashboard',p(who));assert.equal(resources.assignments.some(row=>row.id===homework.id),who==='A');assert.equal(dashboard.exams.some(row=>row.id===exam.id),who==='A');}
});
test('non-selected peer cannot start by direct exam ID or submit by direct homework ID',async()=>{
 await assert.rejects(s.call('startExam',p('B',{examId:exam.id})),e=>e.code==='permission-denied');await assert.rejects(s.call('submitAssignmentAnswer',p('B',{assignmentId:homework.id,answers:{0:'yes'}})),e=>e.code==='permission-denied');
});
test('empty, malformed, over-limit and contradictory selections fail closed without saving',async()=>{
 for(const patch of [{targetStudentCodes:[]},{targetStudentCodes:['!invalid!']},{targetStudentCodes:null},{targetStudentCodes:Array(501).fill(s.code)},{targetStudentCodes:[s.code],targetingMode:'class'}])for(const collection of ['exams','assignments'])await assert.rejects(save(collection,{...base,id:'invalid-'+collection,...patch}),e=>e.code==='invalid-argument');
 assert.equal((await s.db.doc('exams/invalid-exams').get()).exists,false);
});
test('audience can change before attempts, and multiple selected students can belong to different grades',async()=>{
 await save('exams',{...exam,id:'editable-exam'});await save('exams',{...exam,id:'editable-exam',targetStudentCodes:[s.other]});const dashboard=await s.call('getExamDashboard',p('A'));assert.equal(dashboard.exams.some(row=>row.id==='editable-exam'),false);
 await s.db.doc('students/'+s.other).update({grade:'أولى ثانوي بكالوريا',scheduleId:'another-group',group:'أخرى'});await save('assignments',{...homework,id:'multi-selected-hw',targetStudentCodes:[s.code,s.other]});const resources=await s.call('getStudentResources',p('B'));assert(resources.assignments.some(row=>row.id==='multi-selected-hw'));
});
test('once exam session starts or homework is submitted audience changes are rejected, metadata stays editable',async()=>{
 session=await s.call('startExam',p('A',{examId:exam.id}));await assert.rejects(save('exams',{...exam,targetStudentCodes:[s.other]}),e=>e.code==='failed-precondition');
 await s.call('submitAssignmentAnswer',p('A',{assignmentId:homework.id,answers:{0:'yes'}}));await assert.rejects(save('assignments',{...homework,targetStudentCodes:[s.other]}),e=>e.code==='failed-precondition');await save('assignments',{...homework,title:'عنوان محدث'});
});
test('selected student completes exam; individual grades reach own monthly report without penalizing peer',async()=>{
 const result=await s.call('submitExam',p('A',{sessionId:session.sessionId,answers:{0:'yes'}}));assert.equal(result.score,2);const monthKey=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).format(new Date());
 const a=await s.call('getStudentMonthlyReportAdmin',{studentCode:s.code,monthKey,force:true},s.auth),b=await s.call('getStudentMonthlyReportAdmin',{studentCode:s.other,monthKey,force:true},s.auth);
 assert(a.results.rows.some(row=>row.examId===exam.id&&row.score===2));assert(a.homework.rows.some(row=>row.assignment.id===homework.id&&row.submission?.score===2));assert.equal(b.results.rows.some(row=>row.examId===exam.id),false);assert.equal(b.homework.rows.some(row=>row.assignment.id===homework.id),false);
});
test('partial metadata update preserves selected audience and never falls back to a whole class',async()=>{
 const before=(await s.db.doc('exams/'+exam.id).get()).data();const saved=await save('exams',{id:exam.id,title:'اسم جديد'});assert.equal(saved.versionCreated,false);const row=(await s.db.doc('exams/'+exam.id).get()).data();assert.deepEqual(row.targetStudentCodes,[s.code]);assert.deepEqual(row.audienceKeys,['student:'+s.code]);assert.equal(row.targetingMode,'students');assert.equal(row.version,before.version);
});
