'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('live booking listener updates the final attention renderer without a second backend request',async()=>{
  const html=read('teacher-login.html');
  assert.ok(html.indexOf('assets/admin.js?')<html.indexOf('assets/v64-admin-operations.js?'));
  const elements=new Map(),node=id=>{
    if(!elements.has(id))elements.set(id,{id,hidden:id==='adminAttentionPanel'?false:false,innerHTML:'',textContent:'',classList:{toggle(){},add(){},remove(){}}});
    return elements.get(id);
  };
  const document={addEventListener(){},getElementById:node,body:{classList:{toggle(){}}}};
  const context={document,window:null,sessionStorage:{getItem(){return null;}},localStorage:{getItem(){return null;}},
    GRADES:['أساسيات برمجة'],MONTHS:['سبتمبر'],hydrateIcons(){},saveData(){},console,setTimeout,
    navigator:{onLine:true},Intl,Notification:undefined};
  context.window=context;
  vm.createContext(context);
  vm.runInContext(read('assets/admin.js'),context,{filename:'assets/admin.js'});
  vm.runInContext(read('assets/v64-admin-operations.js'),context,{filename:'assets/v64-admin-operations.js'});
  let subscription,reads=0,bookingsPage=0;
  context.MFCloud={subscribeToBookings(callback){subscription=callback;return ()=>{};},getMotivationLeaderboardAdmin:async()=>{reads++;return [{studentCode:'risk-1',studentName:'طالب متابعة',missedExamCount:1}];}};
  context.goAdminSection=section=>{if(section==='bookings')bookingsPage++;};
  vm.runInContext('startBookingNotifications()',context);
  await context.refreshAdminAttentionAlerts();
  assert.equal(reads,1);
  const booking={code:'B-1',name:'محمد اختبار',grade:'أساسيات برمجة',group:'السبت',status:'قيد التسجيل',date:'2026-09-24'};
  subscription([booking,booking],[]);
  const body=node('adminAttentionPanelBody');
  assert.match(body.innerHTML,/حجوزات جديدة/);
  assert.equal(body.innerHTML.split('محمد اختبار').length-1,1);
  assert.match(body.innerHTML,/أساسيات برمجة.*السبت/);
  assert.equal(node('adminAttentionCount').textContent,'2');
  assert.equal(reads,1,'no extra Firebase callable on booking arrival');
  const action=body.innerHTML.match(/onclick="([^"]+)"[^>]*><span class="admin-attention-avatar-v69">م/);
  assert.ok(action);
  vm.runInContext(action[1],context);
  assert.equal(bookingsPage,1);
  node('adminAttentionPanel').hidden=false;
  subscription([{...booking,status:'مرفوض'}],[]);
  assert.doesNotMatch(body.innerHTML,/محمد اختبار|حجوزات جديدة/);
  assert.equal(node('adminAttentionCount').textContent,'1');
  assert.equal(reads,1);
});

test('initial home HTML displays the three supported academic tracks before JavaScript runs',()=>{
  const html=read('index.html'),app=read('assets/app.js');
  const count=html.match(/id="liveCounts"[^]*?<b>(\d+)<\/b>/)?.[1];
  const grades=app.match(/(?:const|var) GRADES\s*=\s*\[([^\]]+)\]/)?.[1];
  assert.equal(count,'3');
  assert.ok(grades);
  assert.equal((grades.match(/['"][^'"]+['"]/g)||[]).length,Number(count));
  assert.doesNotMatch(html,/6<\/b><small>مسارات/);
});

test('production admin script chain renders one booking row in the real DOM and updates the badge',async()=>{
  const {createAdminDOM}=require('./testing/admin-dom');
  const ui=await createAdminDOM();
  try{
    for(const id of ['adminAttentionPanel','adminAttentionPanelBody','adminAttentionCount','adminAttentionButton']){
      if(ui.document.getElementById(id))continue;
      const element=ui.document.createElement('div');element.id=id;ui.document.body.appendChild(element);
    }
    ui.document.getElementById('adminAttentionPanel').hidden=false;
    let subscription,reads=0;
    ui.window.MFCloud.subscribeToBookings=callback=>{subscription=callback;return ()=>{};};
    ui.window.MFCloud.getMotivationLeaderboardAdmin=async()=>{reads++;return [];};
    // The shared attendance fixture disables this live listener; restore its production body.
    ui.run(read('assets/admin.js').split('\n').find(line=>line.startsWith('function startBookingNotifications()')));
    ui.run('bookingNotificationUnsubscribe=null;startBookingNotifications()');
    await ui.window.refreshAdminAttentionAlerts();
    subscription([{code:'B-2',name:'حجز مباشر',status:'قيد التسجيل',grade:'أساسيات برمجة',group:'الجمعة'}],[]);
    assert.equal(ui.document.querySelectorAll('#adminAttentionPanelBody .admin-attention-row-v69').length,1);
    assert.match(ui.document.getElementById('adminAttentionPanelBody').textContent,/حجوزات جديدة.*حجز مباشر/);
    assert.equal(ui.document.getElementById('adminAttentionCount').textContent,'1');
    subscription([{code:'B-2',name:'حجز مباشر',status:'مرفوض'}],[]);
    assert.equal(ui.document.querySelectorAll('#adminAttentionPanelBody .admin-attention-row-v69').length,0);
    assert.equal(reads,1);
  }finally{ui.close();}
});
