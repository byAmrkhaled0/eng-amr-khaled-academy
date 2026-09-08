# أوامر التحقق والنشر — v63.0.4

نفّذ من جذر المشروع. لا تضع كلمة مرور أو Service Account داخل الملفات.

## 1. التحقق المحلي

```bash
npm ci
npm test
npm run build
npm run verify:dist
npm audit --omit=dev
(cd functions && npm ci && npm run lint && npm audit --omit=dev)
npm run test:rules
```

يجب أن تنجح كل الأوامر قبل المتابعة. إذا فشل `test:rules` بسبب Java أو تنزيل Emulator، ثبّت Java 21 وأعد الأمر؛ لا تتجاوزه في النشر الحقيقي.

## 2. التحقق من حساب Admin بدون أسرار

بعد تسجيل دخول مالك المشروع عبر Firebase CLI وGoogle Application Default Credentials، ضع البريد في متغير بيئة فقط:

```bash
export ADMIN_EMAIL='admin-email@example.com'
gcloud auth application-default login
node -e "const {initializeApp,applicationDefault}=require('firebase-admin/app');const {getAuth}=require('firebase-admin/auth');const {getFirestore,FieldValue}=require('firebase-admin/firestore');initializeApp({credential:applicationDefault(),projectId:'eng-amr-khaled-academy'});(async()=>{const auth=getAuth(),db=getFirestore(),u=await auth.getUserByEmail(process.env.ADMIN_EMAIL);if(!u.emailVerified)await auth.updateUser(u.uid,{emailVerified:true});await auth.setCustomUserClaims(u.uid,{...(u.customClaims||{}),admin:true});await db.collection('users').doc(u.uid).set({uid:u.uid,email:u.email,role:'admin',active:true,updatedAt:FieldValue.serverTimestamp()},{merge:true});console.log(JSON.stringify({ok:true,uid:u.uid,emailVerified:true,admin:true,role:'admin',active:true}));})().catch(e=>{console.error(e.code||e.message);process.exit(1);});"
unset ADMIN_EMAIL
```

بعدها سجّل خروج Admin من المتصفح ثم ادخل من جديد حتى يتجدد ID Token.

## 3. نشر Firebase بالترتيب

```bash
firebase login
firebase use eng-amr-khaled-academy
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
curl -fsS -H 'Content-Type: application/json' -d '{"data":{}}' https://eng-amr-khaled-academy.vercel.app/api/health
```

قبل نشر الواجهة يجب أن يعيد Health:

- `status: ok`
- `version: 63.0.4`
- `apiSchemaVersion` المتوافق إن كان ظاهرًا في الاستجابة

## 4. نشر Vercel

```bash
npm run build
npm run verify:dist
npx vercel link
npx vercel deploy --prod
```

لا تضف Secrets أو Service Account إلى Vercel Frontend Environment Variables.

## 5. تحقق ما بعد النشر

```bash
curl -fsS -H 'Content-Type: application/json' -d '{"data":{}}' https://eng-amr-khaled-academy.vercel.app/api/health
curl -fsSI https://eng-amr-khaled-academy.vercel.app/
curl -fsSI https://eng-amr-khaled-academy.vercel.app/student.html
curl -fsSI https://eng-amr-khaled-academy.vercel.app/parent.html
curl -fsSI https://eng-amr-khaled-academy.vercel.app/service-worker.js
curl -sS -o /dev/null -w '%{http_code}\n' https://eng-amr-khaled-academy.vercel.app/path-that-must-not-exist
```

ثم اختبر يدويًا بحساب الاختبار المؤقت: الواجب في الطالب وولي الأمر، تسليم واحد، القفل، التصحيح من الهاتف، ظهور الدرجة، امتحان واحد، التزامن من تبويبين، وتنظيف `?code=`. غيّر كود الاختبار بعد الانتهاء.

## 6. GitHub بعد نجاح اختبارات النسخة المنشورة

```bash
git status --short
git diff --check
git add .
git commit -m "fix: finalize Techno Minds v63.0.4 portal workflows"
git tag -a v63.0.4 -m "Techno Minds v63.0.4"
git push origin HEAD
git push origin v63.0.4
```

لا تنفذ Git push أو Tag قبل نجاح اختبار النسخة المنشورة وتأكيد عدم وجود ملفات `.env` أو `node_modules` أو تقارير داخلية غير مقصودة في `git status`.
