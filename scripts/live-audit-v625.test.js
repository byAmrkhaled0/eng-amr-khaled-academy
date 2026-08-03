'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('first secondary leaderboard uses the canonical track and keeps legacy backend compatibility', () => {
  const index = read('index.html');
  const functions = read('functions/index.js');
  assert.match(index, /<select id="leaderboardGrade"><option>أولى ثانوي بكالوريا<\/option>/);
  assert.doesNotMatch(index, /<option>أولى ثانوي برمجة<\/option>/);
  assert.match(functions, /canonicalLeaderboardGrade/);
  assert.match(functions, /أولى ثانوي برمجة/);
  assert.match(functions, /grade:canonicalLeaderboardGrade\(st\.grade\)/);
});

test('student resource and exam pages show a code error instead of a disabled-service error', () => {
  const app = read('assets/app.js');
  assert.match(app, /function studentCodeFriendlyError/);
  assert.match(app, /return 'الكود غير صحيح أو غير موجود\.'/);
  assert.equal((app.match(/studentCodeFriendlyError\(/g) || []).length, 3);
});

test('public pages expose canonical and social metadata', () => {
  const pages = ['index.html','learning-path.html','about.html','practical.html','materials.html','questions.html','student.html','parent.html','exams.html','reviews.html','privacy.html','terms.html'];
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /rel="canonical"/i, `${page} canonical`);
    assert.match(html, /property="og:title"/i, `${page} og:title`);
    assert.match(html, /name="description"|name='description'|content="[^"]+" name="description"/i, `${page} description`);
  }
  assert.match(read('teacher-login.html'), /name="robots" content="noindex, nofollow"/i);
  assert.match(read('questions.html'), /بنك أسئلة ومراجعات Techno Minds/);
  assert.match(read('reviews.html'), /تقييمات طلاب وأولياء أمور Techno Minds/);
});

test('booking controls and AI discovery file are accessible', () => {
  const index = read('index.html');
  assert.match(index, /<label for="bookingGroup">/);
  assert.match(index, /id="bookingGroup"[^>]+aria-describedby="bookingGroupHint"/);
  assert.ok(fs.existsSync(path.join(root, 'llms.txt')));
  assert.match(read('scripts/build.js'), /'llms\.txt'/);
});
