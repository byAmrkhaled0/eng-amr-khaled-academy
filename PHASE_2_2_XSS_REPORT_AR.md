# TECHNO MINDS — PHASE 2.2
## XSS + HTML Injection + DOM Trust Boundaries + URL Sinks

التاريخ: 2026-10-02. النتيجة: **PASS لبوابة التحقق المحلية المحددة لهذه المرحلة**، بالحدود الموضحة أدناه. البداية حصريًا من `technominds-phase2.1-security-closure.zip`، SHA-256:
`056f55b11959db2419488c4dd30acb92b1ab143046a8eb17324ef5e9bd7a365e`.

لم يحدث Deploy أو Push أو تعديل Production Data. لم تُضف Features أو Dependencies، ولم يُعد تصميم الواجهة. بقيت قواعد Firebase وملفات Functions ومنطق الحضور والامتحانات والواجبات والتقرير دون تعديل؛ التغييرات في حدود العرض والأفعال الديناميكية واختبارها. نُفّذ build بصورة غير مباشرة ضمن الاختبارات، وأُزيل ناتجه `dist/` من حزمة المصدر.

## 1. XSS SINK INVENTORY SUMMARY

الجرد التفصيلي القابل للقراءة الآلية: `reports/phase22-xss-sink-inventory.json`. لكل مدخل موقعه ووظيفته ونوع sink ومصدره وحدود الثقة ووسيلة encoding والسياق والحكم وسبب الحكم والإصلاح/التحقق. شمل تحليل AST والقوالب والـHTML الثابت والselectors وURL sinks؛ الأعداد التالية **مدخلات جرد**، وليست عدد ثغرات مستقلة.

| النسخة | مدخلات | NO | YES | NEEDS TEST |
|---|---:|---:|---:|---:|
| Baseline | 1370 | 1193 | 129 | 48 |
| النهائية | 1241 | 1231 | 0 | 10 |

الأعداد الفعلية في Application JS: 169 تعيين `innerHTML`، و47 `insertAdjacentHTML`، واستخدامان لـ`document.write`، وتعيين `outerHTML` واحد. تختلف عن التقريب الوارد في التكليف لأن المصدر الفعلي وحدود العد مختلفة. الـ129 YES الأصلية هي 128 سياق interpolation في handlers ومركّب `setAttribute` واحد؛ لا تعني 129 استغلالًا مستقلًا مثبتًا. المتبقي NEEDS TEST داخل vendor فقط. NO يعني أن سياق المصدر/الترميز راجعه الجرد مع اختبارات تمثيلية للعائلة؛ لا يعني تشغيل كل sink منفردًا في المتصفح.

## 2. CONFIRMED FINDINGS

### XSS-01 — HTML decoding يعيد فتح JavaScript-string context

- **CWE:** CWE-79. **Severity: Medium**.
- **Source:** معرف سجل legacy/import/cache قابل لاحتواء quotes عند دخوله renderer. لا يوجد إثبات أن public/portal user يستطيع إنشاء هذا المعرف في المسار الحالي؛ لا يصح تصنيف النتيجة Public-to-Admin High.
- **Sink:** مثل `scheduleCard()` في `assets/admin.js`؛ interpolation داخل `onclick="editSchedule('${safe(id)}')"`، وسياقات مماثلة في ملفات UI المذكورة أدناه.
- **Trust boundary:** بيانات سجل → HTML attribute → JavaScript compilation. `safe()` يهرب HTML، لكن HTML parser يفك entity قبل compilation؛ لذلك ليس JS-string encoding.
- **Exact payload:** `');globalThis.__tmXss=1;//`.
- **Execution path:** تحميل `safe` و`scheduleCard` الأصليين من ZIP الأساسي، إنشاء DOM، ثم click. أصبحت قيمة الحدث `editSchedule('');globalThis.__tmXss=1;//')`، وأصبح sentinel=1 في Chromium، مع CSP الحالي وبدونه.
- **Affected role/page:** Admin عند الضغط على action في سجل يملك معرفًا خبيثًا. **Impact:** JavaScript تحت أصل صفحة Admin، بشرط وصول هذا المعرف إلى البيانات المعروضة.
- **Minimal fix:** نقل 128 interpolation إلى `data-tm-action` و`data-tm-args` encoded JSON، ثم delegate واحد بـ`addEventListener` يستدعي function مدرجة في whitelist من 50 اسمًا، ويمرر القيمة كبيانات دون eval. لا حذف للـstatic inline controls ولا تغيير raw records.
- **Regression:** DOM quote/entity tests، clicks في Chromium تعيد المعرف الأصلي حرفيًا، واختبارات soft-archive وboolean/element arguments. الدليل الإيجابي الأصلي في `reports/phase22-baseline-browser-reproduction.json`؛ إعادة الإنتاج الاختيارية: `scripts/xss-baseline-repro.js`.

