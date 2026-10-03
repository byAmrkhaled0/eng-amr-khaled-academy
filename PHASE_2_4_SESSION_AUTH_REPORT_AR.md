# TECHNO MINDS — PHASE 2.4
# Session fixation / authentication lifecycle / revocation / offline boundary

النتيجة: **PASS لبوابة التطبيق والاختبارات المحلية المذكورة أدناه**، مع فصل حدود Auth Emulator عن Production. البداية الوحيدة: `technominds-phase2.3-runner-security-closure.zip`، SHA256 `08c5d263c9dd540af33f1b6c947192d0a98a6251826fcfcfad03b02b9809cf59`. لا Deploy، لا Push، لا Production Data modification. لا إعادة تصميم أو تغيير grading/attendance/report business logic. كل ملفات baseline الـ308 محفوظة.

## 1. AUTH / SESSION ARCHITECTURE

Admin: Firebase email/password → ID token → admin=true + email_verified=true → users/{uid}.role=admin وactive!==false. `requireStaff` و`entry.requireAdmin` يقرآن الملف الحالي. Frontend ما زال يستخدم `getIdTokenResult(false)` دون refresh إضافي على كل نقرة. Native Auth observer الحالي باقٍ.

Portal: الكود الموحّد يفتح student أو parent، ثم الخادم يصدر `crypto.randomBytes(32).toString('base64url')`. `_portal_sessions/{SHA256(token)}` يخزن studentCode/mode/ipHash/userAgentHash/createdAt/expiresAt، بلا plaintext token. المتصفح يحفظ التوكن في sessionStorage حسب mode+code. IP/UA بيانات سياقية وليسا شرطًا لقبول التوكن.

حالة الطالب الحالية أصبحت جزءًا من كل protected portal request. القراءة الطبيعية: students/{code}. legacy document IDs: حتى3 equality queries بحد1، ثم student_portal كـfallback للحسابات القديمة التي لا تملك canonical row. وجود canonical row يمنع override من projection نشط قديم. لا global scan أو listeners جديدة.

الجرد: `reports/phase24-session-inventory.json`، والجرد النحوي لـ95 endpoint/trigger registration في `phase24-endpoint-session-inventory.json`. الجرد الكامل للـruntime aliases والتصنيفات محفوظ في `docs/PHASE2_1_AUTHORIZATION_INVENTORY.json` وتؤكد تغطيته الاختبارات الحالية.

### Findings المثبتة

| ID | CWE | Severity | Source / sink / precondition | Evidence / impact | Minimal fix / regression |
|---|---|---|---|---|---|
| SA24-01 | CWE-613 | Medium | Previously valid student bearer → saveExamProgress/submitExam after active=false/rejected | Original Phase2.3 callable actually saved a draft and returned a submitted result after rejection; no credential theft required | Central current-account check; all15 sensitive endpoints tested for deactivate/reject, including exam/upload registration |
| SA24-02 | CWE-287 / CWE-613 | Low | Prepared device with cached staff profile and private admin dataset → full offline shell | Actual original renderer accepted payments navigation and retained21 other nav links; no proof that Firebase accepted cache-only auth | Attendance-only shell, clean minimal roster data, owned live preparation + bounded profile expiry; DOM and Chromium tests |
| SA24-03 | CWE-613 | Low | Previously registered FCM token → new booking notification after staff profile revoked | Actual original delivery helper sent a synthetic token with active=false owner; FCM delivery mocked, no real notification sent | Current distinct owner profiles checked before delivery, one read per distinct owner;2 executable delivery tests |

Hardening: token shape/type, finite timestamps and maximum lifetime validation; exact-expiry rejection for offline preparation, foreign-owner queue collision rejection, expiry checks while offline screen stays open, local clear-account/logout cleanup. These are not claimed as Critical remote exploits. Password-reset UI now gives the same generic success for known and user-not-found accounts; actual Firebase backend behavior may vary by enumeration protection.

## 2. CWE-384 RESULT

