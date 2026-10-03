# TECHNO MINDS — PHASE 1.1: Reliability Closure + Emulator Verification

الحالة: إصلاحات الحضور وبدء الإدارة نجحت، لكن الإغلاق الكامل ليس PASS بسبب ثلاثة إخفاقات Emulator موثقة أدناه. المصدر الوحيد هو technominds-phase1-reliability.zip. لا Deploy، لا Push، ولا تعديل Production Data. جميع عمليات Firebase في هذه الجولة محلية على demo-technominds. لم تبدأ Phase 2.

## 1. ROOT CAUSE

كانت حماية mergeOfflineAttendanceQueue تربط أولوية server بمطابقة classSessionId. عند اختلاف session-old عن session-new كانت تفشل الحماية، ثم findAttendance(day) يعيد السجل الرسمي، وObject.assign ينسخ إليه بيانات queue القديمة. المشكلة تجمع بين هوية session غير متسقة ومزج مصدر غير موثق داخل object رسمي.

أُعيد إنتاج A/B وغيرهما باختبارات تنفذ دالة الدمج الفعلية داخل DOM: قبل الإصلاح 3 PASS / 5 FAIL في أول ثمانية اختبارات. وأُعيد إنتاج سباق bulk فعليًا على Firestore Emulator: قراءته القديمة ثم batch.set(merge) استبدلت present بغياب؛ أول مجموعة concurrency كانت 1 PASS / 2 FAIL.

## 2. EXACT MINIMAL FIX

- الهوية الرسمية للحضور session-specific: studentCode + classSessionId؛ document ID هو studentCode_classSessionId في attendance. الجلسة الافتراضية scheduleId_date. السجل القديم studentCode_date يبقى مدعومًا ولا يُحذف.
- أولوية المصدر: official server/day snapshot أولًا، ثم official state المحمل، ثم pending local preview فقط حين لا يوجد official state لنفس الطالب واليوم. الحماية محافظة عمدًا عبر session identities المختلفة.
- queue تُعرض كتمثيل مؤقت مستقل method=offline_qr_pending، ولا تعدّل official objects. لا Object.assign من queue إلى official record. كل merge يزيل التمثيلات المؤقتة السابقة فقط ويعيد بناء الصالح منها.
- يجب أن تكون row pending/syncing، تخص المدرس الحالي، ولها preparation مطابق للمالك واليوم والجلسة وغير منتهٍ. synced/failed/preparation قديمة لا تعيد حالة العرض إلى الخلف. queue الأصلية تبقى للمزامنة/المراجعة.
- findAttendance يقبل session صريحًا ويفضل الرسمي. fallback إلى legacy يخص الجلسة الافتراضية فقط. اليوم يعرض سجلات الجلسات منفصلة دون عدّ legacy mirror مرة ثانية.
- حفظ رد callable يطابق ID/session المعاد من الخادم، بدل الدمج مع أول سجل في اليوم. انتهاء bulk يعيد القراءة الرسمية بدل تصنيع حالات absent محليًا.
- bulk يستخدم transactions بحد 50 create و101 point read لكل chunk. يعيد قراءة الجلسة، canonical attendance وlegacy canonical قبل الكتابة، ويستخدم create للمفقود فقط. النتيجة تحسب ما حُفظ فعليًا بعد التزامن.
- إذا سبقت bulk absence تسجيل present صالحًا، تسمح transaction الحضور بتصحيح absent الذي method الخاص به bulk_absent فقط. explicit manual absence ما زال يرفض تغييرًا متعارضًا ويطلب مراجعة.
- تحميل الإدارة يحتفظ بتنزيل جميع scripts معًا وasync=false لترتيب التنفيذ. ينتظر native DOMContentLoaded قبل إدراجها، ويرسل initialization فقط بعد نجاح جميع الملفات. failure latch يمنع bootstrap/render للـworkspace الجزئي. retry لا يعيد تحميل/تهيئة نفس الملفات؛ Reload يبدأ محاولة جديدة.

## 3. FILES CHANGED

Runtime:
- assets/admin.js
- assets/admin-entry.js
- functions/index.js (تغييرات داخل attendance فقط)
- teacher-login.html (rev hashes فقط)

