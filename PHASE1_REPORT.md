# TECHNO MINDS — PHASE 1

النسخة الأساسية: المرفق eng-amr-khaled-academy-main(1).zip، إصدار 70.0.5.
التنفيذ محلي على نسخة مستقلة. لا Deploy، لا Push، لا اتصال أو تعديل لبيانات الإنتاج. لم تتغير قواعد Firebase أو Business Logic للامتحانات والواجبات والتقارير.

## 1. ROOT CAUSES

- reloadFromCloud كان يعرض بيانات core قبل وصول سجلات الحضور. التحميل المؤجل لم يضمن إعادة رسم Attendance أثناء التركيز على حقل أو فتح محرر.
- سجل IndexedDB القديم في طابور الأوفلاين كان يستطيع استبدال حالة قرأتها الواجهة من الخادم. أعيد إنتاج الخطأ في اختبار DOM قبل إصلاحه.
- findAttendance اختار أول سجل مطابق لليوم، حتى لو كان legacy قبل سجل الحصة الرسمي. أعيد إنتاج الخطأ، ثم أصلحت أولوية العرض دون حذف بيانات.
- prepareOfflineAttendance قارن منتصف اليوم UTC بالساعة الحالية. حد السبعة أيام اختلف بحسب ساعة التشغيل، ولم يمثل أيام القاهرة.
- اختبار scheduled-attendance استخدم تاريخاً ثابتاً مع Date.now الحقيقي؛ لذلك لم يكن ثابتاً بمرور الوقت. ثُبتت ساعة الاختبار.
- 15 ملف JavaScript كان تنزيلها ينتظر اكتمال الملف السابق، رغم أن ترتيب تنفيذ السكربتات الكلاسيكية يمكن حفظه دون تسلسل التنزيل.
- بدء الإدارة انتظر محتوى خمسة أقسام غير مفتوحة، وأطلق تحميل السجلات التاريخية عند كل دخول.

## 2. FILES CHANGED

- `assets/admin-entry.js`
- `assets/admin.js`
- `assets/firebase-sync.js`
- `exams.html`
- `functions/index.js`
- `functions/lib/attendance-domain.js`
- `index.html`
- `materials.html`
- `package.json`
- `parent.html`
- `questions.html`
- `reviews.html`
- `scripts/scheduled-attendance-v7005.test.js`
- `scripts/verify.js`
- `student.html`
- `teacher-login.html`
- `theory-lectures.html`
- `scripts/phase1-reliability.test.js`

تغيير HTML يقتصر على rev لمراجع الملفات المعدلة، لمنع إعادة استخدام نسخة قديمة من ذاكرة المتصفح/Service Worker. لم يتغير تصميم الصفحات أو أسماء المسارات أو رقم الإصدار أو lockfiles.

## 3. EXACT CHANGES

- إدراج ملفات الإدارة الخمسة عشر مع async=false قبل انتظار تحميلها: تنزيل متزامن مع تنفيذ حسب ترتيب الإدراج؛ نفس ترتيب dependencies، ثم نفس حدث DOMContentLoaded. لم يُحذف أي enhancement.
- طلب shell من loadSiteData: students، bookings، groups، payments، settings فقط. materials/questions/exams/reviews/assignments تُقرأ مرة واحدة عند فتح قسم يحتاج المحتوى، بإعادة استخدام loader الحالي. لا إعادة قراءة collections الأساسية في هذه المرحلة.
- السجلات التاريخية تُحمّل مرة واحدة عند الحاجة في students/exams/assignments/warnings/backup، مع منع الطلبات المتطابقة أثناء الانتظار. لا scan تاريخي تلقائي بعد تسجيل الدخول.
- Attendance تستخدم getAttendanceForDate الموجود، مع query على date، source:'server'، وحد 501، ورفض العرض إذا زادت النتائج عن 500. يشمل نطاق اليوم attendance وrecitations وعلامات homework_submissions الخاصة بواجب الحصة. سجل النقل bounded كذلك؛ يعاد استخدامه بعد تحميله.
- أثناء الانتظار لا يظهر roster يوحي أن الجميع غير مسجل. عند الفشل يظهر خطأ وزر إعادة محاولة. تغيير الصف/المجموعة لا يعيد query اليوم كله؛ الفلترة تتم محلياً بعد وصول بيانات اليوم.
- قراءة scope أحدث لا تُمحى بقراءة history متأخرة. اختيار الصف والمجموعة محفوظ أثناء إعادة الرسم. الردود المتأخرة للمحتوى لا تستبدل القسم الذي انتقل إليه المستخدم.
- سجل session مقدم على legacy اليوم في العرض. سجل queue لا يستبدل حالة server المثبتة؛ بعد إقرار المزامنة، شاشة Attendance تعيد القراءة من الخادم.
- علامات التطبيق العملي وواجب الحصة تُقرأ مع اليوم؛ علامات homework المقيمة لا تمحى عند تحديث علامات الحصة.
- attendanceDateInWindow في ملف domain الحالي يستخدم تاريخ القاهرة المدني، ±7 أيام شاملة للطرفين، ويرفض التواريخ المستحيلة. assertAttendanceDay يرفض التاريخ الذي يتحول إلى يوم آخر عند parsing.
- نافذة ±7 كانت خاصة بالتجهيز للأوفلاين؛ لم أفرضها كسياسة جديدة على manual/QR/bulk/session. تلك المسارات تحتفظ بتحقق العضوية التاريخية، أيام المجموعة، وحصة صحيحة وغير ملغاة. syncOfflineAttendance يحتفظ بانتهاء التجهيز وفترة المسح 21 يوماً والتحقق من يوم القاهرة. لم تُضعف هذه القيود.

