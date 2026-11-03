'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),s=require('./testing/security-emulator');
let tokens,session,examResult,homeworkResult;
const p=extra=>s.portal(tokens.token,s.code,extra);
const now=new Date(),monthKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).format(now).replace('/','-');
const text='أكمل: لغة البرمجة هي ____\nالنوع: fill\nالدرجة: 2\nالنموذج: Python | بايثون\n\nأكمل: العدد هو ____\nالنوع: fill\nالدرجة: 3\nالنموذج: 24';
const base={grade:s.grade,group:'اختبار',scheduleId:'sec-group',academicYear:'2026/2027',term:'الترم الأول',active:true,published:true,createdAt:new Date(now.getTime()-60000).toISOString()};
test.before(async()=>{tokens=await s.seed();await s.db.doc('students/'+s.code).update({contentAccessMode:'full'});await s.call('upsertVersionedContent',{collection:'exams',item:{...base,id:'fill-exam',title:'امتحان أكمل',text,duration:30,openAt:new Date(now.getTime()-60000).toISOString(),closeAt:new Date(now.getTime()+3600000).toISOString(),revealCorrectAnswersAfterGrading:false}},s.auth);await s.call('upsertVersionedContent',{collection:'assignments',item:{...base,id:'fill-homework',title:'واجب أكمل',type:'multi',questions:[{type:'fill',question:'اللغة ____',modelAnswer:'Python\nبايثون',mark:2},{type:'fill',question:'العدد ____',modelAnswer:'24',mark:3}]}},s.auth);});
test('admin saves fill exam; student entry and resume carry type and draft but never accepted answers',async()=>{
 session=await s.call('startExam',p({examId:'fill-exam'}));assert.equal(session.questions[0].type,'fill');assert.equal(JSON.stringify(session).includes('بايثون'),false);assert.equal(session.questions[0].modelAnswer,undefined);
 await s.call('saveExamProgress',p({sessionId:session.sessionId,answers:{0:' PYTHON ',1:'٢٤'},revision:1,current:1}));const resumed=await s.call('startExam',p({examId:'fill-exam'}));assert.equal(resumed.draft.answers[0],' PYTHON ');assert.equal(resumed.questions[1].type,'fill');
});
test('server auto-grades fill exam from saved key and repeated submit remains idempotent',async()=>{
 examResult=await s.call('submitExam',p({sessionId:session.sessionId,answers:{0:' PYTHON ',1:'٢٤'},score:999,correctAnswer:'forged'}));assert.equal(examResult.score,5);assert.equal(examResult.needsManualReview,false);assert.equal(examResult.review[0].type,'fill');assert.equal(examResult.review[0].correctAnswer,undefined);const retry=await s.call('submitExam',p({sessionId:session.sessionId,answers:{0:'wrong',1:'wrong'}}));assert.equal(retry.id,examResult.id);assert.equal(retry.score,5);
});
test('student receives fill homework without key; exact wrong answer gets zero and accepted alternative gets points',async()=>{
 const resources=await s.call('getStudentResources',p({})),hw=resources.assignments.find(row=>row.id==='fill-homework');assert.ok(hw);assert.equal(hw.questions[0].type,'fill');assert.equal(JSON.stringify(hw).includes('بايثون'),false);
 homeworkResult=await s.call('submitAssignmentAnswer',p({assignmentId:'fill-homework',answers:{0:'بايثون',1:'25'},score:999}));const snap=await s.db.collection('homework_submissions').where('assignmentId','==','fill-homework').get(),stored=snap.docs[0].data();assert.equal(stored.score,2);assert.equal(stored.maxScore,5);assert.equal(stored.needsManualReview,false);assert.equal(stored.answers[0].type,'fill');assert.equal(stored.answers[1].correct,false);homeworkResult={...homeworkResult,id:snap.docs[0].id};
});
test('teacher can revise fill grades and the monthly report retains both exam/homework results',async()=>{
 await s.call('reviewHomeworkSubmission',{submissionId:homeworkResult.id,awarded:{0:2,1:1},reason:'مراجعة إجابة أكمل'},s.auth);
 const report=await s.call('getStudentMonthlyReportAdmin',{studentCode:s.code,monthKey:new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).format(now),force:true},s.auth);
 assert.ok(report.results.rows.some(row=>row.examId==='fill-exam'&&row.score===5));assert.ok(report.homework.rows.some(row=>row.assignment.id==='fill-homework'&&row.submission?.score===3));
});
test('mixed written/fill homework and a missing legacy fill key retain manual-review state',async()=>{
 for(const [id,questions] of [['fill-mixed',[{type:'fill',question:'أكمل',modelAnswer:'yes',mark:2},{type:'text',question:'اشرح',mark:3}]],['fill-no-key',[{type:'fill',question:'أكمل',mark:2}]]]){await s.db.doc('assignments/'+id).set({...base,id,title:id,type:'multi',questions});await s.call('submitAssignmentAnswer',p({assignmentId:id,answers:{0:'yes',1:'written'}}));const row=(await s.db.collection('homework_submissions').where('assignmentId','==',id).get()).docs[0].data();assert.equal(row.score,null);assert.equal(row.needsManualReview,true);if(id==='fill-mixed')assert.equal(row.autoScore,2);}
});
