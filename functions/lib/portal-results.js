'use strict';

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function scorePercent(score, maxScore) {
  const maximum = number(maxScore, 0);
  const earned = number(score, 0);
  if (maximum <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((earned / maximum) * 10000) / 100));
}

function resultDate(row = {}) {
  return String(row.submittedAt || row.reviewedAt || row.date || row.createdAt || row.updatedAt || '');
}

function normalizedTitle(row = {}) {
  return String(row.activityName || row.examTitle || row.exam || row.homeworkTitle || row.title || 'نشاط')
    .trim().toLocaleLowerCase('ar').replace(/\s+/g, ' ');
}

function dedupeKey(result = {}) {
  const activityId = String(result.activityId || '').trim();
  if (activityId) return `${result.type}:${activityId}:${String(result.attemptNumber || 1)}`;
  return [result.type, normalizedTitle(result), String(result.date || '').slice(0, 10), result.score, result.maxScore].join('|');
}

function normalizeResult(row = {}, type = 'manual', source = 'grades') {
  const score = row.score === null || row.score === undefined || row.score === '' ? null : number(row.score);
  const maxScore = Math.max(0, number(row.maxScore ?? row.totalScore ?? row.outOf, 100));
  const status = score === null || row.needsManualReview === true ? 'pending' : 'graded';
  return {
    id: String(row.id || '').slice(0, 120),
    activityId: String(row.assignmentId || row.examId || row.activityId || '').slice(0, 120),
    activityName: String(row.homeworkTitle || row.examTitle || row.exam || row.title || 'نشاط').slice(0, 200),
    type,
    typeLabel: ({ exam: 'امتحان', homework: 'واجب', practical: 'عملي', manual: 'درجة يدوية' })[type] || 'درجة يدوية',
    score,
    maxScore,
    percentage: score === null ? null : scorePercent(score, maxScore),
    date: resultDate(row),
    status,
    statusLabel: status === 'graded' ? 'تم التصحيح' : 'قيد التصحيح',
    attemptNumber: Math.max(1, Math.floor(number(row.attemptNumber || row.attemptSequence, 1))),
    source
  };
}

function normalizeUnifiedResults({ grades = [], examAttempts = [], homeworks = [], practicals = [] } = {}) {
  const candidates = [];
  grades.forEach(row => {
    const inferredType = row.type === 'practical' ? 'practical'
      : row.type === 'homework' || row.assignmentId ? 'homework'
        : row.type === 'exam' || row.examId ? 'exam' : 'manual';
    candidates.push(normalizeResult(row, inferredType, 'grades'));
  });
  examAttempts.forEach(row => candidates.push(normalizeResult(row, 'exam', 'examAttempts')));
  homeworks.filter(row => row.assignmentId || row.answerType === 'multi' || row.method === 'student_assignment_answer')
    .forEach(row => candidates.push(normalizeResult(row, 'homework', 'homeworkSubmissions')));
  practicals.filter(row => row.score !== null && row.score !== undefined)
    .forEach(row => candidates.push(normalizeResult(row, 'practical', 'recitations')));

  const priority = { examAttempts: 4, homeworkSubmissions: 3, grades: 2, recitations: 1 };
  const unique = new Map();
  for (const result of candidates) {
    const key = dedupeKey(result);
    const existing = unique.get(key);
    if (!existing || priority[result.source] > priority[existing.source]) unique.set(key, result);
  }
  return [...unique.values()].sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

function homeworkMetrics(assignments = [], homeworks = []) {
  const requiredIds = new Set(assignments.filter(item => item && item.id).map(item => String(item.id)));
  const relevant = homeworks.filter(row => row && row.assignmentId && requiredIds.has(String(row.assignmentId)));
  const submittedIds = new Set(relevant.filter(row => row.completed === true || row.submittedAt).map(row => String(row.assignmentId)));
  const latestByAssignment = new Map();
  relevant.forEach(row => {
    const key = String(row.assignmentId);
    const existing = latestByAssignment.get(key);
    if (!existing || resultDate(row) >= resultDate(existing)) latestByAssignment.set(key, row);
  });
  const graded = [...latestByAssignment.values()].filter(row => row.score !== null && row.score !== undefined && number(row.maxScore, 0) > 0);
  const averageGrade = graded.length
    ? Math.round((graded.reduce((sum, row) => sum + scorePercent(row.score, row.maxScore), 0) / graded.length) * 100) / 100
    : 0;
  const lastGrade = graded.sort((a, b) => resultDate(b).localeCompare(resultDate(a)))[0] || null;
  return {
    requiredCount: requiredIds.size,
    submittedCount: submittedIds.size,
    submissionPercentage: requiredIds.size ? Math.round((submittedIds.size / requiredIds.size) * 10000) / 100 : 0,
    gradedCount: graded.length,
    averageGrade,
    lastGrade: lastGrade ? normalizeResult(lastGrade, 'homework', 'homeworkSubmissions') : null
  };
}

function configurableOverallAverage(results = [], configuredWeights = {}) {
  const defaults = { exam: 40, homework: 25, practical: 15, manual: 20 };
  const weights = { ...defaults, ...(configuredWeights || {}) };
  const graded = results.filter(result => result.status === 'graded' && result.percentage !== null);
  const typeAverages = {};
  for (const type of Object.keys(defaults)) {
    const rows = graded.filter(result => result.type === type);
    if (rows.length) typeAverages[type] = rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length;
  }
  const activeTypes = Object.keys(typeAverages);
  const activeWeight = activeTypes.reduce((sum, type) => sum + Math.max(0, number(weights[type], 0)), 0);
  const percentage = activeWeight
    ? activeTypes.reduce((sum, type) => sum + typeAverages[type] * Math.max(0, number(weights[type], 0)), 0) / activeWeight
    : 0;
  return { percentage: Math.round(percentage * 100) / 100, weights, typeAverages };
}

module.exports = {
  scorePercent,
  normalizeResult,
  normalizeUnifiedResults,
  homeworkMetrics,
  configurableOverallAverage
};
