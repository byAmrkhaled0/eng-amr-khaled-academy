'use strict';

const crypto = require('crypto');
const zlib = require('zlib');
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2/options');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10, memory: '256MiB' });

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;
const OWNER_EMAILS = new Set(
  ['amr@gmail.com', 'amrk78420@gmail.com', process.env.OWNER_EMAILS, process.env.OWNER_EMAIL]
    .flatMap(value => String(value || '').split(','))
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
);
// Callable endpoints must accept the browser's unauthenticated CORS preflight.
// Sensitive operations still enforce staff authentication inside each handler.
const CALLABLE_OPTIONS = { region: 'europe-west1', timeoutSeconds: 30, invoker: 'public' };

function cleanDocId(value) {
  return String(value || '').trim().replace(/[\\/#?\[\]]/g, '-');
}

function normalizeCode(value) {
  return normalizeDigits(value).trim().toUpperCase().replace(/\s+/g, '');
}

function validLegacyOrStrongCode(value) {
  return /^[A-Z0-9_-]{6,40}$/.test(normalizeCode(value));
}

function text(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function normalizeDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
}

function digits(value) {
  return normalizeDigits(value).replace(/\D/g, '');
}

function safePublicUrl(value) {
  const url = text(value, 2000);
  return /^https:\/\//i.test(url) ? url : '';
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function randomCode(prefix, bytes = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const raw = crypto.randomBytes(bytes);
  let body = '';
  for (let i = 0; i < raw.length; i += 1) body += alphabet[raw[i] % alphabet.length];
  return `${prefix}-${body.slice(0, 4)}-${body.slice(4, 8)}`;
}

function randomNumericCode(length = 8) {
  // Keep the first digit non-zero so spreadsheet/phone copy does not trim it.
  const first = String(crypto.randomInt(1, 10));
  let rest = '';
  while (rest.length < length - 1) rest += String(crypto.randomInt(0, 10));
  return first + rest;
}

function publicStudentName(value) {
  // The teacher requested the leaderboard to use the exact full student name
  // saved on the platform instead of shortening the family name to an initial.
  return text(value, 80).replace(/\s+/g, ' ').trim();
}

async function uniqueNumericCode(collection, length = 8) {
  for (let i = 0; i < 12; i += 1) {
    const code = randomNumericCode(length);
    const snap = await db.collection(collection).doc(code).get();
    if (!snap.exists) return code;
  }
  throw new HttpsError('resource-exhausted', 'تعذر إنشاء كود رقمي فريد، حاول مرة أخرى.');
}

async function uniqueUnifiedAccessCode(length = 8) {
  for (let i = 0; i < 12; i += 1) {
    const code = randomNumericCode(length);
    // Every current booking and approved account owns a students/{code}
    // document. One indexed lookup is enough; atomic create() writes below
    // remain the final collision guard under heavy concurrent registration.
    const studentRecord = await db.collection('students').doc(code).get();
    if (!studentRecord.exists) return code;
  }
  throw new HttpsError('resource-exhausted', 'تعذر إنشاء كود موحد فريد، حاول مرة أخرى.');
}

async function uniqueCode(collection, prefix) {
  for (let i = 0; i < 8; i += 1) {
    const code = randomCode(prefix, 8);
    const snap = await db.collection(collection).doc(cleanDocId(code)).get();
    if (!snap.exists) return code;
  }
  throw new HttpsError('resource-exhausted', 'تعذر إنشاء كود فريد، حاول مرة أخرى.');
}

async function rateLimit(action, identity, limit, windowMs) {
  const key = hash(`${action}:${identity}`).slice(0, 40);
  const ref = db.collection('_rate_limits').doc(key);
  const now = Date.now();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const started = Number(data.windowStartedAt || 0);
    const count = Number(data.count || 0);
    if (!started || now - started >= windowMs) {
      tx.set(ref, { action, count: 1, windowStartedAt: now, expiresAt: Timestamp.fromMillis(now + windowMs * 2) });
      return;
    }
    if (count >= limit) throw new HttpsError('resource-exhausted', 'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.');
    tx.update(ref, { count: count + 1 });
  });
}

function requestIp(request) {
  const forwarded = request.rawRequest && request.rawRequest.headers
    ? request.rawRequest.headers['x-forwarded-for']
    : '';
  return text(String(forwarded || request.rawRequest?.ip || 'unknown').split(',')[0], 100);
}

async function rateLimitPublic(action, identity, request, identityLimit, ipLimit, windowMs) {
  const normalizedIdentity = text(identity || 'empty', 160);
  const ip = requestIp(request);
  await Promise.all([
    rateLimit(`${action}-identity`, normalizedIdentity, identityLimit, windowMs),
    rateLimit(`${action}-ip`, ip, ipLimit, windowMs)
  ]);
}

function jsonByteSize(value) {
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8'); }
  catch (_) { return Number.MAX_SAFE_INTEGER; }
}

async function requireStaff(request, allowedRoles = ['admin', 'teacher', 'assistant']) {
  if (!request.auth || !request.auth.uid) throw new HttpsError('unauthenticated', 'يجب تسجيل دخول فريق العمل.');
  const userSnap = await db.collection('users').doc(request.auth.uid).get();
  const profile = userSnap.exists ? userSnap.data() : {};
  if (profile.active === false || !allowedRoles.includes(profile.role)) {
    throw new HttpsError('permission-denied', 'الحساب غير مصرح له بهذه العملية.');
  }
  return { uid: request.auth.uid, email: request.auth.token?.email || '', ...profile };
}

// Repairs only the signed-in owner's own profile. The email must come from the
// verified Firebase Auth token, so a browser cannot grant another account admin access.
exports.activateOwnerAccount = onCall(CALLABLE_OPTIONS, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'سجّل الدخول أولًا.');
  const email = String(request.auth.token?.email || '').trim().toLowerCase();
  if (!OWNER_EMAILS.has(email)) throw new HttpsError('permission-denied', 'هذا البريد غير مسجل ضمن حسابات مالك المنصة.');
  const profile = {
    uid: request.auth.uid,
    email,
    name: 'Amr Khaled',
    role: 'admin',
    active: true,
    updatedAt: FieldValue.serverTimestamp()
  };
  await db.collection('users').doc(request.auth.uid).set(profile, { merge: true });
  return { ok: true, role: 'admin', active: true };
});

async function notifyStaffAboutBooking(booking) {
  const snap = await db.collection('staff_push_tokens').where('active', '==', true).limit(500).get();
  const tokens = [...new Set(snap.docs.map(doc => text(doc.data().token, 500)).filter(Boolean))];
  if (!tokens.length) return;
  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { type: 'new-booking', bookingCode: text(booking.code, 40), title: 'حجز طالب جديد', body: `${text(booking.name, 80)} · ${text(booking.grade, 60)} · ${text(booking.group, 80)}` },
    webpush: { fcmOptions: { link: '/teacher-login.html?section=bookings' } }
  });
  const invalid = [];
  response.responses.forEach((item, index) => {
    if (!item.success && /registration-token-not-registered|invalid-registration-token/.test(String(item.error?.code || ''))) invalid.push(tokens[index]);
  });
  if (invalid.length) {
    const batch = db.batch();
    snap.docs.filter(doc => invalid.includes(doc.data().token)).forEach(doc => batch.set(doc.ref, { active: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
    await batch.commit();
  }
}

exports.registerTeacherPushToken = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const token = text(request.data && request.data.token, 500);
  if (token.length < 40) throw new HttpsError('invalid-argument', 'رمز الإشعارات غير صالح.');
  const tokenId = hash(token).slice(0, 48);
  await db.collection('staff_push_tokens').doc(tokenId).set({ token, uid: staff.uid, role: staff.role || '', active: true, userAgent: text(request.data?.userAgent, 250), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { registered: true };
});

// Push delivery runs independently from the public booking request. The
// student sees the success screen as soon as Firestore commits, even if FCM is
// temporarily slow or unavailable.
exports.notifyStaffOnBookingCreated = onDocumentCreated({ document: 'bookings/{bookingCode}', region: 'europe-west1', memory: '256MiB' }, async event => {
  const booking = event.data && event.data.data();
  if (booking) await notifyStaffAboutBooking(booking);
});

function publicExamSession(sessionId, exam, questions, startedAtMs, expiresAtMs) {
  return {
    sessionId,
    exam: {
      id: text(exam.id, 100),
      title: text(exam.title, 200),
      instructions: text(exam.instructions, 1500),
      duration: Math.max(1, Math.min(240, Number(exam.duration || 20))),
      pdfUrl: safePublicUrl(exam.pdfUrl || exam.examPdfUrl),
      pdfName: text(exam.pdfName || exam.examPdfName, 220)
    },
    startedAt: new Date(startedAtMs).toISOString(),
    expiresAt: expiresAtMs,
    questions: questions.map(q => ({
      type: q.type,
      question: q.question,
      options: q.options,
      optionLabels: q.optionLabels
    }))
  };
}

function cleanAnswerLine(line) {
  return String(line || '').replace(/^(answer|correct|الإجابة|الاجابة|الإجابة الصحيحة|الاجابة الصحيحة)\s*[:=：-]?\s*/i, '').trim();
}

function parseOptionLine(line) {
  const raw = normalizeDigits(line).trim();
  let match = raw.match(/^([A-Da-dأإابجدهـه]|[1-4])\s*[\)\.\-:：]\s*(.+)$/);
  if (match) return { label: match[1].replace('إ', 'أ').replace('هـ', 'ه'), text: match[2].trim() };
  match = raw.match(/^-\s*(.+)$/);
  if (match) return { label: '', text: match[1].trim() };
  return null;
}

function parseExamQuestions(source) {
  const blocks = normalizeDigits(source).split(/\n\s*\n/).map(x => x.trim()).filter(Boolean).slice(0, 200);
  return blocks.map(block => {
    const lines = block.split('\n').map(x => x.trim()).filter(Boolean);
    const answerLine = lines.find(line => /^(answer|correct|الإجابة|الاجابة|الإجابة الصحيحة|الاجابة الصحيحة)\s*[:=：-]?/i.test(line));
    const answer = answerLine ? cleanAnswerLine(answerLine) : '';
    const options = [];
    const questionLines = [];
    for (const line of lines) {
      if (line === answerLine) continue;
      const option = parseOptionLine(line);
      if (option) options.push(option);
      else questionLines.push(line.replace(/^س\d*\s*[:\-]?\s*/, '').trim());
    }
    const question = text(questionLines[0] || lines[0] || 'سؤال', 1500);
    if (options.length) {
      return {
        type: 'mcq',
        question,
        options: options.slice(0, 8).map(o => text(o.text, 700)),
        optionLabels: options.slice(0, 8).map(o => text(o.label, 10)),
        answer: text(answer, 700)
      };
    }
    return { type: 'essay', question, options: [], optionLabels: [], answer: '' };
  }).filter(q => q.question);
}

function normalizeAnswer(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[\)\.\-:：]/g, '').replace(/إ/g, 'أ').replace(/هـ/g, 'ه');
}