### URL-01 — Syntax escaping لا يحدد URL policy

- **Classification:** unsafe URL trust boundary مرتبط بـCWE-79؛ **Severity: Low** في الأدلة الحالية.
- **Source:** `fileUrl`, `linkUrl`, `pdfUrl`، روابط legacy أو returned file/backup URLs.
- **Sink:** `attachmentHtml()`/resource cards وروابط الامتحانات والواجبات ونافذة ملفات المنهج/backup في `assets/app.js` وملفات UI.
- **Exact payload:** `javascript:globalThis.__tmXss=1`؛ اختُبرت أيضًا case/control variants وdata HTML/SVG وprotocol-relative وcredentials URLs.
- **Evidence:** renderer الأصلي يصدر executable scheme في href؛ هذا إثبات فقدان policy. لم يثبت تنفيذ public-to-admin من anchor الأصلي تحديدًا مع `target` وCSP الحالي؛ لذلك لا نقدم هذه النتيجة كاستغلال Stored XSS High. positive-control navigation المنفصل في Chromium يثبت أن المنصة الاختبارية تكشف javascript execution.
- **Impact:** انتقال غير مقيد إلى URI غير صالح لملف/وجهة المنتج، وخطر تنفيذ يعتمد على سياق التنقل.
- **Minimal fix:** helpers ضيقة حسب الغرض: HTTPS files بلا credentials/controls، Google Drive HTTPS على `drive.google.com`/`docs.google.com` فقط، relative same-origin routes، legacy base64 raster image فقط. رفض persisted blob وdata HTML/SVG وexecutable schemes؛ local code-created blobs محفوظة.
- **Regression:** 11 bad URL fixtures؛ actual attachments/resource cards وbackup/curriculum callbacks؛ safe HTTPS/Drive/raster remain allowed. بعض روابط exam/assignment غير الصالحة تنتج href فارغًا، وattachments/cards تحذف الرابط؛ لا نصدر scheme تنفيذيًا.

### DOM-01 — Raw selector construction

- **Classification:** DOM integrity/robustness؛ **Severity: Low**؛ لا يوجد إثبات تنفيذ script ولا تصنيف Code Injection.
- **Source/Sink:** معرف exam/homework correction أو tab مخزّن → selector داخل `querySelector`.
- **Payload:** quote/newline/bracket-containing IDs في fixtures.
- **Trust boundary/impact:** بيانات إلى selector grammar؛ قد يؤدي إلى selection خاطئ أو exception.
- **Minimal fix:** اختيار عناصر بـselector ثابت ثم مقارنة dataset حرفيًا. تبقى CSS.escape والاستخدامات الثابتة/المقيدة في بقية المواضع.
- **Regression:** correction record IDs ذات quotes/newlines تحدد الصف الصحيح دون exception. لم يتغير حساب الدرجات.

## 3. FALSE POSITIVES / SAFE SINKS

- HTML text/quoted attribute باستخدام `safe/esc` صحيح في السياق المناسب؛ بقي `innerHTML` حين يبني markup ثابتًا مع قيم escaped. لم تُستبدل كل occurrences بصورة عمياء.
- booking/review/client error/answers/filenames اختُبرت عبر renderers حقيقية وتبقى نصًا؛ لا evidence لاستغلال النصوص في هذه المسارات.
- بقي handlerان ديناميكيان في payments يستخدمان `safeId()` المقيد بـ`[A-Za-z0-9_-]`؛ هذا invariant مختلف عن HTML escaping. الأفعال الأخرى أصبحت data/JSON.
- selectors المبنية من enums ثابتة/indices رقمية أو CSS.escape ليست raw untrusted selectors.
- مصادر scripts الثابتة وblob URLs المولدة محليًا ليست URLs مخزنة غير موثقة. WhatsApp بقي HTTPS `wa.me` مع encoded message.
- html5-qrcode 2.3.8/xlsx 0.18.5 لم تُعدل. تسعة vendor innerHTML وموضع new Function داخلي ليست exploits تطبيق مثبتة. فحص advisories مستقل للإصدارات **NOT VERIFIED**؛ لا ادعاء خلو مكتبات vendor من الثغرات.
- code-runner execution مقصود وخارج Scope؛ اختُبر حد عرض stdout/stderr/compiler output كـtextContent فقط، ولم يتغير runner.