**NOT EXPLOITABLE in tested paths.** The supplied portalSessionToken is ignored at login; the server generates a fresh unpredictable token. Existing token + login gives a different token. Browser fake cached token is replaced by the actual save path. Student A bearer copied under B's key does not turn into B authorization; server ownership check denies. Parent/student modes remain separate. Multiple valid sessions are intentional, not session fixation.

## 3. PORTAL TOKEN ENTROPY RESULT

1024 locally issued samples: each decodes to32 random bytes,43 base64url characters, no duplicates. The security argument is the cryptographic RNG, not a statistical claim from the sample. There is no student code/IP/timestamp/counter embedded in issuance. Only hashes are persisted. No intentional token placement in navigation URLs, activity logging or client-error reporting was found in reviewed application paths. This is not an exhaustive infrastructure logging/taint proof.

Malformed/missing/short/random/deleted-session requests deny with unauthenticated/permission-denied, without token/hash/IP/user-agent disclosure.

## 4. SESSION ROTATION POLICY

**MULTI-SESSION.** Each login creates token B distinct from A. A and B remain valid until expiry or account/code revocation. Copying a valid bearer to another IP/UA works intentionally; no IP binding or forced single-device login was added. Device transitions remain supported.

`regenerateParentAccessCode` is data repair/unification, not a new credential: the returned parentCode is the unchanged studentCode; existing activity text says إصلاح وتوحيد. Both student/parent sessions intentionally remain valid. No meaningless rotation was added.

## 5. SESSION EXPIRATION RESULT

30-minute absolute server expiry: T−1s ALLOW, exact expiry DENY, T+1s DENY. TTL deletion is not the gate. Invalid/nonfinite/extreme expiry and future createdAt fail closed. Actual issued rows may not exceed createdAt+30min; legacy session rows without createdAt are accepted only when their remaining lifetime is at most30min. Browser clock/expiresAt payload cannot extend server validity.

The client may obtain a new session using an already remembered access code. That is a new login with the stored login credential, not extension of an expired bearer; no new idle-lock product policy was introduced.

## 6. SESSION REVOCATION MATRIX

| Event | Existing session policy | Verification |
|---|---|---|
| New login | Old+new allowed until expiry | Executable Node + Emulator |
| Code migration | Old student/parent authorization DENY | Actual migration, >50 issued sessions tested |
| Student active=false / rejected / pending protected access | Immediate DENY at next protected request |15 endpoints; real booking rejection |
| Deleted session / expiry | DENY | Executable tests |
| Unified-code repair | Sessions remain; credential unchanged | Actual callable |
| Admin role changed / active=false | Protected call DENY despite stale admin claim | Emulator + existing386 admin cases |
| Admin claim removal only | Stale issued token can retain old claim until refresh | Real SDK + Auth Emulator; Production timing NOT VERIFIED |
| Local resource clear-account | Current student bearer removed locally; copied bearer stays short-lived | Actual action test; no new server logout endpoint |
| Fully offline admin revocation | Cannot be learned while disconnected; only existing prepared attendance allowed | Chromium / owner / expiry tests |

No global session deletion/query loop was added. Migration's existing limit50 deletion remains, but leftover old-code sessions are unusable because current canonical/projection identity no longer exists. Session rows may remain until TTL/cleanup; this is not continued authorization. No scheduled cleanup/TTL configuration was modified or inspected in Production.

## 7. STUDENT DEACTIVATION RESULT

active=false and approvalStatus=rejected deny getStudentResources, getStudentCurriculum, getLectureContent, getCurriculumFileUrl, recordLectureProgress, submitAssignmentAnswer, prepareHomeworkUpload, registerHomeworkSubmission, getExamDashboard, startExam, saveExamProgress, submitExam, getStudentLeaderboardPosition, createStudentTransferRequest and getParentMonthlyReport. Real rejectBooking workflow is also exercised.

