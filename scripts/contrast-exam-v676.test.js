'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('every delivered page loads the final readable theme after the legacy design',()=>{
  const pages=fs.readdirSync(root).filter(name=>name.endsWith('.html'));
  assert.equal(pages.length,16);
  for(const page of pages){
    const html=read(page),modern=html.indexOf('v67-learning-hub.css'),legacy=html.indexOf('v65-redesign.css');
    assert.ok(modern>=0,`${page} does not load the final theme`);
    assert.ok(modern>legacy,`${page} loads the final theme before the legacy theme`);
  }
  const admin=read('teacher-login.html');
  assert.ok(admin.indexOf('v674-admin.css')>admin.indexOf('v67-learning-hub.css'));
});

test('light and dark themes have explicit readable tokens and isolated exam colors',()=>{
  const css=read('assets/v67-learning-hub.css');
  assert.match(css,/V67\.6 — readable light\/dark palettes/);
  assert.match(css,/--tm-text:#17243a;--tm-muted:#536276/);
  assert.match(css,/--tm-text:#f1f5f9;--tm-muted:#b7c3d2/);
  assert.match(css,/--exam-text:#142238;--exam-muted:#536276/);
  assert.match(css,/--exam-text:#f3f6fa;--exam-muted:#bec9d6/);
  assert.match(css,/#examQuestionStage\{min-height:0;overflow:auto/);
  assert.match(css,/\.exam-app-shell\.has-teacher-message\{grid-template-rows:auto auto auto minmax\(0,1fr\)\}/);
});

test('teacher encouragement is saved, returned securely and rendered escaped to students',()=>{
  const workflow=read('assets/v60-admin-workflow.js'),backend=read('functions/index.js'),app=read('assets/app.js');
  assert.match(workflow,/name="encouragement"[^>]+maxlength="300"/);
  assert.match(workflow,/\['id','title','grade','duration','academicYear','term','group','instructions','encouragement'\]/);
  assert.ok((backend.match(/encouragement: text\(/g)||[]).length>=3);
  assert.match(backend,/encouragement: sessionData\.encouragement \|\| exam\.encouragement/);
  assert.match(app,/class="exam-card-message" role="note"/);
  assert.match(app,/class="exam-teacher-message" id="examTeacherMessage" role="note"/);
  assert.match(app,/\$\{esc\(ex\.encouragement\)\}/);
});

test('routes and first-load assets keep non-blocking and cache-safe behavior',()=>{
  const pages=fs.readdirSync(root).filter(name=>name.endsWith('.html'));
  for(const page of pages){
    const html=read(page);
    for(const tag of html.match(/<script\b[^>]*\bsrc=[^>]+><\/script>/gi)||[]){
      if(/assets\/theme-init\.js/i.test(tag))assert.doesNotMatch(tag,/\bdefer\b/i,`${page} must apply the saved theme before CSS`);
      else assert.match(tag,/\bdefer\b/i,`${page} has a render-blocking script`);
    }
  }
  const worker=read('service-worker.js');
  assert.doesNotMatch(worker.match(/const APP_SHELL = \[[\s\S]*?\];/)?.[0]||'',/html5-qrcode|xlsx-0\.18/);
  assert.match(worker,/if\(cached\)\{event\.waitUntil\(network\.catch\(\(\)=>null\)\);return cached;\}/);
  assert.match(read('firebase.json'),/"public": "dist"/);
});
