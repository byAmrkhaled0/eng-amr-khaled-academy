'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const s=require('./testing/security-emulator');let token;
const published={grade:s.grade,scheduleId:'sec-group',group:'اختبار',published:true,active:true,status:'published',order:0,allowDownload:true,createdAt:'2026-09-14T12:00:00+03:00'};
async function item(collection,id,patch={}){const filePath=`curriculum/${s.grade}/${collection}/${id}.pdf`;await s.admin.storage().bucket().file(filePath).save(Buffer.from('%PDF-test'),{metadata:{contentType:'application/pdf'}});await s.db.doc(collection+'/'+id).set({...published,filePath,...patch});return id;}
async function mode(value){await s.db.doc('students/'+s.code).update({contentAccessMode:value});}
const p=extra=>s.portal(token,s.code,extra);
test.before(async()=>{({token}=await s.seed());});
test('A: historical lectures are delivered but old questions/banks retain enrolment policy',async()=>{
 await mode('from_joining');const old={createdAt:'2026-09-01'};await item('materials','old-material',old);await item('questions','old-question',old);await item('lectures','old-lecture',old);await item('question_banks','old-bank',{...old,lectureId:'old-material',lectureSource:'materials'});
 const resources=await s.call('getStudentResources',p());assert(resources.materials.some(x=>x.id==='old-material'));assert(!resources.questions.some(x=>['old-question','old-bank'].includes(x.id)));
 assert((await s.call('getStudentCurriculum',p())).lectures.some(x=>x.id==='old-lecture'));
 assert((await s.call('getLectureContent',p({lectureId:'old-lecture'}))).lecture);
 assert((await s.call('getCurriculumFileUrl',p({collection:'lectures',id:'old-lecture'}))).url);
 await s.deny(s.call('getCurriculumFileUrl',p({collection:'question_banks',id:'old-bank'})));
 for(const [lectureId,sourceCollection] of [['old-lecture','lectures'],['old-material','materials']])assert.equal((await s.call('recordLectureProgress',p({lectureId,sourceCollection,percent:100}))).percent,100);
});
test('B: post-joining published content is listed, readable, signed and progress can be recorded',async()=>{
 await mode('from_joining');await item('lectures','new-lecture');await item('materials','new-material');await item('units','new-unit');for(const c of ['lecture_materials','bank_questions','question_banks'])await item(c,'new-'+c,{lectureId:'new-lecture',lectureSource:'lectures'});
 assert((await s.call('getStudentResources',p())).materials.some(x=>x.id==='new-material'));const curriculum=await s.call('getStudentCurriculum',p());assert(curriculum.lectures.some(x=>x.id==='new-lecture'));assert(curriculum.units.some(x=>x.id==='new-unit'));
 const lecture=await s.call('getLectureContent',p({lectureId:'new-lecture'}));assert.equal(lecture.materials.length,1);assert.equal(lecture.questions.length,2);
 for(const c of ['lectures','lecture_materials','bank_questions','question_banks'])assert((await s.call('getCurriculumFileUrl',p({collection:c,id:c==='lectures'?'new-lecture':'new-'+c}))).url);
 assert.equal((await s.call('recordLectureProgress',p({lectureId:'new-lecture',percent:30}))).percent,30);
});
test('C: full permits published historical content, not hidden or wrong audience',async()=>{await mode('full');assert((await s.call('getStudentResources',p())).materials.some(x=>x.id==='old-material'));assert((await s.call('getLectureContent',p({lectureId:'old-lecture'}))).lecture);assert((await s.call('getCurriculumFileUrl',p({collection:'question_banks',id:'old-bank'}))).url);});
test('D/E: lectures retain explicit student targeting, custom assessment policy is unchanged',async()=>{
 await mode('custom');await item('lectures','custom-targeted',{createdAt:'2026-09-01',targetStudentCodes:[s.code]});await item('lectures','custom-other',{createdAt:'2026-09-01',targetStudentCodes:[s.other]});
 assert((await s.call('getLectureContent',p({lectureId:'custom-targeted'}))).lecture);assert((await s.call('getLectureContent',p({lectureId:'old-lecture'}))).lecture);await s.deny(s.call('getLectureContent',p({lectureId:'custom-other'})));
 // UI contract is "previous content specifically named": new content remains available.
 assert((await s.call('getLectureContent',p({lectureId:'new-lecture'}))).lecture);
});
test('F/G: full never bypasses grade or schedule targeting, for lists or direct requests',async()=>{
 await mode('full');for(const [id,patch] of [['wrong-grade',{grade:'Advanced'}],['wrong-group',{scheduleId:'elsewhere'}]]){await item('lectures',id,patch);await item('materials',id,patch);await item('question_banks',id,{...patch,lectureId:'new-lecture'});const r=await s.call('getStudentResources',p());assert(!r.materials.some(x=>x.id===id));assert(!r.questions.some(x=>x.id===id));await s.deny(s.call('getLectureContent',p({lectureId:id})));await s.deny(s.call('getCurriculumFileUrl',p({collection:'question_banks',id})));}
});
test('H/I/J: hidden/archived parent revokes child access and no new URL is issued after hiding',async()=>{
 await mode('full');await item('lectures','revocable');for(const c of ['lecture_materials','bank_questions','question_banks'])await item(c,'child-'+c,{lectureId:'revocable'});
 assert((await s.call('getCurriculumFileUrl',p({collection:'question_banks',id:'child-question_banks'}))).url);
 for(const patch of [{status:'hidden',published:false},{status:'published',published:true,archived:true}]){await s.db.doc('lectures/revocable').update(patch);for(const c of ['lecture_materials','bank_questions','question_banks'])await s.deny(s.call('getCurriculumFileUrl',p({collection:c,id:'child-'+c})));await assert.rejects(s.call('getLectureContent',p({lectureId:'revocable'})));assert(!(await s.call('getStudentResources',p())).questions.some(x=>x.id==='child-question_banks'));}
});
test('K: published legacy curriculum with no original timestamp remains deterministic and accessible',async()=>{
 await mode('from_joining');await item('lectures','legacy',{createdAt:null,updatedAt:'2026-09-01'});await item('materials','legacy',{createdAt:null});assert((await s.call('getLectureContent',p({lectureId:'legacy'}))).lecture);assert((await s.call('getStudentResources',p())).materials.some(x=>x.id==='legacy'));
});
test('L: lecture delivery is independent of join date boundaries; assessments tested separately',async()=>{
 await mode('from_joining');for(const [id,createdAt,allowed] of [['at-grace','2026-09-13T11:55:00+03:00',true],['outside-grace','2026-09-13T11:54:59.999+03:00',false],['same-day','2026-09-13',true],['previous-day','2026-09-12',false]]){await item('lectures',id,{createdAt});assert((await s.call('getLectureContent',p({lectureId:id}))).lecture);}
});
test('historical lecture materials are available but question-bank assessment access stays restricted',async()=>{
 await mode('from_joining');for(const c of ['lecture_materials','bank_questions']){await item(c,'old-child-'+c,{createdAt:'2026-09-01',lectureId:'new-lecture'});if(c==='lecture_materials')assert((await s.call('getCurriculumFileUrl',p({collection:c,id:'old-child-'+c}))).url);else await s.deny(s.call('getCurriculumFileUrl',p({collection:c,id:'old-child-'+c})));}const r=await s.call('getLectureContent',p({lectureId:'new-lecture'}));assert(r.materials.some(x=>x.id==='old-child-lecture_materials'));assert(!r.questions.some(x=>x.id==='old-child-bank_questions'));
});
test('a historically hidden assignment cannot be submitted through its direct callable',async()=>{
 await mode('from_joining');await s.db.doc('assignments/old-assignment').set({...published,createdAt:'2026-09-01',questions:[{type:'mcq',question:'q',choices:['yes','no'],correctIndex:0,mark:1}],totalScore:1});await s.deny(s.call('submitAssignmentAnswer',p({assignmentId:'old-assignment',answers:{0:0}})));assert.equal((await s.db.collection('homework_submissions').where('assignmentId','==','old-assignment').get()).size,0);
});

