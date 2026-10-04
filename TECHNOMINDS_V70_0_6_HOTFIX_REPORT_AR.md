# تقرير TECHNOMINDS — V70.0.6 Production Hotfix

حالة البوابة المحلية: **PASS بعد الفحص المحلي، دون نشر**. لم يُنفذ Push أو Deploy، ولم تُقرأ أو تُعدّل بيانات الإنتاج أثناء الاختبارات. الاختبارات التشغيلية استخدمت مشروع `demo-technominds` ومحاكيات محلية وبيانات طلاب وملفات مصطنعة.

## 1. المصدر والحدود

بدأ العمل من `main` في `byAmrkhaled0/eng-amr-khaled-academy`، عند commit:
`b176ebeba5d13631b302ca13f6625c6439a8182a`، بإصدار الحزم `70.0.5`. لم تُستخدم ZIP من مرحلة سابقة. أصبح إصدار الحزم والواجهة والكاش `70.0.6`، مع بقاء API schema `portal-v64.0.0` كما هو.

التعديل المنطقي في ستة ملفات فقط؛ بقية تغييرات المصدر لتزامن الإصدار وبصمات الأصول، أو اختبارات الانحدار. لا إعادة تصميم، ولا مكتبات إضافية، ولا ترحيل بيانات، ولا تعديل للحضور أو الحسابات الأكاديمية أو سجل المعاملات القديم.

## 2. سبب اختفاء Unit 1 والمحاضرات العملية

كان `getStudentResources` و`materialsForStudent` يطبقان `reusableContentAccessAllowed` على `materials`، وكانت قوائم `lectures` و`units` ومسارات المحاضرة والملف والتقدم تطبق القرار نفسه. وضع الطالب غير المحدد يعود إلى `from_joining`؛ تقارن السياسة تاريخ نشر المحتوى بتاريخ قبول/تفعيل/انضمام/إنشاء الطالب. بذلك تُرفض محاضرة Unit 1 المنشورة قبل انضمام الطالب، رغم نشرها واستهدافها الصحيح.

صفحتا النظري والعملي تستخدمان نتائج `materials`، ثم تفصلانها بحسب `lectureCategory`؛ لذا **السبب المشترك هو شرط الانضمام المطبق على موارد التعلم العادية**، وليس حذف المحاضرات. كما كان تاريخ المحاضرة الأم يستطيع حجب بنك أسئلة حديث مرتبط بها. لا يُدّعى فحص مستندات Unit 1 الإنتاجية؛ إثبات السبب هنا من المصدر الحالي وتشغيل fixtures على الخادم الحقيقي داخل المحاكي.

## 3. السياسة القديمة والجديدة

| نوع المحتوى | قبل الإصلاح | بعد الإصلاح |
|---|---|---|
| `materials`، `lectures`، `units`، `lecture_materials` | سياسة الانضمام، بما فيها الافتراضي للطلاب القدامى | تاريخ الانضمام لا يحجب التاريخ المنشور داخل نطاق الطالب |
| `assignments`، `assignments_v2`، `exams`، `monthly_exams` | أهلية التقييم الحالية | بلا تغيير |
| `questions`، `question_banks`، `bank_questions` | سياسة المورد/الانضمام الحالية | بلا تغيير؛ المحاضرة الأم تتبع سياسة المحاضرات الجديدة فقط |
| نوع غير معروف | سياسة الانضمام الحالية | يبقى مقيدًا؛ لا إعفاء افتراضي |

أُضيف `learningContentAccessAllowed(item, student, kind)` بتمييز أنواع ثابت يحدده الخادم، وليس قيمة سياسة يختارها العميل. لا يلغي فحص النشر أو `learningTargetMatchesStudent` أو `requirePortalSession` أو `requireApprovedStudent`. ما زالت الدرجة والمجموعة/معرّف الجدول والسنة والترم والاستهداف الصريح للطالب مطلوبة وفق العقد الحالي.

