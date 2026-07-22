'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'index.html', 'student.html', 'parent.html', 'exams.html', 'teacher-login.html', 'learning-path.html', 'about.html',
  'assets/app.js', 'assets/admin.js', 'assets/v53-upgrades.js', 'assets/v55-admin.js', 'assets/v55.css', 'assets/v56-fixes.js', 'assets/v56.css', 'assets/amr-khaled-profile.jpeg', 'assets/amr-khaled-profile.webp',
  'assets/firebase-sync.js', 'assets/firebase-config.js', 'assets/technominds-logo.png',
  'firestore.rules', 'storage.rules', 'firestore.indexes.json', 'firebase.json',
  'functions/index.js', 'functions/package.json', 'service-worker.js', 'site.webmanifest', 'teacher.webmanifest', 'offline.html',
  'practical.html', 'assets/practical.js', 'assets/v60-technominds.css', 'assets/v60-payments.js', 'assets/v60-admin-workflow.js', 'functions/payment-domain.js',
  'check-deployment.ps1', 'deploy-hosting-only.ps1', 'DEPLOY-HOSTING-ONLY.cmd', 'CHECK-SITE.cmd', 'PREPARE-GITHUB.cmd'
];

const failures = [];
const ok = message => console.log(`✓ ${message}`);
const fail = message => failures.push(message);
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) fail(`Missing required file: ${relative}`);
}
if (!failures.length) ok('Required files exist');

const jsFiles = [
  'assets/app.js', 'assets/admin.js', 'assets/v53-upgrades.js', 'assets/v55-admin.js', 'assets/v56-fixes.js',
  'assets/firebase-sync.js', 'assets/firebase-config.js', 'assets/practical.js', 'assets/v60-payments.js', 'assets/v60-admin-workflow.js',
  'functions/index.js', 'functions/payment-domain.js', 'local-server.js', 'scripts/build.js', 'scripts/verify-dist.js', 'scripts/payment-domain.test.js'
];
for (const relative of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { encoding: 'utf8' });
  if (result.status !== 0) fail(`JavaScript syntax failed: ${relative}\n${result.stderr}`);
}
if (!failures.some(x => x.startsWith('JavaScript syntax'))) ok('JavaScript syntax checks passed');

const jsonFiles = ['package.json', 'package-lock.json', 'firebase.json', 'firestore.indexes.json', 'site.webmanifest', 'teacher.webmanifest', 'vercel.json', 'functions/package.json'];
for (const relative of jsonFiles) {
  try { JSON.parse(read(relative)); }
  catch (error) { fail(`Invalid JSON: ${relative} (${error.message})`); }
}
if (!failures.some(x => x.startsWith('Invalid JSON'))) ok('JSON files are valid');

const htmlFiles = fs.readdirSync(root).filter(name => name.endsWith('.html'));
const localRefPattern = /(?:src|href)=["']([^"'#?]+)["']/g;
for (const htmlFile of htmlFiles) {
  const html = read(htmlFile);
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) fail(`Duplicate IDs in ${htmlFile}: ${[...new Set(duplicates)].join(', ')}`);

  for (const match of html.matchAll(localRefPattern)) {
    const ref = match[1];
    if (/^(https?:|mailto:|tel:|javascript:|data:)/i.test(ref)) continue;
    const clean = ref.replace(/^\//, '');
    if (!clean || clean.endsWith('/')) continue;
    if (!fs.existsSync(path.join(root, clean))) fail(`Broken local reference in ${htmlFile}: ${ref}`);
  }
}
if (!failures.some(x => x.startsWith('Duplicate IDs') || x.startsWith('Broken local reference'))) ok('HTML IDs and local references passed');

