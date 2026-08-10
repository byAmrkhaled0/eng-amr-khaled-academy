'use strict';

function scheduledTimeMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (value instanceof Date) return Number(value.getTime()) || 0;
  const raw=String(value).trim();
  // datetime-local has no timezone. Historic admin releases stored this raw
  // value, so parsing it as UTC shifted every Egypt schedule by 2/3 hours in
  // Cloud Functions. Interpret only timezone-less values as Africa/Cairo;
  // modern records are ISO strings with Z and remain unambiguous.
  const local=raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if(local){
    const desired=Date.UTC(Number(local[1]),Number(local[2])-1,Number(local[3]),Number(local[4]),Number(local[5]),Number(local[6]||0));
    const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    let guess=desired;
    for(let attempt=0;attempt<3;attempt+=1){
      const parts=Object.fromEntries(formatter.formatToParts(new Date(guess)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
      const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
      const adjustment=desired-represented;if(!adjustment)break;guess+=adjustment;
    }
    return guess;
  }
  const millis = Date.parse(raw);
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