المحاضرة المخفية أو المؤرشفة أو غير النشطة أو غير المنشورة تبقى ممنوعة. ترفض سياسة المحاضرات كذلك `hidden:true` وحالات archive/unpublished القديمة، دون تغيير دالة النشر المشتركة المستخدمة في حساب التقرير. القواعد الأصلية للمحتوى المرحّل ووقت فتح/إغلاق المحاضرة تظل نافذة. لم تُعدّل سياسة `full/from_joining/custom` للتقييمات، ولا مهلة الانضمام ولا حساباتها الزمنية.

الطالب القديم بلا `contentAccessMode` يستعيد المحاضرات دون تعديل سجله. الطالب الجديد لا يتلقى امتحانًا تاريخيًا مغلقًا أو واجبًا تاريخيًا ممنوعًا. اختبارات التكامل تثبت إخفاءهما ورفض `startExam` و`submitAssignmentAnswer` المباشرين. مرفقات المحاضرة تُفحص أيضًا من خلال `getCurriculumFileUrl`، مع استمرار منع ملف تابع لمحاضرة مخفية أو مؤرشفة أو خارج النطاق.

## 4. سبب حلقة سعر الدفع والإصلاح

كان بناء اللوحة يستخدم `summary.expectedAmount ?? coursePrice`. وجود ملخص بقيمة صفر يمنع الرجوع للسعر لأن الصفر ليس nullish. لذلك يصل `expected=0` إلى الزر، فيفتح محرر السعر بدل تنفيذ الدفع. وكان `applySavedCoursePrices` يتجاوز أي صف يحمل summary، حتى الملخص الصفري القديم؛ لذلك لا تصلح إعادة حفظ السعر البطاقة.

أُعيد تشغيل كود اللوحة من commit الأصل نفسه: سعر مقرر 500 مع ملخص صفري أعطى **0 قبل الإصلاح و500 بعده**.

أُضيف `resolveExpectedAmount` في نطاق الدفع:

1. السعر الشهري الموجب الموجود يبقى مرجع الشهر ولا يستبدله تغير سعر المقرر.
2. ملخص صفري يحمل دفعات أو عدد معاملات ليس ملخصًا فارغًا؛ لا يُعاد تفسيره تلقائيًا.
3. الملخص الصفري بلا نشاط مالي يستخدم سعر **المقرر نفسه** إذا كان مفتاحه محفوظًا.
4. مفتاح السعر المحفوظ بقيمة **0** يعني سعرًا مجانيًا صريحًا؛ عدم وجود المفتاح مختلف عن الصفر. لا يُختلق مبلغ ولا معاملة بقيمة صفر.
5. تستخدم بطاقة المقرر القديم بعد الانتقال سعر المقرر القديم؛ بطاقة المقرر الحالي تستخدم سعره الحالي. هوية الملخص تبقى student + academicYear + month + course.

البيانات الحالية لا تحتوي علامة مستقلة لتنازل/إعفاء شهري مجاني؛ لذلك لم تُخترع علامة أو migration. الدليل على السعر المجاني في العقد الحالي هو إعداد السعر الصفري المحفوظ. إذا أُضيف لاحقًا إعفاء شهري مستقل عن سعر المقرر، فسيلزم تمثيله صراحة؛ لا ينبغي تخزينه كصفر قديم فارغ غير مميز.

يتحقق الخادم من القيمة داخل المعاملة بعد قراءة الملخص، ويحافظ على البصمة ومعرّف الطلب ومنع زيادة المدفوع عن المطلوب. لا يستطيع طلب المتصفح فرض مبلغ موجب على مقرر مجاني فارغ. الملخص الشهري الموجب يبقى صالحًا حتى لو صار السعر الافتراضي للمقرر صفرًا لاحقًا.

تُحدّث البطاقة والإجماليات من نتيجة الخادم، مع pending guard ومعرّف ثابت لإعادة محاولة الشبكة. أُزيل جلب اللوحة المؤجل بعد الدفع السريع وبعد حفظ الدفعة الجزئية؛ لا full dashboard fetch عقب كل دفعة. بقي تحديث حفظ الأسعار/إلغاء المعاملة السابق كما هو، دون إضافة polling أو listener. النموذج الجزئي يأخذ السعر المحلول لنفس صف الفترة والمقرر.

## 5. سبب مشكلة Dark Theme

