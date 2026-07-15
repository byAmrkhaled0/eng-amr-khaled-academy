# تقرير تسليم Techno Minds v58

## تحديث لوحة الإدارة v58

- إعادة بناء واجهة الإدارة بهوية برمجية داكنة: كحلي مزرق، Cyan، Electric Blue وNeon Violet مع تباين واضح وتأثيرات خفيفة.
- Sidebar قابلة للتصغير على الكمبيوتر وDrawer آمنة باستخدام `inert` على الهاتف، بلا الاعتماد على `aria-hidden` مع عنصر يحتفظ بالتركيز.
- تحميل بيانات القسم المفتوح فقط، Pagination للطلاب، وإلغاء تحميل جميع Collections عند فتح اللوحة.
- ملخص يومي من Cloud Function مخصصة، و12 مؤشرًا وإجراءات سريعة وآخر الحجوزات والتسليمات والمحاضرات والتنبيهات.
- عرض الطلاب كصفوف مدمجة مع فلاتر ومؤشرات الحضور والواجب والعملي والدرجات وإجراءات منظمة.
- قبول الحجوزات فوري وOptimistic، قبول جماعي، منع الضغط المتكرر، Retry للأخطاء المؤقتة، وعدّاد هادئ بدل Toast متكرر.
- دفع سريع من صف الطالب مع حفظ خادمي Transaction وتراجع تلقائي للواجهة عند الخطأ، مع الاحتفاظ بسجل مستقل لكل شهر.
- منشئ امتحان مرئي لأسئلة MCQ ذات أربعة اختيارات والمقالي والكود، بدل كتابة JSON يدويًا.
- إضافة إدارة الدرجات وفريق العمل والصلاحيات، وتسجيل العمليات الحساسة في Activity Log.
- إزالة الاعتماد على `sessionStorage` لفتح لوحة الإدارة؛ التحقق الفعلي من Firebase Auth ودور المستخدم يتم قبل عرضها.

الدوال الإدارية الجديدة في هذا الإصدار: `getAdminDashboard`, `createAssignment`, `reviewHomework`, `createPracticalTask`, `createExam`, `approveExamResult`, `recordPayment`, `recordGrade`, `listStaffAccounts`, `updateStaffRole`.

تاريخ التحقق: 15 يوليو 2026  
المشروع: `eng-amr-khaled-academy`

## 1. المشكلات التي كانت موجودة

- تداخل فعلي بين `assets/admin.js` و`assets/simple-admin.js` وتعريفات ووظائف إدارة متكررة.
- اعتماد أجزاء حساسة على كتابة المتصفح المباشرة إلى Firestore، ووجود مسار REST مباشر للحجز.
- استخدام تخزين المتصفح ضمن تدفقات بيانات الطالب/الحجز، مع بيانات وحالات غير مناسبة كمصدر إنتاج.
- قواعد Firestore وStorage تسمح بتصميم يصعب معه عزل بيانات المحاولات والإجابات والملفات الخاصة.
- أكواد طلاب قديمة وغير موحدة، وعدم وجود حجز ذري للكود أو منع مؤكد لتكرار إنشاء الطالب.
- اعتماد QR وFirebase ومحرر Python على مكتبات خارجية تُحمّل في صفحات لا تحتاجها.
- متابعة حضور مجمعة لا تمثل كل محاضرة بتاريخها، وعدم وجود مسار آمن موحد لأزرار المتابعة السريعة.
- صفحات الإدارة والجداول مزدحمة على الهاتف، ورسائل أخطاء عامة لا تميز نوع الخطأ.
- نظام الامتحان القديم يمكنه كشف بنية الإجابة أو حفظ المحاولات بطريقة لا تحقق العزل المطلوب.
- صفحة العملي لم تكن بيئة متعددة اللغات مع Sandbox خارجي وتدفق token/poll.
- PWA والكاش لم يكونا مجهزين لتحديث آمن وواضح بين الإصدارات.
- لا يوجد اختبار آلي شامل للـ `onclick`، صياغة JavaScript/JSON، أو الروابط المحلية.

## 2. ما تم تنفيذه

### الهيكل والواجهة

