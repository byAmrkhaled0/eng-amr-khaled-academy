'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {calculateMonthlyReport}=require('../functions/lib/monthly-report');
const {normalizeUnifiedResults,isExamGradePending}=require('../functions/lib/portal-results');
const read=file=>fs.readFileSync(require.resolve(file),'utf8');
const app=read('../assets/app.js'),admin=read('../assets/admin.js');

function report(attempt){return calculateMonthlyReport({monthKey:'2026-09',now:'2026-10-10',student:{studentCode:'ST-HOTFIX',createdAt:'2026-08-01'},sessionsComplete:true,
  exams:[{id:'exam-1',title:'امتحان سبتمبر',published:true,required:true,openAt:'2026-09-10',closeAt:'2026-09-20',totalScore:10}],
  examAttempts:[attempt],grades:[{id:'legacy',examId:'exam-1',score:3,maxScore:10,needsManualReview:true,updatedAt:'2026-10-08'}]});}

test('corrected official exam overrides stale review flag and legacy record exactly once',()=>{
  const official={id:'attempt',examId:'exam-1',submittedAt:'2026-09-12',reviewedAt:'2026-10-03',status:'corrected',needsManualReview:true,score:8,maxScore:10};
  const result=report(official);
  assert.equal(isExamGradePending(official),false);
  assert.equal(result.results.rows.length,1);
  assert.equal(result.results.rows[0].status,'graded');
  assert.equal(result.results.rows[0].percentage,80);
  assert.equal(result.results.pendingReview,0);
  const portal=normalizeUnifiedResults({examAttempts:[official],grades:[{examId:'exam-1',score:3,maxScore:10,updatedAt:'2026-10-08'}]});
  assert.equal(portal.length,1);assert.equal(portal[0].score,8);assert.equal(portal[0].status,'graded');
});

