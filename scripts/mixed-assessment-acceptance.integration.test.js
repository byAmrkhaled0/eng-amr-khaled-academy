'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),s=require('./testing/security-emulator');
let tokens,session,attemptId,submissionId;
const p=extra=>s.portal(tokens.token,s.code,extra),now=new Date(),monthKey=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).format(now);
const base={grade:s.grade,group:'اختبار',scheduleId:'sec-group',academicYear:'2026/2027',term:'الترم الأول',active:true,published:true,createdAt:new Date(Date.now()-60000).toISOString()};
const examText='اختر الناتج\nType: mcq\nMark: 2\nA) 4\nB) 5\nC) 6\nD) 7\nAnswer: B\n\nحدد صح أو خطأ\nType: truefalse\nMark: 1\nA) صح\nB) غلط\nAnswer: A\n\nأكمل ____\nType: fill\nMark: 3\nModel: accepted-fill-secret | بديل\n\nاشرح\nType: essay\nMark: 2\nModel: teacher-only-model\n\nاكتب الكود\nType: code\nMark: 2\nModel: teacher-only-code';
const questions=[{type:'mcq',question:'اختر',choices:['4','5','6','7'],correctIndex:1,mark:2},{type:'truefalse',question:'صح أم خطأ',choices:['صح','غلط'],correctIndex:0,mark:1},{type:'fill',question:'أكمل ____',modelAnswer:'accepted-fill-secret | بديل',mark:3},{type:'text',question:'اشرح',mark:2,modelAnswer:'teacher-only-model'},{type:'code',question:'اكتب كود',mark:2,language:'python',modelAnswer:'teacher-only-code'}];
const answers={0:'1',1:'0',2:' ACCEPTED-FILL-SECRET ',3:'شرح الطالب',4:'  print(5)\n'};
test.before(async()=>{tokens=await s.seed();await s.db.doc('students/'+s.code).update({contentAccessMode:'full'});await s.call('upsertVersionedContent',{collection:'exams',item:{...base,id:'accept-exam',title:'اختبار الأنواع الخمسة',text:examText,duration:30,openAt:new Date(Date.now()-60000).toISOString(),closeAt:new Date(Date.now()+3600000).toISOString(),revealCorrectAnswersAfterGrading:false}},s.auth);await s.call('upsertVersionedContent',{collection:'assignments',item:{...base,id:'accept-homework',title:'واجب الأنواع الخمسة',type:'multi',questions,totalScore:10}},s.auth);});
test('student receives five real exam controls/types, can resume, and receives no answer keys',async()=>{
 session=await s.call('startExam',p({examId:'accept-exam'}));assert.deepEqual(session.questions.map(q=>q.type),['mcq','truefalse','fill','essay','code']);assert.equal(JSON.stringify(session).includes('accepted-fill-secret'),false);assert.equal(JSON.stringify(session).includes('teacher-only'),false);
 await s.call('saveExamProgress',p({sessionId:session.sessionId,answers,revision:1,current:4}));const resume=await s.call('startExam',p({examId:'accept-exam'}));assert.deepEqual(resume.draft.answers,answers);
});
test('mixed exam persists all five answers once with automatic subtotal and manual pending state',async()=>{
 const result=await s.call('submitExam',p({sessionId:session.sessionId,answers,score:1000}));attemptId=result.id;assert.equal(result.score,null);assert.equal(result.autoScore,6);assert.equal(result.maxScore,10);assert.equal(result.needsManualReview,true);
 const row=(await s.db.doc('exam_attempts/'+attemptId).get()).data();assert.equal(row.answers.length,5);assert.equal(row.answers[3].answer,answers[3]);assert.equal(row.answers[4].answer,answers[4]);assert.equal(row.answers[2].awardedMark,3);assert.equal(row.answers[3].awardedMark,null);
 const retry=await s.call('submitExam',p({sessionId:session.sessionId,answers}));assert.equal(retry.id,attemptId);assert.equal((await s.db.collection('exam_attempts').where('examId','==','accept-exam').get()).size,1);
});
test('homework records five answers once without treating pending written answers as zero final grade',async()=>{
 await s.call('submitAssignmentAnswer',p({assignmentId:'accept-homework',answers}));const snap=await s.db.collection('homework_submissions').where('assignmentId','==','accept-homework').get();assert.equal(snap.size,1);submissionId=snap.docs[0].id;const row=snap.docs[0].data();assert.equal(row.autoScore,6);assert.equal(row.score,null);assert.equal(row.needsManualReview,true);assert.equal(row.answers[4].answer.trim(),answers[4].trim());
 await s.call('submitAssignmentAnswer',p({assignmentId:'accept-homework',answers}));assert.equal((await s.db.collection('homework_submissions').where('assignmentId','==','accept-homework').get()).size,1);
});
test('manual correction reaches student exam dashboard and profile as one result at 9/10',async()=>{
 const awarded={0:2,1:1,2:3,3:1,4:2};await s.call('reviewExamAttempt',{attemptId,awarded},s.auth);await s.call('reviewHomeworkSubmission',{submissionId,awarded},s.auth);
 const dashboard=await s.call('getExamDashboard',p({})),attempt=dashboard.student.examAttempts.find(row=>row.id===attemptId);assert.equal(attempt.score,9);assert.equal(attempt.needsManualReview,false);assert.equal(attempt.review[3].correctAnswer,undefined);
 const profile=await s.call('getStudentAdminProfile',{studentCode:s.code,academicYear:'2026/2027',monthKey},s.auth);const hw=profile.homeworks.filter(row=>row.assignment.id==='accept-homework');assert.equal(hw.length,1);assert.equal(hw[0].submission.score,9);
});
test('editing published questions preserves old snapshots, submitted answers and awarded marks',async()=>{
 const exam=(await s.db.doc('exams/accept-exam').get()).data(),homework=(await s.db.doc('assignments/accept-homework').get()).data();await s.call('upsertVersionedContent',{collection:'exams',item:{...exam,text:examText.replace('accepted-fill-secret','new-accepted-key')}},s.auth);await s.call('upsertVersionedContent',{collection:'assignments',item:{...homework,questions:questions.map(q=>q.type==='fill'?{...q,modelAnswer:'new-accepted-key'}:q)}},s.auth);
 const attempt=(await s.db.doc('exam_attempts/'+attemptId).get()).data(),submission=(await s.db.doc('homework_submissions/'+submissionId).get()).data();assert.equal(attempt.score,9);assert.equal(submission.score,9);assert.match(attempt.questionsSnapshot[2].modelAnswer,/accepted-fill-secret/);assert.match(submission.assignmentSnapshot.questions[2].modelAnswer,/accepted-fill-secret/);assert.equal(attempt.answers[2].awardedMark,3);
});
test('monthly report keeps exam/homework grades and pending status clears after review',async()=>{
 const report=await s.call('getStudentMonthlyReportAdmin',{studentCode:s.code,monthKey,force:true},s.auth);assert.ok(report.results.rows.some(row=>row.examId==='accept-exam'&&row.score===9));const row=report.homework.rows.find(row=>row.assignment.id==='accept-homework');assert.ok(row);assert.equal(row.submission.score,9);assert.equal(row.submission.percentage,90);
});
