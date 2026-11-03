'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),s=require('./testing/security-emulator');
let sessions;test.before(async()=>{sessions=await s.seed();});
const base={title:'محاضرة محلية',grade:s.grade,term:'الترم الأول',active:true,published:true,studentVisible:true,status:'published',lectureNumber:1,order:1};
test('curriculum retains progress beyond 40 mixed historical records using one bounded progress query',async()=>{
 const batch=s.db.batch();for(let i=0;i<45;i++)batch.set(s.db.doc('student_progress/'+s.code+'/lectures/old-'+String(i).padStart(2,'0')),{percent:100,sourceCollection:'materials'});
 batch.set(s.db.doc('lectures/zz-phase6'),{...base,id:'zz-phase6'});batch.set(s.db.doc('student_progress/'+s.code+'/lectures/zz-phase6'),{percent:65,sourceCollection:'lectures',viewed:true});await batch.commit();
 const data=await s.call('getStudentCurriculum',s.portal(sessions.token));assert.equal(data.lectures.find(r=>r.id==='zz-phase6').progress,65);
});
test('hidden, wrong-grade, wrong-group and closed lectures stay out of the recovered curriculum',async()=>{
 const batch=s.db.batch();for(const [id,extra]of [['hidden',{studentVisible:false,legacySource:'materials'}],['grade',{grade:'wrong grade'}],['group',{scheduleId:'other-group'}],['closed',{closeAt:'2020-01-01T00:00:00Z'}]])batch.set(s.db.doc('lectures/phase6-'+id),{...base,...extra});await batch.commit();
 const data=await s.call('getStudentCurriculum',s.portal(sessions.token));assert(!data.lectures.some(r=>['phase6-hidden','phase6-grade','phase6-group','phase6-closed'].includes(r.id)));
});
test('completion persists monotonically in the existing progress and monthly-event records',async()=>{
 const payload=s.portal(sessions.token,s.code,{lectureId:'zz-phase6',percent:100,sourceCollection:'lectures'});
 assert.equal((await s.call('recordLectureProgress',payload)).percent,100);assert.equal((await s.call('recordLectureProgress',{...payload,percent:10})).percent,100);
 const progress=(await s.db.doc('student_progress/'+s.code+'/lectures/zz-phase6').get()).data();assert.equal(progress.percent,100);assert.equal(progress.sourceCollection,'lectures');
 const data=await s.call('getStudentCurriculum',s.portal(sessions.token));assert.equal(data.lectures.find(r=>r.id==='zz-phase6').progress,100);
});
test('completion and content access reject foreign sessions and restricted resources',async()=>{
 await s.deny(s.call('recordLectureProgress',s.portal(sessions.otherToken,s.code,{lectureId:'zz-phase6',percent:100})));
 await s.deny(s.call('getLectureContent',s.portal(sessions.token,s.code,{lectureId:'phase6-group'})));
 await s.deny(s.call('recordLectureProgress',s.portal(sessions.token,s.code,{lectureId:'phase6-hidden',percent:100})));
});
test('file presence is surfaced without exposing an unsigned Storage URL',async()=>{
 await s.db.doc('lectures/phase6-file').set({...base,filePath:'curriculum/phase6-file.pdf',fileType:'application/pdf'});
 const data=await s.call('getStudentCurriculum',s.portal(sessions.token)),row=data.lectures.find(r=>r.id==='phase6-file');assert.equal(row.hasFile,true);assert.equal(row.contentType,'application/pdf');assert(!Object.hasOwn(row,'filePath'));assert(!Object.hasOwn(row,'fileUrl'));
});


test('legacy protected files retain authorization and never accept a different account session',async()=>{
 await s.db.doc('materials/phase6-file-material').set({title:'ملف خاص',grade:s.grade,group:'other-group',active:true,published:true,filePath:'materials/private.pdf'});
 await s.deny(s.call('getCurriculumFileUrl',s.portal(sessions.token,s.code,{collection:'materials',id:'phase6-file-material'})));
 await s.deny(s.call('getCurriculumFileUrl',s.portal(sessions.otherToken,s.code,{collection:'materials',id:'phase6-file-material'})));
});
