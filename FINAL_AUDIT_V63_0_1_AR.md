# التدقيق النهائي والإصلاحات — V63.0.2

## النطاق

تم فحص الواجهة متعددة الصفحات، Firebase SDK، Cloud Functions، قواعد Firestore وStorage، مسارات المواد والأسئلة والواجبات والنتائج، PWA، البناء والاختبارات. لم يتم الاتصال ببيانات Firebase الإنتاجية أو تعديلها.

## الأسباب الجذرية والإصلاحات

1. **تجاوز صلاحية تصحيح الواجب:** كان `assets/firebase-sync.js` يحتوي مسار `reviewHomeworkSubmissionDirect` كبديل عند تعطل الـFunction، وكانت `firestore.rules` تسمح لكل Staff بتحديث `homework_submissions`. هذا سمح بتجاوز `homework.review` وعدم إنشاء Audit Trail. أزيل البديل نهائيًا وأصبح `update` محظورًا من العميل.
2. **سجل التصحيح غير مكتمل ومعرض لتعارض متزامن:** كانت القراءة خارج عملية الكتابة ولم يسجل السجل الدرجة القديمة والدور والتعليق. أصبح `reviewHomeworkSubmission` يستخدم Firestore transaction ويسجل old/new grade وUID والدور والتعليق والتوقيت.
3. **احتمال Mixed Deployment:** لم يكن مسار Portal/Resources يثبت تطابق الواجهة والـFunctions. تمت إضافة `backendVersion` و`apiSchemaVersion` والتحقق منهما في الواجهة، مع خطأ `BACKEND_VERSION_MISMATCH` واضح وآمن.
4. **Cache busting قديم:** تم رفع asset/service-worker cache version إلى `63.0.2` وتغيير اسم cache لمنع استمرار ملفات 63.0.0.
5. **اختبار يثبت سلوكًا غير آمن:** الاختبار السابق كان يطلب وجود direct grading fallback. استبدل باختبار regression يثبت أن التصحيح Server-side فقط وأن القواعد تمنع update المباشر.

## مصدر الحقيقة للنتائج

`homework_submissions` هو مصدر حقيقة درجة الواجب. تقوم `portalResponse` بتمريره إلى `normalizeUnifiedResults` و`homeworkMetrics` لعرض قسم الدرجات وآخر درجة ومتوسط الواجبات دون إنشاء سجل درجات مكرر.

## الملفات المعدلة الرئيسية

- `functions/index.js`
- `functions/package.json` و`functions/package-lock.json`
- `assets/firebase-sync.js`
- `assets/app.js`
- `firestore.rules`
- `service-worker.js`
- صفحات HTML الأربع عشرة وملفات build/verify الخاصة بالإصدار
- `scripts/booking-homework-v628.test.js`
- `scripts/performance-delivery-v627.test.js`

## التوافق والبيانات

لا يوجد حذف collections أو تغيير Project ID أو rename مكسّر. ترحيل V63 الموجود additive ويعمل dry-run افتراضيًا. يجب نشر Functions والقواعد قبل الواجهة بسبب تحقق schema الجديد.

## حدود التحقق

نجحت اختبارات الكود والبناء محليًا. التحقق ببيانات طالب إنتاجية فعلية، الكاميرا على Safari/Chrome، وقياسات الشبكات الحقيقية يتطلب بيئة staging أو production وحسابات اختبار؛ لم يتم تخمين نتائجها ولم تُمس البيانات الحقيقية.
