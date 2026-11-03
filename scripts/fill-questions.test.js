'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {gradeFillAnswer}=require('../functions/lib/fill-answer');
const {publicHomeworkProjection}=require('../functions/lib/homework-domain');
const {createAdminDOM}=require('./testing/admin-dom');
test('fill grading accepts declared alternatives only; whitespace/case/numerals normalize without fuzzy grading',()=>{
 for(const value of ['python',' PYTHON ','\nPython\t'])assert.equal(gradeFillAnswer(value,'بايثون | Python'),true);
 assert.equal(gradeFillAnswer(' ٢٤ ','24'),true);assert.equal(gradeFillAnswer('۲۴','24'),true);
 assert.equal(gradeFillAnswer('a   b','a b'),true);assert.equal(gradeFillAnswer('ab','a b'),false);
 assert.equal(gradeFillAnswer('اجابة','إجابة'),false);assert.equal(gradeFillAnswer('wrong','answer'),false);
 assert.equal(gradeFillAnswer('','answer'),false);assert.equal(gradeFillAnswer('x',' | \n'),null);
});
test('fill exam builder round-trips multiple accepted answers, retains drafts and renders a written student answer',async()=>{
 const ui=await createAdminDOM();try{
 ui.window.renderExams();const card=ui.document.querySelector('[data-exam-question]'),type=card.querySelector('[data-question-type]');type.value='fill';ui.window.updateExamQuestionType(type);
 card.querySelector('[data-question-text]').value='لغة البرمجة هي ____';const model=card.querySelector('[data-question-model]');assert.equal(model.required,true);model.value='Python\nبايثون';
 const serialized=ui.run('serializeExamQuestions()');assert.match(serialized,/النوع: fill/);assert.match(serialized,/Python \| بايثون/);
 ui.window.FILL_TEXT=serialized;const parsed=ui.run('parseExamQuestions(window.FILL_TEXT)');assert.equal(parsed[0].type,'fill');assert.equal(parsed[0].modelAnswer,'Python | بايثون');
 const html=ui.run('renderExamQuestionHtml({type:"fill",question:"أكمل ____",mark:2},0)');assert.match(html,/<textarea/);assert.match(html,/أكمل الفراغ/);assert.doesNotMatch(html,/Python/);
 model.value=' | ';assert.equal(ui.run('serializeExamQuestions()'),'');model.value='Python\nبايثون';model.dispatchEvent(new ui.window.Event('input',{bubbles:true}));await ui.tick(300);ui.window.renderExams();assert.equal(ui.document.querySelector('[data-question-type]').value,'fill');assert.equal(ui.document.querySelector('[data-question-model]').value,'Python\nبايثون');
 }finally{await ui.tick(350);ui.close();}
});
test('homework fill is a real builder type, required key and public written field with no answer key',async()=>{
 const ui=await createAdminDOM();try{
 ui.window.renderAssignments();const card=ui.document.querySelector('[data-homework-question]'),type=card.querySelector('[data-homework-type]');type.value='fill';ui.window.updateHomeworkQuestionType(type);
 assert.equal(card.querySelector('[data-homework-auto]').hidden,true);assert.equal(card.querySelector('[data-homework-model]').required,true);
 const html=ui.run('homeworkQuestionHtml({type:"fill",question:"أكمل ____",mark:3},0)');assert.match(html,/أكمل الفراغ بإجابتك/);assert.match(html,/<textarea/);assert.doesNotMatch(html,/type="radio"/);
 const projected=publicHomeworkProjection({score:null,needsManualReview:true,answers:[{type:'fill',answer:'x',correctAnswer:'secret',mark:1,awardedMark:null}]});assert.equal(JSON.stringify(projected).includes('secret'),false);
 }finally{await ui.tick(350);ui.close();}
});

test('editing saved fill exams/homework retains type and accepted alternatives',async()=>{
 const ui=await createAdminDOM();try{
 ui.run(`adminData.exams=[{id:'fill-edit',title:'أكمل',text:'أكمل ____\\nالنوع: fill\\nالدرجة: 2\\nالنموذج: Python | بايثون',duration:20,active:true}];`);
 ui.window.renderExams();ui.window.editLiveExam('fill-edit');assert.equal(ui.document.querySelector('[data-question-type]').value,'fill');assert.equal(ui.document.querySelector('[data-question-model]').value,'Python | بايثون');
 ui.run(`adminData.assignments=[{id:'fill-hw-edit',title:'واجب',type:'multi',questions:[{type:'fill',question:'أكمل ____',mark:2,modelAnswer:'yes | نعم'}]}];`);
 ui.window.renderAssignments();ui.window.editHomeworkAssignment('fill-hw-edit');assert.equal(ui.document.querySelector('[data-homework-type]').value,'fill');assert.equal(ui.document.querySelector('[data-homework-model]').value,'yes | نعم');
 }finally{await ui.tick(350);ui.close();}
});
