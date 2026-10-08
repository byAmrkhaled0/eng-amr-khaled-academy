'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../functions/index.js'),'utf8');
function fixture(){
 let now=1000000,seq=0,queue=Promise.resolve();const docs=new Map();
 const ts=n=>({toMillis:()=>n,toDate:()=>new Date(n)}),snap=r=>({exists:docs.has(r.path),id:r.id,ref:r,data:()=>docs.get(r.path)});
 const ref=path=>({path,id:path.split('/').pop(),get:async()=>snap(ref(path)),collection:n=>collection(path+'/'+n)});
 const collection=path=>({doc:id=>ref(path+'/'+(id||'unique'+ ++seq))});
 const apply=(r,v,merge)=>{const obj=merge?{...docs.get(r.path)}:{};for(const [k,x]of Object.entries(v))if(x?.del)delete obj[k];else obj[k]=x?.inc?(Number(obj[k]||0)+x.inc):x;docs.set(r.path,obj);};
 const db={collection,runTransaction:fn=>{const run=queue.then(async()=>{let wrote=false;const pending=[];const tx={get:async r=>{assert.equal(wrote,false,'all reads precede writes');return snap(r);},set:(r,v,o)=>{wrote=true;pending.push(()=>apply(r,v,o?.merge));},update:(r,v)=>{wrote=true;pending.push(()=>apply(r,v,true));},delete:r=>{wrote=true;pending.push(()=>docs.delete(r.path));}};const result=await fn(tx);pending.forEach(f=>f());return result;});queue=run.catch(()=>{});return run;}};
 const ctx={crypto:require('node:crypto'),console,exports:{},onCall:(_,f)=>f,EXAM_ENTRY_OPTIONS:{},CALLABLE_OPTIONS:{},db,Date:class extends Date{static now(){return now;}},Timestamp:{fromMillis:ts},FieldValue:{serverTimestamp:()=>ts(now),increment:n=>({inc:n}),delete:()=>({del:true})},HttpsError:class extends Error{constructor(code,msg){super(msg);this.code=code;}},normalizeCode:String,cleanDocId:String,requirePortalSession:async()=>{},getStudentPortalByCode:async()=>({data:{name:'Student'}}),requireApprovedStudent:()=>{},examIsOpen:e=>e.active!==false,examMatchesStudent:()=>true,contentAvailableAfterStudentJoined:()=>true,parseExamQuestions:()=>[{type:'essay',question:'Q',mark:1,modelAnswer:'A'}],rateLimitStudentAction:async()=>{},text:(v)=>String(v||''),safePublicUrl:()=>'',validLegacyOrStrongCode:()=>true,jsonByteSize:x=>JSON.stringify(x).length,publicExamSession:(id,e,q,start,end,p)=>({sessionId:id,startedAt:start,expiresAt:end,draft:p.draftAnswers}),cairoDateKey:()=> '2026-10-08',markLeaderboardDirty:async()=>{},markStudentMonthlyReportDirty:async()=>{}};
 vm.runInNewContext(source.slice(source.indexOf('exports.startExam ='),source.indexOf('exports.prepareHomeworkUpload =')),ctx);
 ctx.requireStaff=async()=>({uid:'teacher'});ctx.VERSIONED_CONTENT_COLLECTIONS=new Set(['exams']);
 vm.runInNewContext(source.slice(source.indexOf('exports.upsertVersionedContent ='),source.indexOf('exports.getHomeworkAdminWorkspace =')),ctx);
 docs.set('exams/e',{duration:1,active:true,title:'Exam'});
 const call=(name,data={})=>ctx.exports[name]({data:{studentCode:'12345678',examId:'e',...data}});
 return {docs,call,ts,ctx,time:n=>now=n};
}
test('A B C D F G I N R: resume, expiry, verified reopening, isolated identities and concurrent starts',async()=>{
 const f=fixture(),a=await f.call('startExam');await f.call('saveExamProgress',{sessionId:a.sessionId,answers:{0:'old'},revision:1});
 f.docs.get('exams/e').scheduleRevision=1;f.docs.get('exams/e').scheduleChangedAt=f.ts(1020000);f.time(1030000);
 f.docs.get('exams/e').active=false;const b=await f.call('startExam');f.docs.get('exams/e').active=true;assert.equal(b.sessionId,a.sessionId);assert.equal(b.expiresAt,a.expiresAt);assert.equal(b.draft[0],'old');
 f.time(1070000);await assert.rejects(f.call('startExam'),e=>e.code==='deadline-exceeded');
 f.docs.get('exams/e').scheduleRevision=2;f.docs.get('exams/e').scheduleChangedAt=f.ts(1070000);
 const [c,d]=await Promise.all([f.call('startExam'),f.call('startExam')]);assert.equal(c.sessionId,d.sessionId);assert.notEqual(c.sessionId,a.sessionId);
 assert.equal(f.docs.get('exam_sessions/'+a.sessionId).draftAnswers[0],'old');
 for(const name of ['saveExamProgress','submitExam'])await assert.rejects(f.call(name,{sessionId:a.sessionId,answers:{0:'stale'},revision:3}),e=>e.code==='failed-precondition');
 assert.equal(f.docs.get('exam_sessions/'+c.sessionId).draftAnswers,undefined);
});
test('E H J K M: concurrent submits, committed retry, lock and exactly one result/count',async()=>{
 const f=fixture(),a=await f.call('startExam');await f.call('saveExamProgress',{sessionId:a.sessionId,answers:{0:'saved'},revision:1});
 const [x,y]=await Promise.all([f.call('submitExam',{sessionId:a.sessionId,answers:{0:'final'}}),f.call('submitExam',{sessionId:a.sessionId,answers:{0:'final'}})]);assert.equal(x.id,y.id);assert.equal(f.docs.get('student_attempts/12345678').count,1);assert.equal([...f.docs.keys()].filter(k=>k.startsWith('exam_attempts/')).length,1);
 f.time(9000000);assert.equal((await f.call('submitExam',{sessionId:a.sessionId})).id,x.id);await assert.rejects(f.call('startExam'),e=>e.code==='already-exists');
});
test('L P Q: server deadline and ownership reject without losing answers',async()=>{const f=fixture(),a=await f.call('startExam');await f.call('saveExamProgress',{sessionId:a.sessionId,answers:{0:'saved'},revision:1});await assert.rejects(f.call('submitExam',{sessionId:a.sessionId,studentCode:'other'}),e=>e.code==='permission-denied');f.time(1180001);await assert.rejects(f.call('submitExam',{sessionId:a.sessionId}),e=>e.code==='deadline-exceeded');assert.equal(f.docs.get('exam_sessions/'+a.sessionId).draftAnswers[0],'saved');});
test('legacy metadata without verified change cannot invent reopening',async()=>{const f=fixture(),a=await f.call('startExam');f.time(1070000);f.docs.get('exams/e').closeAt='2026-10-09';await assert.rejects(f.call('startExam'),e=>e.code==='deadline-exceeded');});

