'use strict';

const TRACKS = Object.freeze([
  'تانية ثانوي بكالوريا',
  'تانية ثانوي عام',
  'مبتدئين برمجة',
  'أساسيات Python',
  'تطبيقات ومراجعة'
]);

const ATTENDANCE = new Set(['حاضر', 'غائب', 'متأخر', 'بعذر']);
const BOOKING_STATUS = new Set(['pending', 'approved', 'rejected']);
const ALLOWED_HOMEWORK_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/x-python',
  'text/javascript',
  'application/javascript',
  'application/json',
  'text/x-c',
  'text/x-c++src',
  'text/x-java-source'
]);

function text(value, max = 200, required = false) {
  const result = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (required && !result) throw new Error('required');
  if (result.length > max) throw new Error('too-long');
  return result;
}

function phone(value) {
  const result = String(value ?? '').replace(/[^0-9+]/g, '');
  if (!/^\+?[0-9]{8,15}$/.test(result)) throw new Error('invalid-phone');
  return result;
}

function studentCode(value) {
  const result = String(value ?? '').trim();
  if (!/^[1-9][0-9]{7}$/.test(result)) throw new Error('invalid-code');
  return result;
}

function legacyCode(value) {
  const result = text(value, 40, true);
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(result)) throw new Error('invalid-code');
  return result;
}

function identifier(value, max = 100) {
  const result = text(value, max, true);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new Error('invalid-id');
  return result;
}

function boolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function number(value, min, max, fallback = 0) {
  const result = value === '' || value === null || value === undefined ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new Error('invalid-number');
  return result;
}

function isoDate(value) {
  const result = text(value, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw new Error('invalid-date');
  }
  return result;
}

function normalizeTrack(value) {
  return text(value, 80, true);
}

function url(value, required = false) {
  const result = text(value, 1000, required);
  if (!result) return '';
  let parsed;
  try { parsed = new URL(result); } catch (_) { throw new Error('invalid-url'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('invalid-url');
  return parsed.toString();
}

function fileName(value) {
  const result = text(value, 120, true).replace(/[\\/]+/g, '-');
  if (!result || result.startsWith('.')) throw new Error('invalid-file');
  return result;
}

function validateHomeworkFile({ name, contentType, size }) {
  const cleanName = fileName(name);
  const cleanType = text(contentType, 100, true).toLowerCase();
  const cleanSize = number(size, 1, 10 * 1024 * 1024);
  const extension = cleanName.toLowerCase().split('.').pop();
  const allowedExtension = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'txt', 'py', 'js', 'ts', 'c', 'cpp', 'cc', 'h', 'hpp', 'java', 'cs', 'go', 'rs', 'php', 'rb', 'kt', 'kts', 'swift', 'sh', 'sql', 'json'].includes(extension);
  if (!ALLOWED_HOMEWORK_MIME.has(cleanType) && !allowedExtension) throw new Error('invalid-file-type');
  return { name: cleanName, contentType: cleanType, size: cleanSize, extension };
}

function safeJson(value, maxBytes = 64 * 1024) {
  const encoded = JSON.stringify(value ?? null);
  if (Buffer.byteLength(encoded, 'utf8') > maxBytes) throw new Error('payload-too-large');
  return JSON.parse(encoded);
}

module.exports = {
  TRACKS,
  ATTENDANCE,
  BOOKING_STATUS,
  ALLOWED_HOMEWORK_MIME,
  text,
  phone,
  studentCode,
  legacyCode,
  identifier,
  boolean,
  number,
  isoDate,
  normalizeTrack,
  url,
  fileName,
  validateHomeworkFile,
  safeJson
};
