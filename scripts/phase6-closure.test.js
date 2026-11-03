'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),acorn=require('acorn');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),L=require('../assets/learning-progress'),D=require('../functions/lib/account-domain'),tick=()=>new Promise(r=>setTimeout(r,35));
const student={studentCode:'123456',active:true,assignments:[],homeworks:[],materials:[]},now=Date.parse('2026-10-10T12:00:00Z');
test('academic alerts have deterministic IDs and omit submitted homework',()=>{
 const s={...student,assignments:[{id:'a',title:'مهمة'},{id:'b',title:'مسلم'},{id:'a',title:'مهمة'}],homeworks:[{assignmentId:'b'}]};
 const rows=D.academicAlerts(s,{now});assert.equal(rows.length,1);assert.equal(rows[0].id,'homework:123456:a');assert.equal(rows[0].actionTab,'homework');assert.deepEqual(rows,D.academicAlerts(s,{now}));
});
test('unreleased, hidden, archived and expired work produces no academic alert',()=>{
 const bad=[{id:'hidden',published:false},{id:'archived',archived:true},{id:'future',publishAt:'2027-01-01'},{id:'closed',submissionClosed:true},{id:'expired',dueDate:'2026-09-01'}];assert.equal(D.academicAlerts({...student,assignments:bad},{now}).length,0);assert.equal(D.academicAlerts({...student,active:false,assignments:[{id:'a'}]},{now}).length,0);
});
test('exam alert transitions at the schedule and excludes submitted or closed exams',()=>{
 const e={id:'e',title:'اختبار',openAt:'2026-10-10T18:00:00Z',closeAt:'2026-10-11T18:00:00Z'};
 assert.equal(D.academicAlerts(student,{now,exams:[e]})[0].id,'exam-upcoming:123456:e');assert.equal(D.academicAlerts(student,{now:Date.parse(e.openAt),exams:[e]})[0].id,'exam-open:123456:e');assert.equal(D.academicAlerts(student,{now:Date.parse(e.closeAt),exams:[e]}).length,0);assert.equal(D.academicAlerts(student,{now,exams:[{...e,submitted:true}]}).length,0);
});
test('lecture alerts distinguish the existing sources and omit completed content',()=>{
 const rows=D.academicAlerts({...student,materials:[{id:'x',title:'Drive'},{id:'done',progress:100}]},{now,curriculum:{lectures:[{id:'x',title:'منهج'}]}});assert.deepEqual(rows.map(r=>r.id),['lecture:123456:materials:x','lecture:123456:lectures:x']);
});
test('Cairo payment deadline remains due through day 10 and excludes paid or exempt',()=>{
 const s={...student,paymentAccountState:{monthKey:'2026-10',expectedAmount:300,paidAmount:100,status:'partial'}};
 assert.match(D.paymentAlert(s,null,new Date('2026-10-10T23:59:59+03:00')).body,/مستحق حتى يوم 10/);assert.match(D.paymentAlert(s,null,new Date('2026-10-11T00:00:00+03:00')).body,/متأخر في الدفع/);for(const status of ['paid','exempt','free'])assert.equal(D.paymentAlert({...s,paymentAccountState:{...s.paymentAccountState,status}},null,new Date(now)),null);
});
test('unit completion and totals preserve both data models and identical IDs',()=>{
 const rows=L.rows({...student,materials:[{id:'a',lectureCategory:'theory',unit:'الدوائر',progress:100}]},{units:[{id:'u',title:'الوحدة'}],lectures:Array.from({length:5},(_,i)=>({id:String(i),unitId:'u',progress:i<4?100:0}))});
 assert.equal(L.units(rows).find(g=>g.key.startsWith('lectures:')).percent,80);assert.equal(L.summary(rows).percent,83);assert.equal(L.rows({...student,materials:[{id:'0',lectureCategory:'theory'}]},{lectures:[{id:'0'}]}).length,2);
});
test('Continue selects last opened incomplete work then first incomplete',()=>{
 const a={id:'a',progress:0},b={id:'b',progress:25,lastOpenedAt:'2026-10-09'},c={id:'c',progress:100,lastOpenedAt:'2026-10-10'};assert.equal(L.next([a,b,c]),b);assert.equal(L.next([a,c]),a);assert.equal(L.next([c]),null);
});
test('Drive URL is byte-identical and executable/insecure URLs are rejected',()=>{
 const url='https://drive.google.com/file/d/test/view?usp=sharing&resourcekey=0-A%2FB';assert.equal(L.resourceUrl({linkUrl:url}),url);assert.equal(L.contentType({linkUrl:url}),'Drive');for(const url of ['javascript:alert(1)','data:text/html,unsafe','http://example.test','https://user:pass@example.test','https://example.test/has space'])assert.equal(L.resourceUrl({linkUrl:url}),'');
});
function ui(){const dom=new JSDOM('<div id="studentResult"><section class="student-tab-panel show" data-student-panel="lectures"></section></div>',{url:'https://local.invalid/student.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.HTMLElement.prototype.scrollIntoView=function(){};w.toast=()=>{};w.eval(read('assets/learning-progress.js'));w.eval(read('assets/curriculum-student.js'));return {dom,w};}
test('actual lecture UI preserves Drive and completion updates totals without a second read',async()=>{
 const {dom,w}=ui();let reads=0,writes=0;w.MFCloud={getStudentCurriculum:async()=>{reads++;return {lectures:[]};},recordLectureProgress:async(c,id,v,source)=>{writes++;assert.equal(source,'materials');return {percent:v};}};
 const url='https://drive.google.com/file/d/test/view?usp=sharing';w.TMStudentCurriculum.setStudent({...student,materials:[{id:'drive',lectureCategory:'theory',unit:'الوحدة',title:'Drive',linkUrl:url}]});await w.TMStudentCurriculum.show('123456');assert.equal(w.document.querySelector('[data-dashboard-lecture]').getAttribute('href'),url);w.document.querySelector('[data-learning-complete]').click();await tick();assert(w.document.querySelector('[data-learning-complete]').disabled);assert.match(w.document.querySelector('.curriculum-total').textContent,/100%/);assert.equal(reads,1);assert.equal(writes,1);assert.equal(w.document.querySelector('[data-learning-continue]'),null);await w.TMStudentCurriculum.show('123456');assert.equal(reads,1);dom.window.close();
});
test('failed completion remains incomplete with a retry',async()=>{
 const {dom,w}=ui();w.MFCloud={getStudentCurriculum:async()=>({lectures:[]}),recordLectureProgress:async()=>{throw Error('offline');}};w.TMStudentCurriculum.setStudent({...student,materials:[{id:'a',title:'درس',lectureCategory:'theory'}]});await w.TMStudentCurriculum.show('123456');w.document.querySelector('[data-learning-complete]').click();await tick();assert(!w.document.querySelector('[data-learning-complete]').disabled);assert.match(w.document.querySelector('.curriculum-total').textContent,/0%/);dom.window.close();
});
test('pending completion after CODE switch cannot mutate another account',async()=>{
 const {dom,w}=ui();let resolve;w.MFCloud={getStudentCurriculum:async()=>({lectures:[]}),recordLectureProgress:()=>new Promise(r=>resolve=r)};const a={...student,materials:[{id:'same',title:'أول',lectureCategory:'theory',progress:0}]},b={...student,studentCode:'654321',materials:[{id:'same',title:'آخر',lectureCategory:'theory',progress:0}]};
 w.TMStudentCurriculum.setStudent(a);await w.TMStudentCurriculum.show('123456');w.document.querySelector('[data-learning-complete]').click();w.TMStudentCurriculum.setStudent(b);resolve({percent:100});await tick();assert.equal(b.materials[0].progress,0);assert.equal(a.materials[0].progress,100);dom.window.close();
});
test('real Submit Guard coalesces bootstrap without blocking the resumed CODE submit',async()=>{
 const dom=new JSDOM(read('student.html'),{url:'https://local.invalid/student.html',runScripts:'outside-only'}),w=dom.window;w.toast=()=>{};w.eval(read('assets/portal-entry.js'));const source=read('assets/app.js'),n=acorn.parse(source,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='setupDuplicateSubmitGuard');w.eval(source.slice(n.start,n.end));w.setupDuplicateSubmitGuard();
 const loaded=[],append=w.document.head.append.bind(w.document.head);w.document.head.append=n=>{append(n);loaded.push(n.src);setTimeout(()=>{if(n.src.includes('firebase-app-compat'))w.firebase={};for(const name of ['auth','firestore','functions'])if(n.src.includes('firebase-'+name+'-compat'))w.firebase[name]=()=>({});if(n.src.includes('firebase-config'))w.MF_FIREBASE_CONFIG={enabled:true};if(n.src.includes('firebase-sync'))w.MFCloud={ready:true};n.onload();},5);};
 const f=w.document.getElementById('studentSearchForm');f.querySelector('input').value='123456';let calls=0;f.addEventListener('submit',e=>{e.preventDefault();calls++;});f.requestSubmit();f.requestSubmit();for(let deadline=Date.now()+3000;calls===0&&Date.now()<deadline;)await new Promise(r=>setTimeout(r,10));assert.equal(calls,1);assert.equal(loaded.length,6);assert(!loaded.some(s=>s.includes('account-platform')));f.requestSubmit();assert.equal(calls,1);dom.window.close();
});
test('public/entry startup omits account, notification, curriculum and Storage modules',()=>{
 const home=read('index.html');assert(!/src="assets\/(?:account-platform|curriculum-student|portal-results|student-grade-records)\.js/.test(home));assert(!/src="[^"]*firebase-storage-compat/.test(home));for(const route of ['student.html','parent.html']){const d=new JSDOM(read(route));assert(![...d.window.document.scripts].some(s=>/curriculum-student|portal-results|student-grade-records|account-platform/.test(s.src)));d.window.close();}
});
test('local mode requires loopback/demo and cannot fall back to production',()=>{
 const cfg=read('assets/firebase-config.js'),sync=read('assets/firebase-sync.js'),server=read('local-server.js');assert.match(cfg,/!loopback\|\|!local/);assert.match(cfg,/localOffline:true/);assert.match(sync,/auth.useEmulator/);assert.match(sync,/db.useEmulator/);assert.match(sync,/functions\?\.useEmulator/);assert.match(sync,/localMode \? directCall\(payload\)/);assert.match(server,/demo&&!loopback.has\(host\)/);assert(!read('assets/v61-design.css').includes("@import url('./v65"));
});
test('schedule fields stay editable and Admin mobile has direct Attendance',()=>{
 const compatibility=read('assets/v53-upgrades.js'),admin=read('assets/admin.js');assert(!compatibility.includes("['endTime','location','capacity','note'].forEach"));assert(!compatibility.includes("values.endTime=''"));assert.match(admin,/\['attendance','calendar','الحضور'\],\['payments'/);
});


test('Continue accepts serialized Firestore timestamps without losing last-open ordering',()=>{
 const a={id:'a',progress:20,lastOpenedAt:{_seconds:100}},b={id:'b',progress:10,lastOpenedAt:{seconds:200}};assert.equal(L.next([a,b]),b);
});
test('same CODE scope change discards a delayed curriculum from the old group',async()=>{
 const {dom,w}=ui(),resolvers=[];w.MFCloud={getStudentCurriculum:()=>new Promise(resolve=>resolvers.push(resolve))};
 w.TMStudentCurriculum.setStudent({...student,scheduleId:'old'});const first=w.TMStudentCurriculum.show('123456');
 w.TMStudentCurriculum.setStudent({...student,scheduleId:'new'});const second=w.TMStudentCurriculum.show('123456');
 resolvers[1]({lectures:[{id:'new',title:'مجموعة جديدة'}]});await second;resolvers[0]({lectures:[{id:'old',title:'مجموعة قديمة'}]});await first;
 assert(w.document.querySelector('[data-open-lecture="new"]'));assert(!w.document.querySelector('[data-open-lecture="old"]'));dom.window.close();
});
test('Admin group audience loads once on demand and reuses the result',async()=>{
 const {createAdminDOM}=require('./testing/admin-dom'),v=await createAdminDOM();let calls=0;
 try{
  Object.assign(v.window.MFCloud,{listAccountNotificationsAdmin:async()=>({rows:[],hasMore:false}),getGroupsAdmin:async()=>{calls++;await tick();return [{id:'g',name:'مجموعة محلية',active:true}];}});
  v.run("adminData.groups=[];goAdminSection('warnings')");await tick();await tick();
  const details=v.document.getElementById('accountNotificationsAdmin');assert(details);details.open=true;await tick();
  const form=v.document.getElementById('accountNotificationForm');assert(form);assert.equal(calls,0);
  form.elements.scope.value='group';form.elements.scope.dispatchEvent(new v.window.Event('change',{bubbles:true}));form.elements.scope.dispatchEvent(new v.window.Event('change',{bubbles:true}));await tick();await tick();
  assert.equal(calls,1);assert.equal(form.elements.scheduleId.value,'g');
  form.elements.scope.value='all';form.elements.scope.dispatchEvent(new v.window.Event('change',{bubbles:true}));form.elements.scope.value='group';form.elements.scope.dispatchEvent(new v.window.Event('change',{bubbles:true}));await tick();assert.equal(calls,1);
 }finally{v.close();}
});

