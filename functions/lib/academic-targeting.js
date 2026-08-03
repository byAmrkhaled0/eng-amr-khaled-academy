'use strict';

function normalizeDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
}

const ACADEMIC_GRADES = Object.freeze([
  'أولى ثانوي بكالوريا',
  'تانية ثانوي بكالوريا',
  'أساسيات برمجة',
  'مبتدئين برمجة'
]);

function baseAcademicValue(value) {
  return normalizeDigits(value)
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .trim()
    .toLocaleLowerCase('ar')
    .replace(/\s+/g, ' ');
}

const GRADE_ALIASES = new Map([
  ['اولي ثانوي بكالوريا', 'اولي ثانوي بكالوريا'],
  ['اولي ثانوي برمجة', 'اولي ثانوي بكالوريا'],
  ['اولي ثانوي برمجه', 'اولي ثانوي بكالوريا'],
  ['اولي ثانوي', 'اولي ثانوي بكالوريا'],
  ['تانية ثانوي بكالوريا', 'تانية ثانوي بكالوريا'],
  ['تانيه ثانوي بكالوريا', 'تانية ثانوي بكالوريا'],
  ['ثانية ثانوي بكالوريا', 'تانية ثانوي بكالوريا'],
  ['ثانيه ثانوي بكالوريا', 'تانية ثانوي بكالوريا'],
  ['تانية ثانوي عام', 'تانية ثانوي بكالوريا'],
  ['تانيه ثانوي عام', 'تانية ثانوي بكالوريا'],
  ['ثانية ثانوي عام', 'تانية ثانوي بكالوريا'],
  ['ثانيه ثانوي عام', 'تانية ثانوي بكالوريا'],
  ['تانية ثانوي', 'تانية ثانوي بكالوريا'],
  ['تانيه ثانوي', 'تانية ثانوي بكالوريا'],
  ['ثانية ثانوي', 'تانية ثانوي بكالوريا'],
  ['ثانيه ثانوي', 'تانية ثانوي بكالوريا'],
  ['اساسيات برمجة', 'اساسيات برمجة'],
  ['اساسيات برمجه', 'اساسيات برمجة'],
  ['اساسيات python', 'اساسيات برمجة'],
  ['اساسيات بايثون', 'اساسيات برمجة'],
  ['تطبيقات ومراجعة', 'اساسيات برمجة'],
  ['تطبيقات و مراجعة', 'اساسيات برمجة'],
  ['مبتدئين برمجة', 'مبتدئين برمجة'],
  ['مبتدئين برمجه', 'مبتدئين برمجة'],
  ['مبتدئين', 'مبتدئين برمجة']
]);

const CANONICAL_LABELS = new Map(ACADEMIC_GRADES.map(label => [baseAcademicValue(label), label]));

function normalizeAcademicValue(value) {
  const normalized = baseAcademicValue(value);
  return GRADE_ALIASES.get(normalized) || normalized;
}

function canonicalAcademicLabel(value) {
  const normalized = normalizeAcademicValue(value);
  return CANONICAL_LABELS.get(normalized) || String(value || '').trim();
}

function isSupportedAcademicGrade(value) {
  return CANONICAL_LABELS.has(normalizeAcademicValue(value));
}

function sameAcademicValue(left, right) {
  const leftValue = normalizeAcademicValue(left);
  const rightValue = normalizeAcademicValue(right);
  return Boolean(leftValue && rightValue && leftValue === rightValue);
}

function wildcard(value, labels) {
  const normalized = normalizeAcademicValue(value);
  return !normalized || labels.some(label => normalizeAcademicValue(label) === normalized);
}

function scheduleMatchesStudent(schedule, student) {
  if (!schedule || !student || schedule.active === false) return false;
  if (!sameAcademicValue(schedule.grade, student.grade)) return false;
  if (!wildcard(schedule.term, ['كل الترمات', 'all']) && student.term && !sameAcademicValue(schedule.term, student.term)) return false;
  if (!wildcard(schedule.academicYear, ['كل الأعوام', 'all']) && student.academicYear && !sameAcademicValue(schedule.academicYear, student.academicYear)) return false;
  return true;
}

function learningTargetMatchesStudent(item, student) {
  if (!item || !student) return false;
  const grade = wildcard(item.grade, ['كل الصفوف', 'كل المسارات', 'all']) || sameAcademicValue(item.grade, student.grade);
  const group = wildcard(item.group, ['كل المجموعات', 'all']) || sameAcademicValue(item.group, student.group);
  const term = wildcard(item.term, ['كل الترمات', 'all']) || !student.term || sameAcademicValue(item.term, student.term);
  const year = !item.academicYear || !student.academicYear || sameAcademicValue(item.academicYear, student.academicYear);
  return grade && group && term && year;
}

module.exports = {
  ACADEMIC_GRADES,
  normalizeAcademicValue,
  canonicalAcademicLabel,
  isSupportedAcademicGrade,
  sameAcademicValue,
  scheduleMatchesStudent,
  learningTargetMatchesStudent
};
