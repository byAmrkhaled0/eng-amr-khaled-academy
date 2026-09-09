# الفحص النهائي والإصلاحات — Eng. Amr Khaled Academy / Techno Minds

**الإصدار:** 63.0.0  
**تاريخ الفحص:** 10 أغسطس 2026  
**Node.js المستهدف:** 22

## النتيجة التنفيذية

تم تنفيذ الإصلاحات داخل الكود مع الحفاظ على أسماء Collections والبيانات القديمة. التصميم الجديد إضافي ومتوافق للخلف: المحاولات القديمة لا تُستبدل، ولا يلزم حذف بيانات أو إعادة إنشاء قاعدة Firebase.

## المشكلات وأسبابها والحل المنفذ

| المجال | السبب المكتشف | الحل المنفذ |
|---|---|---|
| إعادة تسليم الواجب | الاعتماد على حالة الواجهة والكتابة فوق مستند التسليم | قفل ذري داخل Transaction في `homework_submission_locks`، ومحاولات immutable بأرقام مستقلة، ورفض أي محاولة ثانية متزامنة أو لاحقة |
| إعادة المحاولة | لم يوجد Grant مدقق لكل طالب | `homework_attempt_grants` أحادي الاستخدام يسجل المدرس والوقت والسبب ورقم المحاولة، مع Callable خاصة بالمدرس/الإدارة |
| تسريب الإجابة | الواجهة كانت تستقبل كائنات تصحيح أكثر مما تحتاج | Public Projection آمن للواجب والامتحان؛ حذف `correctAnswer` وحقول التصحيح، وعدم الكشف بعد الإغلاق إلا عند تفعيل المدرس للخيار صراحة |
| الدرجات | مصادر متفرقة ونسب غير موحدة وتكرار محتمل | Normalization وDeduplication موحدان للامتحان والواجب والعملي واليدوي، وحساب `score / maxScore × 100` |
| الواجب في تقرير ولي الأمر | الحالة موجودة دون سجل درجة موحد | إضافة نتائج الواجب المصحح، آخر درجة واجب، ومتوسط واجبات مستقل إلى البوابة والتقرير |
| الالتزام بالواجب | اختلاط أيام الحضور/النشاط بعدد الواجبات | الحساب من معرفات الواجبات المطلوبة والمستهدفة فعلياً مقابل المسلّمة، مع فصل نسبة التسليم عن متوسط الدرجة |
| حالات الواجب | تحميل/عرض مكرر ومزدحم | خمس حالات حصرية، بطاقات مختصرة، تفاصيل عند الطلب، وLazy Loading بست بطاقات في كل دفعة |
| تعديل الواجب/الامتحان | التعديل كان يغيّر مرجعاً بدأت عليه محاولات | Versioning في `assessment_versions` مع Snapshot للأسئلة والدرجة داخل كل محاولة |
| نموذج الامتحان | بقاء `examId` بعد الإغلاق | فصل واضح بين الإضافة والتعديل ومسح الحالة والأسئلة والمعرف عند الإغلاق |
| الحذف | حذف مباشر قد يترك سجلات تاريخية بلا مرجع | Archive/Soft Delete مع Queue لتنظيف ملفات Storage بعد التحقق من عدم وجود مرجع |
| حضور مجموعة يوم واحد | افتراض وجود يومين ثابتين | قراءة مصفوفة الأيام الفعلية ودعم يوم واحد أو أكثر وفق `Africa/Cairo` |
| الغياب الجماعي | طلب منفصل لكل طالب وتحديث ترتيب متكرر | Callable واحدة وBatch Writes وتحديث/إبطال تجميعي واحد |
| QR والبوابة | رمز واحد قد يفتح بيانات حساسة | `attendanceCode` عشوائي مستقل، وPortal Session عشوائية قصيرة العمر لا تُخزن إلا في `sessionStorage` |
| صلاحيات المساعد | إمكان تعديل حقول حساسة عبر مسارات عامة | Rules تعتمد على فرق الحقول؛ منع كود الطالب والدرجات والمدفوعات، والتصحيح يتطلب Permission صريحة |
| الأداء والتكلفة | استعلامات واسعة وكتابات Migration عند كل دخول | Migration عند الحاجة فقط، Pagination مرتبة، Lazy transfer queries، وحدود خادم، و`enrolledCount` ذري |
| الترتيب | الاعتماد على عينة محدودة | Pagination كاملة مرتبة لحساب المصدر، مع إبطال تجميعي آمن بدلاً من تحديث لكل طالب |
| الموبايل والوصول | تبويبات مزدحمة ونوافذ بلا إدارة Keyboard | تنقل موبايل مختصر، أهم 3 مؤشرات أولاً، Focus Trap وEscape واسترجاع التركيز وARIA وLabels وأخطاء عربية |
| الكاش وCSP | احتمال تخزين رابط يحمل كوداً واعتماد واسع على inline script | منع كاش أي URL به بيانات دخول، إزالة `unsafe-inline` من `script-src` مع إبقاء توافق handlers القديمة مؤقتاً في `script-src-attr` |

