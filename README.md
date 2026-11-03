# TECHNO MINDS — 70.0.11

نسخة السورس الكاملة للمراجعة المحلية. ملف التسليم لا يحتوي على بيانات إنتاج أو تقارير أو صور اختبارات أو node_modules أو dist.

## المتطلبات

- Node.js 22 وJava 21 أو أحدث.
- تثبيت الاعتماديات مرة واحدة: `npm ci` ثم `npm --prefix functions ci`. يلزم الإنترنت لتنزيل الحزم ومحاكيات Firebase في أول تشغيل فقط.

## تشغيل المنصة والباك إند محليًا

شغّل `npm start` (أو `npm run local:review`) أو افتح `START_LOCAL_DEMO.cmd` على Windows. الأداة تتحقق من المنافذ، وتشغّل محاكيات Auth وFirestore وStorage وFunctions لمشروع `demo-technominds` فقط، ثم تضيف بيانات تجريبية وتفتح سيرفر الموقع.

- الموقع: http://127.0.0.1:5412
- الإدارة: http://127.0.0.1:5412/teacher-login.html
- حساب الإدارة التجريبي: `phase6-owner@example.test`
- كلمة المرور التجريبية: `Local-Review-Only-6349`
- كود الطالب وولي الأمر التجريبي: `123456`
- إيقاف التشغيل: Ctrl+C في نافذة التشغيل. لا تعتمد على بقاء بيانات المحاكي بعد إيقافه.
- لتغيير منفذ الموقع: `npm run local:review -- --port 5413`؛ منافذ المحاكيات تظل كما هي في firebase.json.

مفتاح التوقيع المحلي يولّد مؤقتًا ويُحذف عند الإغلاق؛ لا تستخدم مفاتيح إنتاج. تنفيذ الأكواد لدى المزود الخارجي معطل في وضع المراجعة هذا، بينما الاختبارات الأمنية الخاصة به متاحة. لا يتم إرسال واتساب تلقائيًا.

`npm run dev` معاينة للشكل فقط على 5173؛ لا يشغّل الباك إند. عند انشغال منفذ، أوقف التشغيل السابق بـCtrl+C؛ لا تعِد تثبيت الحزم.

## الاختبارات

- `npm test`: الاختبارات الأساسية واختبارات الحسابات وPhase6.
- `npm run test:review:gate`: اختبارات حفظ الوظائف والمدفوعات والإجابات والتقارير وواجهة الإدارة وسيرفر المعاينة، ثم build وverify:dist.
- `npm run test:review:integration`: اختبارات التكامل على محاكيات Firestore وStorage مع بيانات اختبار مؤقتة. أوقف المراجعة التفاعلية أولًا لأن الاختبارات تفرغ قاعدة المحاكي.
- `npm run test:rules`: فحص قواعد Firestore وStorage على المحاكي.
- `npm --prefix functions run lint`: فحص صياغة ملفات Functions.

بعض سكربتات المراحل التاريخية تحتاج أدلة تحقق قديمة غير مضمنة؛ ليست ضمن بوابة المراجعة الحالية ولا تمثل نتائج جديدة. اختبارات المتصفح والتقرير النهائي خارج أرشيف السورس.

## حدود التشغيل

`npm run dev` يعرض الواجهة فقط ويعطّل اتصال الإنتاج على localhost. استخدم `local:review` لتجربة الخدمات. لا يشمل هذا التسليم نشر Functions أو Rules أو Indexes أو Vercel، ولا التحقق من إعدادات الإنتاج أو المزود الخارجي أو الفواتير الفعلية. تشغيل الإنتاج يحتاج بوابة إصدار مستقلة وتفويض نشر واضح.
## مسار الإصدار المحفوظ

الواجهة تستخدم GitHub → Vercel. لا تستخدم Firebase Hosting أو `DEPLOY-HOSTING-ONLY.cmd` لهذا المشروع.