Tests / test runner:
- scripts/phase11-reliability.test.js — جديد
- scripts/admin-startup-closure.test.js — جديد
- scripts/attendance-concurrency.integration.test.js — جديد
- scripts/run-reliability-integration.js — جديد؛ يعزل database لكل suite، ويحصر DELETE reset في 127.0.0.1 وdemo-technominds
- scripts/firebase-rules.emulator.test.js — توسيع تغطية القواعد دون تغيير القواعد
- scripts/attendance-transfer-v7005.test.js — mock transactions بدل batch القديم وقراءات الحماية الفعلية
- scripts/admin-ui.behavior.test.js — الرد الوهمي يطابق الفترة المطلوبة بدل سبتمبر الثابت
- scripts/platform-workflow-v623.test.js — فحص bulk_absent في server الذي يملكه، بدل طلب fabrication في client
- scripts/student-grades.integration.test.js — فترة سبتمبر صريحة، وتصحيح تحقق homework إلى homeworks[].submission؛ results منفصلة للامتحانات في عقد profile الحالي
- package.json — إدراج الاختبارات الجديدة وتشغيل integration suites بعزل البيانات

Reports:
- PHASE1_REPORT.md — تصحيح عبارة build التاريخية
- PHASE1_1_REPORT.md — هذا التقرير

firestore.rules وstorage.rules وlockfiles وfunctions/entry.js وfirebase-sync.js وoffline-attendance.js وmonthly-report.js وportal-results.js وapp.js وv64-admin-operations.js مطابقة بايتًا للمصدر ZIP. لم تتغير Business Logic للامتحانات والواجبات والتقارير.

## 4. NEW REGRESSION TESTS

scripts/phase11-reliability.test.js: 10 PASS / 0 FAIL. اختبارات تنفيذية للدوال، وليست مجرد string inspection:

| الحالة | التحقق |
|---|---|
| A | server present/new مقابل pending absent/old؛ الرسمي يبقى present/new |
| B | server absent/new مقابل pending present/old؛ الرسمي يبقى absent/new |
| C | server present مقابل queue absent لنفس session؛ الرسمي يبقى present |
| D | no server + preparation صالحة؛ pending يظهر، synced/failed لا يظهران |
| E | legacy official دون session؛ queue لا تستبدله |
| F | historical hydration بعد authoritative day؛ اليوم الرسمي يظل الفائز |
| G | pending ظهر أولًا ثم server read؛ الرسمي يستبدل تمثيل pending |
| إضافي | حصتان + legacy mirror؛ حالتان منفصلتان، دون عدّ ثالث |
| إضافي | أزرار اليوم لا تعدّل session أخرى، حتى لو كانت الوحيدة المسجلة |
| إضافي | preparation منتهية لا تنتج preview |

scripts/admin-startup-closure.test.js: 3 PASS / 0 FAIL. ResourceLoader داخل JSDOM يتحكم في 15 download فعليًا ضمن DOM: نجاح بترتيب تنفيذ واحد، فشل الملف الأوسط، auth event مكرر، retry، ومنع renderer/bootstrap الحقيقي عند loading/failed.

scripts/attendance-concurrency.integration.test.js: 5 PASS / 0 FAIL. Firestore Emulator وtransactions فعلية: manual ثم bulk، QR ثم bulk، bulk ثم present مع حماية manual absent، حصتان وlegacy، و72 طالبًا ضمن chunks 50+22 مع replay saved=0.

القواعد: أُضيفت خمسة اختبارات Emulator تنفيذية؛ أربعة PASS وواحد FAIL موضح أدناه. لا يوجد اختبار أُزيل أو عُدل لإخفاء فشل قواعد.

## 5. MULTIPLE-SESSION CONCLUSION

النموذج الحالي يدعم sessions متعددة بالفعل: upsertClassSession يقبل id مخصصًا، backend attendance يربط بالسجل classSessionId، وشاشة «حصة اليوم» الموجودة تفتح كل session على حدة. لذلك لم نفرض invariant جديدًا يمنع تعدد الحصص.

شاشة الحضور اليومي تعمل الآن بوضوح على الجلسة الافتراضية scheduleId_date. وجود سجل لجلسة أخرى يظهر «حصة محددة · راجع حصة اليوم» ويمنع أزرار اليوم وQR/إنهاء الغياب الملتبسين؛ تُستخدم شاشة session الموجودة. لا قراءة جديدة لكل sessions ولا تصميم اختيار جديد. حتى عندما لا توجد records بعد، الكتابة من اليوم تخص default session صراحة، ولا تكتب فوق جلسة مخصصة.

todayAttendanceRows يحافظ على سجل لكل session، وlegacy يُستخدم fallback دون إنشاء duplicate mirror. pending preview لا يصير أعلى من server بسبب اختلاف session. لم يتغير منطق العملي/واجب الحصة، وهما خارج تعديل هذه الجولة.

