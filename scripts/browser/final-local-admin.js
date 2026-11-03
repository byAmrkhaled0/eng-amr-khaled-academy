'use strict';
// This fixture is loaded exclusively by final-local-preview.cjs.
installPhase3CDenseFixture();
window.open=()=>null;
window.MFCloud.getPaymentDashboard=async()=>({rows:[],totals:{},courses:{},nextCursor:null});
window.MFCloud.getPaymentHistory=async()=>({rows:[],nextCursor:null});
document.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(a&&new URL(a.href,location.href).origin!==location.origin)event.preventDefault();},true);

// Expanded reference fixtures: read-only synthetic examples, never loaded by production HTML.
adminData.settings.coursePrices=Object.fromEntries(GRADES.map(grade=>[grade,300]));
window.MFCloud.getPaymentDashboard=async args=>{
 const context=adminWorkspaceContext(),all=adminData.students.map((student,index)=>{const paid=index%3===0?300:index%3===1?150:0;return {key:'local-review-'+index,student,expected:300,paid,remaining:300-paid,priceConfigured:true,status:paid===300?'paid':paid?'partial':'unpaid',month:context.month,academicYear:context.academicYear,summary:{studentCode:student.studentCode,course:student.grade,month:context.month,academicYear:context.academicYear,expectedAmount:300,paidAmount:paid,lastPaymentDate:isoDateAdmin()}};});
 const query=String(args?.query||'').trim().toLowerCase(),rows=all.filter(row=>(!query||[row.student.name,row.student.studentCode].some(v=>String(v).toLowerCase().includes(query)))&&(!args?.status||args.status==='all'||row.status===args.status));
 return {rows,totals:{today:0,collected:rows.reduce((n,r)=>n+r.paid,0),expected:rows.length*300,remaining:rows.reduce((n,r)=>n+r.remaining,0),paid:rows.filter(r=>r.status==='paid').length,partial:rows.filter(r=>r.status==='partial').length,unpaid:rows.filter(r=>r.status==='unpaid').length},courses:{},nextCursor:null,generatedAt:new Date().toISOString()};
};
window.MFCloud.listCurriculumAdmin=async args=>({rows:Array.from({length:3},(_,i)=>({id:'local-curriculum-'+i,title:['مقدمة في البرمجة','أساسيات Python','هياكل البيانات'][i],description:'محتوى تجريبي للمراجعة المحلية فقط',grade:GRADES[0],term:'الترم الأول',unitId:'local-unit',unitTitle:'الوحدة الأولى',lectureNumber:i+1,order:i+1,status:'published'})),nextCursor:null,hasMore:false});

// Attendance fixture creates its default data on DOM ready; install the final dense examples afterwards.
document.addEventListener('DOMContentLoaded',()=>{
 const payments=window.MFCloud.getPaymentDashboard,history=window.MFCloud.getPaymentHistory,curriculum=window.MFCloud.listCurriculumAdmin;
 installPhase3CDenseFixture();
 adminData.settings.coursePrices=Object.fromEntries(GRADES.map(grade=>[grade,300]));
 adminData.materials=Array.from({length:3},(_,i)=>({id:'local-theory-'+i,title:['مقدمة في البرمجة','أساسيات Python','هياكل البيانات'][i],desc:'محاضرة تجريبية للمراجعة المحلية فقط',grade:GRADES[0],group:'',unit:'الوحدة الأولى',lecture:'محاضرة '+(i+1),order:i+1,lectureNumber:i+1,status:'published',active:true,published:true,lectureCategory:'theory',materialType:'theory',resourceType:'theory-lecture',linkUrl:'',fileUrl:''}));
 Object.assign(window.MFCloud,{getPaymentDashboard:payments,getPaymentHistory:history,listCurriculumAdmin:curriculum});
});
