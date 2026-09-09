'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));
const interactiveSources = [
  ...htmlFiles,
  ...fs.readdirSync(path.join(root, 'assets'))
    .filter(file => file.endsWith('.js') && !file.includes('.min.'))
    .map(file => `assets/${file}`)
];

function cleanTemplates(source) {
  return source.replace(/\$\{[^{}]*\}/g, 'TEMPLATE_VALUE');
}

test('all local page, asset and fragment routes resolve', () => {
  for (const page of htmlFiles) {
    const source = read(page);
    for (const match of source.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
      const raw = match[1];
      if (/^(?:https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(raw)) continue;
      const [withoutFragment, fragment = ''] = raw.split('#');
      const withoutQuery = withoutFragment.split('?')[0];
      const relative = withoutQuery.replace(/^\//, '') || page;
      const target = relative.endsWith('/') ? `${relative}index.html` : relative;
      const absolute = path.resolve(root, path.dirname(page), target);
      assert.equal(fs.existsSync(absolute), true, `${page} has a missing route: ${raw}`);
      if (!fragment || !absolute.endsWith('.html')) continue;
      const targetSource = fs.readFileSync(absolute, 'utf8');
      const decoded = decodeURIComponent(fragment);
      assert.match(targetSource, new RegExp(`\\bid=["']${decoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`), `${page} has a missing fragment: ${raw}`);
    }
  }

  for (const file of interactiveSources.filter(name => name.endsWith('.js'))) {
    const source = read(file);
    for (const match of source.matchAll(/[\'"`]\/?([a-z0-9][a-z0-9-]*\.html)(?:[?#][^\'"`]*)?[\'"`]/gi)) {
      assert.equal(fs.existsSync(path.join(root, match[1])), true, `${file} has a missing dynamic page route: ${match[1]}`);
    }
  }

  const deploymentCheck = read('check-deployment.ps1');
  for (const page of htmlFiles) {
    assert.equal(deploymentCheck.includes(`/${page}`), true, `deployment check does not probe /${page}`);
  }
});

test('every literal button has an explicit safe type', () => {
  for (const file of interactiveSources) {
    const source = cleanTemplates(read(file));
    for (const tag of source.match(/<button\b[^>]*>/g) || []) {
      assert.match(tag, /\btype=["'](?:button|submit|reset)["']/, `${file} has an implicit button type: ${tag}`);
    }
  }
});

test('public forms have submit controls and field validation', () => {
  for (const page of ['index.html', 'student.html', 'parent.html', 'exams.html', 'materials.html', 'theory-lectures.html', 'questions.html', 'reviews.html', 'teacher-login.html']) {
    const source = read(page);
    for (const form of source.match(/<form\b[\s\S]*?<\/form>/g) || []) {
      assert.match(form, /type=["']submit["']/, `${page} form has no submit control`);
      assert.match(form, /\brequired\b/, `${page} form has no required-field validation`);
    }
  }
});

test('Firebase and Vercel expose the same critical API routes', () => {
  const firebase = read('firebase.json');
  const vercel = read('vercel.json');
  for (const route of [
    '/api/health',
    '/api/portal/student',
    '/api/parent/monthly-report',
    '/api/exams/dashboard',
    '/api/exams/start',
    '/api/exams/progress',
    '/api/exams/submit',
    '/api/booking/create',
    '/api/resources/student',
    '/api/code/getCodeLanguages',
    '/api/code/submitCodeExecution',
    '/api/code/getCodeExecutionResult'
  ]) {
    assert.equal(firebase.includes(route), true, `Firebase is missing ${route}`);
    assert.equal(vercel.includes(route), true, `Vercel is missing ${route}`);
  }
});

test('buttons acknowledge immediately and local navigation is prefetched', () => {
  const app = read('assets/app.js');
  const css = read('assets/site.css');

  assert.match(app, /function setupInteractionPerformance/);
  assert.match(app, /requestAnimationFrame/);
  assert.match(app, /classList\.add\('tm-pressed'\)/);
  assert.match(app, /function setupFastNavigationPrefetch/);
  assert.match(app, /cache:'force-cache'/);
  assert.match(app, /function setupValidationFeedback/);
  assert.match(app, /function setupDuplicateSubmitGuard/);
  assert.match(app, /tmSubmitLockedUntil/);
  assert.match(app, /const examStartRequests=new Map\(\)/);
  assert.match(app, /if\(existing\)return existing/);
  assert.match(app, /setAttribute\('aria-busy','true'\)/);
  assert.match(css, /\.tm-pressed\{/);
  assert.match(css, /touch-action:manipulation/);
});
