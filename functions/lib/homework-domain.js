'use strict';

const crypto = require('crypto');

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function homeworkLockId(assignmentId, studentCode) {
  return crypto.createHash('sha256').update(`${assignmentId}|${studentCode}`).digest('hex').slice(0, 48);
}

function submissionIdForAttempt(lockId, attemptNumber) {
  return Number(attemptNumber) === 1 ? lockId : `${lockId}_attempt_${Number(attemptNumber)}`;
}

function decideHomeworkAttempt({ lock = null, legacySubmissionExists = false, grant = null } = {}) {
  const submittedAttempts = Math.max(
    legacySubmissionExists ? 1 : 0,
    Math.floor(number(lock?.submittedAttempts, 0))
  );
  const requestedAttempt = submittedAttempts + 1;
  if (requestedAttempt === 1) return { allowed: true, attemptNumber: 1, grantId: '' };

  const grantAttempt = Math.floor(number(grant?.attemptNumber, 0));
  const grantAvailable = grant
    && grant.status === 'open'
    && grantAttempt === requestedAttempt
    && !grant.usedAt;
  if (!grantAvailable) {
    return { allowed: false, attemptNumber: requestedAttempt, reason: 'already-submitted' };
  }
  return { allowed: true, attemptNumber: requestedAttempt, grantId: String(grant.id || '') };
}

function correctAnswersMayBeRevealed(submission = {}, now = Date.now()) {
  const graded = submission.needsManualReview !== true
    && submission.score !== null
    && submission.score !== undefined;
  if (submission.revealCorrectAnswersAfterGrading === true && graded) return true;
  if (submission.revealCorrectAnswersAfterClose !== true) return false;
  const closeValue = submission.assignmentSnapshot?.closeAt
    || submission.assignmentSnapshot?.dueAt
    || submission.assignmentSnapshot?.dueDate
    || submission.dueDate;
  const closeText = String(closeValue || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(closeText)) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit' })
      .formatToParts(new Date(now));
    const current = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${current.year}-${current.month}-${current.day}` > closeText;
  }
  const closeMillis = Date.parse(closeText);
  return Number.isFinite(closeMillis) && now > closeMillis;
}

function publicHomeworkProjection(submission = {}, now = Date.now()) {
  const reveal = correctAnswersMayBeRevealed(submission, now);
  const answers = Array.isArray(submission.answers) ? submission.answers.slice(0, 100).map(answer => {
    const projected = {
      question: String(answer.question || '').slice(0, 1500),
      type: String(answer.type || 'text').slice(0, 30),
      answer: String(answer.answer || '').slice(0, 20000),
      mark: number(answer.mark, 1),
      awardedMark: reveal && answer.awardedMark !== null && answer.awardedMark !== undefined ? number(answer.awardedMark) : null,
      correct: reveal ? (answer.correct === true ? true : answer.correct === false ? false : null) : null
    };
    if (reveal) projected.correctAnswer = String(answer.correctAnswer || '').slice(0, 2000);
    return projected;
  }) : [];
  return {
    id: String(submission.id || '').slice(0, 120),
    assignmentId: String(submission.assignmentId || '').slice(0, 120),
    homeworkTitle: String(submission.homeworkTitle || submission.title || 'واجب').slice(0, 200),
    title: String(submission.homeworkTitle || submission.title || 'واجب').slice(0, 200),
    type: 'homework',
    answerType: String(submission.answerType || '').slice(0, 30),
    score: submission.score === null || submission.score === undefined ? null : number(submission.score),
    autoScore: submission.autoScore === null || submission.autoScore === undefined ? null : number(submission.autoScore),
    maxScore: Math.max(0, number(submission.maxScore, 0)),
    needsManualReview: submission.needsManualReview === true,
    status: String(submission.status || '').slice(0, 100),
    completed: submission.completed === true,
    approved: submission.approved === true,
    attemptNumber: Math.max(1, Math.floor(number(submission.attemptNumber, 1))),
    submittedAt: String(submission.submittedAt || '').slice(0, 60),
    reviewedAt: String(submission.reviewedAt?.toDate?.()?.toISOString?.() || submission.reviewedAt || '').slice(0, 60),
    answers,
    answersRevealed: reveal
  };
}

module.exports = {
  homeworkLockId,
  submissionIdForAttempt,
  decideHomeworkAttempt,
  correctAnswersMayBeRevealed,
  publicHomeworkProjection
};
