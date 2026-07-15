# Techno Minds v58 — Deployment

التقرير الكامل، متطلبات Judge0، ترتيب نشر Firebase وVercel، أوامر GitHub، وخطوات الاختبار بعد النشر موجودة في:

`FINAL_REPORT_AR.md`

التحقق السريع:

```bash
npm ci
npm --prefix functions ci
npm test
npm run build
```

لا تنشئ أو تنشر `functions/.env.eng-amr-khaled-academy` داخل Git، ولا تبدأ ترحيل أكواد الطلاب قبل أخذ Firestore Backup.