const buttonSources = [...htmlFiles, ...jsFiles.filter(file => file.startsWith('assets/'))].map(relative => ({ relative, source: read(relative) }));
const combinedButtonSource = buttonSources.map(item => item.source).join('\n');
const inlineHandlers = new Map();
for (const item of buttonSources) {
  for (const match of item.source.matchAll(/\bon(?:click|change|input|submit)\s*=\s*["']\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!inlineHandlers.has(match[1])) inlineHandlers.set(match[1], new Set());
    inlineHandlers.get(match[1]).add(item.relative);
  }
}
for (const [name, locations] of inlineHandlers) {
  if (['location', 'history', 'window'].includes(name)) continue;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const definitions = [new RegExp(`function\\s+${escaped}\\b`), new RegExp(`window\\.${escaped}\\s*=`), new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=`)];
  if (!definitions.some(pattern => pattern.test(combinedButtonSource))) fail(`Missing button handler ${name} used in ${[...locations].join(', ')}`);
}
if (!failures.some(x => x.startsWith('Missing button handler'))) ok(`All ${inlineHandlers.size} inline action handlers are defined`);

const appCheckScanFiles = ['assets/firebase-config.js', 'assets/firebase-sync.js', 'functions/index.js', ...htmlFiles];
for (const relative of appCheckScanFiles) {
  const content = read(relative);
  if (/firebase-app-check|appCheckSiteKey|enforceAppCheck|ENFORCE_APP_CHECK|ReCaptchaV3Provider/i.test(content)) {
    fail(`App Check/reCAPTCHA reference remains in: ${relative}`);
  }
}
if (!failures.some(x => x.includes('App Check/reCAPTCHA'))) ok('App Check and reCAPTCHA are fully removed');

const syncSource = read('assets/firebase-sync.js');
if (/createBookingDirect|createReviewDirect/.test(syncSource)) fail('A public direct-write fallback still exists for booking or reviews');
const bookingUsesSecureFunction = syncSource.includes("sameOriginCallable('/api/booking/create'") &&
  read('firebase.json').includes('/api/booking/create') && read('vercel.json').includes('/api/booking/create');
if (!bookingUsesSecureFunction || !syncSource.includes("throw new Error('Secure review function is unavailable')")) {
  fail('Booking/review Cloud Function enforcement is missing');
}
if (!syncSource.includes("doc('platform')") || syncSource.includes("legacySiteDoc.set")) {
  fail('Collection-backed settings migration is incomplete');
}
if (!failures.some(x => x.includes('public direct-write') || x.includes('Cloud Function enforcement') || x.includes('settings migration'))) {
  ok('Public forms use secure Cloud Functions and collection storage');
}

const functionsSource = read('functions/index.js');
const callableNames = [
  'getPortalStudent', 'getStudentResources', 'createStudentAccess', 'createBooking', 'approveBooking', 'rejectBooking', 'getBookingStatus', 'createReview', 'recordClassProgress', 'registerTeacherPushToken',
  'getExamDashboard', 'startExam', 'submitExam', 'prepareHomeworkUpload', 'registerHomeworkSubmission', 'reportClientError',
  'createBackupNow', 'listAutomaticBackups', 'getBackupDownloadUrl', 'restoreAutomaticBackup', 'deleteStudentSafely',
  'activateOwnerAccount', 'getPlatformHealth', 'getCodeLanguages', 'submitCodeExecution', 'getCodeExecutionResult'
];
for (const name of callableNames) {
  if (!functionsSource.includes(`exports.${name} = onCall`)) fail(`Missing callable function export: ${name}`);
}
const firebaseSyncSource = read('assets/firebase-sync.js');
const callableBindings = [...firebaseSyncSource.matchAll(/\w+\s*:\s*callable\('([^']+)'\)/g)].map(match => match[1]);
for (const name of callableBindings) {
  if (!functionsSource.includes(`exports.${name} = onCall`)) fail(`Firebase client callable has no deployed export: ${name}`);
}
const allAssetJs = fs.readdirSync(path.join(root,'assets')).filter(name => name.endsWith('.js')).map(name => read(`assets/${name}`)).join('\n');
const mfCloudUses = [...new Set([...allAssetJs.matchAll(/MFCloud\??\.(\w+)/g)].map(match => match[1]))];
for (const name of mfCloudUses) {
  const implemented = firebaseSyncSource.includes(`${name}:`) || firebaseSyncSource.includes(`function ${name}(`) || firebaseSyncSource.includes(`,${name},`) || firebaseSyncSource.includes(`{${name},`);
  if (!implemented) fail(`MFCloud UI method/property is missing: ${name}`);
}
if (!functionsSource.includes('exports.scheduledPlatformBackup = onSchedule')) fail('Scheduled daily backup export is missing');
if (!functionsSource.includes('exports.notifyStaffOnBookingCreated = onDocumentCreated')) fail('Asynchronous booking notification trigger is missing');
if (!read('practical.html').includes('id="codeEditor"') || !read('assets/practical.js').includes("publicCallable('submitCodeExecution'") || !read('assets/practical.js').includes("'/api/code'") || read('practical.html').includes('codeStudentCode') || read('practical.html').includes('firebase-functions-compat.js') || !functionsSource.includes("rateLimitPublic('code-run-public'")) fail('Public practical code editor is incomplete or still loads the full Firebase bundle');
if (!read('firebase.json').includes('/api/code/submitCodeExecution') || !read('vercel.json').includes('/api/code/submitCodeExecution') || !read('firebase.json').includes('/api/code/getCodeExecutionResult') || !read('vercel.json').includes('/api/code/getCodeExecutionResult')) fail('Same-origin code runner rewrites are missing from Firebase or Vercel');
if (!functionsSource.includes('poll.status === 400') || !functionsSource.includes('wait=true') || !functionsSource.includes('judge0-sync-')) fail('Judge0 poll-400 recovery is incomplete');
if (!read('firestore.rules').includes('match /code_execution_runs/{id}') || !read('firestore.rules').includes('allow read, write: if false;')) fail('Code execution records are not server-only');
if (!functionsSource.includes("db.collection('_booking_requests')") || !functionsSource.includes('requestId')) fail('Idempotent booking request protection is missing');
if (!functionsSource.includes("db.collection('_homework_upload_tokens')") || !read('storage.rules').includes('_homework_upload_tokens')) fail('One-time homework upload authorization is missing');
if (/questions:\s*questions\.map\(q\s*=>\s*\(\{[^}]*answer/s.test(functionsSource)) fail('startExam response appears to expose answers');
if (!functionsSource.includes("backupFormatVersion: 2") || !functionsSource.includes("createPlatformBackup('pre-restore'")) {
  fail('Safe backup restore protection is incomplete');
}
if (!failures.some(x => x.startsWith('Missing callable') || x.includes('Scheduled daily') || x.includes('expose answers') || x.includes('backup restore'))) {
  ok('Secure callable, exam, backup, and safe-delete checks passed');
}

const adminSourceCode = read('assets/admin.js');
const adminWorkflowSource = read('assets/v60-admin-workflow.js');
const appSourceCode = read('assets/app.js');
const fixesSourceCode = read('assets/v56-fixes.js');
if (!adminSourceCode.includes("loadSiteData({fast:true})") || !adminSourceCode.includes('hydrateAdminRecords')) fail('Staged admin loading is missing');
if (!appSourceCode.includes('staffCacheOnly') || !appSourceCode.includes('if(isStaffWorkspace())return;')) fail('Compact staff browser cache protection is missing');
if (!fixesSourceCode.includes('showMoreAdminStudents') || !fixesSourceCode.includes('slice(0,adminStudentVisible)')) fail('Paginated student rendering is missing');
if (!appSourceCode.includes('window.Html5Qrcode') || !appSourceCode.includes("loadQrScanner:()=>loadLazyScript('qr-scanner'")) fail('Cross-browser lazy QR scanner fallback is missing');
for (const page of ['student.html','parent.html','teacher-login.html']) {
  if (read(page).includes('assets/vendor/html5-qrcode-2.3.8.min.js')) fail(`QR scanner is still eagerly loaded by ${page}`);
}
if (read('teacher-login.html').includes('assets/vendor/xlsx-0.18.5.full.min.js') || !read('assets/v53-upgrades.js').includes('loadSpreadsheet')) fail('Excel must load only when an Excel import starts');
if (/unpkg\.com\/html5-qrcode|cdn\.jsdelivr\.net\/npm\/xlsx/.test([read('student.html'),read('parent.html'),read('teacher-login.html')].join('\n'))) fail('Tracking-sensitive QR or Excel CDN dependency is still present');
if (!fs.existsSync(path.join(root,'assets/vendor/html5-qrcode-2.3.8.min.js')) || !fs.existsSync(path.join(root,'assets/vendor/xlsx-0.18.5.full.min.js'))) fail('Vendored QR or Excel file is missing');
if (!adminSourceCode.includes("toggleAttribute('inert',shouldHide)") || !adminSourceCode.includes('adminDrawerReturnFocus')) fail('Mobile admin drawer focus isolation is incomplete');
if (!appSourceCode.includes('printParentReport') || !read('assets/v56.css').includes('printing-parent-report')) fail('Parent PDF print isolation fix is missing');
if (!appSourceCode.includes('recitationPct') || !functionsSource.includes('recitationPct')) fail('Recitation/homework ranking linkage is missing');
if (!read('assets/firebase-sync.js').includes('recordClassProgressDirect') || !adminSourceCode.includes('classProgressActionPending')) fail('Resilient class progress saving is missing');
if (!read('assets/firebase-sync.js').includes('deleteStudentSafelyDirect') || !adminSourceCode.includes('studentDeletionPending')) fail('Safe direct student deletion fallback is missing');
if (!appSourceCode.includes('formatTime12') || !adminSourceCode.includes('formatTime12')) fail('12-hour display formatting is missing');
if (!failures.some(x => x.includes('admin loading') || x.includes('staff browser cache') || x.includes('student rendering'))) ok('Admin performance safeguards passed');

const rules = read('firestore.rules');
if (!rules.includes('match /exam_sessions/{id}') || !rules.includes('allow read, write: if false;')) fail('Exam session rules are not closed');
if (!rules.includes('match /bookings/{bookingCode}') || !rules.includes('allow create: if false;')) fail('Public booking direct creation is not closed');
if (!rules.includes('match /reviews/{reviewId}') || !rules.includes('allow create: if false;')) fail('Public review direct creation is not closed');
if (!rules.includes('match /homework_submissions/{id}') || !rules.includes("request.resource.data.method == 'teacher_class_check'") || !rules.includes('validCode(request.resource.data.studentCode)')) fail('Homework class-check creation is not narrowly restricted to signed-in staff');
if (!rules.includes('match /student_attempts/{studentCode}') || !rules.includes('allow create, update, delete: if isTeacher();')) fail('Safe student attempt correction, migration, and deletion rules are incomplete');
if (!rules.includes('request.resource.data.parentCode == resource.data.parentCode')) fail('Assistant code immutability rule is missing');
if (!failures.some(x => x.includes('rules are not') || x.includes('direct creation') || x.includes('metadata creation') || x.includes('immutability'))) {
  ok('Firestore security and assistant-permission checks passed');
}

const manifest = JSON.parse(read('site.webmanifest'));
if (manifest.display !== 'standalone' || manifest.scope !== '/' || !Array.isArray(manifest.icons)) fail('PWA manifest is incomplete');
if (!manifest.icons.some(icon => String(icon.purpose || '').includes('maskable') && icon.sizes === '512x512')) fail('Maskable PWA icon is missing');
const sw = read('service-worker.js');
const appShellSource = sw.slice(0,sw.indexOf('];')+2);
if (!/technominds-v61-0-2-production/.test(sw) || !sw.includes('/assets/v53-upgrades.js') || !sw.includes('/assets/curriculum-student.js') || !sw.includes('/assets/technominds-logo.png') || !sw.includes('/practical.html') || !sw.includes('/learning-path.html') || !sw.includes('/about.html')) fail('Service worker app shell is incomplete');
if (/assets\/vendor|assets\/admin\.js|teacher-login\.html/.test(appShellSource) || !sw.includes('event.waitUntil(network.catch')) fail('Large admin assets are still precached or repeat-visit caching is missing');
if (!read('index.html').includes('<script defer src="https://www.gstatic.com/firebasejs/')) fail('Firebase scripts are not downloaded in parallel with deferred execution');
const upgrade = read('assets/v53-upgrades.js');
if (!upgrade.includes('beforeinstallprompt') || !upgrade.includes('إضافة إلى الشاشة الرئيسية') || !upgrade.includes('navigator.standalone')) fail('Mobile install handling is incomplete');
if (!read('assets/app.js').includes('renderBookingScheduleOptions') || !read('index.html').includes('bookingScheduleId')) fail('Booking schedule linkage is incomplete');
if (!read('assets/firebase-sync.js').includes('subscribeToGroups:handler') || !read('assets/app.js').includes('startPublicScheduleSync')) fail('Live booking schedules are not connected to the admin timetable');
if (/24\/7/.test(read('index.html')) || /24\/7/.test(read('assets/app.js'))) fail('Ambiguous 24/7 student portal label is still present');
if (!read('assets/app.js').includes('leaderboard-name-line') || !read('assets/v56.css').includes('.leaderboard-avatar')) fail('Improved mobile leaderboard identity layout is missing');
if (!functionsSource.includes('leaderboardStateRef') || !functionsSource.includes('stateVersion') || !functionsSource.includes('currentMonthRows')) fail('Immediate monthly leaderboard cache invalidation is missing');
if (!functionsSource.includes("rateLimit('public-leaderboard-ip', requestIp(request)") || functionsSource.includes("rateLimitPublic('public-leaderboard', 'all'")) fail('Public leaderboard still has a shared global rate limit');
const attendanceRecitationHomeworkOnlyScore = Math.round(100 * .30 + 0 * .40 + 100 * .15 + 100 * .15);
if (attendanceRecitationHomeworkOnlyScore !== 60 || !functionsSource.includes(".filter(x=>x.name&&x.activity>0)")) fail('Active student without an exam grade would not enter the monthly leaderboard');
if (!read('assets/firebase-sync.js').includes("markLeaderboardDirty('attendance')") || !read('assets/firebase-sync.js').includes('FieldValue.increment(1)')) fail('Staff activity does not invalidate the public leaderboard');
if (!rules.includes('match /_system/leaderboard') || !rules.includes('allow create, update: if isStaff();')) fail('Leaderboard invalidation marker rules are missing');
if (!read('index.html').includes('refreshLeaderboardButton') || !read('assets/app.js').includes('window.refreshPublicLeaderboard')) fail('Public leaderboard refresh control is missing');
if (!read('index.html').includes('bookingGroupSearch') || !read('assets/app.js').includes('لا توجد مجموعة مطابقة للبحث')) fail('Booking group search is incomplete');
if (!read('assets/firebase-sync.js').includes('saveGroup:async group') || !upgrade.includes('MFCloud?.saveGroup')) fail('Focused group persistence is incomplete');
if (!read('functions/index.js').includes("db.collection('groups').doc(selectedScheduleId).get()") || !read('functions/index.js').includes("text(schedule.grade, 80) !== requestedGrade") || !read('functions/index.js').includes("text(schedule.name, 100) !== requestedGroup") || !read('functions/index.js').includes('scheduleStartTime')) fail('Secure booking schedule validation is incomplete');
if (!read('assets/app.js').includes('normalizeText(item.grade)===selected') || read('index.html').includes('bookingStatusForm') || read('assets/app.js').includes('setupBookingStatus')) fail('Grade-only booking groups or the simplified booking wizard is incomplete');
if (read('index.html').includes('name="group" required') || !read('assets/app.js').includes('التسجيل بدون مجموعة') || !functionsSource.includes('groupAssignmentPending: !schedule')) fail('Optional booking group flow is incomplete');
if (!read('assets/admin.js').includes('moveStudentToGroup') || !read('assets/admin.js').includes('confirmStudentGroupMove') || !read('assets/admin.js').includes('studentGroupMoveSelect')) fail('Admin student group move flow is incomplete');
if (!functionsSource.includes("where(field, '==', normalized)") || !functionsSource.includes('repair the canonical portal document')) fail('Legacy/imported student-code portal repair is incomplete');
if (!read('student.html').includes('data-digits-only') || !read('student.html').includes('inputmode="numeric"') || !appSourceCode.includes("converted.replace(/\\D/g,'')")) fail('Numeric-only code, phone, and number fields are incomplete');
if (!read('service-worker.js').includes('caches.match(url.pathname,{ignoreSearch:true})') || !read('assets/app.js').includes("localDevelopment=['localhost','127.0.0.1','0.0.0.0']")) fail('Portal navigation/offline fallback safeguards are incomplete');
if (!read('assets/admin.js').includes('bookingActionPending') || read('assets/admin.js').includes("showIssuedCodes(student,'تم قبول الحجز وتسجيل الطالب')")) fail('Instant repeated booking approval safeguards are incomplete');
if (!read('functions/index.js').includes("invoker: 'public'")) fail('Callable browser/CORS invoker configuration is missing');
if (read('assets/app.js').includes('رقم ولي الأمر لازم يكون مختلف') || read('functions/index.js').includes('studentPhone === parentPhone')) fail('Same-number parent/student booking is still blocked');
if (!read('assets/app.js').includes('toEnglishDigits') || !read('functions/index.js').includes('normalizeDigits')) fail('Arabic and English digit normalization is incomplete');
if (!functionsSource.includes('uniqueNumericCode') || !functionsSource.includes('studentCode, parentCode') || !read('assets/app.js').includes('كود الطالب')) fail('Immediate numeric booking access code is incomplete');
if (!rules.includes('match /booking_status/{bookingCode}') || !rules.includes('allow read, create: if false;')) fail('Booking status documents must be server-only');
if (!read('assets/admin.js').includes('renderSchedules') || !read('assets/admin.js').includes('startBookingNotifications')) fail('V55 schedule or booking notification UI is incomplete');
if (read('teacher-login.html').includes('firebase-messaging-compat.js') || sw.includes("importScripts('https://www.gstatic.com/firebasejs/")) fail('The lightweight admin/PWA build still loads Firebase Messaging eagerly');
if (!read('assets/admin.js').includes('MFCloud?.approveBooking') || !read('functions/index.js').includes('tx.delete(bookingRef)')) fail('Atomic booking approval and queue removal are incomplete');
if (/مجموعة السبت والثلاثاء|مجموعة الأحد والأربعاء|مجموعة الاثنين والخميس|أونلاين متابعة/.test(read('index.html'))) fail('Static booking groups must not appear in the booking form');
if (!appSourceCode.includes('setupUnifiedHeader') || !appSourceCode.includes('setupImageLazyLoading') || !read('assets/v60-technominds.css').includes('position:fixed!important')) fail('Unified fixed header or image lazy loading is incomplete');
if (read('index.html').includes('floating-card one') || !read('assets/v60-technominds.css').includes('.teacher-frame:before,.teacher-frame:after')) fail('Clean portrait overlay removal is incomplete');
if (!upgrade.includes('tm-robot-icon') || !upgrade.includes('مين هو المهندس عمرو خالد؟')) fail('Robot FAQ assistant is incomplete');
if (!read('about.html').includes('https://amrkhaledabozeid.vercel.app/') || !read('about.html').includes('https://github.com/byAmrkhaled0') || !read('about.html').includes('professional-badges')) fail('About portfolio, social links, or skill badges are incomplete');
if (!read('assets/admin.js').includes('admin-command-header') || !read('assets/admin.js').includes('adminBookingAlertCount') || !read('assets/admin.js').includes('حفظ التغييرات') || !read('assets/admin.js').includes('معاينة الموقع') || read('teacher-login.html').includes('<header class="site-header"') || !read('assets/v56-fixes.js').includes('openStudentGroupManager')) fail('Dedicated admin header or group manager is incomplete');
if (!read('assets/v55-admin.js').includes('coursePrices') || !read('assets/v55-admin.js').includes('paymentCollected') || !read('assets/v55-admin.js').includes('paymentAmount') || !read('assets/firebase-sync.js').includes('saveSettings:async')) fail('Course prices, payment totals, or focused Firebase payment saving are incomplete');
const deploymentChecks = read('deploy-production.ps1') + '\n' + read('check-deployment.ps1');
if (!read('assets/practical.js').includes('runJavascriptFallback') || !deploymentChecks.includes('getCodeLanguages') || !deploymentChecks.includes('TM_JS_OK')) fail('Code runner fallback or deployed execution smoke test is incomplete');
if (!functionsSource.includes('wait=false') || !functionsSource.includes('judge0-poll-') || !functionsSource.includes('fields=stdout,time,memory')) fail('Judge0 asynchronous submission and polling support is incomplete');
if (!functionsSource.includes('exports.getPlatformHealth = onCall') || !deploymentChecks.includes('/api/health') || !deploymentChecks.includes('services.booking')) fail('Post-deploy Firebase, booking, and portal health check is incomplete');
const deployScript = read('deploy-production.ps1');
if (deployScript.includes('ValueFromRemainingArguments') || !deployScript.includes('Get-Command npm.cmd') || !deployScript.includes('-Executable $NpmExecutable -ArgumentList @("test")')) fail('Windows PowerShell command invocation is not explicit or npm.cmd-safe');
if (!deployScript.includes('FUNCTIONS_DISCOVERY_TIMEOUT = "120"') || !read('DEPLOY-WINDOWS.cmd').includes('FUNCTIONS_DISCOVERY_TIMEOUT=120')) fail('Firebase Functions discovery timeout is not protected on Windows');
if (!appSourceCode.includes("if(file==='teacher-login.html')return") || read('teacher-login.html').includes('<header class="site-header"')) fail('Public header must not appear in the administration workspace');
if (!functionsSource.includes('exports.getStudentResources = onCall') || !firebaseSyncSource.includes("sameOriginCallable('/api/resources/student'") || !read('firebase.json').includes('/api/resources/student') || !read('vercel.json').includes('/api/resources/student')) fail('Secure student-track resource API is incomplete');
if (!read('materials.html').includes('studentResourceCodeForm') || !read('questions.html').includes('studentResourceCodeForm') || !appSourceCode.includes('setupStudentResourcesPage')) fail('Student code gates for lectures or questions are incomplete');
if (!rules.includes('match /materials/{id} { allow read: if isStaff();') || !rules.includes('match /questions/{id} { allow read: if isStaff();')) fail('Lecture or question collections are still publicly readable');
if (!adminSourceCode.includes('admin-brand-logo') || !adminSourceCode.includes('admin-mobile-logo')) fail('Techno Minds logo is missing from the administration workspace');
if (!adminSourceCode.includes('admin-hero-theme-icon') || /admin-sidebar-footer[\s\S]{0,500}themeToggleAdmin/.test(adminSourceCode)) fail('Administration theme icon is not isolated in the top hero');
if (!read('teacher-login.html').includes('v60-admin-workflow.js') || !adminWorkflowSource.includes('renderExamsV6061') || !adminWorkflowSource.includes('assignmentFormV6061')) fail('Organized exam or grade-assignment administration is missing');
if (!functionsSource.includes('Reconcile it') || !functionsSource.includes('Do not turn a Firebase/index failure') || !appSourceCode.includes('assignmentLoadError') || !appSourceCode.includes('getStudentResources(code)')) fail('Assignment grade reconciliation or partial-backend failure handling is missing');
if (!read('index.html').includes('Eng. Amr Khaled') || !appSourceCode.includes('أولى ثانوي برمجة')) fail('English teacher name or the First Secondary programming track is missing');
if (fs.existsSync(path.join(root,'services.html')) || read('scripts/build.js').includes("'services.html'") || appSourceCode.includes("['services.html'")) fail('The removed services page is still shipped or linked');
if (!read('teacher-login.html').includes('adminPasswordReset') || !adminSourceCode.includes('sendPasswordReset(email)')) fail('Administration password-reset recovery is missing');
if (!failures.some(x => x.includes('PWA') || x.includes('Service worker') || x.includes('Mobile install'))) ok('Android and iPhone PWA installation checks passed');

const adminSource = read('assets/admin.js') + '\n' + upgrade;
for (const feature of ['importStudentsFile', 'exportStudentsCSV', 'exportAttendanceCSV', 'exportGradesCSV', 'academicYear', 'openAt', 'closeAt', 'renderClientErrors', 'pdfFile', 'showIssuedCodes']) {
  if (!adminSource.includes(feature)) fail(`Admin v54 feature is missing: ${feature}`);
}
if (!adminSource.includes('المدفوعات') || adminSource.includes('بوابة دفع')) fail('Center subscription wording is incomplete');
if (!failures.some(x => x.includes('Admin v54 feature') || x.includes('subscription wording'))) ok('Academic-year, export, error-monitoring, and center-subscription checks passed');

const monthlyPaymentSource = read('assets/v60-payments.js');
for (const callable of ['createPaymentTransaction','editPaymentTransaction','cancelPaymentTransaction','migrateLegacyPayments']) {
  if (!functionsSource.includes(`exports.${callable} = onCall`) || !firebaseSyncSource.includes(`${callable}:callable('${callable}')`)) fail(`Monthly payment callable is incomplete: ${callable}`);
}
if (!monthlyPaymentSource.includes('paymentPartialCount') || !monthlyPaymentSource.includes('exportMonthlyPaymentsExcel') || !monthlyPaymentSource.includes('runLegacyPaymentMigration')) fail('Monthly cashbox totals, Excel export, or legacy migration UI is incomplete');
if (!monthlyPaymentSource.includes('installV606PaymentHandlers') || !monthlyPaymentSource.includes('window.setPaid=(code,value)=>value?window.markStudentPaid') || !monthlyPaymentSource.includes('window.markStudentPaid=async function')) fail('One-tap payment override is not safely isolated');
if (!functionsSource.includes("db.collection('_payment_dedup')") || !functionsSource.includes("createPlatformBackup('pre-payment-migration'") || !functionsSource.includes('legacyRowsPreserved: true')) fail('Payment idempotency, pre-migration backup, or legacy preservation is incomplete');
if (!rules.includes('match /monthly_payments/{id}') || !rules.includes('match /payment_transactions/{id}') || !rules.includes('allow write: if false;')) fail('Monthly payment ledger rules are not server-write-only');
if (!read('firestore.indexes.json').includes('payment_transactions') || !read('firestore.indexes.json').includes('_payment_dedup')) fail('Payment indexes or deduplication TTL are missing');
if (!appSourceCode.includes('data-student-tab="payments"') || !functionsSource.includes('monthlyPayments:')) fail('Student payment history is missing from the student file');
if (!failures.some(x => x.includes('Monthly payment') || x.includes('Payment idempotency') || x.includes('payment ledger') || x.includes('Student payment history'))) ok('Monthly payment ledger, migration, cashbox, and student history checks passed');

if (!functionsSource.includes('exports.submitAssignmentAnswer = onCall') || !firebaseSyncSource.includes("submitAssignmentAnswer:callable('submitAssignmentAnswer')") || !appSourceCode.includes('assignment-answer-form')) fail('Secure student assignment submission flow is incomplete');
if (!functionsSource.includes('publicAssignmentPayload') || functionsSource.includes('correctIndex: data.correctIndex') || !rules.includes('match /assignments/{id} { allow read, write: if isTeacher(); }')) fail('Assignment answers or grade targeting are not protected');
if (!adminWorkflowSource.includes("type==='mcq'") || !adminWorkflowSource.includes("type==='code'") || !adminWorkflowSource.includes("adminData.assignments.push")) fail('Multiple-choice and code assignment publishing is incomplete');
if (!failures.some(x => x.includes('assignment'))) ok('Grade assignments and secure student submission checks passed');

if (!firebaseSyncSource.includes('firebase-messaging-compat.js') || !firebaseSyncSource.includes('loadFirebaseMessaging') || !sw.includes("self.addEventListener('push'") || sw.includes('importScripts(')) fail('Lazy Firebase Messaging or dependency-free background Push is incomplete');
if (!functionsSource.includes('exports.unregisterTeacherPushToken') || !functionsSource.includes('invalid-registration-token') || !rules.includes('match /staff_push_tokens/{id}')) fail('Push token registration lifecycle or server-only token rules are incomplete');
if (!failures.some(x => x.includes('Messaging') || x.includes('Push token'))) ok('Background booking Push and token lifecycle checks passed');

if (!deployScript.includes('functions:$FunctionName') || !deployScript.includes('.deploy-state.txt') || !read('DEPLOY-WINDOWS.cmd').includes('.deploy-success')) fail('Resumable per-Function Windows deployment is incomplete');
if (deployScript.includes('@("push"') || deployScript.includes('git push') || !read('prepare-github-folder.ps1').toLowerCase().includes('nothing was pushed')) fail('Deployment still pushes GitHub automatically or Git preparation is unclear');
if (!read('deploy-hosting-only.ps1').includes('deploy --only hosting') || !read('check-deployment.ps1').includes('FullCodeRunner')) fail('Hosting-only deployment or post-deployment check script is incomplete');
if (!failures.some(x => x.includes('Windows deployment') || x.includes('pushes GitHub') || x.includes('Hosting-only'))) ok('Resumable Windows, hosting-only, and post-deployment scripts passed');

if (failures.length) {
  console.error('\nVerification failed:');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log('\nAll verification checks passed.');
