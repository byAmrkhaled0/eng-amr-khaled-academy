# نشر Techno Minds V60.5.0

## أسهل طريقة على Windows

1. فك الضغط بالكامل في مجلد جديد.
2. ثبّت Node.js 22 LTS وFirebase CLI.
3. افتح PowerShell داخل مجلد المشروع وسجّل الدخول:

```powershell
firebase login
```

4. شغّل الملف:

```powershell
.\DEPLOY-WINDOWS.cmd
```

السكربت يختار مشروع `eng-amr-khaled-academy`، يفحص المشروع، يبني الموقع، ينشئ `functions/.env` من القالب الآمن عند الحاجة، ويثبت حزم Functions. بعد نشر Functions يشغّل اختبارًا فعليًا لاتصال Firestore وخدمات الحجز وبوابة الطالب والإدارة، ثم ينفذ برنامج JavaScript تجريبي كاملًا عبر Judge0. بعد نجاح الاختبارات ينشر القواعد والفهارس وStorage وHosting، وإذا كان المجلد مربوطًا بـ GitHub يدفع التغييرات إلى الفرع `main`.

ملفا النشر يضبطان `FUNCTIONS_DISCOVERY_TIMEOUT=120` تلقائيًا لتجنب توقف Firebase بعد 10 ثوانٍ أثناء تحليل 28 دالة على Windows.

## ربط النسخة بالريبو

لو المجلد المفكوك غير مربوط بـ GitHub، شغّل:

```powershell
.\prepare-github-folder.ps1
cd ..\Techno-Minds-v60.5.0-GitHub
npm run deploy:production
```

الريبو الافتراضي:

```text
https://github.com/byAmrkhaled0/eng-amr-khaled-academy.git
```

## الروابط المهمة

- لوحة الإدارة: `/teacher-login.html`
- معمل تشغيل الأكواد: `/practical.html`
- المسار التعليمي: `/learning-path.html`
- عن المهندس والشهادات: `/about.html`
- الموقع الرئيسي: `/index.html`

## دخول المالك

سجّل الدخول من صفحة الإدارة بالبريد الموجود في Firebase Authentication. الإصدار الحالي يسمح للحسابين `amr@gmail.com` و`amrk78420@gmail.com` بإصلاح مستند المستخدم وتفعيل دور `admin` تلقائيًا عبر Function آمنة بعد نشر Functions.

## أوامر الفحص اليدوي

```powershell
npm test
npm run build
npm --prefix functions run lint
```

مهم: انشر Firebase Functions والقواعد، وليس Vercel وحده، لأن الحجز والإدارة وتشغيل الأكواد تعتمد على الخادم. المعمل مفتوح للزوار لكن التنفيذ محدود زمنيًا وبالحجم ومن خلال Judge0؛ الإنتاج الكثيف يحتاج خدمة Judge0 مستقرة أو مستضافة ذاتيًا.