function mcqCorrect(question, chosenIndex) {
  const index = Number(chosenIndex);
  if (!Number.isInteger(index) || index < 0 || index >= question.options.length) return false;
  const chosen = question.options[index] || '';
  const label = question.optionLabels[index] || String(index + 1);
  const correct = String(question.answer || '').trim();
  if (!correct) return null;
  const answerToken = (correct.match(/^([A-Da-dأإابجدهـه]|[1-4])/) || [])[1] || '';
  const normalized = normalizeAnswer(correct);
  return normalized === normalizeAnswer(label)
    || normalized === normalizeAnswer(chosen)
    || normalized === String(index + 1)
    || (answerToken && normalizeAnswer(answerToken) === normalizeAnswer(label));
}

function portalResponse(data, attempts, records = {}) {
  return {
    studentCode: text(data.studentCode || data.code, 40),
    name: text(data.studentName || data.name, 100),
    studentName: text(data.studentName || data.name, 100),
    grade: text(data.grade, 80),
    group: text(data.group, 100),
    month: text(data.month, 40),
    academicYear: text(data.academicYear, 20),
    term: text(data.term, 40),
    bookingCode: text(data.bookingCode, 40),
    approvalStatus: text(data.approvalStatus || data.status, 100),
    scheduleDays: text(data.scheduleDays, 100),
    scheduleStartTime: text(data.scheduleStartTime, 20),
    scheduleEndTime: text(data.scheduleEndTime, 20),
    paid: data.paid === true,
    paymentDate: text(data.paymentDate, 40),
    notes: text(data.notes, 1500),
    attendance: Array.isArray(records.attendance) ? records.attendance.slice(-120) : (Array.isArray(data.attendance) ? data.attendance.slice(-120) : []),
    grades: Array.isArray(records.grades) ? records.grades.slice(-120) : (Array.isArray(data.grades) ? data.grades.slice(-120) : []),
    homeworks: Array.isArray(records.homeworks) ? records.homeworks.slice(-120) : (Array.isArray(data.homeworks) ? data.homeworks.slice(-120) : []),
    recitations: Array.isArray(records.recitations) ? records.recitations.slice(-120) : (Array.isArray(data.recitations) ? data.recitations.slice(-120) : []),
    examAttempts: Array.isArray(attempts) ? attempts.slice(-120) : []
  };
}

