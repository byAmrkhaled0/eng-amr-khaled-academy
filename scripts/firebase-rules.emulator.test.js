const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, Timestamp } = require('firebase/firestore');
const { ref, uploadBytes, getBytes, updateMetadata } = require('firebase/storage');

const root = path.resolve(__dirname, '..');
let env;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId:'demo-technominds',
    firestore:{host:'127.0.0.1',port:8181,rules:fs.readFileSync(path.join(root,'firestore.rules'),'utf8')},
    storage:{host:'127.0.0.1',port:9199,rules:fs.readFileSync(path.join(root,'storage.rules'),'utf8')}
  });
  await env.withSecurityRulesDisabled(async context => {
    const db=context.firestore();
    await setDoc(doc(db,'users/admin-uid'),{role:'admin',active:true});
    await setDoc(doc(db,'users/teacher-uid'),{role:'teacher',active:true});
    await setDoc(doc(db,'users/disabled-admin'),{role:'admin',active:false});
    await setDoc(doc(db,'students/12345678'),{studentCode:'12345678',name:'Test Student',active:true});
    await setDoc(doc(db,'exam_attempts/attempt-1'),{studentCode:'12345678',score:null,maxScore:10});
    await setDoc(doc(db,'settings/platform'),{siteName:'Techno Minds'});
    await setDoc(doc(db,'class_sessions/session-1'),{date:'2026-08-14',scheduleId:'group-1'});
    await setDoc(doc(db,'student_notes/note-1'),{studentCode:'12345678',note:'Private'});
    await uploadBytes(ref(context.storage(),'teacher-files/admin-test.pdf'),Buffer.from('%PDF-test'),{contentType:'application/pdf'});
  });
});

test.after(async()=>{if(env)await env.cleanup();});
const adminDb=()=>env.authenticatedContext('admin-uid',{admin:true,email_verified:true,email:'admin@example.com'}).firestore();

test('only the verified active Admin can read student data',async()=>{
  await assertSucceeds(getDoc(doc(adminDb(),'students/12345678')));
  const noClaim=env.authenticatedContext('admin-uid',{email_verified:true}).firestore();
  const teacher=env.authenticatedContext('teacher-uid',{email_verified:true}).firestore();
  const disabled=env.authenticatedContext('disabled-admin',{admin:true,email_verified:true}).firestore();
  await assertFails(getDoc(doc(noClaim,'students/12345678')));
  await assertFails(getDoc(doc(teacher,'students/12345678')));
  await assertFails(getDoc(doc(disabled,'students/12345678')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'students/12345678')));
});

test('exam grading cannot be written directly even by Admin',async()=>{
  await assertSucceeds(getDoc(doc(adminDb(),'exam_attempts/attempt-1')));
  await assertFails(updateDoc(doc(adminDb(),'exam_attempts/attempt-1'),{score:10}));
});

test('class sessions and private notes are Admin-readable but server-write-only',async()=>{
  await assertSucceeds(getDoc(doc(adminDb(),'class_sessions/session-1')));
  await assertSucceeds(getDoc(doc(adminDb(),'student_notes/note-1')));
  await assertFails(setDoc(doc(adminDb(),'class_sessions/session-2'),{date:'2026-08-14'}));
  await assertFails(setDoc(doc(adminDb(),'student_notes/note-2'),{studentCode:'12345678',note:'Bypass'}));
  const publicDb=env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(publicDb,'class_sessions/session-1')));
  await assertFails(getDoc(doc(publicDb,'student_notes/note-1')));
});

test('only the intended public settings document is anonymous-readable',async()=>{
  const publicDb=env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(publicDb,'settings/platform')));
  await assertFails(getDoc(doc(publicDb,'settings/private')));
  await assertFails(getDoc(doc(publicDb,'unknown/record')));
});

test('private curriculum files are readable only by the verified active Admin',async()=>{
  const adminStorage=env.authenticatedContext('admin-uid',{admin:true,email_verified:true}).storage();
  const teacherStorage=env.authenticatedContext('teacher-uid',{email_verified:true}).storage();
  const anonymousStorage=env.unauthenticatedContext().storage();
  const bytes=await assertSucceeds(getBytes(ref(adminStorage,'teacher-files/admin-test.pdf')));
  assert.ok(bytes.byteLength>0);
  await assertFails(getBytes(ref(teacherStorage,'teacher-files/admin-test.pdf')));
  await assertFails(getBytes(ref(anonymousStorage,'teacher-files/admin-test.pdf')));
});


