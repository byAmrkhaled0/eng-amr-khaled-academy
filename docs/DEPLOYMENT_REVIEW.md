# قائمة النشر والمراجعة

لم يُنفذ أي نشر إنتاجي. الحزمة 67.8.5 للمراجعة والاختبار أولًا. النسخة العامة التي فُحصت أظهرت أصول واجهة 67.8.4 وGET /api/health بإصدار 67.8.3؛ هذا قياس لنقطة واحدة ولا يثبت إصدارات كل Functions أو القواعد والفهارس. لم يتوفر حساب إدارة تجريبي مصرح به.

## ما يلزم نشره بعد مراجعة النتائج

- الواجهة: dist الناتجة من build، تشمل الهيدر والروابط، نماذج الدفع، التقرير، الحضور المحلي والكاش 67.8.5. لا تنشر scripts/browser أو docs كبديل للواجهة.
- Functions من functions/entry.js: انشر حزمة functions كلها، لأن shared portalResponse وrequestIp وcreatePlatformBackup وmonthly report source مشتركة بين صادرات كثيرة. لا يكفي نشر Health وحده.
- وظائف جديدة: getPaymentDashboard، getPaymentHistory، prepareOfflineAttendance، previewAutomaticBackup؛ وinvalidateReport_attendance / grades / homework_submissions / exam_attempts / exam_sessions / recitations / monthly_payments / student_transfer_requests / students / assignments / exams / class_sessions.
- وظائف معدلة جوهريًا: createPaymentTransaction، editPaymentTransaction، cancelPaymentTransaction، recordAttendance، syncOfflineAttendance، getParentMonthlyReport، getStudentMonthlyReportAdmin، prepareMonthlyParentReports، scheduledPlatformBackup، createBackupNow، restoreAutomaticBackup، repairLegacyExamFormats، getPlatformHealth وgetPlatformHealthHttp. صادرات أخرى تستخدم المنطق المشترك أيضًا؛ القائمة كاملة في FUNCTION_INVENTORY.md.
- firebase.json: /api/health إلى getPlatformHealthHttp، مطابق Vercel؛ GET JSON بالشكل نفسه. احتُفظ بالـ callable getPlatformHealth للتوافق، لكن فحص النشر يستخدم HTTP GET.
- firestore.indexes.json: فهرس month+academicYear لملخصات الشهر؛ payment_transactions يتضمن paymentDate+status ومعهما month أو academicYear أو كليهما، بحسب الفلاتر. إضافات TTL على _attendance_preparations.expiresAt و_attendance_requests.expiresAt.
- Firestore rules: لم تفتح قواعدها أو تضف قراءة عامة؛ المجموعات الداخلية الجديدة مغلقة بالقيد الافتراضي. أعد نشر النسخة المتطابقة والتحقق منها إذا كانت الحالية غير معلومة. Storage rules تفصل create/update عن read/delete مع بقاء قيد المدير الفعال والمطالبة admin والتحقق من البريد. اختُبرت هذه الشروط على المحاكي.

## خطوات قابلة للتنفيذ على staging

1. اختر مشروع Firebase تجريبيًا صراحة بـ --project، وتهيئة واجهة متجهة إليه. المشروع demo-technominds خاص بالمحاكي فقط. راجع .firebaserc، firebase-config.js، وجهات Vercel، الوظائف وأسرار الحساب قبل أي نشر.
2. Node 22 المعلن في المشروع، Java 21 للمحاكي، `npm ci` و`npm --prefix functions ci`. نفذ `npm test` و`npm run test:review:integration` و`npm run build` و`npm run verify:dist`. هذه المراجعة استخدمت Node 24 في بيئة العمل؛ أعد التشغيل على Node 22 في CI.
3. انشر الفهارس والقواعد وStorage إلى staging، وانتظر اكتمال بناء الفهارس. قواعد Storage التي تقرأ Firestore تحتاج إعداد IAM بين الخدمتين في المشروع؛ المحاكي لا يثبت IAM الإنتاج.
4. انشر Functions كلها وتحقق من الجداول الزمنية الجديدة/القائمة. لا تشغّل المهام المجدولة على بيانات حقيقية بغرض الاختبار. لم تضف نسخًا دافئة مدفوعة.
5. حدد TM_TRUSTED_PROXY_HOPS فقط بعد إثبات سلسلة ingress لكل مسار. الوضع الافتراضي يستخدم socket peer ويتجاهل x-forwarded-for؛ يمنع اختيار العميل لأول IP، لكنه قد يجمع مستخدمي proxy في bucket واحد. لا تضبط قيمة واحدة لكل مسارات Vercel/Firebase بلا قياس، ولا تنشر اعتمادًا على التخمين. راجع [Vercel request headers](https://vercel.com/docs/headers/request-headers) و[Google HTTPS load balancing](https://docs.cloud.google.com/load-balancing/docs/https).
6. انشر الواجهة إلى الاستضافتين المطلوبتين. `check-deployment.ps1 -BaseUrl <staging-url> -ExpectedVersion 67.8.5` يفحص GET الصحة وأصول الإصدار. PowerShell غير متاح هنا، فلم يُشغّل السكربت فعليًا في هذه البيئة. أعلام الخدمات ليست اختبارًا للحجز أو السداد أو الامتحان.
7. بحساب staging مصرح به: الدفع/الإلغاء/الدفع مجددًا وتغيير المسار وجهازان، التقرير بعد تعديل الدرجة، استعادة قديمة وكاملة على قاعدة قابلة للمسح، QR مستقل، تحضير ثم إغلاق وفتح PWA في وضع الطيران ثم مزامنة بعد جلسة صالحة. لا رسائل لأولياء الأمور.
8. راجع Cloud Monitoring وBilling والصفحات على الهاتف قبل طلب اعتماد النشر الإنتاجي؛ لم يُطلب الاعتماد الآن لأن العمل الإنتاجي غير منفذ.

## الاستعادة والرجوع

النسخة الأصلية محفوظة والفرع مستقل. REVIEW_CHANGES.patch يوضح الفرق، وreview-history.bundle يتضمن لقطة الأصل والمراجعة. للرجوع البرمجي استخدم إصدار الواجهة والوظائف المتطابق السابق؛ لا ترجع ملف CSS وحده أو Health وحده.

الاستعادة الجديدة تحافظ على المستندات الغائبة؛ ليست استبدالًا مطابقًا لقاعدة كاملة. تعارض البيانات المالية يوقفها قبل الكتابة. استعادة المال إلى حالة تاريخية تحتاج قاعدة معزولة، مطابقة المعاملات والملخصات والطلاب، ثم خطة ترحيل منفصلة. بالنسبة لفشل دفعة أثناء restore راجع _restore_runs والنسخة pre-restore؛ لا تعاود الضغط عشوائيًا. لا توجد آلية استئناف أو قفل صيانة شامل بعد؛ تغيّر المستندات المقروءة يُرفض بواسطة updateTime. JSON لا يضم بايتات كائنات Storage؛ يلزم نسخ الكائنات/أجيالها وإثبات إمكانية الاسترجاع مستقلًا.
