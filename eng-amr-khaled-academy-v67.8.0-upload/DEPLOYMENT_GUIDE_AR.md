# دليل نشر V63.0.2 — Windows PowerShell

> نفّذ الأوامر من جذر المشروع بعد تسجيل الدخول إلى Firebase/Vercel الصحيحين. خذ Backup قبل أي migration. لا تنشر الواجهة قبل الـBackend.

```powershell
npm ci
npm --prefix functions ci
npm test
npm run build
npm run verify:dist

# 1) القواعد والفهارس والتخزين
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage

# 2) Cloud Functions المتوافقة 63.0.2
npx firebase-tools deploy --only functions

# 3) اختياري: شغّل migration من لوحة الإدارة Dry Run أولًا، ثم Apply بعد مراجعة التقرير

# 4) الواجهة — Firebase Hosting إن كان هو المضيف
npx firebase-tools deploy --only hosting

# أو Vercel من مجلد المشروع
npx vercel --prod
```

بعد النشر تحقق أن Portal response يعرض: `backendVersion=63.0.2` و`apiSchemaVersion=portal-v63.0.2`. عند ظهور `BACKEND_VERSION_MISMATCH` لا تنشر/تُبقِ الواجهة الجديدة قبل إعادة نشر Functions بنجاح.
