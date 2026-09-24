# دليل نشر Techno Minds

الواجهة منشورة عبر **GitHub → Vercel** فقط، ولا يُستخدم Firebase Hosting. شغّل `npm test` ثم `npm run build` ثم `npm run verify:dist` قبل اعتماد أي إصدار.

لنشر Firebase Functions بعد مراجعة الدوال المتغيرة فقط:

```powershell
.\deploy-production.ps1 -Functions getPlatformHealthHttp,getPortalStudent -SkipSiteCheck
```

استبدل الأسماء بدوال الإصدار الفعلية. اختياريًا استخدم `-DeployRules` أو `-DeployIndexes` فقط عندما تكون القواعد أو الفهارس قد تغيرت. لا تستخدم `--force`، ولا تنشر جميع Functions. لا يرفع السكربت الواجهة أو GitHub ولا يحذف الدوال البعيدة. بعد نشر واجهة Vercel والـBackend شغّل `CHECK-SITE.cmd`؛ نجاح Health لا يثبت مسارات الدفع والحضور والتقارير والبوابة.