test('lesson-bank uploads require a verified active Admin and PDF metadata; direct student access stays denied',async()=>{
  const staff=env.authenticatedContext('admin-uid',{admin:true,email_verified:true}).storage();
  const anonymous=env.unauthenticatedContext().storage();
  const file='curriculum/test/question_banks/lesson.pdf';
  await assertSucceeds(uploadBytes(ref(staff,file),Buffer.from('%PDF-1.7\nfixture'),{contentType:'application/pdf'}));
  await assertFails(uploadBytes(ref(staff,'curriculum/test/question_banks/image.pdf'),Buffer.from('image'),{contentType:'image/png'}));
  await assertFails(uploadBytes(ref(staff,'curriculum/test/question_banks/not-pdf.html'),Buffer.from('fake'),{contentType:'application/pdf'}));
  await assertFails(uploadBytes(ref(anonymous,'curriculum/test/question_banks/public.pdf'),Buffer.from('%PDF-'),{contentType:'application/pdf'}));
  await assertFails(getBytes(ref(anonymous,file)));
});

test('attendance direct writes and protected homework grants/reviews remain blocked',async()=>{
  for(const context of [env.unauthenticatedContext(),env.authenticatedContext('teacher-uid',{email_verified:true}),env.authenticatedContext('admin-uid',{admin:true,email_verified:true})]){
    const db=context.firestore();await assertFails(setDoc(doc(db,'attendance/bypass'),{studentCode:'12345678',date:'2026-09-30',status:'present'}));
    await assertFails(setDoc(doc(db,'homework_submissions/bypass'),{studentCode:'12345678',score:10,maxScore:10}));
    for(const collection of ['_homework_upload_tokens','homework_submission_locks','homework_attempt_grants','homework_review_history'])await assertFails(setDoc(doc(db,collection+'/bypass'),{studentCode:'12345678'}));
  }
  await assertSucceeds(setDoc(doc(adminDb(),'homework_submissions/class-check'),{studentCode:'12345678',method:'teacher_class_check',type:'homework',completed:true,approved:true}));
  await assertFails(updateDoc(doc(adminDb(),'homework_submissions/class-check'),{score:10}));
  const unverified=env.authenticatedContext('admin-uid',{admin:true,email_verified:false}).firestore();await assertFails(getDoc(doc(unverified,'students/12345678')));
});

test('teacher upload type, size and unverified/admin scope are enforced',async()=>{
  const verified=env.authenticatedContext('admin-uid',{admin:true,email_verified:true}).storage();
  const unverified=env.authenticatedContext('admin-uid',{admin:true,email_verified:false}).storage();
  const teacher=env.authenticatedContext('teacher-uid',{email_verified:true}).storage();
  await assertFails(uploadBytes(ref(verified,'teacher-files/disallowed.html'),Buffer.from('<html>'),{contentType:'text/html'}));
  await assertFails(uploadBytes(ref(verified,'teacher-files/oversized.pdf'),Buffer.alloc(15*1024*1024+1),{contentType:'application/pdf'}));
  await assertFails(uploadBytes(ref(unverified,'teacher-files/unverified.pdf'),Buffer.from('%PDF-'),{contentType:'application/pdf'}));
  await assertFails(uploadBytes(ref(teacher,'teacher-files/teacher.pdf'),Buffer.from('%PDF-'),{contentType:'application/pdf'}));
});

test('homework upload grants are exact, expiring and cannot authorize update or arbitrary type/size',async()=>{
  const studentCode='12345678',bytes=Buffer.from('%PDF-fixture'),uploadId='10000000-0000-4000-8000-000000000001';
  async function grant(id,patch={}){await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'_homework_upload_tokens/'+id),{studentCode,safeName:'work.pdf',size:bytes.length,contentType:'application/pdf',expiresAt:Timestamp.fromMillis(Date.now()+60000),...patch});});}
  const anonymous=env.unauthenticatedContext().storage(),target=ref(anonymous,`homework/${studentCode}/${uploadId}/work.pdf`);
  await assertFails(uploadBytes(target,bytes,{contentType:'application/pdf'}));await grant(uploadId);await assertSucceeds(uploadBytes(target,bytes,{contentType:'application/pdf'}));await assertFails(updateMetadata(target,{cacheControl:'public,max-age=60'}));
  await assertFails(uploadBytes(ref(anonymous,`homework/OTHER123/${uploadId}/work.pdf`),bytes,{contentType:'application/pdf'}));
  const expired='10000000-0000-4000-8000-000000000002';await grant(expired,{expiresAt:Timestamp.fromMillis(Date.now()-60000)});await assertFails(uploadBytes(ref(anonymous,`homework/${studentCode}/${expired}/work.pdf`),bytes,{contentType:'application/pdf'}));
  const size='10000000-0000-4000-8000-000000000003';await grant(size,{size:bytes.length+1});await assertFails(uploadBytes(ref(anonymous,`homework/${studentCode}/${size}/work.pdf`),bytes,{contentType:'application/pdf'}));
  const type='10000000-0000-4000-8000-000000000004';await grant(type,{contentType:'text/html'});await assertFails(uploadBytes(ref(anonymous,`homework/${studentCode}/${type}/work.pdf`),bytes,{contentType:'text/html'}));
});