كانت `.student-resource-summary` في `v60-technominds.css` تستخدم gradient أبيض ثابتًا، بينما طبقات الثيم اللاحقة تجعل النص فاتحًا في Dark. البطاقة ليست ضمن قائمة `.card` التي تعالجها الطبقة المشتركة، فتبقى خلفيتها بيضاء. كان صندوق الكود أيضًا يحمل ألوانًا ثابتة.

استُبدلت ألوان هذه البطاقة فقط بـ `--tm-surface` و`--tm-text` و`--tm-muted` و`--tm-line` و`--tm-surface-soft` الموجودة أصلًا. لا طبقة ثيم جديدة ولا تغيير للتخطيط. بقيت بقية CSS كما هي بعد نجاح فحصها.

فحص Chromium يستخدم renderers الفعلية وملفات CSS الفعلية وCSP الحالية، مع بيانات مصطنعة ودون اتصالات Firebase الإنتاجية. اختُبرت صفحتا النظري والعملي عند **360، 390، 768، 1366، 1920** في Light وDark: تباين النصوص المحددة لا يقل عن 4.5:1، البطاقة والأزرار ضمن العرض، لا horizontal overflow، وحالة الفراغ ظاهرة. اختُبر زر الدفع وظهور تأكيده الفعلي في الثيمين عند 390px. هذا فحص fixtures وليس ضمانًا لكل نص طويل ممكن أو لكل متصفح.

## 6. الاختبارات المضافة والتعديلات على اختبارات قديمة

- `production-hotfix-v7006.test.js`: 28 حالة لتمييز المحاضرات والتقييمات والاستهداف والنشر والسعر الصفري والسعر الشهري والانتقال.
- `production-hotfix-v7006.dom.test.js`: حالتان تشغلان renderer الدفع الفعلي؛ طلب واحد عند الضغط المتكرر، تحديث البطاقة بلا جلب اللوحة، ومقرر مجاني دون دفع أو طلب سعر متكرر.
- `production-hotfix-v7006.integration.test.js`: 8 حالات A–H على Firestore Emulator، تشمل المعاملة المتزامنة، retry، الدفع الجزئي والكامل، السعر المجاني، وتغيير المقرر والشهر.
- `production-hotfix-v7006.browser.js`: 22 حالة Chromium للشاشات والثيمين ولزر الدفع.
- أُضيفت حالتان في `payment-lifecycle.test.js` للملخص الصفري والمقرر المجاني.
- أُضيفت حالتان في تكامل المحتوى للطلاب القدامى ومحاضرات النظري/العملي، ولإبقاء امتحان/واجب تاريخي محميين.
- عُدلت توقعات **المحاضرات فقط** في اختبارات وصول المحتوى وبنك الأسئلة لتعكس العقد المطلوب. بنك حديث لا يُحجب بسبب قدم محاضرته؛ بنك قديم نفسه ما زال مقيدًا. تستخدم حالة إصدار الرابط الآن مفتاح توقيع مصطنعًا عبر helper الاختبارات الموجود.
- بقية تعديلات الاختبارات لتزامن `70.0.6`/الكاش، أو مطابقة تركيب الفلتر/شرط الزر الجديد. لم يُحذف أو يُعطّل اختبار، ولم تتغير توقعات حماية التقييمات أو assertions الضغط في Code Runner.

## 7. نتائج الأوامر

| الأمر / المجموعة | PASS | FAIL | ملاحظة |
|---|---:|---:|---|
| `npm ci` | ناجح | 0 | تثبيت lockfile؛ لا تغيير dependencies |
| `npm --prefix functions ci` | ناجح | 0 | تثبيت lockfile Functions |
| `npm --prefix functions run lint` | ناجح | 0 | syntax entry/index |
| `node scripts/verify.js` | ناجح | 0 | 16 صفحة؛ 127 إجراء معرّف؛ لا missing |
| `npm test` | 509 | 0 | baseline 479، زيادة 30 |
| `node scripts/run-node-regression.js` | 581 | 0 | baseline 549، زيادة 32 |
| `npm run test:review:integration` | 527 | 0 | baseline 517، زيادة 10؛ جمع TAP للمجموعات الـ14 |
| `npm run test:rules` | 14 | 0 | مستقل، ويُكرر داخل التكامل |
| `node --test scripts/scheduled-attendance-v7005.test.js` | 5 | 0 | مجموعة موجودة أيضًا ضمن npm/Node |
| Chromium hotfix | 22 | 0 | 20 للموارد + 2 للدفع |
| Chromium XSS | 17 | 0 | baseline XSS قائم |
| XSS DOM | 26 | 0 | داخل npm/Node؛ لم يُحذف اختبار |
| `npm run build` | ناجح | 0 | dist v70.0.6 |
| `npm run verify:dist` | ناجح | 0 | 16 صفحة، workflow آمن، لا backend/env |

