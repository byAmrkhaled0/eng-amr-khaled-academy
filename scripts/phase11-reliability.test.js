'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createAdminDOM}=require('./testing/admin-dom');
async function fixture(){const dom=await createAdminDOM();dom.run(`adminAttendanceTransfersLoaded=true;adminData.groups[0].days='الأحد والاثنين والثلاثاء والأربعاء والخميس والجمعة والسبت';adminData.students.forEach(st=>{st.attendance=[];});attendanceCloudSnapshots.clear();`);return dom;}
async function mergeCase(serverStatus,queueStatus,serverSession,queueSession){
 const dom=await fixture();try{
  const date=dom.run('attendanceDate'),server={studentCode:'DEMO1',date,status:serverStatus,scheduleId:'demo-group',...(serverSession?{classSessionId:serverSession}:{})};
  dom.window.__server=server;dom.run('adminData.students[0].attendance=[__server];attendanceCloudSnapshots.set(attendanceDate,{attendance:[__server],recitations:[]});');
  dom.window.OfflineAttendance.getQueue=async()=>[{ownerUid:'fixture-admin',studentCode:'DEMO1',date,attendanceStatus:queueStatus,status:'pending',classSessionId:queueSession,preparationId:'prep'}];
  dom.window.OfflineAttendance.getPreparations=async()=>[{ownerUid:'fixture-admin',date,sessionId:queueSession,preparationId:'prep',expiresAt:new Date(Date.now()+86400000).toISOString()}];
  await dom.run('mergeOfflineAttendanceQueue()');assert.equal(server.status,serverStatus);assert.equal(server.classSessionId,serverSession||undefined);
  assert.equal(dom.run('findAttendance(adminData.students[0],attendanceDate).status'),serverStatus);
 }finally{dom.close();}
}
test('A: server present/new survives pending absent/old',()=>mergeCase('present','absent','session-new','session-old'));
test('B: server absent/new survives pending present/old',()=>mergeCase('absent','present','session-new','session-old'));
test('C: server present wins over same-session pending absent',()=>mergeCase('present','absent','session-1','session-1'));
test('E: legacy authoritative server attendance survives old queue',()=>mergeCase('present','absent','','session-old'));
test('D: only valid pending local events may appear without official state',async()=>{
 const dom=await fixture();try{
  const date=dom.run('attendanceDate');let status='pending';
  dom.window.OfflineAttendance.getQueue=async()=>[{ownerUid:'fixture-admin',studentCode:'DEMO1',date,classSessionId:'session-1',status,attendanceStatus:'present',preparationId:'prep'}];
  dom.window.OfflineAttendance.getPreparations=async()=>[{ownerUid:'fixture-admin',date,sessionId:'session-1',preparationId:'prep',expiresAt:new Date(Date.now()+86400000).toISOString()}];
  await dom.run('mergeOfflineAttendanceQueue()');assert.equal(dom.run('adminData.students[0].attendance[0].syncStatus'),'pending');
  for(status of ['synced','failed']){dom.run('adminData.students[0].attendance=[];');await dom.run('mergeOfflineAttendanceQueue()');assert.equal(dom.run('adminData.students[0].attendance.length'),0);}
 }finally{dom.close();}
});
test('F: delayed history cannot override authoritative day',async()=>{
 const dom=await fixture();try{
  let resolve;const date=dom.run('attendanceDate');
  dom.window.MFCloud={ready:true,loadStaffRecords:()=>new Promise(r=>{resolve=r;}),getAttendanceForDate:async()=>({attendance:[{studentCode:'DEMO1',date,status:'present',scheduleId:'demo-group',classSessionId:'session-new'}],recitations:[],homeworks:[],studentTransferRequests:[]})};
  const history=dom.run('hydrateAdminRecords(adminRecordsLoadToken)');dom.run("attendanceCloudDate='';renderAttendance()");await dom.run('attendanceCloudPending');
  resolve({attendance:[{studentCode:'DEMO1',date,status:'absent',classSessionId:'session-old'}],recitations:[],grades:[],homeworks:[],attempts:[],studentTransferRequests:[]});await history;
  assert.equal(dom.run('findAttendance(adminData.students[0],attendanceDate).status'),'present');
 }finally{dom.close();}
});
test('G: server read replaces an initially displayed local pending row',async()=>{
 const dom=await fixture();try{
  const date=dom.run('attendanceDate');
  dom.window.OfflineAttendance.getQueue=async()=>[{ownerUid:'fixture-admin',studentCode:'DEMO1',date,classSessionId:'session-old',status:'pending',attendanceStatus:'absent',preparationId:'prep'}];
  dom.window.OfflineAttendance.getPreparations=async()=>[{ownerUid:'fixture-admin',date,sessionId:'session-old',preparationId:'prep',expiresAt:new Date(Date.now()+86400000).toISOString()}];
  await dom.run('mergeOfflineAttendanceQueue()');assert.equal(dom.run('adminData.students[0].attendance[0].status'),'absent');
  dom.window.MFCloud={ready:true,getAttendanceForDate:async()=>({attendance:[{studentCode:'DEMO1',date,status:'present',scheduleId:'demo-group',classSessionId:'session-new'}],recitations:[],homeworks:[],studentTransferRequests:[]})};
  dom.run("attendanceCloudDate='';renderAttendance()");await dom.run('attendanceCloudPending');
  assert.equal(dom.run('findAttendance(adminData.students[0],attendanceDate).status'),'present');assert.equal(dom.run('findAttendance(adminData.students[0],attendanceDate).classSessionId'),'session-new');
 }finally{dom.close();}
});
test('two valid sessions keep separate states and daily rows; a legacy mirror is not counted again',async()=>{
 const dom=await fixture();try{
  dom.run(`adminData.students[0].attendance=[{studentCode:'DEMO1',date:attendanceDate,status:'present',scheduleId:'demo-group',classSessionId:'session-1'},{studentCode:'DEMO1',date:attendanceDate,status:'absent',scheduleId:'demo-group',classSessionId:'session-2'},{studentCode:'DEMO1',date:attendanceDate,status:'absent'}];`);
  assert.equal(dom.run("findAttendance(adminData.students[0],attendanceDate,'session-2').status"),'absent');assert.equal(dom.run('todayAttendanceRows().length'),2);
 }finally{dom.close();}
});

