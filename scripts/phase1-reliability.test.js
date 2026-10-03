'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {attendanceDateInWindow,attendanceDayDecision}=require('../functions/lib/attendance-domain');
const {createAdminDOM}=require('./testing/admin-dom');
const read=file=>fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');

test('offline preparation uses inclusive Cairo calendar boundaries, including both sides of midnight',()=>{
  for(const now of ['2026-09-29T20:59:59Z','2026-09-29T21:00:00Z','2026-09-30T20:59:59Z','2026-09-30T21:00:00Z','2026-12-31T22:00:00Z']){
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
    for(const delta of [0,-1,1,-7,7,-8,8]){
      const date=new Date(Date.parse(today+'T00:00:00Z')+delta*86400000).toISOString().slice(0,10);
      assert.equal(attendanceDateInWindow(date,new Date(now)),Math.abs(delta)<=7,`${now}: ${delta}`);
    }
  }
  for(const invalid of ['2026-02-30','2026-13-01','2026-00-00','bad'])assert.equal(attendanceDateInWindow(invalid),false);
  assert.equal(attendanceDayDecision('الأربعاء','2026-02-30').allowed,false);
  assert.equal(attendanceDayDecision('الثلاثاء والجمعة','2026-09-23').allowed,false);
});

test('all admin bundle requests start before any load finishes, while retaining ordered classic execution',async()=>{
  const source=read('assets/admin-entry.js'),start=source.indexOf('  const loadBundles='),end=source.indexOf('  const openWorkspace=',start);
  const appended=[],originals=Array.from({length:15},(_,i)=>({src:`bundle-${i}.js`,getAttribute:()=>`bundle-${i}.js`}));
  const context={window:{},bundle:{content:{querySelectorAll:()=>originals}},bundlePromise:null,Event:class{},document:{createElement:()=>({}),body:{appendChild:s=>appended.push(s)},dispatchEvent:()=>{}}};
  vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.load=loadBundles;',context);
  const pending=context.load();assert.equal(appended.length,15);
  assert.deepEqual(appended.map(s=>s.src),originals.map(s=>s.src));assert.ok(appended.every(s=>s.async===false));
  assert.equal(context.load(),pending);for(const s of appended)s.onload();await pending;
});

test('shell reads four core collections plus settings; deferred content reads only five inactive collections',async()=>{
  const source=read('assets/firebase-sync.js'),start=source.indexOf('    async function loadStaffCoreCollections('),end=source.indexOf('    async function loadStaffRecordCollections(',start);
  const queries=[],context={getDocs:async name=>{queries.push(name);return [];},getSettings:async()=>{queries.push('settings');return {};},normalizedStudent:x=>x,cleanDocId:x=>x,normalizeCode:x=>x,seedFingerprint:()=>{}};
  vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.load=loadStaffCoreCollections;',context);
  await context.load({shell:true});assert.deepEqual(queries.sort(),['bookings','groups','payments','settings','students'].sort());
  queries.length=0;await context.load({deferredOnly:true});assert.deepEqual(queries.sort(),['assignments','exams','materials','questions','reviews'].sort());
});

test('attendance scope reads are bounded and force server data, with overflow rejected',async()=>{
  const source=read('assets/firebase-sync.js'),start=source.indexOf('    async function getAttendanceForDate('),end=source.indexOf('    async function logActivity',start),reads=[];
  let overflow=false;
  const context={db:{collection:name=>{let date,limit;const q={where(field,op,value){assert.equal(field,'date');assert.equal(op,'==');date=value;return q;},limit(value){limit=value;return q;},async get(options){reads.push({name,date,limit,options});return {size:overflow?501:0,docs:[]};}};return q;}}};
  vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.load=getAttendanceForDate;',context);
  await context.load('2026-09-30','all','all',{workspace:true,transfersLoaded:false});
  assert.equal(reads.length,4);assert.ok(reads.every(r=>r.limit===501&&r.options.source==='server'));
  assert.ok(reads.filter(r=>r.name!=='student_transfer_requests').every(r=>r.date==='2026-09-30'));
  reads.length=0;await context.load('2026-09-30','all','all',{workspace:true,transfersLoaded:true});assert.equal(reads.length,3);
  overflow=true;await assert.rejects(context.load('2026-09-30'),/حد العرض/);
});

async function setupDay(dom){
  dom.run(`adminData.groups[0].days='الأحد والاثنين والثلاثاء والأربعاء والخميس والجمعة والسبت';adminData.students.forEach(st=>{st.attendance=[];st.recitations=[];});attendanceCloudDate='';attendanceCloudError=null;adminAttendanceTransfersLoaded=false;`);
}

