# TECHNO MINDS — PHASE 2.3

Code Runner Isolation + SSRF + Code/Command Injection + Resource Abuse

التاريخ: 2026-10-02. البداية حصريًا من `technominds-phase2.2-xss-security-closure.zip`، SHA-256: `acf7ac6fcfd37d01d38ba0171c023f93ffef4762530ca81bf3575869cca7e9da`.

**الحكم: الإصلاحات واختبارات التطبيق المحلية PASS. الإنفاذ الكامل لحدود sandbox لدى المزود تحت ضغط فعلي NOT VERIFIED؛ لا نقدم هذا التقرير كإثبات إغلاق كامل لكل تفاصيل عزل Judge0.** النتائج الفعلية وحدودها مفصّلة أدناه. لم يحدث Deploy أو Push أو تعديل Firebase Production Data. لم يُعد تصميم الواجهة، ولم تُضف dependencies أو Docker/runtime إلى المشروع، ولم يتغير منطق الحضور أو الامتحانات أو الواجبات أو التقارير أو Auth/portal sessions. لم تُخفف Rules.

## 1. CODE EXECUTION ARCHITECTURE

المسار الحالي: محرر `practical.html` → `assets/practical.js` → callable `submitCodeExecution` → JSON إلى Judge0 → polling محدود → نتيجة نصية → `code_execution_runs` لمدة صلاحية15 دقيقة. لغة الطلب تُطابق server allowlist للغات12، ثم server يحدد `language_id`. sourceCode/stdin بيانات opaque، وليسا JavaScript أو shell في عملية Cloud Functions.

بقي المحرر وstdin والنسخ والتنزيل وCtrl/Cmd+Enter وعرض status/stdout/stderr/compile output/time/memory/exit code. بقيت اللغة/المسودة المحلية. التغيير المقصود عند توقف Judge0: رسالة تعذر مؤقت بدل تشغيل JavaScript في أصل التطبيق.

الجرد: `reports/phase23-execution-inventory.json`. تحليل AST يغطي Application JS وFunctions، ويصنف أدوات build/test/local وvendor منفصلة. **لا production execution sink** متبقٍ في الجرد بعد الإصلاح. لا نساوي regex match أو intentional remote sandbox execution بثغرة.

## 2. LOCAL FALLBACK SECURITY RESULT

أُعيد إنتاج Phase2.2 من ZIP الأصلي في Chromium154 مع CSP الحقيقي وبدونه، وبفشل callable من النوع UNAVAILABLE الذي يفعّل fallback الأصلي. استُخدمت بيانات محلية تجريبية فقط:

- IndexedDB: `tm-security-test`, secret=`PHASE23_SECRET`.
- CacheStorage: secret=`PHASE23_CACHE_SECRET`.
- EventSource إلى endpoint محلي تجريبي؛ لا credentials إنتاجية.

مع CSP الحقيقي: الـWorker يُنشأ، لكن eval يُرفض بـEvalError بسبب غياب unsafe-eval. هذه مشكلة reliability وليست إثبات isolation ناجح؛ الواجهة كانت تضيف عبارة التشغيل المحلي حتى عند Runtime Error.

بدون هذا الـCSP: الكود قرأ سر IndexedDB وسر CacheStorage، وأرسل الأول عبر EventSource. window/document غير متاحين داخل Worker، لكن هذا لم يمنع الوصول إلى storage تحت first-party origin. fetch/WebSocket/XMLHttpRequest/importScripts المقيدة يدويًا لم تغلق الحد الأمني.

