'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const functionsSource = read('functions/index.js');
const functionBody = name => {
  const start = functionsSource.indexOf(`exports.${name} =`);
  assert.notEqual(start, -1, `missing function export: ${name}`);
  const end = functionsSource.indexOf('\nexports.', start + 1);
  return functionsSource.slice(start, end < 0 ? functionsSource.length : end);
};

test('release, theme bootstrap and transparent logo stay synchronized', () => {
  assert.equal(require(path.join(root, 'package.json')).version, '67.8.10');
  assert.equal(require(path.join(root, 'functions/package.json')).version, '67.8.10');
  assert.match(read('service-worker.js'), /technominds-v67-8-10-admin-session/);

  for (const name of fs.readdirSync(root).filter(file => file.endsWith('.html'))) {
    const html = read(name);
    const theme = html.indexOf('assets/theme-init.js');
    const stylesheet = html.search(/assets\/[^"']+\.css/);
    assert.notEqual(theme, -1, `${name} does not load theme-init`);
    if (stylesheet >= 0) assert.ok(theme < stylesheet, `${name} loads theme-init after CSS`);
  }

  const png = fs.readFileSync(path.join(root, 'assets/technominds-logo.png'));
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[25], 6, 'main PNG logo must have an alpha channel');
  assert.equal(fs.statSync(path.join(root, 'assets/technominds-logo.webp')).size < 80 * 1024, true, 'header logo is too large');

  const css = read('assets/v67-learning-hub.css');
  assert.ok(css.lastIndexOf('.site-header .logo .logo-mark') > css.lastIndexOf('.logo-mark,.iconbox'), 'final logo rule must win the cascade');
  assert.match(css, /background-image:url\("technominds-logo\.webp"\)!important/);
  assert.match(css, /html\.theme-switching \*/);
});

test('Vercel uses bounded direct callables before its slower proxy fallback', () => {
  const sync = read('assets/firebase-sync.js');
  assert.match(sync, /preferDirectCallable=\/\\\.vercel\\\.app\$\/i/);
  assert.match(sync, /preferDirectCallable\s*\? directFirstCallable/);
  assert.match(sync, /publicCallable\('\/api\/portal\/student',payload,calls\.getPortalStudent,6500,0\)/);
  assert.match(sync, /publicCallable\('\/api\/exams\/start',payload,calls\.startExam,6500,0\)/);
  assert.match(sync, /publicCallable\('\/api\/exams\/progress',payload,calls\.saveExamProgress,5000,0\)/);
  assert.match(sync, /publicCallable\('\/api\/exams\/submit',payload,calls\.submitExam,10000,0\)/);
  assert.match(sync, /publicCallable\('\/api\/resources\/student',payload,calls\.getStudentResources,8000,0\)/);

  const practical = read('assets/practical.js');
  assert.match(practical, /DIRECT_FUNCTIONS_BASE='https:\/\/europe-west1-eng-amr-khaled-academy\.cloudfunctions\.net'/);
  assert.match(practical, /PREFER_DIRECT\?\[DIRECT_FUNCTIONS_BASE,PROXY_FUNCTIONS_BASE\]/);
  assert.match(practical, /requestAnimationFrame\(\(\)=>resolve\(\)\)/);
});

test('exam entry functions scale without reserved instances and remain retry-safe', () => {
  assert.match(functionsSource, /const EXAM_ENTRY_OPTIONS = \{[\s\S]*maxInstances: 20,[\s\S]*concurrency: 80,[\s\S]*memory: '512MiB'/);
  assert.doesNotMatch(functionsSource, /minInstances\s*:/);
  for (const name of ['getPortalStudent', 'getExamDashboard', 'startExam', 'submitExam']) {
    assert.match(functionsSource, new RegExp(`exports\\.${name} = onCall\\(EXAM_ENTRY_OPTIONS`));
  }

  const start = functionBody('startExam');
  assert.ok(start.indexOf('const isActiveResume') < start.indexOf("rateLimitStudentAction('exam-start'"));
  assert.match(start, /'exam-start',[\s\S]*request, 60, 10000, 10 \* 60 \* 1000/);

  const submit = functionBody('submitExam');
  assert.ok(submit.indexOf("session.status === 'submitted'") < submit.indexOf("rateLimitStudentAction('exam-submit'"));
  assert.match(submit, /'exam-submit',[\s\S]*request, 60, 10000, 10 \* 60 \* 1000/);

  const progress = functionBody('saveExamProgress');
  assert.equal((progress.match(/rateLimitStudentAction\('exam-progress'/g) || []).length, 1);
  assert.match(progress, /request,5000,100000,60\*60\*1000/);
});

test('Firebase and Vercel route maps resolve to exported functions', () => {
  const firebase = JSON.parse(read('firebase.json'));
  const vercel = JSON.parse(read('vercel.json'));
  const firebaseRoutes = new Map(firebase.hosting.rewrites.map(item => [item.source, item.function.functionId]));
  const vercelRoutes = new Map(vercel.rewrites.map(item => [item.source, item.destination.split('/').pop()]));
  const expected = {
    '/api/health': ['getPlatformHealthHttp', 'getPlatformHealthHttp'],
    '/api/portal/student': ['getPortalStudent', 'getPortalStudent'],
    '/api/parent/monthly-report': ['getParentMonthlyReport', 'getParentMonthlyReport'],
    '/api/exams/dashboard': ['getExamDashboard', 'getExamDashboard'],
    '/api/exams/start': ['startExam', 'startExam'],
    '/api/exams/progress': ['saveExamProgress', 'saveExamProgress'],
    '/api/exams/submit': ['submitExam', 'submitExam'],
    '/api/booking/create': ['createBooking', 'createBooking'],
    '/api/resources/student': ['getStudentResources', 'getStudentResources'],
    '/api/code/getCodeLanguages': ['getCodeLanguages', 'getCodeLanguages'],
    '/api/code/submitCodeExecution': ['submitCodeExecution', 'submitCodeExecution'],
    '/api/code/getCodeExecutionResult': ['getCodeExecutionResult', 'getCodeExecutionResult']
  };

  for (const [route, [firebaseFunction, vercelFunction]] of Object.entries(expected)) {
    assert.equal(firebaseRoutes.get(route), firebaseFunction, `Firebase route mismatch: ${route}`);
    assert.equal(vercelRoutes.get(route), vercelFunction, `Vercel route mismatch: ${route}`);
    assert.match(functionsSource, new RegExp(`exports\\.${firebaseFunction}\\s*=`));
    assert.match(functionsSource, new RegExp(`exports\\.${vercelFunction}\\s*=`));
  }
});

test('hosting CSP permits Firebase SDK diagnostics without widening the policy', () => {
  for (const file of ['firebase.json', 'vercel.json']) {
    const config = read(file);
    assert.match(config, /connect-src 'self' https:\/\/www\.gstatic\.com https:\/\/apis\.google\.com/);
    assert.match(config, /object-src 'none'/);
  }
});

test('mobile exam and homework content retain a real scroll surface', () => {
  const css = read('assets/v67-learning-hub.css');
  assert.match(css, /#examQuestionStage\{[\s\S]*overflow-y:auto!important[\s\S]*touch-action:pan-y/);
  assert.match(css, /#examQuestionStage>\.exam-question-card\{[\s\S]*overflow:visible!important/);
  assert.match(css, /\.student-assignment-card\[open\][\s\S]*max-height:none!important;overflow:visible!important/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.exam-box,\.exam-app-shell\{height:100dvh!important/);
});

test('exam and homework grades remain connected to monthly motivation', () => {
  assert.match(functionsSource, /fetchAllCollectionDocuments\('exam_attempts'/);
  assert.match(functionsSource, /fetchAllCollectionDocuments\('homework_submissions'/);
  assert.match(functionsSource, /weights:\{exams:/);
  assert.match(functionsSource, /homeworkGrade:/);
  assert.match(functionBody('submitExam'), /markLeaderboardDirty\('exam-submitted'\)/);
  assert.match(functionBody('reviewHomeworkSubmission'), /markLeaderboardDirty\('homework-reviewed'\)/);
});
