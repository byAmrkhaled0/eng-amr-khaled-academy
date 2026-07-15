'use strict';

const crypto = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp, FieldPath } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const v = require('./src/validation');

initializeApp(process.env.STORAGE_BUCKET ? { storageBucket: process.env.STORAGE_BUCKET } : undefined);
const db = getFirestore();
const REGION = 'europe-west1';
const callable = { region: REGION, cors: true, timeoutSeconds: 30, memory: '256MiB', maxInstances: 30 };
setGlobalOptions({ region: REGION, maxInstances: 30 });

const STAFF_ROLES = new Set(['admin', 'teacher', 'assistant']);
const ADMIN_COLLECTIONS = new Set([
  'groups', 'tracks', 'onlineLectures', 'payments', 'materials', 'assignments',
  'practical_tasks', 'exams', 'grades', 'reviews', 'services', 'settings'
]);
const RELATED_STUDENT_COLLECTIONS = [
  'bookings', 'class_progress', 'attendance', 'homework_submissions', 'exam_attempts',
  'exam_submissions', 'grades', 'payments', 'onlineLectureAttendance',
  'practical_submissions', 'practical_drafts'
];

function fail(code, message, details) {
  throw new HttpsError(code, message, details);
}

function mapValidation(error, fallback = 'البيانات المرسلة غير صحيحة.') {
  if (error instanceof HttpsError) throw error;
  const messages = {
    required: 'أكمل جميع الحقول المطلوبة.',
    'too-long': 'أحد الحقول أطول من الحد المسموح.',
    'invalid-phone': 'رقم الهاتف غير صحيح.',
    'invalid-code': 'كود الطالب يجب أن يكون 8 أرقام وألا يبدأ بصفر.',
    'invalid-id': 'معرّف الطلب غير صحيح.',
    'invalid-number': 'القيمة الرقمية غير صحيحة.',
    'invalid-date': 'التاريخ غير صحيح.',
    'invalid-url': 'الرابط يجب أن يبدأ بـ https:// أو http://.',
    'invalid-file': 'اسم الملف غير صالح.',
    'invalid-file-type': 'نوع الملف غير مسموح.',
    'payload-too-large': 'حجم البيانات أكبر من الحد المسموح.'
  };
  fail('invalid-argument', messages[error?.message] || fallback);
}

function sha(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function requestIdentity(request) {
  const forwarded = request.rawRequest?.headers?.['x-forwarded-for'];
  const ip = String(forwarded || request.rawRequest?.ip || 'unknown').split(',')[0].trim();
  const device = String(request.data?.deviceId || '').slice(0, 100);
  return sha(`${ip}|${device}`).slice(0, 36);
}

async function rateLimit(request, action, limit = 10, seconds = 60) {
  const now = Date.now();
  const key = sha(`${action}|${requestIdentity(request)}`).slice(0, 48);
  const ref = db.collection('rate_limits').doc(key);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const old = snap.exists ? snap.data() : null;
    const windowStart = old?.windowStart?.toMillis?.() || 0;
    const count = now - windowStart < seconds * 1000 ? Number(old?.count || 0) : 0;
    if (count >= limit) fail('resource-exhausted', 'تم إرسال طلبات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.');
    tx.set(ref, {
      action,
      count: count + 1,
      windowStart: Timestamp.fromMillis(count ? windowStart : now),
      expiresAt: Timestamp.fromMillis(now + Math.max(seconds * 2, 300) * 1000)
    }, { merge: true });
  });
}

async function requireStaff(request, roles = STAFF_ROLES) {
  if (!request.auth?.uid) fail('unauthenticated', 'سجّل الدخول إلى لوحة الإدارة أولًا.');
  const snap = await db.collection('users').doc(request.auth.uid).get();
  const profile = snap.exists ? snap.data() : null;
  if (!profile || profile.active === false || !roles.has(profile.role)) {
    fail('permission-denied', 'هذا الحساب غير مصرح له بتنفيذ العملية.');
  }
  return { uid: request.auth.uid, role: profile.role, name: profile.name || request.auth.token.email || request.auth.uid };
}

async function logActivity(staff, action, details = {}) {
  const safe = v.safeJson(details, 16 * 1024) || {};
  delete safe.password;
  delete safe.accessToken;
  delete safe.sourceCode;
  await db.collection('activityLog').add({
    action,
    actor: staff.uid,
    actorName: staff.name,
    actorRole: staff.role,
    ...safe,
    createdAt: FieldValue.serverTimestamp()
  });
}

function randomCodeCandidates(count = 16) {
  return Array.from({ length: count }, () => String(crypto.randomInt(10_000_000, 100_000_000)));
}

async function chooseFreeCode(tx, candidates) {
  const refs = candidates.map(code => db.collection('student_codes').doc(code));
  const snaps = [];
  for (const ref of refs) snaps.push(await tx.get(ref));
  const index = snaps.findIndex(snap => !snap.exists || snap.data()?.active === false);
  if (index < 0) fail('resource-exhausted', 'تعذر إنشاء كود فريد الآن. حاول مرة أخرى.');
  return { code: candidates[index], ref: refs[index] };
}

function cleanBooking(data) {
  try {
    return {
      requestId: v.identifier(data.requestId || crypto.randomUUID(), 80),
      name: v.text(data.name || data.studentName, 100, true),
      studentPhone: v.phone(data.studentPhone),
      parentPhone: v.phone(data.parentPhone),
      track: v.normalizeTrack(data.track || data.grade),
      groupId: v.identifier(data.groupId, 100),
      notes: v.text(data.notes, 500),
      deviceId: v.text(data.deviceId, 100)
    };
  } catch (error) {
    mapValidation(error);
  }
}

function groupIsClosed(group) {
  return group.active === false || ['closed', 'مغلق', 'مغلقة', 'مكتملة'].includes(String(group.status || '').toLowerCase());
}

exports.getBookingGroups = onCall(callable, async request => {
  await rateLimit(request, 'getBookingGroups', 30, 60);
  let track = '';
  try { track = v.text(request.data?.track, 80); } catch (error) { mapValidation(error); }
  // Keep legacy groups (which may not have an `active` field) visible during migration.
  let query = db.collection('groups').limit(100);
  const snap = await query.get();
  const groups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(group => !groupIsClosed(group) && (!track || String(group.track || group.grade || '') === track))
    .map(group => {
      const capacity = Number(group.capacity || 0);
      const occupied = Number(group.activeStudentCount || 0) + Number(group.pendingBookingCount || 0);
      return {
        id: group.id,
        name: String(group.name || group.title || 'مجموعة'),
        track: String(group.track || group.grade || ''),
        day: String(group.day || ''),
        time: String(group.time || ''),
        schedule: String(group.schedule || [group.day, group.time].filter(Boolean).join(' - ')),
        mode: String(group.mode || 'أوفلاين'),
        capacity,
        availableSeats: capacity > 0 ? Math.max(0, capacity - occupied) : null,
        status: group.status || 'open'
      };
    });
  return { groups };
});

exports.createBooking = onCall(callable, async request => {
  await rateLimit(request, 'createBooking', 5, 300);
  const input = cleanBooking(request.data || {});
  const requestRef = db.collection('booking_requests').doc(input.requestId);
  const bookingRef = db.collection('bookings').doc(`B-${input.requestId}`);
  const groupRef = db.collection('groups').doc(input.groupId);
  const candidates = randomCodeCandidates();
  return db.runTransaction(async tx => {
    const existing = await tx.get(requestRef);
    if (existing.exists) return existing.data().response;
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) fail('not-found', 'المجموعة المختارة لم تعد موجودة. اختر مجموعة أخرى.');
    const group = groupSnap.data();
    const groupTrack = String(group.track || group.grade || '');
    if (groupTrack !== input.track) fail('failed-precondition', 'المجموعة لا تتبع المسار المختار. حدّث الصفحة واختر مجموعة صحيحة.');
    if (groupIsClosed(group)) fail('failed-precondition', 'هذه المجموعة مغلقة حاليًا.');
    const capacity = Number(group.capacity || 0);
    const active = Number(group.activeStudentCount || 0);
    const pending = Number(group.pendingBookingCount || 0);
    if (capacity > 0 && active + pending >= capacity) fail('resource-exhausted', 'المجموعة اكتملت. اختر مجموعة أخرى متاحة.');
    const { code, ref: codeRef } = await chooseFreeCode(tx, candidates);
    const now = FieldValue.serverTimestamp();
    const booking = {
      id: bookingRef.id,
      code,
      studentCode: code,
      name: input.name,
      studentName: input.name,
      studentPhone: input.studentPhone,
      parentPhone: input.parentPhone,
      track: input.track,
      grade: input.track,
      groupId: input.groupId,
      groupName: String(group.name || group.title || ''),
      group: String(group.name || group.title || ''),
      groupMode: String(group.mode || ''),
      groupSchedule: String(group.schedule || [group.day, group.time].filter(Boolean).join(' - ')),
      notes: input.notes,
      status: 'pending',
      requestId: input.requestId,
      createdAt: now,
      updatedAt: now
    };
    const response = {
      bookingId: bookingRef.id,
      code,
      studentCode: code,
      status: 'pending',
      name: input.name,
      track: input.track,
      groupId: input.groupId,
      groupName: booking.groupName,
      groupMode: booking.groupMode,
      groupSchedule: booking.groupSchedule
    };
    tx.create(bookingRef, booking);
    tx.set(codeRef, { code, bookingId: bookingRef.id, active: true, kind: 'booking', createdAt: now });
    tx.update(groupRef, { pendingBookingCount: pending + 1, updatedAt: now });
    tx.create(requestRef, { response, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400_000) });
    return response;
  });
});

exports.getBookingStatus = onCall(callable, async request => {
  await rateLimit(request, 'getBookingStatus', 15, 60);
  let code;
  try { code = v.studentCode(request.data?.code); } catch (error) { mapValidation(error); }
  const snap = await db.collection('bookings').where('studentCode', '==', code).limit(1).get();
  if (snap.empty) fail('not-found', 'لم يتم العثور على طلب بهذا الكود.');
  const booking = snap.docs[0].data();
  return {
    code,
    status: booking.status || 'pending',
    name: booking.name || booking.studentName || '',
    track: booking.track || booking.grade || '',
    groupName: booking.groupName || booking.group || '',
    groupSchedule: booking.groupSchedule || '',
    rejectionReason: booking.status === 'rejected' ? String(booking.rejectionReason || '') : ''
  };
});