| Probe | الدليل |
|---|---|
| indexedDB | قراءة sentinel فعلية بدون CSP؛ blocked eval مع CSP |
| caches | قراءة sentinel فعلية بدون CSP |
| EventSource | نقل sentinel فعلي إلى harness محلي بدون CSP |
| BroadcastChannel / nested Worker / WebTransport | APIs متاحة في Worker baseline؛ لا ادعاء اختبار كل مسار اتصال لها |
| SharedWorker / RTCPeerConnection | غير متاحين في سياق Chromium Worker المختبر |
| navigator / crypto | متاحان؛ availability ليس isolation proof |
| dynamic import / service-worker communication | لا تحقق شامل لكل إمكاناتهما؛ لا حاجة لاستكمال sandbox غير صالح بعد إثبات storage/network bypass |
| DOM/window | typeof undefined داخل Worker baseline |
| infinite loop | timeout الأصلي ينهي Worker بعد3.5 ثوانٍ عند غياب CSP؛ لم تُعتبر هذه المهلة حماية storage |

**الإصلاح:** حذف `runJavascriptFallback` والـBlob Worker/eval، والإبقاء على remote execution والخطأ المؤقت. اختبارات Chromium النهائية تؤكد صفر Workers وصفر local source execution، مع CSP وبدونه؛ secrets لم تتغير عند إدخال source يحاول storage/network/import/nested-worker APIs. الدليل الأصلي: `reports/phase23-baseline-browser.json`.

## 3. CWE-94 RESULT

**CR23-01 — CONFIRMED design-boundary failure, Medium conditional severity.**

- Source: student JavaScript في المحرر. Sink: indirect eval داخل same-origin Blob Worker، `assets/practical.js` الأصلي.
- Attacker control: source كامل؛ يتطلب وصول هذا المصدر إلى محرر المستخدم وتشغيله عند Judge0 unavailable، مع غياب/تغيير CSP الذي يمنع eval. لا إثبات remote takeover بمجرد public editor.
- Evidence: قراءة `PHASE23_SECRET` وإرساله بـEventSource في Chromium بدون CSP. مع CSP الحالي لا ينفذ eval في Chromium؛ **NOT EXPLOITABLE بهذه الطريقة في التجربة ذات headers الحالية**، لكنه fallback مكسور وغير مستقل أمنيًا عن headers.
- Impact: first-party persistence authority بدل sandbox مستقل إذا نُفذ fallback.
- Minimal fix: fail closed وحذف same-origin execution. Regression: baseline reproduction +5 browser tests، وAST inventory.

لا untrusted source ينفذ داخل Cloud Functions process. التنفيذ المقصود في Judge0 ليس CWE-94 بحد ذاته. لا new Function أو vm execution لإدخال المستخدم في Application production. vendor new Function الخاص بـQR منفصل، لم يُعدّل ولا صُنّف exploit تطبيق دون مسار مثبت.

## 4. CWE-77 RESULT

**NOT APPLICABLE / NO PRODUCTION COMMAND-INTERPRETER SINK FOUND.**

source/stdin يرسلان JSON. اختُبرت quotes/backticks/`${}`/null/Unicode/CRLF/JSON-looking/shell syntax/command substitution كنص opaque في handler الحقيقي. لا shell command يُركّب منها. spawnSync/execFileSync/vm في test/build harness ليست public web endpoints. لم تُحذف أدوات regression لكي يصمت scanner.

## 5. CWE-78 RESULT

**NOT APPLICABLE / NO PRODUCTION OS-PROCESS EXECUTION SINK FOUND.**

لا child_process exec/spawn/fork يستقبل public request في Functions أو التطبيق. أداة `scripts/judge0-provider-probes.py` الاختيارية تستدعي curl بargv ثابتة وshell=false؛ هي أداة تحقق محلية، وليست endpoint. Judge0 URL لا يُمرر إلى shell في الإنتاج.

## 6. CWE-918 RESULT

Request language/source/stdin/visitorId لا تختار protocol/host/port/path/DNS. الوجهة تأتي فقط من deployment `JUDGE0_BASE_URL`، والdefault/sample هو `https://ce.judge0.com`. اختبارات request spoofed baseUrl/apiKey/language_id تؤكد تجاهلها.

**لا public request-controlled SSRF exploit مثبت.** Concern configuration/redirect يُصنف hardening عند هذا الحد، لا public SSRF High. نطاق إعدادات النشر الفعلي للمشروع لم يُقرأ أو يُعدل.

