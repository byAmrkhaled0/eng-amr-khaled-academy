# رفع إصدار Techno Minds المطوّر

نفّذ الأوامر التالية في PowerShell، وكل أمر في سطر مستقل. غيّر اسم ملف ZIP فقط إذا كان المتصفح حفظه باسم مختلف.

```powershell
Set-Location "$env:USERPROFILE\Downloads"

$ZipPath = Join-Path (Get-Location) "eng-amr-khaled-academy-v65-complete.zip"
$ExtractPath = Join-Path (Get-Location) "technominds-v65-complete"
$RepoPath = Join-Path (Get-Location) "eng-amr-khaled-academy-release"

if (-not (Test-Path $ZipPath)) { throw "ملف الإصدار غير موجود: $ZipPath" }

if (Test-Path $ExtractPath) { Remove-Item $ExtractPath -Recurse -Force }
Expand-Archive -Path $ZipPath -DestinationPath $ExtractPath -Force

if (-not (Test-Path (Join-Path $RepoPath ".git"))) {
  gh repo clone byAmrkhaled0/eng-amr-khaled-academy $RepoPath
}

$ReleaseSource = Join-Path $ExtractPath "techno-audit"
if (-not (Test-Path (Join-Path $ReleaseSource "package.json"))) { throw "مجلد المشروع غير موجود داخل الملف المضغوط" }

robocopy $ReleaseSource $RepoPath /E /R:2 /W:1 /XD .git node_modules dist .firebase .vercel
if ($LASTEXITCODE -gt 7) { throw "فشل نسخ ملفات المشروع" }

Set-Location $RepoPath
npm install
npm --prefix functions install
npm test
npm run build
firebase use eng-amr-khaled-academy
firebase deploy --only "firestore:rules,firestore:indexes,storage"
firebase deploy --only "functions:getPortalStudent,functions:getExamDashboard,functions:getStudentMonthlyReportAdmin,functions:getParentMonthlyReport,functions:prepareMonthlyParentReports,functions:getAdminOperationsDashboard,functions:finalizeExamAbsencesAdmin,functions:finalizeExamAbsences,functions:createStudentAccess,functions:updateStudentSafely"

git status --short
git add -A
git commit -m "feat: complete parent reports exam absences and v65 UX"
git push origin main
```

بعد نجاح `git push` سيبدأ Vercel في نشر الواجهة من GitHub. إذا لم يكن Vercel مربوطًا بالفرع `main`، انشر يدويًا:

```powershell
npx vercel --prod
```

بعد النشر افتح الموقع في نافذة خاصة أو نفّذ تحديثًا إجباريًا `Ctrl + F5` حتى لا ترى ملفات Cache قديمة.

مهم: عند سؤال Firebase عن حذف Indexes أو Field Overrides أو Functions قديمة اختر `N` ما لم تكن متأكدًا أنك تريد حذفها.
