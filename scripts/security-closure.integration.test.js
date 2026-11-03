'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const s=require('./testing/security-emulator');let tokens;
const action='parent-monthly-report-student-v678';
const quota=()=>s.db.doc('_rate_limits/'+crypto.createHash('sha256').update(action+':'+s.code).digest('hex').slice(0,40));
const report=(token=tokens.parent,extra={})=>s.call('getParentMonthlyReport',s.portal(token,s.code,{monthKey:'2026-09',...extra}));
test.before(async()=>{tokens=await s.seed();});
test('parent report permits last budget slot then blocks even with a different month',async()=>{
 await quota().set({action,count:19,windowStartedAt:Date.now()});
 assert.equal((await report()).student.studentCode,s.code);
 await assert.rejects(report(tokens.parent,{monthKey:'2026-10'}),e=>e.code==='resource-exhausted');
 assert.equal((await quota().get()).data().count,20);
});
test('new parent session does not reset student quota',async()=>{
 await assert.rejects(report(await s.session(s.code,'parent')),e=>e.code==='resource-exhausted');
});
test('invalid session is rejected before modifying quota',async()=>{
 const before=(await quota().get()).data().count;
 await s.deny(report('x'.repeat(43)));assert.equal((await quota().get()).data().count,before);
});
test('expired rate window resets without relying on TTL deletion',async()=>{
 await quota().set({action,count:20,windowStartedAt:Date.now()-61000});
 assert.equal((await report()).student.studentCode,s.code);assert.equal((await quota().get()).data().count,1);
});
test('concurrent report calls cannot exceed remaining budget',async()=>{
 await quota().set({action,count:19,windowStartedAt:Date.now()});
 const results=await Promise.allSettled([report(),report()]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.code,'resource-exhausted');
 assert.equal((await quota().get()).data().count,20);
});