No accidental continuity exemption for a started exam. Already submitted results are not deleted or rescored. A revoked account cannot retrieve them through protected endpoints. Pending-registration profile UX remains; a pending account cannot use approved-only protected access. Re-enabling an account can restore still-unexpired sessions under the existing multi-session model; no new security-reset epoch was introduced.

## 8. CODE MIGRATION RESULT

Original migration runs transactionally and deletes up to50 matching session records. The new central identity check closes authority for every old session, including records beyond that deletion bound. Both modes and old login deny; new code login allows. Existing migration-size fail-closed policy is unchanged. Legacy canonical IDs and stale projections are explicitly tested; active legacy account still works.

## 9. ADMIN FIREBASE AUTH LIFECYCLE

No Firebase architecture rewrite. Existing matrix386 cases remains green: anonymous, authenticated without claim, unverified, wrong role, inactive, valid verified active admin. Owner bootstrap still refuses to restore revoked profiles. Cache/sessionStorage does not authenticate Functions or direct Firestore access.

When the existing auth observer reports null while online, the workspace is cleared and reloaded to login. This also handles another tab's signOut. Offline restoration is considered separately and requires a valid prepared capability.

## 10. STALE TOKEN RESULT

Immediate server revocation uses users/{uid}.active=false or role!=admin, checked on each protected staff call. Removing a custom claim alone does not retroactively change an already issued JWT; the real SDK test observed admin=true on the cached token and its removal after forced refresh. No claim of instant claim-only revocation.

Auth Emulator lifecycle exercised revokeRefreshTokens, password update and disabled user. It rejected refresh and Admin verification; even verification without explicit checkRevoked rejected old tokens in this emulator. This stricter emulator result **must not be projected onto Production**. Evidence: `reports/phase24-auth-emulator-lifecycle.json`.

Operationally, profile revocation must accompany immediate application-access revocation. No custom JWT system or per-click Firebase token refresh was added.

## 11. PASSWORD RESET RESULT

Managed sendPasswordResetEmail remains. Known/unknown UI messages are identical for user-not-found. Network failures remain distinguishable as temporary failures. No reset path writes role or claims; non-admin remains blocked. The existing owner-bootstrap tests prove revoked profile cannot be restored by the activation callable.

Actual password **change** and refresh lifecycle was exercised in Auth Emulator. Full reset-email delivery/link consumption against Production, email enumeration protection configuration and Production revocation timing: **NOT VERIFIED**. No email was sent to a real person.

## 12. LOGOUT RESULT

Actual adminLogout unregisters current push token, signs out, clears offline-profile and private staff session cache, stops existing listeners and reloads. Unsynced queue remains; roster is retained when current owner has pending events. Failed signOut does not pretend success. Same original UID can recover pending queue; different UID cannot sync it or obtain a foreign queued row through enqueue.

Real Firebase SDK10.12.5 LOCAL persistence with Auth Emulator propagated logout to a second Chromium tab. Back and refresh did not restore workspace. A local transport bridge relayed browser Auth requests only to the real disposable localhost emulator because direct browser transport failed in this environment; Auth responses were not fabricated.

Resource “تغيير الطالب” removes only that student's application-owned bearer, clears rendered content/profile and keeps independent parent token/drafts. There is no new full portal logout UI or server logout endpoint. A previously copied bearer remains valid until expiry/revocation.

## 13. OFFLINE ADMIN SECURITY RESULT

Offline profile is a cache hint, never general Firebase authorization. Restored shell contains prepared attendance plus logout, with no payments/reports/correction/bookings/backup/settings/motivation/content/student-deletion navigation. Existing wrapper paths for errors/schedules cannot bypass the base guard. Full cached adminData is discarded; only whitelisted prepared student fields are copied.

Profile expiry is bounded by owned valid preparation(s), replacing standalone30-day authorization. Existing preparation server lifetime21days and attendance date/schedule policy remain unchanged. No valid preparation, expired profile/preparation, wrong current Firebase UID or foreign owner deny restoration. Expiry while open hides roster and blocks new UI mutations. Enqueue/finalize reject exact expiry and malformed expiry.