exports.approveBooking = onCall(callable, async request => {
  const staff = await requireStaff(request);
  let bookingId;
  try { bookingId = v.identifier(request.data?.bookingId, 100); } catch (error) { mapValidation(error); }
  const bookingRef = db.collection('bookings').doc(bookingId);
  return db.runTransaction(async tx => {
    const bookingSnap = await tx.get(bookingRef);
    if (!bookingSnap.exists) fail('not-found', 'طلب الحجز غير موجود.');
    const booking = bookingSnap.data();
    if (booking.status === 'approved') return { status: 'approved', code: booking.studentCode, idempotent: true };
    if (booking.status === 'rejected') fail('failed-precondition', 'الطلب مرفوض بالفعل. أعد فتحه قبل القبول.');
    const code = v.studentCode(booking.studentCode || booking.code);
    const studentRef = db.collection('students').doc(code);
    const groupRef = db.collection('groups').doc(booking.groupId);
    const studentSnap = await tx.get(studentRef);
    const groupSnap = await tx.get(groupRef);
    if (studentSnap.exists && studentSnap.data()?.sourceBookingId !== bookingId) {
      fail('already-exists', 'يوجد طالب آخر يستخدم الكود نفسه. شغّل ترحيل الأكواد أولًا.');
    }
    if (!groupSnap.exists) fail('not-found', 'المجموعة المرتبطة بالطلب غير موجودة.');
    const group = groupSnap.data();
    if (groupIsClosed(group)) fail('failed-precondition', 'المجموعة مغلقة حاليًا.');
    const capacity = Number(group.capacity || 0);
    const active = Number(group.activeStudentCount || 0);
    const pending = Number(group.pendingBookingCount || 0);
    if (!studentSnap.exists && capacity > 0 && active >= capacity) fail('resource-exhausted', 'المجموعة اكتملت ولا يمكن قبول طالب جديد.');
    const now = FieldValue.serverTimestamp();
    const student = {
      id: code,
      code,
      studentCode: code,
      name: booking.name || booking.studentName,
      studentName: booking.name || booking.studentName,
      studentPhone: booking.studentPhone,
      phone: booking.studentPhone,
      parentPhone: booking.parentPhone,
      track: booking.track || booking.grade,
      grade: booking.track || booking.grade,
      groupId: booking.groupId,
      groupName: booking.groupName || booking.group,
      group: booking.groupName || booking.group,
      status: 'active',
      paymentStatus: 'unpaid',
      sourceBookingId: bookingId,
      acceptedAt: now,
      createdAt: studentSnap.exists ? studentSnap.data().createdAt : now,
      updatedAt: now
    };
    tx.set(studentRef, student, { merge: true });
    tx.set(db.collection('student_codes').doc(code), { code, studentId: code, bookingId, active: true, kind: 'student', updatedAt: now }, { merge: true });
    tx.update(bookingRef, { status: 'approved', approvedAt: now, approvedBy: staff.uid, updatedAt: now });
    tx.update(groupRef, {
      activeStudentCount: studentSnap.exists ? active : active + 1,
      pendingBookingCount: Math.max(0, pending - 1),
      updatedAt: now
    });
    tx.set(db.collection('activityLog').doc(), { action: 'approveBooking', bookingId, studentCode: code, actor: staff.uid, createdAt: now });
    return { status: 'approved', code, student: { code, name: student.name, track: student.track, groupName: student.groupName } };
  });
});

exports.rejectBooking = onCall(callable, async request => {
  const staff = await requireStaff(request);
  let bookingId, reason;
  try {
    bookingId = v.identifier(request.data?.bookingId, 100);
    reason = v.text(request.data?.reason, 300);
  } catch (error) { mapValidation(error); }
  const bookingRef = db.collection('bookings').doc(bookingId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) fail('not-found', 'طلب الحجز غير موجود.');
    const booking = snap.data();
    if (booking.status === 'approved') fail('failed-precondition', 'لا يمكن رفض طلب تم قبوله. استخدم إدارة الطالب.');
    if (booking.status === 'rejected') return { status: 'rejected', idempotent: true };
    const groupRef = db.collection('groups').doc(booking.groupId);
    const groupSnap = await tx.get(groupRef);
    const pending = Number(groupSnap.data()?.pendingBookingCount || 0);
    const now = FieldValue.serverTimestamp();
    tx.update(bookingRef, { status: 'rejected', rejectionReason: reason, rejectedAt: now, rejectedBy: staff.uid, updatedAt: now });
    if (groupSnap.exists) tx.update(groupRef, { pendingBookingCount: Math.max(0, pending - 1), updatedAt: now });
    tx.set(db.collection('student_codes').doc(booking.studentCode), { active: false, releasedAt: now }, { merge: true });
    return { status: 'rejected' };
  });
});

async function resolveStudent(codeValue) {
  const raw = String(codeValue || '').trim();
  let code = raw;
  if (!/^[1-9][0-9]{7}$/.test(code)) {
    const alias = await db.collection('code_aliases').doc(raw).get();
    if (!alias.exists) fail('not-found', 'كود الطالب غير صحيح أو لم يتم ترحيله بعد.');
    code = alias.data().newCode;
  }
  v.studentCode(code);
  const snap = await db.collection('students').doc(code).get();
  if (!snap.exists || snap.data()?.status === 'deleted') fail('not-found', 'لم يتم العثور على طالب بهذا الكود.');
  return { code, ref: snap.ref, data: snap.data() };
}

async function migrateRelatedCode(oldCode, newCode) {
  for (const collection of RELATED_STUDENT_COLLECTIONS) {
    for (let page = 0; page < 10; page += 1) {
      const snap = await db.collection(collection).where('studentCode', '==', oldCode).limit(350).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(doc => batch.update(doc.ref, { studentCode: newCode, updatedAt: FieldValue.serverTimestamp() }));
      await batch.commit();
    }
  }
}

async function migrateOneStudentCode(oldCode, staff, requestedNewCode = '') {
  let studentSnap = await db.collection('students').doc(oldCode).get();
  if (!studentSnap.exists) {
    const query = await db.collection('students').where('studentCode', '==', oldCode).limit(1).get();
    if (query.empty) fail('not-found', 'الطالب المطلوب غير موجود.');
    studentSnap = query.docs[0];
  }
  const candidates = requestedNewCode ? [v.studentCode(requestedNewCode)] : randomCodeCandidates();
  const oldRef = studentSnap.ref;
  const oldData = studentSnap.data();
  const result = await db.runTransaction(async tx => {
    const current = await tx.get(oldRef);
    if (!current.exists) fail('not-found', 'تم حذف الطالب أثناء العملية.');
    const { code, ref: codeRef } = await chooseFreeCode(tx, candidates);
    const newRef = db.collection('students').doc(code);
    const collision = await tx.get(newRef);
    if (collision.exists && newRef.path !== oldRef.path) fail('already-exists', 'الكود مستخدم لطالب آخر.');
    const now = FieldValue.serverTimestamp();
    tx.set(newRef, { ...oldData, id: code, code, studentCode: code, previousCode: oldCode, updatedAt: now }, { merge: true });
    tx.set(codeRef, { code, studentId: code, active: true, kind: 'student', updatedAt: now });
    tx.set(db.collection('code_aliases').doc(oldCode), { oldCode, newCode: code, studentId: code, migratedAt: now, migratedBy: staff.uid });
    if (oldRef.path !== newRef.path) tx.delete(oldRef);
    if (/^[1-9][0-9]{7}$/.test(oldCode) && oldCode !== code) tx.set(db.collection('student_codes').doc(oldCode), { active: false, replacedBy: code, updatedAt: now }, { merge: true });
    return { oldCode, code };
  });
  if (oldCode !== result.code) await migrateRelatedCode(oldCode, result.code);
  await db.collection('activityLog').add({ action: 'migrateStudentCode', oldCode, studentCode: result.code, actor: staff.uid, createdAt: FieldValue.serverTimestamp() });
  return result;
}

exports.createStudentAccess = onCall({ ...callable, timeoutSeconds: 60 }, async request => {
  const staff = await requireStaff(request, new Set(['admin']));
  let oldCode = '';
  try { oldCode = v.legacyCode(request.data?.oldCode || request.data?.studentId); } catch (error) { mapValidation(error); }
  return migrateOneStudentCode(oldCode, staff, request.data?.newCode || '');
});

exports.migrateLegacyStudentCodes = onCall({ ...callable, timeoutSeconds: 120, memory: '512MiB' }, async request => {
  const staff = await requireStaff(request, new Set(['admin']));
  let limit;
  try { limit = v.number(request.data?.limit, 1, 10, 5); } catch (error) { mapValidation(error); }
  const legacy = [];
  let cursor = null, reachedEnd = false;
  for (let page = 0; page < 8 && legacy.length < limit; page += 1) {
    let query = db.collection('students').orderBy(FieldPath.documentId()).limit(250);
    if (cursor) query = query.startAfter(cursor);
    const pageSnap = await query.get();
    pageSnap.docs.forEach(doc => {
      if (legacy.length < limit && (!/^[1-9][0-9]{7}$/.test(String(doc.id)) || !/^[1-9][0-9]{7}$/.test(String(doc.data().studentCode || '')))) legacy.push(doc);
    });
    if (pageSnap.size < 250) { reachedEnd = true; break; }
    cursor = pageSnap.docs.at(-1);
  }
  const migrated = [];
  for (const doc of legacy) {
    const oldCode = /^[A-Za-z0-9_-]{3,40}$/.test(String(doc.data().studentCode || '')) ? String(doc.data().studentCode) : doc.id;
    const result = await migrateOneStudentCode(oldCode, staff);
    migrated.push(result);
  }
  return { migrated, done: reachedEnd && legacy.length < limit };
});

exports.createStudentSafely = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  let input;
  try {
    input = {
      name: v.text(request.data?.name, 100, true),
      studentPhone: v.phone(request.data?.studentPhone || request.data?.phone),
      parentPhone: v.phone(request.data?.parentPhone),
      track: v.normalizeTrack(request.data?.track || request.data?.grade),
      groupId: v.identifier(request.data?.groupId, 100),
      mode: v.text(request.data?.mode || request.data?.attendanceType, 30),
      month: v.text(request.data?.month, 30),
      paymentStatus: v.text(request.data?.paymentStatus || 'unpaid', 30),
      paymentAmount: v.number(request.data?.paymentAmount, 0, 1_000_000, 0),
      notes: v.text(request.data?.notes, 1000),
      status: v.text(request.data?.status || 'active', 20),
      joinedAt: request.data?.joinedAt ? v.isoDate(request.data.joinedAt) : new Date().toISOString().slice(0, 10)
    };
  } catch (error) { mapValidation(error); }
  const duplicatePhone = await db.collection('students').where('studentPhone', '==', input.studentPhone).limit(1).get();
  if (!duplicatePhone.empty) fail('already-exists', 'يوجد طالب مسجل بالفعل بنفس رقم الطالب.');
  const candidates = request.data?.studentCode ? [v.studentCode(request.data.studentCode)] : randomCodeCandidates();
  const groupRef = db.collection('groups').doc(input.groupId);
  return db.runTransaction(async tx => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) fail('not-found', 'المجموعة المختارة غير موجودة.');
    const group = groupSnap.data();
    if (groupIsClosed(group) || String(group.track || group.grade || '') !== input.track) fail('failed-precondition', 'المجموعة مغلقة أو لا تتبع المسار المختار.');
    const active = Number(group.activeStudentCount || 0), capacity = Number(group.capacity || 0);
    if (capacity > 0 && active >= capacity) fail('resource-exhausted', 'المجموعة مكتملة.');
    const { code, ref: codeRef } = await chooseFreeCode(tx, candidates);
    const studentRef = db.collection('students').doc(code);
    const now = FieldValue.serverTimestamp();
    const student = {
      id: code, code, studentCode: code, name: input.name, studentName: input.name,
      phone: input.studentPhone, studentPhone: input.studentPhone, parentPhone: input.parentPhone,
      track: input.track, grade: input.track, groupId: input.groupId,
      groupName: group.name || group.title || '', group: group.name || group.title || '',
      mode: input.mode || group.mode || '', month: input.month, notes: input.notes, teacherNote: input.notes,
      status: input.status, paymentStatus: staff.role === 'admin' ? input.paymentStatus : 'unpaid', paymentAmount: staff.role === 'admin' ? input.paymentAmount : 0, joinedAt: input.joinedAt,
      createdAt: now, updatedAt: now, createdBy: staff.uid
    };
    tx.create(studentRef, student);
    tx.set(codeRef, { code, studentId: code, active: true, kind: 'student', createdAt: now });
    tx.update(groupRef, { activeStudentCount: active + 1, updatedAt: now });
    return { code, student: publicStudent(student, code) };
  });
});

