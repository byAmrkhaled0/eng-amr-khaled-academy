'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Keep all V67.7 regression checks in the main release test entry.
require('./assessment-scroll-v677.test.js');

test('practical and theory lecture forms both accept one Drive link per lecture', () => {
  const admin = read('assets/v60-admin-workflow.js');
  assert.match(admin, /إضافة محاضرة عملي/);
  assert.match(admin, /إضافة محاضرة نظري/);
  assert.ok((admin.match(/name="linkUrl" type="url"/g) || []).length >= 2);
  assert.match(admin, /يمكنك إضافة رابط Drive أو ملف أو الاثنين معًا/);
  assert.match(admin, /اختياري عند رفع ملف، ومطلوب إذا كانت المحاضرة رابطًا فقط/);
});

test('a practical lecture may use a Drive link, a file, or both and old lectures stay editable', () => {
  const admin = read('assets/v60-admin-workflow.js');
  assert.match(admin, /if\(!file&&!linkUrl&&!existing\?\.fileUrl\)/);
  assert.match(admin, /lectureCategory:'practical'/);
  assert.match(admin, /resourceType:'practical-lecture'/);
  assert.match(admin, /window\.editPracticalLecture/);
  assert.match(admin, /window\.cancelPracticalLectureEdit/);
  assert.match(admin, /uploaded\?\.url\|\|existing\?\.fileUrl\|\|''/);
});

test('only safe Google Drive links pass from administration to the student response', () => {
  const backend = read('functions/index.js');
  assert.match(backend, /function safeGoogleDriveUrl\(value\)/);
  assert.match(backend, /\['drive\.google\.com', 'docs\.google\.com'\]\.includes\(host\)/);
  assert.match(backend, /if \(collection === 'materials' && text\(input\.linkUrl, 2000\)\)/);
  assert.match(backend, /const linkUrl = safeGoogleDriveUrl\(data\.linkUrl\)/);
  assert.match(backend, /\['theory', 'practical'\]\.includes\(rawLectureCategory\)/);
});

test('students receive separate Drive and attachment actions on readable mobile cards', () => {
  const app = read('assets/app.js');
  const css = read('assets/v67-learning-hub.css');
  assert.match(app, /فتح رابط Google Drive/);
  assert.match(app, /فتح ملف الشرح/);
  assert.match(app, /lectureKind=kind==='material'/);
  assert.match(app, /lecture-kind-badge/);
  assert.match(css, /\.lecture-kind-badge/);
  assert.match(css, /html\[data-theme="dark"\] \.lecture-kind-badge/);
});

test('release metadata and cache invalidate the previous lecture UI', () => {
  assert.equal(require(path.join(root, 'package.json')).version, '67.8.4');
  assert.equal(require(path.join(root, 'functions/package.json')).version, '67.8.4');
  assert.match(read('assets/app.js'), /MF_ASSET_VERSION = '67\.8\.4'/);
  assert.match(read('service-worker.js'), /technominds-v67-8-4-admin-session/);
  assert.match(read('service-worker.js'), /ASSET_VERSION = "67\.8\.4"/);
});