test('second independent workspace waits for shared persisted attendance and keeps selected filters',async()=>{
  const laptop=await createAdminDOM(),mobile=await createAdminDOM();
  try{
    await setupDay(laptop);await setupDay(mobile);
    // Shared server fixture represents the completed first-device canonical write.
    const day=laptop.run('attendanceDate'),record={id:`DEMO1_demo-group_${day}`,studentCode:'DEMO1',scheduleId:'demo-group',classSessionId:`demo-group_${day}`,date:day,status:'present'};
    const server=new Map();
    laptop.window.MFCloud={ready:true,upsertAttendance:async row=>{server.set(record.id,{...row,...record});return server.get(record.id);},getAttendanceForDate:async()=>({attendance:[],recitations:[],studentTransferRequests:[]})};
    laptop.run("adminAttendanceTransfersLoaded=true;");
    await laptop.run("saveAttendanceRecord(adminData.students[0],'present','manual_button')");
    let resolve;
    mobile.window.MFCloud={ready:true,getAttendanceForDate:()=>new Promise(r=>{resolve=r;})};
    mobile.window.sessionStorage.setItem('attGrade',mobile.run('GRADES[0]'));mobile.window.sessionStorage.setItem('attGroup','مجموعة تجريبية');
    mobile.run('renderAttendance()');
    assert.match(mobile.document.getElementById('adminContent').textContent,/جاري تحميل حضور الحصة/);
    assert.equal(mobile.document.querySelector('.attendance-roster-card'),null);
    // Focusing a control must not prevent the completed scope render.
    mobile.document.body.tabIndex=0;mobile.document.body.focus();
    resolve({attendance:[...server.values()],recitations:[],studentTransferRequests:[]});await mobile.run('attendanceCloudPending');await mobile.tick(20);
    assert.equal(mobile.run("findAttendance(adminData.students[0],attendanceDate).status"),'present');
    assert.ok(mobile.document.querySelector('.attendance-roster-card'));
    assert.equal(mobile.document.getElementById('attendanceGroup').value,'مجموعة تجريبية');
    assert.equal(mobile.run('todayAttendanceRows().length'),1);
  }finally{laptop.close();mobile.close();}
});

test('failed attendance reads block mutations, display retry, and never show an empty roster',async()=>{
  const dom=await createAdminDOM();try{
    await setupDay(dom);dom.window.MFCloud={ready:true,getAttendanceForDate:async()=>{throw new Error('offline server');}};
    dom.run('renderAttendance()');await dom.run('attendanceCloudPending');
    assert.match(dom.document.getElementById('adminContent').textContent,/تعذر قراءة حضور/);assert.equal(dom.document.querySelector('.attendance-roster-card'),null);
    assert.ok(dom.document.querySelector('#adminContent button'));
    dom.window.MFCloud.getAttendanceForDate=async()=>({attendance:[],recitations:[],studentTransferRequests:[]});dom.run('attendanceCloudError=null;renderAttendance()');await dom.run('attendanceCloudPending');
    assert.ok(dom.document.querySelector('.attendance-roster-card'));
  }finally{dom.close();}
});

test('a later historical hydration cannot erase a newer day status',async()=>{
  const dom=await createAdminDOM();try{
    await setupDay(dom);let resolve;
    dom.window.MFCloud={ready:true,loadStaffRecords:()=>new Promise(r=>{resolve=r;}),getAttendanceForDate:async()=>({attendance:[{studentCode:'DEMO1',date:dom.run('attendanceDate'),status:'present'}],recitations:[],studentTransferRequests:[]})};
    const hydration=dom.run('hydrateAdminRecords(adminRecordsLoadToken)');dom.run('renderAttendance()');await dom.run('attendanceCloudPending');
    resolve({attendance:[],grades:[],attempts:[],recitations:[],homeworks:[],studentTransferRequests:[]});await hydration;
    assert.equal(dom.run('findAttendance(adminData.students[0],attendanceDate).status'),'present');
  }finally{dom.close();}
});

test('an old offline queue entry never overrides the authoritative server status',async()=>{
  const dom=await createAdminDOM();try{
    await setupDay(dom);const date=dom.run('attendanceDate');
    dom.window.OfflineAttendance.getQueue=async()=>[{ownerUid:'fixture-admin',studentCode:'DEMO1',date,attendanceStatus:'absent',status:'synced',classSessionId:`demo-group_${date}`}];
    dom.window.MFCloud={ready:true,getAttendanceForDate:async()=>({attendance:[{studentCode:'DEMO1',date,status:'present',scheduleId:'demo-group',classSessionId:`demo-group_${date}`}],recitations:[],studentTransferRequests:[]})};
    dom.run('renderAttendance()');await dom.run('attendanceCloudPending');
    assert.equal(dom.run('findAttendance(adminData.students[0],attendanceDate).status'),'present');
  }finally{dom.close();}
});

test('session attendance takes precedence over an older day-only legacy duplicate',async()=>{
  const dom=await createAdminDOM();try{
    dom.run(`adminAttendanceTransfersLoaded=true;adminData.students[0].attendance=[{date:attendanceDate,status:'absent'},{date:attendanceDate,status:'present',scheduleId:'demo-group',classSessionId:'demo-group_'+attendanceDate}];`);
    assert.equal(dom.run('findAttendance(adminData.students[0],attendanceDate).status'),'present');
  }finally{dom.close();}
});