test('v7006: legacy student, practical/theory history and hidden/archived/unpublished learning records',async()=>{
 await s.db.doc('students/'+s.code).update({contentAccessMode:s.admin.firestore.FieldValue.delete()});
 for(const [id,patch] of [['hotfix-theory',{lectureCategory:'theory'}],['hotfix-practical',{lectureCategory:'practical'}],['hotfix-hidden',{status:'hidden'}],['hotfix-archived',{archived:true}],['hotfix-unpublished',{published:false}]])await item('materials',id,{createdAt:'2026-09-01',...patch});
 const r=await s.call('getStudentResources',p());
 for(const id of ['hotfix-theory','hotfix-practical'])assert(r.materials.some(x=>x.id===id));
 for(const id of ['hotfix-hidden','hotfix-archived','hotfix-unpublished']){assert(!r.materials.some(x=>x.id===id));await s.deny(s.call('recordLectureProgress',p({lectureId:id,sourceCollection:'materials',percent:10})));}
});
test('v7006: closed historical exam and homework stay hidden and their direct mutations stay denied',async()=>{
 await mode('from_joining');
 await s.db.doc('exams/hotfix-old-exam').set({...published,title:'قديم',createdAt:'2026-09-01',closeAt:'2026-09-02',assessmentMode:'online',questions:[{type:'mcq',question:'q',choices:['a','b'],correctIndex:0,mark:1}]});
 const r=await s.call('getStudentResources',p());assert(!r.exams.some(x=>x.id==='hotfix-old-exam'));assert(!r.assignments.some(x=>x.id==='old-assignment'));
 await assert.rejects(s.call('startExam',p({examId:'hotfix-old-exam'})),e=>['permission-denied','failed-precondition'].includes(e.code));
 await s.deny(s.call('submitAssignmentAnswer',p({assignmentId:'old-assignment',answers:{0:0}})));
});
