'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('top attention centre covers the three requested student risks',()=>{
  const admin=read('assets/admin.js'),ui=read('assets/v64-admin-operations.js'),css=read('assets/v674-admin.css');
  assert.match(admin,/id="adminAttentionButton"/);
  assert.match(admin,/id="adminAttentionMobileButton"/);
  assert.match(ui,/missedExamCount/);
  assert.match(ui,/maxAbsenceStreak/);
  assert.match(ui,/missingHomeworkCount/);
  assert.match(ui,/getMotivationLeaderboardAdmin/);
  assert.match(ui,/renderActionAttrs\(type==='booking'\?'goAdminSection':'editStudent'/);
  assert.match(css,/\.admin-attention-panel-v69/);
  assert.match(css,/html\[data-theme="dark"\] \.admin-attention-button-v69\.has-alerts/);
});

test('attention centre shares requests and ignores a late response for another period',async()=>{
  let month='أكتوبر';
  const requests=[];
  const panelBody={innerHTML:''};
  const window={MFCloud:{getMotivationLeaderboardAdmin:({month})=>new Promise(resolve=>requests.push({month,resolve}))}};
  vm.runInNewContext(read('assets/v64-admin-operations.js'),{
    window,
    document:{
      addEventListener(){},
      getElementById(id){return id==='adminAttentionPanelBody'?panelBody:null;}
    },
    adminWorkspaceContext:()=>({academicYear:'2026/2027',month}),
    pendingBookings:()=>[],
    renderActionAttrs:()=>'',
    hydrateIcons(){}
  });

  const october=window.refreshAdminAttentionAlerts();
  const repeated=window.refreshAdminAttentionAlerts(true);
  assert.deepEqual(requests.map(request=>request.month),['أكتوبر']);
  month='نوفمبر';
  const november=window.refreshAdminAttentionAlerts();
  assert.deepEqual(requests.map(request=>request.month),['أكتوبر','نوفمبر']);
  requests[1].resolve([{studentName:'طالب نوفمبر',missingHomeworkCount:1}]);
  assert.equal((await november)[0].studentName,'طالب نوفمبر');
  requests[0].resolve([{studentName:'طالب أكتوبر',missingHomeworkCount:1}]);
  assert.equal((await october).length,0);
  assert.equal((await repeated).length,0);
  assert.match(panelBody.innerHTML,/طالب نوفمبر/);
});

test('student file exposes one chronological activity log without removing detail tabs',()=>{
  const ui=read('assets/v64-admin-operations.js');
  assert.match(ui,/data-profile-view="activity">السجل الكامل/);
  for(const source of ['report.attendance?.rows','report.results?.rows','report.homework?.rows','report.study?.rows','profile.motivationTransactions','profile.monthlyPayments'])assert.ok(ui.includes(source),`${source} must feed the activity log`);
  for(const view of ['summary','info','attendance','results','homework','lectures','payments','motivation'])assert.match(ui,new RegExp(`data-profile-view="${view}"`));
});

test('legacy work-centre links open the focused classroom while navigation remains calm',()=>{
  const admin=read('assets/admin.js');
  assert.match(admin,/adminLegacySectionAliases=\{operations:'classroom'/);
  assert.doesNotMatch(admin,/\['operations','clipboard','مركز العمل'\]/);
  assert.match(admin,/const adminPrimarySections=\['overview','classroom','students','attendance','assignments'\]/);
  assert.match(admin,/admin-context-v69/);
  assert.match(admin,/admin-reveal-card-v69/);
});

test('students with requested alerts are retained even without positive activity',()=>{
  const backend=read('functions/index.js');
  assert.match(backend,/calculatedRows\.filter\(row=>row\.name&&!rankedCodes\.has\(row\.studentCode\)&&\(row\.missedExamCount>0\|\|row\.missingHomeworkCount>0\|\|row\.maxAbsenceStreak>=2\)\)/);
});
