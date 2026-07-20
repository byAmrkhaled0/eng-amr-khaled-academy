const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');
const functions=read('functions/index.js'),rules=read('firestore.rules'),storage=read('storage.rules'),sync=read('assets/firebase-sync.js');

for(const name of ['getStudentCurriculum','getLectureContent','recordLectureProgress','upsertCurriculumEntity','listCurriculumAdmin','deleteCurriculumEntity','createMonthlyExamPlan','getCurriculumFileUrl','migrateCurriculumV61']){
  assert(functions.includes(`exports.${name} = onCall`),`missing callable ${name}`);
  assert(sync.includes(`${name}:callable('${name}')`),`missing client binding ${name}`);
}
assert(/email_verified[^\n]+admin/.test(functions),'owner bootstrap must require verified email and admin claim');
assert(!/const OWNER_EMAILS/.test(functions),'owner emails must not be embedded');
assert(/parentCode = await uniqueNumericCode\('parent_portal'/.test(functions),'new parent code must be separate');
assert(/provisionalPortal, parentCode, active: false/.test(functions),'pending portal must remain inactive');
assert(rules.includes('match /teacher_files/{id} { allow read: if isTeacher(); allow write: if false; }'),'teacher files rules missing');
assert(rules.includes('match /student_progress/{studentCode}/{document=**} { allow read, write: if false; }'),'progress must be server-only');
assert(rules.includes('match /activityLog/{id} { allow read: if isStaff(); allow write: if false; }'),'audit log must be server-write-only');
assert(storage.includes('match /teacher-files/{fileName}'),'private teacher storage missing');
assert(storage.includes('request.resource.size <= 15 * 1024 * 1024'),'15MB limit missing');
assert(functions.includes("report.backup = await createPlatformBackup('pre-curriculum-v61-migration'"),'migration safety backup missing');
assert(functions.includes("correctAnswer: text(data.correctAnswer") && !/function publicLecture[\s\S]{0,1500}correctAnswer/.test(functions),'correct answers leaked in public lecture');
console.log('✓ Curriculum V61 security, migration and client bindings passed');
