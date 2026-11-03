
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),s=require('./testing/security-emulator');
test.before(async()=>{await s.seed();await s.db.doc('students/'+s.code).update({contentAccessMode:'full'});await s.db.doc('monthly_report_state/'+s.code).set({version:0});});
async function withConflict(always,action){const original=s.db.runTransaction.bind(s.db);let injected=0,transactions=0;
 s.db.runTransaction=(fn,...args)=>original(async tx=>{const proxy=new Proxy(tx,{get(target,key){if(key==='get')return async(ref,...rest)=>{if(ref.path==='monthly_report_state/'+s.code){transactions++;if(always||!injected){injected++;await s.db.doc(ref.path).set({version:s.admin.firestore.FieldValue.increment(1)},{merge:true});}}return target.get(ref,...rest);};const value=target[key];return typeof value==='function'?value.bind(target):value;}});return fn(proxy);},...args);
 try{return {value:await action(),counts:{injected,transactions}};}finally{s.db.runTransaction=original;}
}
const report=force=>s.call('getStudentMonthlyReportAdmin',{studentCode:s.code,monthKey:'2026-10',force},s.auth);
test('real revision race retries and persists the fresh revision only',async()=>{const result=await withConflict(false,()=>report(true));assert.equal(result.value.student.studentCode,s.code);assert.equal(result.counts.injected,1);assert.equal(result.counts.transactions,2);const cached=(await s.db.doc('monthly_reports/'+s.code+'_2026-10').get()).data(),state=(await s.db.doc('monthly_report_state/'+s.code).get()).data();assert.equal(cached.sourceRevision,state.version);assert.equal(cached.invalidatedAt,undefined);});
test('healthy cache hit creates no report transaction',async()=>{const result=await withConflict(false,()=>report(false));assert.equal(result.value.student.studentCode,s.code);assert.equal(result.counts.transactions,0);});
test('continuous real invalidation preserves previous report and stops',async()=>{const before=(await s.db.doc('monthly_reports/'+s.code+'_2026-10').get()).data();let caught=false;const result=await withConflict(true,async()=>{try{await report(true);}catch(error){assert.equal(error.code,'aborted');caught=true;}});assert(caught);assert.equal(result.counts.transactions,2);const after=(await s.db.doc('monthly_reports/'+s.code+'_2026-10').get()).data();assert.equal(after.sourceRevision,before.sourceRevision);});