- إعادة تصميم الهوية بالكامل بأسلوب Future Coding: خلفيات شبكية، Cyan/Violet، كروت زجاجية، إضاءة محسوبة، ووضع داكن افتراضي مع وضع فاتح تقني.
- إضافة `assets/future-theme.css` كطبقة تصميم مستقلة قابلة للصيانة دون خلطها بمنطق الصفحات.
- إعادة ترتيب لوحة الإدارة حسب «شغل اليوم» وإضافة مركز عمليات بأزرار كبيرة للدفع والواجب والامتحان والمتابعة وQR والطلاب.
- استبدال كتابة JSON في إنشاء الامتحان بمنشئ مرئي للأسئلة والاختيارات الأربعة والإجابة الصحيحة والمقالي والكود وPDF.
- حذف `simple-admin.js` وتوحيد لوحة الإدارة في `assets/admin.js`، مع منع أي مرجع قديم لها.
- تقسيم منطق الواجهة عمليًا إلى التطبيق العام، مزامنة Firebase، الإدارة، QR، المحرر، وPWA.
- تحويل الإدارة على الهاتف إلى قائمة جانبية Hamburger وصفوف Cards مع بحث وتحميل محدود.
- إضافة حالات Loading وتعطيل الأزرار الحساسة أثناء الحفظ، وRetry واحد للأخطاء المؤقتة.
- إضافة ترجمة عربية لأكواد Firebase/Functions بدل رسالة إنترنت عامة لكل الأخطاء.
- الحفاظ على هوية Techno Minds ومحتوى البرمجة وPython والذكاء الاصطناعي والمحاضرات.
- لم تتم إضافة أي سجلات طلاب أو حجوزات تجريبية.

### Firebase والأمان

- إنشاء Cloud Functions v2 كاملة في `functions/` بمنطقة ثابتة `europe-west1` وNode.js 20.
- تنفيذ الدوال المطلوبة: `createBooking`, `approveBooking`, `rejectBooking`, `createStudentAccess`, `getPortalStudent`, `recordClassProgress`, `startExam`, `submitExam`, `prepareHomeworkUpload`, `registerHomeworkSubmission`, `deleteStudentSafely`, `createReview`, `getPublicLeaderboard`, `reportClientError`.
- إضافة دوال الإدارة والترحيل والبحث والتصحيح ورفع ملفات الإدارة وتشغيل الأكواد والمهام العملية.
- التحقق من المدخلات في الخادم، Rate Limiting، معاملات Firestore، Idempotency، وحذف مترابط آمن.
- منع الكتابات الحساسة من المتصفح في `firestore.rules` و`storage.rules`؛ Admin SDK داخل Functions هو مسار الكتابة.
- حجب محاولات الامتحان والإجابات والأكواد المصدرية والملفات الخاصة عن القراءة العامة.
- جعل التقييم الجديد `pending` إلى أن تعتمده الإدارة.
- إنشاء الفهارس المركبة وتعطيل فهرسة حقول الإجابات والكود الكبيرة غير المطلوبة.
- الحفاظ على أدوار `admin`, `teacher`, `assistant` مع شرط `active != false`.

### الكود الموحد والحجز

- كود رقمي موحد من 8 أرقام يبدأ من 1 إلى 9، مع حجزه داخل Transaction ومنع التكرار.
- QR واحد يحمل نفس الكود، ويعمل للطالب وولي الأمر والحضور والامتحان والواجب.
- إضافة تغيير/ترحيل الأكواد القديمة على دفعات مع aliases آمنة من لوحة الإدارة.
- جلب مجموعات المسار من الخادم فقط، والتحقق من المسار والحالة والسعة في الخادم.
- عدادات `pendingCount` و`approvedCount` ذرية، ومنع الحجز الزائد أو الطلب المكرر.
- قبول/رفض الحجز وتحديث الصف مباشرة دون إعادة تحميل كاملة أو Toast متكرر.
- بحث الإدارة في الحجوزات والطلاب بالاسم والكود والهاتف والمسار والمجموعة والحالة.

### المتابعة والبوابات

- سجل مستقل لكل `studentCode + sessionId` يحوي التاريخ والحضور والواجب والتطبيق العملي والمشاركة والدرجة والملاحظة والمسجل.
- حالات الحضور: حاضر، غائب، متأخر، بعذر، مع منع تكرار الحضور للمحاضرة نفسها.
- أزرار سريعة للمتابعة تحفظ فورًا وتُظهر الخطأ العربي الحقيقي.
- بوابة الطالب وولي الأمر تعرضان المسار والمجموعة والموعد ونوع الحضور والدفع والمتابعة والواجبات والعملي والامتحانات والملاحظات والمحاضرات والملفات.
- تقرير ولي الأمر مهيأ A4 بالعربية، يخفي أزرار الموقع وقت الطباعة ويحتوي الكود وQR.
- زر WhatsApp في الإدارة لإنشاء تقرير موجه لولي الأمر دون نشر رقمه في صفحة عامة.

