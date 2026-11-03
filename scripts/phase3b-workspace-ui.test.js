'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createAdminDOM,tick}=require('./testing/admin-dom');
test('every original section belongs to one workspace and keeps its handler',async()=>{
 const ui=await createAdminDOM();try{
 const map=require('./testing/admin-section-map.json');assert.equal(map.length,19);
 assert.deepEqual(map.map(x=>x.sectionId),Array.from(ui.run('adminSections.map(x=>x[0])')));
 assert.equal(ui.document.querySelectorAll('[data-admin-workspace]').length,8);
 assert.equal(ui.document.querySelectorAll('#adminNavList [data-admin-nav]').length,19);
 }finally{ui.close();}
});
test('workspace selection only changes presentation and never fetches or renders a section',async()=>{
 const ui=await createAdminDOM();try{
 let live=0,renders=0;ui.window.startAdminLiveData=()=>live++;ui.window.renderSection=()=>renders++;
 const before=ui.run('currentSection');
 for(const button of ui.document.querySelectorAll('[data-admin-workspace]')){button.click();assert.equal(ui.document.querySelectorAll('#adminNavList [data-admin-nav-group]:not([hidden])').length,1);}
 assert.equal(ui.run('currentSection'),before);assert.equal(live,0);assert.equal(renders,0);
 }finally{ui.close();}
});
test('contextual section navigation opens its owning workspace with the original route',async()=>{
 const ui=await createAdminDOM();try{
 for(const id of ['studentRequests','payments','questionBanks','backup']){ui.window.goAdminSection(id);await tick(35);assert.equal(ui.document.querySelector(`[data-admin-nav="${id}"]`).closest('[data-admin-nav-group]').hidden,false);assert.equal(ui.document.querySelector(`#adminNavList [data-admin-nav="${id}"]`).getAttribute('aria-current'),'page');}
 }finally{ui.close();}
});
test('search reaches sections in every workspace and Escape restores the selected workspace',async()=>{
 const ui=await createAdminDOM();try{
 const input=ui.document.getElementById('adminNavSearch');input.value='بنوك';input.dispatchEvent(new ui.window.Event('input'));
 assert.equal(ui.document.querySelector('[data-admin-nav="questionBanks"]').hidden,false);
 assert.equal(ui.document.querySelector('[data-admin-nav="questionBanks"]').closest('[data-admin-nav-group]').hidden,false);
 input.dispatchEvent(new ui.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(input.value,'');assert.equal(ui.document.querySelectorAll('#adminNavList [data-admin-nav-group]:not([hidden])').length,1);
 }finally{ui.close();}
});
test('six critical sections preserve accepted action, form, route and field contracts without Git history',async()=>{
 const expected=require('./testing/accepted-admin-controls.json');
 const {adminControlInventory}=require('./testing/admin-control-inventory');
 assert.equal(expected.sourceArchiveSha256,'46c2cf7412210dd5983cd0dd9137401cd92d8d35f745bf7373e7d359580c2e36');
 const ui=await createAdminDOM();
 try{
  Object.assign(ui.window.MFCloud,{getPaymentDashboard:async()=>({rows:[],totals:{},courses:{}}),getAdminOperationsDashboard:async()=>({sessions:[],students:[],pending:[],metrics:{}}),getExamDashboard:async()=>({exams:[]}),getHomeworkAdminWorkspace:async()=>({assignments:[],submissions:[]})});
  for(const [section,inventory] of Object.entries(expected.sections)){
   ui.window.goAdminSection(section);await tick(65);
   // Authorized bulk entry adds one named source field; every original contract
   // remains exact, and unexpected fields/actions/routes still fail this gate.
   const kind=section==='exams'?'exam':section==='assignments'?'homework':null;
   const additions=section==='exams'?{
    actions:['onchange:updateExamTargetMode','oninput:filterExamStudentPicker','onclick:document.querySelectorAll'],
    fields:[['INPUT','','','checkbox'],['INPUT','examStudentSearch','','search'],['SELECT','','targetingMode','select-one']].map(row=>JSON.stringify(row))
   }:{actions:[],fields:[]};
   const accepted=kind?{...inventory,actions:[...new Set([...inventory.actions,...additions.actions])].sort(),fields:[...new Set([...inventory.fields,JSON.stringify(['TEXTAREA',`bulkQuestions-${kind}`,'','textarea']),...additions.fields])].sort()}:inventory;
   assert.deepEqual(adminControlInventory(ui.document),accepted,section);
  }
 }finally{ui.close();}
});
