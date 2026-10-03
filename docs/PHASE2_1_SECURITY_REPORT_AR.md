# TECHNO MINDS — PHASE 2.1

تاريخ التحقق: 2026-10-01. النتيجة: **PASS لاختبارات القبول المحلية المحددة، مع حدود التحقق الموضحة أدناه**.

بدأ العمل حصريًا من `technominds-phase1.1-reliability-closure.zip`، SHA-256:
`c629a18158f28993b403eae6ba2f5ad303e5184c5407be31f37bae9412ce3f16`.

لا Deploy، لا Push، ولا تعديل Production Data. جميع بيانات الاختبارات في مشروع `demo-technominds` ومحاكيات محلية. لم تبدأ مرحلة XSS/SSRF/Injection. لم تتغير واجهة المستخدم أو قواعد حساب الامتحانات والواجبات والتقرير الشهري. التغيير الوحيد في تسليم إجابة الواجب هو رفض وصول مباشر أثبت أنه يتجاوز سياسة عرضه.

## 1. SECURITY FINDINGS

### SEC-21-01 — سياسة وصول المحتوى غير متسقة

- **CWE-863 — Incorrect Authorization؛ Medium.**
- المتأثر: `functions/index.js`؛ `getStudentResources`, `getStudentCurriculum`, `getLectureContent`, `getCurriculumFileUrl`, `recordLectureProgress`، ومعاينات materials/banks المرتبطة.
- الشرط: جلسة طالب صحيحة، وضع `from_joining`، ومحتوى منشور مستهدف له لكنه أقدم من انضمامه. وفي حالة المحتوى التابع: معرفة معرف ملف تابع لدرس مخفي/مؤرشف.
- الاستغلال المؤكد: طالب انضم 2026-09-13 يرى materials/questions/banks بتاريخ 2026-09-01؛ والاستدعاء المباشر يعيد محاضرة/رابطًا لا تسمح به سياسة الانضمام. بعض ملفات الدرس التابعة لم تكن تتحقق من إتاحة الأب مثل question_banks.
- الأثر: قراءة محتوى خارج الاستحقاق المقرر وتجاوز إخفاء الدرس باستخدام معرف ملف تابع. لم يُثبت وصول إلى بيانات طالب آخر.
- حد الثقة: إعداد الوصول في سجل الطالب وبيانات النشر/الاستهداف على الخادم؛ إخفاء زر أو قائمة ليس تفويضًا.
- الإصلاح: helper واحد `reusableContentAccessAllowed()`، إضافة القرار الخادمي للقوائم والكائنات المباشرة والتقدم، والتحقق من الأب في مسارات الملفات التابعة. لم تضف قراءات تاريخية جديدة أو listeners.
- الاختبار: `content-access.security.integration.test.js`، عشر حالات تنفيذية؛ full/from_joining/custom، التوقيت، legacy، المسار والمجموعة، الأب المخفي، إعادة طلب URL بعد الإخفاء، والوصول المباشر. إضافة أربع حالات وحدة زمنية/سلوكية.

### SEC-21-02 — تسليم واجب مخفي عبر callable مباشرة

- **CWE-863 — Incorrect Authorization؛ Medium.**
- المتأثر: `submitAssignmentAnswer` في `functions/index.js`.
- الشرط: جلسة طالب صحيحة ومعرفة معرف واجب قديم لا تعرضه القائمة بسبب سياسة الانضمام.
- الاستغلال المؤكد: fixture MCQ صالح قبل الإصلاح قُبل وصُحّح عبر الاستدعاء المباشر، رغم أن واجبه تاريخي مخفي.
- الأثر: إنشاء نتيجة واجب خارج الاستحقاق؛ لا يوجد تغيير في التصحيح أو الوزن أو retake.
- الإصلاح: تطبيق `contentAvailableAfterStudentJoined()` الموجود أصلًا في القوائم، قبل تسليم الإجابات. helper نفسه بقي مطابقًا للbaseline، بما فيه استثناءات التقييمات المفتوحة القائمة.
- الاختبار: الحالة الأخيرة من `content-access.security.integration.test.js` تؤكد DENY وعدم إنشاء submission.

### SEC-21-03 — bootstrap يعكس سحب صلاحية الإدارة