تفصيل التكامل: Rules 14، reliability/review 5، hotfix payments 8، question banks 2، student grades 2، attendance concurrency 5، content access 12، homework upload 6، owner 4، stored XSS 6، Code Runner 5، session auth 55، portal IDOR 17، admin authorization 386. المجموع 527/0.

أوامر Chromium المحلية:
```bash
node --test scripts/production-hotfix-v7006.browser.js
node --test scripts/xss-browser.security.js
```
تُضبط `TM_PLAYWRIGHT_MODULE` لمسار Playwright المتاح و`TM_CHROMIUM_EXECUTABLE` لمسار Chromium؛ لم تُضف dependency للمشروع.

الأعداد تخص التنفيذ الأخير، وتُعرض لكل suite دون جمع suites المتداخلة. `npm test` ينجح أيضًا في فحوص الدفع والمنهج المستقلة السابقة لـ TAP. تم البناء ضمن اختبار manifest بصورة غير مباشرة، ثم نُفذ `npm run build` صراحة وفُحص dist.

البيئة: **Node 22.23.0، npm 10.9.8، Java Temurin 21.0.12.1، firebase-tools 15.29.0، Chromium headless-shell 151.0.7922.34**. استُخدم Chromium الحقيقي عبر Playwright، وليس محاكاة jsdom للـ layout.

لتشغيل المحاكيات في هذه البيئة عُزلت متغيرات HTTP proxy عن العمليات المحلية، وضُبط Java محليًا إلى `-Xmx512m -XX:ActiveProcessorCount=2`. هذا إعداد اختبار فقط؛ لم يتغير كود المشروع أو Rules بسببه. التشغيل الأول عبر proxy فشل في اختبارات Storage↔Firestore، ثم نجح العزل. تشغيل كامل تحت حمل متزامن أعطى 526 PASS / 1 FAIL في assertion ضغط Code Runner الذي ينتظر `resource-exhausted`. أُعيد **التكامل كله** بموارد محلية محددة دون تعديل الكود/الاختبار؛ النتيجة النهائية مسجلة أعلاه. لا نجزم بسبب داخلي لهذا الإخفاق العابر. حصل كذلك خلل charset في صفحة fixture لاختبار دفع المتصفح، وصُحح fixture بترميز UTF-8 دون تعديل إنتاجي.

## 8. حماية baseline والتكلفة

مقارنة AST أثبتت أن أجسام **89 من 95 export** في `functions/index.js` لم تتغير؛ الستة المعدلة هي الدفع وخمسة endpoints للمحتوى/التقدم. `functions/entry.js` وقواعد Firestore وStorage و`monthly-report.js` و`admin-entry.js` و`offline-attendance.js` وCode Runner policy بقيت مطابقة للمصدر الأصلي. API schema لم يتغير. تعديلات الحضور في ملفات الاختبار أرقام كاش فقط؛ لا تعديل لمنطق الحضور.

لا queries جديدة أو N+1 أو listeners جديدة أو polling جديد أو migration. تظل استعلامات الجمهور والدرجة والمجموعة الحالية bounded، ويظل جلب المحاضرات الأم عبر getAll القائم. قرار تاريخ الانضمام تغيّر محليًا بعد القراءة الحالية، دون فتح collection access للمتصفح. قد يُعاد للطالب عدد أكبر من محاضراته المؤهلة في response نفسه؛ لا زيادة في عدد استعلامات القراءة لهذا الطلب. لم تُستبدل الحدود الحالية بمسح التاريخ كله.