### الامتحانات والتحفيز والواجبات

- بدء امتحان آمن برمز وصول مؤقت مخزن كـ hash، وعدم إرسال الإجابات الصحيحة للمتصفح.
- دعم MCQ والمقالي والكود، تصحيح MCQ آلي، مراجعة يدوية، واعتماد النتيجة قبل ظهورها.
- منع التسليم المكرر وحماية الإجابات داخل مجموعة خاصة بالموظفين فقط.
- تحفيز شهري لكل مسار على حدة لأفضل خمسة بالاسم الكامل، بأوزان 35/25/15/20/5.
- فلترة المسار في Function ثم الواجهة، Cache قصير وإبطاله عند تسجيل نشاط، وحماية تبديل المسارات السريع.
- لا تعيد دالة التحفيز الهاتف أو كود الطالب أو أي بيانات خاصة.
- رفع الواجب عبر Signed URL قصير العمر، مع تحقق نوع/حجم في الخادم وتسجيل التصريح وربط الملف بالطالب والواجب.

### العملي وتشغيل الأكواد

- إعادة بناء `practical.html` باستخدام CodeMirror 6 المحمل في الصفحة فقط.
- وضع تجربة حرة ووضع مهمة عملية، قوالب، stdin، stdout، stderr، Compile Output، الوقت والذاكرة وحالة الخروج.
- نسخ/مسح/رفع/تنزيل/مشاركة رابط محلي آمن/ملء الشاشة/ثيم داكن وحفظ Draft لكل لغة.
- وسيط Judge0 داخل Cloud Functions فقط؛ لا يوجد API secret في JavaScript ولا يتم تشغيل الكود داخل Firebase Functions.
- التدفق هو submit ثم token داخلي ثم polling؛ رمز Judge0 الحقيقي لا يصل للمتصفح.
- تعطيل شبكة الكود، وحدود للوقت والذاكرة والعمليات وحجم الكود والمدخلات والمخرجات، وRate Limiting.
- الاختبارات المخفية تبقى في الخادم، مع حفظ النتيجة وربط الحل بالطالب والمهمة والمسار والمجموعة.
- إذا لم يضبط `JUDGE0_BASE_URL` تظهر رسالة «خدمة تشغيل الأكواد غير مفعلة بعد» دون انهيار بقية الموقع.

### PWA والأداء

- SDK Firebase محلي، وتحميل QR والمحرر وFunctions/Storage عند الحاجة فقط.
- صور شهادات WebP مع أبعاد وLazy Loading مع الاحتفاظ بالأصول الأصلية كاحتياط.
- Service Worker بإصدار `technominds-v58`، Network-first للصفحات، Offline Page، وتحديث الكاش عند الإصدار.
- Manifest نسبي يعمل تحت Firebase/Vercel والنطاق المخصص، مع أيقونات 192 و512 وزر التثبيت.
- ملفات JS/CSS المتغيرة لا تستخدم immutable لمدة سنة؛ الصور تستخدم Cache لمدة أسبوع مع revalidation.
- البناء ينتج `dist/` مستقلة جاهزة لـ Firebase Hosting أو Vercel.

## 3. الملفات المعدلة أو المضافة

### ملفات الإنتاج الأساسية

- `assets/app.js`, `assets/firebase-sync.js`, `assets/admin.js`, `assets/site.css`
- `assets/pwa.js`, `assets/qr-tools.js`, `assets/practical.js`
- `assets/vendor/firebase-*-compat.js`
- `admin.html`, `teacher-login.html`, `booking.html`, `student.html`, `parent.html`, `practical.html`, `exams.html`
- `index.html`, `about.html`, `learning-path.html`, `materials.html`, `online-lectures.html`, `questions.html`, `reviews.html`, `services.html`
- `offline.html`, `service-worker.js`, `site.webmanifest`, `local-server.js`
- `assets/icon-192.png`, `assets/icon-512.png`, ونسخ الشهادات WebP.

### الخادم والأمان والبناء

