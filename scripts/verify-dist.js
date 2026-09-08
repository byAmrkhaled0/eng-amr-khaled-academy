'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const { version: releaseVersion } = require(path.join(root, 'package.json'));
const releaseCacheVersion = releaseVersion.replace(/\./g, '-');
const releaseCacheName = `technominds-v${releaseCacheVersion}-assessment-ux`;
const failures = [];
const required = ['index.html','404.html','teacher-login.html','service-worker.js','assets/app.js','assets/admin.js','assets/v60-payments.js','assets/v60-admin-workflow.js','assets/v60-technominds.css','assets/v61-design.css','assets/v67-learning-hub.css','assets/curriculum-admin.js','assets/curriculum-student.js'];

for (const file of required) if (!fs.existsSync(path.join(dist, file))) failures.push(`Missing dist/${file}`);
if (fs.existsSync(path.join(dist, '.env')) || fs.existsSync(path.join(dist, 'functions'))) failures.push('Secrets or backend source leaked into dist');

const htmlFiles = fs.existsSync(dist) ? fs.readdirSync(dist).filter(name => name.endsWith('.html')) : [];
for (const name of htmlFiles) {
  const source = fs.readFileSync(path.join(dist, name), 'utf8');
  const localAssets = [...source.matchAll(/(?:src|href)=["'](\/?assets\/[^"'?#]+\.(?:css|js))(?:\?v=([^"']+))?["']/g)];
  for (const [,asset,version] of localAssets) if (version !== releaseVersion) failures.push(`${name} has stale or missing asset version: ${asset}`);
  for (const match of source.matchAll(/(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/g)) {
    const ref = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(ref)) continue;
    const target = ref.startsWith('/') ? path.join(dist, ref) : path.resolve(dist, path.dirname(name), ref);
    if (!fs.existsSync(target)) failures.push(`${name} references missing ${ref}`);
  }
}

const login = fs.existsSync(path.join(dist, 'teacher-login.html')) ? fs.readFileSync(path.join(dist, 'teacher-login.html'), 'utf8') : '';
const worker = fs.existsSync(path.join(dist, 'service-worker.js')) ? fs.readFileSync(path.join(dist, 'service-worker.js'), 'utf8') : '';
if (!login.includes(`v60-payments.js?v=${releaseVersion}`)) failures.push('Payment UI is not in the built admin page');
if (!login.includes(`v60-admin-workflow.js?v=${releaseVersion}`)) failures.push('Exam, assignment, and theory lecture UI is not in the built admin page');
if (!worker.includes(releaseCacheName)) failures.push('Built service worker cache version is stale');
if (/JUDGE0_API_KEY\s*=\s*[^\s"']+/i.test(login)) failures.push('Judge0 secret appears in built HTML');

if (failures.length) {
  console.error('dist verification failed:');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`✓ dist verified (${htmlFiles.length} HTML pages, release v${releaseVersion}, secure assessment workflow, no backend/.env)`);