test('cloud reload does not schedule historical scans; content is fetched once when its section opens',async()=>{
  const dom=await createAdminDOM();try{
    const shell=JSON.parse(dom.run('JSON.stringify(adminData)'));let contentReads=0,recordReads=0,resolve;
    dom.window.MFCloud={ready:true,loadSiteData:async opts=>{assert.equal(opts.shell,true);return shell;},loadStaffRecords:async()=>{recordReads++;return {attendance:[],recitations:[],grades:[],homeworks:[],attempts:[],studentTransferRequests:[]};},loadStaffContent:()=>{contentReads++;return new Promise(r=>{resolve=r;});}};
    await dom.run('reloadFromCloud()');await dom.tick(650);assert.equal(recordReads,0);assert.equal(contentReads,0);
    dom.run("currentSection='theoryLectures';renderSection();renderSection();");assert.equal(contentReads,1);assert.match(dom.document.getElementById('adminContent').textContent,/جاري تحميل محتوى/);
    resolve({materials:[],questions:[],exams:[],reviews:[],assignments:[]});await dom.run('adminContentPromise');
    dom.run("currentSection='curriculum';renderSection();");assert.equal(contentReads,1);assert.equal(recordReads,0);
    dom.run("currentSection='students';renderSection();");await dom.run('adminRecordsPromise');assert.equal(recordReads,1);
    dom.run('renderSection()');assert.equal(recordReads,1);
  }finally{dom.close();}
});

test('prepareOfflineAttendance enforces calendar boundaries before any group read',async()=>{
  const source=read('functions/index.js'),start=source.indexOf('exports.prepareOfflineAttendance ='),end=source.indexOf('async function commitAttendanceOnce(',start);
  let readCount=0;
  const context={exports:{},CALLABLE_OPTIONS:{},onCall:(_opts,fn)=>fn,requireStaff:async()=>({uid:'admin'}),cleanDocId:x=>x,text:x=>String(x||''),attendanceDateInWindow:date=>attendanceDateInWindow(date,new Date('2026-09-30T20:59:59Z')),HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}},db:{collection:()=>({doc:()=>({get:async()=>{readCount++;throw new Error('GROUP_READ');}})})}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  for(const [date,valid] of [['2026-09-30',true],['2026-09-29',true],['2026-09-23',true],['2026-10-07',true],['2026-09-22',false],['2026-10-08',false],['2026-02-30',false]]){
    const before=readCount;
    await assert.rejects(context.exports.prepareOfflineAttendance({data:{scheduleId:'group',date}}),error=>valid?error.message==='GROUP_READ':error.code==='invalid-argument');
    assert.equal(readCount-before,valid?1:0);
  }
});

test('the attendance workspace loads persisted practical and class-homework marks for the same day',async()=>{
  const dom=await createAdminDOM();try{
    await setupDay(dom);const date=dom.run('attendanceDate');
    dom.window.MFCloud={ready:true,getAttendanceForDate:async()=>({attendance:[],recitations:[{studentCode:'DEMO1',date,completed:true,approved:true}],homeworks:[{studentCode:'DEMO1',date,type:'homework',method:'teacher_class_check',completed:true,approved:true}],studentTransferRequests:[]})};
    dom.run('renderAttendance()');await dom.run('attendanceCloudPending');
    assert.ok(dom.run("findClassProgress(adminData.students[0],'recitation')"));
    assert.ok(dom.run("findClassProgress(adminData.students[0],'homework')"));
  }finally{dom.close();}
});

test('late content success or failure does not overwrite another active section',async()=>{
  for(const success of [true,false]){
    const dom=await createAdminDOM();try{
      let resolve,reject;dom.window.MFCloud={ready:true,loadStaffContent:()=>new Promise((r,j)=>{resolve=r;reject=j;})};
      dom.run("adminContentReady=false;currentSection='theoryLectures';renderSection();");const pending=dom.run('adminContentPromise');
      dom.run("currentSection='bookings';renderSection();");const before=dom.document.getElementById('adminContent').innerHTML;
      if(success)resolve({materials:[],questions:[],exams:[],reviews:[],assignments:[]});else reject(new Error('content unavailable'));
      await pending;assert.equal(dom.document.getElementById('adminContent').innerHTML,before);
    }finally{dom.close();}
  }
});

test('quick attendance scope loading leaves the students workspace visible',async()=>{
  const dom=await createAdminDOM();try{
    let resolve;dom.window.MFCloud={ready:true,getAttendanceForDate:()=>new Promise(r=>{resolve=r;})};
    dom.run("currentSection='students';adminRecordsReady=true;renderSection();attendanceCloudDate='';");const before=dom.document.getElementById('adminContent').innerHTML;
    dom.run('ensureAttendanceCloudDay()');assert.equal(dom.document.getElementById('adminContent').innerHTML,before);
    resolve({attendance:[],recitations:[],homeworks:[],studentTransferRequests:[]});await dom.run('attendanceCloudPending');
  }finally{dom.close();}
});