Foreign queue collision returns a review error rather than another owner's record. Queue counts/projection/sync are owner scoped. Foreign pending rows are retained, not overwritten or deleted. No parallel attendance system was introduced. Server sync still requires current verified active Firebase admin and server-owned preparation.

Fully offline remote revocation is impossible. This is a limited prepared capability, not encrypted/tamper-proof against a local origin compromise. Production permission cannot be granted by editing localStorage/IndexedDB.

## 14. PORTAL BRUTE-FORCE RESULT

Eight-digit generated access codes use crypto.randomInt with first digit1..9:90million possibilities, approximately26.42bits; legacy/manual codes remain supported. They are **login secrets**, not equivalent to passwords or256-bit bearer tokens.

Existing per-code limit20/minute **per mode** is verified. Shared network limiter uses32 identity-selected shards,94/minute each for current3000 budget, aggregate upper bound3008/mode/minute. Rotating95 codes in one shard with spoofed XFF hits the94 ceiling. Client-controlled identity cannot bypass that shard. Default IP uses socket peer; unknown collapses to shared unknown bucket; trusted proxy hops are opt-in.

Residual risk: rotating/distributed guesses, weak manually chosen legacy codes and the generous shared ceiling remain. No claim of password-grade resistance or brute-force infeasibility. No real account guessing was attempted. No global code-length change, new login product or aggressive school-wide blocking was introduced. Production ingress/trusted-hop and live traffic behavior are NOT VERIFIED.

## 15. EXAM / HOMEWORK SECONDARY-TOKEN RESULT

Live exam sessionId + expired/wrong-mode/wrong-student portal bearer DENY save/submit. Existing submitted-attempt idempotency remains green. Live uploadId/grant/path cannot authenticate final registration without current portal authorization. Phase2.1 accepted-object immutability tests remain green.

Anonymous upload grant can authorize its narrow staging upload until expiry/consumption under existing rules; it is not general portal login. Account revocation gates final registration. No storage MIME expansion or Rules relaxation.

## 16. STORAGE TOKEN INVENTORY

Machine-readable inventory: `reports/phase24-session-inventory.json`.

| Entry | Storage | Classification |
|---|---|---|
| portal bearer, mode+code | sessionStorage | BEARER TOKEN |
| remembered student/exam code | sessionStorage | LOGIN SECRET / identifier |
| Firebase ID/refresh token | SDK-managed persistence | SECRET |
| offline staff profile | localStorage | CACHE / capability hint |
| attendance preparations/queue/roster | IndexedDB | Scoped prepared capability + sensitive cache |
| staff admin dataset | sessionStorage | PRIVATE CACHE; cleared on logout |
| exam draft | sessionStorage, exam+student | Sensitive answers, not authentication |
| homework draft | localStorage, assignment+student | Sensitive answers, not authentication |
| FCM token | localStorage/server-owned record | Push delivery identifier, not session auth |
| Judge0 resultToken | transient runner response | Scoped bearer capability; Phase2.3 unchanged |

No bearer in URL navigation found. Legacy access-code query support remains and successful login clears it from history; initial legacy URL may still exist in infrastructure history/logs. No new token cookie/localStorage persistence was added. Existing drafts are not deleted merely for being local.

## 17. FILES CHANGED

Exact list/hash proof: `reports/phase24-file-audit.json`.

