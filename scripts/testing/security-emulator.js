'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
if(process.env.GCLOUD_PROJECT!=='demo-technominds'||!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_STORAGE_EMULATOR_HOST||''))throw Error('Local disposable demo emulators only.');
// Test-only offline signing key: no production credentials or signing request.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tm-security-signing-'));
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const credentials=path.join(dir,'demo-key.json');fs.writeFileSync(credentials,JSON.stringify({type:'service_account',project_id:'demo-technominds',client_email:'test-only@demo-technominds.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})}));
process.env.GOOGLE_APPLICATION_CREDENTIALS=credentials;process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
const admin=require('../../functions/node_modules/firebase-admin'),functions=require('../../functions/entry'),db=admin.firestore();
const grade='أساسيات برمجة',code='SEC00001',other='SEC00002',joined='2026-09-13T12:00:00+03:00';
const auth={uid:'security-admin',token:{admin:true,email_verified:true,email:'test-only@example.test'}};
const rawRequest={headers:{},socket:{remoteAddress:'127.0.0.1'}};
const call=(name,data,identity=null)=>functions[name].run({data,auth:identity,rawRequest});
async function session(studentCode,mode='student',expires=Date.now()+30*60*1000){const token=crypto.randomBytes(32).toString('base64url');await db.doc('_portal_sessions/'+crypto.createHash('sha256').update(token).digest('hex')).set({studentCode,mode,expiresAt:admin.firestore.Timestamp.fromMillis(expires)});return token;}
async function seed(){await db.doc('users/'+auth.uid).set({role:'admin',active:true});for(const c of [code,other])await db.doc('students/'+c).set({studentCode:c,studentName:c,active:true,grade,scheduleId:'sec-group',group:'اختبار',academicYear:'2026/2027',createdAt:joined,contentAccessMode:'from_joining'});return {token:await session(code),otherToken:await session(other),parent:await session(code,'parent')};}
const portal=(token,studentCode=code,extra={})=>({code:studentCode,studentCode,portalSessionToken:token,...extra});
const deny=promise=>assert.rejects(promise,error=>['unauthenticated','permission-denied'].includes(error.code));
module.exports={admin,functions,db,grade,code,other,joined,auth,call,seed,session,portal,deny};