## الملفات الرئيسية المعدلة

- `functions/index.js`
- `functions/lib/homework-domain.js`
- `functions/lib/portal-results.js`
- `functions/lib/attendance-domain.js`
- `assets/firebase-sync.js`
- `assets/app.js`
- `assets/admin.js`
- `assets/v60-admin-workflow.js`
- `assets/v61-design.css`
- `firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `vercel.json`
- `service-worker.js`
- `scripts/platform-v63.behavior.test.js`
- `scripts/exam-workflow-v621.test.js`
- `scripts/build.js`
- `scripts/verify.js`
- `scripts/verify-dist.js`
- `package.json` و`functions/package.json` وملفات lock
- صفحات HTML الأربع عشرة لتحديث الأصول إلى 63.0.0

## الاختبارات التي تم تشغيلها

| الفحص | النتيجة |
|---|---|
| JavaScript Syntax وJSON | ناجح |
| `npm test` | **54/54 ناجح، 0 فشل** |
| اختبارات V63 السلوكية | **14/14 ناجح** وتشمل القفل والتزامن وإعادة المحاولة والخصوصية والنسب والحضور والقواعد والأرشفة والـPagination |
| `npm run build` | ناجح؛ إنشاء `dist` للإصدار 63.0.0 |
| `npm run verify:dist` | ناجح؛ 14 صفحة ولا توجد ملفات backend أو `.env` داخل التوزيعة |
| `npm audit --omit=dev` | 0 ثغرات |
| `npm audit --prefix functions --omit=dev` | 0 ثغرات |
| Node.js 22 | ناجح: الاختبارات السلوكية والبناء والتحقق من `dist` |
| فحص المسارات والأصول والأزرار | ناجح آلياً لكل الصفحات المحلية و97 handler |
| RTL والوضع الداكن وResponsive viewport | ناجح ضمن فحوص التغطية الثابتة عند 320/375/768/1024/1440 CSS breakpoints |
| أسرار حساسة | لا توجد مفاتيح خادم أو Private Keys؛ إعداد Firebase Browser وVAPID الموجودان Public client configuration |

تعذر تشغيل Firebase Emulator وتجربة متصفح Playwright المرئية داخل بيئة الفحص بسبب عدم توفر ملفات Emulator/Chromium ومنع تنزيلها خارجياً. لذلك لم يُدّعَ نجاح نشر حي أو جلسة متصفح فعلية؛ عُوّض ذلك باختبارات Domain سلوكية، وفحص Rules/JSON/Routes/CSS/Handlers، وبناء التوزيعة. يجب تنفيذ Smoke Test الحي بعد النشر المرحلي كما هو موضح أدناه.

## Firestore Indexes الجديدة/المحدثة

- TTL على `_portal_sessions.expiresAt`.
- استعلامات الطالب المرتبة حسب الكود والتاريخ: `attendance`, `grades`, `homework_submissions`, `recitations`, `monthly_payments`.
- Grants حسب `studentCode + status`.
- Pagination الإدارة: الطلاب/الواجبات/الامتحانات/المواد حسب الاستهداف و`updatedAt`.
- محاولات الامتحان والتسليمات حسب النشاط أو الطالب ووقت التسليم.
- الحضور حسب الصف/المجموعة والتاريخ.
- طلبات التحويل حسب الطالب/الحالة و`createdAt`.

يحتوي `firestore.indexes.json` النهائي على 39 Composite Index و7 TTL field overrides. انتظر اكتمال بناء الفهارس في Firebase قبل فتح الإصدار للجمهور.

## Migration المطلوبة

الترحيل Additive ولا يغيّر أسماء الحقول/Collections القديمة. ينشئ نسخة احتياطية أولاً ثم:

1. يولّد `attendanceCode` للطلاب الذين لا يملكونه.
2. ينشئ أقفال التسليمات القديمة دون تعديلها.
3. يحسب `enrolledCount` للمجموعات.
4. يضيف إعداد أوزان الدرجات الافتراضي القابل للتعديل.

بعد نشر Functions، سجّل الدخول كـAdmin وافتح Console في لوحة الإدارة:

```js
await MFCloud.migratePlatformV63(false) // Dry run
await MFCloud.migratePlatformV63(true)  // Apply بعد مراجعة النتيجة
```

يمكن إعادة تشغيل الترحيل بأمان؛ العمليات مصممة لتجاوز السجلات المكتملة وعدم الكتابة بلا تغيير.

## خطوات النشر

```bash
npm install
npm install --prefix functions
npm test
npm run build
npm run verify:dist
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

