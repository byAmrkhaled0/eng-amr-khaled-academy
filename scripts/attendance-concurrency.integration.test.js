'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||process.env.GCLOUD_PROJECT!=='demo-technominds')throw new Error('Disposable demo emulator required; never production.');
const admin=require('../functions/node_modules/firebase-admin'),functions=require('../functions/entry'),db=admin.firestore();
const auth={uid:'closure-admin',token:{admin:true,email_verified:true,email:'closure@example.test'}},call=(name,data)=>functions[name].run({auth,data,rawRequest:{socket:{remoteAddress:'127.0.0.1'},headers:{}}});
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),days='الأحد والاثنين والثلاثاء والأربعاء والخميس والجمعة والسبت';
async function setup(suffix){const scheduleId=`closure-${suffix}`,studentCode=`CLOSURE${suffix.toUpperCase().replace(/-/g,'')}`,sessionId=`${scheduleId}_${date}`;await db.doc('users/'+auth.uid).set({role:'admin',active:true});await db.doc('groups/'+scheduleId).set({name:scheduleId,grade:'أساسيات برمجة',days});await db.doc('students/'+studentCode).set({studentCode,studentName:studentCode,active:true,grade:'أساسيات برمجة',scheduleId,group:scheduleId,attendanceCode:`ATT-${studentCode}`,createdAt:'2026-09-01'});await db.doc('class_sessions/'+sessionId).set({date,scheduleId,group:scheduleId,status:'open'});return {scheduleId,studentCode,sessionId};}

for(const mode of ['manual','QR'])test(`${mode} present committed after bulk day-read is never overwritten by bulk absence`,async()=>{
 const scope=await setup('race-'+mode.toLowerCase()),original=db.collection.bind(db);let release,signal;const readReached=new Promise(r=>{signal=r;}),hold=new Promise(r=>{release=r;});let armed=true;
 const wrap=q=>new Proxy(q,{get(target,key){if(['where','limit','orderBy'].includes(key))return(...args)=>wrap(target[key](...args));if(key==='get')return async(...args)=>{const result=await target.get(...args);if(armed){armed=false;signal();await hold;}return result;};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 db.collection=name=>name==='attendance'?wrap(original(name)):original(name);
 let bulk;
 try{bulk=call('bulkMarkAttendance',{date,scheduleId:scope.scheduleId});await readReached;await call('recordAttendance',{...(mode==='QR'?{attendanceCode:`ATT-${scope.studentCode}`}:{studentCode:scope.studentCode}),date,status:'present',classSessionId:scope.sessionId,requestId:'closure-race-present-'+mode});assert.equal((await db.doc(`attendance/${scope.studentCode}_${scope.sessionId}`).get()).data().status,'present');release();const result=await bulk;assert.equal((await db.doc(`attendance/${scope.studentCode}_${scope.sessionId}`).get()).data().status,'present');assert.equal(result.saved,0);}
 finally{release?.();db.collection=original;if(bulk)await bulk.catch(()=>{});}
});

test('present wins if bulk commits first; explicit manual absence remains protected',async()=>{
 const scope=await setup('bulkfirst');await call('bulkMarkAttendance',{date,scheduleId:scope.scheduleId});await call('recordAttendance',{studentCode:scope.studentCode,date,status:'present',classSessionId:scope.sessionId,requestId:'closure-after-bulk'});assert.equal((await db.doc(`attendance/${scope.studentCode}_${scope.sessionId}`).get()).data().status,'present');
 const explicit=await setup('explicit');await call('recordAttendance',{studentCode:explicit.studentCode,date,status:'absent',classSessionId:explicit.sessionId,requestId:'closure-manual-absent'});await assert.rejects(call('recordAttendance',{studentCode:explicit.studentCode,date,status:'present',classSessionId:explicit.sessionId,requestId:'closure-manual-conflict'}),/حالة مختلفة/);
});

test('two sessions and legacy attendance keep separate identities during bulk',async()=>{
 const scope=await setup('sessions'),second=`${scope.scheduleId}_extra`;await db.doc('class_sessions/'+second).set({date,scheduleId:scope.scheduleId,group:scope.scheduleId,status:'open'});
 await call('recordAttendance',{studentCode:scope.studentCode,date,status:'present',classSessionId:scope.sessionId,requestId:'closure-first-session'});
 await call('bulkMarkAttendance',{date,scheduleId:scope.scheduleId,classSessionId:second});
 assert.equal((await db.doc(`attendance/${scope.studentCode}_${scope.sessionId}`).get()).data().status,'present');assert.equal((await db.doc(`attendance/${scope.studentCode}_${second}`).get()).data().status,'absent');
 const legacy=await setup('legacy');await db.doc(`attendance/${legacy.studentCode}_${date}`).set({studentCode:legacy.studentCode,date,status:'present',scheduleId:legacy.scheduleId});const result=await call('bulkMarkAttendance',{date,scheduleId:legacy.scheduleId});assert.equal(result.saved,0);assert.equal((await db.doc(`attendance/${legacy.studentCode}_${date}`).get()).data().status,'present');
});

test('a 72-student bulk uses bounded 50-write transactions and stays idempotent',async()=>{
 const scheduleId='closure-bounded',sessionId=`${scheduleId}_${date}`;
 await db.doc('groups/'+scheduleId).set({name:scheduleId,grade:'أساسيات برمجة',days});await db.doc('class_sessions/'+sessionId).set({date,scheduleId,group:scheduleId,status:'open'});
 const batch=db.batch();for(let i=0;i<72;i++){const studentCode='CLOSUREBOUND'+String(i).padStart(3,'0');batch.set(db.doc('students/'+studentCode),{studentCode,studentName:studentCode,active:true,grade:'أساسيات برمجة',scheduleId,group:scheduleId,createdAt:'2026-09-01'});}await batch.commit();
 const original=db.runTransaction.bind(db),bounds=[];
 db.runTransaction=(fn,...options)=>original(async tx=>{let reads=0,writes=0;const proxy=new Proxy(tx,{get(target,key){if(key==='get')return(...args)=>{reads++;return target.get(...args);};if(key==='create')return(ref,...args)=>{if(ref.path.startsWith('attendance/'))writes++;return target.create(ref,...args);};const value=target[key];return typeof value==='function'?value.bind(target):value;}});const result=await fn(proxy);if(writes)bounds.push({reads,writes});return result;},...options);
 try{const result=await call('bulkMarkAttendance',{date,scheduleId});assert.equal(result.saved,72);assert.deepEqual(bounds.map(x=>x.writes),[50,22]);assert.ok(bounds.every(x=>x.reads<=101));const replay=await call('bulkMarkAttendance',{date,scheduleId});assert.equal(replay.saved,0);const rows=await db.collection('attendance').where('date','==',date).where('scheduleId','==',scheduleId).get();assert.equal(rows.size,72);}
 finally{db.runTransaction=original;}
});
