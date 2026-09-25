'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {calculateMonthlyReport}=require('../functions/lib/monthly-report');

test('all live manifests use JSON paths, preserve PWA data, and are copied into dist',()=>{
  const teacher=read('teacher-login.html');
  assert.match(teacher,/<link[^>]+teacher-manifest\.json[^>]+rel="manifest"/);
  for(const name of fs.readdirSync(root).filter(name=>name.endsWith('.html')&&name!=='teacher-login.html')){
    const html=read(name);
    if(/rel="manifest"/.test(html))assert.match(html,/site-manifest\.json/,name);
    assert.doesNotMatch(html,/\.webmanifest/,name);
  }
  for(const name of ['site-manifest.json','teacher-manifest.json']){
    const manifest=JSON.parse(read(name));
    for(const field of ['name','short_name','start_url','scope','icons','background_color','theme_color','dir'])assert.ok(manifest[field],`${name} ${field}`);
    assert.equal(manifest.dir,'rtl');
  }
  assert.doesNotMatch(read('service-worker.js'),/\.webmanifest/);
  assert.match(read('service-worker.js'),/"\/site-manifest\.json", "\/teacher-manifest\.json"/);
  assert.match(read('service-worker.js'),/endsWith\("-manifest\.json"\)/);
  assert.match(read('scripts/build.js'),/'site-manifest\.json'/);
  assert.match(read('scripts/build.js'),/'teacher-manifest\.json'/);
  const build=spawnSync(process.execPath,[path.join(root,'scripts/build.js')],{cwd:root,encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  assert.ok(fs.existsSync(path.join(root,'dist/site-manifest.json')));
  assert.ok(fs.existsSync(path.join(root,'dist/teacher-manifest.json')));
  assert.match(read('dist/teacher-login.html'),/teacher-manifest\.json/);
  assert.doesNotMatch(read('dist/teacher-login.html'),/\.webmanifest/);
});

test('class check stays in activity and cannot contaminate three graded assignments',()=>{
  const student={studentCode:'ST-1',createdAt:'2026-08-01'},assignments=['a','b','c'].map(id=>({id,title:`واجب ${id}`,publishAt:'2026-09-01',totalScore:15}));
  const submissions=assignments.map((assignment,index)=>({assignmentId:assignment.id,submittedAt:'2026-09-10T10:00:00Z',score:[14,13,15][index],maxScore:15,status:'corrected'}));
  const check={id:'ST-1_2026-09-12_class',type:'homework',method:'teacher_class_check',title:'واجب الحصة',date:'2026-09-12',completed:true,approved:true,status:'تم عمل الواجب',score:null};
  const input=homeworks=>({student,monthKey:'2026-09',now:'2026-09-30',assignments,homeworks});
  const baseline=calculateMonthlyReport(input(submissions)).homework;
  const report=calculateMonthlyReport(input([...submissions,check])).homework;
  for(const key of ['required','submitted','submittedRequired','graded','averageGrade','scorePercentage','completionPercentage','activitySubmitted'])assert.equal(report[key],baseline[key],key);
  assert.equal(report.required,3);assert.equal(report.submitted,3);assert.equal(report.graded,3);
  assert.equal(report.rows.length,3);
  assert.equal(report.rows.filter(row=>row.submission?.needsManualReview===true).length,0);
  assert.equal(report.classProgress.length,1);
  assert.equal(report.classProgress[0].status,'تم عمل الواجب');
  assert.match(read('assets/v64-admin-operations.js'),/report\.homework\?\.classProgress/);
});

test('parent status distinguishes completed class check, genuine pending review, and graded assignment',()=>{
  const app=read('assets/app.js'),start=app.indexOf('function parentHomeworkStatus('),end=app.indexOf('function parentAttendanceStatus(',start);
  const context={};vm.runInNewContext(app.slice(start,end),context);
  const status=context.parentHomeworkStatus;
  assert.equal(status({status:'submitted',submission:{method:'teacher_class_check',type:'homework',completed:true,approved:true,score:null}}),'تم عمل الواجب');
  assert.equal(status({status:'submitted',submission:{assignmentId:'a',needsManualReview:true,score:null}}),'قيد التصحيح');
  assert.equal(status({status:'submitted',submission:{assignmentId:'a',status:'pending_review',score:null}}),'قيد التصحيح');
  assert.equal(status({status:'submitted',submission:{assignmentId:'a',score:14,maxScore:15,status:'corrected'}}),'14 من 15');
  assert.equal(status({status:'submitted',submission:{assignmentId:'a',score:null,status:'submitted'}}),'تم التسليم');
  assert.match(read('functions/index.js'),/monthly-v12-scheduled-session-attendance/);
  assert.match(read('functions/lib/monthly-report.js'),/monthly-v12-scheduled-session-attendance/);
  assert.match(app,/MONTHLY_REPORT_POLICY='monthly-v12-scheduled-session-attendance'/);
});
