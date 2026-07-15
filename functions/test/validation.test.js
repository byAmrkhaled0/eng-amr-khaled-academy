'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../src/validation');

test('student code is exactly eight digits and never starts with zero', () => {
  assert.equal(v.studentCode('12345678'), '12345678');
  assert.throws(() => v.studentCode('02345678'));
  assert.throws(() => v.studentCode('ST-1234'));
});

test('phone normalization rejects short and malformed values', () => {
  assert.equal(v.phone('010 1234 5678'), '01012345678');
  assert.throws(() => v.phone('123'));
});

test('homework validation allows expected learning file formats', () => {
  assert.equal(v.validateHomeworkFile({ name: 'answer.py', contentType: 'text/x-python', size: 120 }).extension, 'py');
  assert.throws(() => v.validateHomeworkFile({ name: 'payload.exe', contentType: 'application/octet-stream', size: 120 }));
  assert.throws(() => v.validateHomeworkFile({ name: 'large.pdf', contentType: 'application/pdf', size: 11 * 1024 * 1024 }));
});

test('only http and https links are accepted', () => {
  assert.equal(v.url('https://example.com/lesson').startsWith('https://'), true);
  assert.throws(() => v.url('javascript:alert(1)'));
  assert.throws(() => v.url('not-a-url'));
});

test('oversized structured payloads are rejected', () => {
  assert.throws(() => v.safeJson({ value: 'x'.repeat(2000) }, 100));
});
