# Changelog

## 63.0.5 — 2026-08-11

- جعل ضغطات التنقل في لوحة الإدارة تستجيب بصريًا قبل بناء القسم، ومنع إعادة رسم الأيقونات التي تم تجهيزها مسبقًا.
- تحديث بطاقة تصحيح الواجب ومحاولة الامتحان المتأثرة فقط بعد تأكيد الخادم بدل إعادة بناء القسم كاملًا.
- عرض تسليمات أحدث واجب نشط ومحاولات الامتحان الحالي افتراضيًا، مع إبقاء السجلات السابقة محفوظة ومحدودة العرض.
- اختيار أحدث واجب وامتحان تلقائيًا في تقارير «مين سلّم ومين لسه» وحفظ اختيار الإدارة داخل الجلسة المؤقتة.
- إصلاح عناصر `hidden` التي كانت تظل ظاهرة بسبب قواعد الشبكة، وإضافة استجابة تحميل فورية للأرشفة والحذف.
- رفع إصدار الواجهة والـFunctions وAPI Schema والأصول وكاش Service Worker إلى `63.0.5`.

## 63.0.4 — 2026-08-10

- ربط تقرير ولي الأمر بالواجبات المطلوبة الفعلية مع حالات مطلوب، متأخر، قيد التصحيح وتم التصحيح وإظهار الدرجة بعد اعتمادها.
- إزالة كود الطالب من روابط التنقل، والإبقاء على توافق الروابط القديمة مع تنظيف العنوان بعد نجاح التحقق.
- تحسين حفظ تصحيح الواجب على الهاتف وربط حالة التحميل بزر الحفظ المضغوط وعدم تحديث الواجهة قبل تأكيد الخادم.
- إضافة حدود لبيانات التصحيح وتسجيل UID والبريد والنتيجة في سجل نشاط خادمي.
- رفع إصدار الواجهة والـFunctions وAPI Schema والأصول وكاش Service Worker إلى `63.0.4`.

## 63.0.3 — 2026-08-10

- جعل تصحيح الامتحانات من Cloud Functions فقط، مع سجل مراجعة وهوية Admin ودرجات موزونة لا تتجاوز الدرجة النهائية.
- مزامنة نتيجة التصحيح مع بوابتي الطالب وولي الأمر دون أن يغيّر تصحيح محاولة قديمة آخر نتيجة صحيحة.
- إظهار تأكيد تسليم الامتحان وقفل المحاولة، وإتاحة نموذج الإجابة بعد التصحيح فقط عندما يسمح Admin بذلك.
- إتاحة نموذج حل الواجب بعد التصحيح وفق إعداد الواجب، مع استمرار منع المحاولة الثانية إلا بمنحة Retake خادمية.
- إزالة الكتابة المباشرة من المتصفح لتصحيح الامتحان ومتابعة الحصة وحالة الحجز وحذف الطالب وتغيير كوده.
- إبقاء كود البوابة في `sessionStorage` فقط وإزالته من روابط التنقل بعد التحقق، مع عدم تخزين صفحات البوابات في Service Worker.
- إضافة اختبارات Emulator حقيقية لقواعد Firestore وStorage واختبارات رجوع لرحلة الواجب والامتحان؛ مجموعة الاختبارات المحلية 61/61.
- رفع إصدار الواجهة والـFunctions والأصول والكاش إلى `63.0.3`.

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
# v63.0.2 — 2026-08-10

- قصر كل صلاحيات الإدارة على حساب Admin النشط الحاصل على Custom Claim موثّق، وإغلاق أدوار Teacher وAssistant القديمة في Functions وFirestore وStorage والواجهة.
- التحقق من الصلاحية عند تغيّر Firebase ID Token وتسجيل الخروج عند سحبها أو تعطيل الحساب.
- منع تخزين أكواد البوابات ومسودات الامتحان تخزينًا دائمًا، ومنع Service Worker من تخزين صفحات البوابات الحساسة.
- إضافة أنواع صريحة للأزرار والخانات العامة وتحسين أسماء أزرار التقييم وربط الحقول الأساسية.
- إضافة صفحة 404 حقيقية وإزالة تحويل المسارات غير الموجودة إلى الصفحة الرئيسية.
- إضافة اختبارات رجوع أمنية خاصة بنظام Admin الوحيد ورفع مجموعة الاختبارات إلى 57 اختبارًا.