test('day buttons cannot silently edit a different specific session',async()=>{
 const dom=await fixture();try{
  dom.run("adminData.students[0].attendance=[{studentCode:'DEMO1',date:attendanceDate,status:'present',scheduleId:'demo-group',classSessionId:'custom-session'}]");
  let calls=0;dom.window.MFCloud.upsertAttendance=async()=>{calls++;};
  assert.equal(dom.run("findAttendance(adminData.students[0],attendanceDate,'demo-group_'+attendanceDate)"),undefined);
  assert.match(dom.run('attendanceRosterHTML()'),/حصة محددة/);
  await dom.window.setAttendanceStatus('DEMO1','absent');assert.equal(calls,0);
  assert.equal(dom.run('adminData.students[0].attendance[0].status'),'present');
 }finally{dom.close();}
});
test('expired preparations remove pending previews without modifying official history',async()=>{
 const dom=await fixture();try{
  const date=dom.run('attendanceDate');
  dom.window.OfflineAttendance.getQueue=async()=>[{ownerUid:'fixture-admin',studentCode:'DEMO1',date,classSessionId:'session-1',status:'pending',attendanceStatus:'present',preparationId:'expired'}];
  dom.window.OfflineAttendance.getPreparations=async()=>[{ownerUid:'fixture-admin',date,sessionId:'session-1',preparationId:'expired',expiresAt:new Date(Date.now()-1000).toISOString()}];
  await dom.run('mergeOfflineAttendanceQueue()');assert.equal(dom.run('adminData.students[0].attendance.length'),0);
 }finally{dom.close();}
});
