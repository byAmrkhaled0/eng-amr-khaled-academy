const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const { ref, uploadBytes, getBytes } = require('firebase/storage');

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
    await setDoc(doc(db,'students/12345678'),{studentCode:'12345678',name:'Test Student'});
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
