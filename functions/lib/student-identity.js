'use strict';

function normalizeDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
}

function phoneDigits(value) {
  return normalizeDigits(value).replace(/\D/g, '');
}

function normalizeStudentName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLocaleLowerCase('ar')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function studentNameKey(value) {
  return normalizeStudentName(value);
}

function recordNameKey(record = {}) {
  return studentNameKey(record.studentName || record.name || '');
}

function phoneMatchesStudent(record = {}, studentPhone, parentPhone) {
  const submitted = new Set([phoneDigits(studentPhone), phoneDigits(parentPhone)].filter(Boolean));
  const saved = [record.studentPhone, record.parentPhone, record.phone, record.guardianPhone]
    .map(phoneDigits)
    .filter(Boolean);
  return saved.some(phone => submitted.has(phone));
}

function studentRecordIsRejected(record = {}) {
  const state = `${record.status || ''} ${record.approvalStatus || ''}`;
  return /رفض|rejected/i.test(state);
}

module.exports = {
  normalizeStudentName,
  studentNameKey,
  recordNameKey,
  phoneMatchesStudent,
  studentRecordIsRejected
};