## 4. STORED-XSS RESULT

اختبارات DOM والمتصفح تستعمل sentinel `globalThis.__tmXss`، وتفحص injected executable nodes/event attributes، لا مجرد وجود `&lt;`. تشمل booking، moderation review، approved public review، client_errors، transfer request، homework text/code، exam essay/code، filenames، student/group legacy، report concerns/recommendations ومحتوى المنهج.

أُضيفت 6 اختبارات فعلية عبر callable handlers وFirestore/Storage Emulator: createBooking، createReview، reportClientError، homework essay/code، exam progress/submit، accepted upload filename. بقي raw text في قاعدة البيانات، وانتهى إلى عرض inert. في اختبار review استُبدل frontend Firestore adapter بمخزن emulator محلي مع تشغيل approve renderer الحقيقي. وفي اختبار filename زُرعت bytes المرحلية بـAdmin SDK، ثم شُغّل immutable registration الحقيقي؛ لا نزعم أنه اختبار SDK upload كامل. مجموعة Phase2.1 الأصلية تختبر Storage client rules/replay بصورة منفصلة.

**النتيجة:** لا تنفيذ مثبت من public/portal text في Admin ضمن المسارات المختبرة؛ ولم تُحذف syntax من إجابات code أو تُجر encoding قبل التخزين. userAgent يُحفظ لكن لا يعرضه viewer الحالي؛ لم نضف feature لعرضه.

## 5. REFLECTED / DOM-XSS RESULT

query/hash payloads اختُبرت على setupStudent الحقيقي مع auto-submit وفك URL decoding، وكذلك error rendering. بقيت قيم form/نتائج البحث نصًا ولم تنشئ executable DOM. dataset يعد مصدرًا غير موثوق: البيانات تُحلل JSON، واسم action يمر whitelist، ولا يُفسر النص JavaScript. selectors الحساسة عولجت بالمقارنة الحرفية. لا polling أو realtime subscriptions جديدة.

## 6. INLINE HANDLER RESULT

تخلصت الـ128 سياقات من مزج القيمة بـJavaScript source. بقيت الأزرار الثابتة تعمل تحت CSP الحالي. حافظت migration على arguments وactual element وعلى booleans في `setSessionPractical`؛ اختُبرت الحالتان true/false من renderer الحقيقي. تحديث recovery enhancer يحول data action إلى soft-archive الصحيح ويمنع onclick قديمًا أو duplicate handling. لم يتغير archive policy.

static verification: 16 صفحة صحيحة، و127 function/action تم التحقق منها. **الـ125 الأصلية كلها ما زالت معرفة، missing=0**. الزيادة وظيفتا recovery موجودتان سابقًا (`removeLearningContent`, `restoreArchivedContent`) أُدخلتا في تغطية verifier عبر registry؛ ليست features جديدة. لا يصح وصف رقم127 بأنه125 inline handlers جديدة؛ ديناميكية الأفعال أصبحت delegated.

## 7. URL SCHEME RESULT

| الغرض | السياسة النهائية |
|---|---|
| files/signed URLs/backup | HTTPS، بلا username/password ولا whitespace/control prefixes |
| Drive | HTTPS + exact drive.google.com أو docs.google.com |
| internal navigation | relative same-origin، رفض protocol-relative/scheme/backslash/control |
| legacy embedded raster | data base64 PNG/JPEG/WebP/GIF فقط |
| blob download | فقط blob مولد محليًا بواسطة code؛ persisted blob مرفوض |
| WhatsApp | HTTPS wa.me الثابت مع encoding للرسالة |

لا تُقبل javascript/vbscript/data:text/html/data:image/svg+xml، mixed-case/control variants، `//evil...`، أو `https://expected.example@evil.example/`. الروابط العامة HTTPS ليست محصورة في host واحد لأن المنتج يسمح file links متعددة؛ ليست هذه سياسة SSRF. لم تُوسع upload MIME rules ولم تتغير Storage Phase2.1.

## 8. DOCUMENT.WRITE RESULT