- **CWE-269 — Improper Privilege Management؛ Medium.**
- المتأثر: `activateOwnerAccount()`.
- الشرط: مستخدم لا يزال يحمل claim موثوقًا `admin=true` وبريدًا موثقًا، لكن `users/{uid}` أصبح غير إداري أو inactive. مستخدم عادي بلا claim لا يستطيع الاستغلال.
- الاستغلال المؤكد: الاستدعاء أعاد `role=admin, active=true` فوق سجل خادمي سُحبت منه الإدارة/عُطّل.
- الأثر: استرجاع صلاحية أُلغيت في قاعدة المنصة خلال عمر claim قديم.
- الإصلاح: transaction تتحقق من السجل الحالي؛ يسمح bootstrap عند غياب السجل، ويسمح refresh لمدير فعال، ويرفض إعادة تنشيط/ترقية سجل موجود مخالف. request body لا يختار الدور، والبريد وحده لا يكفي.
- الاختبار: `owner.security.integration.test.js`، 4/4؛ يغطي bootstrap المسموح، claims الناقصة/غير الموثقة، الدور المخالف، inactive، وclaim المسحوب.

### SEC-21-04 — تصريح رفع يسمح باستبدال bytes

- **CWE-863 — Incorrect Authorization؛ Medium.** السبب هو تفويض CREATE دون اشتراط غياب الكائن، مع مسار التصريح القابل لإعادة الاستخدام؛ ليس مجرد «خلل Emulator» نتجاهله.
- المتأثر: `storage.rules`، `prepareHomeworkUpload`, `registerHomeworkSubmission`, `assets/firebase-sync.js`.
- الشرط: حيازة تصريح رفع صالح ومعرفة المسار والاسم والحجم/MIME المحددين. التصريح capability مربوط بالطالب؛ لا يتيح مسار طالب آخر.
- الاستغلال المؤكد على ZIP الأصلية: رفع anonymous أول ببيانات `%PDF-ORIGINAL!`، ثم رفع `%PDF-ATTACKER!` إلى نفس token/path وبنفس الحجم/MIME. الرفع الثاني نجح، وقراءة الملف من Storage أثبتت تغير bytes. الاختبار السابق الذي يكتفي `allow update:false` لم يحقق write-once في runtime الفعلي.
- الأثر: استبدال كائن الرفع باستخدام نفس التصريح؛ وكان سجل التسجيل يشير إلى هذا المسار المتحرك. حالة writer سبق تفويضه واكتمل متأخرًا اختبرت كمحاكاة سباق محددة، وليست ادعاء تشغيل مهاجم Admin SDK.
- الإصلاح: CREATE يشترط `resource == null` وstatus prepared. الخادم يحجز التصريح ذريًا، وينسخ generation المحدد إلى `homework-submitted/{studentCode}/{uploadId}/{safeName}`؛ هذا المسار server-write-only. يتحقق من الحجم/MIME/checksum وmetadata الملكية، ثم ينشئ التسجيل ويحذف التصريح في transaction. رابط الطالب النهائي يشير للنسخة المثبتة، لا staging. توجد preconditions لنسخة المصدر والوجهة في GCS؛ الحماية لا تعتمد عليها وحدها في Emulator.
- الاختبار: `homework-upload.security.integration.test.js` يتحقق من bytes بعد إعادة رفع مطابقة ومختلفة، وبعد التسجيل، ومن writer متأخر إلى staging، ومن منع كتابة النسخة المقبولة. الحجم والمحتوى المقروءان متساويان مع الأصل، وليس مجرد نجاح API أو فشله.
- حد التكلفة: نسخة server-side واحدة لكل رفع مقبول بحد 10MB، لا proxy streaming جديد ولا polling. حذف staging بعد النجاح best effort. لا يُعاد نسخ الملف في retry.

### SEC-21-05 — استهلاك تصريح التسجيل غير ذري

