'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const s=require('./testing/security-emulator');let tokens,examSession;
const definitions=[['getStudentResources',{}],['getStudentCurriculum',{}],['getLectureContent',{lectureId:'idor-lecture'}],['getCurriculumFileUrl',{collection:'lectures',id:'idor-lecture'}],['recordLectureProgress',{lectureId:'idor-lecture',percent:20}],['submitAssignmentAnswer',{assignmentId:'idor-assignment',answers:{0:0}}],['getExamDashboard',{}],['startExam',{examId:'idor-exam'}],['saveExamProgress',{sessionId:'idor-exam_'+s.code,revision:1,answers:{0:0}}],['submitExam',{sessionId:'idor-exam_'+s.code,answers:{0:0}}],['createStudentTransferRequest',{targetScheduleId:'idor-target',reason:'integration fixture'}],['getStudentLeaderboardPosition',{}],['prepareHomeworkUpload',{fileName:'test.pdf',contentType:'application/pdf',size:8}],['registerHomeworkSubmission',{uploadId:'00000000-0000-4000-8000-000000000001',path:'homework/test'}]];
test.before(async()=>{
 tokens=await s.seed();await s.db.doc('students/'+s.code).update({contentAccessMode:'full'});const published={grade:s.grade,scheduleId:'sec-group',group:'اختبار',active:true,published:true,status:'published',createdAt:'2026-09-14',order:0};
 const filePath=`curriculum/${s.grade}/lectures/idor.pdf`;await s.admin.storage().bucket().file(filePath).save(Buffer.from('%PDF-test'),{metadata:{contentType:'application/pdf'}});await s.db.doc('lectures/idor-lecture').set({...published,filePath});await s.db.doc('assignments/idor-assignment').set({...published,questions:[{type:'mcq',question:'1+1?',choices:['2','3'],correctIndex:0,mark:1}],totalScore:1});
 await s.db.doc('exams/idor-exam').set({...published,text:'1+1?\nType: mcq\nMark: 1\nA) 2\nB) 3\nAnswer: A',duration:20,totalScore:1,openAt:new Date(Date.now()-60000).toISOString(),closeAt:new Date(Date.now()+3600000).toISOString()});await s.db.doc('groups/idor-target').set({grade:s.grade,name:'Target',active:true,capacity:100,days:'الأربعاء'});
});
for(const [name,extra] of definitions){
 test(`${name}: A session cannot address B, parent cannot mutate, expired/fake token denied`,async()=>{
  await s.deny(s.call(name,s.portal(tokens.token,s.other,extra)));await s.deny(s.call(name,s.portal(tokens.parent,s.code,extra)));const expired=await s.session(s.code,'student',Date.now()-1000);await s.deny(s.call(name,s.portal(expired,s.code,extra)));await s.deny(s.call(name,s.portal('fake-token-'.padEnd(48,'x'),s.code,extra)));
 });
}
test('A owns allowed content, curriculum, files, progress, homework, exam and transfer workflows',async()=>{
 const p=extra=>s.portal(tokens.token,s.code,extra);
 assert((await s.call('getStudentResources',p())).student.studentCode===s.code);assert((await s.call('getStudentCurriculum',p())).student.code===s.code);assert((await s.call('getLectureContent',p({lectureId:'idor-lecture'}))).lecture);assert((await s.call('getCurriculumFileUrl',p({collection:'lectures',id:'idor-lecture'}))).url);assert.equal((await s.call('recordLectureProgress',p({lectureId:'idor-lecture',percent:20}))).percent,20);
 assert((await s.call('submitAssignmentAnswer',p({assignmentId:'idor-assignment',answers:{0:0}}))).ok);assert((await s.call('getExamDashboard',p())).exams.some(e=>e.id==='idor-exam'));const started=await s.call('startExam',p({examId:'idor-exam'}));examSession=started.sessionId;assert(examSession);await s.call('saveExamProgress',p({sessionId:examSession,revision:1,answers:{0:0}}));const result=await s.call('submitExam',p({sessionId:examSession,answers:{0:0}}));assert.equal(result.score,1);
 assert((await s.call('createStudentTransferRequest',p({targetScheduleId:'idor-target',reason:'integration fixture'}))));assert((await s.call('getStudentLeaderboardPosition',p())));
});
test('A cannot save or submit B exam session even while sending A studentCode',async()=>{
 await s.db.doc('exam_sessions/foreign-session').set({studentCode:s.other,status:'started',examId:'idor-exam',questions:[],expiresAt:s.admin.firestore.Timestamp.fromMillis(Date.now()+3600000)});
 for(const name of ['saveExamProgress','submitExam'])await s.deny(s.call(name,s.portal(tokens.token,s.code,{sessionId:'foreign-session',answers:{0:0},revision:2})));assert.equal((await s.db.doc('exam_sessions/foreign-session').get()).data().status,'started');
});
test('parent report session is owner/mode/expiry bound and own parent is allowed',async()=>{
 const data={monthKey:'2026-09'};assert((await s.call('getParentMonthlyReport',s.portal(tokens.parent,s.code,data))).student.studentCode===s.code);await s.deny(s.call('getParentMonthlyReport',s.portal(tokens.token,s.code,data)));await s.deny(s.call('getParentMonthlyReport',s.portal(tokens.parent,s.other,data)));await s.deny(s.call('getParentMonthlyReport',s.portal(await s.session(s.code,'parent',Date.now()-1),s.code,data)));await s.deny(s.call('getParentMonthlyReport',s.portal('fake-parent'.padEnd(48,'x'),s.code,data)));
});