exports.updateStudentSafely = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  let code, changes;
  try {
    code = v.studentCode(request.data?.studentCode);
    changes = {
      name: v.text(request.data?.name, 100, true),
      studentName: v.text(request.data?.name, 100, true),
      studentPhone: v.phone(request.data?.studentPhone || request.data?.phone),
      phone: v.phone(request.data?.studentPhone || request.data?.phone),
      parentPhone: v.phone(request.data?.parentPhone),
      track: v.normalizeTrack(request.data?.track || request.data?.grade),
      grade: v.normalizeTrack(request.data?.track || request.data?.grade),
      groupId: v.identifier(request.data?.groupId, 100),
      mode: v.text(request.data?.mode || request.data?.attendanceType, 30),
      month: v.text(request.data?.month, 30),
      notes: v.text(request.data?.notes, 1000),
      teacherNote: v.text(request.data?.notes, 1000),
      paymentStatus: v.text(request.data?.paymentStatus || 'unpaid', 30),
      paymentAmount: v.number(request.data?.paymentAmount, 0, 1_000_000, 0),
      status: v.text(request.data?.status || 'active', 20),
      joinedAt: request.data?.joinedAt ? v.isoDate(request.data.joinedAt) : ''
    };
  } catch (error) { mapValidation(error); }
  if (!changes.joinedAt) delete changes.joinedAt;
  if (staff.role !== 'admin') { delete changes.paymentStatus; delete changes.paymentAmount; }
  const studentRef = db.collection('students').doc(code);
  return db.runTransaction(async tx => {
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists) fail('not-found', 'الطالب غير موجود.');
    const old = studentSnap.data();
    const newGroupRef = db.collection('groups').doc(changes.groupId);
    const newGroupSnap = await tx.get(newGroupRef);
    if (!newGroupSnap.exists) fail('not-found', 'المجموعة الجديدة غير موجودة.');
    const group = newGroupSnap.data();
    if (groupIsClosed(group) || String(group.track || group.grade || '') !== changes.track) fail('failed-precondition', 'المجموعة الجديدة مغلقة أو لا تتبع المسار.');
    const moving = String(old.groupId || '') !== changes.groupId;
    let oldGroupRef = null, oldGroupSnap = null;
    if (moving && old.groupId) {
      oldGroupRef = db.collection('groups').doc(old.groupId);
      oldGroupSnap = await tx.get(oldGroupRef);
    }
    const active = Number(group.activeStudentCount || 0), capacity = Number(group.capacity || 0);
    if (moving && capacity > 0 && active >= capacity) fail('resource-exhausted', 'المجموعة الجديدة مكتملة.');
    const now = FieldValue.serverTimestamp();
    tx.update(studentRef, { ...changes, groupName: group.name || group.title || '', group: group.name || group.title || '', updatedAt: now, updatedBy: staff.uid });
    if (moving) {
      tx.update(newGroupRef, { activeStudentCount: active + 1, updatedAt: now });
      if (oldGroupSnap?.exists) tx.update(oldGroupRef, { activeStudentCount: Math.max(0, Number(oldGroupSnap.data().activeStudentCount || 0) - 1), updatedAt: now });
    }
    return { updated: true, code };
  });
});

exports.gradeExamAttempt = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  let attemptId, score, teacherNotes;
  try {
    attemptId = v.identifier(request.data?.attemptId, 180);
    score = v.number(request.data?.score, 0, 100);
    teacherNotes = v.text(request.data?.teacherNotes, 1000);
  } catch (error) { mapValidation(error); }
  const ref = db.collection('exam_attempts').doc(attemptId);
  const snap = await ref.get();
  if (!snap.exists || !['submitted', 'graded'].includes(snap.data().status)) fail('failed-precondition', 'محاولة الامتحان غير جاهزة للتصحيح.');
  await ref.update({ score, teacherNotes, status: 'graded', needsManualReview: false, resultPublished: request.data?.publish !== false, gradedAt: FieldValue.serverTimestamp(), gradedBy: staff.uid, updatedAt: FieldValue.serverTimestamp() });
  return { graded: true, score };
});

exports.publishExamResult = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  let attemptId;
  try { attemptId = v.identifier(request.data?.attemptId, 180); } catch (error) { mapValidation(error); }
  const ref = db.collection('exam_attempts').doc(attemptId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== 'graded') fail('failed-precondition', 'يجب تصحيح المحاولة قبل نشر النتيجة.');
  await ref.update({ resultPublished: true, publishedAt: FieldValue.serverTimestamp(), publishedBy: staff.uid, updatedAt: FieldValue.serverTimestamp() });
  return { published: true };
});

exports.reviewHomeworkSubmission = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  let submissionId, status, teacherNote;
  try {
    submissionId = v.identifier(request.data?.submissionId, 120);
    status = v.text(request.data?.status, 30, true);
    teacherNote = v.text(request.data?.teacherNote, 600);
    if (!['approved', 'rejected', 'pending'].includes(status)) throw new Error('invalid-status');
  } catch (error) {
    if (error?.message === 'invalid-status') fail('invalid-argument', 'حالة الواجب غير صحيحة.');
    mapValidation(error);
  }
  const ref = db.collection('homework_submissions').doc(submissionId);
  if (!(await ref.get()).exists) fail('not-found', 'تسليم الواجب غير موجود.');
  await ref.update({ status, teacherNote, reviewedBy: staff.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { updated: true, status };
});

exports.reviewPracticalSubmission = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  let submissionId, score, teacherNote;
  try { submissionId = v.identifier(request.data?.submissionId, 120); score = v.number(request.data?.score, 0, 100); teacherNote = v.text(request.data?.teacherNote, 1000); } catch (error) { mapValidation(error); }
  const ref = db.collection('practical_submissions').doc(submissionId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().status === 'running') fail('failed-precondition', 'الحل العملي غير جاهز للمراجعة.');
  await ref.update({ score, teacherNote, status: 'graded', reviewedBy: staff.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const track = String(snap.data().track || '');
  if (track) await db.collection('public_cache').doc(`leaderboard_${sha(`${track}|${new Date().toISOString().slice(0, 7)}`).slice(0, 24)}`).delete().catch(() => {});
  return { reviewed: true, score };
});

function publicStudent(student, code) {
  return {
    id: code,
    code,
    studentCode: code,
    name: String(student.name || student.studentName || ''),
    studentName: String(student.name || student.studentName || ''),
    track: String(student.track || student.grade || ''),
    grade: String(student.track || student.grade || ''),
    groupId: String(student.groupId || ''),
    groupName: String(student.groupName || student.group || ''),
    group: String(student.groupName || student.group || ''),
    status: String(student.status || 'active'),
    paymentStatus: String(student.paymentStatus || (student.paid ? 'paid' : 'unpaid')),
    level: String(student.level || ''),
    teacherNote: String(student.teacherNote || student.notesForStudent || '')
  };
}

exports.getPortalStudent = onCall(callable, async request => {
  await rateLimit(request, 'getPortalStudent', 20, 60);
  let codeValue, portal;
  try {
    codeValue = v.text(request.data?.code, 40, true);
    portal = ['student', 'parent'].includes(request.data?.portal) ? request.data.portal : 'student';
  } catch (error) { mapValidation(error); }
  const student = await resolveStudent(codeValue);
  const start = new Date();
  start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const [progressSnap, attemptsSnap, homeworkSnap, practicalSnap, groupSnap, materialsSnap, lecturesSnap, assignmentsSnap, examsSnap] = await Promise.all([
    db.collection('class_progress').where('studentCode', '==', student.code).orderBy('date', 'desc').limit(120).get(),
    db.collection('exam_attempts').where('studentCode', '==', student.code).limit(100).get(),
    db.collection('homework_submissions').where('studentCode', '==', student.code).limit(100).get(),
    db.collection('practical_submissions').where('studentCode', '==', student.code).limit(100).get(),
    student.data.groupId ? db.collection('groups').doc(student.data.groupId).get() : Promise.resolve(null),
    db.collection('materials').where('status', '==', 'منشور').limit(100).get().catch(() => ({ docs: [] })),
    db.collection('onlineLectures').limit(100).get().catch(() => ({ docs: [] })),
    db.collection('assignments').where('status', 'in', ['published', 'منشور']).limit(100).get().catch(() => ({ docs: [] })),
    db.collection('exams').limit(100).get().catch(() => ({ docs: [] }))
  ]);
  const target = item => {
    const track = String(student.data.track || student.data.grade || '');
    const groupId = String(student.data.groupId || '');
    const itemTrack = String(item.track || item.grade || '');
    const itemGroup = String(item.groupId || '');
    return (!itemTrack || itemTrack === 'كل المسارات' || itemTrack === track) && (!itemGroup || itemGroup === groupId);
  };
  const attempts = attemptsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => item.resultPublished === true)
    .map(item => ({ id: item.id, examId: item.examId, examTitle: item.examTitle, score: item.score, maxScore: item.maxScore, status: item.status, submittedAt: item.submittedAt, teacherNotes: item.teacherNotes || '' }));
  const progress = progressSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).map(item => ({
    sessionId: item.sessionId,
    sessionTitle: item.sessionTitle,
    date: item.date,
    group: item.group,
    track: item.track,
    attendanceStatus: item.attendanceStatus,
    homeworkCompleted: item.homeworkCompleted === true,
    practicalCompleted: item.practicalCompleted === true,
    participation: item.participation || '',
    score: item.score ?? null,
    teacherNote: item.teacherNote || '',
    recordedByName: item.recordedByName || '',
    updatedAt: item.updatedAt
  }));
  const homeworks = homeworkSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).map(item => ({ id: item.id, assignmentId: item.assignmentId, status: item.status, fileName: item.fileName, createdAt: item.createdAt, teacherNote: item.teacherNote || '' }));
  const practicalSubmissions = practicalSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => item.status !== 'running').map(item => ({ id: item.id, taskId: item.taskId, taskTitle: item.taskTitle || 'مهمة عملية', languageId: item.languageId, score: item.score ?? null, status: item.status, submittedAt: item.submittedAt, teacherNote: item.teacherNote || '' }));
  const group = groupSnap?.exists ? groupSnap.data() : {};
  const materials = materialsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(target).map(item => ({ id: item.id, title: item.title, type: item.type, desc: item.desc, fileUrl: item.fileUrl || item.link || '', date: item.date || '' }));
  const now = Date.now();
  const lectures = lecturesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(target).filter(item => item.status !== 'مخفي').map(item => ({
    id: item.id, title: item.title, date: item.date, time: item.time, status: item.status,
    meetingUrl: !item.hideAfterEnd || !item.endsAt || Date.parse(item.endsAt) > now ? (item.meetingUrl || item.link || '') : '',
    recordingUrl: item.recordingUrl || '', notes: item.notes || ''
  }));
  const assignments = assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(target).map(item => ({ id: item.id, title: item.title || 'واجب', dueDate: item.dueDate || '', status: item.status }));
  const availableExams = examsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => ['منشور', 'published', 'active'].includes(String(item.status || 'منشور')))
    .filter(item => examTargetsStudent(item, student))
    .map(item => ({ id: item.id, title: item.title || 'اختبار', duration: Number(item.duration || item.minutes || 20), instructions: item.instructions || '', allowRetake: item.allowRetake === true, attachmentUrl: item.attachmentUrl || '' }));
  const monthProgress = progress.filter(item => Date.parse(`${item.date}T00:00:00Z`) >= start.getTime());
  const rankCacheId = `leaderboard_${sha(`${student.data.track || student.data.grade || ''}|${new Date().toISOString().slice(0, 7)}`).slice(0, 24)}`;
  const rankCache = await db.collection('public_cache').doc(rankCacheId).get().catch(() => null);
  const rankInTrack = rankCache?.exists ? (rankCache.data().rankByCode?.[student.code] || null) : null;
  return {
    portal,
    student: publicStudent(student.data, student.code),
    group: { day: group.day || '', time: group.time || '', schedule: group.schedule || '', mode: group.mode || '', name: group.name || student.data.groupName || '' },
    progress,
    monthProgress,
    attempts,
    homeworks,
    practicalSubmissions,
    rankInTrack,
    assignments,
    availableExams,
    materials,
    lectures,
    generatedAt: new Date().toISOString()
  };
});