قراءات/كتابات معاملة الدفع نفسها لم تزد: تحقق الطالب والإعدادات ثم قراءة transaction/summary في المعاملة والكتابات والمرايا والتدقيق القائمة. أُزيلت إعادة جلب اللوحة بعد تسجيل الدفع؛ لذلك تنخفض قراءات الاستخدام المتكرر. لا تعديل لعملية ledger قديمة. استمرار تصفية الموارد بحسب المجموعة الحالية بعد انتقال الطالب مقصود؛ لا تعرض هذه السياسة محتوى مجموعته السابقة خارج الاستهداف الحالي.

## 9. التدقيق المرتبط والقيود

Drive/HTTPS validation وXSS encoding وdelegated actions لم تتغير. اختبارات Drive الحالية وXSS DOM وChromium بقيت ناجحة. انتهاء جلسة الطالب و`تغيير الطالب` يمسحان الجلسة/الواجهة وفق baseline؛ لا حفظ لجلسة جديدة أو إحياء token من URL. الاختبارات الحالية للجلسات وIDOR وصلاحيات المدير وملفات الواجبات والحضور المتزامن نجحت ضمن التكامل.

لم يُفحص حساب طالب حقيقي أو ملف إنتاجي أو إعداد سعر إنتاجي. نشر المحتوى على درجة/مجموعة خاطئة، أو جعله hidden/archived، سيظل يحجبه عمدًا. الحدود الحالية للعدد/الصفحات بقيت كما هي؛ هذه الدفعة ليست توسيعًا لسعة تاريخ المحتوى. لم تُختبر خدمات Judge0 الحية أو Safari/iOS الفعلي؛ لم يتغير منطقها. بقيت أسعار المقررات على شكل settings الحالي، دون إضافة نموذج أسعار حسب الترم أو تاريخ أسعار.

## 10. ترتيب نشر الإنتاج — تعليمات فقط

بعد نجاح الاختبارات المحلية المذكورة فقط:

1. احتفظ بالـbaseline وبـdeployment Vercel الحالي وبإعدادات الإنتاج الحالية خارج ZIP. استخدم Node 22 في جهاز النشر.
2. من مصدر v70.0.6 المثبت، أعد أوامر التحقق والبناء عند نقل الحزمة لجهاز آخر. ثم انشر Functions المتأثرة انتقائيًا بالأداة الموجودة، backend أولًا:

```powershell
.\deploy-production.ps1 -Functions getStudentResources,getStudentCurriculum,getLectureContent,getCurriculumFileUrl,recordLectureProgress,getPortalStudent,getExamDashboard,getPaymentDashboard,createPaymentTransaction,getPlatformHealth,getPlatformHealthHttp -SkipSiteCheck
```

`getPortalStudent` و`getExamDashboard` يتأثران بـmaterialsForStudent، والـhealth مطلوب لتزامن الإصدار. لا نشر شامل ولا تغيير Functions الخاصة بالتقييم أو الحضور أو Code Runner. تخطي site check هنا مؤقت لأن الواجهة القديمة ما زالت live؛ يُجرى الفحص بعد تحديثها.

3. بعد تأكيد backend، انقل تغييرات المصدر عبر مراجعة المستودع المعتادة إلى main كي ينفذ مسار GitHub→Vercel الحالي `npm test && npm run build`. لا أوامر Push أو نشر Vercel نُفذت هنا، ولا حاجة لتغيير architecture أو إعدادات Vercel.
4. بعد اكتمال Vercel، شغّل الفحص الحالي:

```powershell
.\check-deployment.ps1
```

5. افحص قراءة المحاضرات بحساب قديم وآخر جديد ضمن نفس المجموعة، ورفض محتوى مجموعة مختلفة، وDrive، والثيمين، ثم سجل دفعة شرعية واحدة عند الحاجة التشغيلية وتحقق من ledger وعدم التكرار. هذا smoke لاحق للمشغّل، وليس تعديلًا إنتاجيًا تم في هذه المهمة.