## 4. ATTENDANCE CROSS-DEVICE RESULT

PASS في اختبارات DOM/VM: واجهتان مستقلتان مع مصدر server fixture مشترك؛ الأولى تكمل كتابة السجل، والثانية تنتظر وصول القراءة ثم تعرض present لنفس الطالب/التاريخ/المجموعة. نجحت اختبارات الفشل/retry، أولوية session، queue قديمة، hydration متأخرة، وعلامات الحصة.

المصدر الرسمي الحالي هو collection attendance. الهوية الحديثة studentCode_classSessionId؛ الحصة الافتراضية scheduleId_date. الهوية legacy studentCode_date مازالت مدعومة. manual/QR/offline تستخدم commitAttendanceOnce مع transaction وrequest fingerprint. قد تبقى وثائق legacy قديمة بجانب وثيقة حديثة؛ أصلحنا اختيار الحالة، ولم نحذف وثائق.

NOT VERIFIED: تشغيل لابتوب وموبايل فعليين على Firebase، وكذلك writes/read-through-cache في Firebase Emulator. المحاكاة ليست دليلاً على تجربة إنتاج فعلية.

## 5. ADMIN STARTUP/PERFORMANCE RESULT

- مصادر bootstrap الحرج: 10 → 5 (أربع collections وsettings). هذا عدّ مصادر queries، وليس عدّ document reads أو قياس تكلفة مالي.
- تنزيل ملفات الإدارة: 15 انتظاراً متسلسلاً → إدراج جميع الطلبات ثم انتظارها، مع async=false وترتيب التنفيذ محفوظ.
- المحتوى غير النشط والتاريخ لا يمنعان أول workspace. لا polling أو listeners جديدة.
- لم تُحذف مكتبات/legacy wrappers: الملفات الحالية تعدّل renderers وتثبّت handlers حسب الترتيب.
- auth observer يمنع سباق sign-in الحالي؛ getIdTokenResult(false) محفوظ. تحقق staff المتكرر لم يُستبدل بـTTL cache حتى لا يتغير سلوك إلغاء الصلاحية.
- القراءات/اشتراكات students وbookings الموجودة أصلًا محفوظة؛ وبالتالي لا ندّعي إزالة جميع القراءات المتكررة. لوحة التنبيهات الحالية قد تقرأ بيانات شهرية عبر callable بعد ظهور workspace.
- مؤشرات overview التي تحتاج سجلات غير محملة تظهر — بدلاً من صفر غير مثبت، وتتوافر عند قراءة البيانات المطلوبة. أرقام students/bookings/core تظهر فور اكتمال shell.
- NOT VERIFIED: زمن دخول فعلي، latency الشبكة، cold starts، p95، Mobile CPU/paint. لا توجد نسبة تسريع زمنية مثبتة.

## 6. EXAM AUDIT RESULT

نجحت اختبارات النسخة الحالية الخاصة بـtargeting، availability، resume/progress، أنواع الأسئلة/الدرجات، retake، duplicate-submit، التصحيح، النتيجة الرسمية مقابل legacy، الامتحان الورقي، absence finalization، شهر التسليم، امتداد الامتحان بين شهرين، وغياب دون score مختلق. اختبارات static تحقق ربط الأزرار ووجود authorization وعدم إظهار الإجابة قبل السماح؛ الاختبارات domain/VM تتحقق من السلوك الذي تغطيه fixtures.

لا تعديل في منطق الامتحانات. NOT VERIFIED: جميع خطوات إنشاء/تعديل/نشر/تسليم امتحان عبر Auth/Firestore حقيقي، أو تفاعل desktop/mobile فعلي، وRules authorization في Emulator.

## 7. HOMEWORK AUDIT RESULT

نجحت اختبارات targeting ونشر/إغلاق المحتوى، types، duplicate/retake، التصحيح، النتائج التاريخية، legacy identity، احتساب متطلبات شهر النشر، وعدم اختفاء corrected submission عند فقد assignment. علامات واجب الحصة منفصلة عن الدرجة المقيمة في projections الحالية.