exports.recordClassProgress = onCall(callable, async request => {
  const staff = await requireStaff(request);
  let code, sessionId, payload;
  try {
    code = v.studentCode(request.data?.studentCode);
    sessionId = v.identifier(request.data?.sessionId, 100);
    const attendanceStatus = request.data?.attendanceStatus ? v.text(request.data.attendanceStatus, 20) : '';
    if (attendanceStatus && !v.ATTENDANCE.has(attendanceStatus)) throw new Error('invalid-attendance');
    payload = {
      studentCode: code,
      sessionId,
      sessionTitle: v.text(request.data?.sessionTitle, 120, true),
      date: v.isoDate(request.data?.date),
      group: v.text(request.data?.group, 100),
      groupId: v.text(request.data?.groupId, 100),
      track: v.normalizeTrack(request.data?.track),
      attendanceStatus,
      homeworkCompleted: v.boolean(request.data?.homeworkCompleted),
      practicalCompleted: v.boolean(request.data?.practicalCompleted),
      participation: v.text(request.data?.participation, 80),
      score: request.data?.score === '' || request.data?.score === undefined ? null : v.number(request.data.score, 0, 100),
      teacherNote: v.text(request.data?.teacherNote, 600)
    };
  } catch (error) {
    if (error?.message === 'invalid-attendance') fail('invalid-argument', 'حالة الحضور غير صحيحة.');
    mapValidation(error);
  }
  const student = await resolveStudent(code);
  if (payload.track !== String(student.data.track || student.data.grade || '')) fail('failed-precondition', 'المسار لا يطابق ملف الطالب.');
  const ref = db.collection('class_progress').doc(`${sessionId}_${code}`);
  await db.runTransaction(async tx => {
    const old = await tx.get(ref);
    const now = FieldValue.serverTimestamp();
    tx.set(ref, {
      ...payload,
      studentName: student.data.name || student.data.studentName || '',
      recordedBy: staff.uid,
      recordedByName: staff.name,
      createdAt: old.exists ? old.data().createdAt : now,
      updatedAt: now
    }, { merge: true });
  });
  const month = payload.date.slice(0, 7);
  await db.collection('public_cache').doc(`leaderboard_${sha(`${payload.track}|${month}`).slice(0, 24)}`).delete().catch(() => {});
  return { id: ref.id, saved: true };
});

function examQuestions(exam) {
  if (Array.isArray(exam.questions) && exam.questions.length) return exam.questions;
  const question = String(exam.question || exam.text || '').trim();
  if (!question) return [];
  return [{ id: 'q1', type: exam.type === 'اختيار من متعدد' ? 'mcq' : exam.type === 'كتابة كود' ? 'code' : 'essay', question, options: exam.options || [], correctAnswer: exam.answer || '', points: 100 }];
}

function publicQuestions(questions) {
  return questions.map((question, index) => ({
    id: String(question.id || `q${index + 1}`),
    type: ['mcq', 'essay', 'code'].includes(question.type) ? question.type : 'essay',
    question: String(question.question || ''),
    options: question.type === 'mcq' ? (question.options || []).slice(0, 4).map(String) : [],
    starterCode: question.type === 'code' ? String(question.starterCode || question.starter || '') : '',
    language: question.type === 'code' ? String(question.language || '') : '',
    points: Number(question.points || 1)
  }));
}

function examTargetsStudent(exam, student) {
  const type = exam.targetType || 'all';
  if (type === 'student') return String(exam.targetStudentCode || '') === student.code;
  if (type === 'group') return String(exam.targetGroupId || exam.groupId || '') === String(student.data.groupId || '') || String(exam.targetGroup || '') === String(student.data.groupName || student.data.group || '');
  const track = String(exam.track || exam.grade || 'كل الصفوف');
  return !track || track === 'كل الصفوف' || track === String(student.data.track || student.data.grade || '');
}

exports.startExam = onCall(callable, async request => {
  await rateLimit(request, 'startExam', 10, 60);
  let examId, code;
  try { examId = v.identifier(request.data?.examId, 100); code = v.text(request.data?.studentCode, 40, true); } catch (error) { mapValidation(error); }
  const student = await resolveStudent(code);
  const examRef = db.collection('exams').doc(examId);
  const attemptRef = db.collection('exam_attempts').doc(`${examId}_${student.code}`);
  const accessToken = crypto.randomBytes(24).toString('hex');
  return db.runTransaction(async tx => {
    const [examSnap, attemptSnap] = await Promise.all([tx.get(examRef), tx.get(attemptRef)]);
    if (!examSnap.exists) fail('not-found', 'الامتحان غير موجود.');
    const exam = examSnap.data();
    if (!['منشور', 'published', 'active'].includes(String(exam.status || 'منشور'))) fail('failed-precondition', 'الامتحان غير متاح حاليًا.');
    if (!examTargetsStudent(exam, student)) fail('permission-denied', 'هذا الامتحان غير مخصص لهذا الطالب.');
    if (attemptSnap.exists && ['submitted', 'graded'].includes(attemptSnap.data().status) && !exam.allowRetake) fail('already-exists', 'تم تسليم هذا الامتحان من قبل.');
    const questions = examQuestions(exam);
    if (!questions.length) fail('failed-precondition', 'الامتحان لا يحتوي على أسئلة صالحة.');
    const now = FieldValue.serverTimestamp();
    const attempt = {
      id: attemptRef.id,
      examId,
      examTitle: exam.title || 'اختبار',
      studentCode: student.code,
      studentName: student.data.name || student.data.studentName || '',
      track: student.data.track || student.data.grade || '',
      groupId: student.data.groupId || '',
      status: 'started',
      startedAt: now,
      updatedAt: now,
      attemptNumber: attemptSnap.exists ? Number(attemptSnap.data().attemptNumber || 1) + 1 : 1
      , accessTokenHash: sha(accessToken)
    };
    tx.set(attemptRef, attempt, { merge: true });
    return { attemptId: attemptRef.id, accessToken, exam: { id: examId, title: exam.title || 'اختبار', duration: Number(exam.duration || exam.minutes || 20), instructions: exam.instructions || '', attachmentUrl: exam.attachmentUrl || '', questions: publicQuestions(questions) }, startedAt: new Date().toISOString() };
  });
});

exports.submitExam = onCall(callable, async request => {
  await rateLimit(request, 'submitExam', 8, 300);
  let attemptId, accessToken, answers;
  try {
    attemptId = v.identifier(request.data?.attemptId, 180);
    accessToken = v.text(request.data?.accessToken, 100, true);
    answers = v.safeJson(request.data?.answers, 128 * 1024);
    if (!Array.isArray(answers)) throw new Error('invalid-answers');
  } catch (error) {
    if (error?.message === 'invalid-answers') fail('invalid-argument', 'صيغة الإجابات غير صحيحة.');
    mapValidation(error);
  }
  const attemptRef = db.collection('exam_attempts').doc(attemptId);
  return db.runTransaction(async tx => {
    const attemptSnap = await tx.get(attemptRef);
    if (!attemptSnap.exists) fail('not-found', 'محاولة الامتحان غير موجودة. ابدأ الامتحان مرة أخرى.');
    const attempt = attemptSnap.data();
    if (!attempt.accessTokenHash || attempt.accessTokenHash !== sha(accessToken)) fail('permission-denied', 'انتهت جلسة الامتحان أو رمز التسليم غير صحيح. ابدأ الامتحان مجددًا.');
    if (['submitted', 'graded'].includes(attempt.status)) fail('already-exists', 'تم تسليم الامتحان بالفعل.');
    const examRef = db.collection('exams').doc(attempt.examId);
    const examSnap = await tx.get(examRef);
    if (!examSnap.exists) fail('not-found', 'تم حذف الامتحان قبل التسليم.');
    const questions = examQuestions(examSnap.data());
    if (answers.length !== questions.length) fail('invalid-argument', 'عدد الإجابات لا يطابق عدد الأسئلة.');
    let autoPoints = 0, autoMax = 0, manualMax = 0;
    const storedAnswers = questions.map((question, index) => {
      const answer = answers[index] || {};
      const value = v.text(answer.value ?? answer.answer, question.type === 'code' ? 65_536 : 10_000);
      const points = Number(question.points || 1);
      if (question.type === 'mcq') {
        autoMax += points;
        const expected = String(question.correctAnswer ?? question.correctIndex ?? '').trim().toLowerCase();
        const chosen = String(value).trim().toLowerCase();
        if (expected && chosen === expected) autoPoints += points;
      } else manualMax += points;
      return { questionId: String(question.id || `q${index + 1}`), type: question.type || 'essay', value };
    });
    const totalMax = autoMax + manualMax || questions.length;
    const score = manualMax === 0 ? Math.round((autoPoints / Math.max(1, totalMax)) * 100) : null;
    const now = FieldValue.serverTimestamp();
    tx.update(attemptRef, {
      answers: storedAnswers,
      status: manualMax ? 'submitted' : 'graded',
      autoScore: autoPoints,
      autoMaxScore: autoMax,
      maxScore: totalMax,
      score,
      needsManualReview: manualMax > 0,
      submittedAt: now,
      updatedAt: now,
      resultPublished: false
    });
    return { status: manualMax ? 'submitted' : 'graded', needsManualReview: manualMax > 0, score };
  });
});

exports.prepareHomeworkUpload = onCall(callable, async request => {
  await rateLimit(request, 'prepareHomeworkUpload', 6, 300);
  let codeValue, assignmentId, file;
  try {
    codeValue = v.text(request.data?.studentCode, 40, true);
    assignmentId = v.identifier(request.data?.assignmentId, 100);
    file = v.validateHomeworkFile(request.data?.file || {});
  } catch (error) { mapValidation(error); }
  const student = await resolveStudent(codeValue);
  const assignment = await db.collection('assignments').doc(assignmentId).get();
  if (!assignment.exists || assignment.data()?.status === 'closed') fail('failed-precondition', 'الواجب غير متاح للرفع حاليًا.');
  const assignmentData = assignment.data();
  const studentTrack = String(student.data.track || student.data.grade || '');
  const studentGroup = String(student.data.groupId || student.data.groupName || student.data.group || '');
  const targetTrack = String(assignmentData.track || assignmentData.grade || '');
  const targetGroup = String(assignmentData.groupId || assignmentData.group || assignmentData.targetGroup || '');
  if (targetTrack && !['كل المسارات', 'all'].includes(targetTrack) && targetTrack !== studentTrack) fail('permission-denied', 'هذا الواجب ليس ضمن مسار الطالب.');
  if (targetGroup && !['كل المجموعات', 'all'].includes(targetGroup) && targetGroup !== studentGroup && targetGroup !== String(student.data.groupName || student.data.group || '')) fail('permission-denied', 'هذا الواجب ليس ضمن مجموعة الطالب.');
  const ticketId = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString('hex');
  const path = `homework/${student.code}/${assignmentId}/${ticketId}-${file.name}`;
  const expiresAt = Date.now() + 10 * 60_000;
  const bucket = getStorage().bucket();
  let uploadUrl;
  try {
    [uploadUrl] = await bucket.file(path).getSignedUrl({ version: 'v4', action: 'write', expires: expiresAt, contentType: file.contentType });
  } catch (error) {
    console.error('Signed upload URL error', error?.code || error?.message);
    fail('failed-precondition', 'تعذر تجهيز رابط الرفع الآمن. راجع صلاحية توقيع روابط Storage في حساب الخدمة.');
  }
  await db.collection('upload_tickets').doc(ticketId).set({
    ticketHash: sha(token), studentCode: student.code, assignmentId, path,
    fileName: file.name, contentType: file.contentType, expectedSize: file.size,
    status: 'prepared', createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(expiresAt)
  });
  return { ticketId, token, uploadUrl, method: 'PUT', headers: { 'Content-Type': file.contentType }, expiresAt: new Date(expiresAt).toISOString() };
});