بقي printStudentReport دون rewrite. اختُبر المسار الحقيقي مع student/report payloads في DOM ونافذة popup حقيقية في Chromium. لم تظهر script/img-onerror/svg-onload/iframe/object/embed محقونة، ولم ينفذ sentinel. القيم تدخل مستند الطباعة بعد HTML text escaping؛ لم تُعتبر النافذة الجديدة مصدر ثقة بحد ذاتها.

## 9. HOMEWORK / EXAM CODE DISPLAY RESULT

إجابات text/code والessay ومحتوى model answer ودraft active-exam اختُبرت عبر correction/review/exam shell الحقيقي. رموز البرمجة `< > ' " ${...}` تبقى raw business data وتظهر كنص/value، ولا تُحذف أو تُشغّل عند العرض. اختُبر practical output أيضًا، دون تعديل code execution. لم يتغير scoring أو attempts أو retakes أو monthly attribution.

## 10. CSP STATUS

`vercel.json` بقي مطابقًا للbaseline. script-src ليس فيه unsafe-inline/unsafe-eval؛ **script-src-attr 'unsafe-inline'** موجود للـstatic handlers، ولذلك لم يمنع exploit الأصلي. style unsafe-inline، object-src none، base-uri self. المتصفح اختبر functionality الحالية وfixed actions مع CSP نفسه. الانتقال إلى CSP يمنع كل inline attributes دفاع إضافي لاحق يحتاج migration؛ لم نكسر المنتج بنشر CSP صارم.

## 11. FILES CHANGED

سجل كامل: `reports/phase22-file-audit.json`، ومواقع migration: `reports/phase22-action-migration.json`.

- Frontend: `assets/admin.js`, `assets/app.js`, `assets/curriculum-student.js`, `assets/v53-upgrades.js`, `assets/v55-admin.js`, `assets/v56-fixes.js`, `assets/v60-admin-workflow.js`, `assets/v60-payments.js`, `assets/v638-admin-recovery.js`, `assets/v64-admin-operations.js`.
- كل الـ16 HTML: revision query hashes للـJS المعدل فقط، دون layout redesign. يسمح refresh بطلب المصدر ذي revision الجديد؛ لم نختبر rollout إنتاجي أو نغير service-worker.
- Test harnesses: admin-ui.behavior، admin-attention-v690، admin-experience-v636، final-regression-v634، hotfix-v7001-admin، platform-v641، v7003-paper-admin-renderer، v7004-platform-audit. انتقلت الاختبارات إلى invocation البيانات الحقيقي؛ لم تُعطل أو تُخفف business assertions.
- `scripts/verify.js`, `scripts/run-reliability-integration.js`, `package.json`: إدراج الأفعال والاختبارات الجديدة؛ لا dependency جديدة ولا تغيير lockfiles.
- Tests/utilities/reports الجديدة كما في القسم التالي والجرد.

SHA comparisons تؤكد بقاء `functions/index.js`, `functions/entry.js`, Rules، admin-entry/firebase-sync/offline-attendance، practical، service-worker، build.js، lockfiles وvercel دون تعديل. وظائف attendance/bootstrap الأساسية داخل admin.js نفسها مطابقة نصيًا للbaseline بما فيها mergeOfflineAttendanceQueue وbounded day reads.

## 12. NEW TESTS

- `scripts/xss-dom.security.test.js`: 26 اختبارًا executable على production renderers/bundles.
- `scripts/xss-browser.security.js`: 17 اختبارًا في Chromium؛ يشمل positive controls مع sentinel=1 في السياق المقصود، ثم inert production cases مع sentinel=0.
- `scripts/xss-storage.security.integration.test.js`: 6 end-to-end persistence/render boundaries على emulator.
- `scripts/testing/xss-payloads.js`: 8 payloads و11 bad URLs + DOM forbidden-node assertions.
- `scripts/testing/render-actions.js`: تحميل helper الحقيقي في fixtures المعزولة بدل mock escaping.
- `scripts/xss-baseline-repro.js`: إثبات الاستغلال قبل الإصلاح.
- `scripts/xss-sink-inventory.js`: توليد جرد السياقات.

## 13. EXACT PASS / FAIL COUNTS

الاختبارات أدناه نُفذت فعلًا على النسخة النهائية؛ صفر skipped/cancelled. المجموعات متداخلة، **لا تجمع أرقامها باعتبارها اختبارات مستقلة**.

