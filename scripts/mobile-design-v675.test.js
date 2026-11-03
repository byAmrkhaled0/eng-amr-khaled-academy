'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test("the platform has one final mobile-first layer with safe touch targets",()=>{const css=read('assets/v67-learning-hub.css');assert.match(css,/Reference-locked owner/);assert.match(css,/@media\(max-width:700px\)/);assert.match(css,/\.btn\{min-height:44px/);assert.match(css,/font-size:16px/);assert.match(css,/env\(safe-area-inset-bottom,0px\)/);});

test("home, portals and resources keep their content in clearer phone layouts",()=>{const css=read('assets/v67-learning-hub.css');for(const token of ['.hero-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))','.parent-hero-grid-v29{grid-template-columns:1fr','.student-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))','.student-tabbar.tm-compact-tabs{position:fixed;top:auto;bottom:','.resources-grid-v31{grid-template-columns:1fr!important'])assert(css.includes(token),token);});

test('exam and homework controls stay reachable across phone orientations',()=>{
  const css=read('assets/v67-learning-hub.css');
  assert.match(css,/\.exam-box,\.exam-app-shell\{width:100vw!important;height:100dvh!important/);
  assert.match(css,/\.exam-option\{grid-template-columns:22px 30px minmax\(0,1fr\)!important;min-height:58px!important/);
  assert.match(css,/\.exam-navigation #examSubmitBtn\{grid-column:1\/-1\}/);
  assert.match(css,/\.homework-step-navigation\{position:sticky/);
  assert.match(css,/@media\(max-width:760px\) and \(orientation:landscape\) and \(max-height:520px\)/);
});

test('mobile administration exposes daily work first without removing advanced tools',async()=>{
  const css=read('assets/v674-admin.css');
  const admin=read('assets/admin.js');
  assert.match(css,/V67\.5 — phone-first administration/);
  assert.match(css,/\.admin-workspace-switcher>button\{min-height:44px/);
  assert.match(css,/\.admin-command-more>\.admin-command-actions\{position:absolute/);
  assert.match(css,/\.admin-mobile-bottom\{display:grid/);
  // Preserve daily shortcuts and access to every advanced section via the
  // approved mobile drawer instead of requiring the retired all-tools element.
  const {createAdminDOM}=require('./testing/admin-dom');
  const ui=await createAdminDOM();
  try{
    ui.window.innerWidth=390;
    ui.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
    ui.window.toggleAdminDrawer(true);
    assert.equal(ui.document.body.classList.contains('admin-drawer-open'),true);
    assert.equal(ui.document.getElementById('adminSidebar').getAttribute('aria-hidden'),'false');
    assert.equal(ui.document.getElementById('adminSidebar').hasAttribute('inert'),false);
    assert.equal(ui.document.querySelectorAll('#adminNavList [data-admin-nav]').length,19);
    assert.equal(ui.document.querySelectorAll('[data-admin-workspace]').length,8);
    for(const button of ui.document.querySelectorAll('[data-admin-workspace]')){
      button.click();
      assert.equal(button.getAttribute('aria-expanded'),'true');
      const visible=ui.document.querySelectorAll('#adminNavList [data-admin-nav-group]:not([hidden])');
      assert.equal(visible.length,1);assert.equal(visible[0].dataset.adminNavGroup,button.dataset.adminWorkspace);
    }
    ui.window.toggleAdminDrawer(false);
    assert.equal(ui.document.body.classList.contains('admin-drawer-open'),false);
    assert.equal(ui.document.getElementById('adminSidebar').getAttribute('aria-hidden'),'true');
    assert(ui.document.getElementById('adminSidebar').hasAttribute('inert'));
    ui.window.toggleAdminDrawer(true);
    ui.document.dispatchEvent(new ui.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(ui.document.body.classList.contains('admin-drawer-open'),false);
    assert.equal(ui.document.getElementById('adminSidebar').getAttribute('aria-hidden'),'true');
    assert(ui.document.getElementById('adminSidebar').hasAttribute('inert'));
  }finally{ui.close();}
  assert.match(admin,/const adminPrimarySections=\['overview','classroom','students','attendance','assignments'\]/);
  assert.match(admin,/admin-mobile-alert-v69/);
});
