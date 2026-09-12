// Local fixture only: excluded from the production build. No Firebase SDK.
var adminData={students:[{studentCode:'DEMO0001',name:'أحمد — بيانات تجريبية',grade:'أساسيات برمجة',active:true}],settings:{academicYear:'2026/2027',coursePrices:{'أساسيات برمجة':100}}};
var currentStaff={uid:'fixture-admin',role:'admin',allowed:true};
var safe=esc,normalizeText=value=>String(value||'').trim().toLowerCase(),normalizeStudent=value=>value,stCode=value=>value.studentCode,adminSameAcademic=(a,b)=>a===b;
var fresh=()=>{},adminActionErrorMessage=error=>error.message,content=html=>document.getElementById('fixture').innerHTML=html;
var aToast=text=>{document.getElementById('testState').textContent=text;};
var paid=0,fixtureHistory=[],requests=new Map();
window.adminWorkspaceContext=()=>({month:'سبتمبر',academicYear:'2026/2027'});
const delay=()=>new Promise(resolve=>setTimeout(resolve,200));
window.MFCloud={
 getPaymentDashboard:async filters=>{await delay();const summary=paid?{studentCode:'DEMO0001',course:'أساسيات برمجة',month:'سبتمبر',academicYear:'2026/2027',paidAmount:paid,expectedAmount:100}:null;
 const row={key:'DEMO0001|2026/2027|سبتمبر|أساسيات برمجة',student:adminData.students[0],summary,month:'سبتمبر',academicYear:'2026/2027',expected:100,paid,remaining:100-paid,status:paid===100?'paid':paid?'partial':'unpaid'};
 return {rows:[row],totals:{expected:100,collected:paid,remaining:100-paid,today:paid,paid:paid===100?1:0,partial:paid>0&&paid<100?1:0,unpaid:paid===0?1:0},courses:{},nextCursor:null,generatedAt:new Date().toISOString()};},
 createPaymentTransaction:async payload=>{await delay();if(requests.has(payload.requestId))return requests.get(payload.requestId);paid+=payload.amount;const result={id:payload.requestId,transactionStatus:'active'};requests.set(payload.requestId,result);fixtureHistory.push({...payload,id:payload.requestId,status:'active'});return result;},
 editPaymentTransaction:async data=>{await delay();const row=fixtureHistory.find(r=>r.id===data.transactionId);paid+=data.amount-row.amount;Object.assign(row,data);return {ok:true};},
 cancelPaymentTransaction:async id=>{await delay();const row=fixtureHistory.find(r=>r.id===id);paid-=row.amount;row.status='cancelled';return {ok:true};},
 getPaymentHistory:async()=>{await delay();return {rows:fixtureHistory,nextCursor:null};}
};
function displayReport(){lastParentMonthlyReport=fixtureReport;content(`<div id="parentResult">${parentMonthlyReportHTML(fixtureReport)}</div>`);}
window.addEventListener('message',event=>{if(event.origin!==location.origin)return;const action=event.data?.reviewAction;if(action==='payments')renderPayments();if(action==='report')displayReport();if(action==='theme'){const dark=document.documentElement.getAttribute('data-theme')!=='dark';document.documentElement.setAttribute('data-theme',dark?'dark':'light');document.body.classList.toggle('dark',dark);}});
document.addEventListener('DOMContentLoaded',()=>renderPayments());
const check=(ok,message)=>{if(!ok)throw new Error(message);};
document.getElementById('runOffline').onclick=async()=>{
 const box=document.getElementById('testState');box.textContent='جارٍ الاختبار…';
 try{
 const sessionId=`fixture-${Date.now()}`,date=new Date().toISOString().slice(0,10),prep={preparationId:sessionId,sessionId,ownerUid:'fixture-admin',scheduleId:'g',date,preparedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),roster:[{studentCode:'DEMO0001',attendanceCode:'ATT-DEMO1',name:'طالب تجريبي',scheduleId:'g'}]};
 await OfflineAttendance.cachePreparation(prep);const event={studentCode:'DEMO0001',attendanceCode:'ATT-DEMO1',classSessionId:sessionId,preparationId:sessionId,ownerUid:'fixture-admin',date,scannedAt:new Date().toISOString()};
 const started=performance.now(),rows=await Promise.all([OfflineAttendance.enqueue(event),OfflineAttendance.enqueue(event)]);check(rows[0].requestId===rows[1].requestId,'تكرار بين عمليتي المسح');
 const queue=await OfflineAttendance.getQueue();check(queue.filter(r=>r.classSessionId===sessionId).length===1,'سجل مكرر');
 sessionStorage.setItem('fixture-pending-request',rows[0].requestId);
 box.textContent=`نجح: مسحان متزامنان أنتجا سجلًا واحدًا؛ الحفظ ${Math.round(performance.now()-started)}ms. أعد فتح الصفحة وافحص البقاء.`;
 }catch(error){box.textContent='فشل: '+error.message;}
};
document.getElementById('checkReload').onclick=async()=>{
 const id=sessionStorage.getItem('fixture-pending-request'),row=(await OfflineAttendance.getQueue()).find(r=>r.requestId===id),box=document.getElementById('testState');
 if(!row){box.textContent='فشل: السجل غير موجود';return;}
 try{
 await OfflineAttendance.sync(async events=>({results:events.map(e=>({requestId:e.requestId,ok:true,id:'server-test'}))}),'fixture-admin');
 const saved=(await OfflineAttendance.getQueue()).find(r=>r.requestId===id);check(saved.status==='synced','لم يحفظ الإقرار');box.textContent='نجح: بقي السجل بعد إعادة الفتح ثم حُفظ إقرار المزامنة.';
 }catch(error){box.textContent='فشل: '+error.message;}
};
