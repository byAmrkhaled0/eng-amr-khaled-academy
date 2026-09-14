'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { reusableLearningContentIsVisible } = require('../functions/lib/content-visibility');

test('published reusable lectures stay visible regardless of enrolment timestamps', () => {
  const oldLecture = {
    status: 'published',
    published: true,
    createdAt: '2025-01-01T00:00:00.000Z'
  };
  const newStudent = { enrolledAt: '2026-09-14T00:00:00.000Z' };

  assert.equal(reusableLearningContentIsVisible(oldLecture, newStudent), true);
  assert.equal(reusableLearningContentIsVisible({ title: 'legacy published material' }), true);
});

test('draft, hidden, archived and explicitly unpublished resources stay hidden', () => {
  for (const item of [
    { status: 'draft' },
    { status: 'hidden' },
    { status: 'مسودة' },
    { status: 'مخفي' },
    { archived: true },
    { active: false },
    { published: false }
  ]) {
    assert.equal(reusableLearningContentIsVisible(item), false);
  }
});

test('student resources use reusable visibility while assessments keep from-joining policy', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

  assert.equal(
    source.includes('const visible = doc => reusableLearningContentIsVisible(doc.data() || {});'),
    true
  );
  assert.equal(source.includes('assignmentsForStudent(found.data)'), true);
  assert.equal(source.includes('contentAvailableAfterStudentJoined(exam, found.data)'), true);
});