**CFG23-01 — HARDENING, CWE-918-related configuration boundary, Low.** Source: deployment-controlled URL. Sink: Node fetch. Preconditions: إعداد endpoint غير آمن أو upstream redirect. Evidence: baseline يقبل loopback HTTP، و307 يذهب إلى origin آخر. Fix: narrow endpoint policy، DNS private-address check، redirect:error. Tests: unsafe URL/DNS/config/redirect matrices.

## 7. JUDGE0 ENDPOINT / REDIRECT RESULT

- Default HTTPS `ce.judge0.com` مسموح. Custom provider يحتاج exact origin ضمن `JUDGE0_ALLOWED_ORIGINS`؛ prefix ASCII بسيط يدعم self-hosted API prefixes.
- لا credentials/userinfo/query/hash/control/backslash/encoded-host tricks. Unexpected port لا يقبل ضمن default؛ custom port يحتاج origin صريحًا.
- Private/localhost HTTP لا يقبل إلا origin صريح + `JUDGE0_ALLOW_PRIVATE_ENDPOINT=true`، لحماية architecture ذات self-hosting مقصود. لا flag من request.
- تُرفض private/link-local/loopback/CGNAT/IPv6 mappings افتراضيًا، وتُراجع DNS answers قبل الاتصال.
- جميع config/submission/poll/sync fetches تستخدم `redirect:'error'`.

**REDIR23-01 — CONFIRMED cross-origin credential/body forwarding, Medium.** Source: Judge0 302/307 response؛ sink: fetch follow الافتراضي؛ attacker control: upstream redirect، لا destination من student request. Disposable baseline server أثبت وصول synthetic `X-Auth-Token` وsource إلى origin ثانٍ عبر307. Impact: خروج secret/program عن provider origin المعتمد. Fix: رفض redirect. Regression يختبر302/307 في المراحل الأربع؛ destination received0 requests.

DNS validation ليست DNS pinning إلى socket، ولا إثبات دفاع كامل ضد rebind من provider origin مسموح ومسيطر عليه؛ allowlist/TLS وكون الوجهة deployment-controlled تحد من هذا السيناريو. يُذكر هذا ضمن المخاطر، لا يُخفى.

## 8. JUDGE0 SECRET HANDLING RESULT

API key فقط في request header إلى origin المعتمد. Header name RFC-token محدود، وHost/Cookie/Content-Type/proxy/forwarded/connection ونحوها ممنوعة. CRLF والقيم/الأسماء المفرطة وRapidAPI-host malformed تفشل مغلقًا. User request لا يبدل headers.

لا logging للكود أو stdin أو key من runner. health يعيد configuration/status flags فقط؛ لا base URL ولا key. أخطاء parser/transport/config تبقى عامة؛ لا يُقتبس error raw إلا status code مولد داخليًا بنمط مضبوط.

إذا أعاد upstream المفتاح نفسه داخل text result، يستبدل بـ`[REDACTED]` قبل response والتخزين؛ هذا hardening ضد credential echo، وليس sanitizer عام للبيانات. Student code/stdin يظلان raw. اختبار hostile response وerror/health/storage يؤكد غياب synthetic API key. Secret redaction لا تستطيع حماية المفتاح من مزود خبيث يعرفه أصلًا؛ تمنع إعادة تسريبه من تطبيقنا.

## 9. NETWORK ISOLATION RESULT

أُرسل `enable_network:false` صراحةً. GET عام لـ`ce.judge0.com/config_info` بتاريخ المرحلة أعاد `allow_enable_network:false` و`enable_network:false`. Snapshot محفوظ في `reports/phase23-provider-config.json`.

أُجريت3 probes غير تدميرية من JavaScript/Python/C إلى TCP `1.1.1.1:80` مع مهلة قصيرة، بلا secret. النتائج3/3: `ENETUNREACH`/errno101، لا اتصال ناجح. `reports/phase23-provider-network-probes.json` يحفظ النتائج. لم نكتفِ بالـJSON false.