- **CWE-362 — Concurrent Execution using Shared Resource with Improper Synchronization؛ Medium.**
- المتأثر: `registerHomeworkSubmission()`.
- الشرط: جلستان/طلبان صحيحان لنفس الطالب وتصريح صالح؛ كلاهما يقرأ التصريح قبل batch القديم.
- الاستغلال المؤكد: حاجز حول قراءتي metadata الفعليتين من Emulator جعل الطلبين يتجاوزان القراءة القديمة؛ اختبار baseline أنشأ **سجلين بدل سجل واحد** (`actual=2, expected=1`). لا تُستبدل عمليات Firestore/Storage بmock؛ الحاجز يرتّب السباق فقط.
- الأثر: تكرار التسجيل لنفس الملف والتصريح.
- الإصلاح: هوية canonical هي `homework_submissions/{uploadId}`، وحجز prepared→finalizing في transaction، ثم إنشاء سجل واحد وحذف token ذريًا. إعادة الطلب الصحيحة idempotent؛ الطلب المنافس قد يتلقى aborted ويعيد المحاولة بعد إتمام التسجيل. لا تُحذف السجلات القديمة أو تُغير هويات التقييمات الأخرى.
- الاختبار: الحالة M في `homework-upload.security.integration.test.js` تنفذ السباق نفسه وتؤكد سجلًا واحدًا وbytes الأصلية وretry لنفس الهوية. identity assignment/attempt يطابق التصريح والسجل في الطلب الأول وإعادة التسجيل إن كانت هذه الهوية متاحة.

لم تُصنف أي نتيجة High/Critical. لا توجد نتيجة مؤكدة في مصفوفة الاختبارات تدل على IDOR لطالب آخر أو تنفيذ إداري بلا صلاحية.

## 2. CONTENT ACCESS CONTRACT

| الوضع | العقد الخادمي للمحتوى القابل لإعادة الاستخدام |
|---|---|
| `full` | السابق والجديد مسموحان إذا كانا منشورين ومطابقين للصف/المجموعة/السنة/الترم والاستهداف |
| `from_joining` | يمنع المحتوى ذي تاريخ النشر المعروف السابق للانضمام؛ الجديد مسموح وفق بقية شروط الإتاحة |
| `custom` | محتوى الانضمام والجديد وفق الاستهداف المعتاد؛ المحتوى السابق مسموح فقط إذا ورد الطالب صراحة في `targetStudentCodes` |

هذا تفسير Admin UI الحالي: «السابق المحدد له بالاسم فقط»، لا تحويل custom إلى منع جميع المحتويات الجديدة غير المسماة. الحالة E الخاصة بـcustom غير مستهدف اختبرت على **المحتوى السابق**.

التواريخ: الانضمام `acceptedAt || activatedAt || enrolledAt || createdAt`؛ نشر المحتوى `publishAt || openAt || createdAt`. `updatedAt` لا يعيد نشر محتوى قديم. عند وجود تاريخ يوم فقط، المقارنة بين أيام Africa/Cairo؛ نفس يوم الانضمام صالح. إذا كان الطرفان instants، تبقى مهلة التوافق الموجودة خمس دقائق inclusive؛ ما قبلها بميلي ثانية مرفوض. legacy بلا تاريخ أصلي معروف يبقى متاحًا لـfrom_joining بعد شروط النشر والاستهداف، ولا تختفي جميع المناهج القديمة بالخطأ؛ custom legacy غير مؤرخ يحتاج استهدافًا صريحًا. هذا استثناء توافق معلن، وليس إثبات تاريخ نشر قديم.

سياسة assessments القائمة لم يُعد تصميمها؛ `contentAvailableAfterStudentJoined` نفسها لم تتغير. أضيفت فقط إلى submitAssignmentAnswer لإغلاق bypass المثبت.

## 3. DIRECT-ENDPOINT BYPASS RESULT

| طريق الوصول | النتيجة التنفيذية |
|---|---|
| getStudentResources: materials/questions/question_banks | التاريخ والاستهداف والأب المرتبط مطبقة؛ القديم مخفي |
| getStudentCurriculum: lectures/units | القديم غير متاح، الجديد متاح |
| getLectureContent: parent + children | قرار الأب وكل عنصر تابع مطبق |
| getCurriculumFileUrl | DENY للقديم/المخفي/غير المستهدف/الأب المخفي؛ لا يصدر URL جديد بعد إخفاء العنصر |
| recordLectureProgress: lectures/materials | DENY للمحتوى غير المتاح ولا يُنشأ progress مزيف |
| lecture_materials/bank_questions direct files | لا يتجاوز تاريخ الطفل أو إتاحة الأب |
| submitAssignmentAnswer | واجب تاريخي مخفي DENY حتى باستدعاء معرفه مباشرة |

