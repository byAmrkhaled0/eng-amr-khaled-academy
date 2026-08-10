# Changelog

## 63.0.0 — 2026-08-10

### Security

- Locked homework submissions server-side with Firestore transactions and immutable attempts.
- Added audited, single-use homework retake grants for teachers/admins.
- Removed answer keys and correction internals from student/parent API projections.
- Added short-lived portal sessions and separated portal access from attendance QR codes.
- Restricted public writes, assistant-sensitive updates, attendance writes, and student file access in Firebase Rules.
- Tightened CSP script policy and prevented the service worker from caching access-code URLs.

### Academic workflows

- Added assignment/exam version snapshots so edits do not corrupt prior attempts.
- Added soft archive and safe storage-cleanup workflow for assessments and materials.
- Unified exam, homework, practical, and manual results with source normalization and deduplication.
- Corrected score percentages, parent reports, latest homework score, homework average, and configurable overall weighting.
- Separated homework submission compliance from homework grade average.
- Added precise assignment lifecycle categories and lazy card rendering.
- Reset exam create/edit state safely to prevent accidental overwrites.

### Attendance and performance

- Supported groups with one or more weekly days using Africa/Cairo dates.
- Added callable batch attendance and a single leaderboard invalidation per operation.
- Added ordered cursor pagination, bounded admin queries, lazy transfer loading, and enrolled-count transactions.
- Removed incomplete leaderboard sampling and repeated portal migration writes.

### UI/UX and quality

- Added compact mobile navigation, three primary KPIs, unified design tokens, RTL/dark-mode refinements, accessible dialogs, labels, focus trapping, Escape handling, and repeat-submit prevention.
- Added 14 behavioral V63 tests; complete suite now contains 54 passing tests.
- Updated platform, functions, assets, cache, and distribution version to `63.0.0`.

