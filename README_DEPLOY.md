# نشر Techno Minds V60.6.2 على Windows

هذه النسخة لا ترفع إلى GitHub تلقائيًا، ولا تحذف Functions أو Indexes قديمة تلقائيًا. النشر لا يبدأ إلا عندما تشغّل السكربت بنفسك.

## 1) المتطلبات

- Windows PowerShell 5.1 أو أحدث.
- Node.js 22 LTS.
- Firebase CLI حديث: `npm install -g firebase-tools`.
- صلاحية على مشروع `eng-amr-khaled-academy`.

```powershell
firebase login
node --version
firebase --version
```

## 2) الإعدادات الخارجية قبل النشر

راجع `functions/.env.example`. لا تضع التوكن داخل ملفات الواجهة. عند استخدام Judge0 مدفوع أو مستضاف ذاتيًا، يوضع التوكن في `functions/.env` المحلي فقط.

لتنبيهات الحجوزات وهي مغلقة:

1. افتح Firebase Console > Project settings > Cloud Messaging.
2. أنشئ Web Push certificate.
3. انسخ المفتاح العام إلى `messagingVapidKey` داخل `assets/firebase-config.js`.
4. المفتاح العام ليس سرًا؛ لا تنسخ أي Service Account أو Server key إلى الواجهة.

## 3) الفحص قبل النشر

```powershell
npm test
npm run build
npm run verify:dist
npm --prefix functions ci
npm --prefix functions run lint
```

## 4) النشر الكامل

من CMD أو PowerShell:

```powershell
.\DEPLOY-WINDOWS.cmd
```

يضبط السكربت `FUNCTIONS_DISCOVERY_TIMEOUT=120`، ثم يفحص ويبني المشروع، وينشر كل Function منفردة، ثم Rules وStorage وIndexes وHosting، وأخيرًا يفحص الموقع المنشور. نشر كل Function منفردة يمنع Firebase CLI من حذف دوال قديمة غير موجودة في هذه النسخة، ويجعل اسم الدالة الفاشلة ظاهرًا.

إذا توقف النشر أو ضغطت Ctrl+C، لن تظهر رسالة نجاح. بعد إصلاح السبب:

```powershell
.\DEPLOY-WINDOWS.cmd -Resume
```

يسجل السكربت الخطوات المكتملة في `.deploy-state.txt` ويكمل من الخطوة الفاشلة. الملف محلي ومضاف إلى `.gitignore`.

عند خطوة Indexes، إذا عرض Firebase فهارس قديمة للحذف اختر `No`. السكربت لا يستخدم `--force`.

## 5) نشر الواجهة فقط

```powershell
.\DEPLOY-HOSTING-ONLY.cmd
```

هذا الأمر لا يغير Functions أو Rules أو Indexes أو GitHub.

## 6) الفحص بعد النشر

فحص الصفحات وHealth وFirestore والخدمات وقائمة لغات Judge0:

```powershell
.\CHECK-SITE.cmd
```

فحص تشغيل JavaScript وPython وC++ وJava وC# فعليًا عبر Judge0:

```powershell
.\CHECK-SITE.cmd -FullCodeRunner
```

نجاح الاختبار الكامل مشروط بأن يكون Judge0 متاحًا وحصته وإعداداته صالحة وقت الفحص.

## 7) ترحيل المدفوعات القديمة

بعد نشر Functions وRules وIndexes وتسجيل الدخول كـ`admin`:

1. افتح «المدفوعات».
2. تأكد من أسعار الكورسات.
3. اضغط «ترحيل paid/paymentAmount».
4. وافق على إنشاء النسخة الاحتياطية والترحيل.

العملية آمنة عند التكرار، ولا تحذف مجموعة `payments` ولا حقول الطالب القديمة. راجع `PAYMENT_MIGRATION_V60.6_AR.md`.

## 8) تجهيز GitHub محليًا

شغّل الملف التالي حتى لو كان الملف Downloaded وغير موقع:

```powershell
.\PREPARE-GITHUB.cmd
```

ينشئ/يستخدم Clone محليًا وينسخ المصدر مع استبعاد `node_modules` و`dist` و`.env`. لا ينفذ Commit أو Push. بعد المراجعة:

```powershell
cd ..\Techno-Minds-v60.6.2-GitHub
git status --short
git add -A
git commit -m "Techno Minds V60.6.2"
git push origin main
```

لا تنفذ أوامر Git الأخيرة إلا بعد مراجعة التغييرات بنفسك.
