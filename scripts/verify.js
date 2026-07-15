'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const target = process.argv.includes('--dist') ? path.join(root, 'dist') : root;
const failures = [];
const warnings = [];
const checked = { html: 0, js: 0, json: 0, links: 0, handlers: 0 };

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.git'].includes(entry.name) || (dir === target && target === root && entry.name === 'dist')) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

const files = walk(target);
const htmlFiles = files.filter(file => file.endsWith('.html'));
const jsFiles = files.filter(file => file.endsWith('.js') && !file.includes(`${path.sep}vendor${path.sep}`));
const jsonFiles = files.filter(file => file.endsWith('.json'));

for (const file of jsonFiles) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); checked.json += 1; }
  catch (error) { failures.push(`${path.relative(target, file)}: JSON غير صالح (${error.message})`); }
}

for (const file of jsFiles) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) failures.push(`${path.relative(target, file)}: JavaScript syntax\n${check.stderr.trim()}`);
  else checked.js += 1;
}

const allCode = files.filter(file => /\.(?:js|html)$/.test(file)).map(file => fs.readFileSync(file, 'utf8')).join('\n');
const knownGlobals = new Set(['window', 'document', 'location', 'history', 'navigator', 'console']);
const requiredFunctions = ['createBooking', 'approveBooking', 'rejectBooking', 'createStudentAccess', 'getPortalStudent', 'recordClassProgress', 'startExam', 'submitExam', 'prepareHomeworkUpload', 'registerHomeworkSubmission', 'deleteStudentSafely', 'createReview', 'getPublicLeaderboard', 'reportClientError', 'getAdminDashboard', 'createAssignment', 'reviewHomework', 'createPracticalTask', 'reviewPracticalSubmission', 'createExam', 'approveExamResult', 'recordPayment', 'recordGrade', 'listStaffAccounts', 'updateStaffRole'];

for (const file of htmlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(target, file);
  checked.html += 1;
  if (!/<meta[^>]+name=["']viewport["']/i.test(source)) failures.push(`${relative}: viewport مفقود`);
  if (!relative.startsWith(`tests${path.sep}`) && !/future-theme\.css\?v=58/i.test(source)) failures.push(`${relative}: هوية v58 المستقبلية غير محملة`);
  if (/gstatic\.com\/firebasejs|firestore\.googleapis\.com\/v1\/projects|html5-qrcode|pyodide\.js/i.test(source)) failures.push(`${relative}: اعتماد CDN/Firestore REST ممنوع ما زال موجودًا`);
  if (/simple-admin\.js/i.test(source)) failures.push(`${relative}: simple-admin.js ما زال مشارًا إليه`);

  const refs = [...source.matchAll(/\b(?:src|href)=["']([^"'#]+)["']/gi)].map(match => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:|mailto:|tel:|data:|\/\/)/i.test(ref) || ref.startsWith('/')) continue;
    const clean = ref.split('?')[0];
    if (!clean || /\{\{|\$\{/.test(clean)) continue;
    checked.links += 1;
    const resolved = path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(resolved)) failures.push(`${relative}: الملف المحلي غير موجود: ${clean}`);
  }

  for (const match of source.matchAll(/\bonclick=["']\s*([A-Za-z_$][\w$]*)\s*\(/gi)) {
    const name = match[1];
    if (knownGlobals.has(name)) continue;
    checked.handlers += 1;
    const defined = new RegExp(`(?:function\\s+${name}\\s*\\(|(?:window\\.)?${name}\\s*=)`).test(allCode);
    if (!defined) failures.push(`${relative}: onclick يشير إلى دالة غير معرفة: ${name}`);
  }
}

if (!process.argv.includes('--dist')) {
  const functionsFile = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
  [...requiredFunctions, 'migrateLegacyStudentCodes', 'prepareStaffUpload', 'publishExamResult', 'searchAdminRecords'].forEach(name => { if (!new RegExp(`exports\\.${name}\\s*=`).test(functionsFile)) failures.push(`Cloud Function مفقودة: ${name}`); });
  if (/localStorage\.(?:setItem|getItem)\([^\n]*(?:student|booking)/i.test(fs.readFileSync(path.join(root, 'assets', 'app.js'), 'utf8'))) failures.push('LocalStorage ما زال مستخدمًا لبيانات الطلاب/الحجز.');
  const adminSource = fs.readFileSync(path.join(root, 'assets', 'admin.js'), 'utf8');
  if (!/function openExamModal\s*\(/.test(adminSource) || !/collectExamQuestions/.test(adminSource)) failures.push('منشئ الامتحان المبسط غير موجود في لوحة الإدارة.');
  for (const relative of ['firestore.rules', 'storage.rules']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    let depth = 0;
    for (const char of source.replace(/\/\/.*$/gm, '')) { if (char === '{') depth += 1; if (char === '}') depth -= 1; if (depth < 0) break; }
    if (depth !== 0 || !source.includes("rules_version = '2'")) failures.push(`${relative}: بنية القواعد غير متوازنة أو الإصدار غير صحيح.`);
  }
  try { JSON.parse(fs.readFileSync(path.join(root, 'site.webmanifest'), 'utf8')); checked.json += 1; }
  catch (error) { failures.push(`site.webmanifest: JSON غير صالح (${error.message})`); }
}

if (warnings.length) warnings.forEach(item => console.warn(`تحذير: ${item}`));
console.log(`تم فحص ${checked.html} صفحة، ${checked.js} ملف JavaScript، ${checked.json} JSON، ${checked.links} رابطًا محليًا، ${checked.handlers} onclick.`);
if (failures.length) {
  failures.forEach(item => console.error(`فشل: ${item}`));
  process.exit(1);
}
console.log('التحقق البنيوي نجح.');