- functions/index.js: only requirePortalSession and notifyStaffAboutBooking function bodies changed. Every other server function, including Runner/attendance/exam/homework/report logic, is identical.
- assets/admin.js: scoped offline shell/capability, cache expiry/owner, rendering/mutation expiry guard, logout cleanup/reconnect reauthorization.
- assets/admin-entry.js: logout observer cleanup, cached-role validation, deterministic offline restoration, generic reset unknown-user response.
- assets/firebase-sync.js: narrow local clearPortalSession API; getIdTokenResult(false) unchanged.
- assets/app.js: existing changeResourceStudent clears its bearer and rendered content, keeps drafts.
- assets/offline-attendance.js: finite exact-expiry guard; foreign queue collision protection; owner-scoped counts/finalization.
- assets/v53-upgrades.js: offline render guard before errors/schedules wrapper dispatch.
- HTML references: only revisions for modified assets; no UI/content redesign. All original125 handlers retained,127 actions checked.
- package.json/run-reliability-integration: new suites added, no dependency/lockfile changes.
- security-emulator/question-banks/stabilization fixtures: real43-char token/30min lifetime and real staff role/context; assertions kept.

Rules, indexes, Firebase configuration, entry.js, CodeRunner client/policy, service-worker, CSP, build scripts and lockfiles unchanged. Temporary regenerated Phase2.3 execution inventory is restored to its archival baseline bytes after tests.

## 18. NEW TESTS

- session-auth.security.test.js:44 executed cases, including1024 issuance sample, expiry/mode/ownership/revocation/legacy, actual offline DOM, logout/reset/switch/push delivery.
- session-auth.security.integration.test.js:55 cases against real Firestore/Storage Emulator, real callable `.run`,15 endpoint revocation matrix, migration>50, legacy ID, real rejectBooking, direct session Rules, limiter and push ownership.
- session-auth-browser.security.js:5 real Chromium cases; sessionStorage/key separation, opener clone, fresh tab/context, actual offline shell/IndexedDB expiry/foreign owner.
- session-auth-emulator.browser.js:3 real SDK/Auth Emulator cases; multi-tab logout/back/refresh, stale claim refresh, revoke/password-change/disable observations.
- session-auth-baseline.reproduce.js: optional original Phase2.3 reproduction against disposable emulators; requires extracted baseline root.
- testing/session-auth-emulator.config.json: local Auth-only config, not deployment config.

No student code executed in a server VM/shell. Test VM executes application helpers only. New auth suites do not invoke real Production endpoints.

## 19. EXACT PASS / FAIL COUNTS

| Command / suite | PASS | FAIL |
|---|---:|---:|
| npm test |479|0|
| node scripts/run-node-regression.js |549|0|
| npm run test:review:integration |517|0|
| npm run test:rules |14|0|
| session-auth.security.test.js |44|0|
| session-auth.security.integration.test.js |55|0|
| Chromium XSS + Runner + Session |27|0|
| Chromium + Auth Emulator |3|0|
| Existing Runner security |89|0|
| Existing XSS DOM |26|0|
| Existing attendance date boundary |5|0|

These overlap: **do not sum**. npm435+44; Node505+44; integration462+55; browser22+5 plus3 Auth Emulator. No skipped/cancelled tests in final TAP suites. Static verification16 pages /125 original handlers /127 checked /0missing. Build was executed indirectly by existing manifest test; generated dist excluded from delivery.

Runtime: Node22.23.3/npm10.9.9, Temurin Java21.0.12.1+1, firebase-tools15.29.0, Firestore Emulator1.22.0, Storage runtime1.1.3, Chromium154.0.8037.92, browser Firebase SDK10.12.5. No dependencies added. Exact count receipts/log hashes in `reports/phase24-test-results.json`.

Initial failures were investigated, not suppressed: old48-char/hour fixture, isolated logout test missing currentStaff, JSDOM form named-property setup, browser-to-local-Auth transport, and emulator's stricter revocation semantics. Final tests execute corrected realistic fixtures and assert application invariants. Full Production revocation is still not claimed.

Commands from project root, with Node22 PATH and Java21 JAVA_HOME:

```bash
node scripts/verify.js
npm test
node scripts/run-node-regression.js
npm run test:rules
npm run test:review:integration
node --test scripts/session-auth.security.test.js
node --test scripts/scheduled-attendance-v7005.test.js
node --test scripts/xss-dom.security.test.js
node --test scripts/code-runner.security.test.js
```

Chromium uses external tooling, no new project dependency:

