'use strict';
// Direct exported handlers against a disposable emulator. Not device/network P95.
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
if(!process.env.FIRESTORE_EMULATOR_HOST||process.env.GCLOUD_PROJECT!=='demo-technominds')throw new Error('Requires disposable demo-technominds emulator');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..')),label=process.argv[3]||'after';
const admin=require(path.join(root,'functions/node_modules/firebase-admin')),functions=require(path.join(root,'functions/entry'));
const db=admin.firestore(),auth={uid:`perf-${label}`,token:{admin:true,email_verified:true,email:'perf@example.test'}},course='أساسيات برمجة',month='سبتمبر',academicYear='2026/2027',date='2026-09-12',N=20;
const call=(name,data)=>functions[name].run({auth,data,rawRequest:{socket:{remoteAddress:'127.0.0.1'},headers:{}}});
(async()=>{
 await db.doc(`users/${auth.uid}`).set({active:true,role:'admin'});await db.doc('settings/platform').set({coursePrices:{[course]:100}},{merge:true});
 const batch=db.batch();for(let i=0;i<=N;i++)batch.set(db.doc(`students/PERF${label.toUpperCase()}${i}`),{studentCode:`PERF${label.toUpperCase()}${i}`,studentName:'بيانات قياس محلية',active:true,grade:course,academicYear,month,createdAt:'2026-08-01',scheduleDays:'السبت الأحد الاثنين الثلاثاء الأربعاء الخميس الجمعة'});await batch.commit();
 const metrics={label,samples:N,environment:'Node direct handler + local emulators; no device/network or Cloud Run cold start',metrics:{}};
 async function measure(name,fn){let t=performance.now();await fn(0);const firstMs=performance.now()-t,values=[];for(let i=1;i<=N;i++){t=performance.now();await fn(i);values.push(performance.now()-t);}const sorted=values.slice().sort((a,b)=>a-b);metrics.metrics[name]={firstMs:+firstMs.toFixed(2),warmP50Ms:+sorted[Math.ceil(N*.5)-1].toFixed(2),warmP95Ms:+sorted[Math.ceil(N*.95)-1].toFixed(2),samplesMs:values.map(v=>+v.toFixed(2))};}
 await measure('payment',i=>call('createPaymentTransaction',{studentCode:`PERF${label.toUpperCase()}${i}`,course,month,academicYear,amount:1,expectedAmount:100,paymentDate:date,requestId:`perf-${label}-${i}`}));
 await measure('attendance',i=>call('recordAttendance',{studentCode:`PERF${label.toUpperCase()}${i}`,date,status:'present'}));
 await measure('monthlyReport',()=>call('getStudentMonthlyReportAdmin',{studentCode:`PERF${label.toUpperCase()}0`,monthKey:'2026-09'}));
 if(functions.getPaymentDashboard)await measure('paymentDashboard',()=>call('getPaymentDashboard',{month,academicYear,query:`PERF${label.toUpperCase()}`}));
 fs.writeFileSync(path.join(__dirname,`../docs/evidence/performance-${label}.json`),JSON.stringify(metrics,null,2));console.log(JSON.stringify({...metrics,metrics:Object.fromEntries(Object.entries(metrics.metrics).map(([key,row])=>[key,{...row,samplesMs:undefined}]))}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
