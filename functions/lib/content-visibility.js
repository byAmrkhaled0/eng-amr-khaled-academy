'use strict';

const HIDDEN_LEARNING_CONTENT_STATUSES = new Set(['مسودة', 'مخفي', 'draft', 'hidden']);

function reusableLearningContentIsVisible(item = {}) {
  const status = String(item.status || '').trim().toLowerCase();
  return item.archived !== true
    && item.active !== false
    && item.published !== false
    && !HIDDEN_LEARNING_CONTENT_STATUSES.has(status);
}

const { normalizeDigits } = require('./student-identity');
const code = value => normalizeDigits(value).trim().toUpperCase();
const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
function millis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds !== undefined || value._seconds !== undefined) return Number(value.seconds ?? value._seconds) * 1000;
  return Date.parse(String(value)) || 0;
}
function cairoDay(value) {
  if (dateOnly(value)) return value;
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(millis(value)));
}

// Admin contract: new content from joining; custom additionally permits the
// previous content explicitly named for this student. Publication/audience
// checks remain separate and mandatory at every endpoint.
function reusableContentAccessAllowed(item = {}, student = {}, now = Date.now()) {
  const mode = ['full','from_joining','custom'].includes(student.contentAccessMode) ? student.contentAccessMode : 'from_joining';
  if (mode === 'full') return true;
  if (mode === 'custom' && Array.isArray(item.targetStudentCodes) && item.targetStudentCodes.map(code).includes(code(student.studentCode || student.code || student.id))) return true;
  const joined = student.acceptedAt || student.activatedAt || student.enrolledAt || student.createdAt;
  // updatedAt is an edit, never the original publication boundary.
  const published = item.publishAt || item.openAt || item.createdAt;
  if (!millis(joined) || !millis(published)) return mode !== 'custom';
  if (dateOnly(joined) || dateOnly(published)) return cairoDay(joined) <= cairoDay(now) && cairoDay(published) >= cairoDay(joined);
  return millis(joined) <= now && millis(published) >= millis(joined) - 5 * 60 * 1000;
}

// Only ordinary learning delivery ignores enrolment age. Unknown kinds retain
// the assessment policy; callers still enforce publication and academic scope.
function learningContentAccessAllowed(item, student, kind, now = Date.now()) {
  if (['materials', 'lectures', 'units', 'lecture_materials'].includes(kind)) {
    return item.hidden !== true && !['archived', 'unpublished', 'مؤرشف', 'غير منشور'].includes(String(item.status || '').trim().toLowerCase());
  }
  return reusableContentAccessAllowed(item, student, now);
}

module.exports = { reusableLearningContentIsVisible, reusableContentAccessAllowed, learningContentAccessAllowed };