exports.registerHomeworkSubmission = onCall(callable, async request => {
  await rateLimit(request, 'registerHomeworkSubmission', 8, 300);
  let ticketId, token;
  try { ticketId = v.identifier(request.data?.ticketId, 100); token = v.text(request.data?.token, 100, true); } catch (error) { mapValidation(error); }
  const ticketRef = db.collection('upload_tickets').doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) fail('not-found', 'تصريح الرفع غير موجود.');
  const ticket = ticketSnap.data();
  if (ticket.ticketHash !== sha(token) || ticket.expiresAt.toMillis() < Date.now()) fail('permission-denied', 'انتهت صلاحية تصريح الرفع. جهّز الرفع من جديد.');
  if (ticket.status === 'registered') return { id: ticket.submissionId, status: 'pending', idempotent: true };
  const object = getStorage().bucket().file(ticket.path);
  const [exists] = await object.exists();
  if (!exists) fail('failed-precondition', 'لم يصل الملف إلى Storage بعد. انتظر لحظة ثم أعد المحاولة.');
  const [metadata] = await object.getMetadata();
  const actualSize = Number(metadata.size || 0);
  const actualType = String(metadata.contentType || '');
  if (actualSize < 1 || actualSize > 10 * 1024 * 1024 || actualType !== ticket.contentType) {
    await object.delete({ ignoreNotFound: true }).catch(() => {});
    fail('invalid-argument', 'الملف المرفوع لا يطابق النوع أو الحجم المسموح.');
  }
  const submissionRef = db.collection('homework_submissions').doc(ticketId);
  await db.runTransaction(async tx => {
    const fresh = await tx.get(ticketRef);
    if (fresh.data()?.status === 'registered') return;
    const now = FieldValue.serverTimestamp();
    tx.create(submissionRef, {
      id: submissionRef.id,
      studentCode: ticket.studentCode,
      assignmentId: ticket.assignmentId,
      fileName: ticket.fileName,
      filePath: ticket.path,
      contentType: actualType,
      size: actualSize,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    });
    tx.update(ticketRef, { status: 'registered', submissionId: submissionRef.id, registeredAt: now });
  });
  return { id: submissionRef.id, status: 'pending' };
});

exports.prepareStaffUpload = onCall(callable, async request => {
  await requireStaff(request);
  let name, contentType, size;
  try {
    name = v.fileName(request.data?.file?.name);
    contentType = v.text(request.data?.file?.contentType, 100, true).toLowerCase();
    size = v.number(request.data?.file?.size, 1, 15 * 1024 * 1024);
  } catch (error) { mapValidation(error); }
  const allowed = contentType === 'application/pdf' || contentType === 'application/json' || contentType.startsWith('image/') || contentType.startsWith('text/');
  if (!allowed) fail('invalid-argument', 'نوع ملف المحتوى غير مسموح. استخدم PDF أو صورة أو ملفًا نصيًا/برمجيًا.');
  const folder = request.data?.isPublic === true ? 'public/uploads' : 'teacher-uploads/materials';
  const path = `${folder}/${crypto.randomUUID()}-${name}`;
  const expiresAt = Date.now() + 10 * 60_000;
  const downloadToken = crypto.randomUUID();
  const metadataHeader = 'x-goog-meta-firebaseStorageDownloadTokens';
  let uploadUrl;
  try {
    [uploadUrl] = await getStorage().bucket().file(path).getSignedUrl({ version: 'v4', action: 'write', expires: expiresAt, contentType, extensionHeaders: { [metadataHeader]: downloadToken } });
  } catch (error) {
    console.error('Staff signed upload URL error', error?.code || error?.message);
    fail('failed-precondition', 'تعذر تجهيز رابط رفع المحتوى. راجع صلاحية توقيع روابط Storage.');
  }
  const bucketName = getStorage().bucket().name;
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
  return { path, uploadUrl, downloadUrl, method: 'PUT', headers: { 'Content-Type': contentType, [metadataHeader]: downloadToken }, expiresAt: new Date(expiresAt).toISOString(), file: { name, contentType, size } };
});

