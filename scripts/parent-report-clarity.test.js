'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createAdminDOM}=require('./testing/admin-dom');
function report(){return {student:{studentCode:'DEMO1',name:'طالب التجربة',grade:'برمجة'},monthKey:'2026-10',overallScore:80,level:'جيد',commitmentScore:85,commitmentLevel:'منتظم',attendance:{percentage:75,present:3,required:4,absent:1,rows:[{date:'2026-10-01',status:'present'}]},results:{average:80,gradedCount:24,requiredExams:24,submittedExams:24,rows:Array.from({length:24},(_,i)=>({examTitle:'اختبار '+(i+1),score:8,maxScore:10,status:'graded'}))},homework:{averageGrade:90,submitted:1,required:1,rows:[{assignment:{title:'واجب البرمجة'},submission:{score:9,maxScore:10},status:'submitted'}]},study:{lecturesAvailable:5,lecturesCompleted:3},practical:{completed:2},motivation:{rank:2,totalStudents:10,totalPoints:5},payment:{status:'paid'},teacherNotes:'ملاحظة شخصية كاملة\nاستمر في التطبيق',warnings:['معلومة اكتمال'],strengths:['نقطة قوية أولى','نقطة قوية ثانية'],concerns:['تحتاج تدريب أول','تحتاج تدريب ثان'],recommendations:['خطة عملية']};}

test('monthly report prioritizes four KPIs, preserves all rows, and merges follow-up only once',async()=>{
 const ui=await createAdminDOM();try{ui.window.testReport=report();ui.document.body.innerHTML='<div id="parentResult">'+ui.run('parentMonthlyReportHTML(window.testReport)')+'</div>';const d=ui.document;
 assert.equal(d.querySelectorAll('.parent-report-kpis-v70>div').length,4);assert.equal(d.querySelectorAll('.parent-secondary-metrics>div>div').length,4);
 assert.equal(d.querySelectorAll('.parent-report-feedback-v7002,.parent-report-followup-v71').length,1);
 assert.equal(d.querySelectorAll('.parent-report-list-v70').item(0).children.length,24);assert(d.body.textContent.includes('اختبار 24'));
 assert.equal(d.querySelector('.parent-report-teacher-note p').textContent,report().teacherNotes);
 assert.equal((d.querySelector('.parent-report-overview-copy-v72').textContent.match(/لا توجد بيانات كافية/g)||[]).length,1);
 assert(!d.querySelector('.parent-report-overview-copy-v72>b').textContent.includes('كافية'));
 assert.equal(d.querySelector('progress').value,75);assert(d.querySelector('.parent-attendance-count').textContent.includes('3 من 4'));
 assert.equal(d.querySelector('.academic .parent-report-list-v70 strong').textContent,'8 من 10');
 for(const selector of ['[data-tm-action="copyParentReport"]','[onclick="printParentReport()"]','[data-tm-action="downloadParentSummary"]'])assert(d.querySelector(selector),selector);
 assert.equal(d.querySelectorAll('.parent-report-toolbar-v70 .report-action svg').length,3);
 assert.equal(d.querySelectorAll('.parent-report-kpis-v70>div>.parent-report-metric-icon svg').length,4);
 assert([...d.querySelectorAll('.report-action-icon')].every(n=>n.getAttribute('aria-hidden')==='true'));
 }finally{ui.close();}
});

test('evaluation and follow-up navigation target one section and full report retains every block',async()=>{
 const ui=await createAdminDOM();try{ui.window.testReport=report();ui.document.body.innerHTML='<div id="parentResult">'+ui.run('parentMonthlyReportHTML(window.testReport)')+'</div>';ui.run(fs.readFileSync(path.join(__dirname,'../assets/account-platform.js'),'utf8'));ui.window.TMAccount.mountParent(ui.window.testReport);
 const d=ui.document,block=d.querySelector('.parent-report-feedback-v7002');
 for(const key of ['evaluation','followup']){d.querySelector(`[data-parent-section="${key}"]`).click();assert.equal(block.hidden,false);}
 d.querySelector('[data-parent-section="report"]').click();assert([...d.querySelectorAll('[data-parent-block]')].every(n=>!n.hidden));
 assert.equal(d.querySelectorAll('.parent-report-feedback-v7002').length,1);assert.equal(d.querySelectorAll('.parent-secondary-metrics').length,1);
 }finally{ui.close();}
});

test('unknown and pending results keep their states rather than displaying a false numeric grade',async()=>{
 const ui=await createAdminDOM();try{
 assert.equal(ui.run('parentReportGradeDisplay({score:0,maxScore:10,status:"graded"})'),'0 من 10');
 assert(!ui.run('parentReportGradeDisplay({score:8,maxScore:10,status:"pending_review"})').includes('8 من 10'));
 const r=report();r.attendance.percentage=null;r.overallScore=null;r.commitmentScore=null;ui.window.testReport=r;
 ui.document.body.innerHTML=ui.run('parentMonthlyReportHTML(window.testReport)');assert(!ui.document.querySelector('progress').hasAttribute('value'));
 assert.equal(ui.document.querySelector('.parent-report-score-v72 b').textContent,'—');
 }finally{ui.close();}
});

test('summary PNG is shorter and explicit; full PNG retains every activity and has one guidance block',async()=>{
 const ui=await createAdminDOM();try{let texts=[],lastCanvas;const ctx={beginPath(){},moveTo(){},arcTo(){},closePath(){},fill(){},stroke(){},fillRect(){},drawImage(){},createLinearGradient(){return {addColorStop(){}};},measureText:s=>({width:String(s).length*8}),fillText:(s,x,y)=>texts.push({text:String(s),x,y})};
 ui.window.HTMLCanvasElement.prototype.getContext=function(){lastCanvas=this;return ctx;};ui.window.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new ui.window.Blob(['local-png'],{type:'image/png'}));};ui.run('loadParentReportLogo=async()=>null');
 const r=report();await ui.window.parentReportImageBlob(r);const fullHeight=lastCanvas.height;
 assert(texts.some(x=>x.text.includes('اختبار 24')));assert.equal(texts.filter(x=>x.text==='ملخص المتابعة وخطة ولي الأمر').length,1);assert(texts.every(x=>x.y>=0&&x.y<fullHeight));
 texts=[];await ui.window.parentReportImageBlob(r,{summary:true});assert(lastCanvas.height<fullHeight);assert(texts.some(x=>x.text.includes('ملخص تقرير ولي الأمر')));assert(!texts.some(x=>x.text.includes('اختبار 24')));assert(texts.every(x=>x.y>=0&&x.y<lastCanvas.height));
 }finally{ui.close();}
});