1. انتظر اكتمال بناء Firestore Indexes.
2. نفّذ Dry Run ثم Apply للـMigration من حساب Admin.
3. اختبر حساب طالب/ولي أمر/مساعد تجريبي حقيقي دون تعديل سجلات تاريخية.
4. انشر الواجهة أخيراً:

```bash
firebase deploy --only hosting
```

عند استخدام Vercel يمكن نشر `dist` بعد نجاح الخطوات نفسها، مع الإبقاء على Firebase Functions/Rules/Indexes منشورة أولاً.

## Smoke Test بعد النشر

- تسليم واجب مرة واحدة ثم محاولة ثانية ومن تبويبين.
- Grant إعادة محاولة واحد ثم استهلاكه.
- Network response للطالب لا يحتوي `correctAnswer`.
- فحص 8 من 10 = 80% في بوابة الطالب وولي الأمر.
- حضور يدوي وQR لمجموعة يوم واحد.
- محاولة طالب قراءة طالب آخر ومساعد تعديل كود/درجة: يجب الرفض.
- إضافة امتحان جديد بعد إغلاق تعديل امتحان سابق.
- أول وآخر صفحة من Pagination.
- فحص Console وRTL/Dark على عروض 320 و375 و768 و1024 و1440.

## الرجوع إلى النسخة السابقة

1. أوقف نشر Hosting الجديد أو أعد نشر Hosting الإصدار 62.9.0.
2. أعد نشر Functions وRules السابقة من نسخة الإصدار السابق.
3. لا تحذف Collections الجديدة؛ وجودها لا يكسر النسخة القديمة ويحافظ على سجل المحاولات.
4. احتفظ بنسخة Backup التي أنشأها Migration. لا تستعدها إلا عند وجود فساد بيانات مثبت.
5. إذا كان الرجوع بسبب الواجهة فقط، أعد Hosting فقط واترك Rules/Functions الأمنية الجديدة ما لم يظهر تعارض مثبت.
6. راجع `system_errors` وسجلات Cloud Functions قبل وبعد الرجوع.

## ملاحظات التوافق

- لم تُحذف ميزة أو Collection تاريخية.
- رموز الطلاب القديمة تعمل خلال Migration التوافقية، لكن البيانات الحساسة بعد الدخول تعتمد على Session قصيرة.
- المحاولات والدرجات القديمة تُقرأ عبر طبقة Normalization؛ الجديدة تُحفظ في صورة immutable/versioned.
- `node_modules` غير موجود داخل حزمة التسليم النهائية.