test('a score still awaiting approval remains pending',()=>{
  const unapproved={id:'attempt',examId:'exam-1',submittedAt:'2026-09-12',status:'pending_manual',needsManualReview:true,score:8,maxScore:10};
  assert.equal(isExamGradePending(unapproved),true);
  assert.equal(report(unapproved).results.rows[0].status,'pending_review');
  assert.equal(normalizeUnifiedResults({examAttempts:[unapproved]})[0].score,null);
  const backend=read('../functions/index.js');
  assert.match(backend,/tx\.set\(db\.collection\('monthly_report_state'\)\.doc\(studentCode\),\{version:FieldValue\.increment\(1\)/);
  assert.match(backend,/REPORT_STUDENT_SOURCES=\[[^\]]*'exam_attempts'/);
});

function reportUi(){
  const source=app.slice(app.indexOf('const MONTHLY_REPORT_POLICY='),app.indexOf('function studentProfileHTML('));
  const scope={};vm.runInNewContext(`${source}\nthis.compatibleMonthlyReport=compatibleMonthlyReport;this.monthlyReportTitle=monthlyReportTitle;`,scope);return scope;
}
test('portal and parent use the same report title; unavailable and loading are distinct states',()=>{
  const ui=reportUi(),payload={schemaVersion:11,policyVersion:'monthly-v11-student-level',monthKey:'2026-09',student:{studentCode:'ST-HOTFIX'},monthlyTitle:'متفوق الشهر',level:'جيد جدًا',overallScore:82,attendance:{percentage:80},homework:{completionPercentage:75},results:{average:80}};
  assert.equal(ui.compatibleMonthlyReport(payload,'ST-HOTFIX'),true);
  assert.equal(ui.monthlyReportTitle(payload),'متفوق الشهر');
  assert.equal(ui.monthlyReportTitle(null,true),'تعذر تحميل بيانات الشهر');
  assert.equal(ui.monthlyReportTitle(null,false),'جاري تحميل بيانات الشهر');
  assert.equal(ui.compatibleMonthlyReport({...payload,policyVersion:'monthly-v10'},'ST-HOTFIX'),false);
  assert.match(app,/studentProfileHTML\(student,false\)/);
  assert.match(app,/monthlyTitle=monthlyReportTitle\(monthlyReport,st\.monthlyReportError\)/);
  assert.match(app,/function parentMonthlyReportHTML\(report\)[\s\S]*monthlyReportTitle\(report,true\)/);
  assert.match(app,/data-retry-monthly-report/);
});

test('admin missing metrics stay blank, zero stays zero and report values win',()=>{
  const scope={compatibleMonthlyReport:reportUi().compatibleMonthlyReport,stCode:st=>st.studentCode,adminReportMonthKey:()=> '2026-09'};
  const code=admin.slice(admin.indexOf('function calcStudentAdmin('),admin.indexOf('function badgeStatus('));
  vm.runInNewContext(`${code}\nthis.calculate=calcStudentAdmin;`,scope);
  const student={studentCode:'ST-HOTFIX'};
  assert.equal(scope.calculate({...student,attendance:[{status:'present'}],grades:[{score:0}]}).avg,null);
  const base={schemaVersion:11,policyVersion:'monthly-v11-student-level',monthKey:'2026-09',student:{studentCode:'ST-HOTFIX'},monthlyTitle:'نجم التطور',level:'جيد',overallScore:60,attendance:{percentage:0},homework:{completionPercentage:0},results:{average:0}};
  const zero=scope.calculate({...student,monthlyReport:base});assert.equal(zero.attendancePct,0);assert.equal(zero.avg,0);
  const actual=scope.calculate({...student,monthlyReport:{...base,attendance:{percentage:87.5},homework:{completionPercentage:75},results:{average:80}}});
  assert.deepEqual([actual.attendancePct,actual.homeworkPct,actual.avg],[87.5,75,80]);
  assert.match(admin,/c\.avg==null\?'—':`\$\{c\.avg\}%`/);
  assert.match(admin,/c\.homeworkPct==null\?'—'/);
});

function deliveryHarness(canShare){
  const intro=app.slice(app.indexOf('function parentReportWhatsAppIntro('),app.indexOf('window.parentReportWhatsAppIntro=parentReportWhatsAppIntro;')+'window.parentReportWhatsAppIntro=parentReportWhatsAppIntro;'.length);
  const delivery=app.slice(app.indexOf('window.deliverParentMonthlyReport=async function('),app.indexOf('let parentReportSharePending=false;'));
  const events={notices:[],downloads:0,shared:null,opened:null};
  const report={schemaVersion:11,policyVersion:'monthly-v11-student-level',monthKey:'2026-09',student:{studentCode:'ST-HOTFIX',name:'طالب اختبار'},monthlyTitle:'متفوق الشهر',level:'جيد جدًا',overallScore:82,attendance:{},homework:{},results:{}};
  const scope={window:{open:link=>{events.opened=link;return {opener:null};}},navigator:{clipboard:{writeText:async()=>{}},canShare:()=>canShare,share:async payload=>{events.shared=payload;}},
    parentReportTrend:()=>({available:false}),reportMonthLabel:()=> 'سبتمبر ٢٠٢٦',whatsappPhone:value=>value,whatsappLink:(phone,message)=>`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    compatibleMonthlyReport:()=>true,confirm:()=>true,toast:()=>{},parentReportImageBlob:async()=>new Blob(['PNG'],{type:'image/png'}),
    File:class File{constructor(parts,name,options){this.name=name;this.type=options.type;this.parts=parts;}},URL:{createObjectURL:()=> 'blob:report',revokeObjectURL:()=>{}},setTimeout:()=>{},
    document:{body:{appendChild:()=>{}},createElement:()=>({click:()=>events.downloads++,remove:()=>{}})}};
  vm.runInNewContext(`${intro}\n${delivery}`,scope);
  return {events,report,scope,run:()=>scope.window.deliverParentMonthlyReport(report,'201001234567',message=>events.notices.push(message))};
}

test('WhatsApp message has actual student and level; share API includes PNG and text',async()=>{
  const flow=deliveryHarness(true);assert.equal(await flow.run(),true);
  const message=flow.events.shared.text;
  assert.match(message,/طالب اختبار/);assert.match(message,/جيد جدًا/);assert.match(message,/الحضور والواجبات والامتحانات/);
  assert.match(message,/82%/);assert.equal(flow.events.shared.files[0].type,'image/png');assert.equal(flow.events.downloads,0);
});

test('desktop fallback downloads PNG and opens text without claiming the image was sent',async()=>{
  const flow=deliveryHarness(false);assert.equal(await flow.run(),true);
  assert.equal(flow.events.downloads,1);assert.match(flow.events.opened,/wa\.me/);
  assert.match(flow.events.notices.at(-1),/أرفق الصورة التي تم تنزيلها/);
  assert.doesNotMatch(flow.events.notices.at(-1),/تم إرسال الصورة/);
  assert.equal(flow.scope.window.parentReportDeliveryMode,'whatsapp-opened');
});

test('localhost pages reference exact changed asset hashes instead of cached release URLs',()=>{
  for(const [page,assets] of Object.entries({'../student.html':['portal-results','app'],'../parent.html':['portal-results','app'],'../teacher-login.html':['portal-results','app','admin','v60-admin-workflow','v64-admin-operations']})){
    const html=read(page);
    for(const asset of assets){const name=`assets/${asset}.js`,digest=crypto.createHash('sha256').update(read(`../${name}`)).digest('hex').slice(0,10);
      assert.ok(html.includes(`${name}?v=70.0.0&rev=${digest}`),`${page} contains the current ${name}`);
    }
  }
});