module.exports={fixture};
test('O: schedule revisions normalize Cairo/ISO, no-op and unrelated updates',()=>{
 const {scheduledTimeMillis}=require('../functions/lib/assignment-schedule');
 const block=source.slice(source.indexOf('    const nextOpenAt ='),source.indexOf('    if (currentSnap.exists && questionChanged)',source.indexOf('    const nextOpenAt =')));
 const revision=(current,input)=>vm.runInNewContext(block+'\nnextScheduleRevision',{current,input,collection:'exams',currentSnap:{exists:true},scheduledTimeMillis});
 assert.equal(revision({openAt:'2026-10-08T16:00',scheduleRevision:2},{openAt:'2026-10-08T13:00:00Z'}),2);
 assert.equal(revision({openAt:'2026-10-08T16:00',scheduleRevision:2},{title:'New'}),2);
 assert.equal(revision({closeAt:'2026-10-08T13:00Z'},{closeAt:'2026-10-09T13:00Z'}),1);
});
test('frontend submit failure preserves answers, restarts live timer and stops expired automatic retries',async()=>{
 const app=fs.readFileSync(require('node:path').join(__dirname,'../assets/app.js'),'utf8');
 const body=app.slice(app.indexOf('  const finish=async(force=false)'),app.indexOf("  form.addEventListener('submit'",app.indexOf('  const finish=async(force=false)'))).replace('const finish=','globalThis.finish=');
 for(const expired of [false,true]){
  let intervals=0,cleared=0;const draft={sessionId:'old',answers:{0:'answer'}};
  const ctx={finished:false,autoSubmitTriggered:false,timeExpired:expired,saveVisibleAnswer:()=>{},lockExpiredExam:()=>{},qs:[{}],draft,current:0,renderCurrent:()=>{},toast:()=>{},confirm:()=>true,timer:1,serverSaveTimer:1,clearInterval:()=>{},clearTimeout:()=>{},setInterval:()=>{intervals++;return 2;},updateTimer:()=>{},submit:{disabled:false,classList:{add:()=>{},remove:()=>{}}},st:{},submitExamAttempt:async()=>{throw Error('network');},firebaseFriendlyError:(_,s)=>s,readExamDraft:()=>draft,clearExamDraft:()=>cleared++,examId:'e',studentCode:'s'};
  vm.runInNewContext(body,ctx);await ctx.finish(expired);assert.equal(ctx.finished,false);assert.equal(ctx.submit.disabled,false);assert.equal(draft.answers[0],'answer');assert.equal(cleared,0);assert.equal(intervals,expired?0:1);
 }
});
test('historical recovery is explicit, exam/student/attempt scoped, one-use and preserves schedule metadata',async()=>{
 const f=fixture(),a=await f.call('startExam');f.time(1070000);
 await f.call('upsertVersionedContent',{collection:'exams',item:{id:'e'},examRecoveryOnly:true,reopenExpiredStudentCodes:['12345678']});
 assert.equal(f.docs.get('exams/e').scheduleRevision,undefined);assert.equal(f.docs.get('exams/e').scheduleChangedAt,undefined);
 const b=await f.call('startExam');assert.notEqual(a.sessionId,b.sessionId);assert.equal(f.docs.get('exam_sessions/'+a.sessionId).supersededBy,b.sessionId);
 f.time(1140000);await assert.rejects(f.call('startExam'),e=>e.code==='deadline-exceeded');
});
test('teacher recovery rejects active, submitted, locked, absent and foreign sessions atomically; rejects unauthorized caller',async()=>{
 for(const patch of [null,{status:'submitted'},{studentCode:'other'},{examId:'other'}]){
  const f=fixture(),a=await f.call('startExam');if(patch){Object.assign(f.docs.get('exam_sessions/'+a.sessionId),patch);f.time(1070000);}
  await assert.rejects(f.call('upsertVersionedContent',{collection:'exams',item:{id:'e'},examRecoveryOnly:true,reopenExpiredStudentCodes:['12345678']}));assert.equal(f.docs.get('exams/e').examRecoveryGrants,undefined);
 }
 const f=fixture();f.ctx.requireStaff=async()=>{throw new f.ctx.HttpsError('permission-denied','denied');};await assert.rejects(f.call('upsertVersionedContent',{collection:'exams',item:{id:'e'},examRecoveryOnly:true,reopenExpiredStudentCodes:['12345678']}),e=>e.code==='permission-denied');
});
test('committed result survives throwing post-commit hooks, logs diagnosis, and replay increments count once',async()=>{
 const f=fixture(),a=await f.call('startExam'),events=[];f.ctx.console={warn:(...x)=>events.push(x),info:()=>{}};f.ctx.markStudentMonthlyReportDirty=async()=>{throw {code:'unavailable'};};
 const result=await f.call('submitExam',{sessionId:a.sessionId,answers:{0:'answer'}});assert(result.id);assert.equal(events[0][0],'exam-submit-post-commit-failed');assert.equal(events[0][1].committed,true);assert(!JSON.stringify(events).includes('12345678'));
 const again=await f.call('submitExam',{sessionId:a.sessionId});assert.equal(again.id,result.id);assert.equal(f.docs.get('student_attempts/12345678').count,1);
});
test('ordinary working MCQ submission keeps grading formula and committed answers',async()=>{
 const f=fixture();f.ctx.parseExamQuestions=()=>[{type:'mcq',question:'Q',mark:2,options:['yes','no'],answer:'yes'}];f.ctx.mcqCorrect=(q,i)=>q.options[i]===q.answer;
 const a=await f.call('startExam'),r=await f.call('submitExam',{sessionId:a.sessionId,answers:{0:'0'}});assert.equal(r.score,2);assert.equal(r.maxScore,2);assert.equal(f.docs.get('exam_attempts/'+r.id).answers[0].answer,'yes');
});
test('missing active target fails closed and never creates fresh attempt over unknown history',async()=>{
 const f=fixture(),a=await f.call('startExam');f.docs.get('exam_sessions/'+a.sessionId).activeSessionId='missing';await assert.rejects(f.call('startExam'),e=>e.code==='failed-precondition');assert.equal([...f.docs.keys()].filter(k=>k.startsWith('exam_sessions/')).length,1);
});
