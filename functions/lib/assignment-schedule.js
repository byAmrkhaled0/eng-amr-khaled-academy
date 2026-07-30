'use strict';

function scheduledTimeMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (value instanceof Date) return Number(value.getTime()) || 0;
  const millis = Date.parse(String(value));
  return Number.isFinite(millis) ? millis : 0;
}

function assignmentIsReleased(assignment, now = Date.now()) {
  if (!assignment || assignment.active === false || assignment.published === false || assignment.status === 'مسودة') return false;
  const publishAt = scheduledTimeMillis(assignment.publishAt);
  return publishAt === 0 || publishAt <= Number(now);
}

function assignmentDueDatePassed(assignment, todayKey) {
  const dueDate = String(assignment?.dueDate || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && String(todayKey || '') > dueDate;
}

module.exports = { scheduledTimeMillis, assignmentIsReleased, assignmentDueDatePassed };
