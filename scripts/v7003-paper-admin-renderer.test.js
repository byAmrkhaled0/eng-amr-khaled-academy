'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('production script order keeps paper exam creation in the active admin renderer',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../teacher-login.html'),'utf8');
  assert.ok(html.indexOf('assets/admin.js?')<html.indexOf('assets/v60-admin-workflow.js?'));
  const container={innerHTML:''};
  const paperForm={addEventListener(){},elements:{}};
  const paperStudents={innerHTML:''};
  const document={
    addEventListener(){},
    getElementById(id){
      if(id==='adminContent')return container;
      if(!container.innerHTML.includes('id="paperExamForm"'))return null;
      return id==='paperExamForm'?paperForm:id==='paperExamStudents'?paperStudents:null;
    }
  };
  const sessionStorage={getItem(){return '';},setItem(){},removeItem(){}};
  const context={document,sessionStorage,localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    GRADES:['البرمجة'],hydrateIcons(){},examBuilderCard(){return '';},
    TMResults:{isExamGradePending(){return false;}},console,setTimeout};
  context.window=context;
  vm.createContext(context);
  for(const script of ['assets/admin.js','assets/v60-admin-workflow.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',script),'utf8'),context,{filename:script});
  }
  vm.runInContext("adminData.exams=[]; adminData.settings={}; adminWorkspaceContext=()=>({academicYear:'2026/2027',term:'الترم الأول'}); examGradeRows=()=>[];",context);
  assert.match(context.renderPaperExamPanel(true),/إضافة امتحان ورقي/);
  assert.equal(context.renderPaperExamPanel(false),'');
  context.renderExams();
  assert.match(container.innerHTML,/إضافة اختبار إلكتروني/);
  assert.equal(container.innerHTML.split('إضافة امتحان ورقي').length-1,1);
  const paperButton=container.innerHTML.match(/<button[^>]*onclick="(openPaperExamGrades\(\))"[^>]*>إضافة امتحان ورقي<\/button>/);
  assert.ok(paperButton,'the visible paper button invokes the existing handler');
  vm.runInContext(paperButton[1],context);
  assert.match(container.innerHTML,/إنشاء امتحان ورقي/);
  for(const label of ['اسم الامتحان','تاريخ الامتحان','الدرجة النهائية','المسار','المجموعة','العام الدراسي','الترم','مطلوب'])assert.ok(container.innerHTML.includes(label),label);
  vm.runInContext("adminData.exams=[{id:'paper-1',assessmentMode:'paper',title:'السنتر',totalScore:20},{id:'online-1',title:'الوحدة',duration:20,questionCount:5}]",context);
  context.renderExams();
  const paperCard=container.innerHTML.split('<article class="admin-exam-card').find(card=>card.includes('<h3>السنتر</h3>'));
  assert.ok(paperCard);
  assert.match(paperCard,/ورقي · الدرجة النهائية 20/);
  assert.match(paperCard,/عدد النتائج: 0/);
  assert.match(paperCard,/الدرجات \/ تعديل الدرجات/);
  assert.doesNotMatch(paperCard,/دقيقة|0 سؤال|editLiveExam/);
  assert.match(container.innerHTML,/الوحدة[^]*?20 دقيقة/);
});

let hasJsdom=false;
try{require.resolve('jsdom');hasJsdom=true;}catch{}
test('production DOM: clicking paper exam button opens the existing form', {skip:!hasJsdom}, async()=>{
  const {createAdminDOM}=require('./testing/admin-dom');
  const ui=await createAdminDOM();
  try{
    ui.run('window.renderExams()');
    const paperButtons=[...ui.document.querySelectorAll('#adminContent button')].filter(node=>node.textContent.includes('إضافة امتحان ورقي'));
    assert.equal(paperButtons.length,1);
    const [button]=paperButtons;
    // The DOM harness disables inline scripts; dispatch the production onclick in its VM.
    button.addEventListener('click',()=>ui.run(button.getAttribute('onclick')));
    button.click();
    assert.match(ui.document.querySelector('#adminContent').textContent,/إنشاء امتحان ورقي/);
    assert.ok(ui.document.getElementById('paperExamForm'));
  }finally{await ui.tick();ui.close();}
});
