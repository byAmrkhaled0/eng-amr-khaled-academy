'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');const {ref,uploadBytes,updateMetadata}=require('firebase/storage');
const s=require('./testing/security-emulator');let env,token,client;const bytes=Buffer.from('%PDF-ORIGINAL!'),different=Buffer.from('%PDF-ATTACKER!');assert.equal(bytes.length,different.length);
const p=extra=>s.portal(token,s.code,extra);
async function prepare(){return s.call('prepareHomeworkUpload',p({fileName:'answer.pdf',contentType:'application/pdf',size:bytes.length}));}
async function upload(permit,value=bytes){return uploadBytes(ref(client,permit.path),value,{contentType:'application/pdf'});}
async function register(permit,extra={}){return s.call('registerHomeworkSubmission',p({uploadId:permit.uploadId,path:permit.path,fileName:'answer.pdf',...extra}));}
async function submitted(id){const doc=await s.db.doc('homework_submissions/'+id).get();assert(doc.exists);const row=doc.data();return {row,bytes:(await s.admin.storage().bucket().file(row.filePath).download())[0]};}
test.before(async()=>{({token}=await s.seed());env=await initializeTestEnvironment({projectId:'demo-technominds',firestore:{host:'127.0.0.1',port:8181,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')},storage:{host:'127.0.0.1',port:9199,rules:fs.readFileSync(path.join(__dirname,'../storage.rules'),'utf8')}});client=env.unauthenticatedContext().storage('gs://'+s.admin.storage().bucket().name);});
test.after(async()=>{await env?.cleanup();});
test('A/B/C/L: valid upload and registration freeze bytes; identical/different grant replay is denied',async()=>{
 const permit=await prepare();await assertSucceeds(upload(permit));await assertFails(upload(permit));await assertFails(upload(permit,different));const result=await register(permit);const accepted=await submitted(result.id);assert.deepEqual(accepted.bytes,bytes);
 for(const value of [bytes,different]){await assertFails(upload(permit,value));assert.deepEqual((await submitted(result.id)).bytes,bytes);}
 await assertFails(uploadBytes(ref(client,accepted.row.filePath),different,{contentType:'application/pdf'}));assert.deepEqual((await submitted(result.id)).bytes,bytes);assert(!(await s.db.doc('_homework_upload_tokens/'+permit.uploadId).get()).exists);
});
test('accepted file stays immutable even if an earlier authorized staging writer completes late',async()=>{
 const permit=await prepare();await upload(permit);const result=await register(permit);const row=(await submitted(result.id)).row;
 // Models a storage request authorized before grant consumption; writes staging only.
 await s.admin.storage().bucket().file(permit.path).save(different,{metadata:{contentType:'application/pdf'}});
 assert.notEqual(row.filePath,permit.path);assert.deepEqual((await submitted(result.id)).bytes,bytes);
});
test('M: concurrent registration creates one canonical submission, and retry cannot copy again',async()=>{
 const permit=await prepare();await upload(permit);const proto=Object.getPrototypeOf(s.admin.storage().bucket().file(permit.path)),original=proto.getMetadata;let reads=0,release;const barrier=new Promise(r=>{release=r;});let responses;
 proto.getMetadata=async function(...args){const result=await original.apply(this,args);if(this.name===permit.path&&reads<2){if(++reads===2)release();await barrier;}return result;};
 try{responses=await Promise.allSettled([register(permit),register(permit)]);}finally{proto.getMetadata=original;release();}
 assert(responses.some(r=>r.status==='fulfilled'));const rows=await s.db.collection('homework_submissions').where('fileName','==','answer.pdf').get();const matching=rows.docs.filter(d=>d.data().uploadId===permit.uploadId||d.data().filePath.includes('/'+permit.uploadId+'/'));assert.equal(matching.length,1);assert.deepEqual((await submitted(matching[0].id)).bytes,bytes);const retry=await register(permit);assert.equal(retry.id,matching[0].id);assert.equal(retry.duplicate,true);
});
test('D/E/F/G/H/I/J: expiry/student/name/type/size/metadata/unknown-path restrictions are executable',async()=>{
 let permit=await prepare();await s.db.doc('_homework_upload_tokens/'+permit.uploadId).update({expiresAt:s.admin.firestore.Timestamp.fromMillis(Date.now()-1000)});await assertFails(upload(permit));
 permit=await prepare();await assertFails(uploadBytes(ref(client,permit.path.replace(s.code,s.other)),bytes,{contentType:'application/pdf'}));await assertFails(uploadBytes(ref(client,permit.path+'-wrong-name'),bytes,{contentType:'application/pdf'}));await assertFails(uploadBytes(ref(client,permit.path),bytes,{contentType:'text/html'}));await assertFails(uploadBytes(ref(client,permit.path),Buffer.alloc(10*1024*1024+1),{contentType:'application/pdf'}));await upload(permit);await assertFails(updateMetadata(ref(client,permit.path),{customMetadata:{firebaseStorageDownloadTokens:'attacker-token'}}));await assertFails(uploadBytes(ref(client,'arbitrary/answer.pdf'),bytes,{contentType:'application/pdf'}));
 await s.deny(s.call('registerHomeworkSubmission',s.portal(token,s.other,{uploadId:permit.uploadId,path:permit.path})));
});
test('server registration rejects arbitrary path and assignment/attempt scope substitution',async()=>{
 const permit=await prepare();await upload(permit);await s.deny(register(permit,{path:'homework/'+s.other+'/'+permit.uploadId+'/'+permit.safeName}));
 await s.db.doc('_homework_upload_tokens/'+permit.uploadId).update({assignmentId:'assignment-A',attemptNumber:1});await s.deny(register(permit,{assignmentId:'assignment-B',attemptNumber:1}));await s.deny(register(permit,{assignmentId:'assignment-A',attemptNumber:2}));const accepted=await register(permit,{assignmentId:'assignment-A',attemptNumber:1});assert(accepted.ok);await s.deny(register(permit,{assignmentId:'assignment-B',attemptNumber:1}));await s.deny(register(permit,{assignmentId:'assignment-A',attemptNumber:2}));assert.equal((await register(permit,{assignmentId:'assignment-A',attemptNumber:1})).duplicate,true);
});
test('prepare rejects invalid MIME, empty and oversized files without issuing grants',async()=>{
 for(const patch of [{contentType:'text/html'},{size:0},{size:10*1024*1024+1}])await assert.rejects(s.call('prepareHomeworkUpload',p({fileName:'answer.pdf',contentType:'application/pdf',size:bytes.length,...patch})),e=>e.code==='invalid-argument');
});