أوامر الباك إند الانتقائية التالية موثقة للحفاظ على طريقة الإصدار الحالية، ولا تُشغّل ضمن المراجعة المحلية. تحتاج تفويض نشر منفصل وتحديد Functions المطلوبة فعليًا:

```powershell
.\deploy-production.ps1 -Functions submitCodeExecution,upsertGroupSchedule -Plan
.\deploy-production.ps1 -Functions submitCodeExecution,upsertGroupSchedule -ConfirmProduction -SkipSiteCheck
.\deploy-production.ps1 -Resume -Functions submitCodeExecution,upsertGroupSchedule -ConfirmProduction -SkipSiteCheck
DEPLOY-WINDOWS.cmd -Resume -Functions submitCodeExecution,upsertGroupSchedule -ConfirmProduction -SkipSiteCheck
```

### Local vendored spreadsheet reader
The compatibility URL `assets/vendor/xlsx-0.18.5.full.min.js` contains SheetJS CE 0.20.3 from the official SheetJS CDN. The old filename remains for route compatibility; the parser itself is upgraded. It still loads only when import/export is used.

Release 70.0.11: production commands are documentation only. Review the selected plan first; actual deployment requires the owner's explicit approval and `-ConfirmProduction`. Existing Functions and indexes must never be deleted. No Rules or indexes changed in this review.

## تحديث الطالب والتحفيز 70.0.11

الهوية الحقيقية في يمين الهيدر، وأقسام الطالب الـ11 موجودة في قائمة جانبية واحدة. على الموبايل تفتح من زر القائمة، وكل قسم شاشة مستقلة برابط داخل student.html، مثل #lectures و#homework، مع دعم الرجوع في المتصفح. المساعد عائم يمين، وسهم الرجوع للأعلى شمال ويظهر قرب نهاية الصفحة فقط. أدوات الحساب داخل القائمة.

تهنئة واتساب للأوائل الثلاثة إجراء يدوي: يفتح رسالة مجهزة للطالب المحدد بعد التأكيد؛ الإرسال يتم داخل واتساب فقط. المهمة الشهرية القائمة عند 00:10 بتوقيت القاهرة يوم 1 تغلق الشهر السابق وتضيف تهنئة شخصية بالمركز داخل حساب كل طالب مؤهل، مع منع التكرار. لا توجد وظيفة إرسال واتساب تلقائي.

صندوق الإشعارات يستعمل الطلب الموجود مرة عند فتح حساب الطالب لإظهار عدد الرسائل، ثم يعيد استخدام النتيجة؛ لا polling ولا listeners جديدة. تعديل Functions الخاص بهذه المرحلة يقتصر على freezeMonthlyLeaderboard وgetStudentAccountNotifications. أمثلة النشر السابقة تخص إصلاحات موروثة، ولا تعتبر تصريح نشر أو قائمة نشر هذه المرحلة.


## المحاضرات: PDF وDrive معًا

عرض الطالب يجمع العملي والنظري ويتيح فلترة النوع محليًا. لكل محاضرة زران مستقلان عند وجود ملف ورابط. محرر محاضرات المنهج يدعم النوع ورابط Drive بجانب رفع الملف، وتعديل المحاضرة دون رفع ملف جديد يحافظ على ملفها الحالي. المحاضرات القديمة غير المصنفة تُعامل كنظري ويمكن تعديل نوعها. ملفات المنهج الخاصة تفتح عبر خدمة الصلاحيات القائمة عند النقر فقط.

التغيير المحلي في الباك إند يخص upsertCurriculumEntity وgetStudentCurriculum وgetLectureContent فقط. لا نشر ضمن التسليم. اختبار lecture-dual-resources.integration.test.js ضمن مشغل التكامل؛ يحتاج المحاكيات وdemo-technominds فقط. روابط HTTP مسموحة فقط لمحاكي Storage المحدد في وضع المراجعة المحلية؛ الإنتاج يظل HTTPS.
