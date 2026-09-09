'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('exam question stage is the single vertical scroll area on laptop and mobile', () => {
  const css = read('assets/v67-learning-hub.css');
  assert.match(css, /#liveExamForm\{[^}]*min-height:0!important;[^}]*overflow:hidden!important\}/);
  assert.match(css, /#examQuestionStage\{[^}]*overflow-x:hidden!important;[^}]*overflow-y:auto!important;[^}]*touch-action:pan-y;[^}]*-webkit-overflow-scrolling:touch/);
  assert.match(css, /#examQuestionStage>\.exam-question-card\{[^}]*overflow:visible!important;[^}]*contain:none!important\}/);
  assert.match(css, /@media\(max-width:760px\)\{[\s\S]*\.exam-box,\.exam-app-shell\{height:100dvh!important;max-height:100dvh!important\}/);
});

test('every exam question change resets the inner stage instead of the locked page', () => {
  const app = read('assets/app.js');
  assert.match(app, /const resetQuestionScroll=\(\)=>\{if\(typeof stage\.scrollTo==='function'\)stage\.scrollTo\(\{top:0,left:0,behavior:'auto'\}\)/);
  assert.match(app, /stage\.innerHTML=renderExamQuestionHtml\(qs\[current\],current\);resetQuestionScroll\(\)/);
  assert.doesNotMatch(app, /stage\.scrollIntoView\(/);
});

test('homework navigation reveals the active question without clipping the form', () => {
  const app = read('assets/app.js');
  const css = read('assets/v67-learning-hub.css');
  assert.match(app, /card\.scrollIntoView\(\{behavior:reducedMotion\?'auto':'smooth',block:'center'\}\)/);
  assert.match(css, /\.student-assignment-card\[open\][^}]*\.homework-question-list\{max-height:none!important;overflow:visible!important\}/);
  assert.match(css, /\.assignment-answer-form,\.homework-question-card\{touch-action:pan-y\}/);
});