لا توجد إضافة direct endpoint جديدة لـmaterials/questions؛ الواجهات الحالية للمحاضرات والملفات والاستهداف بقيت كما هي. الروابط التي صُدرت بالفعل قبل الإخفاء لها مدة/خصائص الإلغاء الموجودة أصلًا؛ الإخفاء يمنع **إصدار رابط جديد**، ولا يسحب تلقائيًا نسخة سبق تنزيلها أو signed URL لم ينته.

## 4. STORAGE REPLAY RESULT

| الحالة المطلوبة | نتيجة Emulator بعد الإصلاح |
|---|---|
| A أول رفع صالح | ALLOW ثم تسجيل النسخة المقبولة |
| B نفس token/path/bytes | DENY؛ المقبول لم يتغير |
| C نفس token/path وbytes مختلفة بنفس الحجم/MIME | DENY؛ قراءة bytes المقبولة تساوي الأصل |
| D–H expired/student/name/MIME/oversize | DENY |
| I تعديل metadata بعد الرفع | DENY، بما فيه تبديل download token |
| J مسار عشوائي | DENY |
| K assignment/attempt مخالف عند وجود binding | DENY قبل التسجيل وبعده |
| L replay بعد register | DENY للرفع؛ retry الصحيح للتسجيل يعيد نفس الهوية دون تعديل الملف |
| M تسجيلان متزامنان | سجل canonical واحد فقط |
| writer متأخر إلى staging | النسخة المقبولة لا تتغير |
| browser Admin يكتب accepted path | DENY أيضًا؛ الكتابة بواسطة Admin SDK فقط |

الرفع العام الحالي مستقل عن assignment/attempt، ولا ينشئ تحضير الرفع binding غير موجود في المنتج. في حالة توفر binding خادمي على token يجب مطابقته؛ لا يمكن للطلب اختراع assignment/attempt أو نقل ملف إلى محاولة أخرى. لا تغييرات على grants/locks الخاصة بتسليم إجابات الواجبات وتصحيحها.

## 5. ADMIN AUTHORIZATION MATRIX

الحصر يطابق جميع exports الفعلية من `functions/index.js` و`functions/entry.js`:

| التصنيف | العدد |
|---|---:|
| ADMIN | 64 |
| PORTAL-STUDENT | 14 |
| PORTAL-PARENT | 1 |
| PUBLIC | 11 |
| INTERNAL/TRIGGER/SCHEDULED | 23 |
| المجموع | 113 |

تفصيل كل اسم ونوعه وموقعه وحارس التفويض في `PHASE2_1_AUTHORIZATION_INVENTORY.json`. PUBLIC لا يعني تنفيذ عملية إدارية؛ يشمل HTTP health ووظائف العقود العامة/الدخول ذات تحققها الخاص. Triggers/scheduled ليست callable للمستخدم.

| سيناريو كل ADMIN callable | النتيجة |
|---|---:|
| unauthenticated | 64 DENY |
| authenticated بلا admin claim | 64 DENY |
| admin claim + email_verified=false | 64 DENY |
| claim موثق + users.role != admin | 64 DENY |
| claim موثق + admin role + active=false | 64 DENY |
| verified active admin | 64 اجتياز حد التفويض |

نتائج السيناريوهات 384 محفوظة في `PHASE2_1_ADMIN_AUTHORIZATION_MATRIX.json`. اختبار إضافي يطابق inventory بـruntime exports، وآخر ينفذ عمليات قراءة/كتابة إدارية ممثلة؛ مجموعة الإدارة 386 PASS.

تمييز مهم: طلب المدير المسموح ببيانات ناقصة قد يُرفض بسبب invalid-argument/not-found أو شرط عملية؛ اجتياز التفويض لا يعني أن كل CRUD اختُبر بطلب صالح. اختبارات التكامل القديمة تغطي عمليات حقيقية إضافية. لا يُعتمد على ظهور الأزرار أو Firestore Rules لتفويض Admin SDK.

## 6. PORTAL IDOR TEST RESULT

`portal-idor.security.integration.test.js`: 17 PASS. لكل الـ14 callable الخاصة بالطالب جرى تنفيذ:

- session A + studentCode B: DENY.
- parent session على endpoint مخصص للطالب: DENY.
- expired أو fake portal token: DENY.
- مسار A الصحيح: الموارد والمنهج والمحاضرة/URL والتقدم والتسليم/الامتحان/النقل/الترتيب ALLOW بطلبات صالحة؛ prepare/register الصحيحان يغطيهما اختبار الرفع أيضًا.
- إرسال studentCode A مع exam session مملوكة لـB: save/submit DENY، ولا تتغير حالة جلسة B.
- parent monthly report: parent A لبيانات A ALLOW؛ student token أو parent A لبيانات B أو expired/fake DENY.

