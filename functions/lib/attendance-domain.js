'use strict';

const WEEKDAY_AR_BY_EN = Object.freeze({
  Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء',
  Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت'
});

function configuredScheduleDays(value) {
  const source = (Array.isArray(value) ? value.join('،') : String(value || '')).toLowerCase();
  const aliases = {
    'الأحد': ['الأحد','الاحد','حد','sunday','sun'],
    'الاثنين': ['الاثنين','الإثنين','الاتنين','الإتنين','monday','mon'],
    'الثلاثاء': ['الثلاثاء','الثلاثا','التلات','التلاتاء','tuesday','tue'],
    'الأربعاء': ['الأربعاء','الاربعاء','الأربع','الاربع','wednesday','wed'],
    'الخميس': ['الخميس','thursday','thu'],
    'الجمعة': ['الجمعة','الجمعه','friday','fri'],
    'السبت': ['السبت','saturday','sat']
  };
  return Object.entries(aliases).filter(([,names])=>names.some(name=>source.includes(name))).map(([day])=>day);
}

function cairoWeekdayForDate(date) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) return '';
  const english = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Africa/Cairo' }).format(parsed);
  return WEEKDAY_AR_BY_EN[english] || '';
}

function attendanceDayDecision(scheduleDays, date) {
  const days = configuredScheduleDays(scheduleDays);
  if (!days.length) return { allowed: false, reason: 'missing-schedule', days, weekday: cairoWeekdayForDate(date) };
  const weekday = cairoWeekdayForDate(date);
  return { allowed: days.includes(weekday), reason: days.includes(weekday) ? '' : 'outside-schedule', days, weekday };
}

function attendanceDateInWindow(date, now = new Date(), days = 7) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return false;
  const stamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date) return false;
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
  return Math.abs(stamp - Date.parse(`${today}T00:00:00Z`)) <= days * 86400000;
}

module.exports = { attendanceDateInWindow, WEEKDAY_AR_BY_EN, configuredScheduleDays, cairoWeekdayForDate, attendanceDayDecision };