```bash
TM_PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core \
TM_CHROMIUM_EXECUTABLE=/workspace/scratch/04ca74de8b8d/tooling/chrome-headless-shell-linux64/chrome-headless-shell \
node --test scripts/xss-browser.security.js scripts/code-runner-browser.security.js scripts/session-auth-browser.security.js
```

For Auth test, prepare the exact official app/auth compat10.12.5 scripts in an external tooling directory and set TM_FIREBASE_BROWSER_DIR; then:

```bash
firebase emulators:exec --project demo-technominds \
  --config scripts/testing/session-auth-emulator.config.json --only auth \
  "node --test scripts/session-auth-emulator.browser.js"
```

Actual runs unset HTTP_PROXY/HTTPS_PROXY/ALL_PROXY and lowercase counterparts for localhost communication. Emulator tests are guarded to demo-technominds/localhost. No Firebase Functions HTTP emulator or Production login was used; callable tests use real handler `.run` with synthetic identity.

## 20. REAL CHROMIUM RESULT

27/27 existing+new suites,3/3 Auth Emulator. Fresh independent tab/context does not inherit portal sessionStorage. A window opened **with an opener** clones initial sessionStorage in Chromium: verified and explicitly documented, not falsely described as universal isolation. Cloned token retains its original student/mode scope and short expiry. Server mode/ownership checks still gate access.

Firebase LOCAL persistence signOut propagated across tabs; back/refresh did not authenticate cache. Offline restore and IndexedDB boundary use actual source renderers/modules. Safari/Android/WebView equivalence NOT VERIFIED.

## 21. NOT VERIFIED ITEMS

- Production refresh-token revocation timing, disabled-user/claim-removal propagation and managed reset-email consumption; emulator is not faithful proof of every timing detail.
- Production ingress/trusted proxy hops, logging/analytics capture, session TTL configuration.
- Real FCM device delivery/OS notification dismissal. Owner check unit uses mocked FCM, registration/unregistration uses Emulator.
- Full Functions HTTP transport/real Production authentication journey; current integration invokes callable handlers.
- Perfect remote revocation on a fully disconnected device; impossible by design.
- Other browsers, distributed abuse resistance and physical-device storage encryption.
- Provider sandbox items left NOT VERIFIED in Phase2.3 were not reopened or recertified here.

## 22. REMAINING RISKS

Access code is the login secret;8digit/manual legacy codes remain weaker than passwords. A stolen valid portal bearer can replay within its original scope until expiry/account revocation; multi-device support remains intentional. Re-enabled accounts can reuse an unexpired bearer. Projection-only legacy accounts retain their old compatibility authority; removing them is a separate migration decision.

An offline local-origin compromise can edit local cache; it cannot make server Functions authenticate it. Offline queue/prepared roster persists deliberately for the original UID. Profile checks prevent new server access once revoked; data already cached on an unlocked device cannot be remotely erased while disconnected.

Immediate staff revocation requires current profile active=false/role removal; claim-only revocation has the managed token lifecycle. Per-request portal state check adds one normal document read (legacy resolution up to5 total account reads); push adds one read per distinct recipient owner per booking, not per device. No listeners/polling or new historical scans. No sustained traffic cost benchmark claimed.

Primary references reviewed: [Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions), [custom claims lifecycle](https://firebase.google.com/docs/auth/admin/custom-claims), [Auth Emulator limits](https://firebase.google.com/docs/emulator-suite/connect_auth). Firebase's documented ID/refresh-token lifecycle is distinguished from the stricter observed local emulator behavior.

## 23. CLEAN UPDATED ZIP

`technominds-phase2.4-session-auth-security-closure.zip`: complete source under technominds-phase2.4/, this report, executable tests and evidence/inventories. Baseline files preserved; no node_modules/dist/.firebase/tooling downloads/npm-debug logs/temporary test directories. Build architecture untouched. No Deploy, Push or Production changes. No SQL/Buffer Overflow/CSP/Runner rewrite phase started.