`requirePortalSession` نفسه بقي مطابقًا للbaseline؛ التنفيذ تحقق من session مخزنة ومشفرة الهوية + mode + expiry، وليس studentCode وحده. وظيفة الامتحان start/save/submit بقيت مطابقة للbaseline.

## 7. FIRESTORE / STORAGE RULES RESULT

`npm run test:rules`: **14 PASS / 0 FAIL** على Java 21. `firestore.rules` لم تتغير إطلاقًا؛ `storage.rules` ضُيقت فقط.

تحقق التنفيذ من: الطلاب لمدير موثق فعال فقط؛ منع unauthenticated/non-admin/unverified/inactive؛ منع self-escalation لغير المدير؛ منع كل browser writes للحضور والـexam_attempts؛ منع قراءة/كتابة tokens/grants/locks/review history/portal sessions المحمية؛ منع تجاوز سياسة المحتوى من Firestore لغير staff؛ private storage؛ قيود MIME/الحجم/الاسم/انتهاء التصريح؛ metadata rewrite وbinary replay؛ unknown paths default deny.

الاستثناءات القائمة الموثقة بقيت: مدير موثق فعال يستطيع إدارة users وفق قواعدها؛ settings/platform عامة للقراءة؛ مدرس المنصة الإداري يستطيع رفع ملفات curriculum وفق قيودها؛ `homework_submissions` يسمح للمدير بسجل `teacher_class_check` محدود، لكن تعديل score مباشرة مرفوض. لم تُفتح exceptions لإصلاح frontend أو لتمرير الاختبارات.

## 8. MOTIVATION TEST CONCLUSION

الاختيار **B: assertion قديمة**، وليس تغيير حساب Production. المصدر `functions/lib/monthly-report.js` و`docs/REVIEW_REPORT_AR.md` يثبتان السياسة القائمة: academic60% + commitment40% مع الأوزان الفرعية وإعادة المعايرة، وlevel «جيد جدًا» عندما overallScore >=75.

Fixture سبتمبر نفسه قبل وبعد تصحيح manual grade:

| القياس | قبل التصحيح | بعد التصحيح |
|---|---:|---:|
| manual grade | 5/10 | 9/10 |
| امتحان آخر | 13/15 | 13/15 |
| academicScore / results.average | 68 | 88 |
| commitmentScore | 63 | 63 |
| overallScore | 66 | 78 |
| الحضور | 100% | 100% |
| إكمال واجب مستحق | 0% | 0% |
| monthly level | جيد | جيد جدًا |

Leaderboard في fixture له score=69 بأوزانه المستقلة القائمة، لكنه يأخذ level من monthlyEvaluation.level؛ ليس من threshold على leaderboard score. لم نوحد النظامين أو نغير scoring. عدّل الاختبار توقع level إلى «جيد جدًا» وأضاف assertions للقيم 66→78 و68→88 وcommitment63 وleaderboard69، فلا إخفاء لfailure ولا conversion عمياء إلى PASS. بعد الإصلاح اختبار cache/profile/ranking ينفذ على Emulator: PASS.

## 9. FILES CHANGED / EXACT CHANGES

ملفات الإنتاج:

- `functions/index.js`: chronology/parent visibility، guard الواجب المباشر، bootstrap transaction، claim/seal/register للملف.
- `functions/lib/content-visibility.js`: helper سياسة reusable المذكور.
- `functions/lib/student-identity.js`: export فقط للـnormalizeDigits الموجود لإعادة استخدامه؛ لا تغيير منطق الهوية.
- `storage.rules`: غياب resource + prepared status للرفع، accepted server-only path.
- `assets/firebase-sync.js`: uploadHomework يعيد URL/path النهائيين من التسجيل الخادمي.
- cache revision لهذه المكتبة في الصفحات التسع التي تحملها مباشرة: `exams.html`, `index.html`, `materials.html`, `parent.html`, `questions.html`, `reviews.html`, `student.html`, `teacher-login.html`, `theory-lectures.html`. لا تغيير UI أو handlers.

ملفات الاختبار/التوثيق:

