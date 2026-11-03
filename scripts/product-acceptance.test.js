'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{safeClientError}=require('../functions/lib/client-error');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/app.js'),'utf8');
async function exam(save,confirmations,storage=true){
 let storageFailed=false;
 const dom=new JSDOM('<div id="examOverlay"><div id="examBox"></div></div>',{url:'https://example.test/student.html',runScripts:'outside-only'}),w=dom.window,toasts=[];
 let draft={sessionId:'local-session',studentCode:'TEST0001',exam:{title:'Exam'},questions:[{type:'essay',question:'Explain',mark:1}],answers:{0:'My answer'},expiresAt:Date.now()+3600000};
 Object.assign(w,{currentSecureExams:[{id:'exam',title:'Exam'}],currentExamStudent:{studentCode:'TEST0001',name:'Student'},normalizeText:String,readExamDraft:()=>storageFailed?null:structuredClone(draft),saveExamDraft:(a,b,d)=>{if(!storage){storageFailed=true;return false;}draft=structuredClone(d);return true;},examAnswerIssue:()=>null,hydrateIcons:()=>{},setupAssessmentCopyGuard:()=>{},esc:String,httpsFileUrl:String,examClockNow:d=>Date.now(),renderExamQuestionHtml:()=>'<textarea name="q0"></textarea>',toast:message=>toasts.push(message),confirm:()=>confirmations.shift()===true,requestAnimationFrame:fn=>fn(),setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},MFCloud:{saveSecureExamProgress:save}});
 vm.runInContext(source.slice(source.indexOf('async function openSecureExam('),source.indexOf('const examStartRequests=')),dom.getInternalVMContext());
 await w.openSecureExam('exam','TEST0001');w.document.getElementById('examExitBtn').click();await new Promise(r=>setTimeout(r,15));
 return {w,toasts,close:()=>w.close()};
}
test('failed server save keeps exam open when local-only exit is declined',async()=>{const f=await exam(async()=>{throw Error('offline')},[true,false]);try{assert(f.w.document.getElementById('examOverlay').classList.contains('show'));assert.match(f.w.document.getElementById('examSaveStatus').textContent,/محفوظ على الجهاز/);assert.equal(f.toasts.length,0);assert.equal(f.w.document.getElementById('examExitBtn').disabled,false);}finally{f.close();}});
test('confirmed offline exit clearly says same-device only',async()=>{const f=await exam(async()=>{throw Error('offline')},[true,true]);try{assert(!f.w.document.getElementById('examOverlay').classList.contains('show'));assert.match(f.toasts.at(-1),/هذا الجهاز فقط/);assert.doesNotMatch(f.toasts.at(-1),/تم حفظ المحاولة على الخادم/);}finally{f.close();}});
test('acknowledged server save permits normal exit',async()=>{const f=await exam(async()=>({saved:true}),[true]);try{assert(!f.w.document.getElementById('examOverlay').classList.contains('show'));assert.match(f.toasts.at(-1),/تم حفظ المحاولة على الخادم/);}finally{f.close();}});
test('stale server acknowledgement is not reported as saved',async()=>{const f=await exam(async()=>({saved:false,submitted:false,revision:100}),[true,false]);try{assert(f.w.document.getElementById('examOverlay').classList.contains('show'));assert.match(f.w.document.getElementById('examSaveStatus').textContent,/لم يؤكد الخادم/);}finally{f.close();}});
test('backend telemetry ignores raw messages, secrets, user agents and query strings',()=>{
 const row=safeClientError({kind:'TypeError',page:'https://example.test/student.html?code=SECRET#token=SECRET',message:'answer=SECRET',userAgent:'SECRET',answers:'SECRET',line:30,column:4});
 assert.equal(JSON.stringify(row).includes('SECRET'),false);assert.equal(row.page,'/student.html');assert.equal(row.kind,'TypeError');assert.equal(row.line,30);
 assert.deepEqual(safeClientError({kind:'SECRET',page:'/SECRET/path',line:-1,column:Infinity}),{page:'/unknown',kind:'Error',message:'Error on /unknown',line:0,column:0});
});
test('actual browser error hooks send classifications, never raw rejection or full URL',async()=>{
 const dom=new JSDOM('',{url:'https://example.test/student.html?code=SECRET#SECRET',runScripts:'outside-only'}),w=dom.window,records=[];
 try{w.MFCloud={reportClientError:async row=>records.push(row)};const start=source.indexOf('function setupClientErrorReporting()'),end=source.indexOf('\n',start);vm.runInContext(source.slice(start,end)+';setupClientErrorReporting();',dom.getInternalVMContext());w.dispatchEvent(new w.ErrorEvent('error',{message:'SECRET',error:new w.TypeError('SECRET'),lineno:4,colno:2}));const rejection=new w.Event('unhandledrejection');rejection.reason={message:'SECRET'};w.dispatchEvent(rejection);assert.equal(records.length,2);assert.equal(JSON.stringify(records).includes('SECRET'),false);assert.equal(records[0].kind,'TypeError');assert.equal(records[1].kind,'UnhandledRejection');}finally{w.close();}
});

test('unavailable browser storage plus network failure cannot claim safe exit',async()=>{const f=await exam(async()=>{throw Error('offline')},[true,true],false);try{assert(f.w.document.getElementById('examOverlay').classList.contains('show'));assert.match(f.toasts.at(-1),/تعذر تأكيد حفظ الإجابات/);}finally{f.close();}});

function timings(){const sync=fs.readFileSync(require('node:path').join(__dirname,'../assets/firebase-sync.js'),'utf8'),context=vm.createContext({performance:{now:()=>0}});vm.runInContext(sync.slice(sync.indexOf('    const requestTimingSamples='),sync.indexOf('    const callable=name=>')),context);return{run:(name,fn)=>{context.operation=name;context.operationFn=fn;return vm.runInContext('measureRequest(operation,operationFn)',context);},rows:()=>JSON.parse(vm.runInContext('JSON.stringify(requestTimingSamples)',context))};}
test('request diagnostics retain no payload/result data and issue exactly one operation',async()=>{const f=timings();let calls=0;const secret={token:'SECRET',answer:'SECRET'};assert.equal(await f.run('startExam',async()=>{calls++;return secret;}),secret);assert.equal(calls,1);assert.deepEqual(f.rows(),[{operation:'startExam',status:'ok',durationMs:0}]);});
test('failed request diagnostics preserve exception without recording its raw content',async()=>{const f=timings(),error=Error('SECRET');await assert.rejects(f.run('submitExam',async()=>{throw error;}),e=>e===error);assert.equal(f.rows()[0].status,'error');assert(!JSON.stringify(f.rows()).includes('SECRET'));});
test('request diagnostics are bounded at the latest 100 records',async()=>{const f=timings();for(let i=0;i<105;i++)await f.run('getStudentResources',async()=>i);assert.equal(f.rows().length,100);});