| Command/scope | PASS | FAIL |
|---|---:|---:|
| node scripts/verify.js | 16 pages / 127 checked actions | 0 missing |
| node --test scripts/scheduled-attendance-v7005.test.js | 5 | 0 |
| npm test | 346 | 0 |
| node scripts/run-node-regression.js | 416 | 0 |
| npm run test:rules | 14 | 0 |
| npm run test:review:integration | 457 | 0 |
| node --test scripts/xss-dom.security.test.js | 26 | 0 |
| node --test scripts/xss-browser.security.js | 17 | 0 |

تكامل457: Rules14 + review5 + question banks2 + student grades2 + attendance concurrency5 + content access10 + immutable upload6 + owner4 + XSS persistence6 + portal IDOR17 + admin authorization386. هذا يحافظ على Phase2.1 baseline451 ويضيف6، ويحافظ على npm320 +26 وNode390 +26.

Runtime الفعلي: Node22.23.3، npm10.9.9، Temurin Java21.0.12.1+1، firebase-tools15.29.0، Firestore Emulator1.22.0، Storage rules runtime1.1.3، Chromium154.0.8037.92.

تشغيل browser يحتاج external Playwright، لم يضف إلى package.json:

```bash
TM_PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core \
TM_CHROMIUM_EXECUTABLE=/workspace/scratch/04ca74de8b8d/tooling/chrome-headless-shell-linux64/chrome-headless-shell \
node --test scripts/xss-browser.security.js
```

الـcommands نُفذت من project root مع Node22 على PATH. emulator استخدم Java21 وبيئة proxy unset لتواصل localhost:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
-u http_proxy -u https_proxy -u all_proxy \
JAVA_HOME=/workspace/scratch/04ca74de8b8d/tooling/jdk-21.0.12.1+1-jre \
PATH=/workspace/scratch/04ca74de8b8d/tooling/node-v22.23.3-linux-x64/bin:/workspace/scratch/04ca74de8b8d/tooling/jdk-21.0.12.1+1-jre/bin:$PATH \
npm run test:review:integration
```

Rules standalone استعمل نفس runtime/env مع `npm run test:rules`. سجل النتائج الآلي `reports/phase22-test-results.json`.

## 14. BROWSER VERIFICATION STATUS

**VERIFIED:** Chromium headless حقيقي، current CSP، HTML entity decoding، quoted action click، malicious markup، positive-control SVG handler compilation/dispatch، javascript navigation control، curriculum callbacks وprint popup. استخدام dispatch في positive-control SVG يثبت event compilation والتنفيذ؛ لا نزعم أنه اختبار كل auto-load behavior.

المتصفح يشغل production JS/renderers مع fixtures محلية وnetwork interception؛ ليست رحلة production login. integration يشغل Firestore/Storage Emulators حقيقيين وcallable `.run` harness مع synthetic auth/portal sessions؛ لا Functions/Auth HTTP emulator كامل. iOS Safari، Android/WebView، وكل branch لكل sink **NOT VERIFIED**. هذه الحدود لا تحوّل regex إلى browser equivalence.

## 15. REMAINING RISKS

- CSP يسمح static inline handlers؛ migration دفاع إضافي لاحق، لا استغلال غير مغلق مثبت في هذه المرحلة.
- legacy/import IDs ليست موثوقة رغم أن server-generated IDs الحالية مقيدة؛ الإصلاح يحمي حد العرض دون تعديل old data.
- vendor internals العشرة تحتاج تحقق مستقل، ولم تبدأ SSRF/Code/Command Injection.
- real production deployment/cache rollout/physical mobile browsers لم تُختبر ولم يحدث deploy.
- HTTPS policy لا تعني أن كل external host موثوق؛ تمنع executable schemes وتحتفظ بروابط ملفات المنتج. origin-wide file allowlist جديدة ليست ضمن هذا الإصلاح.
- coverage تمثيلية واسعة وليست برهانًا رياضيًا لخلو جميع branches من XSS. عدم تغيير وظائف المنطق مثبت hashes/regression، وليس مراجعة Phase2.1 أمنية جديدة من الصفر.

## 16. CLEAN UPDATED ZIP

`technominds-phase2.2-xss-security-closure.zip` يحتوي source تحت `technominds-phase2.2/` مع التقرير/tests/inventories. حُفظت كل ملفات المصدر الأساسية؛ لا node_modules أو dist أو runtime downloads أو temporary npm/test logs أو emulator directories. scripts/build.js وبنية deployment محفوظان. **build نُفذ بصورة غير مباشرة ضمن test suite؛ لم يحدث Deploy/Push/Production Data modification.**
