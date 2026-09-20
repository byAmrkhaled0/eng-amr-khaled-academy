'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib');
if(!process.env.FIRESTORE_EMULATOR_HOST||process.env.GCLOUD_PROJECT!=='demo-technominds')throw new Error('Disposable demo emulator required; never production.');
const admin=require('../functions/node_modules/firebase-admin');
const functions=require('../functions/entry');
const db=admin.firestore();
const auth={uid:'review-admin',token:{admin:true,email_verified:true,email:'review@example.test'}};
const call=(name,data,identity=auth)=>functions[name].run({auth:identity,data,rawRequest:{socket:{remoteAddress:'127.0.0.1'},headers:{}}});
const code='REVIEW001',course='أساسيات برمجة',month='سبتمبر',academicYear='2026/2027';
const payment={studentCode:code,course,month,academicYear,expectedAmount:100,amount:100,paymentDate:'2026-09-12',paymentMethod:'cash',notes:'اختبار فقط'};

test.before(async()=>{
 await db.doc('users/review-admin').set({role:'admin',active:true});await db.doc('users/review-admin-2').set({role:'admin',active:true});
 await db.doc(`students/${code}`).set({studentCode:code,studentName:'طالب الاختبار',active:true,grade:course,academicYear,scheduleId:'review-group',attendanceCode:'ATT-REVIEW001',createdAt:'2026-08-01'});
 await db.doc('settings/platform').set({coursePrices:{[course]:100}});
});
test('payment: concurrent retry, cancel, new equal payment, changed payload and second device',async()=>{
 const requestId='payment-1';const [a,b]=await Promise.all([call('createPaymentTransaction',{...payment,requestId}),call('createPaymentTransaction',{...payment,requestId})]);assert.equal(a.id,b.id);
 assert.equal(b.transactionStatus,'active');assert.equal(b.expectedAmount,100);assert.equal(b.paidAmount,100);assert.equal(b.remainingAmount,0);assert.equal(b.status,'paid');
 await assert.rejects(call('createPaymentTransaction',{...payment,requestId,amount:99}),/معرّف الطلب/);
 await call('cancelPaymentTransaction',{transactionId:a.id,reason:'test'});
 await assert.rejects(call('createPaymentTransaction',{...payment,requestId}),/ملغاة/);
 const second=await call('createPaymentTransaction',{...payment,requestId:'payment-2'});assert.notEqual(second.id,a.id);assert.equal(second.transactionStatus,'active');
 await assert.rejects(call('createPaymentTransaction',{...payment,requestId:'device-2'},{uid:'review-admin-2',token:auth.token}),/أكبر من المتبقي/);
 await assert.rejects(call('createPaymentTransaction',{...payment,requestId:'blocked'},null),/تسجيل دخول/);
 await call('editPaymentTransaction',{transactionId:second.id,amount:60});
 const dashboard=await call('getPaymentDashboard',{month,academicYear,grade:'all',status:'all',query:'REVIEW001',force:true});assert.equal(dashboard.totals.collected,60);assert.equal(dashboard.totals.remaining,40);
 const history=await call('getPaymentHistory',{studentCode:code,course,month,academicYear});assert.equal(history.rows.length,2);assert.equal(history.rows.filter(r=>r.status==='cancelled').length,1);
});
test('offline: prepared scope, replay, two devices, bad QR and revoked session',async()=>{
 const {dateKey}=require('../functions/lib/monthly-report'),date=dateKey(new Date());
 await db.doc('groups/review-group').set({name:'تجريبية',grade:course,days:'السبت الأحد الاثنين الثلاثاء الأربعاء الخميس الجمعة'});
 const first=await call('prepareOfflineAttendance',{scheduleId:'review-group',date});
 const secondAuth={uid:'review-admin-2',token:auth.token},second=await call('prepareOfflineAttendance',{scheduleId:'review-group',date},secondAuth);
 const event={requestId:'scan-1',studentCode:code,attendanceCode:'ATT-REVIEW001',preparationId:first.preparationId,classSessionId:first.sessionId,date,scannedAt:new Date().toISOString()};
 const [a,b]=await Promise.all([call('syncOfflineAttendance',{events:[event]}),call('syncOfflineAttendance',{events:[{...event,requestId:'scan-2',preparationId:second.preparationId}]},secondAuth)]);
 assert(a.results[0].ok);assert(b.results[0].ok);assert.equal(a.results[0].id,b.results[0].id);
 const replay=await call('syncOfflineAttendance',{events:[event]});assert(replay.results[0].duplicate);
 const bad=await call('syncOfflineAttendance',{events:[{...event,requestId:'bad-code',attendanceCode:'WRONG'}]});assert.equal(bad.results[0].ok,false);
 await assert.rejects(call('syncOfflineAttendance',{events:[event]},null),/تسجيل دخول/);
 const online=await call('recordAttendance',{studentCode:code,date,classSessionId:first.sessionId});assert.equal(online.id,a.results[0].id);
});
test('shared backup restores old and complete nested snapshots without removing omitted records',async()=>{
 const {createBackupService}=require('../functions/lib/backup');
 const service=createBackupService({db,admin,project:'demo-technominds'});
 await db.doc(`student_progress/${code}/monthly_events/event-1`).set({lectureId:'l1',value:9});
 await db.doc('motivation_monthly/keep').set({points:7});
 const full=await service.createPlatformBackup('test-complete',{uid:auth.uid});
 const preview=await service.readBackup(full.name);assert(preview.documents.some(r=>r.path===`student_progress/${code}/monthly_events/event-1`));
 await db.doc(`student_progress/${code}/monthly_events/event-1`).update({value:0});
 await assert.rejects(service.applyRestore(preview,{uid:auth.uid}),/تغيرت بيانات/);
 await service.applyRestore(await service.readBackup(full.name),{uid:auth.uid});
 assert.equal((await db.doc(`student_progress/${code}/monthly_events/event-1`).get()).data().value,9);
 await db.doc('payment_transactions/newer-test').set({amount:12});
 const blocked=await service.readBackup(full.name);assert(blocked.plan.financialConflictCount>0);await assert.rejects(service.applyRestore(blocked,{uid:auth.uid}),/بيانات مالية/);
 await db.doc('payment_transactions/newer-test').delete();
 const old={schemaVersion:63,backupFormatVersion:2,project:'demo-technominds',collections:{student_progress:[{id:code,data:{},monthlyEvents:[{id:'event-1',data:{lectureId:'l1',value:4}}]}]}};
 const name='automatic-backups/review-old.json.gz';await admin.storage().bucket().file(name).save(zlib.gzipSync(Buffer.from(JSON.stringify(old))));
 const plan=await call('previewAutomaticBackup',{name});assert.equal(plan.deletes,0);
 await assert.rejects(call('restoreAutomaticBackup',{name,confirmation:'RESTORE-MERGE',planId:'wrong'}),/راجع خطة/);
 const restored=await call('restoreAutomaticBackup',{name,confirmation:'RESTORE-MERGE',planId:plan.planId});assert(restored.ok);
 assert.equal((await db.doc('motivation_monthly/keep').get()).data().points,7);assert.equal((await db.doc(`student_progress/${code}/monthly_events/event-1`).get()).data().value,4);
});
test('report cache invalidates after a corrected grade and never exposes internal notes',async()=>{
 await db.doc(`students/${code}`).set({notes:'INTERNAL SECRET'},{merge:true});
 await db.doc('grades/review-grade').set({studentCode:code,examId:'manual',score:5,maxScore:10,date:'2026-09-12',status:'corrected'});
 const first=await call('getStudentMonthlyReportAdmin',{studentCode:code,monthKey:'2026-09'});assert.equal(first.teacherNotes,'');assert.equal(first.results.average,50);assert.equal(first.payment.status,'partial');assert.equal(first.payment.paidAmount,60);
 const before=await db.doc('grades/review-grade').get();await db.doc('grades/review-grade').update({score:9});const after=await db.doc('grades/review-grade').get();
 await functions.invalidateReport_grades.run({data:{before,after},params:{id:'review-grade'}});
 const second=await call('getStudentMonthlyReportAdmin',{studentCode:code,monthKey:'2026-09'});assert.equal(second.results.average,90);
 const ranked=await call('getStudentMonthlyReportAdmin',{studentCode:code,monthKey:'2026-09',includeRanking:true});assert.equal(ranked.motivation.rank,1);assert.equal(ranked.motivation.totalStudents,1);assert.equal(ranked.motivation.level,'يحتاج متابعة');
});

