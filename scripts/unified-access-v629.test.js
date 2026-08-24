'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('new and existing students use one code for both portals', () => {
  const backend = read('functions/index.js');
  const sync = read('assets/firebase-sync.js');
  assert.match(backend, /const parentCode = studentCode;/);
  assert.match(backend, /ensureUnifiedStudentAccess/);
  assert.match(backend, /record\._documentId \|\| response\.studentCode/);
  assert.match(backend, /oldParentCode && oldParentCode !== studentCode[\s\S]{0,160}batch\.delete/);
  assert.doesNotMatch(backend.slice(backend.indexOf('exports.createStudentAccess'), backend.indexOf('exports.createBooking')), /uniqueNumericCode\('parent_portal'/);
  assert.doesNotMatch(backend.slice(backend.indexOf('exports.createBooking'), backend.indexOf('exports.getBookingStatus')), /uniqueNumericCode\('parent_portal'/);
  assert.match(sync, /parentCode:code/);
  assert.match(sync, /const parentCode=studentCode/);
});

test('legacy codes migrate only through authenticated server functions', () => {
  const backend = read('functions/index.js');
  const sync = read('assets/firebase-sync.js');
  assert.match(backend, /exports\.unifyStudentAccessCodes = onCall/);
  assert.match(backend, /exports\.unifyLegacyStudentAccess = onSchedule/);
  assert.match(backend, /schedule: 'every 6 hours'/);
  assert.match(backend, /accessCodeVersion: 2/);
  assert.match(sync, /unifyStudentAccessCodes:callable\('unifyStudentAccessCodes'\)/);
  assert.match(sync, /migrateStudentCodeSafely:callable\('migrateStudentCodeSafely'\)/);
  assert.match(sync, /Secure student code migration service is unavailable/);
  assert.doesNotMatch(sync, /legacyParentCode&&legacyParentCode!==oldId/);
});

test('rules and admin UI enforce and present the unified code', () => {
  const rules = read('firestore.rules');
  const admin = read('assets/admin.js');
  const upgrades = read('assets/v53-upgrades.js');
  assert.match(rules, /request\.resource\.data\.parentCode == studentCode/);
  assert.match(rules, /request\.resource\.data\.studentCode == parentCode[\s\S]{0,100}request\.resource\.data\.parentCode == parentCode/);
  assert.match(admin, /الكود الموحّد للطالب وولي الأمر/);
  assert.match(admin, /MFCloud\.unifyStudentAccessCodes/);
  assert.doesNotMatch(upgrades, /كود ولي أمر جديد/);
  assert.doesNotMatch(upgrades, /نسخ الأكواد/);
});

test('all static routes and Vercel API rewrites point to existing targets', () => {
  const build = read('scripts/build.js');
  const vercel = JSON.parse(read('vercel.json'));
  const routes = [...build.matchAll(/^\s*'([^']+\.html)',?$/gm)].map(match => match[1]);
  assert.equal(routes.length, 16);
  routes.forEach(route => assert.equal(fs.existsSync(path.join(root, route)), true, `missing route ${route}`));
  assert.equal(vercel.outputDirectory, 'dist');
  assert.ok(vercel.rewrites.some(item => item.source === '/api/health' && item.destination.includes('getPlatformHealth')));
  assert.ok(vercel.rewrites.some(item => item.source === '/api/booking/create' && item.destination.includes('createBooking')));
});