exports.deleteStudentSafely = onCall({ ...callable, timeoutSeconds: 120, memory: '512MiB' }, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  let codeValue;
  try { codeValue = v.text(request.data?.studentCode, 40, true); } catch (error) { mapValidation(error); }
  const student = await resolveStudent(codeValue);
  let deletedRecords = 0;
  for (const collection of RELATED_STUDENT_COLLECTIONS) {
    for (let page = 0; page < 20; page += 1) {
      const snap = await db.collection(collection).where('studentCode', '==', student.code).limit(350).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(doc => { batch.delete(doc.ref); deletedRecords += 1; });
      await batch.commit();
    }
  }
  await getStorage().bucket().deleteFiles({ prefix: `homework/${student.code}/` }).catch(error => console.warn('Student storage cleanup', error?.code || error?.message));
  const batch = db.batch();
  batch.delete(student.ref);
  if (student.data.groupId) {
    const groupRef = db.collection('groups').doc(student.data.groupId);
    const groupSnap = await groupRef.get();
    if (groupSnap.exists) batch.update(groupRef, { activeStudentCount: Math.max(0, Number(groupSnap.data().activeStudentCount || 0) - 1), updatedAt: FieldValue.serverTimestamp() });
  }
  batch.set(db.collection('student_codes').doc(student.code), { active: false, deletedAt: FieldValue.serverTimestamp(), deletedBy: staff.uid }, { merge: true });
  batch.set(db.collection('activityLog').doc(), { action: 'deleteStudentSafely', studentCode: student.code, deletedRecords, actor: staff.uid, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { deleted: true, deletedRecords };
});

exports.createReview = onCall(callable, async request => {
  await rateLimit(request, 'createReview', 3, 3600);
  let review;
  try {
    review = {
      name: v.text(request.data?.name, 80, true),
      role: v.text(request.data?.role || 'طالب', 30),
      rating: v.number(request.data?.rating, 1, 5),
      text: v.text(request.data?.text, 800, true),
      approved: false,
      featured: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
  } catch (error) { mapValidation(error); }
  const ref = await db.collection('reviews').add(review);
  return { id: ref.id, status: 'pending', message: 'تم إرسال التقييم وسيظهر بعد موافقة الإدارة.' };
});

function monthBounds(monthValue) {
  const month = /^\d{4}-\d{2}$/.test(String(monthValue || '')) ? String(monthValue) : new Date().toISOString().slice(0, 7);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return { month, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

exports.getPublicLeaderboard = onCall(callable, async request => {
  await rateLimit(request, 'getPublicLeaderboard', 30, 60);
  let track;
  try { track = v.normalizeTrack(request.data?.track); } catch (error) { mapValidation(error); }
  const bounds = monthBounds(request.data?.month);
  const cacheId = `leaderboard_${sha(`${track}|${bounds.month}`).slice(0, 24)}`;
  const cacheRef = db.collection('public_cache').doc(cacheId);
  const cached = await cacheRef.get();
  if (cached.exists && cached.data().expiresAt?.toMillis?.() > Date.now()) return { ...cached.data().payload, cached: true };
  const studentsSnap = await db.collection('students').where('track', '==', track).where('status', '==', 'active').limit(500).get();
  const codes = new Set(studentsSnap.docs.map(doc => doc.id));
  const [progressSnap, attemptsSnap, practicalSnap] = await Promise.all([
    db.collection('class_progress').where('track', '==', track).where('date', '>=', bounds.start).where('date', '<', bounds.end).limit(3000).get(),
    db.collection('exam_attempts').where('track', '==', track).limit(3000).get(),
    db.collection('practical_submissions').where('track', '==', track).where('submittedAt', '>=', Timestamp.fromDate(new Date(`${bounds.start}T00:00:00Z`))).where('submittedAt', '<', Timestamp.fromDate(new Date(`${bounds.end}T00:00:00Z`))).limit(3000).get().catch(() => ({ docs: [] }))
  ]);
  const stats = new Map([...codes].map(code => [code, { sessions: 0, present: 0, homework: 0, practical: 0, participation: 0, exams: [], practicalScores: [] }]));
  progressSnap.docs.forEach(doc => {
    const item = doc.data(); const s = stats.get(item.studentCode); if (!s) return;
    s.sessions += 1;
    if (item.attendanceStatus === 'حاضر' || item.attendanceStatus === 'متأخر') s.present += 1;
    if (item.homeworkCompleted === true) s.homework += 1;
    if (item.practicalCompleted === true) s.practical += 1;
    if (item.participation && item.participation !== 'لا') s.participation += 1;
  });
  attemptsSnap.docs.forEach(doc => {
    const item = doc.data(); const s = stats.get(item.studentCode); if (!s || item.score === null || item.score === undefined) return;
    const submitted = item.submittedAt?.toDate?.() || new Date(item.submittedAt || 0);
    if (submitted >= new Date(`${bounds.start}T00:00:00Z`) && submitted < new Date(`${bounds.end}T00:00:00Z`)) s.exams.push(Number(item.score));
  });
  practicalSnap.docs.forEach(doc => { const item = doc.data(); const s = stats.get(item.studentCode); if (s && item.score !== null && item.score !== undefined) s.practicalScores.push(Number(item.score)); });
  const rankedRows = studentsSnap.docs.map(doc => {
    const student = doc.data(); const s = stats.get(doc.id); const total = Math.max(1, s.sessions);
    const exam = s.exams.length ? s.exams.reduce((a, b) => a + b, 0) / s.exams.length : 0;
    const details = {
      exams: Math.round(exam * 100) / 100,
      attendance: Math.round((s.present / total) * 10000) / 100,
      homework: Math.round((s.homework / total) * 10000) / 100,
      practical: s.practicalScores.length ? Math.round((s.practicalScores.reduce((a,b)=>a+b,0)/s.practicalScores.length)*100)/100 : Math.round((s.practical / total) * 10000) / 100,
      participation: Math.round((s.participation / total) * 10000) / 100
    };
    const score = details.exams * .35 + details.attendance * .25 + details.homework * .15 + details.practical * .20 + details.participation * .05;
    return { studentCode: doc.id, name: String(student.name || student.studentName || ''), track, score: Math.round(score * 100) / 100, details };
  }).filter(row => row.name).sort((a, b) => b.score - a.score).map((row, index) => ({ ...row, rank: index + 1 }));
  const rows = rankedRows.slice(0, 5).map(row => ({ name: row.name, track: row.track, score: row.score, details: row.details, rank: row.rank }));
  const payload = { track, month: bounds.month, weights: { exams: 35, attendance: 25, homework: 15, practical: 20, participation: 5 }, students: rows, generatedAt: new Date().toISOString() };
  const rankByCode = Object.fromEntries(rankedRows.map(row => [row.studentCode, row.rank]));
  await cacheRef.set({ payload, rankByCode, expiresAt: Timestamp.fromMillis(Date.now() + 2 * 60_000), updatedAt: FieldValue.serverTimestamp() });
  return payload;
});

async function aggregateCount(query) {
  try { return Number((await query.count().get()).data().count || 0); }
  catch (_) { return Number((await query.limit(1000).get()).size || 0); }
}

async function latestRows(collection, limit = 5, orderBy = 'updatedAt') {
  const ref = db.collection(collection);
  const snap = await ref.orderBy(orderBy, 'desc').limit(limit).get().catch(() => ref.limit(limit).get());
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

exports.getAdminDashboard = onCall(callable, async request => {
  await requireStaff(request);
  const today = new Date().toISOString().slice(0, 10);
  const [
    allStudents, stoppedStudents, pendingBookings, paidStudents, unpaidStudents,
    pendingHomework, pendingPractical, pendingCorrection,
    todayProgressSnap, groupsSnap, todayLecturesSnap,
    recentBookings, recentHomework, recentPractical, recentErrors
  ] = await Promise.all([
    aggregateCount(db.collection('students')),
    aggregateCount(db.collection('students').where('status', 'in', ['stopped', 'inactive', 'متوقف'])),
    aggregateCount(db.collection('bookings').where('status', '==', 'pending')),
    aggregateCount(db.collection('students').where('paymentStatus', '==', 'paid')),
    aggregateCount(db.collection('students').where('paymentStatus', 'in', ['unpaid', 'partial', 'late'])),
    aggregateCount(db.collection('homework_submissions').where('status', '==', 'pending')),
    aggregateCount(db.collection('practical_submissions').where('status', 'in', ['submitted', 'pending_review'])),
    aggregateCount(db.collection('exam_attempts').where('status', '==', 'submitted')),
    db.collection('class_progress').where('date', '==', today).limit(800).get(),
    db.collection('groups').limit(300).get(),
    db.collection('onlineLectures').where('date', '==', today).limit(100).get().catch(() => ({ docs: [] })),
    latestRows('bookings', 5, 'createdAt'),
    latestRows('homework_submissions', 5, 'createdAt'),
    latestRows('practical_submissions', 5, 'submittedAt'),
    latestRows('client_errors', 5, 'createdAt')
  ]);
  const todayProgress = todayProgressSnap.docs.map(doc => doc.data());
  const groups = groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const fullGroups = groups.filter(group => Number(group.capacity || 0) > 0 && Number(group.activeStudentCount || group.approvedCount || 0) >= Number(group.capacity)).length;
  return {
    stats: {
      activeStudents: Math.max(0, allStudents - stoppedStudents),
      pendingBookings,
      presentToday: todayProgress.filter(item => item.attendanceStatus === 'حاضر').length,
      absentToday: todayProgress.filter(item => item.attendanceStatus === 'غائب').length,
      pendingHomework,
      pendingPractical,
      pendingCorrection,
      paidStudents,
      unpaidStudents,
      fullGroups,
      lecturesToday: todayLecturesSnap.docs.length,
      recentErrors: recentErrors.length
    },
    recentBookings: recentBookings.map(item => ({ id: item.id, name: item.name || item.studentName || '', track: item.track || item.grade || '', groupName: item.groupName || item.group || '', status: item.status || '', createdAt: item.createdAt })),
    todayLectures: todayLecturesSnap.docs.map(doc => { const item = doc.data(); return { id: doc.id, title: item.title || '', groupName: item.groupName || '', time: item.time || '', status: item.status || '' }; }),
    recentHomework: recentHomework.map(item => ({ id: item.id, studentCode: item.studentCode || '', assignmentId: item.assignmentId || '', fileName: item.fileName || '', status: item.status || '', createdAt: item.createdAt })),
    recentPractical: recentPractical.map(item => ({ id: item.id, studentName: item.studentName || '', studentCode: item.studentCode || '', taskTitle: item.taskTitle || '', score: item.score ?? null, status: item.status || '', submittedAt: item.submittedAt })),
    recentErrors: recentErrors.map(item => ({ id: item.id, page: item.page || '', action: item.action || '', code: item.code || '', message: item.message || '', createdAt: item.createdAt })),
    fullGroups: groups.filter(group => Number(group.capacity || 0) > 0 && Number(group.activeStudentCount || group.approvedCount || 0) >= Number(group.capacity)).slice(0, 10).map(group => ({ id: group.id, name: group.name || '', track: group.track || '', capacity: group.capacity || 0 }))
  };
});

exports.reportClientError = onCall(callable, async request => {
  await rateLimit(request, 'reportClientError', 8, 300);
  let payload;
  try {
    payload = {
      page: v.text(request.data?.page, 180),
      action: v.text(request.data?.action, 100),
      code: v.text(request.data?.code, 100),
      message: v.text(request.data?.message, 500),
      userAgent: v.text(request.rawRequest?.headers?.['user-agent'], 250),
      fingerprint: requestIdentity(request),
      createdAt: FieldValue.serverTimestamp()
    };
  } catch (error) { mapValidation(error); }
  const ref = await db.collection('client_errors').add(payload);
  return { id: ref.id, saved: true };
});

function cleanTests(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 20).map((row, index) => ({
    title: v.text(row?.title || `Test ${index + 1}`, 100),
    stdin: v.text(row?.stdin, 16_384),
    expectedOutput: v.text(row?.expectedOutput, 16_384)
  }));
}

function cleanQuestions(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) fail('invalid-argument', 'أضف من سؤال واحد إلى 100 سؤال.');
  return rows.map((row, index) => {
    const type = v.text(row?.type || 'essay', 20, true);
    if (!['mcq', 'essay', 'code'].includes(type)) fail('invalid-argument', `نوع السؤال ${index + 1} غير مدعوم.`);
    const question = v.text(row?.question, 4000, true);
    const points = v.number(row?.points, 1, 1000, 1);
    const result = { id: v.identifier(row?.id || `q${index + 1}`, 80), type, question, points };
    if (type === 'mcq') {
      if (!Array.isArray(row.options) || row.options.length !== 4) fail('invalid-argument', `السؤال ${index + 1} يجب أن يحتوي على أربعة اختيارات.`);
      result.options = row.options.map(option => v.text(option, 1000, true));
      result.correctAnswer = v.text(row.correctAnswer ?? row.correctIndex, 1000, true);
    }
    if (type === 'code') {
      result.starterCode = v.text(row.starterCode || row.starter, 65_536);
      result.language = v.text(row.language, 80);
    }
    return result;
  });
}

function sanitizeAdminRecord(collection, source) {
  const data = v.safeJson(source, 256 * 1024) || {};
  const text = (key, max = 500, required = false) => v.text(data[key], max, required);
  if (collection === 'tracks') return { name: text('name', 80, true), description: text('description', 1000), status: text('status', 20) || 'active' };
  if (collection === 'groups') return { name: text('name', 100, true), track: v.normalizeTrack(data.track), day: text('day', 30, true), time: text('time', 20, true), schedule: text('schedule', 100), mode: text('mode', 20, true), capacity: v.number(data.capacity, 1, 1000), status: text('status', 20) || 'open', active: data.active !== false, meetingUrl: v.url(data.meetingUrl), notes: text('notes', 1000) };
  if (collection === 'onlineLectures') return { title: text('title', 160, true), track: text('track', 80), groupId: text('groupId', 100), groupName: text('groupName', 100), date: v.isoDate(data.date), time: text('time', 20, true), meetingUrl: v.url(data.meetingUrl), recordingUrl: v.url(data.recordingUrl), status: text('status', 30) || 'لم تبدأ', hideAfterEnd: v.boolean(data.hideAfterEnd), notes: text('notes', 1500) };
  if (collection === 'payments') return { studentCode: v.studentCode(data.studentCode), month: text('month', 30, true), amount: v.number(data.amount, 0, 1_000_000), method: text('method', 30), status: text('status', 20) || 'paid', note: text('note', 500) };
  if (collection === 'materials') return { title: text('title', 160, true), desc: text('desc', 2000), type: text('type', 40), track: text('track', 80), groupId: text('groupId', 100), isPublic: v.boolean(data.isPublic), status: text('status', 20) || 'مخفي', link: v.url(data.link), fileUrl: v.url(data.fileUrl), filePath: text('filePath', 500), fileName: text('fileName', 200), contentType: text('contentType', 100), size: v.number(data.size, 0, 20 * 1024 * 1024) };
  if (collection === 'assignments') return { title: text('title', 160, true), description: text('description', 4000), track: text('track', 80), groupId: text('groupId', 100), dueDate: data.dueDate ? v.isoDate(data.dueDate) : '', status: text('status', 20) || 'published' };
  if (collection === 'practical_tasks') return { title: text('title', 160, true), description: text('description', 4000), track: text('track', 80), groupId: text('groupId', 100), visibleTests: cleanTests(data.visibleTests), hiddenTests: cleanTests(data.hiddenTests), status: text('status', 20) || 'hidden' };
  if (collection === 'exams') return { title: text('title', 160, true), instructions: text('instructions', 4000), duration: v.number(data.duration, 1, 300, 20), targetType: text('targetType', 20) || 'all', track: text('track', 80), targetGroupId: text('targetGroupId', 100), targetStudentCode: data.targetStudentCode ? v.studentCode(data.targetStudentCode) : '', attachmentUrl: v.url(data.attachmentUrl), questions: cleanQuestions(data.questions), status: text('status', 20) || 'hidden', allowRetake: v.boolean(data.allowRetake) };
  if (collection === 'reviews') return { name: text('name', 100, true), role: text('role', 40), rating: v.number(data.rating, 1, 5, 5), text: text('text', 1500, true), approved: v.boolean(data.approved) };
  if (collection === 'services') return { title: text('title', 120, true), desc: text('desc', 2000), price: text('price', 100), status: text('status', 20) || 'active' };
  if (collection === 'settings') return { siteName: text('siteName', 120), teacherName: text('teacherName', 120), teacherPhone: text('teacherPhone', 30), siteUrl: v.url(data.siteUrl), heroText: text('heroText', 2000) };
  if (collection === 'grades') return { studentCode: v.studentCode(data.studentCode), examId: text('examId', 100), score: v.number(data.score, 0, 100), note: text('note', 1000) };
  fail('permission-denied', 'هذا القسم غير مسموح.');
}

exports.adminUpsertRecord = onCall(callable, async request => {
  const staff = await requireStaff(request);
  let collection, id, data;
  try {
    collection = v.text(request.data?.collection, 80, true);
    if (!ADMIN_COLLECTIONS.has(collection)) fail('permission-denied', 'هذا القسم لا يقبل الحفظ العام.');
    const allowedByRole = {
      admin: ADMIN_COLLECTIONS,
      teacher: new Set(['materials', 'assignments', 'practical_tasks', 'exams', 'grades', 'reviews', 'onlineLectures']),
      assistant: new Set(['groups'])
    };
    if (!allowedByRole[staff.role]?.has(collection)) fail('permission-denied', 'صلاحية حسابك لا تسمح بتعديل هذا القسم.');
    id = request.data?.id ? v.identifier(request.data.id, 120) : crypto.randomUUID();
    data = sanitizeAdminRecord(collection, request.data?.data);
  } catch (error) { mapValidation(error); }
  const ref = db.collection(collection).doc(collection === 'settings' ? (request.data?.id || 'site') : id);
  const cleaned = { ...data };
  delete cleaned.id; delete cleaned.createdAt; delete cleaned.updatedAt; delete cleaned.recordedBy;
  const old = await ref.get();
  if (collection === 'payments') {
    const student = await db.collection('students').doc(cleaned.studentCode).get();
    if (!student.exists) fail('not-found', 'لا يوجد طالب بهذا الكود لتسجيل الدفعة.');
  }
  await ref.set({ ...cleaned, id: ref.id, createdAt: old.exists ? old.data().createdAt : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: staff.uid }, { merge: true });
  if (collection === 'payments') await db.collection('students').doc(cleaned.studentCode).update({ paymentStatus: cleaned.status, paymentMonth: cleaned.month, paymentAmount: cleaned.amount, paymentMethod: cleaned.method, paymentDate: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await db.collection('activityLog').add({ action: old.exists ? 'updateRecord' : 'createRecord', collection, recordId: ref.id, actor: staff.uid, createdAt: FieldValue.serverTimestamp() });
  return { id: ref.id, saved: true };
});

async function saveTypedRecord(collection, source, staff, requestedId = '') {
  const data = sanitizeAdminRecord(collection, source);
  const id = requestedId ? v.identifier(requestedId, 120) : crypto.randomUUID();
  const ref = db.collection(collection).doc(id);
  const old = await ref.get();
  await ref.set({ ...data, id, createdAt: old.exists ? old.data().createdAt : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: staff.uid }, { merge: true });
  await logActivity(staff, old.exists ? 'updateRecord' : 'createRecord', { collection, recordId: id });
  return { id, saved: true };
}

exports.createAssignment = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  return saveTypedRecord('assignments', request.data?.data || request.data, staff, request.data?.id || '');
});

exports.createPracticalTask = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  return saveTypedRecord('practical_tasks', request.data?.data || request.data, staff, request.data?.id || '');
});

exports.createExam = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  return saveTypedRecord('exams', request.data?.data || request.data, staff, request.data?.id || '');
});

