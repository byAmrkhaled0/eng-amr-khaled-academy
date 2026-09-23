'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {paymentStatus,paymentPeriodStatus,paymentTotals,money}=require('../functions/payment-domain');
const {buildPaymentDashboard}=require('../functions/lib/payment-dashboard');
const {calculateMonthlyReport}=require('../functions/lib/monthly-report');

function paymentFunctions(){
  const source=fs.readFileSync(require.resolve('../functions/index.js'),'utf8');
  const code=source.slice(source.indexOf('function validPaymentDate('),source.indexOf('function motivationPeriodId('));
  const documents=new Map(),key=(collection,id)=>`${collection}/${id}`;
  function doc(collection,id){
    const ref={collection,id:id||crypto.randomUUID()};
    ref.get=async()=>snapshot(ref);
    return ref;
  }
  function snapshot(ref){const data=documents.get(key(ref.collection,ref.id));return {id:ref.id,exists:!!data,data:()=>structuredClone(data)};}
  let pending=Promise.resolve();
  const db={collection:collection=>({doc:id=>doc(collection,id),where:(field,operator,value)=>({collection,field,value})}),runTransaction:callback=>{
    const task=pending.then(async()=>{
      const writes=[];
      const tx={get:async ref=>ref.field?{docs:[...documents].filter(([id,value])=>id.startsWith(`${ref.collection}/`)&&value[ref.field]===ref.value).map(([id,value])=>({id:id.slice(ref.collection.length+1),data:()=>structuredClone(value)}))}:snapshot(ref),create:(ref,value)=>writes.push(['create',ref,value]),set:(ref,value)=>writes.push(['set',ref,value])};
      await callback(tx);
      for(const [type,ref,value] of writes){const id=key(ref.collection,ref.id);if(type==='create'&&documents.has(id))throw Error('duplicate document');documents.set(id,{...(documents.get(id)||{}),...value});}
    });
    pending=task.catch(()=>{});return task;
  }};
  class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
  const context={exports:{},db,FieldValue:{serverTimestamp:()=> 'server-time'},HttpsError,
    onCall:(_options,handler)=>handler,CALLABLE_OPTIONS:{},requireStaff:async()=>({uid:'admin-1',email:'staff@example.org',role:'admin'}),
    PAYMENT_MONTH_NAMES:['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
    text:(value,length)=>String(value??'').slice(0,length||1000),normalizeDigits:value=>String(value??''),normalizeCode:value=>String(value??''),cleanDocId:value=>value,validLegacyOrStrongCode:value=>!!value,
    hash:value=>crypto.createHash('sha256').update(value).digest('hex'),cairoDateKey:()=> '2026-10-04',
    sameAcademicValue:(a,b)=>a===b,canonicalAcademicLabel:value=>value,
    paymentStatus,paymentPeriodStatus,paymentTotals,money,
    leaderboardPeriod:(year,month)=>({monthKey:`${year.slice(0,4)}-${String(context.PAYMENT_MONTH_NAMES.indexOf(month)+1).padStart(2,'0')}`}),
    buildPaymentDashboard,fetchAllCollectionDocuments:async()=>({docs:[]}),admin:{firestore:{FieldPath:{documentId:()=> 'id'}}},
    require:path=>{if(path==='./lib/payment-dashboard')return {buildPaymentDashboard};throw Error(path);}};
  vm.runInNewContext(`${code}\nthis.paymentPeriodId=paymentPeriodId;`,context);
  documents.set(key('students','ST-123456'),{studentCode:'ST-123456',studentName:'طالب',grade:'برمجة',active:true,academicYear:'2026/2027'});
  documents.set(key('settings','platform'),{coursePrices:{'برمجة':100}});
  const studentCode='ST-123456',academicYear='2026/2027',course='برمجة';
  const create=(requestId,month='سبتمبر',amount=100)=>context.exports.createPaymentTransaction({data:{requestId,studentCode,academicYear,month,course,amount,expectedAmount:100,paymentDate:'2026-09-25',paymentMethod:'cash'}});
  const summary=(month='سبتمبر')=>documents.get(key('monthly_payments',context.paymentPeriodId(studentCode,academicYear,month,course)));
  const transaction=id=>documents.get(key('payment_transactions',id));
  const dashboard=month=>buildPaymentDashboard({students:[{studentCode,grade:course,active:true}],summaries:[...documents].filter(([id,row])=>id.startsWith('monthly_payments/')&&row.month===month).map(([,row])=>row),todayTransactions:[],prices:{'برمجة':100},filters:{month,academicYear,grade:'all',status:'all'}}).rows[0];
  return {create,summary,transaction,dashboard,documents,functions:context.exports,studentCode,academicYear,course};
}

test('one full payment is idempotent under double click, retry and reload; legacy paid cannot override period',async()=>{
  const flow=paymentFunctions();
  const [first,retry]=await Promise.all([flow.create('same-request'),flow.create('same-request')]);
  assert.equal([first,retry].filter(row=>row.duplicate).length,1);
  assert.equal([...flow.documents.keys()].filter(key=>key.startsWith('payment_transactions/')).length,1);
  assert.equal((await flow.create('same-request')).duplicate,true);
  assert.equal(flow.summary().paidAmount,100);
  assert.equal(flow.dashboard('سبتمبر').status,'paid');
  assert.equal(paymentPeriodStatus([flow.summary()],'2026/2027','سبتمبر'),'paid');
  assert.equal(paymentPeriodStatus([flow.summary()],'2026/2027','أكتوبر'),'unpaid');
  assert.equal(paymentPeriodStatus([],'2026/2027','سبتمبر'),'unpaid');
  assert.equal(flow.documents.get('students/ST-123456').paid,true);
});

test('editing and cancelling a partial payment update the transaction, dashboard, profile and report totals',async()=>{
  const flow=paymentFunctions(),first=await flow.create('partial-request','سبتمبر',40);
  assert.equal(flow.summary().status,'partial');
  assert.equal(flow.dashboard('سبتمبر').status,'partial');
  await flow.functions.editPaymentTransaction({data:{transactionId:first.id,amount:100,paymentDate:'2026-10-02',paymentMethod:'wallet',notes:'مراجعة'}});
  assert.equal(flow.summary().status,'paid');assert.equal(flow.summary().paidAmount,100);
  assert.equal(flow.transaction(first.id).month,'سبتمبر');
  assert.equal(paymentPeriodStatus([flow.summary()],'2026/2027','سبتمبر'),'paid');
  const report=calculateMonthlyReport({student:{studentCode:flow.studentCode},monthKey:'2026-09',payment:flow.summary()});
  assert.equal(report.payment.status,'paid');
  assert.equal(flow.dashboard('سبتمبر').status,'paid');
  await flow.functions.cancelPaymentTransaction({data:{transactionId:first.id,reason:'خطأ'}});
  await flow.functions.cancelPaymentTransaction({data:{transactionId:first.id,reason:'تكرار'}});
  assert.equal(flow.summary().paidAmount,0);assert.equal(flow.summary().status,'unpaid');
  assert.equal(flow.summary().activeTransactionCount,0);assert.equal(flow.summary().lastPaymentDate,'');
  assert.equal(flow.dashboard('سبتمبر').status,'unpaid');
  assert.equal(paymentPeriodStatus([flow.summary()],'2026/2027','سبتمبر'),'unpaid');
  assert.equal(calculateMonthlyReport({student:{studentCode:flow.studentCode},monthKey:'2026-09',payment:flow.summary()}).payment.status,'unpaid');
});

test('due month stays stable across edits; period relocation is rejected explicitly',async()=>{
  const flow=paymentFunctions(),created=await flow.create('september');
  await assert.rejects(flow.functions.editPaymentTransaction({data:{transactionId:created.id,amount:100,month:'أكتوبر'}}),{code:'invalid-argument'});
  assert.equal(flow.summary().paidAmount,100);assert.equal(flow.summary('أكتوبر'),undefined);
  await flow.functions.editPaymentTransaction({data:{transactionId:created.id,amount:80,paymentDate:'2026-10-05'}});
  assert.equal(flow.summary().status,'partial');assert.equal(flow.summary().paidAmount,80);
  assert.equal(flow.transaction(created.id).month,'سبتمبر');
  assert.equal(flow.dashboard('أكتوبر').status,'unpaid');
});

test('zero payment remains unpaid and totals normalize legacy status fields',()=>{
  assert.equal(paymentStatus(100,0),'unpaid');assert.equal(paymentStatus(100,99),'partial');
  assert.equal(paymentPeriodStatus([{academicYear:'2026/2027',month:'سبتمبر',expectedAmount:100,paidAmount:100,status:'unpaid'}],'2026/2027','سبتمبر'),'paid');
  assert.equal(paymentPeriodStatus([
    {academicYear:'2026/2027',month:'سبتمبر',expectedAmount:100,paidAmount:100},
    {academicYear:'2026/2027',month:'سبتمبر',expectedAmount:50,paidAmount:0},
    {academicYear:'2026/2027',month:'أكتوبر',expectedAmount:100,paidAmount:100}
  ],'2026/2027','سبتمبر'),'partial');
});

test('the latest active payment date is recomputed after edit or cancellation',async()=>{
  const flow=paymentFunctions();
  const first=await flow.create('first','سبتمبر',40);
  const second=await flow.create('second','سبتمبر',60);
  await flow.functions.editPaymentTransaction({data:{transactionId:second.id,amount:60,paymentDate:'2026-10-05'}});
  assert.equal(flow.summary().lastPaymentDate,'2026-10-05');
  await flow.functions.editPaymentTransaction({data:{transactionId:second.id,amount:60,paymentDate:'2026-09-20'}});
  assert.equal(flow.summary().lastPaymentDate,'2026-09-25');
  await flow.functions.cancelPaymentTransaction({data:{transactionId:first.id}});
  assert.equal(flow.summary().lastPaymentDate,'2026-09-20');
  assert.equal(flow.summary().status,'partial');
  await flow.functions.cancelPaymentTransaction({data:{transactionId:second.id}});
  assert.equal(flow.summary().lastPaymentDate,'');
});

test('the paid button waits for Firebase, blocks a second click and keeps the request id after a network error',async()=>{
  const source=fs.readFileSync(require.resolve('../assets/v60-payments.js'),'utf8');
  const code=source.slice(source.indexOf('  window.markStudentPaid=async function'),source.indexOf('  window.openMonthlyPaymentForm=',source.indexOf('  window.markStudentPaid=async function')));
  const row={student:{studentCode:'ST-123456',grade:'برمجة'},month:'سبتمبر',academicYear:'2026/2027',expected:100,remaining:100};
  const state={rows:[row],pending:new Set(),intents:new Map(),loading:false};
  const messages=[],requests=[];
  let release;
  const window={MFCloud:{createPaymentTransaction:payload=>{requests.push(payload);return new Promise(resolve=>{release=resolve;});}}};
  const ctx={window,state,currentMonth:()=> 'سبتمبر',schoolYear:()=> '2026/2027',number:Number,
    adminSameAcademic:(a,b)=>a===b,cairoDate:()=> '2026-09-25',newRequestId:()=> 'one-id',
    updateDashboard:()=>{},scheduleDashboardRefresh:()=>{},applyPaymentResult:(_row,result)=>{row.remaining=result.remainingAmount;},
    aToast:value=>messages.push(value),adminActionErrorMessage:error=>error.message,focusCoursePrice:()=>{}};
  vm.runInNewContext(code,ctx);
  const one=window.markStudentPaid('ST-123456');
  const two=window.markStudentPaid('ST-123456');
  assert.equal(requests.length,1);assert.equal(messages.length,0);
  release({transactionStatus:'active',remainingAmount:0,status:'paid'});
  await Promise.all([one,two]);
  assert.equal(messages.length,1);assert.equal(row.remaining,0);

  row.remaining=100;
  const interrupted=window.markStudentPaid('ST-123456');
  release(Promise.reject(Object.assign(new Error('network failure'),{code:'unavailable'})));
  await interrupted;
  assert.equal(state.intents.size,1);
  const retry=window.markStudentPaid('ST-123456');
  assert.equal(requests[1].requestId,requests[2].requestId);
  release({transactionStatus:'active',remainingAmount:0,status:'paid',duplicate:true});
  await retry;
  assert.equal(state.intents.size,0);
});
