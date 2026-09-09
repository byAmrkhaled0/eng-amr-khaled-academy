'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('exam exposes a usable question map with answered current and review states', () => {
  const app = read('assets/app.js');
  const css = read('assets/v67-learning-hub.css');

  assert.match(app, /id="examQuestionMap" aria-label="خريطة أسئلة الامتحان"/);
  assert.match(app, /data-exam-question/);
  assert.match(app, /classList\.toggle\('answered',answered\)/);
  assert.match(app, /classList\.toggle\('current',index===current\)/);
  assert.match(app, /draft\.reviewFlags/);
  assert.match(css, /\.exam-question-map button\.review:after/);
  assert.match(css, /\.exam-question-map button\.current/);
});

test('students may skip a question and final submission still opens the first missing answer', () => {
  const app = read('assets/app.js');

  assert.doesNotMatch(app, /currentAnswered/);
  assert.match(app, /next\.addEventListener\('click',\(\)=>\{saveVisibleAnswer\(\);current\+\+;renderCurrent\(\)/);
  assert.match(app, /const firstMissing=qs\.findIndex/);
  assert.match(app, /current=firstMissing;renderCurrent\(\);return toast/);
});

test('exam reports connectivity and retries draft synchronization after reconnecting', () => {
  const app = read('assets/app.js');

  assert.match(app, /id="examConnectionStatus" role="status"/);
  assert.match(app, /navigator\.onLine!==false/);
  assert.match(app, /window\.addEventListener\('online',onlineHandler\)/);
  assert.match(app, /onlineHandler=\(\)=>\{updateConnectivity\(\);persistServerDraft\(\);\}/);
  assert.match(app, /window\.removeEventListener\('online',onlineHandler\)/);
});

test('long homework uses one-question steps progress and missing-answer navigation', () => {
  const app = read('assets/app.js');
  const css = read('assets/v67-learning-hub.css');

  assert.match(app, /function setupHomeworkStepper\(form\)/);
  assert.match(app, /data-homework-step-label/);
  assert.match(app, /data-homework-progress/);
  assert.match(app, /function firstMissingHomeworkQuestion\(form\)/);
  assert.match(app, /goTo\(firstMissing\)/);
  assert.match(css, /\.homework-question-card\.homework-step-hidden\{display:none!important\}/);
  assert.match(css, /\.assignment-answer-form\[data-assignment-type="multi"\] \.assignment-submit-row\{position:sticky/);
});

test('homework drafts have a short retention period and a shared-device clear action', () => {
  const app = read('assets/app.js');
  const draftWriter = app.slice(app.indexOf('function saveHomeworkDraft'), app.indexOf('function restoreHomeworkDraft'));

  assert.match(app, /HOMEWORK_DRAFT_TTL_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(app, /function cleanupHomeworkDrafts\(\)/);
  assert.match(app, /data-homework-clear-draft/);
  assert.match(app, /مسح كل إجابات المسودة من هذا الجهاز/);
  assert.doesNotMatch(draftWriter, /studentCode:/);
  assert.match(app, /clearHomeworkDraft\(form,true\)/);
});

test('release metadata stays synchronized after the assessment UX release', () => {
  const frontend = require(path.join(root, 'package.json'));
  const backend = require(path.join(root, 'functions/package.json'));
  const worker = read('service-worker.js');

  assert.equal(frontend.version, '67.8.0');
  assert.equal(backend.version, frontend.version);
  assert.match(read('assets/app.js'), /MF_ASSET_VERSION = '67\.8\.0'/);
  assert.match(worker, /technominds-v67-8-0-classroom-exam/);
  assert.match(worker, /ASSET_VERSION = "67\.8\.0"/);
});