exports.recordPayment = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin']));
  let studentCode, month, amount, paidAmount, method, status, note;
  try {
    studentCode = v.studentCode(request.data?.studentCode);
    month = v.text(request.data?.month, 30, true);
    amount = v.number(request.data?.amount, 0, 1_000_000, 0);
    paidAmount = v.number(request.data?.paidAmount ?? request.data?.amount, 0, 1_000_000, 0);
    method = v.text(request.data?.method || 'كاش', 30);
    status = v.text(request.data?.status || 'paid', 20, true);
    note = v.text(request.data?.note, 500);
    if (!['paid', 'partial', 'unpaid', 'exempt', 'late'].includes(status)) throw new Error('invalid-payment-status');
  } catch (error) {
    if (error?.message === 'invalid-payment-status') fail('invalid-argument', 'حالة الدفع غير صحيحة.');
    mapValidation(error);
  }
  const paymentId = `${studentCode}_${sha(month).slice(0, 12)}`;
  const paymentRef = db.collection('payments').doc(paymentId);
  const studentRef = db.collection('students').doc(studentCode);
  await db.runTransaction(async tx => {
    const [studentSnap, paymentSnap] = await Promise.all([tx.get(studentRef), tx.get(paymentRef)]);
    if (!studentSnap.exists) fail('not-found', 'لا يوجد طالب بهذا الكود.');
    const now = FieldValue.serverTimestamp();
    tx.set(paymentRef, { id: paymentId, studentCode, month, amount, paidAmount, remaining: Math.max(0, amount - paidAmount), method, status, note, recordedBy: staff.uid, recordedByName: staff.name, paymentDate: now, createdAt: paymentSnap.exists ? paymentSnap.data().createdAt : now, updatedAt: now }, { merge: true });
    tx.update(studentRef, { paymentStatus: status, paymentMonth: month, paymentAmount: amount, paidAmount, paymentMethod: method, paymentDate: now, updatedAt: now });
  });
  await logActivity(staff, 'recordPayment', { studentCode, paymentId, month, status, amount, paidAmount });
  return { id: paymentId, saved: true, status, remaining: Math.max(0, amount - paidAmount) };
});

exports.recordGrade = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  let data;
  try { data = sanitizeAdminRecord('grades', request.data?.data || request.data); }
  catch (error) { mapValidation(error); }
  const id = request.data?.id ? v.identifier(request.data.id, 120) : `${data.studentCode}_${crypto.randomUUID()}`;
  const ref = db.collection('grades').doc(id);
  const old = await ref.get();
  await ref.set({ ...data, id, type: v.text(request.data?.type || request.data?.data?.type || 'manual', 40), title: v.text(request.data?.title || request.data?.data?.title || 'درجة', 160), month: v.text(request.data?.month || request.data?.data?.month || new Date().toISOString().slice(0, 7), 20), recordedBy: staff.uid, recordedByName: staff.name, createdAt: old.exists ? old.data().createdAt : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await logActivity(staff, old.exists ? 'updateGrade' : 'recordGrade', { studentCode: data.studentCode, gradeId: id, score: data.score });
  return { id, saved: true };
});

exports.reviewHomework = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  let submissionId, status, teacherNote, score;
  try {
    submissionId = v.identifier(request.data?.submissionId, 120);
    status = v.text(request.data?.status, 30, true);
    teacherNote = v.text(request.data?.teacherNote, 1000);
    score = request.data?.score === '' || request.data?.score === undefined ? null : v.number(request.data.score, 0, 100);
    if (!['approved', 'needs_changes', 'rejected', 'pending'].includes(status)) throw new Error('invalid-status');
  } catch (error) { mapValidation(error, 'بيانات مراجعة الواجب غير صحيحة.'); }
  const ref = db.collection('homework_submissions').doc(submissionId);
  const snap = await ref.get();
  if (!snap.exists) fail('not-found', 'تسليم الواجب غير موجود.');
  await ref.update({ status, teacherNote, score, reviewedBy: staff.uid, reviewedByName: staff.name, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await logActivity(staff, 'reviewHomework', { studentCode: snap.data().studentCode || '', submissionId, status, score });
  return { updated: true, status, score };
});

exports.approveExamResult = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  let attemptId;
  try { attemptId = v.identifier(request.data?.attemptId, 180); } catch (error) { mapValidation(error); }
  const ref = db.collection('exam_attempts').doc(attemptId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== 'graded') fail('failed-precondition', 'النتيجة غير جاهزة للاعتماد.');
  await ref.update({ resultPublished: true, publishedBy: staff.uid, publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await logActivity(staff, 'approveExamResult', { studentCode: snap.data().studentCode || '', attemptId });
  return { published: true };
});

exports.listStaffAccounts = onCall(callable, async request => {
  await requireStaff(request, new Set(['admin']));
  const snap = await db.collection('users').limit(100).get();
  return { rows: snap.docs.map(doc => { const data = doc.data(); return { id: doc.id, name: data.name || '', email: data.email || '', role: data.role || '', active: data.active !== false, updatedAt: data.updatedAt || null }; }) };
});

exports.updateStaffRole = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin']));
  let uid, role, name, active;
  try {
    uid = v.identifier(request.data?.uid, 128);
    role = v.text(request.data?.role, 20, true);
    name = v.text(request.data?.name, 120);
    active = v.boolean(request.data?.active);
    if (!STAFF_ROLES.has(role)) throw new Error('invalid-role');
    if (uid === staff.uid && active === false) fail('failed-precondition', 'لا يمكنك تعطيل حسابك الإداري الحالي.');
  } catch (error) { mapValidation(error, 'بيانات الصلاحية غير صحيحة.'); }
  await db.collection('users').doc(uid).set({ role, name, active, updatedAt: FieldValue.serverTimestamp(), updatedBy: staff.uid }, { merge: true });
  await logActivity(staff, 'updateStaffRole', { staffUid: uid, role, active });
  return { updated: true };
});

exports.adminDeleteRecord = onCall(callable, async request => {
  const staff = await requireStaff(request, new Set(['admin', 'teacher']));
  let collection, id;
  try {
    collection = v.text(request.data?.collection, 80, true);
    id = v.identifier(request.data?.id, 120);
    if (!ADMIN_COLLECTIONS.has(collection) || ['settings'].includes(collection)) fail('permission-denied', 'لا يمكن حذف هذا القسم بهذه الطريقة.');
    if (staff.role !== 'admin' && !new Set(['materials', 'assignments', 'practical_tasks', 'exams', 'grades', 'reviews', 'onlineLectures']).has(collection)) fail('permission-denied', 'ليست لديك صلاحية حذف هذا النوع من السجلات.');
  } catch (error) { mapValidation(error); }
  const ref = db.collection(collection).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { deleted: true, idempotent: true };
  const data = snap.data();
  if (collection === 'groups') {
    const [students, bookings] = await Promise.all([
      db.collection('students').where('groupId', '==', id).limit(1).get(),
      db.collection('bookings').where('groupId', '==', id).where('status', '==', 'pending').limit(1).get()
    ]);
    if (!students.empty || !bookings.empty) fail('failed-precondition', 'لا يمكن حذف مجموعة مرتبطة بطلاب أو حجوزات معلقة. انقل الطلاب وأغلق الحجوزات أولًا.');
  }
  if (collection === 'assignments') {
    const submissions = await db.collection('homework_submissions').where('assignmentId', '==', id).limit(400).get();
    for (const submission of submissions.docs) {
      const filePath = submission.data().filePath;
      if (filePath) await getStorage().bucket().file(filePath).delete({ ignoreNotFound: true }).catch(() => {});
    }
    for (let offset = 0; offset < submissions.docs.length; offset += 400) {
      const batch = db.batch();
      submissions.docs.slice(offset, offset + 400).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  }
  await ref.delete();
  if (data.filePath) await getStorage().bucket().file(data.filePath).delete({ ignoreNotFound: true }).catch(() => {});
  await db.collection('activityLog').add({ action: 'deleteRecord', collection, recordId: id, actor: staff.uid, createdAt: FieldValue.serverTimestamp() });
  return { deleted: true };
});

exports.listAdminRecords = onCall(callable, async request => {
  await requireStaff(request);
  let collection, limit;
  try {
    collection = v.text(request.data?.collection, 80, true);
    if (![...ADMIN_COLLECTIONS, 'students', 'bookings', 'class_progress', 'homework_submissions', 'exam_attempts', 'practical_submissions', 'client_errors', 'activityLog'].includes(collection)) fail('permission-denied', 'القسم المطلوب غير مسموح.');
    limit = v.number(request.data?.limit, 1, 200, 50);
  } catch (error) { mapValidation(error); }
  let query = db.collection(collection).orderBy(request.data?.orderBy || 'updatedAt', 'desc').limit(limit);
  if (request.data?.cursor) query = query.startAfter(Timestamp.fromMillis(Number(request.data.cursor)));
  const snap = await query.get().catch(async () => db.collection(collection).limit(limit).get());
  const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const last = snap.docs.at(-1)?.data()?.updatedAt?.toMillis?.() || null;
  return { rows, nextCursor: snap.size === limit ? last : null };
});

exports.searchAdminRecords = onCall(callable, async request => {
  await requireStaff(request);
  let collection, term;
  try {
    collection = v.text(request.data?.collection, 30, true);
    if (!['bookings', 'students'].includes(collection)) fail('permission-denied', 'البحث غير متاح لهذا القسم.');
    term = v.text(request.data?.term, 100).toLowerCase();
  } catch (error) { mapValidation(error); }
  let snap;
  if (/^[1-9][0-9]{7}$/.test(term)) snap = await db.collection(collection).where('studentCode', '==', term).limit(50).get();
  else snap = await db.collection(collection).orderBy('updatedAt', 'desc').limit(200).get().catch(() => db.collection(collection).limit(200).get());
  const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => {
    if (!term) return true;
    const haystack = [item.name, item.studentName, item.studentCode, item.studentPhone, item.parentPhone, item.track, item.grade, item.groupName, item.group, item.status].join(' ').toLowerCase();
    return haystack.includes(term);
  }).slice(0, 60);
  return { rows };
});