هذا إثبات سلبي تمثيلي على default public provider وقت الاختبار، وليس مثبتًا لكل protocol/runtime أو مزود النشر الفعلي. لم تتوفر بيئة Judge0 خاصة مع endpoint sentinel نتحكم فيه وpositive network control داخل sandbox نفسه. **الإنفاذ الشامل NOT VERIFIED**. لا outbound probe أو fork bomb تدميري ضد المنصة الإنتاجية.

## 10. RESOURCE LIMIT RESULT

| الحد | Default / bounds |
|---|---|
| source UTF-8 | 65536 bytes؛ config1024..262144 |
| stdin UTF-8 | 16384 bytes؛ config0..65536 |
| كل output text | 32768 bytes شاملة suffix؛ config1024..131072 |
| provider response قبل JSON | outputMax×4+8192 bytes؛ config_info16KB |
| CPU / wall | 5s /10s؛ config1..15 و2..30 |
| memory | 131072KB؛ config32768..262144 |
| max_file_size | 1024KB ثابت |
| processes/threads | 128؛ config64..256 |
| per-process time/memory flags | false صراحةً، لتجنب budget يتضاعف لكل thread |
| HTTP overall deadline |25s؛ Functions timeout30s |
| poll |40 attempts ×450ms؛ retries محدودة |
| instance concurrency |4 remote executions كحد أقصى |

**OUT23-01 — CONFIRMED UTF-8 contract violation, CWE-400, Low.** Source: multibyte program/provider stdout. Sink: `limitedOutput` byte decision + JS string slice. Payload: emoji repeats. Baseline32KB limit returned65575 bytes. Impact: output budget مضاعف، لا OOM مثبت. Fix: byte-safe truncation يحفظ UTF-8 ويدخل suffix ضمن budget. Tests: Arabic/emoji/Unicode، stream cancellation وmalformed/deep/unexpected JSON، bounded metrics/token/status/output.

Provider config يُفحص on demand، ومخبأ5 دقائق في warm instance، لا polling خلفي. Limits المتعارضة/network policy غير المقبولة تفشل قبل إرسال source. التحقق المخبأ لا يضيف Firestore reads.

max_processes default128 مطابق للconfig العام المقروء؛ **12/12 برامج Hello فعلية** نجحت بالحد وبالmemory الحالي للغات Python/JS/TS/C/C++/Java/C#/Go/PHP/Ruby/Rust/Kotlin. أقل قيمة64 لم تُختبر لكل runtime؛ احتفظ بالdefault128 ما لم تختبر custom tuning.

Loop/sleep/memory/output/process/thread outcomes اختُبرت بالmock ولا يُدعى إثبات kernel enforcement منها. لا runtime sandbox محلي أو Docker جديد. Hard CPU/RAM/process/file enforcement تحت ضغط حقيقي **NOT VERIFIED**.

400 optional fields recovery باقٍ. Sync compatibility retry واحد فقط لتوكن-route400/404؛ لا resubmit عند429/500. Frontend endpoint retry الأصلي باقٍ للتوافق؛ يمكن أن يكرر طلبًا بعد فشل اتصال ملتبس، لذلك لا ندعي exactly-once remote execution. retry/rate/concurrency limits تحد الاستهلاك؛ كلاهما ليس quota عالمية لكل instances.

## 11. RATE LIMIT RESULT

visitorId client-controlled وليس authentication. Baseline استخدم IP نفسه كidentity، فأصبح budget6 مشتركًا بين طلاب نفس الشبكة؛ إعادة الإنتاج تؤكد حجب زائر مختلف بعد6 تشغيلات إجمالية.

