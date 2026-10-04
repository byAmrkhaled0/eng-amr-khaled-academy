'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdminDOM}=require('./testing/admin-dom');
const {buildPaymentDashboard}=require('../functions/lib/payment-dashboard');
async function uiFor(price){
 const ui=await createAdminDOM(),student={studentCode:'ST123456',name:'طالب الدفع',studentName:'طالب الدفع',grade:'أساسيات برمجة',active:true};
 let reads=0,writes=0,release;
 const dashboard=buildPaymentDashboard({students:[student],summaries:[{studentCode:student.studentCode,course:student.grade,expectedAmount:0,paidAmount:0,month:'سبتمبر',academicYear:'2026/2027'}],todayTransactions:[],prices:{[student.grade]:price},filters:{month:'سبتمبر',academicYear:'2026/2027',grade:'all',status:'all'}});
 ui.run(`adminData.students=${JSON.stringify([student])};adminData.settings={coursePrices:{'أساسيات برمجة':${price}},academicYear:'2026/2027'};`);
 ui.window.MFCloud={ready:true,getPaymentDashboard:async()=>{reads++;return {...dashboard,nextCursor:null,generatedAt:new Date().toISOString()};},createPaymentTransaction:()=>{writes++;return new Promise(r=>release=r);}};
 ui.window.renderPayments();await ui.tick(30);
 return {ui,counts:()=>({reads,writes}),finish:()=>release({transactionStatus:'active',expectedAmount:price,paidAmount:price,remainingAmount:0,status:'paid'})};
}
test('actual payment renderer: legacy zero uses configured price, double click sends one request, card updates without dashboard fetch',async()=>{
 const f=await uiFor(500);try{const a=f.ui.window.markStudentPaid('ST123456','سبتمبر','2026/2027','أساسيات برمجة'),b=f.ui.window.markStudentPaid('ST123456','سبتمبر','2026/2027','أساسيات برمجة');assert.equal(f.counts().writes,1);assert(f.ui.document.querySelector('.quick-paid-button').disabled);f.finish();await Promise.all([a,b]);assert.match(f.ui.document.querySelector('.monthly-payment-card').textContent,/مدفوع بالكامل/);assert.equal(f.counts().reads,1);assert(f.ui.document.querySelector('.quick-paid-button').disabled);assert.match(f.ui.document.getElementById('toast').textContent,/تم تأكيد الدفعة/);}finally{f.ui.close();}
});
test('actual payment renderer: intentionally free course has no price loop and no ledger write',async()=>{
 const f=await uiFor(0);try{assert(!f.ui.document.querySelector('.payment-price-warning'));assert(f.ui.document.querySelector('.quick-paid-button').disabled);await f.ui.window.markStudentPaid('ST123456','سبتمبر','2026/2027','أساسيات برمجة');assert.equal(f.counts().writes,0);assert.match(f.ui.document.getElementById('toast').textContent,/لا توجد دفعة مطلوبة/);}finally{f.ui.close();}
});