async function getStudentPortalByCode(code) {
  const normalized = normalizeCode(code);
  if (!validLegacyOrStrongCode(normalized)) throw new HttpsError('invalid-argument', 'كود غير صالح.');
  const id = cleanDocId(normalized);
  const portalRef = db.collection('student_portal').doc(id);
  const portalSnap = await portalRef.get();
  if (portalSnap.exists) {
    if (portalSnap.data().active === false) throw new HttpsError('not-found', 'حساب الطالب غير نشط.');
    return { code: normalized, data: { ...portalSnap.data(), studentCode: portalSnap.data().studentCode || normalized, code: normalized } };
  }
  // Older releases sometimes created the student record before the dedicated
  // portal document. Keep those real accounts working and repair them lazily.
  let studentSnap = await db.collection('students').doc(id).get();
  // Imported/older student rows may have a random Firestore document id even
  // though the code shown in the admin panel is valid. Resolve those records by
  // their stored code and repair the canonical portal document automatically.
  if (!studentSnap.exists) {
    for (const field of ['studentCode', 'code', 'id']) {
      const match = await db.collection('students').where(field, '==', normalized).limit(1).get().catch(() => null);
      if (match && !match.empty) { studentSnap = match.docs[0]; break; }
    }
  }
  if (!studentSnap.exists || studentSnap.data().active === false) throw new HttpsError('not-found', 'لم يتم العثور على الطالب بهذا الكود.');
  const student = { ...studentSnap.data(), studentCode: normalized, code: normalized, id: normalized };
  const repaired = portalResponse(student, []);
  await portalRef.set({ ...repaired, parentCode: text(student.parentCode, 40), active: true, repairedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { code: normalized, data: student };
}

async function getParentPortalByCode(code) {
  const normalized = normalizeCode(code);
  if (!validLegacyOrStrongCode(normalized)) throw new HttpsError('invalid-argument', 'كود غير صالح.');
  let snap = await db.collection('parent_portal').doc(cleanDocId(normalized)).get();
  if (!snap.exists) {
    const student = await getStudentPortalByCode(normalized).catch(() => null);
    if (student) {
      const repaired = portalResponse(student.data, []);
      await db.collection('parent_portal').doc(cleanDocId(normalized)).set({ ...repaired, parentCode: normalized, active: true, repairedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      snap = await db.collection('parent_portal').doc(cleanDocId(normalized)).get();
    }
  }
  if (!snap.exists || snap.data().active === false) throw new HttpsError('not-found', 'لم يتم العثور على التقرير.');
  return { code: normalized, data: { ...snap.data(), studentCode: snap.data().studentCode || normalized, code: normalized } };
}

async function attemptSummaries(studentCode) {
  const parentRef = db.collection('student_attempts').doc(cleanDocId(studentCode));
  const sub = await parentRef.collection('attempts').orderBy('submittedAt', 'desc').limit(120).get().catch(() => null);
  let attempts = sub && !sub.empty ? sub.docs.map(doc => ({ id:doc.id, ...doc.data() })) : [];
  if (!attempts.length) {
    const legacy = await parentRef.get();
    attempts = legacy.exists && Array.isArray(legacy.data().attempts) ? legacy.data().attempts.slice(-120).reverse() : [];
  }
  return attempts.map(a => ({
    id: text(a.id, 120),
    examId: text(a.examId, 100),
    examTitle: text(a.examTitle, 200),
    submittedAt: text(a.submittedAt, 60),
    score: a.score === null || a.score === undefined ? null : Number(a.score),
    autoScore: a.autoScore === null || a.autoScore === undefined ? null : Number(a.autoScore),
    needsManualReview: a.needsManualReview === true,
    status: text(a.status, 40)
  }));
}

async function studentRecords(studentCode) {
  const normalized = normalizeCode(studentCode);
  const load = async collection => {
    const snap = await db.collection(collection).where('studentCode', '==', normalized).limit(250).get().catch(() => null);
    return snap ? snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [];
  };
  const [attendance, grades, homeworks, recitations] = await Promise.all([
    load('attendance'), load('grades'), load('homework_submissions'), load('recitations')
  ]);
  const byDate = rows => rows.sort((a, b) => String(a.date || a.submittedAt || a.createdAt || '').localeCompare(String(b.date || b.submittedAt || b.createdAt || '')));
  return { attendance: byDate(attendance), grades: byDate(grades), homeworks: byDate(homeworks), recitations: byDate(recitations) };
}

exports.getPortalStudent = onCall(CALLABLE_OPTIONS, async request => {
  const code = normalizeCode(request.data && request.data.code);
  const mode = request.data && request.data.mode === 'parent' ? 'parent' : 'student';
  await rateLimitPublic(`portal-${mode}`, code, request, 8, 35, 60 * 1000);
  const found = mode === 'parent' ? await getParentPortalByCode(code) : await getStudentPortalByCode(code);
  const studentCode = found.data.studentCode || found.data.code;
  const [attempts, records] = await Promise.all([attemptSummaries(studentCode), studentRecords(studentCode)]);
  return portalResponse(found.data, attempts, records);
});

const leaderboardStateRef = db.collection('_system').doc('leaderboard');
let leaderboardCache = { expiresAt: 0, version: -1, rows: [] };

async function markLeaderboardDirty(reason = 'activity') {
  try {
    await leaderboardStateRef.set({
      version: FieldValue.increment(1),
      reason: text(reason, 60),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.warn('leaderboard-dirty-marker-failed', error?.message || error);
  }
}

function cairoDateKey(value = new Date()) {
  let date;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value && typeof value.toDate === 'function') date = value.toDate();
  else date = value instanceof Date ? value : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function leaderboardRecordDate(row = {}) {
  return cairoDateKey(row.date || row.submittedAt || row.createdAt || row.updatedAt || '');
}

exports.getPublicLeaderboard = onCall(CALLABLE_OPTIONS, async request => {
  // The old shared identity "all" imposed one 30-request limit on the whole
  // website. Limit per visitor IP instead so simultaneous students can load it.
  await rateLimit('public-leaderboard-ip', requestIp(request), 60, 60 * 1000);
  const stateSnap = await leaderboardStateRef.get().catch(() => null);
  const stateVersion = stateSnap?.exists ? Number(stateSnap.data()?.version || 0) : 0;
  const requestedGrade = text(request.data?.grade, 50);
  const selectGradeLeaders = items => (items || []).filter(row => row.grade === requestedGrade).slice(0, 5);
  if (leaderboardCache.expiresAt > Date.now() && leaderboardCache.version === stateVersion) return selectGradeLeaders(leaderboardCache.rows);
  const [studentsSnap, attendanceSnap, gradesSnap, homeworkSnap, recitationSnap] = await Promise.all([
    db.collection('students').where('active', '==', true).limit(500).get(),
    db.collection('attendance').limit(2000).get(),
    db.collection('grades').limit(2000).get(),
    db.collection('homework_submissions').limit(2000).get(),
    db.collection('recitations').limit(2000).get()
  ]);
  const grouped = snap => { const map = new Map(); snap.docs.forEach(doc => { const row=doc.data()||{},code=normalizeCode(row.studentCode); if(!code)return; if(!map.has(code))map.set(code,[]); map.get(code).push(row); }); return map; };
  const attendance=grouped(attendanceSnap),grades=grouped(gradesSnap),homeworks=grouped(homeworkSnap),recitations=grouped(recitationSnap);
  const complete=row=>row.completed===true||row.approved===true||String(row.status||'').startsWith('تم');
  const currentMonth=cairoDateKey(new Date()).slice(0,7);
  const currentMonthRows=items=>(items||[]).filter(row=>leaderboardRecordDate(row).slice(0,7)===currentMonth);
  const recordDate=leaderboardRecordDate;
  const rows=studentsSnap.docs.map(doc=>{
    const st=doc.data()||{},code=normalizeCode(st.studentCode||st.code||doc.id);
    const att=currentMonthRows(attendance.get(code)||st.attendance||[]),present=att.filter(x=>['present','حاضر','متأخر'].includes(x.status)).length,attendancePct=att.length?Math.round(present/att.length*100):0;
    const gradeRows=currentMonthRows(grades.get(code)||st.grades||[]).filter(x=>Number.isFinite(Number(x.score))),gradePct=gradeRows.length?Math.round(gradeRows.reduce((sum,x)=>sum+Number(x.score),0)/gradeRows.length):0;
    const hw=currentMonthRows(homeworks.get(code)||st.homeworks||[]).filter(complete),rec=currentMonthRows(recitations.get(code)||st.recitations||[]).filter(complete);
    const classDates=new Set(att.map(recordDate).filter(Boolean));hw.forEach(row=>{const date=recordDate(row);if(date)classDates.add(date);});rec.forEach(row=>{const date=recordDate(row);if(date)classDates.add(date);});
    const sessions=classDates.size,completedDates=items=>new Set(items.map(recordDate).filter(Boolean)).size;
    const homeworkPct=sessions?Math.min(100,Math.round(completedDates(hw)/sessions*100)):0,recitationPct=sessions?Math.min(100,Math.round(completedDates(rec)/sessions*100)):0;
    const score=Math.round(attendancePct*.30+gradePct*.40+homeworkPct*.15+recitationPct*.15);
    return {name:publicStudentName(st.studentName||st.name),grade:text(st.grade,50),score,attendancePct,gradePct,homeworkPct,recitationPct,activity:att.length+gradeRows.length+hw.length+rec.length};
  }).filter(x=>x.name&&x.activity>0).sort((a,b)=>b.score-a.score||b.attendancePct-a.attendancePct||b.gradePct-a.gradePct);
  leaderboardCache = { expiresAt: Date.now() + 5 * 60 * 1000, version: stateVersion, rows };
  return selectGradeLeaders(rows);
});

exports.createStudentAccess = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const body = request.data || {};
  const name = text(body.studentName || body.name, 100);
  const parentPhone = digits(body.parentPhone);
  if (name.length < 3) throw new HttpsError('invalid-argument', 'اكتب اسم الطالب كاملًا.');
  if (digits(parentPhone).length < 10) throw new HttpsError('invalid-argument', 'اكتب رقم ولي أمر صحيحًا.');

  for (let attemptNo = 0; attemptNo < 8; attemptNo += 1) {
    const studentCode = await uniqueUnifiedAccessCode(8);
    const parentCode = studentCode;
    const studentRef = db.collection('students').doc(cleanDocId(studentCode));
    const studentPortalRef = db.collection('student_portal').doc(cleanDocId(studentCode));
    const parentPortalRef = db.collection('parent_portal').doc(cleanDocId(parentCode));
    const paymentRef = db.collection('payments').doc(cleanDocId(studentCode));
    const student = {
      studentCode,
      code: studentCode,
      parentCode,
      studentName: name,
      name,
      studentPhone: digits(body.studentPhone),
      parentPhone,
      grade: text(body.grade, 80),
      month: text(body.month, 40),
      group: text(body.group, 100),
      academicYear: text(body.academicYear, 20),
      term: text(body.term, 40),
      notes: text(body.notes, 1500),
      paid: body.paid === true,
      paymentDate: text(body.paymentDate, 40),
      active: body.active !== false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    const portal = portalResponse(student, []);
    const batch = db.batch();
    batch.create(studentRef, student);
    batch.create(studentPortalRef, { ...portal, studentCode, parentCode, active: student.active, updatedAt: FieldValue.serverTimestamp() });
    batch.create(parentPortalRef, { ...portal, studentCode, parentCode, active: student.active, updatedAt: FieldValue.serverTimestamp() });
    batch.set(paymentRef, {
      studentCode,
      studentName: name,
      grade: student.grade,
      group: student.group,
      academicYear: student.academicYear,
      term: student.term,
      paid: student.paid,
      paymentDate: student.paymentDate,
      updatedAt: FieldValue.serverTimestamp()
    });
    const logRef = db.collection('activityLog').doc();
    batch.set(logRef, {
      action: 'تم تسجيل طالب جديد',
      meta: { studentCode },
      actorUid: staff.uid,
      actorEmail: staff.email || '',
      actorRole: staff.role || '',
      createdAt: FieldValue.serverTimestamp()
    });
    try {
      await batch.commit();
      return { ...portal, studentCode, code: studentCode, parentCode, active: student.active };
    } catch (error) {
      if (attemptNo === 7) throw new HttpsError('aborted', 'تعذر إنشاء أكواد فريدة، حاول مرة أخرى.');
    }
  }
  throw new HttpsError('resource-exhausted', 'تعذر إنشاء أكواد فريدة، حاول مرة أخرى.');
});

exports.createBooking = onCall(CALLABLE_OPTIONS, async request => {
  const body = request.data || {};
  const rawRequestId = text(body.requestId, 80);
  const requestId = /^[A-Za-z0-9_-]{12,80}$/.test(rawRequestId) ? rawRequestId : '';
  const requestRef = requestId ? db.collection('_booking_requests').doc(cleanDocId(requestId)) : null;
  if (requestRef) {
    const previous = await requestRef.get();
    if (previous.exists && previous.data().response) return previous.data().response;
  }
  const identity = `${digits(body.parentPhone)}:${request.rawRequest.ip || ''}`;
  await rateLimitPublic('booking-v2', identity, request, 12, 60, 10 * 60 * 1000);
  const name = text(body.name, 80);
  const studentPhone = digits(body.studentPhone);
  const parentPhone = digits(body.parentPhone);
  if (name.length < 3) throw new HttpsError('invalid-argument', 'اكتب اسم الطالب كاملًا.');
  if (studentPhone.length < 10 || parentPhone.length < 10) throw new HttpsError('invalid-argument', 'اكتب أرقام هاتف صحيحة.');
  const requestedGrade = text(body.grade, 80);
  const requestedGroup = text(body.group, 100);
  const selectedScheduleId = cleanDocId(text(body.scheduleId, 100));
  if (!requestedGrade) throw new HttpsError('invalid-argument', 'اختر المسار التعليمي.');
  let schedule = null;
  let code;
  if (selectedScheduleId) {
    // Keep schedule validation server-side when the visitor chooses a group.
    const results = await Promise.all([
      db.collection('groups').doc(selectedScheduleId).get(),
      uniqueUnifiedAccessCode(8)
    ]);
    const scheduleSnap = results[0];
    code = results[1];
    if (!scheduleSnap.exists || scheduleSnap.data().active === false) {
      throw new HttpsError('failed-precondition', 'هذا الموعد لم يعد متاحًا. حدّث الصفحة واختر موعدًا آخر.');
    }
    schedule = scheduleSnap.data();
    if (text(schedule.grade, 80) !== requestedGrade) throw new HttpsError('failed-precondition', 'الموعد المختار غير متاح لهذا المسار.');
    if (text(schedule.name, 100) !== requestedGroup) throw new HttpsError('failed-precondition', 'المجموعة المختارة تغيّرت. حدّث الصفحة واخترها من جديد.');
  } else {
    code = await uniqueUnifiedAccessCode(8);
  }
  // All codes shown after booking are digits only and can be typed with Arabic
  // or English numerals. They are issued immediately and never change later.
  const studentCode = code;
  const parentCode = code;
  const payload = {
    id: code,
    code,
    name,
    studentName: name,
    studentPhone,
    parentPhone,
    grade: requestedGrade,
    month: text(body.month, 40),
    group: schedule ? text(schedule.name, 100) : '',
    scheduleId: selectedScheduleId,
    scheduleDays: schedule ? text(schedule.days, 100) : '',
    scheduleStartTime: schedule ? text(schedule.startTime, 20) : '',
    scheduleEndTime: schedule ? text(schedule.endTime, 20) : '',
    groupAssignmentPending: !schedule,
    academicYear: text(body.academicYear, 20),
    term: text(body.term, 40),
    notes: text(body.notes, 1000),
    studentCode,
    parentCode,
    status: 'قيد التسجيل',
    date: new Date().toISOString().slice(0, 10),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  const statusPayload = {
    code,
    name: payload.name,
    grade: payload.grade,
    month: payload.month,
    group: payload.group,
    scheduleId: payload.scheduleId,
    scheduleDays: payload.scheduleDays,
    scheduleStartTime: payload.scheduleStartTime,
    scheduleEndTime: payload.scheduleEndTime,
    academicYear: payload.academicYear,
    term: payload.term,
    status: payload.status,
    studentCode,
    parentCode,
    updatedAt: FieldValue.serverTimestamp()
  };
  const batch = db.batch();
  batch.create(db.collection('bookings').doc(cleanDocId(code)), payload);
  batch.create(db.collection('booking_status').doc(cleanDocId(code)), statusPayload);
  const provisionalStudent = {
    ...payload,
    bookingCode: code,
    code: studentCode,
    id: studentCode,
    studentCode,
    parentCode,
    paid: false,
    paymentDate: '',
    active: true,
    approvalStatus: 'قيد التسجيل'
  };
  const provisionalPortal = portalResponse(provisionalStudent, []);
  batch.create(db.collection('students').doc(studentCode), provisionalStudent);
  batch.create(db.collection('student_portal').doc(studentCode), { ...provisionalPortal, parentCode, active: true, updatedAt: FieldValue.serverTimestamp() });
  batch.create(db.collection('parent_portal').doc(parentCode), { ...provisionalPortal, parentCode, active: true, updatedAt: FieldValue.serverTimestamp() });
  const response = { code, bookingCode: code, studentCode, parentCode, status: payload.status };
  if (requestRef) batch.create(requestRef, { requestId, response, createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000) });
  try {
    await batch.commit();
  } catch (error) {
    // A retried browser request can race the original request. The first batch
    // wins; the retry returns the exact same codes instead of creating a second
    // booking or showing a false failure.
    if (requestRef) {
      const previous = await requestRef.get().catch(() => null);
      if (previous?.exists && previous.data().response) return previous.data().response;
    }
    throw error;
  }
  return response;
});

exports.approveBooking = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const bookingCode = normalizeCode(request.data && request.data.code);
  if (!validLegacyOrStrongCode(bookingCode)) throw new HttpsError('invalid-argument', 'كود الحجز غير صالح.');

  // Candidates also let legacy bookings be approved instead of forcing the
  // teacher to delete and recreate them. Existing V55 codes are preserved.
  // Current bookings already use their numeric booking code as the unified
  // access code. Avoid five unnecessary uniqueness reads on every approval;
  // only old alphanumeric bookings need a fresh fallback code.
  const fallbackStudentCode = /^\d{6,12}$/.test(bookingCode) ? bookingCode : await uniqueUnifiedAccessCode(8);

  const bookingRef = db.collection('bookings').doc(cleanDocId(bookingCode));
  const statusRef = db.collection('booking_status').doc(cleanDocId(bookingCode));
  return db.runTransaction(async tx => {
    // The normal path needs one read only. booking_status is consulted only
    // when the teacher taps an already-approved request again.
    const bookingSnap = await tx.get(bookingRef);
    if (!bookingSnap.exists) {
      const statusSnap = await tx.get(statusRef);
      const status = statusSnap.exists ? statusSnap.data() : {};
      if (String(status.status || '').includes('القبول')) return { ...status, bookingCode, code: status.studentCode, alreadyApproved: true };
      throw new HttpsError('not-found', 'الحجز غير موجود أو تم التعامل معه من قبل.');
    }
    const status = {};
    const booking = bookingSnap.data() || {};
    const existingStudentCode = text(booking.studentCode || status.studentCode, 40);
    const oldParentCode = text(booking.parentCode || status.parentCode, 40);
    const studentCode = /^\d{6,12}$/.test(existingStudentCode) ? existingStudentCode : fallbackStudentCode;
    const parentCode = studentCode;
    const name = text(booking.studentName || booking.name, 100);
    const student = {
      ...booking,
      id: studentCode,
      code: studentCode,
      studentCode,
      parentCode,
      bookingCode,
      name,
      studentName: name,
      paid: false,
      paymentDate: '',
      active: true,
      approvalStatus: 'تم القبول والتسجيل كطالب',
      acceptedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    const portal = portalResponse(student, []);
    tx.set(db.collection('students').doc(studentCode), student, { merge: true });
    tx.set(db.collection('student_portal').doc(studentCode), { ...portal, parentCode, active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.collection('parent_portal').doc(parentCode), { ...portal, parentCode, active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (oldParentCode && oldParentCode !== parentCode) tx.delete(db.collection('parent_portal').doc(cleanDocId(oldParentCode)));
    tx.set(db.collection('payments').doc(studentCode), { studentCode, studentName: name, grade: student.grade, group: student.group, academicYear: student.academicYear, term: student.term, paid: false, paymentDate: '', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(statusRef, { ...status, code: bookingCode, name, studentName: name, studentCode, parentCode, status: 'تم القبول والتسجيل كطالب', acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.delete(bookingRef);
    tx.set(db.collection('activityLog').doc(), { action: 'تم قبول الحجز وتسجيل الطالب', meta: { bookingCode, studentCode }, actorUid: staff.uid, actorEmail: staff.email || '', actorRole: staff.role || '', createdAt: FieldValue.serverTimestamp() });
    return { ...student, bookingCode, code: studentCode };
  });
});

exports.getBookingStatus = onCall(CALLABLE_OPTIONS, async request => {
  const code = normalizeCode(request.data && request.data.code);
  await rateLimitPublic('booking-status', code, request, 10, 40, 60 * 1000);
  if (!validLegacyOrStrongCode(code)) throw new HttpsError('invalid-argument', 'كود الحجز غير صالح.');
  let snap = await db.collection('booking_status').doc(cleanDocId(code)).get();
  if (!snap.exists) snap = await db.collection('bookings').doc(cleanDocId(code)).get();
  if (!snap.exists) throw new HttpsError('not-found', 'لم يتم العثور على الحجز.');
  const data = snap.data();
  return {
    code,
    name: text(data.name || data.studentName, 80),
    grade: text(data.grade, 80),
    month: text(data.month, 40),
    group: text(data.group, 100),
    scheduleId: text(data.scheduleId, 100),
    scheduleDays: text(data.scheduleDays, 100),
    scheduleStartTime: text(data.scheduleStartTime, 20),
    scheduleEndTime: text(data.scheduleEndTime, 20),
    academicYear: text(data.academicYear, 20),
    term: text(data.term, 40),
    status: text(data.status, 100)
  };
});

exports.rejectBooking = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const bookingCode = normalizeCode(request.data && request.data.code);
  if (!validLegacyOrStrongCode(bookingCode)) throw new HttpsError('invalid-argument', 'كود الحجز غير صالح.');
  const bookingRef = db.collection('bookings').doc(cleanDocId(bookingCode));
  const statusRef = db.collection('booking_status').doc(cleanDocId(bookingCode));
  return db.runTransaction(async tx => {
    const [bookingSnap, statusSnap] = await Promise.all([tx.get(bookingRef), tx.get(statusRef)]);
    const data = bookingSnap.exists ? bookingSnap.data() : (statusSnap.exists ? statusSnap.data() : null);
    if (!data) throw new HttpsError('not-found', 'الحجز غير موجود.');
    const studentCode = text(data.studentCode, 40);
    const parentCode = text(data.parentCode, 40);
    if (studentCode) {
      tx.set(db.collection('students').doc(cleanDocId(studentCode)), { active: false, approvalStatus: 'تم رفض الحجز', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(db.collection('student_portal').doc(cleanDocId(studentCode)), { active: false, approvalStatus: 'تم رفض الحجز', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (parentCode) tx.set(db.collection('parent_portal').doc(cleanDocId(parentCode)), { active: false, approvalStatus: 'تم رفض الحجز', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(statusRef, { ...data, status: 'تم رفض الحجز', rejectedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (bookingSnap.exists) tx.delete(bookingRef);
    tx.set(db.collection('activityLog').doc(), { action: 'تم رفض حجز طالب', meta: { bookingCode, studentCode }, actorUid: staff.uid, actorEmail: staff.email || '', actorRole: staff.role || '', createdAt: FieldValue.serverTimestamp() });
    return { code: bookingCode, status: 'تم رفض الحجز' };
  });
});

exports.createReview = onCall(CALLABLE_OPTIONS, async request => {
  const body = request.data || {};
  await rateLimitPublic('review', text(body.name, 60), request, 2, 8, 60 * 60 * 1000);
  const name = text(body.name, 60);
  const reviewText = text(body.text, 600);
  const rating = Math.max(1, Math.min(5, Number(body.rating || 5)));
  if (name.length < 2 || reviewText.length < 5) throw new HttpsError('invalid-argument', 'اكتب اسمًا وتقييمًا واضحًا.');
  const ref = db.collection('reviews').doc();
  await ref.set({
    id: ref.id,
    name,
    role: text(body.role, 30),
    text: reviewText,
    rating: String(rating),
    approved: false,
    date: new Date().toISOString().slice(0, 10),
    createdAt: FieldValue.serverTimestamp()
  });
  return { ok: true };
});

exports.recordClassProgress = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const body = request.data || {};
  const type = body.type === 'recitation' ? 'recitation' : (body.type === 'homework' ? 'homework' : '');
  const studentCode = normalizeCode(body.studentCode);
  const date = text(body.date, 10);
  const completed = body.completed !== false;
  if (!type || !validLegacyOrStrongCode(studentCode) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError('invalid-argument', 'بيانات متابعة الحصة غير مكتملة.');
  }
  const studentSnap = await db.collection('students').doc(cleanDocId(studentCode)).get();
  if (!studentSnap.exists || studentSnap.data().active === false) throw new HttpsError('not-found', 'الطالب غير موجود أو غير نشط.');
  const student = studentSnap.data() || {};
  const collection = type === 'recitation' ? 'recitations' : 'homework_submissions';
  const id = cleanDocId(`${studentCode}_${date}_class`);
  const ref = db.collection(collection).doc(id);
  if (!completed) {
    await ref.delete().catch(() => {});
    await markLeaderboardDirty(`${type}-removed`);
    return { id, type, studentCode, date, completed: false, removed: true };
  }
  const payload = {
    id,
    type,
    studentCode,
    studentName: text(student.studentName || student.name, 100),
    grade: text(student.grade, 80),
    group: text(student.group, 100),
    academicYear: text(student.academicYear, 20),
    term: text(student.term, 40),
    date,
    time: text(body.time, 30),
    title: type === 'recitation' ? 'تطبيق عملي الحصة' : 'واجب الحصة',
    status: type === 'recitation' ? 'تم التطبيق العملي' : 'تم عمل الواجب',
    completed: true,
    approved: true,
    method: 'teacher_class_check',
    checkedBy: staff.email || staff.uid,
    updatedAt: FieldValue.serverTimestamp()
  };
  await ref.set(payload, { merge: true });
  await markLeaderboardDirty(type);
  return { ...payload, updatedAt: new Date().toISOString() };
});

function examMatchesStudent(exam, student) {
  const gradeOk = !exam.grade || exam.grade === 'كل المسارات' || exam.grade === student.grade;
  const groupOk = !exam.group || exam.group === 'كل المجموعات' || exam.group === student.group;
  const yearOk = !exam.academicYear || !student.academicYear || exam.academicYear === student.academicYear;
  const termOk = !exam.term || !student.term || exam.term === student.term;
  return gradeOk && groupOk && yearOk && termOk;
}

function examIsOpen(exam, now = Date.now()) {
  if (exam.active === false) return false;
  const openAt = exam.openAt ? new Date(exam.openAt).getTime() : 0;
  const closeAt = exam.closeAt ? new Date(exam.closeAt).getTime() : 0;
  if (openAt && Number.isFinite(openAt) && now < openAt) return false;
  if (closeAt && Number.isFinite(closeAt) && now > closeAt) return false;
  return true;
}

exports.getExamDashboard = onCall(CALLABLE_OPTIONS, async request => {
  const studentCode = normalizeCode(request.data && request.data.studentCode);
  await rateLimitPublic('exam-dashboard', studentCode, request, 10, 35, 60 * 1000);
  const found = await getStudentPortalByCode(studentCode);
  const grade = text(found.data.grade, 80);
  const snap = await db.collection('exams').get();
  const exams = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(exam => examMatchesStudent(exam, found.data))
    .filter(exam => examIsOpen(exam))
    .map(exam => ({
      id: text(exam.id, 100),
      title: text(exam.title, 200),
      grade: text(exam.grade, 80),
      group: text(exam.group, 100),
      academicYear: text(exam.academicYear, 20),
      term: text(exam.term, 40),
      openAt: text(exam.openAt, 60),
      closeAt: text(exam.closeAt, 60),
      duration: Math.max(1, Math.min(240, Number(exam.duration || 20))),
      instructions: text(exam.instructions, 1500),
      pdfUrl: safePublicUrl(exam.pdfUrl || exam.examPdfUrl),
      pdfName: text(exam.pdfName || exam.examPdfName, 220),
      allowRetake: exam.allowRetake === true,
      questionCount: Number(exam.questionCount || parseExamQuestions(exam.text || exam.questionsText).length)
    }));
  const [attempts, records] = await Promise.all([attemptSummaries(studentCode), studentRecords(studentCode)]);
  return { student: portalResponse(found.data, attempts, records), exams };
});

exports.startExam = onCall(CALLABLE_OPTIONS, async request => {
  const studentCode = normalizeCode(request.data && request.data.studentCode);
  const examId = cleanDocId(request.data && request.data.examId);
  await rateLimitPublic('exam-start', `${studentCode}:${examId}`, request, 5, 20, 10 * 60 * 1000);
  const found = await getStudentPortalByCode(studentCode);
  const examSnap = await db.collection('exams').doc(examId).get();
  if (!examSnap.exists) throw new HttpsError('not-found', 'الامتحان غير موجود.');
  const exam = { id: examSnap.id, ...examSnap.data() };
  if (!examIsOpen(exam)) throw new HttpsError('failed-precondition', 'الامتحان غير متاح في الوقت الحالي.');
  if (!examMatchesStudent(exam, found.data)) {
    throw new HttpsError('permission-denied', 'هذا الامتحان غير مخصص لمسارك أو مجموعتك أو عامك الدراسي.');
  }
  const questions = parseExamQuestions(exam.text || exam.questionsText || '');
  if (!questions.length) throw new HttpsError('failed-precondition', 'الامتحان لا يحتوي على أسئلة صالحة.');
  if (questions.length > 200) throw new HttpsError('failed-precondition', 'عدد أسئلة الامتحان أكبر من الحد المسموح.');

  const durationMinutes = Math.max(1, Math.min(240, Number(exam.duration || 20)));
  const now = Date.now();
  const sessionId = cleanDocId(`${examId}_${studentCode}`);
  const sessionRef = db.collection('exam_sessions').doc(sessionId);
  const lockRef = db.collection('exam_locks').doc(sessionId);

  const sessionData = await db.runTransaction(async tx => {
    const [existingSessionSnap, lockSnap] = await Promise.all([tx.get(sessionRef), tx.get(lockRef)]);
    if (lockSnap.exists && exam.allowRetake !== true) {
      throw new HttpsError('already-exists', 'تم تسليم الامتحان بالفعل.');
    }
    if (existingSessionSnap.exists) {
      const existing = existingSessionSnap.data();
      const existingExpiresAt = existing.expiresAt?.toMillis ? existing.expiresAt.toMillis() : 0;
      if (existing.status === 'submitted' && exam.allowRetake !== true) {
        throw new HttpsError('already-exists', 'تم تسليم الامتحان بالفعل.');
      }
      if (existing.status === 'started' && existingExpiresAt > now) {
        return existing;
      }
      if (existing.status === 'started' && existingExpiresAt <= now && exam.allowRetake !== true) {
        throw new HttpsError('deadline-exceeded', 'انتهى وقت الامتحان ولا يمكن بدء الوقت من جديد. راجع المدرس.');
      }
    }

    const attemptSequence = existingSessionSnap.exists
      ? Number(existingSessionSnap.data().attemptSequence || 0) + 1
      : 1;
    const fresh = {
      sessionId,
      examId,
      studentCode,
      studentName: text(found.data.studentName || found.data.name, 100),
      grade: text(found.data.grade, 80),
      group: text(found.data.group, 100),
      academicYear: text(found.data.academicYear, 20),
      term: text(found.data.term, 40),
      examTitle: text(exam.title, 200),
      instructions: text(exam.instructions, 1500),
      pdfUrl: safePublicUrl(exam.pdfUrl || exam.examPdfUrl),
      pdfName: text(exam.pdfName || exam.examPdfName, 220),
      duration: durationMinutes,
      allowRetake: exam.allowRetake === true,
      attemptSequence,
      status: 'started',
      questions,
      startedAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + durationMinutes * 60 * 1000),
      deleteAt: Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    tx.set(sessionRef, fresh);
    return fresh;
  });

  const startedAtMs = sessionData.startedAt?.toMillis ? sessionData.startedAt.toMillis() : now;
  const expiresAtMs = sessionData.expiresAt?.toMillis
    ? sessionData.expiresAt.toMillis()
    : startedAtMs + durationMinutes * 60 * 1000;
  const snapshotQuestions = Array.isArray(sessionData.questions) && sessionData.questions.length
    ? sessionData.questions
    : questions;
  return publicExamSession(sessionId, {
    id: examId,
    title: sessionData.examTitle || exam.title,
    instructions: sessionData.instructions || exam.instructions,
    duration: sessionData.duration || durationMinutes,
    pdfUrl: sessionData.pdfUrl || exam.pdfUrl || exam.examPdfUrl,
    pdfName: sessionData.pdfName || exam.pdfName || exam.examPdfName
  }, snapshotQuestions, startedAtMs, expiresAtMs);
});

exports.submitExam = onCall(CALLABLE_OPTIONS, async request => {
  const body = request.data || {};
  const sessionId = cleanDocId(body.sessionId);
  const studentCode = normalizeCode(body.studentCode);
  const rawAnswers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
  if (jsonByteSize(rawAnswers) > 64 * 1024) throw new HttpsError('invalid-argument', 'حجم الإجابات أكبر من الحد المسموح.');
  await rateLimitPublic('exam-submit', `${studentCode}:${sessionId}`, request, 4, 20, 10 * 60 * 1000);
  if (!sessionId || !validLegacyOrStrongCode(studentCode)) throw new HttpsError('invalid-argument', 'بيانات المحاولة غير مكتملة.');
  const sessionRef = db.collection('exam_sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new HttpsError('not-found', 'جلسة الامتحان غير موجودة.');
  const session = sessionSnap.data();
  if (session.studentCode !== studentCode) throw new HttpsError('permission-denied', 'كود الطالب لا يطابق جلسة الامتحان.');
  if (session.status === 'submitted' && session.result) return session.result;
  const expiresAt = session.expiresAt && session.expiresAt.toMillis ? session.expiresAt.toMillis() : 0;
  if (expiresAt && Date.now() > expiresAt + 120 * 1000) throw new HttpsError('deadline-exceeded', 'انتهى وقت الامتحان.');
  const examSnap = await db.collection('exams').doc(session.examId).get();
  const exam = examSnap.exists ? { id: examSnap.id, ...examSnap.data() } : {
    id: session.examId,
    title: session.examTitle || 'امتحان',
    allowRetake: session.allowRetake === true
  };
  const questions = Array.isArray(session.questions) && session.questions.length
    ? session.questions
    : parseExamQuestions(exam.text || exam.questionsText || '');
  if (!questions.length) throw new HttpsError('failed-precondition', 'تعذر قراءة أسئلة الامتحان.');
  if (Object.keys(rawAnswers).length > questions.length + 5) throw new HttpsError('invalid-argument', 'عدد الإجابات غير صالح.');

  let correctCount = 0;
  let mcqCount = 0;
  let essayCount = 0;
  let needsManualReview = false;
  const staffAnswers = [];
  questions.forEach((question, index) => {
    const value = rawAnswers[String(index)] ?? rawAnswers[index] ?? '';
    if (question.type === 'mcq') {
      mcqCount += 1;
      const chosenIndex = Number(value);
      const chosen = Number.isInteger(chosenIndex) ? question.options[chosenIndex] || '' : '';
      const correct = mcqCorrect(question, chosenIndex);
      if (correct === true) correctCount += 1;
      if (correct === null) needsManualReview = true;
      staffAnswers.push({
        question: question.question,
        type: 'mcq',
        answer: text(chosen, 1000),
        answerIndex: Number.isInteger(chosenIndex) ? chosenIndex : null,
        correct,
        correctAnswer: question.answer,
        options: question.options,
        optionLabels: question.optionLabels
      });
    } else {
      essayCount += 1;
      needsManualReview = true;
      staffAnswers.push({
        question: question.question,
        type: 'essay',
        answer: text(value, 4000),
        correct: null,
        correctAnswer: 'يصححها المدرس'
      });
    }
  });

  const autoScore = mcqCount ? Math.round((correctCount / mcqCount) * 100) : null;
  const score = needsManualReview ? null : (autoScore || 0);
  const attemptRef = db.collection('exam_attempts').doc();
  const submittedAt = new Date().toISOString();
  const attempt = {
    id: attemptRef.id,
    examId: session.examId,
    examTitle: text(exam.title, 200),
    studentCode,
    studentName: text(session.studentName, 100),
    grade: text(session.grade, 80),
    group: text(session.group, 100),
    academicYear: text(session.academicYear, 20),
    term: text(session.term, 40),
    startedAt: session.startedAt && session.startedAt.toDate ? session.startedAt.toDate().toISOString() : submittedAt,
    submittedAt,
    score,
    autoScore,
    maxScore: 100,
    mcqCount,
    essayCount,
    questionCount: questions.length,
    correctCount,
    needsManualReview,
    status: needsManualReview ? 'pending_manual' : 'submitted',
    answers: staffAnswers,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  const summary = {
    id: attemptRef.id,
    examId: session.examId,
    examTitle: attempt.examTitle,
    submittedAt,
    score,
    autoScore,
    needsManualReview,
    status: attempt.status,
    academicYear: attempt.academicYear,
    term: attempt.term
  };
  const lockRef = db.collection('exam_locks').doc(cleanDocId(`${session.examId}_${studentCode}`));
  const studentAttemptsRef = db.collection('student_attempts').doc(cleanDocId(studentCode));
  const summaryRef = studentAttemptsRef.collection('attempts').doc(attemptRef.id);
  const committedResult = await db.runTransaction(async tx => {
    const latestSession = await tx.get(sessionRef);
    if (!latestSession.exists) throw new HttpsError('not-found', 'جلسة الامتحان غير موجودة.');
    const latestData = latestSession.data();
    if (latestData.status === 'submitted' && latestData.result) return latestData.result;
    if (session.allowRetake !== true) {
      const existingLock = await tx.get(lockRef);
      if (existingLock.exists) throw new HttpsError('already-exists', 'تم تسليم الامتحان بالفعل.');
    }
    tx.set(attemptRef, attempt);
    tx.set(summaryRef, summary);
    tx.set(studentAttemptsRef, { studentCode, lastAttempt:summary, count:FieldValue.increment(1), updatedAt:FieldValue.serverTimestamp() }, { merge: true });
    if (session.allowRetake !== true) tx.set(lockRef, { examId: session.examId, studentCode, attemptId: attemptRef.id, submittedAt: FieldValue.serverTimestamp() });
    tx.update(sessionRef, { status: 'submitted', result: summary, submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), deleteAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000) });
    return summary;
  });
  return committedResult;
});

exports.prepareHomeworkUpload = onCall(CALLABLE_OPTIONS, async request => {
  const body = request.data || {};
  const studentCode = normalizeCode(body.studentCode);
  await rateLimitPublic('homework-prepare', studentCode, request, 5, 15, 60 * 60 * 1000);
  await getStudentPortalByCode(studentCode);
  const fileName = text(body.fileName, 180).replace(/[\\/#?\[\]]/g, '-');
  const contentType = text(body.contentType, 100);
  const size = Number(body.size || 0);
  if (!fileName || !Number.isFinite(size) || size <= 0 || size > 10 * 1024 * 1024) throw new HttpsError('invalid-argument', 'بيانات ملف الواجب غير صالحة.');
  if (!(['image/jpeg','image/png','image/webp','application/pdf'].includes(contentType))) throw new HttpsError('invalid-argument', 'مسموح بالصور وملفات PDF فقط.');
  const uploadId = crypto.randomBytes(18).toString('hex');
  const safeName = `${Date.now()}-${fileName}`.slice(0, 220);
  await db.collection('_homework_upload_tokens').doc(uploadId).set({
    studentCode,
    safeName,
    contentType,
    size,
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
    createdAt: FieldValue.serverTimestamp()
  });
  return { uploadId, safeName, path: `homework/${cleanDocId(studentCode)}/${uploadId}/${safeName}` };
});

exports.registerHomeworkSubmission = onCall(CALLABLE_OPTIONS, async request => {
  const body = request.data || {};
  const studentCode = normalizeCode(body.studentCode);
  await rateLimitPublic('homework-submit', studentCode, request, 5, 15, 60 * 60 * 1000);
  const found = await getStudentPortalByCode(studentCode);
  const uploadId = text(body.uploadId, 80);
  const tokenRef = db.collection('_homework_upload_tokens').doc(cleanDocId(uploadId));
  const tokenSnap = await tokenRef.get();
  if (!tokenSnap.exists) throw new HttpsError('permission-denied', 'انتهت صلاحية رفع الملف. ابدأ الرفع من جديد.');
  const token = tokenSnap.data() || {};
  const expiresAt = token.expiresAt?.toMillis?.() || 0;
  if (token.studentCode !== studentCode || expiresAt <= Date.now()) {
    await tokenRef.delete().catch(() => {});
    throw new HttpsError('permission-denied', 'انتهت صلاحية رفع الملف. ابدأ الرفع من جديد.');
  }
  const filePath = text(body.path || body.filePath, 500);
  const expectedPath = `homework/${cleanDocId(studentCode)}/${uploadId}/${token.safeName}`;
  if (filePath !== expectedPath) {
    throw new HttpsError('permission-denied', 'مسار ملف الواجب غير صالح.');
  }
  const bucket = admin.storage().bucket();
  let metadata;
  try{[metadata] = await bucket.file(filePath).getMetadata();}catch(error){throw new HttpsError('not-found', 'ملف الواجب لم يكتمل رفعه. حاول مرة أخرى.');}
  const size = Number(metadata.size || 0),contentType = text(metadata.contentType, 100);
  if (size !== Number(token.size) || contentType !== token.contentType) throw new HttpsError('permission-denied', 'بيانات الملف المرفوع لا تطابق طلب الرفع.');
  let downloadToken = text(metadata.metadata?.firebaseStorageDownloadTokens?.split(',')?.[0], 200);
  if (!downloadToken) {
    downloadToken = crypto.randomUUID();
    await bucket.file(filePath).setMetadata({ metadata: { ...(metadata.metadata || {}), firebaseStorageDownloadTokens: downloadToken } });
  }
  const fileUrl = downloadToken ? `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${encodeURIComponent(downloadToken)}` : '';
  if (!fileUrl) throw new HttpsError('internal', 'تعذر تجهيز رابط ملف الواجب. حاول مرة أخرى.');
  const ref = db.collection('homework_submissions').doc();
  const batch = db.batch();
  batch.set(ref, {
    id: ref.id,
    studentCode,
    studentName: text(found.data.studentName || found.data.name, 100),
    grade: text(found.data.grade, 80),
    group: text(found.data.group, 100),
    academicYear: text(found.data.academicYear, 20),
    term: text(found.data.term, 40),
    fileName: text(body.fileName || token.safeName, 180),
    fileUrl,
    url: fileUrl,
    filePath,
    path: filePath,
    contentType,
    size,
    status: 'بانتظار مراجعة المدرس',
    completed: false,
    approved: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  batch.delete(tokenRef);
  await batch.commit();
  return { id: ref.id, ok: true };
});

exports.reportClientError = onCall(CALLABLE_OPTIONS, async request => {
  const body = request.data || {};
  await rateLimitPublic('client-error', text(body.page, 120), request, 5, 15, 60 * 60 * 1000);
  await db.collection('client_errors').add({
    message: text(body.message, 1000),
    page: text(body.page, 500),
    userAgent: text(body.userAgent, 500),
    createdAt: FieldValue.serverTimestamp()
  });
  return { ok: true };
});


const BACKUP_COLLECTIONS = [
  'settings','users','students','student_portal','parent_portal','bookings','booking_status','reviews',
  'materials','questions','groups','assignments','exams','exam_attempts','homework_submissions',
  'attendance','recitations','grades','payments','reports','activityLog','client_errors',
  'student_attempts','exam_locks'
];

function encodeBackupValue(value) {
  if (value instanceof Timestamp) return { __mfType: 'timestamp', iso: value.toDate().toISOString() };
  if (value instanceof admin.firestore.GeoPoint) return { __mfType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (Array.isArray(value)) return value.map(encodeBackupValue);
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = encodeBackupValue(item);
    return output;
  }
  return value;
}

function decodeBackupValue(value) {
  if (Array.isArray(value)) return value.map(decodeBackupValue);
  if (value && typeof value === 'object') {
    if (value.__mfType === 'timestamp' && value.iso) return Timestamp.fromDate(new Date(value.iso));
    if (value.__mfType === 'geopoint') return new admin.firestore.GeoPoint(Number(value.latitude), Number(value.longitude));
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = decodeBackupValue(item);
    return output;
  }
  return value;
}

async function exportCollection(collectionName) {
  const snap = await db.collection(collectionName).get();
  const rows = [];
  for (const doc of snap.docs) {
    const row = { id: doc.id, data: encodeBackupValue(doc.data()) };
    if (collectionName === 'student_attempts') {
      const attempts = await doc.ref.collection('attempts').get();
      row.attempts = attempts.docs.map(attempt => ({ id: attempt.id, data: encodeBackupValue(attempt.data()) }));
    }
    rows.push(row);
  }
  return rows;
}

async function createPlatformBackup(reason, actor = {}) {
  const collections = {};
  for (const name of BACKUP_COLLECTIONS) collections[name] = await exportCollection(name);
  const payload = {
    schemaVersion: 54,
    backupFormatVersion: 2,
    project: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'eng-amr-khaled-academy',
    reason: text(reason, 100),
    createdAt: new Date().toISOString(),
    actor: { uid: text(actor.uid, 120), email: text(actor.email, 200), role: text(actor.role, 40) },
    collections
  };
  const buffer = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `automatic-backups/${stamp}-${text(reason || 'scheduled', 40).replace(/[^a-zA-Z0-9_-]/g, '-')}.json.gz`;
  const bucket = admin.storage().bucket();
  await bucket.file(name).save(buffer, { resumable: false, contentType: 'application/gzip', metadata: { cacheControl: 'private, max-age=0', metadata: { schemaVersion: '54', reason: text(reason, 100) } } });
  await db.collection('backup_runs').add({ name, reason: text(reason, 100), size: buffer.length, createdAt: FieldValue.serverTimestamp(), actorUid: text(actor.uid, 120) });
  return { name, size: buffer.length, createdAt: payload.createdAt };
}

async function pruneBackups(retentionDays = 14) {
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles({ prefix: 'automatic-backups/' });
  const cutoff = Date.now() - Math.max(3, Math.min(90, Number(retentionDays) || 14)) * 24 * 60 * 60 * 1000;
  await Promise.all(files.filter(file => new Date(file.metadata.timeCreated || 0).getTime() < cutoff).map(file => file.delete().catch(() => null)));
}

exports.scheduledPlatformBackup = onSchedule({ schedule: '30 2 * * *', timeZone: 'Africa/Cairo', region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  const settings = await db.collection('settings').doc('platform').get().catch(() => null);
  const retentionDays = settings?.exists ? Number(settings.data().backupRetentionDays || 14) : 14;
  await createPlatformBackup('scheduled');
  await pruneBackups(retentionDays);
});

exports.createBackupNow = onCall({ region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB' }, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const result = await createPlatformBackup('manual', staff);
  await pruneBackups(14);
  return result;
});

exports.listAutomaticBackups = onCall(CALLABLE_OPTIONS, async request => {
  await requireStaff(request, ['admin', 'teacher']);
  const [files] = await admin.storage().bucket().getFiles({ prefix: 'automatic-backups/' });
  const backups = files.map(file => ({ name: file.name, size: Number(file.metadata.size || 0), createdAt: file.metadata.timeCreated || '' }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50);
  return { backups };
});

exports.getBackupDownloadUrl = onCall(CALLABLE_OPTIONS, async request => {
  await requireStaff(request, ['admin', 'teacher']);
  const name = text(request.data && request.data.name, 500);
  if (!name.startsWith('automatic-backups/')) throw new HttpsError('invalid-argument', 'مسار النسخة غير صالح.');
  const [url] = await admin.storage().bucket().file(name).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000, version: 'v4' });
  return { url };
});


async function deleteRootCollection(collectionName) {
  while (true) {
    const snap = await db.collection(collectionName).limit(350).get();
    if (snap.empty) return;
    const refs = [];
    for (const doc of snap.docs) {
      if (collectionName === 'student_attempts') {
        const attempts = await doc.ref.collection('attempts').get().catch(() => null);
        if (attempts) refs.push(...attempts.docs.map(item => item.ref));
      }
      refs.push(doc.ref);
    }
    await commitDeleteRefs(refs);
    if (snap.size < 350) return;
  }
}

async function restoreCollection(collectionName, rows) {
  await deleteRootCollection(collectionName);
  const operations = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.id || !row.data) continue;
    const ref = db.collection(collectionName).doc(cleanDocId(row.id));
    operations.push(batch => batch.set(ref, decodeBackupValue(row.data)));
    if (collectionName === 'student_attempts') {
      for (const attempt of Array.isArray(row.attempts) ? row.attempts : []) {
        if (!attempt || !attempt.id || !attempt.data) continue;
        operations.push(batch => batch.set(ref.collection('attempts').doc(cleanDocId(attempt.id)), decodeBackupValue(attempt.data)));
      }
    }
  }
  const queue = operations.slice();
  while (queue.length) {
    const batch = db.batch();
    queue.splice(0, 350).forEach(operation => operation(batch));
    await batch.commit();
  }
}

exports.restoreAutomaticBackup = onCall({ region: 'europe-west1', timeoutSeconds: 540, memory: '1GiB' }, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const name = text(request.data && request.data.name, 500);
  const confirmation = text(request.data && request.data.confirmation, 50);
  if (!name.startsWith('automatic-backups/') || !name.endsWith('.json.gz')) {
    throw new HttpsError('invalid-argument', 'مسار النسخة غير صالح.');
  }
  if (!['RESTORE-V53', 'RESTORE-V54'].includes(confirmation)) throw new HttpsError('failed-precondition', 'تأكيد الاستعادة غير صحيح.');

  const file = admin.storage().bucket().file(name);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'النسخة الاحتياطية غير موجودة.');
  const [compressed] = await file.download();
  let payload;
  try { payload = JSON.parse(zlib.gunzipSync(compressed).toString('utf8')); }
  catch (_) { throw new HttpsError('data-loss', 'تعذر قراءة النسخة الاحتياطية.'); }
  if (!payload || ![53,54].includes(payload.schemaVersion) || payload.backupFormatVersion !== 2 || !payload.collections) {
    throw new HttpsError('failed-precondition', 'هذه النسخة ليست بصيغة الاستعادة الآمنة للإصدار 53.');
  }

  const safetyBackup = await createPlatformBackup('pre-restore', staff);
  for (const collectionName of BACKUP_COLLECTIONS) {
    await restoreCollection(collectionName, payload.collections[collectionName] || []);
  }
  await db.collection('activityLog').add({
    action: 'تمت استعادة نسخة احتياطية سحابية',
    meta: { restoredFrom: name, safetyBackup: safetyBackup.name },
    actorUid: staff.uid, actorEmail: staff.email || '', actorRole: staff.role || '', createdAt: FieldValue.serverTimestamp()
  });
  return { ok: true, restoredFrom: name, safetyBackup: safetyBackup.name };
});

async function queryStudentDocuments(collection, studentCode) {
  const snap = await db.collection(collection).where('studentCode', '==', studentCode).get().catch(() => null);
  return snap ? snap.docs : [];
}

async function commitDeleteRefs(refs) {
  const queue = refs.slice();
  while (queue.length) {
    const batch = db.batch();
    queue.splice(0, 400).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

exports.deleteStudentSafely = onCall({ region: 'europe-west1', timeoutSeconds: 120, memory: '512MiB' }, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const studentCode = normalizeCode(request.data && request.data.studentCode);
  if (!validLegacyOrStrongCode(studentCode)) throw new HttpsError('invalid-argument', 'كود الطالب غير صالح.');
  const studentRef = db.collection('students').doc(cleanDocId(studentCode));
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) throw new HttpsError('not-found', 'الطالب غير موجود.');
  const student = studentSnap.data();
  const relatedCollections = ['attendance','grades','recitations','homework_submissions','exam_attempts'];
  const relatedEntries = {};
  const relatedDocs = [];
  for (const collection of relatedCollections) {
    const docs = await queryStudentDocuments(collection, studentCode);
    relatedEntries[collection] = docs.map(doc => ({ id: doc.id, data: doc.data() }));
    relatedDocs.push(...docs.map(doc => doc.ref));
  }
  const attemptsParent = db.collection('student_attempts').doc(cleanDocId(studentCode));
  const attemptsChildren = await attemptsParent.collection('attempts').get().catch(() => null);
  const deletionSnapshot = {
    schemaVersion: 54,
    deletedAt: new Date().toISOString(),
    deletedBy: { uid: staff.uid, email: staff.email || '', role: staff.role || '' },
    student: { id: studentSnap.id, data: student },
    related: relatedEntries,
    studentAttempts: attemptsChildren ? attemptsChildren.docs.map(doc => ({ id: doc.id, data: doc.data() })) : []
  };
  const archiveName = `deleted-students/${cleanDocId(studentCode)}/${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;
  await admin.storage().bucket().file(archiveName).save(zlib.gzipSync(Buffer.from(JSON.stringify(deletionSnapshot), 'utf8')), { resumable: false, contentType: 'application/gzip' });
  const refs = [studentRef, db.collection('student_portal').doc(cleanDocId(studentCode)), db.collection('payments').doc(cleanDocId(studentCode)), attemptsParent, ...relatedDocs];
  if (student.parentCode) refs.push(db.collection('parent_portal').doc(cleanDocId(student.parentCode)));
  if (attemptsChildren) refs.push(...attemptsChildren.docs.map(doc => doc.ref));
  await commitDeleteRefs(refs);
  await db.collection('activityLog').add({ action: 'تم حذف طالب مع نسخة استرجاع', meta: { studentCode, archiveName }, actorUid: staff.uid, actorEmail: staff.email || '', actorRole: staff.role || '', createdAt: FieldValue.serverTimestamp() });
  await markLeaderboardDirty('student-deleted');
  return { ok: true, archiveName };
});

const CODE_LANGUAGES = Object.freeze([
  { key: 'python', name: 'Python 3', judge0Id: 71, template: "print('Hello, Techno Minds!')" },
  { key: 'javascript', name: 'JavaScript (Node.js)', judge0Id: 63, template: "console.log('Hello, Techno Minds!');" },
  { key: 'typescript', name: 'TypeScript', judge0Id: 74, template: "const message: string = 'Hello, Techno Minds!';\nconsole.log(message);" },
  { key: 'c', name: 'C', judge0Id: 50, template: '#include <stdio.h>\nint main(void) {\n  printf("Hello, Techno Minds!\\n");\n  return 0;\n}' },
  { key: 'cpp', name: 'C++', judge0Id: 54, template: '#include <iostream>\nint main() {\n  std::cout << "Hello, Techno Minds!\\n";\n  return 0;\n}' },
  { key: 'java', name: 'Java', judge0Id: 62, template: 'class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, Techno Minds!");\n  }\n}' },
  { key: 'csharp', name: 'C#', judge0Id: 51, template: 'using System;\nclass Program {\n  static void Main() {\n    Console.WriteLine("Hello, Techno Minds!");\n  }\n}' },
  { key: 'go', name: 'Go', judge0Id: 60, template: 'package main\nimport "fmt"\nfunc main() { fmt.Println("Hello, Techno Minds!") }' },
  { key: 'php', name: 'PHP', judge0Id: 68, template: '<?php\necho "Hello, Techno Minds!\\n";' }
]);

function integerEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

function codeRunnerConfig() {
  return {
    baseUrl: String(process.env.JUDGE0_BASE_URL || 'https://ce.judge0.com').replace(/\/$/, ''),
    apiKey: String(process.env.JUDGE0_API_KEY || ''),
    apiKeyHeader: String(process.env.JUDGE0_API_KEY_HEADER || 'X-Auth-Token'),
    rapidHost: String(process.env.JUDGE0_RAPIDAPI_HOST || ''),
    codeMax: integerEnv('CODE_MAX_BYTES', 65536, 1024, 262144),
    stdinMax: integerEnv('STDIN_MAX_BYTES', 16384, 0, 65536),
    outputMax: integerEnv('OUTPUT_MAX_BYTES', 32768, 1024, 131072),
    cpuSeconds: integerEnv('CODE_CPU_SECONDS', 5, 1, 15),
    wallSeconds: integerEnv('CODE_WALL_SECONDS', 10, 2, 30),
    memoryKb: integerEnv('CODE_MEMORY_KB', 131072, 32768, 262144)
  };
}

function limitedOutput(value, maxBytes) {
  const raw = String(value || '');
  return Buffer.byteLength(raw, 'utf8') <= maxBytes ? raw : `${raw.slice(0, maxBytes)}\n… تم اختصار المخرجات`;
}

exports.getCodeLanguages = onCall({ ...CALLABLE_OPTIONS, timeoutSeconds: 15 }, async () => ({
  languages: CODE_LANGUAGES.map(({ key, name, template }) => ({ key, name, template }))
}));

// A public, non-sensitive post-deploy check used by DEPLOY-WINDOWS.cmd. It
// performs real Admin SDK reads so a green response proves that Functions and
// Firestore are connected. Only capability flags are returned; no records or
// configuration values are exposed.
exports.getPlatformHealth = onCall({ ...CALLABLE_OPTIONS, timeoutSeconds: 15 }, async () => {
  await Promise.all([
    db.collection('settings').doc('platform').get(),
    db.collection('groups').limit(1).get()
  ]);
  return {
    status: 'ok',
    version: '60.2.1',
    firestore: true,
    services: {
      booking: true,
      studentPortal: true,
      administration: true,
      codeRunner: true
    }
  };
});

exports.submitCodeExecution = onCall({ ...CALLABLE_OPTIONS, timeoutSeconds: 30, memory: '256MiB' }, async request => {
  const config = codeRunnerConfig();
  const language = CODE_LANGUAGES.find(item => item.key === String(request.data?.language || ''));
  if (!language) throw new HttpsError('invalid-argument', 'لغة البرمجة غير مدعومة.');
  const sourceCode = String(request.data?.sourceCode || '');
  const stdin = String(request.data?.stdin || '');
  if (!sourceCode.trim()) throw new HttpsError('invalid-argument', 'اكتب الكود قبل التشغيل.');
  if (Buffer.byteLength(sourceCode, 'utf8') > config.codeMax) throw new HttpsError('invalid-argument', 'حجم الكود أكبر من الحد المسموح.');
  if (Buffer.byteLength(stdin, 'utf8') > config.stdinMax) throw new HttpsError('invalid-argument', 'بيانات الإدخال أكبر من الحد المسموح.');
  // The practical lab is public. Abuse is limited per visitor IP while code is
  // still executed in Judge0 without network access and with strict resources.
  const visitorIdentity = requestIp(request) || text(request.data?.visitorId, 80) || 'anonymous';
  await rateLimitPublic('code-run-public', visitorIdentity, request, 12, 35, 60 * 1000);

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (config.apiKey) headers[config.apiKeyHeader] = config.apiKey;
  if (config.rapidHost) headers['X-RapidAPI-Host'] = config.rapidHost;
  const judge0Base = config.baseUrl.replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let response;
  let data;
  try {
    // Judge0 documents that wait=true is not enabled on every host and does
    // not scale well. Submit asynchronously, then poll the returned token so
    // the lab works with both managed and self-hosted Judge0 deployments.
    response = await fetch(`${judge0Base}/submissions?base64_encoded=false&wait=false`, {
      method: 'POST', headers, signal: controller.signal,
      body: JSON.stringify({
        language_id: language.judge0Id,
        source_code: sourceCode,
        stdin,
        cpu_time_limit: config.cpuSeconds,
        wall_time_limit: config.wallSeconds,
        memory_limit: config.memoryKb,
        enable_network: false,
        max_file_size: 1024
      })
    });
    if (!response.ok) throw new Error(`judge0-submit-${response.status}`);
    data = await response.json();
    const submissionToken = text(data.token, 120);
    if (submissionToken && (!data.status || Number(data.status.id || 0) <= 2)) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 450));
        const poll = await fetch(`${judge0Base}/submissions/${encodeURIComponent(submissionToken)}?base64_encoded=false&fields=stdout,time,memory,stderr,compile_output,message,status,exit_code`, {
          method: 'GET', headers, signal: controller.signal
        });
        if (!poll.ok) throw new Error(`judge0-poll-${poll.status}`);
        data = await poll.json();
        if (Number(data.status?.id || 0) > 2) break;
      }
    }
    if (!data.status || Number(data.status.id || 0) <= 2) throw new Error('judge0-timeout');
  } catch (error) {
    const message = String(error?.message || '');
    throw new HttpsError('unavailable', error?.name === 'AbortError' || /timeout/.test(message) ? 'انتهت مهلة تشغيل الكود.' : `خدمة تشغيل الأكواد غير متاحة حاليًا${/judge0-(?:submit|poll)-\d+/.test(message) ? ` (${message.replace('judge0-', '')})` : ''}.`);
  } finally { clearTimeout(timeout); }
  const runId = crypto.randomUUID();
  const result = {
    runId,
    status: text(data.status?.description || 'Unknown', 80),
    stdout: limitedOutput(data.stdout, config.outputMax),
    stderr: limitedOutput(data.stderr, config.outputMax),
    compileOutput: limitedOutput(data.compile_output, config.outputMax),
    message: limitedOutput(data.message, config.outputMax),
    time: text(data.time, 30),
    memory: Number(data.memory || 0),
    exitCode: data.exit_code ?? null
  };
  await db.collection('code_execution_runs').doc(runId).set({
    ...result,
    visitorHash: hash(visitorIdentity),
    ipHash: hash(requestIp(request)),
    language: language.key,
    sourceHash: hash(sourceCode),
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000)
  });
  return result;
});

exports.getCodeExecutionResult = onCall({ ...CALLABLE_OPTIONS, timeoutSeconds: 15 }, async request => {
  const runId = text(request.data?.runId, 80);
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new HttpsError('invalid-argument', 'رقم عملية التشغيل غير صالح.');
  const snap = await db.collection('code_execution_runs').doc(runId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'نتيجة التشغيل انتهت أو غير موجودة.');
  const data = snap.data();
  if (data.ipHash !== hash(requestIp(request))) throw new HttpsError('permission-denied', 'هذه النتيجة تخص جلسة أخرى.');
  return {
    runId,
    status: data.status || '', stdout: data.stdout || '', stderr: data.stderr || '',
    compileOutput: data.compileOutput || '', message: data.message || '',
    time: data.time || '', memory: Number(data.memory || 0), exitCode: data.exitCode ?? null
  };
});