- `functions/index.js`, `functions/src/validation.js`, `functions/test/validation.test.js`
- `functions/package.json`, `functions/package-lock.json`, `functions/.env.example`, `functions/.gitignore`
- `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `storage.cors.json`, `firebase.json`
- `src/practical-editor.js`, `src/qr-tools.js`
- `scripts/bundle.js`, `scripts/build.js`, `scripts/verify.js`
- `package.json`, `package-lock.json`, `.gitignore`, `tests/mobile-harness.html`

تم حذف `assets/simple-admin.js` و`update_stage.py` لأنهما مساران قديمان يسببان تعارضًا ولا يدخلان في تشغيل الإنتاج.

## 4. نتائج الاختبارات المحلية

| الاختبار | النتيجة |
|---|---|
| `npm test` | ناجح |
| اختبارات Functions | 5/5 ناجحة |
| `npm run build` | ناجح و`dist/` أُعيد إنشاؤها |
| `npm --prefix functions run check` | ناجح |
| JavaScript syntax | ناجح لكل ملفات المصدر المطلوبة |
| JSON/Webmanifest | ناجح |
| الروابط المحلية | 511/511 صالحة |
| `onclick` handlers | 69/69 معرفة |
| صفحات المصدر | 17 صفحة اجتازت التحقق |
| صفحات `dist` | 16 صفحة اجتازت التحقق |
| Cloud Functions المطلوبة | كلها موجودة؛ 34 export وإقلاع discovery في نحو 136ms محليًا |
| HTTP smoke محلي | 21/21 مسارًا أعاد 200 مع MIME صحيح للـ WebP وManifest |
| Firebase Rules عبر CLI | لم يكتمل داخل بيئة العمل بسبب خطأ npm خارجي `ECOMPROMISED: Lock compromised`؛ البنية متوازنة وJSON صالح، ويجب تشغيل فحص المحاكي أدناه قبل النشر |
| اختبار متصفح حي/كاميرا | لم يُزعم نجاحه؛ localhost حُجب داخل المتصفح السحابي. يلزم HTTPS وهاتف فعلي بعد النشر |
| Judge0 live execution | لم يُختبر بلا Endpoint/خطة ومفتاح معتمدين؛ حالات الخدمة غير المفعلة معالجة |

لا يمكن إثبات تسجيل الدخول والكاميرا وعمليات Firestore الحية دون مشروع منشور وحساب موظف وبيانات حقيقية مصرح باستخدامها. لذلك قائمة ما بعد النشر في آخر التقرير جزء إلزامي من التسليم، وليست نتيجة مختلقة.

## 5. اختيار Judge0 ومتطلباته

تم اختيار Judge0 لأنه يدعم Sandbox، أكثر من 60 لغة، token/poll، قيود وقت وذاكرة وعمليات، وتعطيل الشبكة، ويمكن تشغيله ذاتيًا أو عبر خدمة مدارة. الكود لا يرسل السر إلى المتصفح.

الأسعار الظاهرة في الموقع الرسمي وقت التحقق: Pro بسعر 27€ شهريًا و2000 submission يوميًا، Ultra بسعر 54€ و5000 يوميًا، Mega بسعر 107€ و10000 يوميًا، مع 0.001€ لكل submission إضافي. الأسعار والحدود تتغير، لذلك تُراجع صفحة Judge0 الرسمية قبل الشراء. يمكن بدل ذلك تشغيل Judge0 ذاتيًا داخل Containers معزولة؛ لا تشغله داخل Firebase Functions.

ضع الإعدادات في `functions/.env.eng-amr-khaled-academy` الممنوع من Git، بالاعتماد على `.env.example`. يلزم أيضًا Firebase Blaze لنشر Functions v2 وخروج الشبكة، وصلاحية توقيع روابط Storage للخدمة المشغلة.

## 6. أوامر التحقق والبناء

```bash
npm ci
npm --prefix functions ci
npm test
npm run build
npm --prefix functions run check
npx firebase-tools emulators:exec --only firestore,storage "npm test"
```

## 7. إعداد Firebase قبل النشر

1. خذ Firestore Export/Backup من المشروع الحالي قبل أي ترحيل.
2. تأكد أن حساب الإدارة في Firebase Auth له مستند آمن في `users/{uid}` مثل:

```json
{
  "role": "admin",
  "active": true,
  "name": "اسم المسؤول"
}
```

3. أنشئ ملف البيئة محليًا ولا تضفه إلى Git:

```bash
cp functions/.env.example functions/.env.eng-amr-khaled-academy
```

4. عدّل `JUDGE0_BASE_URL` والمفتاح/header عند اعتماد الخدمة. اترك الرابط فارغًا لتعطيل التشغيل بأمان.

## 8. أوامر نشر Firebase بالترتيب

نفذها من جذر المشروع وفي نافذة صيانة قصيرة:

```bash
npx firebase-tools login
npx firebase-tools use eng-amr-khaled-academy