لا تعديل في منطق الواجبات. NOT VERIFIED: رفع ملف فعلي إلى Storage، كافة أزرار workflow على هاتف، أو تنفيذ secure submission تحت Rules/Emulator.

## 8. PROFILE/REPORT RESULT

نجحت اختبارات unified profile وmonthly-report/report-hotfix/final-student-flow: official correction precedence، عدم تكرار assessment، صفر مقابل null، نسبة بدون academic evidence، عنوان الشهر وكفاية البيانات، cross-month attribution، homework legacy، الحضور والعملي والدفع والتحفيز، ورسالة وصورة تقرير ولي الأمر. desktop fallback ينزل الصورة ويفتح النص ولا يدّعي إرسال الصورة آلياً.

لا تعديل في report calculations أو مصادر portal. NOT VERIFIED: رسائل WhatsApp فعلية/صور مشاركة فعلية، ودقة بيانات الإنتاج نفسها.

## 9. ROUTE/BUTTON RESULT

node scripts/verify.js: كل 16 صفحة HTML ومراجعها المحلية سليمة؛ كل 125 inline action handler معرف. اختبارات navigation/buttons، responsive markup، DOM للحجوزات والحضور والملف، ومحاولات الرد المتأخر نجحت. الأزرار المعتمدة على async data لها loading/error في الإصلاحات الجديدة.

NOT VERIFIED: فحص تفاعلي يدوي شامل لكل زر على متصفح desktop وهاتف؛ الكاميرا/QR permissions؛ browser layout screenshots.

## 10. TEST RESULTS

| الأمر | النتيجة الفعلية |
|---|---|
| node scripts/verify.js ضمن npm test | PASS؛ 16 صفحة، 125 handler |
| npm test النهائي | 303 PASS / 0 FAIL / 0 SKIP |
| كل scripts/*.test.js باستثناء *.integration.test.js و*.emulator.test.js | 373 PASS / 0 FAIL / 0 SKIP |
| اختبارات Phase 1 الجديدة، ضمن المجموعين | 14 PASS / 0 FAIL |
| scheduled-attendance، ضمن المجموعين | 5 PASS / 0 FAIL؛ baseline كان 4/5 |
| payment-domain وcurriculum-v61 standalone ضمن npm test | PASS، scriptان؛ ليست عدداً إضافياً لحالات node:test |
| npm run test:rules | NOT VERIFIED؛ توقف قبل تشغيل الحالات: Java 17، firebase-tools يتطلب Java 21+ |
| integration suites التي تحتاج Emulator | NOT VERIFIED؛ لم تُشغّل |

المجموعان متداخلان، ولا يصح جمع 303 و373. يحتوي test suite على فحوص static وdomain وVM وDOM؛ لا تُعامل كلها كـE2E Firebase.

تم تثبيت dependencies عبر npm ci من lockfile الحالي لتشغيل اختبارات DOM. بيئة التشغيل Node 24.19.0 بينما المشروع يحدد Node 22.x؛ لم تتغير dependency versions أو lockfiles. نُفذ build بصورة غير مباشرة ضمن scripts/v7004-manifest-homework-hotfix.test.js؛ لم يُنفذ deploy أو push. dist/ ناتج مولّد وليس جزءاً من المصدر النظيف.

## 11. REMAINING RISKS

- يلزم Java 21+ لتشغيل Rules/Emulator integration، ثم اختبار جهازين وحساب تجريبي في بيئة اختبار مستقلة.
- bulkMarkAttendance مازال يقرأ الحالة ثم يكتب الغائبين بـbatch؛ تزامن bulk مع manual في نفس اللحظة يحتاج اختبار transaction concurrency في Emulator. لم أغيّر هذا المنطق بناءً على فحص ثابت وحده.
- حد اليوم 500، core students 200، وسجل النقل 500: تجاوزها يفشل بوضوح في scope بدلاً من عرض سجل ناقص. historical loader الحالي للحضور/العملي محدود 300 ويُقرأ عند الحاجة؛ الملفات/التقارير canonical لها مساراتها الحالية. لم تُعاد هيكلة historical loader.
- session identity الحديثة تمنع تكرار نفس الحصة في المسارات transaction الحالية؛ تعدد جلسات المجموعة في اليوم نفسه يحتاج مراجعة workflow الحالية التي تختار اليوم، إن كان مستخدماً فعلياً.
- تكلفة document reads والزمن الفعلي لم يُقاسا؛ أرقام bootstrap تخص عدد مصادر القراءة فقط.
- Phase 2 security/CWE refactor لم يبدأ.

هذا تقرير Phase 1 التاريخي؛ نتائج الإغلاق الحالية موثقة في PHASE1_1_REPORT.md.
