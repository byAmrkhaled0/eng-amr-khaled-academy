# Firestore Collections Schema

## users/{uid}
```js
{name, email, role: 'admin'|'teacher'|'assistant', active: true}
```

## bookings/{studentCode}
```js
{code, studentCode, studentName, name, studentPhone, parentPhone, grade, month, group, notes, status, date, createdAt, updatedAt}
```

## students/{studentCode}
```js
{studentCode, code, studentName, name, studentPhone, parentPhone, grade, month, group, paid, paymentDate, notes, attendance, grades, homeworks}
```

## attendance/{studentCode_date}
```js
{studentCode, studentName, grade, group, date, time, status: 'present'|'absent', method: 'qr'|'manual'|'admin'}
```

## reviews/{id}
```js
{name, role, rating, text, approved, date, createdAt, updatedAt}
```

## materials/{id}
```js
{title, grade, desc, fileUrl, fileName, createdAt, updatedAt}
```

## exams/{id}
```js
{title, grade, duration, questions, createdAt, updatedAt}
```

## exam_attempts/{id}
```js
{examId, studentCode, studentName, answers, score, status, submittedAt}
```

## payments/{studentCode}
```js
{studentCode, studentName, grade, group, paid, paymentDate, updatedAt}
```


## Collections added for full data connection

### files
- title, type, fileUrl, fileName, contentType, size, targetGroup, createdAt, updatedAt

### materials
- title, week, type/category, desc, fileUrl, fileName, group/targetGroup, createdAt, updatedAt

كل المحتوى الذي يظهر للطالب أو في الموقع يُدار من الأدمن ويتخزن في Firestore. المحتوى التعليمي كله موجود في collection واحدة اسمها `materials` بتصنيفات مثل كورس، محاضرة، PDF، واجب، فيديو، ملخص. الملفات تُرفع إلى Firebase Storage تحت `teacher-uploads/materials`.
