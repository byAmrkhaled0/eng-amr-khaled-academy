# Firebase Backend Setup - Eng Amr Khaled Academy

## 1) المطلوب من Firebase Console
1. افتح Firebase Console وأنشئ Project باسم مناسب.
2. فعّل Authentication ثم Email/Password.
3. فعّل Cloud Firestore واختر Production mode.
4. فعّل Storage.
5. من Project settings انسخ Firebase Web App config وضعها في:
   `assets/firebase-config.js`

## 2) إنشاء حساب الإدارة
1. من Authentication > Users اعمل مستخدم جديد ببريدك وكلمة مرور قوية.
2. من Firestore Database أنشئ collection باسم `users`.
3. أنشئ document بنفس UID الخاص بحسابك من Authentication.
4. داخل الدوكيومنت حط القيم دي:

```json
{
  "name": "Eng Amr Khaled",
  "email": "ضع بريدك هنا",
  "role": "admin",
  "active": true
}
```

المسموح لهم بدخول الأدمن: `admin`, `teacher`, `assistant`.

## 3) نشر Rules
استخدم الملفات الموجودة:
- `firestore.rules`
- `storage.rules`

أو من Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase init
firebase deploy --only firestore:rules,storage
```

## 4) نشر الموقع
```bash
npm run build
firebase deploy --only hosting
```

أو ارفع فولدر `dist` على Vercel.

## 5) الداتا اللي اتجهزت
- bookings: طلبات الحجز.
- students: الطلاب.
- student_portal: دخول الطالب بالكود.
- parent_portal: متابعة ولي الأمر.
- reviews: الريفيوهات وموافقة الأدمن.
- materials: ملفات PDF والماتريال.
- exams: الامتحانات.
- exam_attempts: محاولات الامتحان.
- attendance: الحضور بالـ QR.
- payments: الدفع والاشتراكات.

## 6) ملاحظات مهمة
- لوحة الإدارة لم تعد تعتمد على كلمة مرور ثابتة داخل الكود.
- الدخول الحقيقي يكون من Firebase Auth + role داخل Firestore.
- التسجيلات والريفيوهات تحفظ في Firebase عند تفعيل الكونفيج.
- في حالة توقف الإنترنت، بعض البيانات قد تُحفظ محليًا مؤقتًا حسب الصفحة.
