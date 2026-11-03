'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/admin.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8');
const names=['Bookings','Groups','Students','StudentTransferRequests','HomeworkSubmissions','ExamAttempts','MotivationTransactions'];
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture({baseline=false}={}){
 let now=0,next=0,saves=0;const timers=new Map(),frames=[],subscriptions=[],renders=[],toasts=[],storage=new Map();
 const counts={subscriptions:0,unsubscriptions:0,initialSnapshots:0,reads:0,updates:0};
 const rows={Students:[{studentCode:'S1',name:'Synthetic',paid:false}],Groups:[{id:'G1',name:'Synthetic group'}],Bookings:[],StudentTransferRequests:[],HomeworkSubmissions:[],ExamAttempts:[],MotivationTransactions:[]};
 const ctx={adminData:{students:[{studentCode:'S1',name:'Cached',grades:[{score:2}],attendance:[{syncStatus:'pending'}],homeworks:[],recitations:[]}],groups:[{id:'cached-group'}],bookings:[]},
 currentSection:'overview',adminRenderVersion:0,adminLegacySectionAliases:{},attendanceDate:'2026-10-09',attendanceCloudDate:'',attendanceCloudError:null,adminPaymentPeriods:{key:'cached'},
 bookingNotificationUnsubscribe:null,adminGroupsUnsubscribe:null,adminStudentsUnsubscribe:null,adminTransferRequestsUnsubscribe:null,adminHomeworkSubmissionsUnsubscribe:null,adminExamAttemptsUnsubscribe:null,adminMotivationUnsubscribe:null,
 adminAcademicListenersReady:false,bookingListenerReady:false,adminRecordsLoadToken:0,adminAttendanceTransfersLoaded:false,
 navigator:{onLine:true},HTMLElement:class{},document:{activeElement:null,getElementById:()=>({setAttribute(){},removeAttribute(){}})},
 syncAdminChrome(){},setAdminDrawer(){},scrollTo(){},isoDateAdmin:()=> '2026-10-09',stCode:s=>s.studentCode,
 bookingActionPending:new Set(),acceptedBookingCodes:new Set(),updateAdminBookingBadge(){},aToast:m=>toasts.push(m),
 renderSection:()=>renders.push(ctx.currentSection),renderSchedules:()=>renders.push('schedules'),renderBookings:()=>renders.push('bookings'),renderStudentRequests:()=>renders.push('studentRequests'),renderAssignments:()=>renders.push('assignments'),renderExams:()=>renders.push('exams'),
 setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>frames.push(fn),
 staffCacheTimer:null,STORAGE_KEY:'fixture',isStaffWorkspace:()=>true,staffCacheOnly:x=>x,localStorage:{removeItem(){}},sessionStorage:{setItem:(key,value)=>{storage.set(key,value);saves++;}},console
 };
 ctx.window=ctx;ctx.MFCloud={};
 for(const name of names)ctx.MFCloud['subscribeTo'+name]=callback=>{
  const item={name,callback,active:true};subscriptions.push(item);counts.subscriptions++;counts.initialSnapshots++;counts.reads+=rows[name].length;
  callback(plain(rows[name]),[]);
  return()=>{assert.equal(item.active,true,'unsubscribe once');item.active=false;counts.unsubscriptions++;};
 };
 const wrap=source.slice(source.indexOf('function adminLiveSubscription('),source.indexOf('let adminRecordsLoadToken'));
 let live=source.slice(source.indexOf('function startBookingNotifications()'),source.indexOf('function bindNav()'));
 if(baseline)live=live.replace(/adminLiveSubscription\(callback=>window.MFCloud.subscribeTo(\w+)\(callback\),/g,'window.MFCloud.subscribeTo$1(');
 vm.createContext(ctx);
 vm.runInContext(wrap+source.slice(source.indexOf('function stopAdminLiveData()'),source.indexOf('async function cacheOfflineAttendanceRoster()'))+live,ctx);
 vm.runInContext(source.slice(source.indexOf('const adminSections ='),source.indexOf('const adminSectionDescriptions ='))+source.slice(source.indexOf('window.goAdminSection=function'),source.indexOf('function renderAdmin()',source.indexOf('window.goAdminSection=function'))),ctx);
 vm.runInContext(app.slice(app.indexOf('function saveData(data)'),app.indexOf('function bookingFingerprint(')),ctx);
 function advance(ms){now+=ms;for(let iterations=0;iterations<10;iterations++){const due=[...timers].filter(([,v])=>v.at<=now);if(!due.length)break;for(const [id,v]of due){timers.delete(id);v.fn();}}}
 function flush(){frames.splice(0).forEach(fn=>fn());advance(0);}
 return{ctx,rows,subscriptions,counts,renders,toasts,storage,get saves(){return saves;},advance,flush,
 go:id=>{ctx.goAdminSection(id);flush();},stop:()=>ctx.stopAdminLiveData(),
 emit:(name,newRows,changes=[])=>{rows[name]=plain(newRows);for(const item of subscriptions.filter(i=>i.active&&i.name===name)){counts.updates++;counts.reads+=newRows.length;item.callback(plain(newRows),changes);}},
 latest:name=>subscriptions.filter(i=>i.name===name).at(-1),active:()=>subscriptions.filter(i=>i.active).map(i=>i.name)};
}

test('students -> attendance -> settings -> students retains cached shared listeners without extra snapshots',()=>{
 const f=fixture();f.ctx.startBookingNotifications();for(const section of ['students','attendance','settings','students'])f.go(section);
 assert.deepEqual(f.active().sort(),['Bookings','Groups','Students']);assert.equal(f.counts.subscriptions,3);assert.equal(f.counts.unsubscriptions,0);
 assert.equal(f.ctx.adminData.students[0].grades[0].score,2);assert.equal(f.ctx.adminData.students[0].attendance[0].syncStatus,'pending');assert.equal(f.ctx.adminData.groups[0].id,'G1');
});
test('rapid section switching keeps one subscription and render-version guard drops obsolete renders',()=>{
 const f=fixture();for(const section of ['students','attendance','settings','students','payments'])f.ctx.goAdminSection(section);f.flush();
 assert.deepEqual(f.renders.slice(-1),['payments']);assert.equal(f.counts.subscriptions,2);assert.equal(f.counts.unsubscriptions,0);
});
test('repeated same-section navigation never creates duplicate subscriptions',()=>{
 const f=fixture();for(let i=0;i<10;i++)f.go('attendance');assert.equal(f.counts.subscriptions,2);
});
test('payment updates preserve academic/local pending records and invalidate badges',()=>{
 const f=fixture();f.go('payments');f.emit('Students',[{studentCode:'S1',name:'Synthetic',paid:true,paymentAmount:100}]);
 assert.equal(f.ctx.adminData.students[0].paid,true);assert.equal(f.ctx.adminPaymentPeriods.key,'');assert.equal(f.ctx.adminData.students[0].attendance[0].syncStatus,'pending');
});
test('focused edits keep existing render-preservation guard',()=>{
 const f=fixture();f.go('students');f.ctx.document.activeElement=new f.ctx.HTMLElement();f.ctx.document.activeElement.closest=()=>true;
 const before=f.renders.length;f.emit('Students',[{studentCode:'S1',paid:true}]);assert.equal(f.renders.length,before);
});
test('120ms staff save debounce merges multiple live updates into one serialization',()=>{
 const f=fixture();f.go('attendance');f.emit('Students',[{studentCode:'S1',paid:true}]);f.emit('Groups',[{id:'G2'}]);assert.equal(f.saves,0);
 f.advance(119);assert.equal(f.saves,0);f.advance(1);assert.equal(f.saves,1);
});
test('full stop is idempotent, clears handles, and re-login attaches exactly one new generation',()=>{
 const f=fixture();f.ctx.startBookingNotifications();f.go('attendance');f.stop();f.stop();assert.equal(f.counts.unsubscriptions,3);assert.equal(f.active().length,0);
 f.ctx.startBookingNotifications();f.go('attendance');assert.equal(f.active().length,3);assert.equal(f.counts.subscriptions,6);
 assert.match(source,/currentStaff=null;[\s\S]*?stopAdminLiveData\(\);\s*location.reload\(\)/);
});
for(const name of names)test(`callback after unsubscribe cannot mutate data/save/render/notify: ${name}`,()=>{
 const f=fixture();f.ctx.startBookingNotifications();f.go('attendance');f.go('studentRequests');f.go('assignments');f.go('exams');f.go('motivation');
 const callback=f.latest(name).callback;f.stop();f.advance(120);const data=plain(f.ctx.adminData),renders=f.renders.length,saves=f.saves,toasts=f.toasts.length;
 callback([{id:'stale',studentCode:'S1',paid:true,name:'STALE'}],[{type:'added',doc:{id:'stale',data:()=>({studentCode:'S1'})}}]);f.advance(120);
 assert.deepEqual(plain(f.ctx.adminData),data);assert.equal(f.renders.length,renders);assert.equal(f.saves,saves);assert.equal(f.toasts.length,toasts);
});
test('obsolete previous-login student callback cannot corrupt a new login',()=>{
 const f=fixture();f.go('students');const old=f.latest('Students').callback;f.stop();f.go('students');old([{studentCode:'S1',name:'foreign-old'}],[]);
 assert.equal(f.ctx.adminData.students[0].name,'Synthetic');
});
test('booking notification remains global, singleton and independent of section navigation',()=>{
 const f=fixture();f.ctx.startBookingNotifications();f.ctx.startBookingNotifications();f.go('settings');
 f.emit('Bookings',[{id:'B1',code:'B1'}],[{type:'added',doc:{id:'B1',data:()=>({code:'B1',name:'Synthetic booking'})}}]);
 assert.equal(f.counts.subscriptions,1);assert.equal(f.toasts.length,1);assert.equal(f.ctx.adminData.bookings.length,1);
});
test('booking browser notification is delivered once; cancelled queued callback cannot duplicate it',()=>{
 const f=fixture();let browserNotifications=0;
 f.ctx.Notification=class{static permission='granted';constructor(){browserNotifications++;}};f.ctx.localStorage.getItem=()=> '1';
 f.ctx.startBookingNotifications();const callback=f.latest('Bookings').callback;
 const changes=[{type:'added',doc:{id:'B1',data:()=>({code:'B1',name:'Synthetic booking'})}}];
 f.emit('Bookings',[{id:'B1',code:'B1'}],changes);assert.equal(browserNotifications,1);
 f.stop();callback([{id:'B1',code:'B1'}],changes);assert.equal(browserNotifications,1);
});
for(const [section,name,type]of [['assignments','HomeworkSubmissions','homework'],['exams','ExamAttempts','exam'],['motivation','MotivationTransactions','motivation']])test(`${type} notifications retain section ownership and deduplication`,()=>{
 const f=fixture();f.go(section);const changes=[{type:'added',doc:{id:'N1',data:()=>({studentCode:'S1'})}}];
 f.emit(name,[{id:'N1',studentCode:'S1'}],changes);f.emit(name,[{id:'N1',studentCode:'S1'}],changes);
 assert.equal(f.ctx.adminData.adminNotifications.length,1);assert.equal(f.toasts.length,1);f.go('settings');assert.equal(f.latest(name).active,false);
});
test('offline stop preserves prepared roster, queued data and cached groups; online startup has no duplicates',()=>{
 const f=fixture();f.go('attendance');f.ctx.OfflineAttendance={preparations:[{ownerUid:'fixture',id:'prepared'}],queue:[{id:'pending'}]};
 const before=plain(f.ctx.adminData),offline=plain(f.ctx.OfflineAttendance);f.ctx.navigator.onLine=false;f.stop();f.ctx.__adminOfflineMode=true;
 f.go('attendance');f.go('students');assert.equal(f.ctx.currentSection,'attendance');assert.equal(f.active().length,0);
 assert.deepEqual(plain(f.ctx.adminData),before);assert.deepEqual(plain(f.ctx.OfflineAttendance),offline);
 f.ctx.navigator.onLine=true;f.ctx.__adminOfflineMode=false;f.go('attendance');f.go('attendance');assert.equal(f.active().length,2);
});
test('simulated navigation costs justify retaining shared listeners: rapid return never adds reads',()=>{
 const old=fixture({baseline:true}),next=fixture();for(const f of [old,next]){f.go('students');f.go('attendance');f.go('settings');f.emit('Students',[{studentCode:'S1',name:'Updated'}]);f.go('students');f.go('attendance');}
 assert.deepEqual(next.counts,old.counts);assert.deepEqual(next.counts,{subscriptions:2,unsubscriptions:0,initialSnapshots:2,reads:3,updates:1});
 // Immediate detachment would save one inactive update but require two initial
 // snapshots on return in this one-student/one-group workload: 4 vs 3 reads.
 assert.ok(2+2>next.counts.reads);
});
test('executed immediate-detachment alternative increases reads on return: 4 vs 3',()=>{
 const f=fixture();f.go('students');f.go('attendance');f.go('settings');f.stop();
 f.emit('Students',[{studentCode:'S1',name:'Updated'}]);f.go('students');f.go('attendance');
 assert.deepEqual(f.counts,{subscriptions:4,unsubscriptions:2,initialSnapshots:4,reads:4,updates:0});
});
test('immediate detachment with no inactive updates doubles snapshot reads: 4 vs 2',()=>{
 const kept=fixture(),detached=fixture();for(const f of [kept,detached]){f.go('students');f.go('attendance');f.go('settings');}
 detached.stop();for(const f of [kept,detached]){f.go('students');f.go('attendance');}
 assert.equal(kept.counts.reads,2);assert.equal(detached.counts.reads,4);
});
test('dense-update counterexample shows cleanup saving is workload-dependent, not universal',()=>{
 const kept=fixture(),detached=fixture();for(const f of [kept,detached]){f.go('students');f.go('attendance');f.go('settings');}
 detached.stop();for(let i=0;i<10;i++)for(const f of [kept,detached])f.emit('Students',[{studentCode:'S1',name:`Update ${i}`}]);
 for(const f of [kept,detached]){f.go('students');f.go('attendance');}
 assert.equal(kept.counts.reads,12);assert.equal(detached.counts.reads,4);
 assert.equal(kept.counts.updates,10);assert.equal(detached.counts.updates,0);
});
test('measured old queued callback causes serialization/render; patched callback causes neither',()=>{
 const before=fixture({baseline:true}),after=fixture();
 for(const f of [before,after]){f.go('students');const callback=f.latest('Students').callback;f.stop();f.advance(120);f.renders.length=0;const count=f.saves;
 callback([{studentCode:'S1',name:'stale'}],[]);f.advance(120);f.delta={renders:f.renders.length,saves:f.saves-count};}
 assert.deepEqual(before.delta,{renders:1,saves:1});assert.deepEqual(after.delta,{renders:0,saves:0});
});
