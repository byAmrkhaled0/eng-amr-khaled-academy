'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { reusableLearningContentIsVisible, reusableContentAccessAllowed } = require('../functions/lib/content-visibility');

test('publication eligibility alone does not authorize historical content for a new student', () => {
  const oldLecture = {
    status: 'published',
    published: true,
    createdAt: '2025-01-01T00:00:00.000Z'
  };
  const newStudent = { enrolledAt: '2026-09-14T00:00:00.000Z' };

  assert.equal(reusableLearningContentIsVisible(oldLecture, newStudent), true);
  assert.equal(reusableContentAccessAllowed(oldLecture, newStudent), false);
  assert.equal(reusableContentAccessAllowed(oldLecture, {...newStudent,contentAccessMode:'full'}), true);
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

test('student resource lists combine publication and server enrolment policy; assessments retain their policy', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

  assert.equal(
    source.includes('const visible = doc => reusableLearningContentIsVisible(doc.data() || {}) && reusableContentAccessAllowed(doc.data() || {}, found.data);'),
    true
  );
  assert.equal(source.includes('assignmentsForStudent(found.data)'), true);
  assert.equal(source.includes('contentAvailableAfterStudentJoined(exam, found.data)'), true);
});

test('custom means new content plus explicitly named historical content',()=>{
  const student={studentCode:'SEC00001',contentAccessMode:'custom',createdAt:'2026-09-13'};
  assert.equal(reusableContentAccessAllowed({createdAt:'2026-09-01'},student),false);
  assert.equal(reusableContentAccessAllowed({createdAt:'2026-09-01',targetStudentCodes:['SEC00001']},student),true);
  assert.equal(reusableContentAccessAllowed({createdAt:'2026-09-14'},student),true);
});
test('date-only boundaries use Cairo calendar dates, including Cairo midnight',()=>{
  const student={createdAt:'2026-09-13'};
  assert.equal(reusableContentAccessAllowed({createdAt:'2026-09-12T21:00:00Z'},student,Date.parse('2026-09-13T12:00:00Z')),true);
  assert.equal(reusableContentAccessAllowed({createdAt:'2026-09-12T20:59:59.999Z'},student,Date.parse('2026-09-13T12:00:00Z')),false);
});
test('timestamp grace is inclusive at five minutes and excludes the preceding millisecond',()=>{
  const student={createdAt:'2026-09-13T09:00:00Z'};
  assert.equal(reusableContentAccessAllowed({createdAt:'2026-09-13T08:55:00Z'},student),true);
  assert.equal(reusableContentAccessAllowed({createdAt:'2026-09-13T08:54:59.999Z'},student),false);
});
test('legacy missing original timestamps remain accessible; editing cannot republish known old content',()=>{
  const student={createdAt:'2026-09-13'};
  assert.equal(reusableContentAccessAllowed({title:'legacy',updatedAt:'2026-09-01'},student),true);
  assert.equal(reusableContentAccessAllowed({createdAt:'2026-09-01',updatedAt:'2026-09-30'},student),false);
});
