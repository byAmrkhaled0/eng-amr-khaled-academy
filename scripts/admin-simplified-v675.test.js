'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('simplified navigation keeps the daily tools visible and every other tool accessible',async()=>{
  const admin=read('assets/admin.js');
  const primary=admin.match(/const adminPrimarySections=\[([^\]]+)\]/)?.[1]||'';
  for(const id of ['overview','classroom','students','attendance','assignments'])assert.match(primary,new RegExp(`'${id}'`));
  for(const id of ['operations','theoryLectures','questionBanks','exams'])assert.doesNotMatch(primary,new RegExp(`'${id}'`));
  assert.match(admin,/function adminNavButtonHtml\(id,label\)/);
  // Workspace B replaces the old all-tools details element. Verify the same
  // access invariant against the rendered production navigation, not a legacy ID.
  const {createAdminDOM}=require('./testing/admin-dom');
  const ui=await createAdminDOM();
  try{
    const map=require('./testing/admin-section-map.json');
    const buttons=[...ui.document.querySelectorAll('#adminNavList [data-admin-nav]')];
    assert.equal(buttons.length,19);
    assert.equal(new Set(buttons.map(button=>button.dataset.adminNav)).size,19);
    assert.deepEqual(buttons.map(button=>button.dataset.adminNav).sort(),Array.from(ui.run('adminSections.map(row=>row[0])')).sort());
    const dispatched=[];ui.window.goAdminSection=id=>dispatched.push(id);
    assert.deepEqual(buttons.map(button=>button.dataset.adminNav).sort(),map.map(row=>row.sectionId).sort());
    const workspaces=[...ui.document.querySelectorAll('[data-admin-workspace]')];
    assert.equal(workspaces.length,8);
    for(const workspace of workspaces){
      workspace.click();
      assert.equal(workspace.getAttribute('aria-expanded'),'true');
      const visible=[...ui.document.querySelectorAll('#adminNavList [data-admin-nav-group]:not([hidden])')];
      assert.equal(visible.length,1);
      assert.equal(visible[0].dataset.adminNavGroup,workspace.dataset.adminWorkspace);
      assert.deepEqual([...visible[0].querySelectorAll('[data-admin-nav]')].map(button=>button.dataset.adminNav).sort(),map.filter(row=>row.workspace===workspace.dataset.adminWorkspace).map(row=>row.sectionId).sort());
      for(const button of visible[0].querySelectorAll('[data-admin-nav]')){
        assert(!button.disabled&&typeof button.onclick==='function');
        button.click();assert.equal(dispatched.at(-1),button.dataset.adminNav);
      }
    }
    assert.equal(dispatched.length,19);
    assert.equal(new Set(dispatched).size,19);
  }finally{ui.close();}
});

test('search reveals matching advanced tools without expanding the default menu permanently',async()=>{
  const {createAdminDOM}=require('./testing/admin-dom');
  const ui=await createAdminDOM();
  try{
    const input=ui.document.getElementById('adminNavSearch');
    const selected=ui.document.querySelector('[data-admin-workspace][aria-expanded="true"]').dataset.adminWorkspace;
    for(const button of ui.document.querySelectorAll('#adminNavList [data-admin-nav]')){
      input.value=button.querySelector('b').textContent;
      input.dispatchEvent(new ui.window.Event('input'));
      assert.equal(button.hidden,false,button.dataset.adminNav);
      assert.equal(button.closest('[data-admin-nav-group]').hidden,false);
    }
    input.dispatchEvent(new ui.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(input.value,'');
    const visible=ui.document.querySelectorAll('#adminNavList [data-admin-nav-group]:not([hidden])');
    assert.equal(visible.length,1);assert.equal(visible[0].dataset.adminNavGroup,selected);
  }finally{ui.close();}
});

test("the simpler dashboard reduces decoration while retaining status and shortcuts",()=>{const css=read('assets/v674-admin.css'),admin=read('assets/admin.js');assert.match(css,/\.admin-workspace-switcher\{display:grid/);assert.match(css,/\.admin-home-utilities\{display:grid;grid-template-columns:repeat\(4/);for(const token of ['class="admin-task-button primary-task"','class="admin-system-note"','class="card admin-reveal-card-v69"','homeReportActions','homeContentActions'])assert(admin.includes(token),token);});