## 6. BULK CONCURRENCY RESULT

PASS: 5/5 في Emulator. أوقف الاختبار bulk بعد query.get الحقيقي، ثم أتم callable manual/QR present الحقيقي، ثم أكمل bulk، وفحص document النهائي persisted. النتيجة present، saved=0. وفي الاتجاه المعاكس final present أيضًا. explicit manual absent يظل محميًا.

Transactions محدودة: 50 write / 101 point read كحد أقصى للمحاولة، وليس transaction ضخمة لكل الطلاب. 72 طالبًا اختُبروا فعليًا 50+22؛ الإعادة لم تنشئ سجلات إضافية. هذه القراءات الإضافية لازمة للتحقق عند commit، ولا تغير startup reads أو تضيف listeners/polling.

## 7. RULES / EMULATOR RESULT

Java 21.0.12.1 Temurin استُخدم بالفعل مع firebase-tools 15.26.0. Firestore وStorage Emulator اشتغلا. Node المتاح 24.19.0، بينما المشروع يحدد 22.x؛ lockfiles لم تتغير.

الـproxy في البيئة كان يوجه طلبات Storage rules المحلية إلى الخارج؛ originals نجحت 6/6 بعد إزالة proxy من عملية Emulator، دون تغيير Firebase Rules.

الأوامر النهائية:

```bash
node scripts/verify.js
node --test scripts/scheduled-attendance-v7005.test.js
npm test
```

كل أمر Emulator التالي شُغّل مع env مماثل:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    -u http_proxy -u https_proxy -u all_proxy \
    JAVA_HOME=/workspace/scratch/04ca74de8b8d/java21-runtime/jdk-21.0.12.1+1-jre \
    PATH=/workspace/scratch/04ca74de8b8d/java21-runtime/jdk-21.0.12.1+1-jre/bin:$PATH \
    npm run test:rules
```

ثم نفس env مع `npm run test:review:integration`، الذي ينفذ `node scripts/run-reliability-integration.js` داخل emulators:exec --project demo-technominds --only firestore,storage. كل suite تبدأ database فارغة؛ runner يكمل بعد الفشل ويخرج 1 إذا فشلت أي suite.

| المجموعة | PASS | FAIL |
|---|---:|---:|
| npm run test:rules | 10 | 1 |
| review.integration | 4 | 1 |
| question-banks.integration | 1 | 1 |
| student-grades.integration | 2 | 0 |
| attendance-concurrency.integration | 5 | 0 |
| مجموع integration، شامل Rules مرة واحدة | 22 | 3 |

تحققت قواعد رفض anonymous/non-admin/unverified admin حيث يلزم، verified active admin للقراءات المقصودة، منع direct attendance وexam grading writes، homework protected grants/locks/reviews، upload type/size/expiry/exact token path، ومنع unknown paths. استثناء class-check الخاص بالإدارة موجود أصلًا في القواعد ويُختبر كما هو؛ ليس كل homework write ممنوعًا مطلقًا. token upload صالح ومقيد يُسمح به للعميل غير المسجل وفق العقد الحالي.

الفشل المتبقي:

1. Storage binary overwrite بنفس homework grant صالح: uploadBytes الثاني يُقبل بينما الاختبار يتوقع رفض update. القواعد لم تتغير، وupdateMetadata مرفوض كما يجب. كود firebase-tools المثبت في emulator/storage/files.js يصنف uploadObject كـCREATE حتى مع storedMetadata؛ هذا يفسر نتيجة Emulator، ولا يثبت سلوك Production. نتيجة منع إعادة رفع bytes: FAIL في Emulator / Production NOT VERIFIED. الاختبار الفاشل محفوظ.
2. review.integration: rank=1 وtotalStudents=1 صحيحان بعد العزل، لكن motivation.level يعيد «جيد جدًا» بدل «يحتاج متابعة» الذي يتوقعه الاختبار. درجات التقرير وتصحيحها قبل هذا assertion نجحت. أُعيد نفس الفشل على source ZIP الأصلي، 4 PASS / 1 FAIL؛ لم يُغير report Business Logic أو يُبدل assertion ليصبح PASS.
3. question-banks.integration: contentAccessMode=from_joining لا يحجب material القديم في سيناريو الطالب الجديد بالاختبار. نفس assertion ونفس النتيجة أُعيدا على ZIP الأصلي، 1 PASS / 1 FAIL. لم يُجرَ refactor أو تعديل visibility/security logic خارج النطاق. باقي خطوات ذلك الاختبار بعد assertion الفاشل لا تُعد verified.

## 8. npm test EXACT RESULT

PASS: 316 tests / 316 PASS / 0 FAIL / 0 skipped / 0 cancelled. verify وأمرا payment-domain وcurriculum-v61 السابقان للـNode runner نجحا أيضًا؛ لا نجمع assertion counts لهذه الأوامر مع عدد tests.

## 9. ALL NON-EMULATOR NODE TESTS EXACT RESULT

نفس نطاق Phase 1: كل scripts/*.test.js باستثناء *.integration.test.js و*.emulator.test.js، مرتبًا؛ 61 ملفًا. الأمر الفعلي استُدعي بقائمة الملفات عبر subprocess لتجنب تفاوت shell glob:

```python
files = sorted(p for p in glob.glob('scripts/*.test.js')
               if not p.endswith(('.integration.test.js', '.emulator.test.js')))
