'use strict';

const WEEKDAY_AR_BY_EN = Object.freeze({
  Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء',
  Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت'
});

function configuredScheduleDays(value) {
  const source = Array.isArray(value) ? value.join('،') : String(value || '');
  return [...new Set(Object.values(WEEKDAY_AR_BY_EN).filter(day => source.includes(day)))];
}

function cairoWeekdayForDate(date) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  const english = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Africa/Cairo' }).format(parsed);
  return WEEKDAY_AR_BY_EN[english] || '';
}

function attendanceDayDecision(scheduleDays, date) {
  const days = configuredScheduleDays(scheduleDays);
  if (!days.length) return { allowed: false, reason: 'missing-schedule', days, weekday: cairoWeekdayForDate(date) };
  const weekday = cairoWeekdayForDate(date);
  return { allowed: days.includes(weekday), reason: days.includes(weekday) ? '' : 'outside-schedule', days, weekday };
}

module.exports = { WEEKDAY_AR_BY_EN, configuredScheduleDays, cairoWeekdayForDate, attendanceDayDecision };
