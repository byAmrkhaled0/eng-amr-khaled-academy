'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const s=require('./testing/security-emulator');let token;
const published={grade:s.grade,scheduleId:'sec-group',group:'اختبار',published:true,active:true,status:'published',order:0,allowDownload:true,createdAt:'2026-09-14T12:00:00+03:00'};
async function item(collection,id,patch={}){const filePath=`curriculum/${s.grade}/${collection}/${id}.pdf`;await s.admin.storage().bucket().file(filePath).save(Buffer.from('%PDF-test'),{metadata:{contentType:'application/pdf'}});await s.db.doc(collection+'/'+id).set({...published,filePath,...patch});return id;}
async function mode(value){await s.db.doc('students/'+s.code).update({contentAccessMode:value});}
const p=extra=>s.portal(token,s.code,extra);
test.before(async()=>{({token}=await s.seed());});
test('A: from_joining hides old materials/questions/banks and denies direct lecture/file/progress',async()=>{
 await mode('from_joining');const old={createdAt:'2026-09-01'};await item('materials','old-material',old);await item('questions','old-question',old);await item('lectures','old-lecture',old);await item('question_banks','old-bank',{...old,lectureId:'old-material',lectureSource:'materials'});
 const resources=await s.call('getStudentResources',p());assert(!resources.materials.some(x=>x.id==='old-material'));assert(!resources.questions.some(x=>['old-question','old-bank'].includes(x.id)));
 const curriculum=await s.call('getStudentCurriculum',p());assert(!curriculum.lectures.some(x=>x.id==='old-lecture'));
 for(const [name,extra] of [['getLectureContent',{lectureId:'old-lecture'}],['getCurriculumFileUrl',{collection:'lectures',id:'old-lecture'}],['getCurriculumFileUrl',{collection:'question_banks',id:'old-bank'}],['recordLectureProgress',{lectureId:'old-lecture',percent:100}],['recordLectureProgress',{lectureId:'old-material',sourceCollection:'materials',percent:100}]])await assert.rejects(s.call(name,p(extra)),e=>['permission-denied','not-found'].includes(e.code));
 assert(!(await s.db.doc(`student_progress/${s.code}/lectures/old-lecture`).get()).exists);
});
test('B: post-joining published content is listed, readable, signed and progress can be recorded',async()=>{
 await mode('from_joining');await item('lectures','new-lecture');await item('materials','new-material');await item('units','new-unit');for(const c of ['lecture_materials','bank_questions','question_banks'])await item(c,'new-'+c,{lectureId:'new-lecture',lectureSource:'lectures'});
 assert((await s.call('getStudentResources',p())).materials.some(x=>x.id==='new-material'));const curriculum=await s.call('getStudentCurriculum',p());assert(curriculum.lectures.some(x=>x.id==='new-lecture'));assert(curriculum.units.some(x=>x.id==='new-unit'));
 const lecture=await s.call('getLectureContent',p({lectureId:'new-lecture'}));assert.equal(lecture.materials.length,1);assert.equal(lecture.questions.length,2);
 for(const c of ['lectures','lecture_materials','bank_questions','question_banks'])assert((await s.call('getCurriculumFileUrl',p({collection:c,id:c==='lectures'?'new-lecture':'new-'+c}))).url);
 assert.equal((await s.call('recordLectureProgress',p({lectureId:'new-lecture',percent:30}))).percent,30);
});
test('C: full permits published historical content, not hidden or wrong audience',async()=>{await mode('full');assert((await s.call('getStudentResources',p())).materials.some(x=>x.id==='old-material'));assert((await s.call('getLectureContent',p({lectureId:'old-lecture'}))).lecture);assert((await s.call('getCurriculumFileUrl',p({collection:'question_banks',id:'old-bank'}))).url);});
test('D/E: custom permits explicitly named historical content and denies unnamed historical content',async()=>{
 await mode('custom');await item('lectures','custom-targeted',{createdAt:'2026-09-01',targetStudentCodes:[s.code]});await item('lectures','custom-other',{createdAt:'2026-09-01',targetStudentCodes:[s.other]});
 assert((await s.call('getLectureContent',p({lectureId:'custom-targeted'}))).lecture);await s.deny(s.call('getLectureContent',p({lectureId:'old-lecture'})));await s.deny(s.call('getLectureContent',p({lectureId:'custom-other'})));
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
test('L: exact five-minute grace and Cairo date-only join boundaries are deterministic',async()=>{
 await mode('from_joining');for(const [id,createdAt,allowed] of [['at-grace','2026-09-13T11:55:00+03:00',true],['outside-grace','2026-09-13T11:54:59.999+03:00',false],['same-day','2026-09-13',true],['previous-day','2026-09-12',false]]){await item('lectures',id,{createdAt});if(allowed)assert((await s.call('getLectureContent',p({lectureId:id}))).lecture);else await s.deny(s.call('getLectureContent',p({lectureId:id})));}
});
test('direct child access denies historical child even when its parent is accessible',async()=>{
 await mode('from_joining');for(const c of ['lecture_materials','bank_questions']){await item(c,'old-child-'+c,{createdAt:'2026-09-01',lectureId:'new-lecture'});await s.deny(s.call('getCurriculumFileUrl',p({collection:c,id:'old-child-'+c})));}const r=await s.call('getLectureContent',p({lectureId:'new-lecture'}));assert(!r.materials.some(x=>x.id==='old-child-lecture_materials'));assert(!r.questions.some(x=>x.id==='old-child-bank_questions'));
});
test('a historically hidden assignment cannot be submitted through its direct callable',async()=>{
 await mode('from_joining');await s.db.doc('assignments/old-assignment').set({...published,createdAt:'2026-09-01',questions:[{type:'mcq',question:'q',choices:['yes','no'],correctIndex:0,mark:1}],totalScore:1});await s.deny(s.call('submitAssignmentAnswer',p({assignmentId:'old-assignment',answers:{0:0}})));assert.equal((await s.db.collection('homework_submissions').where('assignmentId','==','old-assignment').get()).size,0);
});