subprocess.run(['node', '--test', *files])
```

PASS: 386 tests / 386 PASS / 0 FAIL / 0 skipped / 0 cancelled. يشمل attendance/offline/cross-device، exams، homework، unified profile/monthly report، payments، navigation/buttons، parent report، startup. npm tests مجموعة فرعية متداخلة، فلا تجمع 316 و386 كاختبارات مستقلة.

scheduled-attendance-v7005.test.js منفردًا: 5 PASS / 0 FAIL؛ حدود القاهرة موجودة ولم تُغير في هذه الجولة. verify: كل 16 route سليمة و125 inline handler معرف. لم تضف التعديلات listeners أو polling لـFirebase.

## 10. GENERATED ARTIFACTS CLEANUP

نُفذ build بصورة غير مباشرة بواسطة scripts/v7004-manifest-homework-hotfix.test.js ضمن الاختبارات الشاملة. لا Deploy، لا Push، ولا تعديل Production Data. PHASE1_REPORT.md صُححت فيه عبارة build السابقة.

الحزمة النهائية source نظيف والتقارير/اختبارات regression. dist/ مولد، وقد أزيل بعد الاختبارات. لا node_modules، Java runtime، emulator downloads، npm logs، debug logs، test-error.txt، phase1-validation، أو temporary test directories في ZIP. حُذفت manifest/patch المولدة من Phase 1 بدل شحن provenance قديمة مضللة. وثائق المصدر وموارد fixtures الأصلية اللازمة للسكربتات بقيت.

## 11. REMAINING RISKS / ACCEPTANCE

- لا يُعلن إغلاق Phase 1.1 PASS مع ثلاثة إخفاقات Emulator السابقة. إصلاح queue mismatch/same session/legacy وحماية server day وrace attendance وstartup ناجح؛ emulator verification كشف نقاطًا لم تُحل داخل هذا النطاق.
- bulk متعدد chunks ليس عملية ذرية واحدة لكل المجموعة. إذا انقطع callable بعد chunk، قد تبقى كتابة جزئية صحيحة؛ retry idempotent وواجهة اليوم تعيد القراءة الرسمية وتعرض فشلًا دقيقًا.
- bulk يستفيد من canonical IDs للكتابات الجديدة، مع دعم legacy snapshot؛ لا migration أو حذف legacy، ولا توحيد شامل لسجلات تاريخية غير قياسية.
- runtime متاح Node 24 بدل Node 22 المعلن؛ تحقق Node 22 مستقل لم يُنفذ.
- اختبارات startup والmerge DOM behavior وليست تشغيل Chrome على هاتف فعلي. محاولة توفير Chromium لم تنتج binary صالحًا في البيئة. تجربة جهازين حقيقية وقياسات latency/paint وProduction behavior: NOT VERIFIED؛ لا تُستنتج من اختبارات static أو DOM.
- لا Security Rewrite ولا تعديل Rules لحل فشل upload؛ ذلك يتطلب قرارًا منفصلًا بعد تحديد سلوك runtime المدعوم. لم تبدأ Phase 2.

## 12. CLEAN UPDATED ZIP

technominds-phase1.1-reliability-closure.zip: مصدر مُحدث، الاختبارات التنفيذية، هذا التقرير، والتقرير التاريخي المصحح. تحققت سلامة ZIP وعدم تضمين generated output/dependencies/logs، وحُفظت قواعد Firebase وassessment/report logic دون تعديل.