الإصلاح المحدود للrunner: identity=`IP:visitorId` بحد6/min، وshared IP budget default60/min configurable20..120، لتحقيق سعة صف مع سقف ثابت. هذا يزيد admission الفعلي مقارنة بالbaseline؛ trade-off مقصود لعطل NAT، مع concurrency4 وحدود provider. نفس معاملتي Firestore الأصليتين؛ لا listeners أو scans أو distributed limiter جديد.

Rotate visitor IDs لا يتجاوز shared IP budget. اختبار emulator المتزامن مع24 visitor/header مختلف يثبت counter transaction boundary عند20 في config الاختبار. Spoofed XFF لا يغير socket peer افتراضيًا. `unknown` يتجمع conservatively في budget واحد؛ لا يصبح ownership identity. Trusted-hop mode يُختبر من يمين chain، لكن ingress topology الفعلي **NOT VERIFIED**؛ `functions/lib/request-ip.js` بقي كما هو.

هذه حماية public abuse جزئية، لا global quota/DDoS guarantee عبر IPs/instances. ينبغي التحقق من ingress/provider quotas قبل أي deploy لاحق؛ لم تُعدل إعداداتهما.

## 12. RESULT OWNERSHIP RESULT

**OWN23-01 — CONFIRMED incorrect result authorization, CWE-863, Low.**

- Source: caller لديه runId معروف؛ sink: getCodeExecutionResult old ipHash comparison.
- Attacker control: visitorId/request؛ precondition: معرفة UUID ومشاركة NAT أو unknown IP. UUID عشوائي يجعل التخمين غير عملي؛ لا High arbitrary disclosure claim.
- Evidence: زائر مختلف بنفس IP قرأ النتيجة، والexpired record بقي مقروءًا في baseline harness.
- Impact: disclosure للoutput المؤقت، لا raw source تلقائيًا.
- Fix: UUIDv4 runId +32-byte random `resultToken` يعاد لصاحب submit، ويُحفظ hash فقط. get result يحتاج capability، وليس IP/visitor. expiry15min يُطبق عند القراءة؛ legacy IP-only result مغلق، ولا حذف endpoint أو records.
- Regression: same-NAT/missing-IP/incorrect-token/expired/legacy cases في handler وemulator. Capability holder يمكنه القراءة من IP جديد؛ هذا bearer capability، ليس portal/session redesign.

sourceCode/stdin/key لا تُحفظ؛ sourceHash فقط. output قد يحتوي ما طبعه البرنامج عمدًا، وهو مختلف عن حفظ raw input. Firestore مباشرة DENY للanonymous والverified browser Admin في الاختبار الجديد؛ Rule server-only الأصلية لم تتغير. TTL لـexpiresAt موجود في firestore.indexes.json؛ نشر/تفعيل TTL الفعلي NOT VERIFIED، وحماية expiry لا تعتمد على سرعة حذف TTL.

## 13. FILES CHANGED

السجل الكامل: `reports/phase23-file-audit.json`.

- `functions/index.js`: runner/config health boundary فقط؛ destination/headers/response/capability/resource changes.
- `functions/lib/code-runner-policy.js` جديد: policies ضيقة وbounded parsing/UTF-8/metrics/capabilities.
- `functions/.env.example`: custom-origin/private opt-in/process/IP-budget documentation، بلا secrets فعلية.
- `assets/practical.js`: حذف fallback فقط؛ remote editor workflow باقٍ.
- `practical.html`: revision query للمصدر المعدل فقط.
- `package.json`: إضافة89 security Node cases، دون dependencies/lockfile changes.
- `scripts/verify.js`: استبدال requirement القديم لوجود unsafe fallback بfail-closed requirement، مع إبقاء remote smoke checks.
- `scripts/mobile-refactor-v671.test.js`: health config assertion يتبع validated policy الحالية.
- `scripts/run-reliability-integration.js`: إضافة runner suite.

جميع Functions قبل CODE_LANGUAGES وبعد runner/health block مطابقة نصيًا للbaseline. entry.js وRules/indexes/admin.js/admin-entry/firebase-sync/offline-attendance/app.js/service-worker/vercel/build.js/lockfiles مطابقة SHA. لا تغييرات payments/attendance/exams/homework/report/Auth business logic. تقارير المراحل السابقة محفوظة كـhistorical baseline، لا كاتستات Phase2.3 الحالية.

