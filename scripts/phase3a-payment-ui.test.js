'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdminDOM,tick}=require('./testing/admin-dom');
async function setup(status='partial',missing=false){
 const ui=await createAdminDOM(),student=ui.run('adminData.students[0]');
 ui.run("adminData.settings.coursePrices={[GRADES[0]]:300};window.adminWorkspaceContext=()=>({month:MONTHS[8],academicYear:'2026/2027'});");
 let reads=0;
 ui.window.MFCloud.getPaymentDashboard=async()=>{reads++;return {rows:[{key:'phase3-ui',student,month:ui.run('MONTHS[8]'),academicYear:'2026/2027',expected:missing?0:300,paid:status==='paid'?300:status==='partial'?150:0,remaining:missing||status==='paid'?0:status==='partial'?150:300,status,priceConfigured:!missing}],totals:{},courses:{}};};
 ui.window.renderPayments();await tick(25);return {ui,reads:()=>reads};
}
test('compact rows expose all three canonical monetary fields with existing action hooks and one read',async()=>{
 const {ui,reads}=await setup();try{
 const row=ui.document.querySelector('.payment-compact-row');assert.equal(row.dataset.paymentKey,'phase3-ui');
 assert.deepEqual([...row.querySelectorAll('dt')].map(x=>x.textContent),['المطلوب','المدفوع','المتبقي']);
 assert.equal(row.querySelectorAll('.payment-row-actions button').length,3);
 assert.match(row.textContent,/دفع جزئي/);assert.equal(reads(),1);
 assert(row.querySelector('.quick-paid-button'));assert(row.querySelector('.payment-history-shell').hidden);
 }finally{ui.close();}
});
test('history stays attached to the student, exposes edit/cancel and announces its expansion',async()=>{
 const {ui}=await setup();try{
 ui.window.MFCloud.getPaymentHistory=async()=>({rows:[{id:'synthetic-1',studentCode:ui.run('stCode(adminData.students[0])'),course:ui.run('GRADES[0]'),month:ui.run('MONTHS[8]'),academicYear:'2026/2027',amount:150,status:'active',paymentMethod:'cash',paymentDate:'2026-10-01'}]});
 const button=ui.document.querySelector('.payment-compact-row [aria-expanded]');await ui.window.togglePaymentHistory(button);
 assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(ui.document.querySelector('.payment-history-shell').hidden,false);
 assert.match(ui.document.querySelector('.payment-history-shell').textContent,/تعديل/);assert.match(ui.document.querySelector('.payment-history-shell').textContent,/إلغاء/);
 await ui.window.togglePaymentHistory(button);assert.equal(button.getAttribute('aria-expanded'),'false');
 }finally{ui.close();}
});
for(const status of ['paid','unpaid'])test(`canonical ${status} state keeps payment action protections`,async()=>{
 const {ui}=await setup(status);try{assert.equal(ui.document.querySelector('.quick-paid-button').disabled,status==='paid');assert.equal(ui.document.querySelector('.payment-row-actions [data-render-action="openMonthlyPaymentForm"]')?.disabled??ui.document.querySelector('.payment-history-actions button').disabled,status==='paid');}finally{ui.close();}
});
test('unknown price has an explicit text badge and retains the price-setting action',async()=>{
 const {ui}=await setup('unpaid',true);try{assert.match(ui.document.querySelector('.payment-compact-row>.badge').textContent,/السعر غير محدد/);assert.equal(ui.document.querySelector('.quick-paid-button').disabled,false);assert.equal(ui.document.querySelector('.payment-history-actions button').disabled,true);}finally{ui.close();}
});
