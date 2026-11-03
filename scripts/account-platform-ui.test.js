
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),tick=()=>new Promise(r=>setTimeout(r,30));
function entry(name){
 const dom=new JSDOM(fs.readFileSync(path.join(root,name),'utf8'),{url:'https://local.invalid/'+name,runScripts:'outside-only'}),w=dom.window,loaded=[];
 const append=w.document.head.append.bind(w.document.head);let fail=false;
 w.document.head.append=node=>{
  append(node);if(node.tagName!=='SCRIPT')return;
  const src=node.src;loaded.push(src);
  setTimeout(()=>{
   if(fail){node.dispatchEvent(new w.Event('error'));return;}
   if(src.includes('firebase-app-compat'))w.firebase={};
   for(const name of ['auth','firestore','functions'])if(src.includes('firebase-'+name+'-compat'))w.firebase[name]=()=>({});
   if(src.includes('firebase-config.js'))w.MF_FIREBASE_CONFIG={enabled:true};
   if(src.includes('firebase-sync.js'))w.MFCloud={ready:true};
   if(src.includes('portal-results.js'))w.TMResults={};
   if(src.includes('account-domain.js'))w.TMAccountDomain={};
   if(src.includes('account-platform.js'))w.TMAccount={};
   node.dispatchEvent(new w.Event('load'));
  },0);
 };
 w.eval(fs.readFileSync(path.join(root,'assets/portal-entry.js'),'utf8'));
 const form=w.document.querySelector('form'),input=form.querySelector('input');input.value='123456';let calls=0;form.addEventListener('submit',e=>{e.preventDefault();calls++;});
 return {dom,w,form,loaded,calls:()=>calls,fail:value=>fail=value};
}
for(const name of ['student.html','parent.html']){
 test(name+' makes no cloud SDK request before CODE access and initializes once',async()=>{const v=entry(name);try{assert.equal(v.loaded.length,0);v.form.requestSubmit();v.form.dispatchEvent(new v.w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();assert.equal(v.loaded.filter(s=>s.includes('firebase')).length,6);assert.equal(v.loaded.length,6);assert.equal(v.calls(),1);assert(!v.loaded.some(s=>s.includes('storage')));v.form.requestSubmit();assert.equal(v.calls(),2);assert.equal(v.loaded.length,6);}finally{v.dom.window.close();}});
 test(name+' loads the account presentation once only after successful access needs it',async()=>{const v=entry(name);try{assert.equal(v.loaded.length,0);await Promise.all([v.w.TMPortalEntry.loadAccount(),v.w.TMPortalEntry.loadAccount()]);const count=name==='parent.html'?1:3;assert.equal(v.loaded.length,count);if(name==='student.html'){assert(v.loaded[0].includes('portal-results.js'));assert(v.loaded[1].includes('account-domain.js'));}assert(v.loaded.at(-1).includes('account-platform.js'));await v.w.TMPortalEntry.loadAccount();assert.equal(v.loaded.length,count);}finally{v.dom.window.close();}});
 test(name+' preserves retry after a failed bootstrap',async()=>{const v=entry(name);try{v.fail(true);v.form.requestSubmit();await tick();assert.equal(v.calls(),0);assert(!v.form.querySelector('[type=submit]').disabled);v.fail(false);v.form.requestSubmit();await tick();await tick();assert.equal(v.calls(),1);assert(v.w.MFCloud.ready);}finally{v.dom.window.close();}});
}
test('Lectures starts no request on entry and recovers after switching tabs during first load',async()=>{
 const dom=new JSDOM('<div id="studentResult"><section class="student-tab-panel show" data-student-panel="lectures"></section></div>',{url:'https://local.invalid/student.html',runScripts:'outside-only'}),w=dom.window;let resolve,calls=0;
 w.MFCloud={getStudentCurriculum:()=>{calls++;return new Promise(r=>resolve=r);}};
 w.eval(fs.readFileSync(path.join(root,'assets/learning-progress.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'assets/curriculum-student.js'),'utf8'));
 try{
  w.TMStudentCurriculum.setStudent('123456');assert.equal(calls,0);
  const open=()=>w.document.dispatchEvent(new w.CustomEvent('technominds:student-tab',{detail:{key:'lectures',code:'123456'}}));
  open();assert.equal(calls,1);w.document.querySelector('[data-student-panel]').classList.remove('show');
  resolve({student:{grade:'اختبار'},lectures:[{id:'lecture',title:'درس',lectureNumber:1,term:'الترم الأول'}]});await tick();
  w.document.querySelector('[data-student-panel]').classList.add('show');open();assert(w.document.querySelector('[data-open-lecture]'));assert.equal(calls,1);
  w.document.getElementById('studentResult').innerHTML='<section class="student-tab-panel show" data-student-panel="lectures"></section>';open();assert(w.document.querySelector('[data-open-lecture]'));assert.equal(calls,1);
 }finally{dom.window.close();}
});

test('public cache preserves managed tracks including an intentionally empty list without retaining students',()=>{
 const source=fs.readFileSync(path.join(root,'assets/app.js'),'utf8'),match=source.match(/function publicDataOnly\(data\)\{[^\n]+\}/);assert(match);
 const context={window:{currentAcademicYear:()=> '2026/2027'},mergeData:x=>x,defaultData:()=>({students:[]}),DEFAULT_SITE_URL:'local',TEACHER_WHATSAPP:'0',assignmentIsReleasedClient:()=>true};require('node:vm').createContext(context);require('node:vm').runInContext(match[0],context);
 const data={students:[{secret:'student'}],materials:[],questions:[],reviews:[],groups:[],assignments:[],settings:{learningTracks:[],learningTracksVersion:2}};
 assert(!fs.readFileSync(path.join(root,'assets/v53-upgrades.js'),'utf8').includes('publicDataOnly=function'));const cached=context.publicDataOnly(data);assert.equal(cached.settings.academicYear,'2026/2027');assert.equal(cached.students.length,0);assert.equal(cached.settings.learningTracks.length,0);assert.equal(cached.settings.learningTracksVersion,2);
 data.settings.learningTracks=[{id:'custom',title:'مسار مخصص',active:true}];assert.equal(context.publicDataOnly(data).settings.learningTracks[0].id,'custom');
});
test('general settings saves cannot overwrite the separately versioned track list from a stale editor',()=>{
 const source=fs.readFileSync(path.join(root,'assets/firebase-sync.js'),'utf8'),match=source.match(/function generalSettingsForWrite\(settings\)\{[^\n]+\}/);assert(match);
 const context={};require('node:vm').createContext(context);require('node:vm').runInContext(match[0],context);
 const input={teacherPhone:'010',coursePrices:{test:300},learningTracks:[{id:'stale'}],learningTracksVersion:1},out=context.generalSettingsForWrite(input);
 assert.equal(out.teacherPhone,'010');assert.equal(out.coursePrices.test,300);assert(!('learningTracks'in out));assert(!('learningTracksVersion'in out));assert.equal(input.learningTracks[0].id,'stale');
 assert(source.includes('settings={...generalSettingsForWrite(data.settings),schemaVersion:54}'));assert(source.includes('platformSettingsDoc.set({...generalSettingsForWrite(settings),schemaVersion:55'));
});

test('Parent monthly access renders one final report and retains the legacy fallback on service failure',async()=>{
 const source=fs.readFileSync(path.join(root,'assets/app.js'),'utf8'),ast=require('acorn').parse(source,{ecmaVersion:'latest'}),fn=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id?.name==='showParentReportByCode');
 const dom=new JSDOM('<main><form id="parentSearchForm"><input name="parentCode"></form><div id="parentResult"></div></main>'),w=dom.window;w.HTMLElement.prototype.scrollIntoView=function(){};
 let oldRenders=0,monthlyRenders=0,fail=false;
 const context={document:w.document,window:{MFCloud:{ready:true,getParentStudent:async()=>({studentCode:'123456',name:'طالب'}),getParentMonthlyReport:()=>{}},TMPortalEntry:{loadAccount:async()=>{}}},console:{warn(){}},lastParentReportMonth:'',lastParentStudent:null,normalizedStudent:x=>x,portalSessionSet(){},LAST_STUDENT_CODE_KEY:'code',clearLegacyPortalCodeFromUrl(){},parentReportHTML:()=>{oldRenders++;return '<p>fallback</p>';},hydrateIcons(){},loadParentMonthlyReport:async()=>{if(fail)throw Error('local failure');monthlyRenders++;w.document.getElementById('parentResult').innerHTML='<p>monthly</p>';},cairoMonthKey:()=> '2026-10',previousMonthKey:()=> '2026-09',toast(){}};
 require('node:vm').createContext(context);require('node:vm').runInContext(source.slice(fn.start,fn.end),context);
 try{await context.showParentReportByCode('123456');assert.equal(monthlyRenders,1);assert.equal(oldRenders,0);fail=true;await context.showParentReportByCode('123456');assert.equal(oldRenders,1);assert(w.document.getElementById('parentResult').textContent.includes('fallback'));}finally{dom.window.close();}
});
