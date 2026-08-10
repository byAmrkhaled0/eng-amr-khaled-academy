'use strict';

const crypto = require('crypto');
const zlib = require('zlib');
const admin = require('firebase-admin');
const { version: PLATFORM_VERSION } = require('./package.json');
const { money, paymentStatus, paymentTotals } = require('./payment-domain');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const { scheduledTimeMillis, assignmentIsReleased, assignmentDueDatePassed } = require('./lib/assignment-schedule');
const {
  ACADEMIC_GRADES,
  canonicalAcademicLabel,
  isSupportedAcademicGrade,
  sameAcademicValue,
  scheduleMatchesStudent,
  learningTargetMatchesStudent,
  academicAudienceKeysForStudent,
  academicAudienceKeysForItem
} = require('./lib/academic-targeting');
const { studentCanOpenPortal, studentIsApproved } = require('./lib/student-access');
const {
  homeworkLockId,
  submissionIdForAttempt,
  decideHomeworkAttempt,
  publicHomeworkProjection
} = require('./lib/homework-domain');
const {
  normalizeUnifiedResults,
  homeworkMetrics,
  configurableOverallAverage
} = require('./lib/portal-results');
const { configuredScheduleDays, cairoWeekdayForDate } = require('./lib/attendance-domain');
const {
  studentNameKey,
  recordNameKey,
  phoneMatchesStudent,
  studentRecordIsRejected
} = require('./lib/student-identity');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10, memory: '256MiB' });

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;
const PAYMENT_MONTH_NAMES = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
// Callable endpoints must accept the browser's unauthenticated CORS preflight.
// Sensitive operations still enforce staff authentication inside each handler.
const CALLABLE_OPTIONS = { region: 'europe-west1', timeoutSeconds: 30, invoker: 'public' };
const API_SCHEMA_VERSION = 'portal-v63.0.4';

function apiMetadata() {
  return { frontendVersion: PLATFORM_VERSION, backendVersion: PLATFORM_VERSION, apiSchemaVersion: API_SCHEMA_VERSION };
}

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

function validPhone(value) {
  const phone = digits(value);
  return phone.length >= 10 && phone.length <= 15 && !/^(\d)\1+$/.test(phone);
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

function randomAttendanceCode() {
  return `ATT-${crypto.randomBytes(9).toString('base64url').toUpperCase()}`;
}

async function createPortalSession(studentCode, mode, request) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  const now = Date.now();
  const expiresAt = now + 30 * 60 * 1000;
  await db.collection('_portal_sessions').doc(tokenHash).create({
    studentCode,
    mode: mode === 'parent' ? 'parent' : 'student',
    ipHash: hash(requestIp(request)).slice(0, 32),
    userAgentHash: hash(text(request.rawRequest?.headers?.['user-agent'], 500)).slice(0, 32),
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(expiresAt)
  });
  return { token, expiresAt };
}

async function requirePortalSession(request, expectedStudentCode, allowedModes = ['student']) {
  const token = text(request.data?.portalSessionToken, 1000);
  if (!token || token.length < 32) throw new HttpsError('unauthenticated', 'انتهت جلسة البوابة. افتح حساب الطالب من جديد.');
  const ref = db.collection('_portal_sessions').doc(hash(token));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('unauthenticated', 'جلسة البوابة غير صالحة.');
  const session = snap.data() || {};
  const expiresAt = session.expiresAt?.toMillis?.() || 0;
  if (expiresAt <= Date.now()) {
    await ref.delete().catch(() => {});
    throw new HttpsError('unauthenticated', 'انتهت جلسة البوابة. افتح الحساب من جديد.');
  }
  if (normalizeCode(session.studentCode) !== normalizeCode(expectedStudentCode) || !allowedModes.includes(session.mode)) {
    throw new HttpsError('permission-denied', 'الجلسة لا تخص هذا الحساب.');
  }
  return session;
}

function publicStudentName(value) {
  // The teacher requested the leaderboard to use the exact full student name
  // saved on the platform instead of shortening the family name to an initial.
  return text(value, 80).replace(/\s+/g, ' ').trim();
}

function studentNameRegistryRef(nameKey) {
  return db.collection('_student_names').doc(hash(nameKey).slice(0, 48));
}

function existingStudentCode(record = {}, fallbackId = '') {
  return normalizeCode(record.studentCode || record.code || record.bookingCode || record.id || fallbackId);
}

function existingBookingResponse(record = {}, fallbackId = '') {
  const studentCode = existingStudentCode(record, fallbackId);
  return {
    code: studentCode,
    bookingCode: normalizeCode(record.bookingCode || record.code || studentCode),
    studentCode,
    parentCode: studentCode,
    status: text(record.approvalStatus || record.status || (record.active === false ? 'قيد التسجيل' : 'تم القبول والتسجيل كطالب'), 100),
    alreadyExists: true
  };
}

async function registeredStudentForName(name, nameKey, studentPhone = '', parentPhone = '') {
  const registryRef = studentNameRegistryRef(nameKey);
  const registrySnap = await registryRef.get().catch(() => null);
  if (registrySnap?.exists) {
    const registeredCode = existingStudentCode(registrySnap.data());
    const registeredSnap = registeredCode
      ? await db.collection('students').doc(cleanDocId(registeredCode)).get().catch(() => null)
      : null;
    if (registeredSnap?.exists) {
      const record = { id: registeredSnap.id, ...registeredSnap.data(), _documentId: registeredSnap.id };
      if (recordNameKey(record) === nameKey && !studentRecordIsRejected(record)) {
        return { record, registryRef };
      }
    }
    // An edited/deleted/rejected student must not keep an old name reserved.
    await registryRef.delete().catch(() => {});
  }

  // Older records predate the normalized name registry. Exact indexed queries
  // migrate them lazily without scanning the whole students collection.
  const normalizedStudentPhone = digits(studentPhone);
  const normalizedParentPhone = digits(parentPhone);
  const phoneQueries = [...new Set([normalizedStudentPhone, normalizedParentPhone].filter(Boolean))]
    .flatMap(phone => [
      db.collection('students').where('studentPhone', '==', phone).limit(3).get().catch(() => null),
      db.collection('students').where('parentPhone', '==', phone).limit(3).get().catch(() => null)
    ]);
  const [keySnap, studentNameSnap, nameSnap, ...phoneSnaps] = await Promise.all([
    db.collection('students').where('nameKey', '==', nameKey).limit(3).get().catch(() => null),
    db.collection('students').where('studentName', '==', name).limit(3).get().catch(() => null),
    db.collection('students').where('name', '==', name).limit(3).get().catch(() => null),
    ...phoneQueries
  ]);
  const candidates = new Map();
  for (const snap of [keySnap, studentNameSnap, nameSnap, ...phoneSnaps]) {
    if (snap) snap.docs.forEach(doc => candidates.set(doc.id, { id: doc.id, ...doc.data(), _documentId: doc.id }));
  }
  const record = [...candidates.values()].find(item =>
    recordNameKey(item) === nameKey && !studentRecordIsRejected(item) && existingStudentCode(item)
  );
  return record ? { record, registryRef } : { record: null, registryRef };
}