لا حاجة لنشر Rules أو Indexes: لم تتغير. لا Firebase Hosting؛ الواجهة الحالية من GitHub إلى Vercel كما في المشروع. لا تُنفذ عمليات حذف/إعادة إنشاء المحاضرات أو ترحيل الطلاب أو تعديل Ledger. أوامر هذه الفقرة تعليمات تسليم فقط، ولم تُنفذ في هذا العمل.

## 11. الرجوع

احتفظ بإصدار Vercel الحالي قبل نشر الواجهة. عند الحاجة، أعد ترويج deployment v70.0.5 السابق من Vercel، ثم أعد نشر **نفس قائمة Functions المختارة فقط** من مصدر commit baseline المثبت أعلاه وبإعدادات الإنتاج الحالية. يمكن تجهيز المصدر عبر `git worktree add --detach ../technominds-v7005-rollback b176ebeba5d13631b302ca13f6625c6439a8182a` في جهاز النشر، ثم تثبيت اعتماده واستخدام أداة النشر الانتقائي الموجودة فيه. هذا الأمر لم يُنفذ هنا.

لا rollback لبيانات الطالب أو المحاضرة أو معاملات الدفع؛ الإصلاح لا يحتاج schema migration. الدفعات الشرعية المسجلة بعد النشر لا تُحذف. الرجوع للكود القديم قد يعيد حجب المحاضرات/حلقة السعر؛ يُستخدم للطوارئ ثم يُراجع السبب.

## 12. الملفات المتغيرة بالضبط

عدد الملفات: **57**، تشمل هذا التقرير والاختبارات الجديدة.

```text
404.html
TECHNOMINDS_V70_0_6_HOTFIX_REPORT_AR.md
about.html
assets/app.js
assets/firebase-sync.js
assets/v60-payments.js
assets/v60-technominds.css
exams.html
functions/index.js
functions/lib/content-visibility.js
functions/lib/payment-dashboard.js
functions/package-lock.json
functions/package.json
functions/payment-domain.js
index.html
learning-path.html
materials.html
offline.html
package-lock.json
package.json
parent.html
practical.html
privacy.html
questions.html
reviews.html
scripts/admin-dashboard-v674.test.js
scripts/admin-experience-v636.test.js
scripts/admin-redesign-v673.test.js
scripts/assessment-ux-v672.test.js
scripts/backend-compatibility-v6781.test.js
scripts/content-access.security.integration.test.js
scripts/content-visibility.test.js
scripts/learning-hub-v670.test.js
scripts/lecture-drive-v677.test.js
scripts/mobile-refactor-v671.test.js
scripts/payment-lifecycle.test.js
scripts/performance-delivery-v627.test.js
scripts/platform-v641.test.js
scripts/platform-workflow-v623.test.js
scripts/production-hotfix-v7006.browser.js
scripts/production-hotfix-v7006.dom.test.js
scripts/production-hotfix-v7006.integration.test.js
scripts/production-hotfix-v7006.test.js
scripts/question-banks.integration.test.js
scripts/report-hotfix.test.js
scripts/resilience-routes-v6782.test.js
scripts/run-reliability-integration.js
scripts/scheduled-attendance-v7005.test.js
scripts/stabilization-v7005.test.js
scripts/student-reliability-v640.test.js
scripts/verify.js
scripts/visibility-workflow-v626.test.js
service-worker.js
student.html
teacher-login.html
terms.html
theory-lectures.html
```

## 13. الحزمة النظيفة

`technominds-v70.0.6-production-hotfix.zip` تحتوي مصدر المشروع كاملًا، الاختبارات الجديدة وهذا التقرير. لا `node_modules` أو `dist` أو `.firebase` أو Git metadata أو real `.env` أو مفاتيح توقيع أو سجلات تشغيل مؤقتة. بقي `.env.example` الأصلي الخالي من الأسرار. dist ناتج مولّد جرى بناؤه وفحصه، وليس جزءًا من convention المصدر في المستودع، لذلك لم يُضمّن. أُعيد ملف inventory القديم الذي يعيد الاختبار توليده إلى bytes الـbaseline؛ لا تحديث عرضي لتقارير مراحل مقفلة.
