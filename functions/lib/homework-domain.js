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

function correctAnswersMayBeRevealed(submission = {}) {
  const graded = submission.needsManualReview !== true
    && submission.score !== null
    && submission.score !== undefined;
  // V67: correction is part of completing a homework. Automatically graded
  // work is ready immediately; written/code answers wait for teacher review.
  // Legacy reveal flags are still accepted for old stored submissions, but a
  // graded answer is never kept hidden from the student who submitted it.
  return graded;
}

function publicHomeworkProjection(submission = {}, now = Date.now()) {
  const reveal = correctAnswersMayBeRevealed(submission, now);
  const answers = Array.isArray(submission.answers) ? submission.answers.slice(0, 100).map(answer => {
    const mark = number(answer.mark, 1);
    const awardedMark = answer.awardedMark !== null && answer.awardedMark !== undefined ? number(answer.awardedMark) : null;
    const isWrong = reveal && (answer.correct === false || (awardedMark !== null && awardedMark < mark));
    const projected = {
      question: String(answer.question || '').slice(0, 1500),
      type: String(answer.type || 'text').slice(0, 30),
      answer: String(answer.answer || '').slice(0, 20000),
      mark,
      awardedMark: reveal ? awardedMark : null,
      correct: reveal ? (answer.correct === true ? true : answer.correct === false ? false : null) : null
    };
    // Never disclose answer keys for questions the student solved correctly.
    // Only incorrect answers receive their model/correct answer.
    if (isWrong) projected.correctAnswer = String(answer.correctAnswer || '').slice(0, 2000);
    return projected;
  }) : [];
  const wrongAnswers = reveal ? answers.filter(answer => Object.prototype.hasOwnProperty.call(answer, 'correctAnswer')) : [];
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
    wrongAnswers,
    wrongAnswerCount: wrongAnswers.length,
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
