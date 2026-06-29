# Eng Amr Khaled Programming Academy - Production Update v39

## What changed

- Removed local/demo teacher login credentials from the code.
- Removed the visible teacher signup button from `teacher-login.html`.
- Added `noindex, nofollow` to the teacher login page.
- Teacher dashboard now opens only after Firebase Auth login and a staff role check.
- Allowed staff roles: `admin`, `teacher`, `assistant` with `active != false`.
- Rebuilt `assets/app.js` and `assets/admin.js` to remove duplicate function definitions and old accumulated code.
- Removed demo/default student data from production. Empty Firebase/local data now shows clear empty states instead of fake students.
- Student portal login is by `studentCode` only.
- Parent portal login is by `studentCode + parentPhone`.
- Added QR-based attendance in the teacher dashboard.
- Attendance creates one record per `studentId + date` and prevents duplicate present records.
- Added button to mark missing students as absent for the selected grade/group.
- Added attendance summary and table to student and parent reports.
- Improved mobile admin experience with card-style rows for students, bookings, and attendance.
- Improved bookings success message with booking/student code, grade, month/group, copy code, and WhatsApp contact.
- Improved exams: start time, submit time, duplicate submission prevention unless retake is allowed, auto MCQ grading, essay pending manual correction.
- Updated Firestore and Storage rules for staff-only writes, portal docs, safe uploads, and no listing of private portal collections.
- Unified SEO domain in `robots.txt`, `sitemap.xml`, and `DEFAULT_SITE_URL`.

## Required Firebase setup

Create a document for the teacher/admin user after creating the Firebase Auth account:

`users/{uid}`

```json
{
  "role": "teacher",
  "active": true
}
```

Supported roles:

- `admin`
- `teacher`
- `assistant`

Without this document, the dashboard will show: `غير مصرح لك بالدخول.`

## Attendance collection

Collection name: `attendance`

Present record:

```json
{
  "studentId": "ST-1025",
  "studentCode": "ST-1025",
  "studentName": "Student Name",
  "grade": "أولى إعدادي",
  "group": "مجموعة السبت والثلاثاء",
  "status": "present",
  "date": "2026-06-24",
  "time": "6:35 PM",
  "method": "qr_scan",
  "scannedBy": "teacher email or uid",
  "createdAt": "ISO date"
}
```

Absent record:

```json
{
  "studentId": "ST-1025",
  "studentCode": "ST-1025",
  "studentName": "Student Name",
  "grade": "أولى إعدادي",
  "group": "مجموعة السبت والثلاثاء",
  "status": "absent",
  "date": "2026-06-24",
  "time": null,
  "method": "auto_absent",
  "scannedBy": "teacher email or uid",
  "createdAt": "ISO date"
}
```

Document id is based on `studentCode_date`, so the same student cannot have more than one attendance record per day.


## v38 Parent QR + Monthly WhatsApp Reports
- ولي الأمر يمكنه الدخول بالكود اليدوي أو بمسح QR الطالب من صفحة parent.html.
- تم إضافة ماسح QR باستخدام html5-qrcode مع fallback للـ BarcodeDetector.
- تقرير ولي الأمر أصبح Monthly Report مهيأ للموبايل والطباعة والحفظ PDF.
- أضيفت أزرار: طباعة/حفظ PDF، نسخ التقرير، إرسال واتساب.
- في لوحة الأدمن أضيف زر واتساب بجوار كل طالب لفتح رسالة تقرير شهرية جاهزة لولي الأمر.
- تم تحسين CSS للموبايل في صفحة ولي الأمر ولوحة الأدمن بدون تغيير الهوية أو الألوان الأساسية.


## إضافة زر واتساب لدرجات الامتحانات
- تمت إضافة قسم داخل لوحة المدرس > الامتحانات باسم: درجات الطلاب وإرسال واتساب.
- يظهر بجانب كل محاولة امتحان أو درجة زر: واتساب ولي الأمر.
- الزر يفتح رسالة WhatsApp جاهزة تحتوي على اسم الطالب، الكود، الصف، المجموعة، اسم الامتحان، الدرجة، وتاريخ التسليم.
- لا يعمل الزر إذا لم يتم تصحيح الامتحان بعد أو إذا كان رقم ولي الأمر غير موجود.
- تم دعم درجات `exam_attempts` ودرجات `grades` ودرجات الطالب المخزنة داخل `students[].grades`.


## V40 - Exam correction and parent report polish
- Added structured MCQ answer parsing: the teacher must add `الإجابة: أ/ب/ج/د` or the full correct answer for MCQ auto-correction.
- MCQ exams now auto-correct on student submission when correct answers are provided.
- Essay or mixed exams now appear in the teacher dashboard with full student answers for manual correction.
- Teacher correction UI now shows every question, student answer, model answer, correct/wrong toggles, and final score input.
- Parent monthly report was redesigned for mobile and now clearly shows teacher name: بشمهندس عمرو خالد.