- خمسة security integration suites: content-access / homework-upload / owner / portal-idor / admin-authorization.
- `scripts/testing/security-emulator.js`: بوابة demo/localhost فقط ومفتاح توقيع offline تجريبي يُحذف عند الخروج.
- `scripts/testing/authorization-inventory.js`: AST inventory؛ أضيف acorn devDependency وlock entry فقط. هذه أداة audit، ليست اعتمادًا للمنتج.
- `scripts/content-visibility.test.js`: عقد الوصول المصحح + أربع حالات سلوكية إضافية.
- `scripts/firebase-rules.emulator.test.js`: إضافة ثلاث حالات حقيقية؛ اختبار binary overwrite القديم بقي ولم يُعطل.
- `scripts/review.integration.test.js`: توقع stale level وassertions metrics فقط.
- `scripts/run-reliability-integration.js`: تشغيل suites الأمنية مع reset قاعدة demo قبل كل suite.
- `scripts/run-node-regression.js`: إعادة إنتاج نطاق 61 ملفًا غير Emulator، بنفس نطاق Phase 1.1.
- هذا التقرير وJSON inventory/matrix/test-results.

مقارنة المصدر مع ZIP أثبتت تطابق `assets/admin.js`, `assets/admin-entry.js`, `assets/offline-attendance.js`, `firestore.rules`, `functions/lib/monthly-report.js`, `scripts/build.js`. وباستخراج AST أثبتت تطابق recordAttendance/bulkMarkAttendance/upsertClassSession/prepareOfflineAttendance/syncOfflineAttendance/startExam/saveExamProgress/submitExam/requireStaff/requirePortalSession/contentAvailableAfterStudentJoined. تحسين startup 10→5 والتنزيل المتوازي مع ترتيب التنفيذ بقي كما هو؛ لم تضف listeners/polling.

## 10. EXACT TEST COUNTS / COMMANDS

Runtimes: Node **22.23.3** مطابق engines22.x، npm **11.9.0**، Temurin Java **21.0.12.1+1**، firebase-tools **15.26.0**، Firestore Emulator **1.22.0**، Storage Rules runtime **1.1.3**.

| الأمر | PASS | FAIL | ملاحظة |
|---|---:|---:|---|
| `node scripts/verify.js` | جميع checks | 0 | 16 pages، 125 handlers |
| `node --test scripts/scheduled-attendance-v7005.test.js` | 5 | 0 | تاريخ القاهرة وحدود الحضور |
| `npm test` | 320 | 0 | TAP؛ إضافة standalone payment-domain وcurriculum checks ناجحة |
| `node scripts/run-node-regression.js` | 390 | 0 | 61 ملفًا غير Emulator؛ يشمل npm scope وليس مجموعًا إضافيًا مستقلًا |
| `npm run test:rules` | 14 | 0 | تشغيل مستقل فعلي |
| `npm run test:review:integration` | 451 | 0 | 10 suites فعلية، ومنها rules نفسها |

تفصيل integration:

| suite | PASS / FAIL |
|---|---:|
| firebase-rules.emulator | 14 / 0 |
| review.integration | 5 / 0 |
| question-banks.integration | 2 / 0 |
| student-grades.integration | 2 / 0 |
| attendance-concurrency.integration | 5 / 0 |
| content-access.security.integration | 10 / 0 |
| homework-upload.security.integration | 6 / 0 |
| owner.security.integration | 4 / 0 |
| portal-idor.security.integration | 17 / 0 |
| admin-authorization.security.integration | 386 / 0 |

لا skipped أو cancelled في أي suite نهائية. لا تجمع الأرقام المتداخلة كأنها اختبارات مستقلة. الأربعة الجديدة في content-visibility تفسر 316→320 و386→390. suite security الجديدة إجمالًا 423/0.

أوامر Emulator المنفذة أدناه في بيئة Node22 وJava21. Dependencies كانت متاحة محليًا؛ لم يُنفّذ npm ci هنا. لإعادة التشغيل من الحزمة النظيفة استخدم npm ci في الجذر وفي functions أولًا:

```sh
# JAVA_HOME يشير إلى Java21؛ bin كل من Node22 وJava21 في PATH.
# لا credentials إنتاج؛ المشروع demo-technominds.
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    -u http_proxy -u https_proxy -u all_proxy npm run test:rules
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    -u http_proxy -u https_proxy -u all_proxy npm run test:review:integration
```