npm ci
npm --prefix functions ci
npm test
npm run build

npx firebase-tools deploy --only firestore:indexes
npx firebase-tools deploy --only functions
gcloud storage buckets update gs://eng-amr-khaled-academy.firebasestorage.app --cors-file=storage.cors.json
npx firebase-tools deploy --only hosting
npx firebase-tools deploy --only firestore:rules,storage
```

نشر Functions قبل Hosting يجعل الواجهة الجديدة تجد endpoints. نشر القواعد في النهاية يمنع كسر الواجهة القديمة خلال نافذة النشر القصيرة. لا تنشر القواعد قبل إنشاء مستند دور الإدارة والتأكد من نجاح Functions.

### ترحيل الأكواد القديمة

- افتح لوحة الإدارة بعد النشر بحساب Admin.
- شغل «ترحيل الأكواد القديمة»؛ الدالة تعالج دفعة صغيرة آمنة في كل مرة.
- كرر حتى تعرض الدالة عدم وجود سجلات متبقية.
- افحص عدة طلاب من بوابتي الطالب وولي الأمر قبل حذف أي حقل قديم. لا تغيّر اسم Collection أثناء الترحيل.

## 9. Vercel

```bash
npm ci
npm run build
npx vercel --prod
```

Output Directory هو `dist`. Functions وRules وIndexes تظل منشورة على Firebase، بينما Vercel يستضيف الواجهة فقط.

## 10. أوامر GitHub

```bash
git init
git checkout -b future-v58
git add .
git status --short
git commit -m "feat: future Techno Minds platform v58"
git remote add origin <GITHUB_REPOSITORY_URL>
git push -u origin future-v58
```

إذا كان المستودع موجودًا بالفعل، لا تكرر `git init` أو `git remote add`. راجع `git status` وتأكد أن `functions/.env.eng-amr-khaled-academy` و`node_modules` غير مضافين.

## 11. فحص إلزامي سريع بعد النشر

1. اختبر 320 و360 و390 و430 بكسل ثم Tablet/Desktop من DevTools، ثم هاتف Android وiPhone فعليين.
2. سجّل دخول Admin/Teacher/Assistant وتأكد من منع مستخدم بلا دور.
3. أنشئ Track/Group حقيقية مؤقتًا بسعة 1، وتأكد أن مسارًا آخر لا يعرضها وأن الحجز الثاني يُرفض عند الامتلاء؛ احذف سجل الاختبار فورًا.
4. احجز طالب اختبار مصرحًا، اضغط مرتين بسرعة، ثم اقبل/ارفض وتأكد من عدم التكرار ومن ظهور كود 8 أرقام وQR مطابق.
5. افتح بوابة الطالب وولي الأمر بالكود، وافحص الروابط على Firebase Hosting وVercel والنطاق المخصص.
6. سجل محاضرة وحضورًا ثم حاول تكراره، واختبر غائب/متأخر/بعذر والواجب والتطبيق العملي والملاحظة.
7. امنح الكاميرا إذنًا عبر HTTPS، أغلق الماسح وتأكد أن مؤشر الكاميرا يتوقف، ثم اختبر الإدخال اليدوي.
8. أنشئ امتحان MCQ/مقالي/كود، ابدأ وسلم مرتين، صحح واعتمد وتأكد أن الإجابات الصحيحة لا تظهر قبل التسليم.
9. ارفع صورة وPDF وملف كود، ثم ملفًا أكبر/بنوع ممنوع، واعتمد/ارفض الواجب.
10. اختبر تحفيز مسارين مع تبديل سريع وتأكد أن الأسماء كاملة ولا يظهر كود/هاتف.
11. اطبع تقرير ولي الأمر إلى PDF A4 وتأكد أنه ليس فارغًا وأن QR والكود موجودان، ثم اختبر WhatsApp.
12. فعّل Judge0 واختبر Success وCompilation Error وRuntime Error وTimeout وإلغاء الطلب وكل لغة مطلوبة ومتاحة في الـ endpoint.
13. احذف طالب الاختبار من الدالة الآمنة وتأكد من حذف سجلاته وملفاته المرتبطة فقط.
14. افحص PWA install/offline ثم انشر تعديلًا صغيرًا وتأكد من انتقال Service Worker إلى cache الإصدار الجديد.