test('unknown Firestore and Storage paths deny reads and writes even to Admin',async()=>{
  await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'closure_unknown/existing'),{value:true});await uploadBytes(ref(context.storage(),'closure_unknown/existing.pdf'),Buffer.from('%PDF-'),{contentType:'application/pdf'});});
  for(const context of [env.unauthenticatedContext(),env.authenticatedContext('admin-uid',{admin:true,email_verified:true})]){
    await assertFails(getDoc(doc(context.firestore(),'closure_unknown/existing')));await assertFails(setDoc(doc(context.firestore(),'closure_unknown/new'),{value:true}));
    await assertFails(getBytes(ref(context.storage(),'closure_unknown/existing.pdf')));await assertFails(uploadBytes(ref(context.storage(),'closure_unknown/new.pdf'),Buffer.from('%PDF-'),{contentType:'application/pdf'}));
  }
});

test('binary overwrite with a still-valid homework grant must obey update:false',async()=>{
  const bytes=Buffer.from('%PDF-overwrite'),uploadId='10000000-0000-4000-8000-000000000099',studentCode='12345678';
  await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'_homework_upload_tokens/'+uploadId),{studentCode,safeName:'repeat.pdf',size:bytes.length,contentType:'application/pdf',expiresAt:Timestamp.fromMillis(Date.now()+60000)});});
  const target=ref(env.unauthenticatedContext().storage(),`homework/${studentCode}/${uploadId}/repeat.pdf`);
  await assertSucceeds(uploadBytes(target,bytes,{contentType:'application/pdf'}));
  // This is intentionally an executable regression, not a source-string check.
  // firebase-tools 15.26.0 currently labels binary overwrite CREATE; report a failure, never weaken rules.
  await assertFails(uploadBytes(target,bytes,{contentType:'application/pdf'}));
});


test('browser identities cannot self-escalate privileges or read protected portal/upload state',async()=>{
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext('teacher-uid',{email_verified:true}),env.authenticatedContext('disabled-admin',{admin:true,email_verified:true}),env.authenticatedContext('admin-uid',{admin:true,email_verified:false})]){
  await assertFails(setDoc(doc(context.firestore(),'users/teacher-uid'),{role:'admin',active:true}));
 }
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext('teacher-uid',{email_verified:true}),env.authenticatedContext('admin-uid',{admin:true,email_verified:true})]){
  for(const collection of ['_homework_upload_tokens','homework_attempt_grants','homework_submission_locks','homework_review_history','_portal_sessions'])await assertFails(getDoc(doc(context.firestore(),collection+'/protected')));
  await assertFails(setDoc(doc(context.firestore(),'exam_attempts/security-bypass'),{studentCode:'12345678',score:10}));
 }
});
test('non-staff cannot bypass callable content policy through direct Firestore reads',async()=>{
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext('teacher-uid',{email_verified:true})]){
  for(const collection of ['materials','questions','lectures','lecture_materials','question_banks','bank_questions'])await assertFails(getDoc(doc(context.firestore(),collection+'/protected')));
 }
});
test('accepted homework bytes and metadata are server-write-only, including for browser Admin',async()=>{
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext('teacher-uid',{email_verified:true}),env.authenticatedContext('admin-uid',{admin:true,email_verified:true})]){
  const target=ref(context.storage(),'homework-submitted/12345678/test/work.pdf');
  await assertFails(uploadBytes(target,Buffer.from('%PDF-'),{contentType:'application/pdf'}));
  await assertFails(updateMetadata(target,{contentType:'application/pdf'}));
 }
});