function judgeConfig() {
  const baseUrl = String(process.env.JUDGE0_BASE_URL || '').replace(/\/$/, '');
  if (!baseUrl) fail('failed-precondition', 'خدمة تشغيل الأكواد غير مفعلة بعد. أضف JUDGE0_BASE_URL إلى بيئة Functions.');
  return {
    baseUrl,
    apiKey: String(process.env.JUDGE0_API_KEY || ''),
    apiKeyHeader: String(process.env.JUDGE0_API_KEY_HEADER || 'X-Auth-Token'),
    rapidHost: String(process.env.JUDGE0_RAPIDAPI_HOST || '')
  };
}

async function judgeFetch(path, options = {}) {
  const config = judgeConfig();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (config.apiKey) headers[config.apiKeyHeader] = config.apiKey;
  if (config.rapidHost) headers['X-RapidAPI-Host'] = config.rapidHost;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, { ...options, headers, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Judge0 proxy error', response.status, body?.error || body?.message || 'unknown');
      if (response.status === 401 || response.status === 403) fail('failed-precondition', 'مفتاح خدمة تشغيل الأكواد غير صحيح أو لا يملك صلاحية.');
      if (response.status === 429) fail('resource-exhausted', 'تم بلوغ حد خدمة تشغيل الأكواد. حاول لاحقًا.');
      fail('unavailable', 'خدمة تشغيل الأكواد لم تستجب بشكل صحيح.');
    }
    return body;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error?.name === 'AbortError') fail('deadline-exceeded', 'انتهت مهلة الاتصال بخدمة تشغيل الأكواد.');
    fail('unavailable', 'تعذر الاتصال بخدمة تشغيل الأكواد حاليًا.');
  } finally { clearTimeout(timer); }
}

let languageCache = { expires: 0, rows: [] };
exports.getCodeLanguages = onCall(callable, async request => {
  await rateLimit(request, 'getCodeLanguages', 20, 60);
  if (languageCache.expires > Date.now()) return { languages: languageCache.rows, cached: true };
  const rows = await judgeFetch('/languages', { method: 'GET' });
  languageCache = { expires: Date.now() + 15 * 60_000, rows: Array.isArray(rows) ? rows.map(row => ({ id: row.id, name: row.name })) : [] };
  return { languages: languageCache.rows };
});

function codeLimits() {
  return {
    code: Number(process.env.CODE_MAX_BYTES || 65_536),
    stdin: Number(process.env.STDIN_MAX_BYTES || 16_384),
    output: Number(process.env.OUTPUT_MAX_BYTES || 32_768),
    cpu: Number(process.env.CODE_CPU_SECONDS || 5),
    wall: Number(process.env.CODE_WALL_SECONDS || 10),
    memory: Number(process.env.CODE_MEMORY_KB || 131_072)
  };
}

function cleanExecution(data) {
  const limits = codeLimits();
  let sourceCode, stdin, languageId;
  try {
    sourceCode = v.text(data?.sourceCode, limits.code, true);
    stdin = v.text(data?.stdin, limits.stdin);
    languageId = v.number(data?.languageId, 1, 9999);
  } catch (error) { mapValidation(error, 'بيانات تشغيل الكود غير صحيحة.'); }
  if (Buffer.byteLength(sourceCode, 'utf8') > limits.code || Buffer.byteLength(stdin, 'utf8') > limits.stdin) fail('invalid-argument', 'حجم الكود أو Input أكبر من الحد المسموح.');
  return { sourceCode, stdin, languageId, limits };
}

exports.submitCodeExecution = onCall({ ...callable, timeoutSeconds: 20 }, async request => {
  await rateLimit(request, 'submitCodeExecution', 12, 60);
  const input = cleanExecution(request.data);
  const result = await judgeFetch('/submissions?base64_encoded=false&wait=false', {
    method: 'POST',
    body: JSON.stringify({
      source_code: input.sourceCode,
      language_id: input.languageId,
      stdin: input.stdin,
      cpu_time_limit: input.limits.cpu,
      wall_time_limit: input.limits.wall,
      memory_limit: input.limits.memory,
      max_processes_and_or_threads: 20,
      enable_network: false
    })
  });
  if (!result.token) fail('unavailable', 'لم تُرجع خدمة التشغيل رمز متابعة.');
  const runRef = db.collection('code_execution_runs').doc();
  await runRef.set({ judgeToken: result.token, owner: requestIdentity(request), createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60_000) });
  return { token: runRef.id, status: 'queued' };
});

function trimOutput(value, max) {
  const result = String(value || '');
  return result.length > max ? `${result.slice(0, max)}\n… تم اختصار الناتج` : result;
}

exports.getCodeExecutionResult = onCall(callable, async request => {
  await rateLimit(request, 'getCodeExecutionResult', 60, 60);
  let runId;
  try { runId = v.identifier(request.data?.token || request.data?.runId, 100); } catch (error) { mapValidation(error); }
  const runRef = db.collection('code_execution_runs').doc(runId);
  const runSnap = await runRef.get();
  if (!runSnap.exists || runSnap.data().expiresAt?.toMillis?.() < Date.now()) fail('not-found', 'انتهت جلسة تشغيل الكود. شغّل الكود من جديد.');
  if (runSnap.data().owner !== requestIdentity(request)) fail('permission-denied', 'نتيجة التشغيل غير متاحة لهذا الجهاز.');
  const result = await judgeFetch(`/submissions/${encodeURIComponent(runSnap.data().judgeToken)}?base64_encoded=false&fields=status,stdout,stderr,compile_output,message,time,memory,exit_code`, { method: 'GET' });
  const max = codeLimits().output;
  const response = {
    status: { id: result.status?.id || 0, description: result.status?.description || 'Unknown' },
    stdout: trimOutput(result.stdout, max),
    stderr: trimOutput(result.stderr, max),
    compileOutput: trimOutput(result.compile_output, max),
    message: trimOutput(result.message, 1000),
    time: result.time ?? null,
    memory: result.memory ?? null,
    exitCode: result.exit_code ?? null,
    finished: Number(result.status?.id || 0) > 2
  };
  if (response.finished) await runRef.delete().catch(() => {});
  return response;
});

exports.submitPracticalTask = onCall({ ...callable, timeoutSeconds: 20 }, async request => {
  await rateLimit(request, 'submitPracticalTask', 8, 300);
  const input = cleanExecution(request.data);
  let taskId, codeValue;
  try { taskId = v.identifier(request.data?.taskId, 100); codeValue = v.text(request.data?.studentCode, 40, true); } catch (error) { mapValidation(error); }
  const student = await resolveStudent(codeValue);
  const taskSnap = await db.collection('practical_tasks').doc(taskId).get();
  if (!taskSnap.exists || taskSnap.data()?.status !== 'published') fail('not-found', 'المهمة العملية غير متاحة.');
  const task = taskSnap.data();
  const studentTrack = String(student.data.track || student.data.grade || '');
  if (task.track && task.track !== studentTrack) fail('permission-denied', 'هذه المهمة ليست ضمن مسار الطالب.');
  const tests = [...(task.visibleTests || []).map(test => ({ ...test, hidden: false })), ...(task.hiddenTests || []).map(test => ({ ...test, hidden: true }))].slice(0, 20);
  if (!tests.length) fail('failed-precondition', 'المهمة لا تحتوي على اختبارات.');
  const submissions = tests.map(test => ({ source_code: input.sourceCode, language_id: input.languageId, stdin: String(test.stdin || ''), expected_output: String(test.expectedOutput || ''), cpu_time_limit: input.limits.cpu, wall_time_limit: input.limits.wall, memory_limit: input.limits.memory, max_processes_and_or_threads: 20, enable_network: false }));
  const response = await judgeFetch('/submissions/batch?base64_encoded=false', { method: 'POST', body: JSON.stringify({ submissions }) });
  const tokens = Array.isArray(response) ? response.map(item => item.token) : [];
  if (tokens.length !== tests.length || tokens.some(token => !token)) fail('unavailable', 'تعذر إنشاء كل اختبارات المهمة.');
  const runRef = db.collection('practical_submissions').doc();
  await runRef.set({
    id: runRef.id, taskId, taskTitle: task.title || '', studentCode: student.code,
    studentName: student.data.name || student.data.studentName || '', track: studentTrack,
    groupId: student.data.groupId || '', languageId: input.languageId, sourceCode: input.sourceCode,
    tests: tests.map((test, index) => ({ index, token: tokens[index], hidden: test.hidden, expectedOutput: String(test.expectedOutput || ''), title: String(test.title || `Test ${index + 1}`) })),
    status: 'running', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  });
  return { runId: runRef.id, status: 'running', visibleTestCount: tests.filter(test => !test.hidden).length, hiddenTestCount: tests.filter(test => test.hidden).length };
});

exports.getPracticalTaskResult = onCall(callable, async request => {
  await rateLimit(request, 'getPracticalTaskResult', 60, 60);
  let runId, codeValue;
  try { runId = v.identifier(request.data?.runId, 120); codeValue = v.text(request.data?.studentCode, 40, true); } catch (error) { mapValidation(error); }
  const student = await resolveStudent(codeValue);
  const runRef = db.collection('practical_submissions').doc(runId);
  const runSnap = await runRef.get();
  if (!runSnap.exists || runSnap.data().studentCode !== student.code) fail('permission-denied', 'نتيجة المهمة غير متاحة لهذا الطالب.');
  const run = runSnap.data();
  const tokens = run.tests.map(test => test.token).join(',');
  const response = await judgeFetch(`/submissions/batch?tokens=${encodeURIComponent(tokens)}&base64_encoded=false&fields=token,status,stdout,stderr,compile_output,time,memory`, { method: 'GET' });
  const results = response.submissions || [];
  const finished = results.length === run.tests.length && results.every(result => Number(result.status?.id || 0) > 2);
  const visible = results.map((result, index) => {
    const test = run.tests[index];
    const passed = finished && String(result.stdout || '').trim() === String(test.expectedOutput || '').trim() && Number(result.status?.id) === 3;
    return { index, title: test.title, hidden: test.hidden, passed, status: result.status?.description || '', stdout: test.hidden ? '' : trimOutput(result.stdout, 8000), stderr: test.hidden ? '' : trimOutput(result.stderr || result.compile_output, 8000), time: result.time ?? null, memory: result.memory ?? null };
  });
  if (finished) {
    const passed = visible.filter(result => result.passed).length;
    const score = Math.round((passed / Math.max(1, visible.length)) * 100);
    await runRef.update({ status: 'submitted', passedTests: passed, totalTests: visible.length, score, submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await db.collection('public_cache').doc(`leaderboard_${sha(`${run.track}|${new Date().toISOString().slice(0, 7)}`).slice(0, 24)}`).delete().catch(() => {});
    return { finished: true, status: 'submitted', score, passedTests: passed, totalTests: visible.length, tests: visible.map(result => result.hidden ? { index: result.index, title: 'اختبار مخفي', hidden: true, passed: result.passed, status: result.status } : result) };
  }
  return { finished: false, status: 'running', tests: visible.filter(result => !result.hidden) };
});

exports.savePracticalDraft = onCall(callable, async request => {
  await rateLimit(request, 'savePracticalDraft', 20, 300);
  let taskId, codeValue, sourceCode, languageId;
  try {
    taskId = v.identifier(request.data?.taskId, 100);
    codeValue = v.text(request.data?.studentCode, 40, true);
    sourceCode = v.text(request.data?.sourceCode, codeLimits().code);
    languageId = v.number(request.data?.languageId, 1, 9999);
  } catch (error) { mapValidation(error); }
  const student = await resolveStudent(codeValue);
  await db.collection('practical_drafts').doc(`${taskId}_${student.code}`).set({ taskId, studentCode: student.code, sourceCode, languageId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { saved: true };
});