أزيلت proxies لهذه العمليات المحلية لأن cross-service Firestore requests في Storage Emulator يجب أن تبقى localhost. لم تُغير rules أو assertions لمعالجة بيئة التشغيل. تعطل التشغيل أولًا بسبب ملف Java محلي تالف، ثم نقص cached Storage JAR؛ أُعيدت البيئة وشُغلت الاختبارات بالفعل. هذه المحاولات ليست PASS. اختبارات baseline الإضافية للتشخيص: race القديم 0 PASS/1 FAIL مع سجلين، واختبار إثبات overwrite 1 PASS لإثبات حصول الاستغلال (ليس ضمن acceptance بعد الإصلاح).

## 11. REMAINING SECURITY RISKS / VERIFICATION LIMITS

- الاختبارات تنفذ handlers الفعلية بواسطة `.run` مع auth context موثوق تجريبيًا، وتستخدم Firestore/Storage Emulator الحقيقيين. **HTTP callable transport / JWT validation وبيئة Production NOT VERIFIED** في هذه المرحلة؛ لم نشغّل Auth/Functions Emulator أو نصل إلى الإنتاج. اختبارات browser Rules تستخدم SDK identities حقيقية في rules-unit-testing.
- توقيع روابط الملفات جرى بمفتاح RSA تجريبي محلي دون credentials أو طلب توقيع خارجي. القرار بإصدار/رفض URL مختبر؛ تنزيل signed URL من GCS Production NOT VERIFIED.
- signed URLs السابقة وبيرر download tokens الموجودة تتبع صلاحيات/مددها القائمة؛ لا إلغاء رجعي لتنزيل أو رابط صدر قبل الإخفاء. سياسة منع إصدار URL جديد مختبرة.
- legacy بلا تاريخ نشر أصلي معروف له الاستثناء المعلن أعلاه؛ لا توجد migration تخمينية أو تعديل Production Data.
- توقف invocation قسرًا بعد finalizing قد يتطلب grant جديدًا؛ لا تؤخذ lease قديمة لتشغيل writer ثانٍ فوق الملف. فشل بين copy/register قد يترك نسخة orphan واحدة محدودة الحجم، وحذف staging best effort. لم تضف cleanup scheduler أو listener خارج النطاق.
- accepted submissions القديمة لم تُنقل إلى المسار الجديد. المسار الجديد للمقبول الجديد؛ القديم محفوظ دون حذف. الحقوق الجديدة تمنع replay على existing staging objects، والتحويل التاريخي غير مطلوب ولم يُنفذ.
- Emulator لا يثبت كل خصائص GCS generation preconditions في Production؛ لذلك accepted-path deny + transaction claim + عدم إعادة النسخ + metadata/checksum checks مستقلة عن افتراض تكافؤ Emulator الكامل. late-writer test يكتب staging بواسطة Admin SDK لمحاكاة طلب سبق تفويضه، ولا يثبت مهاجمًا يستطيع الكتابة server-only.
- لا ادعاء اختبار أجهزة فعلية/كاميرا/متصفح هاتف أو رحلة نشر حية. regression DOM/navigation/buttons القديمة نجحت، ولم تتغير واجهتها. لم يُجرَ audit للثغرات المؤجلة خارج النطاق.

## 12. CLEAN UPDATED ZIP / ARTIFACTS

الحزمة: `technominds-phase2.1-security-closure.zip`، مصدر المشروع + الاختبارات + التقرير وJSON المطلوبة. لا node_modules، لا dist، لا npm/debug logs، لا temporary test directories أو runtimes أو مفاتيح الاختبار المولدة. المصدر الأصلي لم يكن يحتوي dist؛ أُزيل الناتج بعد الاختبارات.

**build نُفّذ بصورة غير مباشرة ضمن test suite** بواسطة `scripts/v7004-manifest-homework-hotfix.test.js` الذي يستدعي `scripts/build.js`. لم يُحذف build.js ولم تتغير بنية النشر. لا Deploy، لا Push، ولا Production Data modification.

قبول Phase2.1 هنا يعني نجاح إصلاحات الوصول/التفويض والرفع المحددة والانحدار المحلي مع الحدود المعلنة، ولا يعني انتهاء التدقيق الأمني لكل CWE أو تحققًا حيًا من Production.