test('dashboard pages the complete 1201-student and 610-summary period on Firestore',async()=>{
 const writes=[];for(let i=0;i<1201;i++){
  const studentCode=`BULK${String(i).padStart(5,'0')}`;
  writes.push([`students/${studentCode}`,{studentCode,studentName:'حجم تجريبي',active:true,grade:course}]);
  if(i<610)writes.push([`monthly_payments/${studentCode}`,{studentCode,course,month,academicYear,expectedAmount:100,paidAmount:100}]);
 }
 for(let i=0;i<writes.length;i+=400){const batch=db.batch();writes.slice(i,i+400).forEach(([path,data])=>batch.set(db.doc(path),data));await batch.commit();}
 let cursor=null,seen=new Set(),pages=0;do{
  const result=await call('getPaymentDashboard',{month,academicYear,query:'BULK',grade:'all',status:'all',cursor,force:pages===0});
  assert.equal(result.totals.expected,120100);assert.equal(result.totals.collected,61000);assert.equal(result.totals.unpaid,591);assert(result.rows.length<=40);
  for(const row of result.rows){assert(!seen.has(row.key));seen.add(row.key);}cursor=result.nextCursor;pages++;
 }while(cursor);
 assert.equal(seen.size,1201);assert.equal(pages,31);
});
