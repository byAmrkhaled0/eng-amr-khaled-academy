# دليل Migration الآمن — V63

الترحيل الموجود `migratePlatformV63` additive ولا يحذف collections. يشمل توحيد أكواد الطالب وإنشاء locks/حقول أمان متوافقة مع البيانات القديمة.

1. خذ Firebase backup قابلًا للاستعادة.
2. انشر Rules/Indexes ثم Functions 63.0.2.
3. من حساب Admin فقط شغّل `migratePlatformV63(false)` للحصول على Dry Run.
4. راجع أعداد الطلاب والتسليمات والأقفال والسجلات القديمة.
5. للتطبيق استخدم `migratePlatformV63(true)`؛ الـFunction ترسل داخليًا confirmation المطلوب.
6. أعد تشغيل Dry Run وتأكد أن العملية idempotent ولا تنتج تغييرات إضافية.
7. اختبر طالبًا قديمًا بكوده الحالي في Student وParent Portal قبل نشر الواجهة.

لا تغيّر Project ID، ولا تحذف أو تعيد تسمية collections، ولا تنفذ migration مباشرة على الإنتاج دون Backup ومراجعة Dry Run.