async function returnExistingStudent(record, registryRef, requestRef, requestId, name, nameKey, studentPhone, parentPhone) {
  if (!phoneMatchesStudent(record, studentPhone, parentPhone)) {
    throw new HttpsError(
      'already-exists',
      'الطالب موجود بالفعل. اكتب رقم الطالب أو ولي الأمر المسجل لاسترجاع الكود، أو تواصل مع الإدارة.'
    );
  }
  const response = existingBookingResponse(record);
  if (!validLegacyOrStrongCode(response.studentCode)) {
    throw new HttpsError('failed-precondition', 'الطالب موجود بالفعل، لكن يلزم التواصل مع الإدارة لاسترجاع الكود.');
  }
  const batch = db.batch();
  batch.set(registryRef, {
    name,
    nameKey,
    studentCode: response.studentCode,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  const studentRef = db.collection('students').doc(cleanDocId(record._documentId || response.studentCode));
  const oldParentCode = normalizeCode(record.parentCode);
  const unified = { ...record, studentCode: response.studentCode, code: response.studentCode, parentCode: response.studentCode, nameKey };
  const portal = portalResponse(unified, []);
  batch.set(studentRef, { studentCode: response.studentCode, code: response.studentCode, parentCode: response.studentCode, nameKey, accessCodeVersion: 2, accessUnifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.collection('student_portal').doc(cleanDocId(response.studentCode)), { ...portal, studentCode: response.studentCode, parentCode: response.studentCode, active: record.active !== false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.collection('parent_portal').doc(cleanDocId(response.studentCode)), { ...portal, studentCode: response.studentCode, parentCode: response.studentCode, active: record.active !== false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (oldParentCode && oldParentCode !== response.studentCode) batch.delete(db.collection('parent_portal').doc(cleanDocId(oldParentCode)));
  if (requestRef) {
    batch.set(requestRef, {
      requestId,
      response,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
    }, { merge: true });
  }
  await batch.commit();
  return response;
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

async function requireStaff(request) {
  if (!request.auth || !request.auth.uid) throw new HttpsError('unauthenticated', 'يجب تسجيل دخول الإدارة.');
  if (request.auth.token?.email_verified !== true || request.auth.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'الحساب غير مصرح له بهذه العملية.');
  }
  const userSnap = await db.collection('users').doc(request.auth.uid).get();
  const profile = userSnap.exists ? userSnap.data() : {};
  if (!userSnap.exists || profile.active === false || profile.role !== 'admin') {
    throw new HttpsError('permission-denied', 'الحساب غير مصرح له بهذه العملية.');
  }
  return { ...profile, uid: request.auth.uid, email: request.auth.token?.email || '' };
}

// Bootstrap is deliberately claim-only. An email address is not an authorization
// boundary: Firebase Console/Admin SDK must set the `admin` custom claim once.
exports.activateOwnerAccount = onCall(CALLABLE_OPTIONS, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'سجّل الدخول أولًا.');
  const email = String(request.auth.token?.email || '').trim().toLowerCase();
  if (request.auth.token?.email_verified !== true || request.auth.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'تفعيل حساب المالك يتطلب بريدًا موثقًا وصلاحية Admin من Firebase.');
  }
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
    data: { type: 'new-booking', bookingCode: text(booking.code, 40), title: 'حجز طالب جديد', body: `${text(booking.name, 80)} · ${text(booking.grade, 60)} · ${text(booking.group, 80)}`, url: '/teacher-login.html?section=bookings' },
    webpush: {
      notification: {
        title: 'حجز طالب جديد',
        body: `${text(booking.name, 80)} · ${text(booking.grade, 60)} · ${text(booking.group, 80)}`,
        icon: '/assets/technominds-logo.png',
        badge: '/assets/technominds-logo.png',
        tag: `booking-${text(booking.code, 40)}`,
        renotify: false,
        data: { url: '/teacher-login.html?section=bookings' }
      },
      fcmOptions: { link: '/teacher-login.html?section=bookings' }
    }
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
  await db.collection('staff_push_tokens').doc(tokenId).set({ token, uid: staff.uid, role: staff.role || '', active: true, userAgent: text(request.data?.userAgent, 250), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { registered: true };
});

exports.unregisterTeacherPushToken = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const token = text(request.data && request.data.token, 500);
  if (token.length < 40) return { unregistered: false };
  const tokenId = hash(token).slice(0, 48);
  const ref = db.collection('staff_push_tokens').doc(tokenId);
  const snap = await ref.get();
  if (snap.exists && snap.data().uid === staff.uid) {
    await ref.set({ active: false, disabledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { unregistered: true };
});

// Push delivery runs independently from the public booking request. The
// student sees the success screen as soon as Firestore commits, even if FCM is
// temporarily slow or unavailable.
exports.notifyStaffOnBookingCreated = onDocumentCreated({ document: 'bookings/{bookingCode}', region: 'europe-west1', memory: '256MiB' }, async event => {
  const booking = event.data && event.data.data();
  if (booking) await notifyStaffAboutBooking(booking);
});

function validPaymentDate(value) {
  const normalized = normalizeDigits(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : cairoDateKey(new Date());
}

function paymentPeriodId(studentCode, academicYear, month, course) {
  return hash([normalizeCode(studentCode), text(academicYear, 30), text(month, 40), text(course, 100)].join('|')).slice(0, 48);
}

function paymentAudit(staff, action, meta) {
  return {
    action,
    meta,
    actorUid: staff.uid,
    actorEmail: staff.email || '',
    actorRole: staff.role || '',
    createdAt: FieldValue.serverTimestamp()
  };
}

function paymentLegacyMirrorWrites(tx, student, summary, paymentDate) {
  const studentCode = normalizeCode(student.studentCode || student.code);
  const legacy = {
    paid: summary.status === 'paid',
    paymentDate,
    paymentAmount: summary.paidAmount,
    paymentCourse: summary.course,
    paymentMonth: summary.month,
    paymentAcademicYear: summary.academicYear,
    updatedAt: FieldValue.serverTimestamp()
  };
  tx.set(db.collection('students').doc(cleanDocId(studentCode)), legacy, { merge: true });
  tx.set(db.collection('student_portal').doc(cleanDocId(studentCode)), legacy, { merge: true });
  tx.set(db.collection('payments').doc(cleanDocId(studentCode)), {
    ...legacy,
    studentCode,
    studentName: text(student.studentName || student.name, 100),
    grade: text(student.grade, 80),
    group: text(student.group, 100)
  }, { merge: true });
  const parentCode = studentCode;
  if (parentCode) tx.set(db.collection('parent_portal').doc(cleanDocId(parentCode)), { ...legacy, studentCode, parentCode }, { merge: true });
}

exports.createPaymentTransaction = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const body = request.data || {};
  const studentCode = normalizeCode(body.studentCode);
  const amount = money(body.amount);
  const requestId = text(body.requestId, 100);
  if (!validLegacyOrStrongCode(studentCode)) throw new HttpsError('invalid-argument', 'كود الطالب غير صالح.');
  if (!requestId || amount <= 0 || amount > 1000000) throw new HttpsError('invalid-argument', 'قيمة الدفعة أو رقم الطلب غير صالح.');

  const studentRef = db.collection('students').doc(cleanDocId(studentCode));
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists || studentSnap.data().active === false) throw new HttpsError('not-found', 'الطالب غير موجود أو غير نشط.');
  const student = studentSnap.data();
  const academicYear = text(body.academicYear || student.academicYear, 30);
  const month = text(body.month || student.month, 40);
  const course = text(body.course || student.grade, 100);
  const settingsSnap = await db.collection('settings').doc('platform').get().catch(() => null);
  const configuredPrice = money(settingsSnap?.data()?.coursePrices?.[course]);
  const expectedAmount = configuredPrice || money(body.expectedAmount);
  if (!academicYear || !month || !course || expectedAmount <= 0) throw new HttpsError('failed-precondition', 'حدد الشهر والعام الدراسي وسعر الكورس أولًا.');
  const paidOn = validPaymentDate(body.paymentDate);
  const periodId = paymentPeriodId(studentCode, academicYear, month, course);
  const summaryRef = db.collection('monthly_payments').doc(periodId);
  const transactionRef = db.collection('payment_transactions').doc(hash(`${staff.uid}|${requestId}`).slice(0, 48));
  const duplicateWindow = Math.floor(Date.now() / (2 * 60 * 1000));
  const duplicateRef = db.collection('_payment_dedup').doc(hash(`${staff.uid}|${studentCode}|${periodId}|${amount}|${paidOn}|${duplicateWindow}`).slice(0, 48));
  let result;

  await db.runTransaction(async tx => {
    const [existingTransaction, duplicate, summarySnap] = await Promise.all([tx.get(transactionRef), tx.get(duplicateRef), tx.get(summaryRef)]);
    if (existingTransaction.exists) {
      const existing = existingTransaction.data();
      result = { id: existingTransaction.id, duplicate: true, periodId: existing.periodId, studentCode: existing.studentCode, amount: money(existing.amount), status: existing.status };
      return;
    }
    if (duplicate.exists) throw new HttpsError('already-exists', 'تم تسجيل دفعة مماثلة منذ لحظات. راجع السجل قبل المحاولة مرة أخرى.');
    const current = summarySnap.exists ? summarySnap.data() : {};
    const periodExpected = money(current.expectedAmount) || expectedAmount;
    const totals = paymentTotals(current, amount, periodExpected);
    if (totals.paidAmount > periodExpected) throw new HttpsError('failed-precondition', `المبلغ أكبر من المتبقي (${money(periodExpected - money(current.paidAmount))}).`);
    const transaction = {
      studentCode,
      studentName: text(student.studentName || student.name, 100),
      academicYear,
      month,
      course,
      expectedAmount: periodExpected,
      amount,
      paymentDate: paidOn,
      paymentMethod: text(body.paymentMethod || 'cash', 40),
      notes: text(body.notes, 1000),
      status: 'active',
      periodId,
      requestId,
      recordedByUid: staff.uid,
      recordedByEmail: staff.email || '',
      recordedByRole: staff.role || '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    const summary = {
      periodId,
      studentCode,
      studentName: transaction.studentName,
      academicYear,
      month,
      course,
      expectedAmount: totals.expectedAmount,
      paidAmount: totals.paidAmount,
      remainingAmount: totals.remainingAmount,
      status: totals.status,
      active: student.active !== false,
      transactionCount: Number(current.transactionCount || 0) + 1,
      activeTransactionCount: Number(current.activeTransactionCount || 0) + 1,
      lastPaymentDate: paidOn,
      createdAt: current.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    tx.create(transactionRef, transaction);
    tx.create(duplicateRef, { transactionId: transactionRef.id, expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000) });
    tx.set(summaryRef, summary, { merge: true });
    paymentLegacyMirrorWrites(tx, { ...student, studentCode }, summary, paidOn);
    tx.set(db.collection('activityLog').doc(), paymentAudit(staff, 'تم تسجيل دفعة شهرية', { transactionId: transactionRef.id, studentCode, amount, academicYear, month, course }));
    result = { id: transactionRef.id, duplicate: false, periodId, studentCode, amount, expectedAmount: summary.expectedAmount, paidAmount: summary.paidAmount, remainingAmount: summary.remainingAmount, status: summary.status };
  });
  return result;
});

exports.editPaymentTransaction = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin']);
  const transactionId = cleanDocId(text(request.data?.transactionId, 100));
  const newAmount = money(request.data?.amount);
  if (!transactionId || newAmount <= 0 || newAmount > 1000000) throw new HttpsError('invalid-argument', 'بيانات تعديل الدفعة غير صالحة.');
  const transactionRef = db.collection('payment_transactions').doc(transactionId);
  let result;
  await db.runTransaction(async tx => {
    const transactionSnap = await tx.get(transactionRef);
    if (!transactionSnap.exists) throw new HttpsError('not-found', 'عملية الدفع غير موجودة.');
    const original = transactionSnap.data();
    if (original.status !== 'active') throw new HttpsError('failed-precondition', 'لا يمكن تعديل عملية ملغاة.');
    const summaryRef = db.collection('monthly_payments').doc(original.periodId);
    const [summarySnap, studentSnap] = await Promise.all([tx.get(summaryRef), tx.get(db.collection('students').doc(cleanDocId(original.studentCode)))]);
    if (!summarySnap.exists || !studentSnap.exists) throw new HttpsError('failed-precondition', 'ملخص الشهر أو الطالب غير موجود.');
    const current = summarySnap.data();
    const totals = paymentTotals(current, newAmount - money(original.amount), current.expectedAmount);
    if (totals.paidAmount > totals.expectedAmount) throw new HttpsError('failed-precondition', 'القيمة الجديدة أكبر من إجمالي المطلوب لهذا الشهر.');
    const paidOn = validPaymentDate(request.data?.paymentDate || original.paymentDate);
    const summary = { ...current, ...totals, lastPaymentDate: paidOn, updatedAt: FieldValue.serverTimestamp() };
    tx.set(transactionRef, {
      amount: newAmount,
      paymentDate: paidOn,
      paymentMethod: text(request.data?.paymentMethod || original.paymentMethod, 40),
      notes: text(request.data?.notes ?? original.notes, 1000),
      editedByUid: staff.uid,
      editedByEmail: staff.email || '',
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    tx.set(summaryRef, summary, { merge: true });
    paymentLegacyMirrorWrites(tx, studentSnap.data(), summary, paidOn);
    tx.set(db.collection('activityLog').doc(), paymentAudit(staff, 'تم تعديل دفعة شهرية', { transactionId, oldAmount: money(original.amount), newAmount }));
    result = { id: transactionId, amount: newAmount, expectedAmount: summary.expectedAmount, paidAmount: summary.paidAmount, remainingAmount: summary.remainingAmount, status: summary.status };
  });
  return result;
});

exports.cancelPaymentTransaction = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin']);
  const transactionId = cleanDocId(text(request.data?.transactionId, 100));
  if (!transactionId) throw new HttpsError('invalid-argument', 'رقم عملية الدفع غير صالح.');
  const transactionRef = db.collection('payment_transactions').doc(transactionId);
  let result;
  await db.runTransaction(async tx => {
    const transactionSnap = await tx.get(transactionRef);
    if (!transactionSnap.exists) throw new HttpsError('not-found', 'عملية الدفع غير موجودة.');
    const original = transactionSnap.data();
    if (original.status === 'cancelled') { result = { id: transactionId, cancelled: true }; return; }
    const summaryRef = db.collection('monthly_payments').doc(original.periodId);
    const [summarySnap, studentSnap] = await Promise.all([tx.get(summaryRef), tx.get(db.collection('students').doc(cleanDocId(original.studentCode)))]);
    if (!summarySnap.exists || !studentSnap.exists) throw new HttpsError('failed-precondition', 'ملخص الشهر أو الطالب غير موجود.');
    const current = summarySnap.data();
    const totals = paymentTotals(current, -money(original.amount), current.expectedAmount);
    const summary = { ...current, ...totals, activeTransactionCount: Math.max(0, Number(current.activeTransactionCount || 1) - 1), updatedAt: FieldValue.serverTimestamp() };
    tx.set(transactionRef, {
      status: 'cancelled',
      cancellationReason: text(request.data?.reason, 500),
      cancelledByUid: staff.uid,
      cancelledByEmail: staff.email || '',
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    tx.set(summaryRef, summary, { merge: true });
    paymentLegacyMirrorWrites(tx, studentSnap.data(), summary, validPaymentDate(original.paymentDate));
    tx.set(db.collection('activityLog').doc(), paymentAudit(staff, 'تم إلغاء دفعة شهرية', { transactionId, amount: money(original.amount), reason: text(request.data?.reason, 500) }));
    result = { id: transactionId, cancelled: true, expectedAmount: summary.expectedAmount, paidAmount: summary.paidAmount, remainingAmount: summary.remainingAmount, status: summary.status };
  });
  return result;
});

function publicExamSession(sessionId, exam, questions, startedAtMs, expiresAtMs) {
  return {
    sessionId,
    exam: {
      id: text(exam.id, 100),
      title: text(exam.title, 200),
      instructions: text(exam.instructions, 1500),
      duration: Math.max(1, Math.min(240, Number(exam.duration || 20))),
      questionMode: 'interactive'
    },
    startedAt: new Date(startedAtMs).toISOString(),
    expiresAt: expiresAtMs,
    questions: questions.map(q => ({
      type: q.type,
      question: q.question,
      options: q.options,
      optionLabels: q.optionLabels,
      mark: q.mark
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
    const typeLine = lines.find(line => /^(type|النوع)\s*[:=：-]?/i.test(line));
    const markLine = lines.find(line => /^(mark|points|الدرجة)\s*[:=：-]?/i.test(line));
    const modelLine = lines.find(line => /^(model|النموذج|الإجابة النموذجية)\s*[:=：-]?/i.test(line));
    const answer = answerLine ? cleanAnswerLine(answerLine) : '';
    const declaredType = typeLine ? String(typeLine).replace(/^(type|النوع)\s*[:=：-]?\s*/i, '').trim().toLowerCase() : '';
    const mark = Math.max(0.25, Math.min(1000, Number(String(markLine || '').replace(/^(mark|points|الدرجة)\s*[:=：-]?\s*/i, '')) || 1));
    const modelAnswer = modelLine ? String(modelLine).replace(/^(model|النموذج|الإجابة النموذجية)\s*[:=：-]?\s*/i, '').trim() : '';
    const options = [];
    const questionLines = [];
    for (const line of lines) {
      if (line === answerLine || line === typeLine || line === markLine || line === modelLine) continue;
      const option = parseOptionLine(line);
      if (option) options.push(option);
      else questionLines.push(line.replace(/^س\d*\s*[:\-]?\s*/, '').trim());
    }
    const question = text(questionLines[0] || lines[0] || 'سؤال', 1500);
    if (options.length) {
      return {
        type: declaredType === 'truefalse' || declaredType === 'صح وخطأ' ? 'truefalse' : 'mcq',
        question,
        options: options.slice(0, 8).map(o => text(o.text, 700)),
        optionLabels: options.slice(0, 8).map(o => text(o.label, 10)),
        answer: text(answer, 700),
        mark
      };
    }
    return { type: declaredType === 'code' || declaredType === 'كود' ? 'code' : 'essay', question, options: [], optionLabels: [], answer: '', modelAnswer: text(modelAnswer, 2000), mark };
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
  const attendance = Array.isArray(records.attendance) ? records.attendance.slice(-120) : (Array.isArray(data.attendance) ? data.attendance.slice(-120) : []);
  const grades = Array.isArray(records.grades) ? records.grades.slice(-120) : (Array.isArray(data.grades) ? data.grades.slice(-120) : []);
  const rawHomeworks = Array.isArray(records.homeworks) ? records.homeworks.slice(-160) : (Array.isArray(data.homeworks) ? data.homeworks.slice(-160) : []);
  const recitations = Array.isArray(records.recitations) ? records.recitations.slice(-120) : (Array.isArray(data.recitations) ? data.recitations.slice(-120) : []);
  const allAssignments = Array.isArray(records.assignments) ? records.assignments : [];
  const assignments = allAssignments.slice(0, 250);
  const openHomeworkGrants = Array.isArray(records.homeworkGrants)
    ? records.homeworkGrants.filter(row => row.status === 'open' && !row.usedAt)
    : [];
  const openGrantByAssignment = new Map(openHomeworkGrants.map(row => [String(row.assignmentId), row]));
  const examAttempts = Array.isArray(attempts) ? attempts.slice(-120) : [];
  const results = normalizeUnifiedResults({ grades, examAttempts, homeworks: rawHomeworks, practicals: recitations });
  const homeworkSummary = homeworkMetrics(allAssignments, rawHomeworks);
  const gradingWeights = records.platformSettings?.gradingWeights || data.gradingWeights || {};
  const overall = configurableOverallAverage(results, gradingWeights);
  return {
    ...apiMetadata(),
    studentCode: text(data.studentCode || data.code, 40),
    name: text(data.studentName || data.name, 100),
    studentName: text(data.studentName || data.name, 100),
    grade: text(canonicalAcademicLabel(data.grade), 80),
    group: text(data.group, 100),
    groupId: text(data.groupId || data.scheduleId, 100),
    scheduleId: text(data.scheduleId || data.groupId, 100),
    month: text(data.month, 40),
    academicYear: text(data.academicYear, 20),
    term: text(data.term, 40),
    bookingCode: text(data.bookingCode, 40),
    approvalStatus: text(data.approvalStatus || data.status, 100),
    active: data.active !== false,
    scheduleDays: text(data.scheduleDays, 100),
    scheduleStartTime: text(data.scheduleStartTime, 20),
    scheduleEndTime: text(data.scheduleEndTime, 20),
    attendanceCode: text(data.attendanceCode, 40),
    paid: data.paid === true,
    paymentDate: text(data.paymentDate, 40),
    notes: text(data.notes, 1500),
    attendance,
    grades,
    homeworks: rawHomeworks.map(row => publicHomeworkProjection(row)),
    recitations,
    monthlyPayments: (Array.isArray(records.monthlyPayments) ? records.monthlyPayments : (Array.isArray(data.monthlyPayments) ? data.monthlyPayments : [])).slice(-120).map(row => ({
      id: text(row.id || row.periodId, 100),
      academicYear: text(row.academicYear, 30),
      month: text(row.month, 40),
      course: text(row.course, 100),
      expectedAmount: money(row.expectedAmount),
      paidAmount: money(row.paidAmount),
      remainingAmount: money(row.remainingAmount),
      status: ['paid', 'partial', 'unpaid'].includes(row.status) ? row.status : paymentStatus(row.expectedAmount, row.paidAmount),
      lastPaymentDate: text(row.lastPaymentDate, 40)
    })),
    assignments: assignments.map(row => ({
      ...publicAssignmentPayload(row, row.id),
      extraAttemptAvailable: openGrantByAssignment.has(String(row.id)),
      extraAttemptNumber: Math.max(0, Number(openGrantByAssignment.get(String(row.id))?.attemptNumber || 0))
    })),
    materials: (Array.isArray(records.materials) ? records.materials : []).slice(0, 120),
    examAttempts,
    results,
    homeworkMetrics: homeworkSummary,
    gradingPolicy: {
      overallPercentage: overall.percentage,
      weights: overall.weights,
      typeAverages: overall.typeAverages
    }
  };
}

function requireApprovedStudent(data = {}) {
  if (!studentIsApproved(data)) throw new HttpsError('permission-denied', 'هذه الخدمة تتاح بعد قبول الحجز.');
  return data;
}

async function ensureUnifiedStudentAccess(studentSnap, requestedCode = '') {
  if (!studentSnap?.exists) throw new HttpsError('not-found', 'لم يتم العثور على الطالب بهذا الكود.');
  const raw = studentSnap.data() || {};
  const studentCode = normalizeCode(raw.studentCode || raw.code || requestedCode || studentSnap.id);
  if (!validLegacyOrStrongCode(studentCode)) throw new HttpsError('failed-precondition', 'كود الطالب المسجل غير صالح.');
  const oldParentCode = normalizeCode(raw.parentCode);
  const unified = { ...raw, id: studentCode, code: studentCode, studentCode, parentCode: studentCode };
  const portal = portalResponse(unified, []);
  const projection = { ...portal, studentCode, code: studentCode, parentCode: studentCode, active: raw.active !== false, updatedAt: FieldValue.serverTimestamp() };
  const batch = db.batch();
  batch.set(studentSnap.ref, { studentCode, code: studentCode, parentCode: studentCode, accessUnifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.collection('student_portal').doc(cleanDocId(studentCode)), projection, { merge: true });
  batch.set(db.collection('parent_portal').doc(cleanDocId(studentCode)), projection, { merge: true });
  if (oldParentCode && oldParentCode !== studentCode) batch.delete(db.collection('parent_portal').doc(cleanDocId(oldParentCode)));
  await batch.commit();
  return unified;
}

async function getStudentPortalByCode(code) {
  const normalized = normalizeCode(code);
  if (!validLegacyOrStrongCode(normalized)) throw new HttpsError('invalid-argument', 'كود غير صالح.');
  const id = cleanDocId(normalized);
  const portalRef = db.collection('student_portal').doc(id);
  const portalSnap = await portalRef.get();
  if (portalSnap.exists) {
    const portal = portalSnap.data() || {};
    // student_portal is a compact access projection. Older admin releases did
    // not always refresh it when a student moved to another grade, so using it
    // as the only source could hide grade-scoped assignments. Reconcile it
    // with the canonical student row on every portal login and repair the
    // projection lazily without exposing the student collection to the client.
    let canonicalSnap = await db.collection('students').doc(id).get().catch(() => null);
    if (!canonicalSnap?.exists) {
      for (const field of ['studentCode', 'code', 'id']) {
        const match = await db.collection('students').where(field, '==', normalized).limit(1).get().catch(() => null);
        if (match && !match.empty) { canonicalSnap = match.docs[0]; break; }
      }
    }
    if (canonicalSnap && canonicalSnap.exists) {
      const canonicalRaw = canonicalSnap.data() || {};
      const alreadyUnified = normalizeCode(canonicalRaw.studentCode || canonicalRaw.code) === normalized
        && normalizeCode(canonicalRaw.parentCode) === normalized
        && Boolean(canonicalRaw.accessUnifiedAt);
      const canonical = alreadyUnified
        ? { ...canonicalRaw, id: normalized, code: normalized, studentCode: normalized, parentCode: normalized }
        : await ensureUnifiedStudentAccess(canonicalSnap, normalized);
      if (!studentCanOpenPortal(canonical)) throw new HttpsError('not-found', 'حساب الطالب غير نشط.');
      const current = { ...portal, ...canonical, grade: canonicalAcademicLabel(canonical.grade || portal.grade), studentCode: normalized, parentCode: normalized, code: normalized, id: normalized };
      const projection = {
        studentCode: normalized,
        code: normalized,
        parentCode: normalized,
        name: text(current.studentName || current.name, 100),
        studentName: text(current.studentName || current.name, 100),
        grade: text(canonicalAcademicLabel(current.grade), 80),
        group: text(current.group, 100),
        groupId: text(current.groupId || current.scheduleId, 100),
        scheduleId: text(current.scheduleId || current.groupId, 100),
        scheduleDays: text(current.scheduleDays, 100),
        scheduleStartTime: text(current.scheduleStartTime, 20),
        scheduleEndTime: text(current.scheduleEndTime, 20),
        month: text(current.month, 40),
        academicYear: text(current.academicYear, 20),
        term: text(current.term, 40),
        approvalStatus: text(current.approvalStatus || current.status, 100),
        active: current.active !== false
      };
      const needsRepair = Object.entries(projection).some(([key, value]) => String(portal[key] ?? '') !== String(value ?? ''));
      if (needsRepair) await portalRef.set({ ...projection, repairedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { code: normalized, data: current };
    }
    if (!studentCanOpenPortal(portal)) throw new HttpsError('not-found', 'حساب الطالب غير نشط.');
    const legacyParentCode = normalizeCode(portal.parentCode);
    const repairedPortal = { ...portal, grade: canonicalAcademicLabel(portal.grade), studentCode: normalized, parentCode: normalized, code: normalized };
    const batch = db.batch();
    batch.set(portalRef, { ...repairedPortal, accessUnifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    batch.set(db.collection('parent_portal').doc(id), { ...repairedPortal, accessUnifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (legacyParentCode && legacyParentCode !== normalized) batch.delete(db.collection('parent_portal').doc(cleanDocId(legacyParentCode)));
    await batch.commit();
    return { code: normalized, data: repairedPortal };
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
  if (!studentSnap.exists || !studentCanOpenPortal(studentSnap.data())) throw new HttpsError('not-found', 'لم يتم العثور على الطالب بهذا الكود.');
  const unified = await ensureUnifiedStudentAccess(studentSnap, normalized);
  const student = { ...unified, grade: canonicalAcademicLabel(unified.grade), studentCode: normalized, parentCode: normalized, code: normalized, id: normalized };
  const repaired = portalResponse(student, []);
  await portalRef.set({ ...repaired, parentCode: normalized, active: student.active !== false, repairedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { code: normalized, data: student };
}

async function getParentPortalByCode(code) {
  const normalized = normalizeCode(code);
  if (!validLegacyOrStrongCode(normalized)) throw new HttpsError('invalid-argument', 'كود غير صالح.');
  // Resolve the canonical student first. A legacy parent-only code is accepted
  // once so the account can be migrated without losing access; after repair the
  // student's single code opens both portals.
  let studentSnap = await db.collection('students').doc(cleanDocId(normalized)).get().catch(() => null);
  if (!studentSnap?.exists) {
    for (const field of ['studentCode', 'code', 'parentCode']) {
      const match = await db.collection('students').where(field, '==', normalized).limit(1).get().catch(() => null);
      if (match && !match.empty) { studentSnap = match.docs[0]; break; }
    }
  }
  if (!studentSnap?.exists) {
    const legacyPortal = await db.collection('parent_portal').doc(cleanDocId(normalized)).get().catch(() => null);
    const legacyStudentCode = normalizeCode(legacyPortal?.exists ? legacyPortal.data().studentCode : '');
    if (legacyStudentCode) studentSnap = await db.collection('students').doc(cleanDocId(legacyStudentCode)).get().catch(() => null);
    if (!studentSnap?.exists && legacyPortal?.exists && studentCanOpenPortal(legacyPortal.data())) {
      const portalStudentCode = legacyStudentCode || normalized;
      const repaired = { ...legacyPortal.data(), studentCode: portalStudentCode, code: portalStudentCode, parentCode: portalStudentCode };
      await db.collection('parent_portal').doc(cleanDocId(portalStudentCode)).set({ ...repaired, accessUnifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { code: portalStudentCode, data: repaired };
    }
  }
  if (!studentSnap?.exists || !studentCanOpenPortal(studentSnap.data())) throw new HttpsError('not-found', 'لم يتم العثور على التقرير.');
  const rawStudent = studentSnap.data() || {};
  const storedCode = normalizeCode(rawStudent.studentCode || rawStudent.code || studentSnap.id);
  const alreadyUnified = normalizeCode(rawStudent.parentCode) === storedCode && Boolean(rawStudent.accessUnifiedAt);
  const student = alreadyUnified
    ? { ...rawStudent, id: storedCode, code: storedCode, studentCode: storedCode, parentCode: storedCode }
    : await ensureUnifiedStudentAccess(studentSnap, normalized);
  const studentCode = normalizeCode(student.studentCode || student.code);
  return { code: studentCode, data: { ...student, studentCode, parentCode: studentCode, code: studentCode } };
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
    maxScore: Number(a.maxScore || 100),
    review: Array.isArray(a.review) ? a.review.slice(0, 200).map(answer => ({
      question: text(answer.question, 1500),
      type: text(answer.type, 30),
      answer: text(answer.answer, 4000),
      mark: Math.max(0.25, Number(answer.mark || 1)),
      awardedMark: answer.awardedMark === null || answer.awardedMark === undefined ? null : Number(answer.awardedMark),
      correct: answer.correct === true ? true : answer.correct === false ? false : null,
      ...(a.answersRevealed === true ? { correctAnswer: text(answer.correctAnswer, 4000) } : {})
    })) : [],
    answersRevealed: a.answersRevealed === true,
    needsManualReview: a.needsManualReview === true,
    status: text(a.status, 40)
  }));
}

function publicAssignmentPayload(data = {}, id = '') {
  const type = ['mcq', 'truefalse', 'code', 'text', 'file', 'multi'].includes(data.type) ? data.type : 'text';
  const questions = Array.isArray(data.questions) ? data.questions.slice(0, 100).map(question => ({
    type: ['mcq','truefalse','code','text'].includes(question.type) ? question.type : 'text',
    question: text(question.question, 1500),
    mark: Math.max(0.25, Math.min(100, Number(question.mark || 1))),
    language: text(question.language, 40),
    starterCode: question.type === 'code' ? text(question.starterCode, 12000) : '',
    choices: ['mcq','truefalse'].includes(question.type) && Array.isArray(question.choices) ? question.choices.slice(0, 8).map(choice => text(choice, 700)) : []
  })) : [];
  return {
    id: text(id || data.id, 120),
    title: text(data.title, 200),
    description: text(data.description || data.desc, 3000),
    grade: text(canonicalAcademicLabel(data.grade), 80),
    group: text(data.group, 100),
    scheduleId: text(data.scheduleId || data.groupId, 100),
    academicYear: text(data.academicYear, 30),
    term: text(data.term, 40),
    lessonTitle: text(data.lessonTitle, 200),
    lessonNumber: text(data.lessonNumber, 30),
    type,
    dueDate: text(data.dueDate, 40),
    publishAt: text(data.publishAt, 60),
    submissionClosed: data.submissionClosed === true,
    fileUrl: safePublicUrl(data.fileUrl || data.url),
    fileName: text(data.fileName, 220),
    language: text(data.language, 40),
    starterCode: type === 'code' ? text(data.starterCode, 12000) : '',
    choices: (type === 'mcq' || type === 'truefalse') && Array.isArray(data.choices) ? data.choices.slice(0, 8).map(choice => text(choice, 700)) : [],
    questionCount: questions.length || Number(data.questionCount || 1),
    totalScore: questions.reduce((sum, question) => sum + question.mark, 0) || Number(data.totalScore || 1),
    questions
  };
}

const ACADEMIC_GRADE_QUERY_VALUES = Object.freeze({
  'أولى ثانوي بكالوريا': ['أولى ثانوي بكالوريا','اولي ثانوي بكالوريا','أولى ثانوي برمجة','اولي ثانوي برمجة','أولى ثانوي','اولي ثانوي'],
  'تانية ثانوي بكالوريا': ['تانية ثانوي بكالوريا','تانيه ثانوي بكالوريا','ثانية ثانوي بكالوريا','ثانيه ثانوي بكالوريا','تانية ثانوي','تانيه ثانوي','ثانية ثانوي','ثانيه ثانوي'],
  'أساسيات برمجة': ['أساسيات برمجة','اساسيات برمجة','أساسيات برمجه','اساسيات برمجه','أساسيات Python','اساسيات Python','تطبيقات ومراجعة'],
  'مبتدئين برمجة': ['مبتدئين برمجة','مبتدئين برمجه','مبتدئين']
});

function academicGradeQueryValues(grade) {
  const canonical = canonicalAcademicLabel(grade);
  return [...new Set([...(ACADEMIC_GRADE_QUERY_VALUES[canonical] || [canonical]), 'كل المسارات', 'كل الصفوف', 'all'])].filter(Boolean).slice(0, 30);
}

async function targetedLearningDocs(collection, student, limit = 750) {
  const keys = academicAudienceKeysForStudent(student).slice(0, 10);
  const grades = academicGradeQueryValues(student.grade);
  const ref = db.collection(collection);
  const [targetedSnap, legacySnap] = await Promise.all([
    keys.length ? ref.where('audienceKeys', 'array-contains-any', keys).limit(limit).get().catch(() => null) : Promise.resolve(null),
    grades.length ? ref.where('grade', 'in', grades).limit(limit).get().catch(() => null) : Promise.resolve(null)
  ]);
  const rows = new Map();
  for (const snap of [targetedSnap, legacySnap]) {
    if (snap) snap.docs.forEach(doc => rows.set(doc.id, doc));
  }
  return [...rows.values()];
}

async function assignmentsForStudent(student = {}) {
  const docs = await targetedLearningDocs('assignments', student);
  return docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => assignmentIsReleased(item) && learningTargetMatchesStudent(item, student))
    .map(item => ({ ...item, submissionClosed: assignmentDueDatePassed(item, cairoDateKey(new Date())) }))
    .sort((a, b) => String(b.publishAt || b.createdAt || b.dueDate || '').localeCompare(String(a.publishAt || a.createdAt || a.dueDate || '')))
    .slice(0, 250);
}

async function materialsForStudent(student = {}) {
  const docs = await targetedLearningDocs('materials', student);
  return docs
    .filter(doc => { const row = doc.data() || {}; return row.active !== false && row.published !== false && row.status !== 'مسودة' && learningTargetMatchesStudent(row, student); })
    .map(doc => studentResourcePayload(doc, 'material'))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 120);
}

async function studentRecords(studentCode, student = {}) {
  const normalized = normalizeCode(studentCode);
  const orderFields = {
    attendance: 'date',
    grades: 'date',
    homework_submissions: 'submittedAt',
    recitations: 'date',
    monthly_payments: 'updatedAt'
  };
  const load = async collection => {
    const base = db.collection(collection).where('studentCode', '==', normalized);
    const ordered = await base.orderBy(orderFields[collection] || 'updatedAt', 'desc').limit(160).get().catch(() => null);
    const snap = ordered || await base.limit(160).get().catch(() => null);
    return snap ? snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [];
  };
  const [attendance, grades, homeworks, recitations, monthlyPayments, assignments, materials, platformSettingsSnap, homeworkGrantsSnap] = await Promise.all([
    load('attendance'), load('grades'), load('homework_submissions'), load('recitations'), load('monthly_payments'), assignmentsForStudent(student), materialsForStudent(student), db.collection('settings').doc('platform').get().catch(() => null), db.collection('homework_attempt_grants').where('studentCode', '==', normalized).where('status', '==', 'open').limit(30).get().catch(() => null)
  ]);
  const byDate = rows => rows.sort((a, b) => String(a.date || a.submittedAt || a.createdAt || '').localeCompare(String(b.date || b.submittedAt || b.createdAt || '')));
  return { attendance: byDate(attendance), grades: byDate(grades), homeworks: byDate(homeworks), recitations: byDate(recitations), monthlyPayments: monthlyPayments.sort((a, b) => String(a.academicYear + a.month).localeCompare(String(b.academicYear + b.month))), assignments, materials, platformSettings: platformSettingsSnap?.exists ? platformSettingsSnap.data() : {}, homeworkGrants: homeworkGrantsSnap ? homeworkGrantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [] };
}

function publicSchedule(schedule = {}) {
  return {
    id: text(schedule.id, 100),
    name: text(schedule.name, 100),
    grade: text(canonicalAcademicLabel(schedule.grade), 80),
    days: text(schedule.days, 100),
    startTime: text(schedule.startTime, 20),
    endTime: text(schedule.endTime, 20),
    capacity: Math.max(0, Math.min(500, Number(schedule.capacity || 0))),
    availableSeats: schedule.availableSeats === null || schedule.availableSeats === undefined ? null : Math.max(0, Number(schedule.availableSeats) || 0)
  };
}

function firestoreMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
  const millis = Date.parse(String(value));
  return Number.isFinite(millis) ? millis : 0;
}

function publicTransferRequest(item = {}) {
  return {
    id: text(item.id, 120),
    studentCode: text(item.studentCode, 40),
    studentName: text(item.studentName, 100),
    studentPhone: digits(item.studentPhone),
    parentPhone: digits(item.parentPhone),
    grade: text(item.grade, 80),
    currentGroup: text(item.currentGroup, 100),
    currentScheduleId: text(item.currentScheduleId, 100),
    targetGroup: text(item.targetGroup, 100),
    targetScheduleId: text(item.targetScheduleId, 100),
    targetScheduleDays: text(item.targetScheduleDays, 100),
    targetScheduleStartTime: text(item.targetScheduleStartTime, 20),
    targetScheduleEndTime: text(item.targetScheduleEndTime, 20),
    reason: text(item.reason, 800),
    teacherNote: text(item.teacherNote, 800),
    status: ['approved', 'rejected'].includes(item.status) ? item.status : 'pending',
    createdAt: firestoreMillis(item.createdAt) ? new Date(firestoreMillis(item.createdAt)).toISOString() : '',
    reviewedAt: firestoreMillis(item.reviewedAt) ? new Date(firestoreMillis(item.reviewedAt)).toISOString() : ''
  };
}

async function scheduleEnrollment(schedule, scheduleId, excludeStudentCode = '') {
  const groupName = text(schedule.name, 100);
  if (!groupName) return [];
  const snap = await db.collection('students').where('group', '==', groupName).limit(1000).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(student =>
    student.active !== false
    && normalizeCode(student.studentCode || student.id) !== normalizeCode(excludeStudentCode)
    && scheduleMatchesStudent(schedule, student)
    && (!student.scheduleId || text(student.scheduleId, 100) === scheduleId)
  );
}

exports.getPortalStudent = onCall(CALLABLE_OPTIONS, async request => {
  const code = normalizeCode(request.data && request.data.code);
  const mode = request.data && request.data.mode === 'parent' ? 'parent' : 'student';
  const includeTransfers = mode === 'student' && request.data?.includeTransfers === true;
  await rateLimitPublic(`portal-${mode}`, code, request, 8, 35, 60 * 1000);
  const found = mode === 'parent' ? await getParentPortalByCode(code) : await getStudentPortalByCode(code);
  const studentCode = normalizeCode(found.data.studentCode || found.data.code);
  const canonicalFound = mode === 'parent' ? await getStudentPortalByCode(studentCode).catch(() => null) : null;
  const canonicalSnap = await db.collection('students').doc(cleanDocId(studentCode)).get().catch(() => null);
  const student = canonicalFound?.data || (canonicalSnap?.exists ? { ...found.data, ...canonicalSnap.data(), grade: canonicalAcademicLabel(canonicalSnap.data().grade || found.data.grade) } : found.data);
  let attendanceCode = text(student.attendanceCode, 40);
  if (!attendanceCode && canonicalSnap?.exists) {
    attendanceCode = randomAttendanceCode();
    const securityPatch = { attendanceCode, securitySchemaVersion: 63, securityMigratedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    const securityBatch = db.batch();
    securityBatch.set(canonicalSnap.ref, securityPatch, { merge: true });
    securityBatch.set(db.collection('student_portal').doc(cleanDocId(studentCode)), securityPatch, { merge: true });
    securityBatch.set(db.collection('parent_portal').doc(cleanDocId(studentCode)), securityPatch, { merge: true });
    await securityBatch.commit();
  }
  const secureStudent = { ...student, attendanceCode };
  const approved = studentIsApproved(secureStudent);
  let attempts = [];
  let records = { attendance: [], grades: [], homeworks: [], recitations: [], monthlyPayments: [], assignments: [], materials: [] };
  let groupSnap = null;
  let transferSnap = null;
  let assignmentDocs = null;
  if (approved) {
    [attempts, records, groupSnap, transferSnap, assignmentDocs] = await Promise.all([
      attemptSummaries(studentCode),
      studentRecords(studentCode, secureStudent),
      includeTransfers ? db.collection('groups').limit(300).get().catch(() => null) : Promise.resolve(null),
      includeTransfers ? db.collection('student_transfer_requests').where('studentCode', '==', studentCode).limit(20).get().catch(() => null) : Promise.resolve(null),
      targetedLearningDocs('assignments', student).catch(() => null)
    ]);
  }
  const schedules = groupSnap ? groupSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => scheduleMatchesStudent(item, secureStudent))
    .filter(item => secureStudent.scheduleId ? item.id !== secureStudent.scheduleId : !sameAcademicValue(item.name, secureStudent.group)) : [];
  const transferOptions = schedules.map(schedule => {
    const capacity = Math.max(0, Math.min(500, Number(schedule.capacity || 0)));
    if (!capacity) return publicSchedule({ ...schedule, availableSeats: null });
    const enrolledCount = Math.max(0, Number(schedule.enrolledCount || 0));
    return enrolledCount >= capacity ? null : publicSchedule({ ...schedule, capacity, availableSeats: capacity - enrolledCount });
  }).filter(Boolean).sort((a, b) => `${a.days} ${a.startTime}`.localeCompare(`${b.days} ${b.startTime}`, 'ar'));
  const requests = transferSnap ? transferSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => firestoreMillis(b.createdAt) - firestoreMillis(a.createdAt)) : [];
  const nextAssignment = assignmentDocs ? assignmentDocs.map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => learningTargetMatchesStudent(item, secureStudent))
    .map(item => scheduledTimeMillis(item.publishAt)).filter(value => value > Date.now()).sort((a, b) => a - b)[0] || 0 : 0;
  const portalSession = await createPortalSession(studentCode, mode, request);
  return {
    ...portalResponse(secureStudent, attempts, records),
    accessStatus: approved ? 'approved' : 'pending',
    portalSessionToken: portalSession.token,
    portalSessionExpiresAt: portalSession.expiresAt,
    transferOptions,
    transferRequest: requests.length ? publicTransferRequest(requests[0]) : null,
    transferDataLoaded: includeTransfers,
    nextAssignmentPublishAt: nextAssignment ? new Date(nextAssignment).toISOString() : ''
  };
});

exports.createStudentTransferRequest = onCall(CALLABLE_OPTIONS, async request => {
  const body = request.data || {};
  const studentCode = normalizeCode(body.studentCode);
  await requirePortalSession(request, studentCode, ['student']);
  await rateLimitPublic('student-transfer', studentCode, request, 3, 8, 60 * 60 * 1000);
  const found = await getStudentPortalByCode(studentCode);
  const canonicalSnap = await db.collection('students').doc(cleanDocId(studentCode)).get().catch(() => null);
  const student = canonicalSnap?.exists ? { ...found.data, ...canonicalSnap.data() } : found.data;
  requireApprovedStudent(student);
  const targetScheduleId = cleanDocId(text(body.targetScheduleId, 100));
  const reason = text(body.reason, 800);
  if (!targetScheduleId) throw new HttpsError('invalid-argument', 'اختر المجموعة المطلوب النقل إليها.');
  if (reason.length < 3) throw new HttpsError('invalid-argument', 'اكتب سبب طلب النقل باختصار.');
  const [targetSnap, existingSnap] = await Promise.all([
    db.collection('groups').doc(targetScheduleId).get(),
    db.collection('student_transfer_requests').where('studentCode', '==', studentCode).limit(20).get()
  ]);
  if (!targetSnap.exists || targetSnap.data().active === false) throw new HttpsError('not-found', 'المجموعة المطلوبة لم تعد متاحة.');
  const target = { id: targetSnap.id, ...targetSnap.data() };
  if (!scheduleMatchesStudent(target, student)) throw new HttpsError('permission-denied', 'هذه المجموعة ليست مخصصة لمسار الطالب أو الترم الحالي.');
  if ((student.scheduleId && target.id === student.scheduleId) || (!student.scheduleId && sameAcademicValue(target.name, student.group))) throw new HttpsError('already-exists', 'الطالب موجود بالفعل في هذه المجموعة.');
  if (existingSnap.docs.some(doc => doc.data().status === 'pending')) throw new HttpsError('already-exists', 'يوجد طلب نقل قيد المراجعة بالفعل.');
  const capacity = Math.max(0, Math.min(500, Number(target.capacity || 0)));
  if (capacity && Math.max(0, Number(target.enrolledCount || 0)) >= capacity) throw new HttpsError('resource-exhausted', 'اكتمل عدد الطلاب في هذه المجموعة.');
  const ref = db.collection('student_transfer_requests').doc();
  const payload = {
    id: ref.id,
    studentCode,
    studentName: text(student.studentName || student.name, 100),
    studentPhone: digits(student.studentPhone),
    parentPhone: digits(student.parentPhone),
    grade: text(student.grade, 80),
    academicYear: text(student.academicYear, 20),
    term: text(student.term, 40),
    currentGroup: text(student.group, 100),
    currentScheduleId: text(student.scheduleId, 100),
    targetGroup: text(target.name, 100),
    targetScheduleId: target.id,
    targetScheduleDays: text(target.days, 100),
    targetScheduleStartTime: text(target.startTime, 20),
    targetScheduleEndTime: text(target.endTime, 20),
    reason,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  await ref.create(payload);
  return publicTransferRequest({ ...payload, createdAt: new Date() });
});

exports.reviewStudentTransferRequest = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const requestId = cleanDocId(text(request.data?.requestId, 120));
  const action = request.data?.action === 'approve' ? 'approve' : request.data?.action === 'reject' ? 'reject' : '';
  const teacherNote = text(request.data?.teacherNote, 800);
  if (!requestId || !action) throw new HttpsError('invalid-argument', 'بيانات مراجعة طلب النقل غير مكتملة.');
  const requestRef = db.collection('student_transfer_requests').doc(requestId);
  const result = await db.runTransaction(async tx => {
    const transferSnap = await tx.get(requestRef);
    if (!transferSnap.exists) throw new HttpsError('not-found', 'طلب النقل غير موجود.');
    const transfer = { id: transferSnap.id, ...transferSnap.data() };
    if (transfer.status !== 'pending') throw new HttpsError('failed-precondition', 'تم التعامل مع طلب النقل بالفعل.');
    if (action === 'reject') {
      tx.update(requestRef, { status: 'rejected', teacherNote, reviewedBy: staff.email || staff.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return { ...transfer, status: 'rejected', teacherNote, reviewedAt: new Date() };
    }
    const studentCode = normalizeCode(transfer.studentCode);
    const studentRef = db.collection('students').doc(cleanDocId(studentCode));
    const scheduleRef = db.collection('groups').doc(cleanDocId(transfer.targetScheduleId));
    const [studentSnap, scheduleSnap] = await Promise.all([tx.get(studentRef), tx.get(scheduleRef)]);
    if (!studentSnap.exists || studentSnap.data().active === false) throw new HttpsError('not-found', 'حساب الطالب غير موجود أو غير نشط.');
    if (!scheduleSnap.exists || scheduleSnap.data().active === false) throw new HttpsError('failed-precondition', 'المجموعة المطلوبة لم تعد متاحة.');
    const student = { id: studentSnap.id, ...studentSnap.data() };
    const schedule = { id: scheduleSnap.id, ...scheduleSnap.data() };
    if (!scheduleMatchesStudent(schedule, student)) throw new HttpsError('failed-precondition', 'المجموعة لم تعد مطابقة لمسار الطالب.');
    const capacity = Math.max(0, Math.min(500, Number(schedule.capacity || 0)));
    const enrolled = Math.max(0, Number(schedule.enrolledCount || 0));
    if (capacity && enrolled >= capacity) throw new HttpsError('resource-exhausted', 'اكتمل عدد الطلاب في المجموعة قبل اعتماد الطلب.');
    const patch = {
      group: text(schedule.name, 100),
      groupId: schedule.id,
      scheduleId: schedule.id,
      scheduleDays: text(schedule.days, 100),
      scheduleStartTime: text(schedule.startTime, 20),
      scheduleEndTime: text(schedule.endTime, 20),
      schedulePending: false,
      updatedAt: FieldValue.serverTimestamp()
    };
    const legacyParentCode = normalizeCode(student.parentCode);
    const parentCode = studentCode;
    tx.set(studentRef, { ...patch, parentCode }, { merge: true });
    tx.set(scheduleRef, { enrolledCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const previousScheduleId = cleanDocId(text(student.scheduleId || student.groupId, 100));
    if (previousScheduleId && previousScheduleId !== schedule.id) {
      tx.set(db.collection('groups').doc(previousScheduleId), { enrolledCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    tx.set(db.collection('student_portal').doc(cleanDocId(studentCode)), { ...patch, studentCode, parentCode }, { merge: true });
    tx.set(db.collection('parent_portal').doc(cleanDocId(parentCode)), { ...patch, studentCode, parentCode }, { merge: true });
    if (legacyParentCode && legacyParentCode !== parentCode) tx.delete(db.collection('parent_portal').doc(cleanDocId(legacyParentCode)));
    tx.set(db.collection('payments').doc(cleanDocId(studentCode)), { group: patch.group, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(requestRef, {
      status: 'approved',
      targetGroup: patch.group,
      targetScheduleDays: patch.scheduleDays,
      targetScheduleStartTime: patch.scheduleStartTime,
      targetScheduleEndTime: patch.scheduleEndTime,
      teacherNote,
      reviewedBy: staff.email || staff.uid,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return { ...transfer, status: 'approved', targetGroup: patch.group, teacherNote, reviewedAt: new Date() };
  });
  await db.collection('activityLog').add({ action: action === 'approve' ? 'تم اعتماد طلب نقل طالب' : 'تم رفض طلب نقل طالب', meta: { requestId, studentCode: result.studentCode, targetGroup: result.targetGroup }, actorUid: staff.uid, actorEmail: staff.email || '', createdAt: FieldValue.serverTimestamp() }).catch(() => {});
  return publicTransferRequest(result);
});

async function commitServerWrites(writes, chunkSize = 420) {
  for (let index = 0; index < writes.length; index += chunkSize) {
    const batch = db.batch();
    writes.slice(index, index + chunkSize).forEach(write => write(batch));
    await batch.commit();
  }
}

exports.upsertGroupSchedule = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const body = request.data || {};
  const id = cleanDocId(text(body.id, 100));
  const name = text(body.name || body.group, 100);
  const previousName = text(body.previousName, 100);
  const grade = text(canonicalAcademicLabel(body.grade), 80);
  if (!id || !name || !isSupportedAcademicGrade(grade)) throw new HttpsError('invalid-argument', 'بيانات المجموعة غير مكتملة.');
  const payload = {
    id, name, grade,
    days: text(body.days, 100), startTime: text(body.startTime, 20), endTime: text(body.endTime, 20),
    capacity: Math.max(0, Math.min(500, Number(body.capacity || 0))),
    note: text(body.note, 800), active: body.active !== false,
    updatedAt: FieldValue.serverTimestamp(), updatedBy: staff.uid
  };
  const groupRef = db.collection('groups').doc(id);
  const existing = await groupRef.get();
  const effectivePreviousName = previousName || (existing.exists ? text(existing.data().name, 100) : '');
  await groupRef.set({ ...payload, createdAt: existing.exists ? (existing.data().createdAt || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp() }, { merge: true });

  const [studentsById, studentsByName, bookingsById] = await Promise.all([
    db.collection('students').where('scheduleId', '==', id).limit(1500).get().catch(() => null),
    effectivePreviousName && effectivePreviousName !== name ? db.collection('students').where('group', '==', effectivePreviousName).limit(1500).get().catch(() => null) : Promise.resolve(null),
    db.collection('bookings').where('scheduleId', '==', id).limit(500).get().catch(() => null)
  ]);
  const studentDocs = new Map();
  for (const snap of [studentsById, studentsByName]) if (snap) snap.docs.forEach(doc => studentDocs.set(doc.id, doc));
  const writes = [];
  for (const doc of studentDocs.values()) {
    const student = doc.data() || {};
    if (student.grade && !sameAcademicValue(student.grade, grade)) continue;
    const patch = { group: name, groupId: id, scheduleId: id, scheduleDays: payload.days, scheduleStartTime: payload.startTime, scheduleEndTime: payload.endTime, updatedAt: FieldValue.serverTimestamp() };
    const studentCode = normalizeCode(student.studentCode || doc.id);
    const legacyParentCode = normalizeCode(student.parentCode);
    const parentCode = studentCode;
    writes.push(batch => batch.set(doc.ref, { ...patch, parentCode }, { merge: true }));
    if (studentCode) writes.push(batch => batch.set(db.collection('student_portal').doc(cleanDocId(studentCode)), { ...patch, studentCode, parentCode }, { merge: true }));
    if (parentCode) writes.push(batch => batch.set(db.collection('parent_portal').doc(cleanDocId(parentCode)), { ...patch, studentCode, parentCode }, { merge: true }));
    if (legacyParentCode && legacyParentCode !== parentCode) writes.push(batch => batch.delete(db.collection('parent_portal').doc(cleanDocId(legacyParentCode))));
    if (studentCode) writes.push(batch => batch.set(db.collection('payments').doc(cleanDocId(studentCode)), { group: name, scheduleId: id, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
  }
  if (bookingsById) bookingsById.docs.forEach(doc => writes.push(batch => batch.set(doc.ref, { group: name, scheduleId: id, scheduleDays: payload.days, scheduleStartTime: payload.startTime, scheduleEndTime: payload.endTime, updatedAt: FieldValue.serverTimestamp() }, { merge: true })));

  const targetCollections = ['assignments','exams','materials','questions','lectures','lecture_materials','assignments_v2','bank_questions','monthly_exams'];
  const targetSnaps = await Promise.all(targetCollections.flatMap(collection => [
    db.collection(collection).where('scheduleId', '==', id).limit(1000).get().catch(() => null),
    effectivePreviousName && effectivePreviousName !== name ? db.collection(collection).where('group', '==', effectivePreviousName).limit(1000).get().catch(() => null) : Promise.resolve(null)
  ]));
  targetCollections.forEach((collection, collectionIndex) => {
    const docs = new Map();
    for (const snap of [targetSnaps[collectionIndex * 2], targetSnaps[collectionIndex * 2 + 1]]) if (snap) snap.docs.forEach(doc => docs.set(doc.id, doc));
    docs.forEach(doc => {
      const current = doc.data() || {};
      if (current.grade && !sameAcademicValue(current.grade, grade)) return;
      const next = { ...current, group: name, groupId: id, scheduleId: id };
      writes.push(batch => batch.set(doc.ref, { group: name, groupId: id, scheduleId: id, audienceKeys: academicAudienceKeysForItem(next), updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
    });
  });
  if (writes.length) await commitServerWrites(writes);
  await serverActivity(staff, existing.exists ? 'تعديل مجموعة وتحديث الاستهداف' : 'إنشاء مجموعة', { groupId: id, name, affectedStudents: studentDocs.size });
  return { ...payload, updatedAt: new Date().toISOString(), affectedStudents: studentDocs.size };
});

const VERSIONED_CONTENT_COLLECTIONS = new Set(['assignments', 'exams', 'materials']);

function versionedContentStatus(collection, payload) {
  if (payload.archived === true) return 'archived';
  const now = Date.now();
  const opens = scheduledTimeMillis(payload.publishAt || payload.openAt);
  if (collection === 'assignments' && assignmentDueDatePassed(payload, cairoDateKey(new Date()))) return 'ended';
  const closes = scheduledTimeMillis(payload.closeAt || (/^\d{4}-\d{2}-\d{2}$/.test(String(payload.dueDate || '')) ? '' : payload.dueDate));
  if (opens && opens > now) return 'scheduled';
  if (closes && closes < now) return 'ended';
  if (payload.active === false || payload.published === false) return 'draft';
  return collection === 'materials' ? 'published' : 'open';
}

function contentQuestionsFingerprint(collection, value = {}) {
  const sensitive = collection === 'exams'
    ? { text: value.text || value.questionsText || '', questions: value.questions || [] }
    : collection === 'assignments' ? { type: value.type, questions: value.questions || [], choices: value.choices || [], correctIndex: value.correctIndex, modelAnswer: value.modelAnswer || '' } : {};
  return hash(JSON.stringify(sensitive));
}

exports.upsertVersionedContent = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const collection = text(request.data?.collection, 40);
  const input = request.data?.item && typeof request.data.item === 'object' ? request.data.item : {};
  if (!VERSIONED_CONTENT_COLLECTIONS.has(collection)) throw new HttpsError('invalid-argument', 'نوع المحتوى غير مدعوم.');
  const id = cleanDocId(text(input.id, 120));
  if (!id) throw new HttpsError('invalid-argument', 'رقم المحتوى غير صالح.');
  if (jsonByteSize(input) > 900 * 1024) throw new HttpsError('invalid-argument', 'حجم بيانات المحتوى أكبر من الحد المسموح.');
  const ref = db.collection(collection).doc(id);
  const activitySnap = collection === 'assignments'
    ? await db.collection('homework_submissions').where('assignmentId', '==', id).limit(1).get().catch(() => null)
    : collection === 'exams' ? await db.collection('exam_attempts').where('examId', '==', id).limit(1).get().catch(() => null) : null;
  const hasStudentActivity = !!activitySnap && !activitySnap.empty;
  const result = await db.runTransaction(async tx => {
    const currentSnap = await tx.get(ref);
    const current = currentSnap.exists ? currentSnap.data() : {};
    const oldFingerprint = contentQuestionsFingerprint(collection, current);
    const newFingerprint = contentQuestionsFingerprint(collection, input);
    const questionChanged = currentSnap.exists && oldFingerprint !== newFingerprint;
    const currentVersion = Math.max(1, Number(current.version || 1));
    const nextVersion = questionChanged ? currentVersion + 1 : currentVersion;
    if (currentSnap.exists && questionChanged) {
      const versionRef = db.collection('assessment_versions').doc(cleanDocId(`${collection}_${id}_v${currentVersion}`));
      tx.set(versionRef, {
        id: versionRef.id,
        collection,
        contentId: id,
        version: currentVersion,
        snapshot: current,
        preservedBecauseStudentActivity: hasStudentActivity,
        supersededByVersion: nextVersion,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: staff.email || staff.uid
      });
    }
    const scheduleId = text(input.scheduleId || input.groupId, 100);
    const payload = {
      ...input,
      id,
      grade: input.grade ? canonicalAcademicLabel(input.grade) : '',
      groupId: scheduleId,
      scheduleId,
      version: nextVersion,
      previousVersion: questionChanged ? currentVersion : Number(current.previousVersion || 0),
      audienceKeys: collection === 'materials' || collection === 'assignments' || collection === 'exams' ? academicAudienceKeysForItem({ ...input, scheduleId, groupId: scheduleId }) : [],
      archived: false,
      archivedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: staff.email || staff.uid
    };
    payload.lifecycleStatus = versionedContentStatus(collection, payload);
    if (!currentSnap.exists) payload.createdAt = FieldValue.serverTimestamp();
    tx.set(ref, payload, { merge: true });
    return { ...input, id, version: nextVersion, previousVersion: payload.previousVersion, lifecycleStatus: payload.lifecycleStatus, hasStudentActivity, versionCreated: questionChanged };
  });
  await serverActivity(staff, result.versionCreated ? 'تعديل محتوى مع حفظ نسخة تاريخية' : 'حفظ محتوى', { collection, id, version: result.version, hasStudentActivity });
  return { ...result, updatedAt: new Date().toISOString() };
});

exports.archiveContentItem = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const collection = text(request.data?.collection, 40);
  const id = cleanDocId(text(request.data?.id, 120));
  const reason = text(request.data?.reason, 500) || 'أرشفة من لوحة الإدارة';
  if (!VERSIONED_CONTENT_COLLECTIONS.has(collection) || !id) throw new HttpsError('invalid-argument', 'بيانات الأرشفة غير مكتملة.');
  const ref = db.collection(collection).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'العنصر غير موجود.');
  const cleanupRequested = request.data?.cleanupStorage === true && !!text(snap.data().filePath || snap.data().path, 500);
  await ref.set({
    archived: true,
    active: false,
    published: false,
    lifecycleStatus: 'archived',
    archiveReason: reason,
    archivedBy: staff.email || staff.uid,
    archivedAt: FieldValue.serverTimestamp(),
    storageCleanupEligibleAt: cleanupRequested ? Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000) : FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await serverActivity(staff, 'أرشفة محتوى', { collection, id, reason, cleanupRequested });
  return { ok: true, collection, id, archived: true, cleanupRequested };
});

exports.getAdminCollectionPage = onCall(CALLABLE_OPTIONS, async request => {
  await requireStaff(request);
  const collection = text(request.data?.collection, 60);
  const allowed = new Set(['students','bookings','assignments','exams','materials','homework_submissions','exam_attempts','grades','attendance','recitations','student_transfer_requests']);
  if (!allowed.has(collection)) throw new HttpsError('invalid-argument', 'القائمة المطلوبة غير مدعومة.');
  const pageSize = Math.max(10, Math.min(100, Number(request.data?.pageSize || 50)));
  const orderField = ['students','assignments','exams','materials'].includes(collection) ? 'updatedAt' : collection === 'attendance' || collection === 'grades' || collection === 'recitations' ? 'date' : collection === 'bookings' || collection === 'student_transfer_requests' ? 'createdAt' : 'submittedAt';
  let query = db.collection(collection);
  const filters = request.data?.filters && typeof request.data.filters === 'object' ? request.data.filters : {};
  for (const field of ['studentCode','grade','group','status','assignmentId','examId']) {
    const value = text(filters[field], 120);
    if (value) query = query.where(field, '==', field === 'studentCode' ? normalizeCode(value) : value);
  }
  query = query.orderBy(orderField, 'desc').orderBy(admin.firestore.FieldPath.documentId(), 'desc');
  const cursor = request.data?.cursor;
  if (cursor?.orderValue !== undefined && cursor?.id) query = query.startAfter(cursor.orderValue, cursor.id);
  const snap = await query.limit(pageSize).get();
  const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const last = snap.docs[snap.docs.length - 1];
  return {
    rows,
    nextCursor: last && snap.size === pageSize ? { orderValue: last.get(orderField) || '', id: last.id } : null,
    orderBy: `${orderField} desc`,
    pageSize
  };
});

function studentResourcePayload(doc, kind) {
  const data = doc.data() || {};
  const fileUrl = safePublicUrl(data.fileUrl || data.url);
  return {
    id: text(data.id || doc.id, 120),
    kind,
    title: text(data.title, 200),
    desc: text(data.desc || data.description, 1200),
    content: text(data.content, 4000),
    answer: kind === 'question' ? text(data.answer, 4000) : '',
    grade: text(canonicalAcademicLabel(data.grade), 80),
    group: text(data.group, 100),
    scheduleId: text(data.scheduleId || data.groupId, 100),
    unit: text(data.unit, 120),
    lecture: text(data.lecture, 120),
    fileUrl,
    fileName: text(data.fileName, 220),
    fileType: text(data.fileType || data.type, 100),
    createdAt: text(data.createdAt, 60)
  };
}

exports.getStudentResources = onCall(CALLABLE_OPTIONS, async request => {
  const code = normalizeCode(request.data && request.data.code);
  await requirePortalSession(request, code, ['student']);
  await rateLimitPublic('student-resources', code, request, 15, 60, 60 * 1000);
  const found = await getStudentPortalByCode(code);
  requireApprovedStudent(found.data);
  const studentCode = normalizeCode(found.data.studentCode || found.data.code || code);
  const grade = text(canonicalAcademicLabel(found.data.grade), 80);
  if (!grade) throw new HttpsError('failed-precondition', 'مسار الطالب غير محدد. تواصل مع الإدارة لتحديد المسار أولًا.');
  const [materialDocs, questionDocs, assignments] = await Promise.all([
    targetedLearningDocs('materials', found.data),
    targetedLearningDocs('questions', found.data),
    assignmentsForStudent(found.data)
  ]);
  const visible = doc => {
    const data = doc.data() || {};
    return data.active !== false && data.published !== false && data.status !== 'مسودة';
  };
  return {
    ...apiMetadata(),
    student: {
      studentCode,
      name: text(found.data.studentName || found.data.name, 100),
      grade,
      group: text(found.data.group, 100),
      scheduleId: text(found.data.scheduleId || found.data.groupId, 100)
    },
    materials: materialDocs.filter(visible).filter(doc => learningTargetMatchesStudent(doc.data() || {}, found.data)).map(doc => studentResourcePayload(doc, 'material')),
    questions: questionDocs.filter(visible).filter(doc => learningTargetMatchesStudent(doc.data() || {}, found.data)).map(doc => studentResourcePayload(doc, 'question')),
    assignments: assignments.map(row => publicAssignmentPayload(row, row.id))
  };
});

exports.submitAssignmentAnswer = onCall(CALLABLE_OPTIONS, async request => {
  const body = request.data || {};
  const studentCode = normalizeCode(body.studentCode);
  const assignmentId = cleanDocId(text(body.assignmentId, 120));
  if (!validLegacyOrStrongCode(studentCode) || !assignmentId) throw new HttpsError('invalid-argument', 'بيانات الواجب غير مكتملة.');
  await requirePortalSession(request, studentCode, ['student']);
  await rateLimitPublic('assignment-answer', `${studentCode}:${assignmentId}`, request, 8, 30, 60 * 60 * 1000);
  const [found, assignmentSnap] = await Promise.all([
    getStudentPortalByCode(studentCode),
    db.collection('assignments').doc(assignmentId).get()
  ]);
  requireApprovedStudent(found.data);
  if (!assignmentSnap.exists) throw new HttpsError('not-found', 'الواجب غير موجود.');
  const assignment = assignmentSnap.data() || {};
  const grade = text(found.data.grade, 80);
  if (!assignmentIsReleased(assignment) || !learningTargetMatchesStudent(assignment, found.data)) {
    throw new HttpsError('permission-denied', 'هذا الواجب غير متاح لمسار الطالب.');
  }
  const assignmentClosed = assignmentDueDatePassed(assignment, cairoDateKey(new Date()));
  const multiQuestions = Array.isArray(assignment.questions) ? assignment.questions.slice(0, 100) : [];
  let answerType = 'text';
  let answer = '';
  let selectedOption = null;
  let score = null;
  let autoScore = 0;
  let maxScore = Math.max(0.25, Number(assignment.totalScore || 1));
  let needsManualReview = false;
  let review = [];

  if (multiQuestions.length) {
    const rawAnswers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
    if (jsonByteSize(rawAnswers) > 96 * 1024) throw new HttpsError('invalid-argument', 'حجم إجابات الواجب أكبر من الحد المسموح.');
    answerType = 'multi';
    review = multiQuestions.map((question, index) => {
      const qType = ['mcq','truefalse','code','text'].includes(question.type) ? question.type : 'text';
      const mark = Math.max(0.25, Math.min(100, Number(question.mark || 1)));
      const raw = rawAnswers[String(index)] ?? rawAnswers[index] ?? '';
      if (qType === 'mcq' || qType === 'truefalse') {
        const selectedOption = Number(raw);
        const choices = Array.isArray(question.choices) ? question.choices.slice(0, 8) : [];
        if (!Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption >= choices.length) throw new HttpsError('invalid-argument', `أجب عن السؤال ${index + 1}.`);
        const correct = selectedOption === Number(question.correctIndex);
        if (correct) autoScore += mark;
        return { question: text(question.question,1500), type:qType, answer:text(choices[selectedOption],700), correct, correctAnswer:text(choices[Number(question.correctIndex)]||'',700), mark, awardedMark:correct?mark:0 };
      }
      const answer = text(raw, qType === 'code' ? 20000 : 5000);
      if (!answer) throw new HttpsError('invalid-argument', `أجب عن السؤال ${index + 1}.`);
      needsManualReview = true;
      return { question:text(question.question,1500), type:qType, answer, correct:null, correctAnswer:text(question.modelAnswer,2000)||'يصححها المدرس', mark, awardedMark:null };
    });
    maxScore = review.reduce((sum, row) => sum + row.mark, 0);
    score = needsManualReview ? null : autoScore;
  } else {
    const type = ['mcq', 'truefalse', 'code', 'text'].includes(assignment.type) ? assignment.type : 'text';
    answerType = type;
    answer = text(body.answer, type === 'code' ? 20000 : 5000);
    if (type === 'mcq' || type === 'truefalse') {
      selectedOption = Number(body.selectedOption);
      const choices = Array.isArray(assignment.choices) ? assignment.choices.slice(0, 8) : [];
      if (!Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption >= choices.length) throw new HttpsError('invalid-argument', 'اختار إجابة من الاختيارات.');
      answer = text(choices[selectedOption], 700);
      const correct = selectedOption === Number(assignment.correctIndex);
      autoScore = correct ? maxScore : 0;
      score = autoScore;
      review = [{ question: text(assignment.question || assignment.title, 1500), type, answer, correct, correctAnswer: text(choices[Number(assignment.correctIndex)] || '', 700), mark: maxScore, awardedMark: autoScore }];
    } else {
      if (!answer) throw new HttpsError('invalid-argument', type === 'code' ? 'اكتب الكود قبل التسليم.' : 'اكتب إجابة الواجب.');
      needsManualReview = true;
      review = [{ question: text(assignment.question || assignment.title, 1500), type, answer, correct: null, correctAnswer: text(assignment.modelAnswer, 2000) || 'يصححها المدرس', mark: maxScore, awardedMark: null }];
    }
  }

  const lockId = homeworkLockId(assignmentId, studentCode);
  const lockRef = db.collection('homework_submission_locks').doc(lockId);
  const firstSubmissionRef = db.collection('homework_submissions').doc(lockId);
  const submittedAt = new Date().toISOString();
  const assignmentSnapshot = {
    assignmentId,
    title: text(assignment.title, 200),
    version: Math.max(1, Number(assignment.version || 1)),
    publishAt: text(assignment.publishAt, 60),
    dueDate: text(assignment.dueDate, 60),
    closeAt: text(assignment.closeAt, 60),
    totalScore: maxScore,
    questions: multiQuestions.length ? multiQuestions : [{ type: answerType, question: assignment.question || assignment.title, choices: assignment.choices || [], correctIndex: assignment.correctIndex, modelAnswer: assignment.modelAnswer || '', mark: maxScore }]
  };

  const committed = await db.runTransaction(async tx => {
    const [lockSnap, firstSubmissionSnap] = await Promise.all([tx.get(lockRef), tx.get(firstSubmissionRef)]);
    const lock = lockSnap.exists ? lockSnap.data() : null;
    const submittedAttempts = Math.max(firstSubmissionSnap.exists ? 1 : 0, Number(lock?.submittedAttempts || 0));
    const nextAttempt = submittedAttempts + 1;
    const grantRef = nextAttempt > 1 ? db.collection('homework_attempt_grants').doc(`${lockId}_${nextAttempt}`) : null;
    const grantSnap = grantRef ? await tx.get(grantRef) : null;
    const grant = grantSnap?.exists ? { id: grantSnap.id, ...grantSnap.data() } : null;
    const decision = decideHomeworkAttempt({ lock, legacySubmissionExists: firstSubmissionSnap.exists, grant });
    if (!decision.allowed) throw new HttpsError('already-exists', 'تم تسليم الواجب بالفعل ولا يمكن استبدال الإجابة أو الدرجة.');
    if (assignmentClosed && decision.attemptNumber === 1) throw new HttpsError('deadline-exceeded', 'انتهى موعد تسليم هذا الواجب.');
    const submissionId = submissionIdForAttempt(lockId, decision.attemptNumber);
    const submissionRef = db.collection('homework_submissions').doc(submissionId);
    if (decision.attemptNumber > 1) {
      const existingAttempt = await tx.get(submissionRef);
      if (existingAttempt.exists) throw new HttpsError('already-exists', 'تم استخدام المحاولة الإضافية بالفعل.');
    }
    const submission = {
      id: submissionId,
      lockId,
      assignmentId,
      assignmentVersion: assignmentSnapshot.version,
      assignmentSnapshot,
      homeworkTitle: assignmentSnapshot.title,
      title: assignmentSnapshot.title,
      type: 'homework',
      answerType,
      answer,
      selectedOption,
      answers: review,
      score,
      autoScore,
      maxScore,
      revealCorrectAnswersAfterClose: assignment.revealCorrectAnswersAfterClose === true,
      revealCorrectAnswersAfterGrading: assignment.revealCorrectAnswersAfterGrading === true,
      needsManualReview,
      status: needsManualReview ? 'بانتظار تصحيح المدرس' : 'تم تصحيح الواجب',
      completed: true,
      approved: !needsManualReview,
      attemptNumber: decision.attemptNumber,
      studentCode,
      studentName: text(found.data.studentName || found.data.name, 100),
      grade,
      group: text(found.data.group, 100),
      method: 'student_assignment_answer',
      submittedAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    tx.create(submissionRef, submission);
    tx.set(lockRef, {
      lockId,
      assignmentId,
      studentCode,
      submittedAttempts: decision.attemptNumber,
      latestSubmissionId: submissionId,
      latestAttemptNumber: decision.attemptNumber,
      latestSubmittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: lock?.createdAt || FieldValue.serverTimestamp()
    }, { merge: true });
    if (grantRef) tx.update(grantRef, { status: 'used', usedAt: FieldValue.serverTimestamp(), submissionId, updatedAt: FieldValue.serverTimestamp() });
    return { submissionId, submission };
  });
  await markLeaderboardDirty('assignment-submitted');
  const publicSubmission = publicHomeworkProjection(committed.submission);
  return {
    ok: true,
    assignmentId,
    submissionId: committed.submissionId,
    attemptNumber: publicSubmission.attemptNumber,
    score: publicSubmission.score,
    maxScore: publicSubmission.maxScore,
    needsManualReview: publicSubmission.needsManualReview,
    status: publicSubmission.status,
    submission: publicSubmission
  };
});

exports.reviewHomeworkSubmission = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const submissionId = cleanDocId(text(request.data?.submissionId, 120));
  const awarded = request.data?.awarded && typeof request.data.awarded === 'object' ? request.data.awarded : {};
  if (!submissionId) throw new HttpsError('invalid-argument', 'رقم تسليم الواجب غير صالح.');
  if (Array.isArray(awarded) || Object.keys(awarded).length > 100 || jsonByteSize(awarded) > 16 * 1024) throw new HttpsError('invalid-argument', 'بيانات التصحيح أكبر من الحد المسموح.');
  const reason = text(request.data?.reason || request.data?.comment, 800);
  const ref = db.collection('homework_submissions').doc(submissionId);
  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'تسليم الواجب غير موجود.');
    const submission = snap.data() || {};
    const answers = Array.isArray(submission.answers) ? submission.answers.map((answer, index) => {
      const mark = Math.max(0.25, Number(answer.mark || 1));
      const value = Math.max(0, Math.min(mark, Number(awarded[String(index)] ?? answer.awardedMark ?? 0) || 0));
      return { ...answer, awardedMark:value, correct:value===mark, teacherReviewed:true };
    }) : [];
    if (!answers.length) throw new HttpsError('failed-precondition', 'لا توجد إجابات قابلة للتصحيح.');
    const maxScore = answers.reduce((sum, answer) => sum + Number(answer.mark || 1), 0);
    const score = answers.reduce((sum, answer) => sum + Number(answer.awardedMark || 0), 0);
    const oldGrade = Number.isFinite(Number(submission.score)) ? Number(submission.score) : null;
    const oldMaxScore = Number.isFinite(Number(submission.maxScore)) ? Number(submission.maxScore) : null;
    const reviewRef = db.collection('homework_review_history').doc();
    tx.set(ref, {answers,score,maxScore,needsManualReview:false,approved:true,status:'تم تصحيح الواجب',reviewedBy:staff.email||staff.uid,reviewerUid:staff.uid,reviewerEmail:staff.email||'',reviewedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    tx.create(reviewRef, {id:reviewRef.id,submissionId,assignmentId:text(submission.assignmentId,120),studentCode:normalizeCode(submission.studentCode),oldGrade,oldMaxScore,newGrade:score,newMaxScore:maxScore,reviewerUid:staff.uid,reviewerEmail:staff.email||'',reviewerRole:staff.role||'',comment:reason,createdAt:FieldValue.serverTimestamp()});
    tx.create(db.collection('activityLog').doc(), {action:'تصحيح واجب',actorUid:staff.uid,actorEmail:staff.email||'',actorRole:'admin',metadata:{submissionId,assignmentId:text(submission.assignmentId,120),studentCode:normalizeCode(submission.studentCode),score,maxScore},createdAt:FieldValue.serverTimestamp()});
    return { score, maxScore };
  });
  await markLeaderboardDirty('homework-reviewed');
  return {ok:true,submissionId,...result};
});

exports.reviewExamAttempt = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const attemptId = cleanDocId(text(request.data?.attemptId, 120));
  const awarded = request.data?.awarded && typeof request.data.awarded === 'object' ? request.data.awarded : {};
  const reason = text(request.data?.reason || request.data?.comment, 800);
  if (!attemptId) throw new HttpsError('invalid-argument', 'رقم محاولة الامتحان غير صالح.');
  const attemptRef = db.collection('exam_attempts').doc(attemptId);
  const result = await db.runTransaction(async tx => {
    const attemptSnap = await tx.get(attemptRef);
    if (!attemptSnap.exists) throw new HttpsError('not-found', 'محاولة الامتحان غير موجودة.');
    const attempt = attemptSnap.data() || {};
    const answers = Array.isArray(attempt.answers) ? attempt.answers.slice(0, 200).map((answer, index) => {
      const mark = Math.max(0.25, Number(answer.mark || 1));
      const value = Math.max(0, Math.min(mark, Number(awarded[String(index)] ?? answer.awardedMark ?? 0) || 0));
      return { ...answer, awardedMark: value, correct: value === mark, adminReviewed: true };
    }) : [];
    if (!answers.length) throw new HttpsError('failed-precondition', 'لا توجد إجابات قابلة للتصحيح.');
    const maxScore = answers.reduce((sum, answer) => sum + Number(answer.mark || 1), 0);
    const score = answers.reduce((sum, answer) => sum + Number(answer.awardedMark || 0), 0);
    const studentCode = normalizeCode(attempt.studentCode);
    const examId = cleanDocId(text(attempt.examId, 120));
    if (!validLegacyOrStrongCode(studentCode) || !examId) throw new HttpsError('failed-precondition', 'بيانات المحاولة غير مكتملة.');
    const parentRef = db.collection('student_attempts').doc(cleanDocId(studentCode));
    const [examSnap, summarySnap, parentSnap] = await Promise.all([
      tx.get(db.collection('exams').doc(examId)),
      tx.get(parentRef.collection('attempts').doc(attemptId)),
      tx.get(parentRef)
    ]);
    const exam = examSnap.exists ? examSnap.data() || {} : {};
    const reveal = exam.revealCorrectAnswersAfterGrading === true;
    const reviewedAt = new Date().toISOString();
    const publicReview = answers.map(answer => ({
      question: text(answer.question, 1500),
      type: text(answer.type, 30),
      answer: text(answer.answer, 4000),
      mark: Math.max(0.25, Number(answer.mark || 1)),
      awardedMark: Number(answer.awardedMark || 0),
      correct: answer.correct === true,
      ...(reveal ? { correctAnswer: text(answer.correctAnswer, 4000) } : {})
    }));
    const summary = {
      ...(summarySnap.exists ? summarySnap.data() : {}),
      id: attemptId,
      examId,
      examTitle: text(attempt.examTitle, 200),
      submittedAt: text(attempt.submittedAt, 60),
      score,
      autoScore: attempt.autoScore === null || attempt.autoScore === undefined ? null : Number(attempt.autoScore),
      maxScore,
      review: publicReview,
      answersRevealed: reveal,
      needsManualReview: false,
      status: 'corrected',
      reviewedAt
    };
    tx.set(attemptRef, { answers, score, maxScore, needsManualReview:false, status:'corrected', reviewedByUid:staff.uid, reviewedByEmail:staff.email||'', reviewedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp() }, { merge:true });
    tx.set(parentRef.collection('attempts').doc(attemptId), summary, { merge:true });
    const existingLast = parentSnap.exists ? parentSnap.data()?.lastAttempt : null;
    const correctedIsLatest = !existingLast || String(existingLast.id || '') === attemptId || String(existingLast.submittedAt || '') <= String(summary.submittedAt || '');
    tx.set(parentRef, { studentCode, ...(correctedIsLatest ? {lastAttempt:summary} : {}), updatedAt:FieldValue.serverTimestamp() }, { merge:true });
    tx.create(db.collection('exam_review_history').doc(), { attemptId, examId, studentCode, oldGrade:attempt.score ?? null, oldMaxScore:attempt.maxScore ?? null, newGrade:score, newMaxScore:maxScore, reviewerUid:staff.uid, reviewerEmail:staff.email||'', reviewerRole:'admin', comment:reason, createdAt:FieldValue.serverTimestamp() });
    tx.create(db.collection('activityLog').doc(), { action:'تصحيح امتحان', actorUid:staff.uid, actorEmail:staff.email||'', actorRole:'admin', metadata:{attemptId,examId,studentCode,score,maxScore}, createdAt:FieldValue.serverTimestamp() });
    return summary;
  });
  await markLeaderboardDirty('exam-reviewed');
  return { ok:true, attempt:result };
});

exports.grantHomeworkRetake = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const assignmentId = cleanDocId(text(request.data?.assignmentId, 120));
  const studentCode = normalizeCode(request.data?.studentCode);
  const reason = text(request.data?.reason, 800);
  if (!assignmentId || !validLegacyOrStrongCode(studentCode)) throw new HttpsError('invalid-argument', 'بيانات الطالب أو الواجب غير مكتملة.');
  if (reason.length < 3) throw new HttpsError('invalid-argument', 'اكتب سبب فتح المحاولة الإضافية.');
  const lockId = homeworkLockId(assignmentId, studentCode);
  const lockRef = db.collection('homework_submission_locks').doc(lockId);
  const firstSubmissionRef = db.collection('homework_submissions').doc(lockId);
  const result = await db.runTransaction(async tx => {
    const [lockSnap, firstSubmissionSnap] = await Promise.all([tx.get(lockRef), tx.get(firstSubmissionRef)]);
    const lock = lockSnap.exists ? lockSnap.data() : {};
    const submittedAttempts = Math.max(firstSubmissionSnap.exists ? 1 : 0, Number(lock.submittedAttempts || 0));
    if (!submittedAttempts) throw new HttpsError('failed-precondition', 'لا يوجد تسليم سابق لفتح محاولة إضافية بعده.');
    const attemptNumber = submittedAttempts + 1;
    const grantRef = db.collection('homework_attempt_grants').doc(`${lockId}_${attemptNumber}`);
    const existingGrant = await tx.get(grantRef);
    if (existingGrant.exists && existingGrant.data().status === 'open') throw new HttpsError('already-exists', 'توجد محاولة إضافية مفتوحة بالفعل لهذا الطالب.');
    if (existingGrant.exists && existingGrant.data().status === 'used') throw new HttpsError('already-exists', 'تم استخدام هذه المحاولة الإضافية بالفعل.');
    tx.create(grantRef, {
      id: grantRef.id,
      lockId,
      assignmentId,
      studentCode,
      attemptNumber,
      reason,
      status: 'open',
      openedBy: staff.email || staff.uid,
      openedByUid: staff.uid,
      openedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(lockRef, { lockId, assignmentId, studentCode, submittedAttempts, openAttemptNumber: attemptNumber, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { grantId: grantRef.id, attemptNumber };
  });
  await serverActivity(staff, 'فتح محاولة واجب إضافية', { assignmentId, studentCode, attemptNumber: result.attemptNumber, reason });
  return { ok: true, assignmentId, studentCode, ...result, reason, openedBy: staff.email || staff.uid, openedAt: new Date().toISOString() };
});

exports.migratePlatformV63 = onCall({ region: 'europe-west1', timeoutSeconds: 540, memory: '1GiB', invoker: 'public' }, async request => {
  const staff = await requireStaff(request, ['admin']);
  const apply = request.data?.apply === true;
  if (apply && request.data?.confirmation !== 'MIGRATE-PLATFORM-V63') throw new HttpsError('failed-precondition', 'اكتب رمز تأكيد ترحيل V63.');
  const [studentsSnap, submissionsSnap, groupsSnap, locksSnap] = await Promise.all([
    db.collection('students').get(),
    db.collection('homework_submissions').where('method', '==', 'student_assignment_answer').get(),
    db.collection('groups').get(),
    db.collection('homework_submission_locks').get()
  ]);
  const report = { apply, studentsScanned: studentsSnap.size, attendanceCodesCreated: 0, homeworkLocksCreated: 0, groupsRecounted: groupsSnap.size, backupName: '' };
  if (apply) report.backupName = (await createPlatformBackup('pre-platform-v63-migration', staff)).name;
  const groupCounts = new Map(groupsSnap.docs.map(doc => [doc.id, 0]));
  studentsSnap.docs.forEach(doc => {
    const student = doc.data() || {};
    const scheduleId = text(student.scheduleId || student.groupId, 100);
    if (student.active !== false && scheduleId && groupCounts.has(scheduleId)) groupCounts.set(scheduleId, groupCounts.get(scheduleId) + 1);
  });
  const lockData = new Map(locksSnap.docs.map(doc => [doc.id, doc.data()]));
  const existingLockIds = new Set(locksSnap.docs.map(doc => doc.id));
  submissionsSnap.docs.forEach(doc => {
    const row = doc.data() || {};
    if (!row.assignmentId || !row.studentCode) return;
    const lockId = homeworkLockId(row.assignmentId, normalizeCode(row.studentCode));
    const attemptNumber = Math.max(1, Number(row.attemptNumber || 1));
    const current = lockData.get(lockId) || {};
    if (attemptNumber >= Number(current.submittedAttempts || 0)) lockData.set(lockId, { ...current, lockId, assignmentId: row.assignmentId, studentCode: normalizeCode(row.studentCode), submittedAttempts: attemptNumber, latestAttemptNumber: attemptNumber, latestSubmissionId: doc.id });
  });
  const writes = [];
  studentsSnap.docs.forEach(doc => {
    const student = doc.data() || {};
    if (student.attendanceCode) return;
    report.attendanceCodesCreated += 1;
    const attendanceCode = randomAttendanceCode();
    const studentCode = normalizeCode(student.studentCode || student.code || doc.id);
    const patch = { attendanceCode, securitySchemaVersion: 63, securityMigratedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    writes.push(batch => batch.set(doc.ref, patch, { merge: true }));
    if (studentCode) {
      writes.push(batch => batch.set(db.collection('student_portal').doc(cleanDocId(studentCode)), patch, { merge: true }));
      writes.push(batch => batch.set(db.collection('parent_portal').doc(cleanDocId(studentCode)), patch, { merge: true }));
    }
  });
  lockData.forEach((row, lockId) => {
    if (!existingLockIds.has(lockId)) report.homeworkLocksCreated += 1;
    writes.push(batch => batch.set(db.collection('homework_submission_locks').doc(lockId), { ...row, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
  });
  groupCounts.forEach((count, groupId) => writes.push(batch => batch.set(db.collection('groups').doc(groupId), { enrolledCount: count, countUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })));
  writes.push(batch => batch.set(db.collection('settings').doc('platform'), {
    schemaVersion: 63,
    gradingWeights: { exam: 40, homework: 25, practical: 15, manual: 20 },
    securityMigrationV63: apply ? 'applied' : 'dry-run',
    securityMigrationV63At: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true }));
  if (apply && writes.length) await commitServerWrites(writes, 380);
  await serverActivity(staff, apply ? 'تنفيذ ترحيل المنصة V63' : 'فحص ترحيل المنصة V63', report);
  return report;
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

async function fetchAllCollectionDocuments(collection, configure = query => query, pageSize = 500) {
  const docs = [];
  let cursor = null;
  do {
    let query = configure(db.collection(collection)).orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    docs.push(...snap.docs);
    cursor = snap.size === pageSize ? snap.docs[snap.docs.length - 1] : null;
  } while (cursor);
  return { docs };
}

exports.getPublicLeaderboard = onCall(CALLABLE_OPTIONS, async request => {
  // The old shared identity "all" imposed one 30-request limit on the whole
  // website. Limit per visitor IP instead so simultaneous students can load it.
  await rateLimit('public-leaderboard-ip', requestIp(request), 60, 60 * 1000);
  const stateSnap = await leaderboardStateRef.get().catch(() => null);
  const stateVersion = stateSnap?.exists ? Number(stateSnap.data()?.version || 0) : 0;
  const canonicalLeaderboardGrade = value => text(canonicalAcademicLabel(value), 50);
  const requestedGrade = canonicalLeaderboardGrade(request.data?.grade);
  if (!ACADEMIC_GRADES.includes(requestedGrade)) throw new HttpsError('invalid-argument', 'اختر مسارًا صحيحًا من المسارات المتاحة.');
  const selectGradeLeaders = items => (items || []).filter(row => canonicalLeaderboardGrade(row.grade) === requestedGrade).slice(0, 5);
  if (leaderboardCache.expiresAt > Date.now() && leaderboardCache.version === stateVersion) return selectGradeLeaders(leaderboardCache.rows);
  const [studentsSnap, attendanceSnap, gradesSnap, examAttemptsSnap, homeworkSnap, recitationSnap, assignmentSnap] = await Promise.all([
    fetchAllCollectionDocuments('students', query => query.where('active', '==', true)),
    fetchAllCollectionDocuments('attendance'),
    fetchAllCollectionDocuments('grades'),
    fetchAllCollectionDocuments('exam_attempts'),
    fetchAllCollectionDocuments('homework_submissions'),
    fetchAllCollectionDocuments('recitations'),
    fetchAllCollectionDocuments('assignments')
  ]);
  const grouped = snap => { const map = new Map(); snap.docs.forEach(doc => { const row=doc.data()||{},code=normalizeCode(row.studentCode); if(!code)return; if(!map.has(code))map.set(code,[]); map.get(code).push(row); }); return map; };
  const attendance=grouped(attendanceSnap),grades=grouped(gradesSnap),examAttempts=grouped(examAttemptsSnap),homeworks=grouped(homeworkSnap),recitations=grouped(recitationSnap);
  const complete=row=>row.completed===true||row.approved===true||String(row.status||'').startsWith('تم');
  const currentMonth=cairoDateKey(new Date()).slice(0,7);
  const currentMonthRows=items=>(items||[]).filter(row=>leaderboardRecordDate(row).slice(0,7)===currentMonth);
  const recordDate=leaderboardRecordDate;
  const rows=studentsSnap.docs.map(doc=>{
    const st=doc.data()||{},code=normalizeCode(st.studentCode||st.code||doc.id);
    const att=currentMonthRows(attendance.get(code)||st.attendance||[]),present=att.filter(x=>['present','حاضر','متأخر'].includes(x.status)).length,attendancePct=att.length?Math.round(present/att.length*100):0;
    const gradeRows=[...currentMonthRows(grades.get(code)||st.grades||[]),...currentMonthRows(examAttempts.get(code)||[])].filter(x=>Number.isFinite(Number(x.score))),gradePct=gradeRows.length?Math.round(gradeRows.reduce((sum,x)=>sum+(Number(x.maxScore)>0?Number(x.score)/Number(x.maxScore)*100:Number(x.score)),0)/gradeRows.length):0;
    const allStudentHomework=homeworks.get(code)||st.homeworks||[],hw=currentMonthRows(allStudentHomework).filter(complete),rec=currentMonthRows(recitations.get(code)||st.recitations||[]).filter(complete);
    const requiredAssignments=assignmentSnap.docs.map(item=>({id:item.id,...item.data()})).filter(item=>assignmentIsReleased(item)&&learningTargetMatchesStudent(item,st)&&cairoDateKey(item.publishAt||item.createdAt||item.dueDate).slice(0,7)===currentMonth);
    const homeworkSummary=homeworkMetrics(requiredAssignments,allStudentHomework);
    const classDates=new Set(att.map(recordDate).filter(Boolean));rec.forEach(row=>{const date=recordDate(row);if(date)classDates.add(date);});
    const sessions=classDates.size,completedDates=items=>new Set(items.map(recordDate).filter(Boolean)).size;
    const homeworkPct=Math.round(homeworkSummary.submissionPercentage),recitationPct=sessions?Math.min(100,Math.round(completedDates(rec)/sessions*100)):0;
    const score=Math.round(attendancePct*.30+gradePct*.40+homeworkPct*.15+recitationPct*.15);
    return {name:publicStudentName(st.studentName||st.name),grade:canonicalLeaderboardGrade(st.grade),score,attendancePct,gradePct,homeworkPct,recitationPct,activity:att.length+gradeRows.length+hw.length+rec.length};
  }).filter(x=>x.name&&x.activity>0).sort((a,b)=>b.score-a.score||b.attendancePct-a.attendancePct||b.gradePct-a.gradePct);
  leaderboardCache = { expiresAt: Date.now() + 5 * 60 * 1000, version: stateVersion, rows };
  return selectGradeLeaders(rows);
});

exports.createStudentAccess = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const body = request.data || {};
  const name = text(body.studentName || body.name, 100);
  const nameKey = studentNameKey(name);
  const parentPhone = digits(body.parentPhone);
  const studentGrade = text(canonicalAcademicLabel(body.grade), 80);
  if (name.length < 3) throw new HttpsError('invalid-argument', 'اكتب اسم الطالب كاملًا.');
  if (!validPhone(parentPhone)) throw new HttpsError('invalid-argument', 'اكتب رقم ولي أمر صحيحًا.');
  if (!isSupportedAcademicGrade(studentGrade)) throw new HttpsError('invalid-argument', 'اختر مسار الطالب من القائمة المتاحة.');
  const existing = await registeredStudentForName(name, nameKey, body.studentPhone, parentPhone);
  if (existing.record) {
    const code = existingStudentCode(existing.record);
    throw new HttpsError('already-exists', `الطالب موجود بالفعل — كود الطالب: ${code}`);
  }
  const nameRegistryRef = existing.registryRef;

  for (let attemptNo = 0; attemptNo < 8; attemptNo += 1) {
    const studentCode = await uniqueUnifiedAccessCode(8);
    const parentCode = studentCode;
    const studentRef = db.collection('students').doc(cleanDocId(studentCode));
    const studentPortalRef = db.collection('student_portal').doc(cleanDocId(studentCode));
    const parentPortalRef = db.collection('parent_portal').doc(cleanDocId(parentCode));
    const paymentRef = db.collection('payments').doc(cleanDocId(studentCode));
    const attendanceCode = randomAttendanceCode();
    const student = {
      studentCode,
      code: studentCode,
      parentCode,
      attendanceCode,
      securitySchemaVersion: 63,
      studentName: name,
      name,
      nameKey,
      studentPhone: digits(body.studentPhone),
      parentPhone,
      grade: studentGrade,
      month: text(body.month, 40),
      group: text(body.group, 100),
      groupId: text(body.groupId || body.scheduleId, 100),
      scheduleId: text(body.scheduleId || body.groupId, 100),
      scheduleDays: text(body.scheduleDays, 100),
      scheduleStartTime: text(body.scheduleStartTime, 20),
      scheduleEndTime: text(body.scheduleEndTime, 20),
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
    if (student.scheduleId) batch.set(db.collection('groups').doc(cleanDocId(student.scheduleId)), { enrolledCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    batch.create(nameRegistryRef, { name, nameKey, studentCode, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    batch.set(paymentRef, {
      studentCode,
      studentName: name,
      grade: student.grade,
      group: student.group,
      scheduleId: student.scheduleId,
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
      const concurrent = await registeredStudentForName(name, nameKey, body.studentPhone, parentPhone).catch(() => null);
      if (concurrent?.record) {
        throw new HttpsError('already-exists', `الطالب موجود بالفعل — كود الطالب: ${existingStudentCode(concurrent.record)}`);
      }
      if (attemptNo === 7) throw new HttpsError('aborted', 'تعذر إنشاء أكواد فريدة، حاول مرة أخرى.');
    }
  }
  throw new HttpsError('resource-exhausted', 'تعذر إنشاء أكواد فريدة، حاول مرة أخرى.');
});

exports.migrateStudentCodeSafely = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const oldCode = normalizeCode(request.data?.oldCode);
  const newCode = normalizeCode(request.data?.newCode);
  if (!validLegacyOrStrongCode(oldCode) || !validLegacyOrStrongCode(newCode) || oldCode === newCode) {
    throw new HttpsError('invalid-argument', 'الكود القديم أو الجديد غير صالح.');
  }
  const oldId=cleanDocId(oldCode),newId=cleanDocId(newCode);
  const rootCollections=['attendance','grades','recitations','homework_submissions','exam_attempts','monthly_payments','payment_transactions','bookings','booking_status','student_transfer_requests','homework_attempt_grants'];
  const result=await db.runTransaction(async tx=>{
    const oldStudentRef=db.collection('students').doc(oldId),newStudentRef=db.collection('students').doc(newId);
    const oldAttemptsRef=db.collection('student_attempts').doc(oldId),newAttemptsRef=db.collection('student_attempts').doc(newId);
    const reads=await Promise.all([
      tx.get(oldStudentRef),tx.get(newStudentRef),tx.get(db.collection('student_portal').doc(oldId)),tx.get(db.collection('parent_portal').doc(oldId)),tx.get(db.collection('payments').doc(oldId)),tx.get(oldAttemptsRef),tx.get(oldAttemptsRef.collection('attempts').limit(200)),
      ...rootCollections.map(collection=>tx.get(db.collection(collection).where('studentCode','==',oldCode).limit(300))),
      tx.get(db.collection('homework_submission_locks').where('studentCode','==',oldCode).limit(200)),
      tx.get(db.collection('exam_locks').where('studentCode','==',oldCode).limit(200)),
      tx.get(db.collection('_portal_sessions').where('studentCode','==',oldCode).limit(50))
    ]);
    const [oldStudent,newStudent,studentPortal,parentPortal,payment,attemptParent,attemptDocs,...remaining]=reads;
    if(!oldStudent.exists)throw new HttpsError('not-found','الطالب بالكود القديم غير موجود.');
    if(newStudent.exists)throw new HttpsError('already-exists','الكود الجديد مستخدم بالفعل.');
    const rootSnaps=remaining.slice(0,rootCollections.length),homeworkLocks=remaining[rootCollections.length],examLocks=remaining[rootCollections.length+1],sessions=remaining[rootCollections.length+2];
    const operationCount=12+attemptDocs.size+rootSnaps.reduce((sum,snap)=>sum+snap.size,0)+(homeworkLocks.size*2)+(examLocks.size*2)+sessions.size;
    if(operationCount>430)throw new HttpsError('resource-exhausted','سجلات الطالب كثيرة وتحتاج Migration مجزأة بعد أخذ نسخة احتياطية. لم يتم تغيير أي بيانات.');
    const raw={...oldStudent.data(),...(request.data?.student&&typeof request.data.student==='object'?request.data.student:{}),id:newCode,code:newCode,studentCode:newCode,parentCode:newCode,updatedAt:FieldValue.serverTimestamp(),codeMigratedAt:FieldValue.serverTimestamp(),codeMigratedFrom:oldCode};
    tx.create(newStudentRef,raw);
    tx.set(db.collection('student_portal').doc(newId),{...raw,parentCode:newCode},{merge:true});
    tx.set(db.collection('parent_portal').doc(newId),{...raw,parentCode:newCode},{merge:true});
    if(payment.exists)tx.set(db.collection('payments').doc(newId),{...payment.data(),studentId:newId,studentCode:newCode,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    if(attemptParent.exists)tx.set(newAttemptsRef,{...attemptParent.data(),studentCode:newCode,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    attemptDocs.docs.forEach(docSnap=>{tx.set(newAttemptsRef.collection('attempts').doc(docSnap.id),{...docSnap.data(),studentCode:newCode},{merge:true});tx.delete(docSnap.ref);});
    rootSnaps.forEach(snap=>snap.docs.forEach(docSnap=>tx.update(docSnap.ref,{studentCode:newCode,updatedAt:FieldValue.serverTimestamp()})));
    homeworkLocks.docs.forEach(docSnap=>{const data=docSnap.data()||{},newRef=db.collection('homework_submission_locks').doc(homeworkLockId(text(data.assignmentId,120),newCode));tx.set(newRef,{...data,lockId:newRef.id,studentCode:newCode,updatedAt:FieldValue.serverTimestamp()},{merge:true});tx.delete(docSnap.ref);});
    examLocks.docs.forEach(docSnap=>{const data=docSnap.data()||{},newRef=db.collection('exam_locks').doc(cleanDocId(`${text(data.examId,120)}_${newCode}`));tx.set(newRef,{...data,studentCode:newCode,updatedAt:FieldValue.serverTimestamp()},{merge:true});tx.delete(docSnap.ref);});
    sessions.docs.forEach(docSnap=>tx.delete(docSnap.ref));
    tx.delete(oldStudentRef);if(studentPortal.exists)tx.delete(studentPortal.ref);if(parentPortal.exists)tx.delete(parentPortal.ref);if(payment.exists)tx.delete(payment.ref);if(attemptParent.exists)tx.delete(attemptParent.ref);
    tx.create(db.collection('student_code_migrations').doc(),{oldCode,newCode,status:'completed',recordCount:operationCount,actorUid:staff.uid,actorEmail:staff.email||'',createdAt:FieldValue.serverTimestamp()});
    tx.create(db.collection('activityLog').doc(),{action:'تغيير كود طالب',actorUid:staff.uid,actorEmail:staff.email||'',actorRole:'admin',metadata:{oldCode,newCode,recordCount:operationCount},createdAt:FieldValue.serverTimestamp()});
    return {ok:true,oldCode,newCode,recordCount:operationCount};
  });
  return result;
});

exports.regenerateParentAccessCode = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const studentCode = normalizeCode(request.data?.studentCode);
  if (!validLegacyOrStrongCode(studentCode)) throw new HttpsError('invalid-argument', 'كود الطالب غير صالح.');
  const studentRef = db.collection('students').doc(cleanDocId(studentCode));
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists || studentSnap.data().active === false) throw new HttpsError('not-found', 'الطالب غير موجود أو غير نشط.');
  const student = studentSnap.data() || {};
  const oldParentCode = normalizeCode(student.parentCode);
  const parentCode = studentCode;
  const portal = portalResponse({ ...student, studentCode, parentCode }, []);
  const batch = db.batch();
  batch.update(studentRef, { parentCode, updatedAt: FieldValue.serverTimestamp() });
  batch.set(db.collection('student_portal').doc(cleanDocId(studentCode)), { ...portal, studentCode, parentCode, active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.collection('parent_portal').doc(cleanDocId(parentCode)), { ...portal, studentCode, parentCode, active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (oldParentCode && oldParentCode !== parentCode) batch.delete(db.collection('parent_portal').doc(cleanDocId(oldParentCode)));
  batch.set(db.collection('activityLog').doc(), {
    action: 'تم إصلاح وتوحيد كود الدخول',
    meta: { studentCode },
    actorUid: staff.uid,
    actorEmail: staff.email || '',
    actorRole: staff.role || '',
    createdAt: FieldValue.serverTimestamp()
  });
  await batch.commit();
  return { studentCode, parentCode };
});

async function unifyStudentAccessDocuments(docs = []) {
  let migrated = 0;
  let alreadyUnified = 0;
  for (let offset = 0; offset < docs.length; offset += 100) {
    const batch = db.batch();
    const chunk = docs.slice(offset, offset + 100);
    for (const doc of chunk) {
      const raw = doc.data() || {};
      const studentCode = normalizeCode(raw.studentCode || raw.code || doc.id);
      if (!validLegacyOrStrongCode(studentCode)) continue;
      const oldParentCode = normalizeCode(raw.parentCode);
      const unified = { ...raw, id: studentCode, code: studentCode, studentCode, parentCode: studentCode };
      const portal = portalResponse(unified, []);
      const projection = { ...portal, studentCode, code: studentCode, parentCode: studentCode, active: raw.active !== false, updatedAt: FieldValue.serverTimestamp() };
      batch.set(doc.ref, { studentCode, code: studentCode, parentCode: studentCode, accessCodeVersion: 2, accessUnifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      batch.set(db.collection('student_portal').doc(cleanDocId(studentCode)), projection, { merge: true });
      batch.set(db.collection('parent_portal').doc(cleanDocId(studentCode)), projection, { merge: true });
      if (oldParentCode && oldParentCode !== studentCode) batch.delete(db.collection('parent_portal').doc(cleanDocId(oldParentCode)));
      if (oldParentCode === studentCode && Number(raw.accessCodeVersion) === 2) alreadyUnified += 1;
      else migrated += 1;
    }
    await batch.commit();
  }
  return { scanned: docs.length, migrated, alreadyUnified };
}

exports.unifyStudentAccessCodes = onCall({ ...CALLABLE_OPTIONS, timeoutSeconds: 120, memory: '512MiB' }, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const snap = await db.collection('students').limit(3000).get();
  const result = await unifyStudentAccessDocuments(snap.docs);
  await db.collection('activityLog').add({
    action: 'تم توحيد أكواد بوابتي الطالب وولي الأمر',
    meta: result,
    actorUid: staff.uid,
    actorEmail: staff.email || '',
    actorRole: staff.role || '',
    createdAt: FieldValue.serverTimestamp()
  });
  return { ok: true, ...result };
});

exports.unifyLegacyStudentAccess = onSchedule({ schedule: 'every 6 hours', region: 'europe-west1', timeZone: 'Africa/Cairo', timeoutSeconds: 120, memory: '256MiB' }, async () => {
  const stateRef = db.collection('_system').doc('unified_student_access');
  const stateSnap = await stateRef.get();
  const cursor = text(stateSnap.exists ? stateSnap.data().cursor : '', 200);
  let query = db.collection('students').orderBy(admin.firestore.FieldPath.documentId()).limit(100);
  if (cursor) query = query.startAfter(cursor);
  let snap = await query.get();
  if (snap.empty && cursor) snap = await db.collection('students').orderBy(admin.firestore.FieldPath.documentId()).limit(100).get();
  const result = await unifyStudentAccessDocuments(snap.docs);
  const nextCursor = snap.empty ? '' : snap.docs[snap.docs.length - 1].id;
  await stateRef.set({ ...result, cursor: nextCursor, lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
  return result;
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
  const nameKey = studentNameKey(name);
  const studentPhone = digits(body.studentPhone);
  const parentPhone = digits(body.parentPhone);
  if (name.length < 3) throw new HttpsError('invalid-argument', 'اكتب اسم الطالب كاملًا.');
  if (!validPhone(studentPhone) || !validPhone(parentPhone)) throw new HttpsError('invalid-argument', 'اكتب أرقام هاتف صحيحة.');
  const existing = await registeredStudentForName(name, nameKey, studentPhone, parentPhone);
  if (existing.record) {
    return returnExistingStudent(existing.record, existing.registryRef, requestRef, requestId, name, nameKey, studentPhone, parentPhone);
  }
  const nameRegistryRef = existing.registryRef;
  const requestedGrade = text(canonicalAcademicLabel(body.grade), 80);
  const requestedGroup = text(body.group, 100);
  const selectedScheduleId = cleanDocId(text(body.scheduleId, 100));
  if (!isSupportedAcademicGrade(requestedGrade)) throw new HttpsError('invalid-argument', 'اختر المسار التعليمي من القائمة المتاحة.');
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
    if (!sameAcademicValue(schedule.grade, requestedGrade)) throw new HttpsError('failed-precondition', 'الموعد المختار غير متاح لهذا المسار.');
    if (text(schedule.name, 100) !== requestedGroup) throw new HttpsError('failed-precondition', 'المجموعة المختارة تغيّرت. حدّث الصفحة واخترها من جديد.');
  } else {
    code = await uniqueUnifiedAccessCode(8);
  }
  // All codes shown after booking are digits only and can be typed with Arabic
  // or English numerals. They are issued immediately and never change later.
  const studentCode = code;
  // One numeric code opens the student and parent portals.
  const parentCode = studentCode;
  const attendanceCode = randomAttendanceCode();
  const payload = {
    id: code,
    code,
    name,
    studentName: name,
    nameKey,
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
    attendanceCode,
    securitySchemaVersion: 63,
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
    active: false,
    approvalStatus: 'قيد التسجيل'
  };
  const provisionalPortal = portalResponse(provisionalStudent, []);
  batch.create(db.collection('students').doc(studentCode), provisionalStudent);
  batch.create(db.collection('student_portal').doc(studentCode), { ...provisionalPortal, parentCode, active: false, updatedAt: FieldValue.serverTimestamp() });
  batch.create(db.collection('parent_portal').doc(parentCode), { ...provisionalPortal, parentCode, active: false, updatedAt: FieldValue.serverTimestamp() });
  batch.create(nameRegistryRef, { name, nameKey, studentCode, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
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
    const concurrent = await registeredStudentForName(name, nameKey, studentPhone, parentPhone).catch(() => null);
    if (concurrent?.record) {
      return returnExistingStudent(concurrent.record, concurrent.registryRef, requestRef, requestId, name, nameKey, studentPhone, parentPhone);
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
    if (student.scheduleId) tx.set(db.collection('groups').doc(cleanDocId(student.scheduleId)), { enrolledCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.collection('student_portal').doc(studentCode), { ...portal, parentCode, active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.collection('parent_portal').doc(parentCode), { ...portal, parentCode, active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (oldParentCode && oldParentCode !== parentCode) tx.delete(db.collection('parent_portal').doc(cleanDocId(oldParentCode)));
    tx.set(db.collection('payments').doc(studentCode), { studentCode, studentName: name, grade: student.grade, group: student.group, scheduleId: student.scheduleId || '', academicYear: student.academicYear, term: student.term, paid: false, paymentDate: '', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
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
    grade: text(canonicalAcademicLabel(data.grade), 80),
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
    const parentCode = studentCode || text(data.parentCode, 40);
    const rejectedNameKey = studentNameKey(data.studentName || data.name);
    if (studentCode) {
      tx.set(db.collection('students').doc(cleanDocId(studentCode)), { active: false, approvalStatus: 'تم رفض الحجز', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(db.collection('student_portal').doc(cleanDocId(studentCode)), { active: false, approvalStatus: 'تم رفض الحجز', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (parentCode) tx.set(db.collection('parent_portal').doc(cleanDocId(parentCode)), { studentCode, parentCode, active: false, approvalStatus: 'تم رفض الحجز', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const legacyParentCode = text(data.parentCode, 40);
    if (legacyParentCode && legacyParentCode !== parentCode) tx.delete(db.collection('parent_portal').doc(cleanDocId(legacyParentCode)));
    if (rejectedNameKey) tx.delete(studentNameRegistryRef(rejectedNameKey));
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

async function validateAttendanceSchedule(student, date) {
  let days = configuredScheduleDays(student.scheduleDays);
  if (!days.length && student.scheduleId) {
    const groupSnap = await db.collection('groups').doc(cleanDocId(student.scheduleId)).get().catch(() => null);
    if (groupSnap?.exists) days = configuredScheduleDays(groupSnap.data().days);
  }
  if (!days.length) throw new HttpsError('failed-precondition', 'لم يتم ضبط أيام المجموعة. أضف يومًا واحدًا على الأقل.');
  const weekday = cairoWeekdayForDate(date);
  if (!days.includes(weekday)) throw new HttpsError('failed-precondition', `هذا اليوم ليس من مواعيد المجموعة (${days.join('، ')}).`);
  return { days, weekday };
}

function attendanceServerPayload(student, date, status, method, staff) {
  const studentCode = normalizeCode(student.studentCode || student.code || student.id);
  return {
    id: cleanDocId(`${studentCode}_${date}`),
    studentId: studentCode,
    studentCode,
    studentName: text(student.studentName || student.name, 100),
    grade: text(canonicalAcademicLabel(student.grade), 80),
    group: text(student.group, 100),
    scheduleId: text(student.scheduleId || student.groupId, 100),
    status,
    date,
    time: status === 'present' ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()) : '',
    timeZone: 'Africa/Cairo',
    method,
    scannedBy: staff.email || staff.uid,
    recordedByUid: staff.uid,
    recordedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
}

exports.recordAttendance = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const body = request.data || {};
  const date = text(body.date, 10) || cairoDateKey(new Date());
  const status = body.status === 'absent' ? 'absent' : 'present';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'تاريخ الحضور غير صالح.');
  let studentSnap = null;
  const attendanceCode = text(body.attendanceCode || body.qrCode, 60).toUpperCase();
  if (attendanceCode) {
    const match = await db.collection('students').where('attendanceCode', '==', attendanceCode).limit(1).get();
    if (!match.empty) studentSnap = match.docs[0];
    if (!studentSnap && validLegacyOrStrongCode(attendanceCode)) {
      const legacy = await db.collection('students').doc(cleanDocId(attendanceCode)).get();
      if (legacy.exists && !legacy.data().attendanceCode) studentSnap = legacy;
    }
  } else {
    const studentCode = normalizeCode(body.studentCode);
    if (validLegacyOrStrongCode(studentCode)) studentSnap = await db.collection('students').doc(cleanDocId(studentCode)).get();
  }
  if (!studentSnap?.exists || studentSnap.data().active === false) throw new HttpsError('not-found', 'الطالب غير موجود أو غير نشط.');
  const student = { id: studentSnap.id, ...studentSnap.data() };
  await validateAttendanceSchedule(student, date);
  const payload = attendanceServerPayload(student, date, status, attendanceCode ? 'qr_scan' : 'manual_button', staff);
  await db.collection('attendance').doc(payload.id).set(payload, { merge: true });
  await markLeaderboardDirty('attendance');
  return { ...payload, recordedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
});

exports.bulkMarkAttendance = onCall({ ...CALLABLE_OPTIONS, timeoutSeconds: 60, memory: '512MiB' }, async request => {
  const staff = await requireStaff(request);
  const body = request.data || {};
  const date = text(body.date, 10) || cairoDateKey(new Date());
  const group = text(body.group, 100);
  const scheduleId = cleanDocId(text(body.scheduleId, 100));
  const grade = text(canonicalAcademicLabel(body.grade), 80);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (!group && !scheduleId)) throw new HttpsError('invalid-argument', 'اختر المجموعة وتاريخ الحضور.');
  const studentsQuery = scheduleId
    ? db.collection('students').where('scheduleId', '==', scheduleId).limit(1000)
    : db.collection('students').where('group', '==', group).limit(1000);
  const [studentsSnap, attendanceSnap] = await Promise.all([
    studentsQuery.get(),
    db.collection('attendance').where('date', '==', date).where('group', '==', group).limit(1000).get().catch(() => null)
  ]);
  const students = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(student =>
    student.active !== false && (!grade || sameAcademicValue(student.grade, grade))
  );
  if (!students.length) throw new HttpsError('not-found', 'لا يوجد طلاب نشطون في هذه المجموعة.');
  await validateAttendanceSchedule(students[0], date);
  const existingCodes = new Set(attendanceSnap ? attendanceSnap.docs.map(doc => normalizeCode(doc.data().studentCode)) : []);
  const missing = students.filter(student => !existingCodes.has(normalizeCode(student.studentCode || student.id)));
  for (let index = 0; index < missing.length; index += 420) {
    const batch = db.batch();
    missing.slice(index, index + 420).forEach(student => {
      const payload = attendanceServerPayload(student, date, 'absent', 'bulk_absent', staff);
      batch.set(db.collection('attendance').doc(payload.id), payload, { merge: true });
    });
    await batch.commit();
  }
  if (missing.length) await markLeaderboardDirty('bulk-attendance');
  await serverActivity(staff, 'تسجيل غياب جماعي', { date, group, scheduleId, count: missing.length });
  return { ok: true, date, group, totalStudents: students.length, alreadyRecorded: students.length - missing.length, saved: missing.length, timeZone: 'Africa/Cairo' };
});

function examMatchesStudent(exam, student) {
  return learningTargetMatchesStudent(exam, student);
}

function examIsOpen(exam, now = Date.now()) {
  if (exam.active === false) return false;
  const openAt = scheduledTimeMillis(exam.openAt);
  const closeAt = scheduledTimeMillis(exam.closeAt);
  if (openAt && Number.isFinite(openAt) && now < openAt) return false;
  if (closeAt && Number.isFinite(closeAt) && now > closeAt) return false;
  return true;
}
function examScheduleState(exam, now = Date.now()) {if(exam.active===false)return 'inactive';const open=scheduledTimeMillis(exam.openAt),close=scheduledTimeMillis(exam.closeAt);if(open&&Number.isFinite(open)&&now<open)return 'upcoming';if(close&&Number.isFinite(close)&&now>close)return 'closed';return 'open';}

exports.getExamDashboard = onCall(CALLABLE_OPTIONS, async request => {
  const studentCode = normalizeCode(request.data && request.data.studentCode);
  await requirePortalSession(request, studentCode, ['student']);
  await rateLimitPublic('exam-dashboard', studentCode, request, 10, 35, 60 * 1000);
  const found = await getStudentPortalByCode(studentCode);
  requireApprovedStudent(found.data);
  const examDocs = await targetedLearningDocs('exams', found.data);
  const exams = examDocs.map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(exam => examMatchesStudent(exam, found.data))
    .map(exam => ({
      id: text(exam.id, 100),
      title: text(exam.title, 200),
      grade: text(canonicalAcademicLabel(exam.grade), 80),
      group: text(exam.group, 100),
      scheduleId: text(exam.scheduleId || exam.groupId, 100),
      academicYear: text(exam.academicYear, 20),
      term: text(exam.term, 40),
      openAt: text(exam.openAt, 60),
      closeAt: text(exam.closeAt, 60),
      duration: Math.max(1, Math.min(240, Number(exam.duration || 20))),
      instructions: text(exam.instructions, 1500),
      pdfUrl: safePublicUrl(exam.pdfUrl || exam.examPdfUrl),
      pdfName: text(exam.pdfName || exam.examPdfName, 220),
      allowRetake: exam.allowRetake === true,
      scheduleState: examScheduleState(exam),
      questionCount: Number(exam.questionCount || parseExamQuestions(exam.text || exam.questionsText).length)
    }));
  const [attempts, records] = await Promise.all([attemptSummaries(studentCode), studentRecords(studentCode, found.data)]);
  return { student: portalResponse(found.data, attempts, records), exams };
});

exports.startExam = onCall(CALLABLE_OPTIONS, async request => {
  const studentCode = normalizeCode(request.data && request.data.studentCode);
  const examId = cleanDocId(request.data && request.data.examId);
  await requirePortalSession(request, studentCode, ['student']);
  await rateLimitPublic('exam-start', `${studentCode}:${examId}`, request, 5, 20, 10 * 60 * 1000);
  const found = await getStudentPortalByCode(studentCode);
  requireApprovedStudent(found.data);
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
      examVersion: Math.max(1, Number(exam.version || 1)),
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
  await requirePortalSession(request, studentCode, ['student']);
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
    const questionMark = Math.max(0.25, Number(question.mark || 1));
    if (question.type === 'mcq' || question.type === 'truefalse') {
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
        optionLabels: question.optionLabels,
        mark: questionMark,
        awardedMark: correct === true ? questionMark : 0
      });
    } else {
      essayCount += 1;
      needsManualReview = true;
      staffAnswers.push({
        question: question.question,
        type: 'essay',
        answer: text(value, 4000),
        correct: null,
        correctAnswer: question.modelAnswer || 'يصححها المدرس',
        mark: questionMark,
        awardedMark: null
      });
    }
  });

  const maxScore = questions.reduce((sum, question) => sum + Math.max(0.25, Number(question.mark || 1)), 0);
  const autoScore = staffAnswers.reduce((sum, answer) => sum + Number(answer.awardedMark || 0), 0);
  const score = needsManualReview ? null : autoScore;
  const attemptRef = db.collection('exam_attempts').doc();
  const submittedAt = new Date().toISOString();
  const attempt = {
    id: attemptRef.id,
    examId: session.examId,
    examTitle: text(exam.title, 200),
    examVersion: Math.max(1, Number(session.examVersion || exam.version || 1)),
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
    maxScore,
    mcqCount,
    essayCount,
    questionCount: questions.length,
    correctCount,
    needsManualReview,
    status: needsManualReview ? 'pending_manual' : 'submitted',
    answers: staffAnswers,
    questionsSnapshot: questions,
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
    maxScore,
    // Public/student projection deliberately excludes correctAnswer. The full
    // correction remains only in exam_attempts for authorized staff.
    review: staffAnswers.map(answer => ({
      question: answer.question,
      type: answer.type,
      answer: answer.answer,
      mark: answer.mark,
      awardedMark: answer.awardedMark,
      correct: answer.correct,
      ...(exam.revealCorrectAnswersAfterGrading === true && !needsManualReview ? { correctAnswer: answer.correctAnswer } : {})
    })),
    answersRevealed: exam.revealCorrectAnswersAfterGrading === true && !needsManualReview,
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
  await requirePortalSession(request, studentCode, ['student']);
  await rateLimitPublic('homework-prepare', studentCode, request, 5, 15, 60 * 60 * 1000);
  const found = await getStudentPortalByCode(studentCode);
  requireApprovedStudent(found.data);
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
  await requirePortalSession(request, studentCode, ['student']);
  await rateLimitPublic('homework-submit', studentCode, request, 5, 15, 60 * 60 * 1000);
  const found = await getStudentPortalByCode(studentCode);
  requireApprovedStudent(found.data);
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
  'attendance','recitations','grades','payments','monthly_payments','payment_transactions','reports','activityLog','client_errors',
  'student_attempts','exam_locks','homework_submission_locks','homework_attempt_grants','homework_review_history','assessment_versions'
  ,'curriculum','units','lectures','lecture_materials','assignments_v2','assignment_questions',
  'question_banks','bank_questions','monthly_exams','exam_questions_v2','teacher_files','student_progress'
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
    if (collectionName === 'student_progress') {
      const lectures = await doc.ref.collection('lectures').get();
      row.lectures = lectures.docs.map(lecture => ({ id: lecture.id, data: encodeBackupValue(lecture.data()) }));
    }
    rows.push(row);
  }
  return rows;
}

async function createPlatformBackup(reason, actor = {}) {
  const collections = {};
  for (const name of BACKUP_COLLECTIONS) collections[name] = await exportCollection(name);
  const payload = {
    schemaVersion: 63,
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
  await bucket.file(name).save(buffer, { resumable: false, contentType: 'application/gzip', metadata: { cacheControl: 'private, max-age=0', metadata: { schemaVersion: '63', reason: text(reason, 100) } } });
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

exports.cleanupArchivedStorage = onSchedule({ schedule: '20 3 * * *', timeZone: 'Africa/Cairo', region: 'europe-west1', timeoutSeconds: 300, memory: '512MiB' }, async () => {
  const now = Timestamp.now();
  const candidates = [];
  for (const collection of VERSIONED_CONTENT_COLLECTIONS) {
    const snap = await db.collection(collection).where('storageCleanupEligibleAt', '<=', now).limit(40).get().catch(() => null);
    if (snap) snap.docs.forEach(doc => candidates.push({ collection, doc }));
  }
  const bucket = admin.storage().bucket();
  for (const candidate of candidates.slice(0, 100)) {
    const data = candidate.doc.data() || {};
    const filePath = text(data.filePath || data.path, 500);
    if (!data.archived || data.storageCleanedAt || !/^(teacher-uploads|public\/uploads|curriculum|teacher-files)\//.test(filePath)) continue;
    let referenced = false;
    for (const collection of VERSIONED_CONTENT_COLLECTIONS) {
      const refs = await db.collection(collection).where('filePath', '==', filePath).limit(5).get().catch(() => null);
      if (refs?.docs.some(doc => doc.ref.path !== candidate.doc.ref.path && doc.data().archived !== true && doc.data().active !== false)) {
        referenced = true;
        break;
      }
    }
    if (referenced) {
      await candidate.doc.ref.set({ storageCleanupSkipped: 'still-referenced', storageCleanupCheckedAt: FieldValue.serverTimestamp(), storageCleanupEligibleAt: FieldValue.delete() }, { merge: true });
      continue;
    }
    await bucket.file(filePath).delete({ ignoreNotFound: true });
    await candidate.doc.ref.set({ storageCleanedAt: FieldValue.serverTimestamp(), storageCleanupEligibleAt: FieldValue.delete(), fileUrl: FieldValue.delete(), url: FieldValue.delete() }, { merge: true });
  }
});

exports.createBackupNow = onCall({ region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB' }, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const result = await createPlatformBackup('manual', staff);
  await pruneBackups(14);
  return result;
});

exports.migrateLegacyPayments = onCall({ region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB', invoker: 'public' }, async request => {
  const staff = await requireStaff(request, ['admin']);
  const confirmation = text(request.data?.confirmation, 80);
  if (confirmation !== 'MIGRATE-PAYMENTS-V60.6') throw new HttpsError('failed-precondition', 'تأكيد ترحيل المدفوعات غير صحيح.');
  const safetyBackup = await createPlatformBackup('pre-payment-migration', staff);
  const [studentsSnap, legacySnap, settingsSnap] = await Promise.all([
    db.collection('students').limit(5000).get(),
    db.collection('payments').limit(5000).get(),
    db.collection('settings').doc('platform').get().catch(() => null)
  ]);
  const legacyByCode = new Map(legacySnap.docs.map(doc => {
    const row = doc.data() || {};
    return [normalizeCode(row.studentCode || row.studentId || doc.id), row];
  }));
  const coursePrices = settingsSnap?.exists ? (settingsSnap.data().coursePrices || {}) : {};
  const candidates = studentsSnap.docs.map(doc => {
    const student = doc.data() || {};
    const studentCode = normalizeCode(student.studentCode || student.code || doc.id);
    const legacy = legacyByCode.get(studentCode) || {};
    const amount = money(legacy.paymentAmount ?? student.paymentAmount);
    const wasPaid = legacy.paid === true || student.paid === true || amount > 0;
    if (!wasPaid) return null;
    const course = text(legacy.paymentCourse || student.paymentCourse || student.grade, 100);
    const expectedAmount = money(coursePrices[course]) || amount;
    const month = text(legacy.paymentMonth || student.paymentMonth || student.month || PAYMENT_MONTH_NAMES[new Date().getMonth()], 40);
    const academicYear = text(legacy.paymentAcademicYear || student.paymentAcademicYear || student.academicYear || `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`, 30);
    const paymentDate = validPaymentDate(legacy.paymentDate || student.paymentDate);
    const migratedAmount = amount || expectedAmount;
    if (migratedAmount <= 0) return null;
    return { student, studentCode, amount: migratedAmount, expectedAmount: expectedAmount || migratedAmount, course, month, academicYear, paymentDate };
  }).filter(Boolean);

  let migrated = 0;
  let skipped = 0;
  const migrateOne = async item => {
    const transactionId = `legacy-${hash([item.studentCode, item.academicYear, item.month, item.course, item.amount, item.paymentDate].join('|')).slice(0, 40)}`;
    const transactionRef = db.collection('payment_transactions').doc(transactionId);
    const periodId = paymentPeriodId(item.studentCode, item.academicYear, item.month, item.course);
    const summaryRef = db.collection('monthly_payments').doc(periodId);
    let created = false;
    await db.runTransaction(async tx => {
      const [transactionSnap, summarySnap] = await Promise.all([tx.get(transactionRef), tx.get(summaryRef)]);
      if (transactionSnap.exists) return;
      const current = summarySnap.exists ? summarySnap.data() : {};
      // A monthly ledger entry means this period was already migrated or used
      // by V60.6. Never manufacture a second transaction from the legacy mirror.
      if (summarySnap.exists && (money(current.paidAmount) > 0 || Number(current.transactionCount || 0) > 0)) return;
      const paidAmount = Math.max(money(current.paidAmount), item.amount);
      const totals = paymentTotals({ paidAmount: 0, expectedAmount: item.expectedAmount }, paidAmount, item.expectedAmount);
      const transaction = {
        studentCode: item.studentCode,
        studentName: text(item.student.studentName || item.student.name, 100),
        academicYear: item.academicYear,
        month: item.month,
        course: item.course,
        expectedAmount: item.expectedAmount,
        amount: item.amount,
        paymentDate: item.paymentDate,
        paymentMethod: 'legacy',
        notes: 'تم ترحيلها تلقائيًا من paid/paymentAmount بدون حذف المصدر القديم.',
        status: 'active',
        periodId,
        requestId: transactionId,
        migratedFromLegacy: true,
        recordedByUid: staff.uid,
        recordedByEmail: staff.email || '',
        recordedByRole: staff.role || '',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      const summary = {
        periodId,
        studentCode: item.studentCode,
        studentName: transaction.studentName,
        academicYear: item.academicYear,
        month: item.month,
        course: item.course,
        ...totals,
        active: item.student.active !== false,
        transactionCount: Math.max(1, Number(current.transactionCount || 0)),
        activeTransactionCount: Math.max(1, Number(current.activeTransactionCount || 0)),
        lastPaymentDate: item.paymentDate,
        migratedFromLegacy: true,
        createdAt: current.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      tx.create(transactionRef, transaction);
      tx.set(summaryRef, summary, { merge: true });
      created = true;
    });
    if (created) migrated += 1; else skipped += 1;
  };
  for (let index = 0; index < candidates.length; index += 12) {
    await Promise.all(candidates.slice(index, index + 12).map(migrateOne));
  }
  await db.collection('activityLog').add(paymentAudit(staff, 'تم ترحيل بيانات المدفوعات القديمة', { migrated, skipped, safetyBackup: safetyBackup.name }));
  return { ok: true, migrated, skipped, safetyBackup: safetyBackup.name, legacyRowsPreserved: true };
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
  if (!['RESTORE-V53', 'RESTORE-V54', 'RESTORE-V60.6'].includes(confirmation)) throw new HttpsError('failed-precondition', 'تأكيد الاستعادة غير صحيح.');

  const file = admin.storage().bucket().file(name);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'النسخة الاحتياطية غير موجودة.');
  const [compressed] = await file.download();
  let payload;
  try { payload = JSON.parse(zlib.gunzipSync(compressed).toString('utf8')); }
  catch (_) { throw new HttpsError('data-loss', 'تعذر قراءة النسخة الاحتياطية.'); }
  if (!payload || ![53,54,60].includes(payload.schemaVersion) || payload.backupFormatVersion !== 2 || !payload.collections) {
    throw new HttpsError('failed-precondition', 'هذه النسخة ليست بصيغة استعادة مدعومة.');
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
  const relatedCollections = ['attendance','grades','recitations','homework_submissions','exam_attempts','monthly_payments','payment_transactions'];
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
    schemaVersion: 60,
    deletedAt: new Date().toISOString(),
    deletedBy: { uid: staff.uid, email: staff.email || '', role: staff.role || '' },
    student: { id: studentSnap.id, data: student },
    related: relatedEntries,
    studentAttempts: attemptsChildren ? attemptsChildren.docs.map(doc => ({ id: doc.id, data: doc.data() })) : []
  };
  const archiveName = `deleted-students/${cleanDocId(studentCode)}/${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;
  await admin.storage().bucket().file(archiveName).save(zlib.gzipSync(Buffer.from(JSON.stringify(deletionSnapshot), 'utf8')), { resumable: false, contentType: 'application/gzip' });
  const refs = [studentRef, db.collection('student_portal').doc(cleanDocId(studentCode)), db.collection('payments').doc(cleanDocId(studentCode)), attemptsParent, ...relatedDocs];
  const deletedNameKey = studentNameKey(student.studentName || student.name);
  if (deletedNameKey) refs.push(studentNameRegistryRef(deletedNameKey));
  refs.push(db.collection('parent_portal').doc(cleanDocId(studentCode)));
  if (student.parentCode && normalizeCode(student.parentCode) !== studentCode) refs.push(db.collection('parent_portal').doc(cleanDocId(student.parentCode)));
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
  { key: 'php', name: 'PHP', judge0Id: 68, template: '<?php\necho "Hello, Techno Minds!\\n";' },
  { key: 'ruby', name: 'Ruby', judge0Id: 72, template: "puts 'Hello, Techno Minds!'" },
  { key: 'rust', name: 'Rust', judge0Id: 73, template: 'fn main() {\n  println!("Hello, Techno Minds!");\n}' },
  { key: 'kotlin', name: 'Kotlin', judge0Id: 78, template: 'fun main() {\n  println("Hello, Techno Minds!")\n}' }
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
  const runner = codeRunnerConfig();
  const codeRunnerConfigured = Boolean(process.env.JUDGE0_BASE_URL || runner.apiKey);
  return {
    status: 'ok',
    version: PLATFORM_VERSION,
    firestore: true,
    services: {
      booking: true,
      studentPortal: true,
      administration: true,
      codeRunner: codeRunnerConfigured,
      studentResources: true
    },
    configuration: {
      codeRunner: codeRunnerConfigured ? 'configured' : 'default-provider-unverified'
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
  const submissionBody = {
    language_id: language.judge0Id,
    source_code: sourceCode,
    stdin,
    cpu_time_limit: config.cpuSeconds,
    wall_time_limit: config.wallSeconds,
    memory_limit: config.memoryKb,
    enable_network: false,
    max_file_size: 1024
  };
  let response;
  let data;
  try {
    // Judge0 documents that wait=true is not enabled on every host and does
    // not scale well. Submit asynchronously, then poll the returned token so
    // the lab works with both managed and self-hosted Judge0 deployments.
    response = await fetch(`${judge0Base}/submissions?base64_encoded=false&wait=false`, {
      method: 'POST', headers, signal: controller.signal,
      body: JSON.stringify(submissionBody)
    });
    if (!response.ok) throw new Error(`judge0-submit-${response.status}`);
    data = await response.json();
    const submissionToken = text(data.token, 120);
    if (submissionToken && (!data.status || Number(data.status.id || 0) <= 2)) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 450));
        const resultUrl = `${judge0Base}/submissions/${encodeURIComponent(submissionToken)}?base64_encoded=false`;
        let poll = await fetch(`${resultUrl}&fields=stdout,time,memory,stderr,compile_output,message,status,exit_code`, {
          method: 'GET', headers, signal: controller.signal
        });
        // Some Judge0 gateways intermittently return 400 while a new token is
        // propagating, or reject the optional fields list. Retry the plain
        // result route before treating the public lab as unavailable.
        if (poll.status === 400) poll = await fetch(resultUrl, { method: 'GET', headers, signal: controller.signal });
        if (!poll.ok) {
          if ([400, 404, 408, 409, 425, 429, 500, 502, 503, 504].includes(poll.status) && attempt < 8) continue;
          throw new Error(`judge0-poll-${poll.status}`);
        }
        data = await poll.json();
        if (Number(data.status?.id || 0) > 2) break;
      }
    }
    if (!data.status || Number(data.status.id || 0) <= 2) throw new Error('judge0-timeout');
  } catch (error) {
    let message = String(error?.message || '');
    // A synchronous retry is safe here because submitted programs run in an
    // isolated sandbox with networking disabled. It covers Judge0 providers
    // whose asynchronous token endpoint is temporarily inconsistent.
    if (error?.name !== 'AbortError' && /judge0-poll-(?:400|404|408|409|425|429|5\d\d)/.test(message)) {
      try {
        const fallback = await fetch(`${judge0Base}/submissions?base64_encoded=false&wait=true`, {
          method: 'POST', headers, signal: controller.signal, body: JSON.stringify(submissionBody)
        });
        if (!fallback.ok) throw new Error(`judge0-sync-${fallback.status}`);
        data = await fallback.json();
        if (!data.status || Number(data.status.id || 0) <= 2) throw new Error('judge0-sync-timeout');
        message = '';
      } catch (fallbackError) {
        error = fallbackError;
        message = String(fallbackError?.message || '');
      }
    }
    if (message) {
      throw new HttpsError('unavailable', error?.name === 'AbortError' || /timeout/.test(message) ? 'انتهت مهلة تشغيل الكود.' : `خدمة تشغيل الأكواد غير متاحة حاليًا${/judge0-(?:submit|poll|sync)-\d+/.test(message) ? ` (${message.replace('judge0-', '')})` : ''}.`);
    }
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

// ---------------------------------------------------------------------------
// Curriculum V61: server-owned content, progress and idempotent migration.
// ---------------------------------------------------------------------------
const CURRICULUM_COLLECTIONS = new Set([
  'curriculum', 'units', 'lectures', 'lecture_materials', 'assignments_v2',
  'assignment_questions', 'question_banks', 'bank_questions', 'monthly_exams',
  'exam_questions_v2', 'teacher_files'
]);
const TEACHER_ONLY_COLLECTIONS = new Set(['teacher_files']);
const CONTENT_STATUSES = new Set(['draft', 'published', 'hidden']);

function curriculumId(value) {
  const id = cleanDocId(text(value, 120));
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) throw new HttpsError('invalid-argument', 'معرّف المحتوى غير صالح.');
  return id;
}

function curriculumTimestamp(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  const millis = scheduledTimeMillis(value);
  if (!millis) throw new HttpsError('invalid-argument', 'صيغة التاريخ غير صحيحة.');
  return Timestamp.fromMillis(millis);
}

function normalizedCurriculumPayload(raw, staff, id) {
  const data = raw || {};
  const status = CONTENT_STATUSES.has(data.status) ? data.status : (data.published === true ? 'published' : 'draft');
  const payload = {
    id,
    grade: text(canonicalAcademicLabel(data.grade), 80), academicYear: text(data.academicYear, 30), term: text(data.term, 40),
    group: text(data.group, 100), groupId: text(data.scheduleId || data.groupId, 120), scheduleId: text(data.scheduleId || data.groupId, 120),
    unitId: text(data.unitId, 120), lectureId: text(data.lectureId, 120),
    lectureNumber: Math.max(0, Math.min(36, Number(data.lectureNumber || data.order || 0))),
    order: Math.max(0, Math.min(10000, Number(data.order || data.lectureNumber || 0))),
    title: text(data.title, 220), description: text(data.description, 4000),
    learningObjectives: Array.isArray(data.learningObjectives)
      ? data.learningObjectives.slice(0, 30).map(item => text(item, 300)).filter(Boolean)
      : text(data.learningObjectives, 4000).split('\n').map(item => item.trim()).filter(Boolean).slice(0, 30),
    status, active: data.active !== false, published: status === 'published',
    openAt: curriculumTimestamp(data.openAt), closeAt: curriculumTimestamp(data.closeAt),
    allowDownload: data.allowDownload === true,
    filePath: text(data.filePath, 500), coverPath: text(data.coverPath, 500),
    contentType: text(data.contentType, 100), fileName: text(data.fileName, 220),
    questionType: text(data.questionType || data.type, 60), difficulty: text(data.difficulty, 30),
    choices: Array.isArray(data.choices) ? data.choices.slice(0, 12).map(item => text(item, 700)) : [],
    correctAnswer: text(data.correctAnswer, 5000), answerExplanation: text(data.answerExplanation, 8000),
    instructions: text(data.instructions, 4000), durationMinutes: Math.max(0, Math.min(600, Number(data.durationMinutes || 0))),
    maxAttempts: Math.max(1, Math.min(20, Number(data.maxAttempts || 1))),
    shuffleQuestions: data.shuffleQuestions === true, shuffleChoices: data.shuffleChoices === true,
    resultVisibility: ['hidden','after_approval','immediate'].includes(data.resultVisibility) ? data.resultVisibility : 'after_approval',
    keywords: Array.isArray(data.keywords) ? data.keywords.slice(0, 30).map(item => text(item, 80)) : [],
    points: Math.max(0, Math.min(10000, Number(data.points || 0))),
    solutionPolicy: ['never','after_submission','after_deadline','scheduled'].includes(data.solutionPolicy) ? data.solutionPolicy : 'never',
    solutionAt: curriculumTimestamp(data.solutionAt),
    updatedAt: FieldValue.serverTimestamp(), updatedBy: staff.uid
  };
  if (!payload.grade && !['curriculum'].includes(data.kind)) throw new HttpsError('invalid-argument', 'اختر الصف الدراسي.');
  if (!payload.title) throw new HttpsError('invalid-argument', 'اكتب عنوان المحتوى.');
  payload.audienceKeys = academicAudienceKeysForItem(payload);
  return payload;
}

async function serverActivity(staff, action, meta = {}) {
  await db.collection('activityLog').add({
    action: text(action, 300), meta: JSON.parse(JSON.stringify(meta || {})),
    actorUid: staff.uid, actorEmail: staff.email || '', actorRole: staff.role || '',
    createdAt: FieldValue.serverTimestamp()
  });
}

exports.logStaffActivity = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  await rateLimit('staff-activity', staff.uid, 120, 60 * 1000);
  await serverActivity(staff, request.data?.action, request.data?.meta);
  return { ok: true };
});

exports.upsertCurriculumEntity = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const collection = text(request.data?.collection, 80);
  if (!CURRICULUM_COLLECTIONS.has(collection)) throw new HttpsError('invalid-argument', 'قسم المحتوى غير صالح.');
  const id = curriculumId(request.data?.id || crypto.randomUUID());
  const ref = db.collection(collection).doc(id);
  const existing = await ref.get();
  const payload = normalizedCurriculumPayload(request.data?.data, staff, id);
  await ref.set({
    ...payload,
    createdAt: existing.exists ? (existing.data().createdAt || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
    createdBy: existing.exists ? (existing.data().createdBy || staff.uid) : staff.uid
  }, { merge: true });
  await serverActivity(staff, existing.exists ? 'تعديل محتوى تعليمي' : 'إنشاء محتوى تعليمي', { collection, id, title: payload.title });
  return { ok: true, id, collection };
});

exports.listCurriculumAdmin = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request);
  const collection = text(request.data?.collection, 80);
  if (!CURRICULUM_COLLECTIONS.has(collection)) throw new HttpsError('invalid-argument', 'قسم المحتوى غير صالح.');
  if (TEACHER_ONLY_COLLECTIONS.has(collection) && staff.role !== 'admin') throw new HttpsError('permission-denied', 'ملفات الإدارة خاصة بحساب الإدارة فقط.');
  const pageSize = Math.max(10, Math.min(50, Number(request.data?.pageSize || 20)));
  const requestedGrade = text(request.data?.grade, 80);
  let query = db.collection(collection).orderBy('order', request.data?.direction === 'desc' ? 'desc' : 'asc');
  if (request.data?.term) query = query.where('term', '==', text(request.data.term, 40));
  if (request.data?.unitId) query = query.where('unitId', '==', text(request.data.unitId, 120));
  const cursor = Number(request.data?.cursor);
  if (Number.isFinite(cursor)) query = query.startAfter(cursor);
  const snap = await query.limit(requestedGrade ? 250 : pageSize + 1).get();
  const matching = requestedGrade ? snap.docs.filter(doc => sameAcademicValue(doc.data().grade, requestedGrade)) : snap.docs;
  const docs = matching.slice(0, pageSize);
  return { rows: docs.map(doc => ({ id: doc.id, ...doc.data(), grade: canonicalAcademicLabel(doc.data().grade) })), hasMore: matching.length > pageSize || (requestedGrade && snap.size === 250), nextCursor: docs.length ? Number(docs[docs.length - 1].data().order || 0) : null };
});

exports.deleteCurriculumEntity = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const collection = text(request.data?.collection, 80);
  if (!CURRICULUM_COLLECTIONS.has(collection)) throw new HttpsError('invalid-argument', 'قسم المحتوى غير صالح.');
  const id = curriculumId(request.data?.id);
  const ref = db.collection(collection).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true, alreadyDeleted: true };
  await ref.set({ archived:true,active:false,published:false,status:'hidden',archivedAt:FieldValue.serverTimestamp(),archivedBy:staff.email||staff.uid,updatedAt:FieldValue.serverTimestamp() },{merge:true});
  await serverActivity(staff, 'أرشفة محتوى تعليمي', { collection, id, title: text(snap.data().title, 220) });
  return { ok: true, archived:true };
});

exports.createMonthlyExamPlan = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin', 'teacher']);
  const grade = text(canonicalAcademicLabel(request.data?.grade), 80), academicYear = text(request.data?.academicYear, 30);
  if (!isSupportedAcademicGrade(grade)) throw new HttpsError('invalid-argument', 'اختر الصف الدراسي من القائمة المتاحة.');
  const batch = db.batch(); let created = 0, skipped = 0;
  for (let month = 1; month <= 12; month += 1) {
    const start = (month - 1) * 3 + 1, end = month * 3;
    const id = `monthly-${hash(`${grade}|${academicYear}|${month}`).slice(0, 24)}`;
    const ref = db.collection('monthly_exams').doc(id), snap = await ref.get();
    if (snap.exists) { skipped += 1; continue; }
    created += 1;
    batch.create(ref, {
      id, title: `الامتحان الشهري ${month}`, month, grade, academicYear,
      term: month <= 6 ? 'الترم الأول' : 'الترم الثاني', lectureFrom: start, lectureTo: end,
      coveredLectures: Array.from({ length: 3 }, (_, index) => start + index),
      lectureId: `lecture-${start}`, unitId: '', order: month, durationMinutes: 45,
      points: 0, maxAttempts: 1, shuffleQuestions: false, shuffleChoices: false,
      resultVisibility: 'after_approval', solutionPolicy: 'never', status: 'draft',
      audienceKeys: academicAudienceKeysForItem({ grade }),
      active: true, published: false, createdBy: staff.uid, updatedBy: staff.uid,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
  }
  if (created) await batch.commit();
  await serverActivity(staff, 'إنشاء خطة الامتحانات الشهرية', { grade, academicYear, created, skipped });
  return { ok: true, created, skipped };
});

function contentIsOpen(data, now = Timestamp.now()) {
  if (data.active === false || data.published !== true || data.status !== 'published') return false;
  // Migrated legacy records must be reviewed explicitly before students can see
  // them. This keeps old uploads available to staff without publishing them by
  // accident during a migration.
  if (data.legacySource && data.studentVisible !== true) return false;
  if (data.openAt && data.openAt.toMillis && data.openAt.toMillis() > now.toMillis()) return false;
  if (data.closeAt && data.closeAt.toMillis && data.closeAt.toMillis() <= now.toMillis()) return false;
  return true;
}

function publicLecture(data, id, progress = {}) {
  return {
    id, grade: text(canonicalAcademicLabel(data.grade), 80), term: text(data.term, 40), unitId: text(data.unitId, 120),
    group: text(data.group, 100), scheduleId: text(data.scheduleId || data.groupId, 120),
    lectureNumber: Number(data.lectureNumber || data.order || 0), order: Number(data.order || 0),
    title: text(data.title, 220), description: text(data.description, 1200),
    learningObjectives: Array.isArray(data.learningObjectives) ? data.learningObjectives : [],
    allowDownload: data.allowDownload === true, coverPath: text(data.coverPath, 500),
    openAt: data.openAt || null, closeAt: data.closeAt || null,
    progress: Math.max(0, Math.min(100, Number(progress.percent || 0))),
    lastOpenedAt: progress.lastOpenedAt || null, viewed: progress.viewed === true
  };
}

exports.getStudentCurriculum = onCall(CALLABLE_OPTIONS, async request => {
  const code = normalizeCode(request.data?.studentCode);
  await requirePortalSession(request, code, ['student']);
  await rateLimitPublic('student-curriculum', code, request, 20, 60, 60 * 1000);
  const found = await getStudentPortalByCode(code);
  const student = found.data || {};
  requireApprovedStudent(student);
  const grade = text(canonicalAcademicLabel(student.grade), 80);
  const [lectureDocs, unitDocs, progressSnap] = await Promise.all([
    targetedLearningDocs('lectures', student, 500),
    targetedLearningDocs('units', student, 250),
    db.collection('student_progress').doc(code).collection('lectures').limit(40).get()
  ]);
  const progress = new Map(progressSnap.docs.map(doc => [doc.id, doc.data()]));
  const now = Timestamp.now();
  const lectures = lectureDocs.filter(doc => learningTargetMatchesStudent(doc.data(), student) && contentIsOpen(doc.data(), now)).map(doc => publicLecture(doc.data(), doc.id, progress.get(doc.id))).sort((a,b)=>a.order-b.order);
  const units = unitDocs.filter(doc => learningTargetMatchesStudent(doc.data(), student) && contentIsOpen(doc.data(), now)).map(doc => ({ id: doc.id, title: text(doc.data().title, 220), term: text(doc.data().term, 40), order: Number(doc.data().order || 0) })).sort((a,b)=>a.order-b.order);
  const completed = lectures.filter(item => item.progress >= 100).length;
  return { student: { code, name: text(student.name || student.studentName, 100), grade, term: text(student.term, 40) }, units, lectures, overallProgress: lectures.length ? Math.round(completed / lectures.length * 100) : 0 };
});

exports.getLectureContent = onCall(CALLABLE_OPTIONS, async request => {
  const code = normalizeCode(request.data?.studentCode);
  await requirePortalSession(request, code, ['student']);
  const lectureId = curriculumId(request.data?.lectureId);
  await rateLimitPublic('lecture-content', `${code}:${lectureId}`, request, 30, 80, 60 * 1000);
  const [found, lectureSnap] = await Promise.all([getStudentPortalByCode(code), db.collection('lectures').doc(lectureId).get()]);
  if (!lectureSnap.exists || !contentIsOpen(lectureSnap.data())) throw new HttpsError('not-found', 'المحاضرة غير متاحة.');
  const student = found.data || {}, lecture = lectureSnap.data();
  requireApprovedStudent(student);
  if (!learningTargetMatchesStudent(lecture, student)) throw new HttpsError('permission-denied', 'المحاضرة غير متاحة لهذا الطالب.');
  const queryVisible = async collection => {
    const snap = await db.collection(collection).where('lectureId', '==', lectureId).orderBy('order', 'asc').limit(50).get();
    return snap.docs.filter(doc => contentIsOpen(doc.data()) && learningTargetMatchesStudent(doc.data(), student)).map(doc => {
      const data = doc.data();
      const safe = { id: doc.id, title: text(data.title, 220), description: text(data.description, 4000), questionType: text(data.questionType, 60), points: Number(data.points || 0), filePath: text(data.filePath, 500) };
      if (Array.isArray(data.choices)) safe.choices = data.choices.slice(0, 10).map(choice => text(choice, 700));
      return safe;
    });
  };
  const [materials, assignments, questions, exams] = await Promise.all([
    queryVisible('lecture_materials'), queryVisible('assignments_v2'), queryVisible('bank_questions'), queryVisible('monthly_exams')
  ]);
  return { lecture: publicLecture(lecture, lectureId), materials, assignments, questions, exams };
});

exports.recordLectureProgress = onCall(CALLABLE_OPTIONS, async request => {
  const code = normalizeCode(request.data?.studentCode), lectureId = curriculumId(request.data?.lectureId);
  await requirePortalSession(request, code, ['student']);
  await rateLimitPublic('lecture-progress', `${code}:${lectureId}`, request, 30, 80, 60 * 1000);
  const [found, lectureSnap] = await Promise.all([getStudentPortalByCode(code), db.collection('lectures').doc(lectureId).get()]);
  requireApprovedStudent(found.data);
  if (!lectureSnap.exists || !contentIsOpen(lectureSnap.data()) || !learningTargetMatchesStudent(lectureSnap.data(), found.data)) throw new HttpsError('permission-denied', 'المحاضرة غير متاحة لهذا الطالب.');
  const percent = Math.max(0, Math.min(100, Number(request.data?.percent || 0)));
  const progressRef = db.collection('student_progress').doc(code);
  const batch = db.batch();
  batch.set(progressRef, { studentCode: code, grade: text(found.data.grade, 80), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(progressRef.collection('lectures').doc(lectureId), {
    studentCode: code, grade: text(found.data.grade, 80), lectureId, percent,
    viewed: true, lastOpenedAt: FieldValue.serverTimestamp(), completedAt: percent >= 100 ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
  return { ok: true, percent };
});

exports.getCurriculumFileUrl = onCall(CALLABLE_OPTIONS, async request => {
  const code = normalizeCode(request.data?.studentCode), collection = text(request.data?.collection, 80), id = curriculumId(request.data?.id);
  await requirePortalSession(request, code, ['student']);
  await rateLimitPublic('curriculum-file', `${code}:${collection}:${id}`, request, 20, 50, 60 * 1000);
  if (!['lectures','lecture_materials','assignments_v2','bank_questions','monthly_exams'].includes(collection)) throw new HttpsError('invalid-argument', 'نوع الملف غير صالح.');
  const [found, snap] = await Promise.all([getStudentPortalByCode(code), db.collection(collection).doc(id).get()]);
  requireApprovedStudent(found.data);
  if (!snap.exists || !contentIsOpen(snap.data()) || !learningTargetMatchesStudent(snap.data(), found.data)) throw new HttpsError('permission-denied', 'الملف غير متاح لهذا الطالب.');
  const path = text(snap.data().filePath, 500);
  if (!path) throw new HttpsError('not-found', 'لا يوجد ملف مرتبط.');
  const [url] = await admin.storage().bucket().file(path).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000 });
  return { url, expiresIn: 600, allowDownload: snap.data().allowDownload === true };
});

exports.migrateCurriculumV61 = onCall({ region: 'europe-west1', timeoutSeconds: 540, memory: '1GiB' }, async request => {
  const staff = await requireStaff(request, ['admin']);
  const apply = request.data?.apply === true;
  const sources = [['materials','lecture_materials'],['assignments','assignments_v2'],['questions','bank_questions'],['exams','monthly_exams']];
  const report = { dryRun: !apply, scanned: 0, create: 0, skip: 0, errors: [] };
  if (apply) report.backup = await createPlatformBackup('pre-curriculum-v61-migration', staff);
  for (const [source, target] of sources) {
    const snap = await db.collection(source).limit(2000).get();
    for (const doc of snap.docs) {
      report.scanned += 1;
      const id = `legacy-${source}-${doc.id}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 120);
      const ref = db.collection(target).doc(id), exists = await ref.get();
      if (exists.exists) { report.skip += 1; continue; }
      report.create += 1;
      if (apply) {
        const row = doc.data() || {};
        await ref.set({ ...row, id, legacySource: source, legacyId: doc.id, studentVisible: false, order: Number(row.order || row.lectureNumber || 0), status: 'draft', active: row.active !== false, published: false, createdAt: row.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: staff.uid });
      }
    }
  }
  if (apply) await serverActivity(staff, 'ترحيل المحتوى إلى Curriculum V61', report);
  return report;
});
