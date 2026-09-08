# أوامر Cloud Shell لتحديث منصة Techno Minds

هذه الأوامر تُنفذ بعد تجربة النسخة محليًا والموافقة على النشر. لا تحذف أي بيانات حالية.

## 1) تجهيز نسخة الكود في Cloud Shell

```bash
git clone https://github.com/byAmrkhaled0/eng-amr-khaled-academy.git techno-minds-v637
cd techno-minds-v637
npm ci
npm --prefix functions ci
npm test
npm run build
npm run test:rules
```

إذا كنت سترفع ملفات ZIP المعدلة بدل GitHub، ارفع الملف إلى Cloud Shell ثم فك الضغط وادخل إلى مجلده قبل تنفيذ الأوامر التالية.

## 2) التأكد من مشروع Firebase

```bash
firebase use eng-amr-khaled-academy
firebase projects:list
```

يجب أن يظهر المشروع النشط `eng-amr-khaled-academy` قبل أي نشر.

## 3) نشر الفهارس والقواعد

```bash
firebase deploy --only firestore:indexes,firestore:rules,storage
```

انتظر حتى تنتهي حالة بناء فهارس `motivation_monthly` في Firebase Console. أثناء بناء الفهرس قد يعرض ترتيب التحفيز رسالة مؤقتة فقط، ولا تتأثر بقية المنصة.

## 4) نشر Functions المطلوبة

```bash
firebase deploy --only functions:addStudentMotivationPoints,functions:getStudentMotivationAdmin,functions:reverseStudentMotivationTransaction,functions:getMotivationLeaderboardAdmin,functions:searchStudentsAdmin,functions:getStudentAdminProfile,functions:getPortalStudent,functions:recordAttendance,functions:bulkMarkAttendance
```

## 5) التحقق بعد نشر Functions

```bash
firebase functions:list
npm test
npm run build
```

اختبر بحساب Admin وطالب اختبار:

1. سجّل حضور الطالب في تاريخين مختلفين وتأكد أن التاريخين موجودان.
2. افتح بوابة الطالب واختر الشهر من فلتر الحضور.
3. أضف نقاط تحفيز ثم نفّذ «تراجع» وتأكد من وجود الحركتين.
4. افتح ترتيب التحفيز للمجموعة.
5. ابحث عن طالب غير موجود في أول صفحة من لوحة الإدارة.
6. سلّم واجبًا وامتحانًا وتأكد من ظهور التنبيه في اللوحة دون Refresh.
7. افتح بوابة ولي الأمر وغيّر شهر التقرير.

## 6) نشر الواجهة بعد نجاح الاختبار فقط

```bash
vercel --prod
```

لا تنشر الواجهة قبل Functions؛ الواجهة الجديدة تتحقق من توافق إصدار الخدمة.