## 14. NEW TESTS

- `scripts/code-runner.security.test.js`:89 executable/unit cases؛ actual application handler slice داخل test VM، student source لا يُقيّم داخل VM. HTTP harness حقيقي محلي، لا production endpoints.
- `scripts/code-runner.security.integration.test.js`:5 حالات callable `.run` مع Firestore/Storage Emulator، actual transactional limiter/result persistence/Rules.
- `scripts/code-runner-browser.security.js`:5 Chromium tests للremote/fail-closed/storage/shortcuts/editor/download/copy.
- `scripts/testing/code-runner-harness.js`, `scripts/testing/fake-judge0.js`: providers async/poll/sync/redirect/status/invalid/oversize/stuck pending.
- `scripts/code-runner-baseline.browser.js`: executable original ZIP reproduction؛ يتطلب extracted Phase2.2 root، وليس source النهائي.
- `scripts/code-execution-inventory.js`: AST inventory، ليس proof بمفرده.
- `scripts/judge0-provider-probes.py`: optional fixed safe Hello/network probes؛ لا يستدعى من npm regression تلقائيًا.

## 15. EXACT PASS / FAIL COUNTS

| Scope / command | PASS | FAIL |
|---|---:|---:|
| node scripts/verify.js |16 pages /127 checked actions /125 original retained|0 missing|
| npm test |435|0|
| node scripts/run-node-regression.js |505|0|
| npm run test:rules |14|0|
| npm run test:review:integration |462|0|
| scheduled-attendance-v7005.test.js |5|0|
| xss-dom.security.test.js |26|0|
| xss-browser.security.js |17|0|
| code-runner.security.test.js |89|0|
| code-runner-browser.security.js |5|0|
| manifest/build revision regression |3|0|
| live safe Hello compatibility |12|0|
| live TCP negative probes |3|0|

المجموعات متداخلة فلا تُجمع. npm346+89، Node416+89، integration457+5. لا skipped/cancelled في TAP suites النهائية. integration462 تشمل Rules14/review5/questions2/student grades2/attendance concurrency5/content10/immutable upload6/owner4/XSS6/runner5/portal17/admin386.

Runtime: Node22.23.3، npm10.9.9، Temurin Java21.0.12.1+1، firebase-tools15.29.0، Firestore Emulator1.22.0، Storage runtime1.1.3، Chromium154.0.8037.92. استُخدمت dependencies الموجودة المطابقة للlockfiles؛ لم تُضف dependencies للمشروع.

Commands من project root مع Node22 على PATH:

```bash
node scripts/verify.js
npm test
node scripts/run-node-regression.js
npm run test:rules
npm run test:review:integration
node --test scripts/scheduled-attendance-v7005.test.js
node --test scripts/xss-dom.security.test.js
node --test scripts/code-runner.security.test.js
```

Browser يحتاج external tooling الموجود في البيئة، بلا dependency جديدة:

```bash
TM_PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core \
TM_CHROMIUM_EXECUTABLE=/workspace/scratch/04ca74de8b8d/tooling/chrome-headless-shell-linux64/chrome-headless-shell \
node --test scripts/xss-browser.security.js scripts/code-runner-browser.security.js
```

