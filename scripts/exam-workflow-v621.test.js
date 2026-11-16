const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('weighted exam grading is calculated out of the configured question marks', () => {
  const backend = read('functions/index.js');
  assert.match(backend, /const maxScore = questions\.reduce/);
  assert.match(backend, /awardedMark: correct === true \? questionMark : 0/);
  assert.match(backend, /maxScore,/);
});

test('exam builder supports mcq true-false essay and code questions', () => {
  const admin = read('assets/admin.js');
  for (const type of ['mcq', 'truefalse', 'essay', 'code']) assert.match(admin, new RegExp(`value="${type}"`));
  assert.match(admin, /addExamQuestionAfter/);
  assert.match(admin, /data-question-mark/);
});

test('student correction privacy and admin attendance filters are present', () => {
  const app = read('assets/app.js');
  const workflow = read('assets/v60-admin-workflow.js');
  assert.match(app, /بيانات التصحيح محمية وفق سياسة المدرس/);
  assert.match(app, /التصحيح مؤمّن/);
  assert.match(app, /انتهى الوقت، لم تستطع الامتحان هذه المرة/);
  assert.match(workflow, /مين امتحن ومين لسه/);
  assert.match(workflow, /examAttendanceGrade/);
  assert.match(workflow, /editLiveExam/);
});

test('a submitted exam opens its review with wrong answers first and keeps unreleased solutions private', () => {
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM('<main id="examStudentResult"></main>',{runScripts:'outside-only'});
  try{
    const {window}=dom,document=window.document;
    const app=read('assets/app.js');
    const source=app.slice(app.indexOf('var currentExamStudent=null;'),app.indexOf('function setupExamsPage()'));
    window.HTMLElement.prototype.scrollIntoView=function(){};
    window.normalizedStudent=student=>student;
    window.TMResults={isExamGradePending:()=>false};
    window.formatPortalDate=value=>value;
    window.scoreClass=()=> 'good';
    window.hydrateIcons=()=>{};
    window.esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    window.eval(source);
    const attempt={id:'new',examTitle:'اختبار اختياري',submittedAt:'2026-11-16T12:00:00Z',score:1,maxScore:2,review:[
      {question:'السؤال الأول',answer:'اختيار سليم',correct:true,awardedMark:1},
      {question:'السؤال الثاني <img src=x>',answer:'الاختيار الخطأ',correct:false,awardedMark:0,correctAnswer:'نموذج محفوظ'},
      {question:'سؤال مقالي',answer:'',correct:null,awardedMark:null}
    ]};
    const older={...attempt,id:'older',examTitle:'اختبار سابق',submittedAt:'2026-11-15T12:00:00Z',answersRevealed:true};
    window.renderExamPortal({name:'طالب',studentCode:'123456',examAttempts:[older,attempt]},[],'new');
    const [newCard,oldCard]=document.querySelectorAll('.exam-result-card');
    const review=newCard.querySelector('details');
    assert.equal(review.open,true);
    assert.equal(document.activeElement,newCard);
    assert.equal(oldCard.querySelector('details').open,false);
    const [first]=review.querySelectorAll('.exam-review-item');
    assert(first.classList.contains('wrong'));
    assert.match(first.textContent,/السؤال 2.*السؤال الثاني/);
    assert.match(first.textContent,/الاختيار الخطأ/);
    assert.match(first.textContent,/0 من 1/);
    assert.equal(first.querySelector('img'),null);
    assert.match(review.textContent,/بانتظار التصحيح/);
    assert.doesNotMatch(review.textContent,/نموذج محفوظ/);
    assert.match(oldCard.textContent,/نموذج محفوظ/);

    window.renderExamPortal({name:'طالب',studentCode:'123456',examAttempts:[older,attempt]},[]);
    assert.match(document.querySelector('.exam-result-card summary').textContent,/1 إجابة غير صحيحة/);
  }finally{dom.window.close();}
});

test('homework supports the same four answer modes', () => {
  const app = read('assets/app.js');
  const workflow = read('assets/v60-admin-workflow.js');
  assert.match(workflow, /<option value="truefalse">صح أو غلط<\/option>/);
  assert.match(app, /type==='mcq'\|\|type==='truefalse'/);
});

test('multiline code questions preserve the full prompt and whitespace', () => {
  const backend = read('functions/index.js');
  const app = read('assets/app.js');
  assert.doesNotMatch(backend, /questionLines\[0\]/);
  assert.doesNotMatch(app, /questionLines\[0\]/);
  assert.match(backend, /rawQuestionLines\.join\('\\n'\)/);
  assert.match(app, /rawQuestionLines\.join\('\\n'\)/);
  assert.match(app, /white-space:pre-wrap/);
});
