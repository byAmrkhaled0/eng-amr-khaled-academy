'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdminDOM}=require('./testing/admin-dom'),{cascade,contrast}=require('./testing/css-cascade');
test('full production CSS cascade keeps sidebar labels readable and attendance controls independent at four widths',async()=>{
 const ui=await createAdminDOM();
 try{
  for(const theme of ['light','dark'])for(const width of [360,390,768,1440]){
   ui.document.documentElement.dataset.theme=theme;const style=cascade({width});
   for(const selector of ['.admin-nav-copy b','.admin-staff-card b','.admin-staff-card small']){
    const node=ui.document.querySelector(selector);assert(node,selector);const color=style(node).color;
    for(const bg of ['#07182e','#0a2442','#0c2d50'])assert(contrast(color,bg)>=4.5,`${theme}/${width} ${selector}: ${color} on ${bg}`);
   }
   assert.equal(style(ui.document.querySelector('.admin-nav-search input')).background,'transparent');
   const attendance=ui.document.querySelector('.attendance-control-card');assert(attendance);
   assert.equal(style(attendance).display,'grid');assert.equal(style(attendance)['grid-template-columns'],'minmax(0,1fr)');
   const actions=ui.document.querySelector('.attendance-actions');assert(actions);
   if(width<=650)assert.equal(style(actions)['grid-template-columns'],'minmax(0,1fr)');
  }
 }finally{ui.close();}
});
