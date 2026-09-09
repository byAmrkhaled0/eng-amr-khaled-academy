'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('phone navigation remains in the DOM and above floating tools', () => {
  const fixes = read('assets/v56-fixes.js');
  const legacyCss = read('assets/v56.css');
  const currentCss = read('assets/v65-redesign.css');
  const remover = fixes.slice(fixes.indexOf('function removeLegacyFloatingTools'), fixes.indexOf('function installCleanScrollTop'));

  assert.doesNotMatch(remover, /mobile-bottom|admin-mobile-bottom|mobile-nav-active/);
  assert.doesNotMatch(legacyCss, /\.mobile-bottom\{display:none!important;visibility:hidden/);
  assert.match(currentCss, /\.mobile-bottom\{display:grid!important\}/);
  assert.match(legacyCss, /\.student-help-button\{[^}]+bottom:calc\(88px/);
  assert.match(legacyCss, /\.admin-main\{padding-bottom:92px!important\}/);
});

test('exam dialog adapts to the visual viewport and restores keyboard focus', () => {
  const css = read('assets/v65-redesign.css');
  const page = read('exams.html');
  const app = read('assets/app.js');

  assert.match(css, /height:100dvh!important/);
  assert.doesNotMatch(css, /100svh/);
  assert.match(page, /id="examOverlay" role="dialog" aria-modal="true" aria-labelledby="examDialogTitle" aria-hidden="true"/);
  assert.match(app, /id="examDialogTitle"/);
  assert.match(app, /previousFocus\?\.focus\?\.\(\{preventScroll:true\}\)/);
  assert.match(app, /document\.removeEventListener\('keydown',examKeydown\)/);
});

test('student portal rerendering is centralized and homework keeps its active tab', () => {
  const app = read('assets/app.js');

  assert.match(app, /function renderStudentPortal\(box,student,options=\{\}\)/);
  assert.match(app, /renderStudentPortal\(box,lastPortalStudent,\{activeTab:'homework'\}\)/);
  assert.match(app, /setAttribute\('role','tablist'\)/);
  assert.match(app, /setAttribute\('aria-selected'/);
});

test('release build normalizes immutable asset versions and keeps heavy QR code lazy', () => {
  const build = read('scripts/build.js');
  const worker = read('service-worker.js');
  const appShell = worker.slice(0, worker.indexOf('];') + 2);

  assert.match(build, /releaseVersion/);
  assert.match(build, /html\.replace\(/);
  assert.doesNotMatch(appShell, /html5-qrcode/);
  assert.match(worker, /fetch\(request,\{cache:"reload"\}\)/);
  assert.match(worker, /technominds-v67-7-0-assessment-ux/);
});

test('health status reflects the usable default code runner without claiming a live probe', () => {
  const backend = read('functions/index.js');
  const functionsPackage = require(path.join(root, 'functions/package.json'));

  assert.equal(functionsPackage.version, '67.7.0');
  assert.match(backend, /\['http:', 'https:'\]\.includes\(endpoint\.protocol\)/);
  assert.match(backend, /default-provider-configured/);
  assert.match(backend, /codeRunnerVerification: 'configuration-only'/);
  assert.doesNotMatch(backend, /default-provider-unverified/);
});
