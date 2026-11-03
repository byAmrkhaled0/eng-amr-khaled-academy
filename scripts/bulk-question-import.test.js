'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdminDOM}=require('./testing/admin-dom');
const sample='1. ناتج جمع 2 و3؟\nأ) 4\nب) 5\nج) 6\nد) 7\nالإجابة: ب\nالدرجة: 1\n\n2. لغة المتصفح؟\nأ) JavaScript\nب) Python\nج) C++\nد) Java\nالإجابة: أ\nالدرجة: 2';
function setup(ui,kind='exam'){
 ui.window[kind==='exam'?'renderExams':'renderAssignments']();
 const panel=ui.document.querySelector(`[data-bulk-import="${kind}"]`);assert.ok(panel);panel.open=true;
 return {panel,source:panel.querySelector('[data-bulk-source]'),analyse:panel.querySelector('[data-bulk-analyse]'),apply:panel.querySelector('[data-bulk-apply]'),list:ui.document.getElementById(kind==='exam'?'examQuestionsBuilder':'homeworkQuestionsBuilder')};
}
function analyse(view,text=sample){view.source.value=text;view.analyse.click();}
test('exam import previews and edits safely, then uses existing serializer and draft without publishing',async()=>{
 const ui=await createAdminDOM();try{
 let calls=0;ui.window.MFCloud.saveContent=async()=>{calls++;};const v=setup(ui);analyse(v);
 assert.equal(v.list.children.length,1);assert.equal(v.panel.querySelectorAll('.bulk-question-preview').length,2);assert.equal(v.apply.disabled,false);
 const title=v.panel.querySelector('[data-bulk-title]');title.value='عنوان بعد المراجعة';title.dispatchEvent(new ui.window.Event('input',{bubbles:true}));
 v.apply.click();v.apply.click();assert.equal(v.list.children.length,2);assert.equal(ui.document.getElementById('examCalculatedTotal').textContent,'3');
 const text=ui.run('serializeExamQuestions()');assert.match(text,/عنوان بعد المراجعة/);assert.match(text,/الإجابة: ب/);assert.match(text,/الإجابة: أ/);assert.equal(calls,0);
 assert.equal(v.panel.open,false);assert.equal(v.source.value,'');assert.ok(ui.window.localStorage.getItem('tm-admin-builder-draft-v1:exam'));
 assert.ok(ui.document.querySelector('[onclick="addExamQuestion()"]'));assert.ok(ui.document.querySelector('#examFormV6061 [type="submit"]'));assert.deepEqual(ui.errors.map(e=>e.message),[]);
 }finally{await ui.tick(350);ui.close();}
});
test('homework imports correct indices, preserves existing written question, and restores imported draft',async()=>{
 const ui=await createAdminDOM();try{
 const v=setup(ui,'homework'),card=v.list.firstElementChild,type=card.querySelector('[data-homework-type]');type.value='text';ui.window.updateHomeworkQuestionType(type);card.querySelector('[data-homework-text]').value='سؤال سابق';
 analyse(v);v.apply.click();assert.equal(v.list.children.length,3);assert.equal(v.list.firstElementChild,card);assert.equal(v.list.children[1].querySelector('[data-homework-correct]').value,'1');assert.equal(v.list.children[2].querySelector('[data-homework-correct]').value,'0');
 ui.window.renderAssignments();assert.equal(ui.document.querySelectorAll('[data-homework-question]').length,3);assert.equal(ui.document.querySelector('[data-homework-text]').value,'سؤال سابق');
 }finally{await ui.tick(350);ui.close();}
});
test('invalid input never modifies existing rows and missing fields can be fixed in preview',async()=>{
 const ui=await createAdminDOM();try{
 const v=setup(ui);analyse(v,'1. سؤال؟\nأ) أول\nب) ثاني\nالإجابة: ز\nالدرجة: -1');assert.equal(v.apply.disabled,true);v.apply.click();assert.equal(v.list.children.length,1);
 const preview=v.panel.querySelector('.bulk-question-preview');for(const [i,text] of [[2,'ثالث'],[3,'رابع']]){const input=preview.querySelector(`[data-bulk-option="${i}"]`);input.value=text;input.dispatchEvent(new ui.window.Event('input'));}
 const answer=preview.querySelector('[data-bulk-answer]');answer.value='0';answer.dispatchEvent(new ui.window.Event('change'));const mark=preview.querySelector('[data-bulk-mark]');mark.value='1.25';mark.dispatchEvent(new ui.window.Event('input'));assert.equal(v.apply.disabled,false);
 v.source.value+='\nشيء جديد';v.source.dispatchEvent(new ui.window.Event('input'));assert.equal(v.apply.disabled,true);assert.equal(v.panel.querySelectorAll('.bulk-question-preview').length,0);
 }finally{await ui.tick(350);ui.close();}
});
test('Arabic numerals and Latin choices work without blank separators; ambiguous lines and repeated choices block import',async()=>{
 const ui=await createAdminDOM();try{
 const v=setup(ui);analyse(v,sample.replace('1.','١.').replace('2.','٢.').replace(/\n\n/g,'\n').replace('الإجابة: ب','الإجابة: B').replace('الدرجة: 2','الدرجة: ٢'));assert.equal(v.apply.disabled,false);
 analyse(v,sample+'\nسطر غير مفهوم');assert.equal(v.apply.disabled,true);assert.match(v.panel.textContent,/سطر غير مفهوم/);
 analyse(v,sample+'\nأ) مكرر');assert.equal(v.apply.disabled,true);assert.match(v.panel.textContent,/اختيار مكرر/);
 }finally{await ui.tick(350);ui.close();}
});
test('HTML is always treated as text, cancel/reset never removes questions, and limits are enforced',async()=>{
 const ui=await createAdminDOM();try{
 const v=setup(ui);analyse(v,sample.replace('ناتج جمع 2 و3؟','<img src=x onerror=alert(1)>'));assert.equal(v.panel.querySelector('img'),null);assert.match(v.panel.querySelector('[data-bulk-title]').value,/<img/);v.panel.querySelector('[data-bulk-cancel]').click();assert.equal(v.list.children.length,1);assert.equal(v.source.value,'');
 analyse(v);v.panel.closest('form').reset();assert.equal(v.apply.disabled,true);
 analyse(v,'x'.repeat(200001));assert.equal(v.apply.disabled,true);assert.match(v.panel.textContent,/200 ألف/);
 const one=sample.split('\n\n')[0];analyse(v,Array.from({length:201},(_,i)=>one.replace(/^1\./,(i+1)+'.')).join('\n'));assert.equal(v.apply.disabled,true);assert.equal(v.list.children.length,1);
 }finally{await ui.tick(350);ui.close();}
});
test('existing answer/mark/model is never discarded as an empty placeholder; total homework limit is atomic',async()=>{
 const ui=await createAdminDOM();try{
 const v=setup(ui,'homework');v.list.firstElementChild.querySelector('[data-homework-mark]').value='2';analyse(v);v.apply.click();assert.equal(v.list.children.length,3);
 const first=v.list.firstElementChild;while(v.list.children.length<100)v.list.append(first.cloneNode(true));analyse(v);v.apply.click();assert.equal(v.list.children.length,100);assert.match(v.panel.querySelector('[data-bulk-status]').textContent,/أكبر من 100/);
 }finally{await ui.tick(350);ui.close();}
});