Emulator مع Java21 وproxy unset لتواصل localhost:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
-u http_proxy -u https_proxy -u all_proxy \
JAVA_HOME=/workspace/scratch/04ca74de8b8d/tooling/jdk-21.0.12.1+1-jre \
PATH=/workspace/scratch/04ca74de8b8d/tooling/node-v22.23.3-linux-x64/bin:/workspace/scratch/04ca74de8b8d/tooling/jdk-21.0.12.1+1-jre/bin:$PATH \
npm run test:review:integration
```

Rules command يستعمل نفس environment مع `npm run test:rules`. JSON results في `reports/phase23-test-results.json`. بعد انتهاء سجلات /tmp المؤقتة أثناء التوقف، أعيدت الاختبارات النهائية وحُفظت نتائجها في هذا التسليم؛ لا ادعاء أن محاولة bootstrap/download فاشلة كانت PASS.

## 16. REAL CHROMIUM RESULT

Baseline proof: CSP blocks eval، بينما غياب headers يسمح بstorage read/EventSource leakage. Final5/5: no Worker/local code، no secret change، fail-closed with/without CSP، remote success وإجراءات editor باقية. Existing XSS17/17 بقي green. Fixtures تستعمل JS الحقيقي وCSP الحقيقي مع network interception؛ لا رحلة login أو requests على Production Functions.

Firestore/Storage Emulators حقيقيان على demo-technominds؛ callable test harness synthetic auth `.run`، وليس Functions/Auth HTTP Emulator. Browser-specific mobile Safari/Android/WebView NOT VERIFIED.

## 17. PROVIDER-LEVEL ITEMS NOT VERIFIED

- Hard kernel enforcement للCPU/wall/memory/file/process/thread quotas تحت loop/fork/thread/memory storm؛ mock ليس دليلًا لذلك.
- كل outbound protocol/runtime وcontrolled positive+negative network test داخل private Judge0؛ لدينا3 negative TCP probes فقط.
- المزود وإعدادات ingress/JUDGE0 env/TM_TRUSTED_PROXY_HOPS وquota الفعلية في نشر Techno Minds؛ لا Production inspection/change.
- DNS pinning، multi-instance global concurrency/quota، provider compilation hard limits/patch level.
- compatibility لكل language عند custom process tuning غير128.

لا unqualified PASS لإغلاق sandbox provider الكامل. التطبيق fail-closed وحدوده التنفيذية المختبرة ناجحة؛ هذه البنود تحتاج بيئة مزود مستقلة للتأكيد، لا تعديل scoring/Auth/CSP لإخفائها.

## 18. REMAINING SECURITY RISKS

المزود المعتمد يظل trust boundary يحمل program ومفتاحه؛ compromise عنده لا تعالجه frontend filtering. DNS لا يُثبت إلى socket. Public multi-IP abuse يمكنه توزيع الطلبات على instances؛ default limiter/concurrency ليست quota عالمية. عنوان proxy غير المتحقق منه قد يجمع مدرسة أو يصنف مجهولًا؛ لا تُضبط trusted hops بالتخمين.

Frontend retries وcompat sync retry قد يكرران sandbox submission في فشل ملتبس؛ bounded لا exactly-once. إغلاق TTL/legacy result مقصود لاسترجاع مؤقت كان IP-only، ولا يؤثر في exam/homework records. نشر config جديد على custom provider يحتاج origins صريحة؛ لم يُنفذ أي نشر.

لم تبدأ Session Fixation/general Auth/CSP/SQL/buffer-overflow مراحل أخرى. vendor implementation تفاصيل منفصلة دون exploit جديد مثبت.

## 19. CLEAN UPDATED ZIP

`technominds-phase2.3-runner-security-closure.zip`: source كامل تحت `technominds-phase2.3/` + هذا التقرير + executable tests + inventories/results. كل baseline source files محفوظة. لا node_modules/dist/.firebase/tmp/runtime downloads/debug/npm logs أو unrelated generated outputs.

**build نُفذ بصورة غير مباشرة من manifest test، ثم استُبعد dist. scripts/build.js وبنية deployment محفوظان. لا Deploy، لا Push، لا Firebase Production Data modification.**

مصادر المنهجية الفنية: [Judge0 API الرسمي](https://ce.judge0.com/) و[معلومات الإعدادات الرسمية](https://github.com/judge0/judge0/blob/master/docs/api/system_and_configuration/configuration_info.md). Values live المذكورة من GET snapshot، لا افتراض defaults من الوثائق.
