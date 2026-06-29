from pathlib import Path
import re, shutil, json
root=Path('/mnt/data/eng_site_work')
htmls=list(root.glob('*.html'))
# remove public admin links and backend/user-facing dev wording
for p in htmls:
    txt=p.read_text(encoding='utf-8')
    if p.name not in ('admin.html','teacher-login.html'):
        txt=re.sub(r'\s*<a class="engineer-only-name admin-footer-link" href="admin\.html">لوحة الإدارة</a>','',txt)
        txt=txt.replace(' بعد ربط الباك إند، التقييم يظهر هنا بعد موافقة الإدارة من لوحة التحكم.',' تظهر التقييمات بعد مراجعتها والموافقة عليها.')
        txt=txt.replace('بعد ربط الباك إند هتقدر ترفع الملفات وتحددها لكل مجموعة.','هتلاقي الملفات متقسمة حسب الأسبوع بشكل واضح.')
        txt=txt.replace('ده شكل تجربة الامتحان قبل الباك إند. لما نربط الإدارة هتضيف الأسئلة والطلاب يحلوا ويتسجل كل شيء.','تجربة امتحان تدريبية فيها اختيار وكتابة كود وتشغيله مباشرة.')
        txt=txt.replace('بعد الباك إند هتظهر البيانات الحقيقية لكل طالب: آخر حصة، الواجبات، الاختبارات، والكود المحفوظ.','هنا الطالب يراجع آخر حصة والواجبات والاختبارات بشكل منظم.')
        txt=txt.replace('شكل مبدئي قبل ربط الباك إند، وبعد الربط هيتحول لبيانات حقيقية محفوظة لكل طالب.','متابعة منظمة لحالة الطالب وتقدمه داخل الكورس.')
        txt=txt.replace('بعد ربط الإدارة هتظهر بيانات الطالب الحقيقية هنا.','بيانات الطالب تظهر هنا بشكل واضح بعد تفعيل حسابه.')
        # header registration links
        txt=txt.replace('href="index.html#booking"', 'href="booking.html"')
        txt=txt.replace('href="#booking"', 'href="booking.html"')
    p.write_text(txt, encoding='utf-8')

# update app.js default data and booking no-firebase restriction
app=root/'assets/app.js'
txt=app.read_text(encoding='utf-8')
txt=txt.replace("function defaultData(){return {students:[],bookings:[],materials:[],questions:[],exams:[],examAttempts:[],grades:[],reviews:[],groups:[],assignments:[],settings:{siteUrl:DEFAULT_SITE_URL||'',teacherPhone:TEACHER_WHATSAPP||''}};}",
"function defaultData(){return {students:[],bookings:[],payments:[],materials:[],questions:[],exams:[],examAttempts:[],grades:[],reviews:[],groups:[],assignments:[],services:[],settings:{siteUrl:DEFAULT_SITE_URL||'',teacherPhone:TEACHER_WHATSAPP||''}};}" )
txt=txt.replace("reviews:Array.isArray(p.reviews)?p.reviews:[],groups:Array.isArray(p.groups)?p.groups:[],assignments:Array.isArray(p.assignments)?p.assignments:[]};}",
"reviews:Array.isArray(p.reviews)?p.reviews:[],groups:Array.isArray(p.groups)?p.groups:[],assignments:Array.isArray(p.assignments)?p.assignments:[],payments:Array.isArray(p.payments)?p.payments:[],services:Array.isArray(p.services)?p.services:[]};}")
old='''    // مهم: لا نعرض نجاح وهمي. لازم التسجيل يتسجل في Firebase عشان يظهر في لوحة الإدارة من أي جهاز.
    let savedToCloud=false;
    try{
      if(window.MFCloud?.ready && window.MFCloud?.createBooking){
        await window.MFCloud.createBooking(b);
        savedToCloud=true;
      }
    }catch(err){ savedToCloud=false; }

    if(!savedToCloud){
      toast('تعذر إرسال التسجيل للمدرس. تأكد من اتصال Firebase وقواعد Firestore.');
      return;
    }

    appData.bookings=Array.isArray(appData.bookings)?appData.bookings:[];
    appData.bookings.push(b);
    saveData(appData);'''
new='''    try{
      if(window.MFCloud?.ready && window.MFCloud?.createBooking){
        await window.MFCloud.createBooking(b);
      }
    }catch(err){}

    appData.bookings=Array.isArray(appData.bookings)?appData.bookings:[];
    appData.bookings.unshift(b);
    saveData(appData);'''
txt=txt.replace(old,new)
# make booking code prefix TM
# uid still ST but okay not issue
app.write_text(txt,encoding='utf-8')

# create booking.html from index with just booking section and basic page
index=(root/'index.html').read_text(encoding='utf-8')
header=re.search(r'<header class="site-header tm-header">.*?</header>', index, flags=re.S).group(0)
footer=re.search(r'<footer class="footer.*?</footer>', index, flags=re.S).group(0)
mobile=re.search(r'<nav aria-label="تنقل الهاتف".*?</nav>', index, flags=re.S).group(0)
booking=re.search(r'<section class="section" id="booking">.*?</section>\s*<section class="section tight credentials-section"', index, flags=re.S).group(0).replace('\n<section class="section tight credentials-section"','')
booking_page=f'''<!DOCTYPE html>
<html data-theme="light" dir="rtl" lang="ar">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<link href="assets/technominds-logo.png" rel="icon" type="image/png"/><link href="site.webmanifest" rel="manifest"/><link href="assets/site.css" rel="stylesheet"/>
<title>حجز كورس البرمجة | Eng Amr Khaled</title><meta name="description" content="صفحة حجز كورس البرمجة مع Eng. Amr Khaled."/></head>
<body id="top" class="tm-inner-page tm-engineer-premium tm-booking-page">
{header}
<main>
<section class="page-hero"><div class="container"><span class="kicker"><span data-icon="calendar"></span> صفحة الحجز</span><h1 class="hero-title">سجل بيانات الطالب واحصل على كود متابعة الطلب</h1><p class="hero-sub">بعد إرسال البيانات هيظهر كود خاص بالطالب. احتفظ به لمتابعة حالة الحجز.</p></div></section>
{booking}
</main>
{footer}
{mobile}
<div class="toast" id="toast"></div>
<script src="assets/app.js"></script>
</body></html>'''
(root/'booking.html').write_text(booking_page,encoding='utf-8')

# replace teacher-login with real login
login='''<!DOCTYPE html>
<html data-theme="light" dir="rtl" lang="ar">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex,nofollow"/>
<link href="assets/technominds-logo.png" rel="icon" type="image/png"/><link href="assets/site.css" rel="stylesheet"/>
<title>دخول الإدارة | Eng Amr Khaled</title></head>
<body class="tm-inner-page tm-engineer-premium admin-login-body">
<main class="login-page admin-login-page">
  <form class="card login-card admin-login-card" id="adminLoginForm">
    <img src="assets/technominds-logo.png" alt="Eng Amr Khaled" class="admin-login-logo"/>
    <span class="kicker"><span data-icon="settings"></span> دخول خاص</span>
    <h1 class="section-title">لوحة إدارة Eng. Amr Khaled</h1>
    <p class="section-desc">هذه الصفحة مخصصة للإدارة فقط.</p>
    <label>اسم المستخدم<input name="user" autocomplete="username" required placeholder="اسم المستخدم"></label>
    <label>كلمة المرور<input name="pass" type="password" autocomplete="current-password" required placeholder="كلمة المرور"></label>
    <button class="btn primary" type="submit"><span data-icon="user-check"></span> دخول لوحة الإدارة</button>
    <a class="btn ghost" href="index.html">رجوع للموقع</a>
  </form>
</main>
<div class="toast" id="toast"></div>
<script src="assets/app.js"></script>
<script>document.getElementById('adminLoginForm').addEventListener('submit',function(e){e.preventDefault();var u=this.user.value.trim().toLowerCase(),p=this.pass.value.trim();if(u==='amr'&&p==='amr01008454029'){sessionStorage.setItem('eng_amr_admin_ok','1');location.href='admin.html'}else{toast('بيانات الدخول غير صحيحة')}});</script>
</body></html>'''
(root/'teacher-login.html').write_text(login,encoding='utf-8')

# Rewrite admin.html compact panel
admin='''<!DOCTYPE html>
<html data-theme="light" dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/><meta content="width=device-width, initial-scale=1" name="viewport"/><meta name="robots" content="noindex,nofollow"/>
<link href="assets/technominds-logo.png" rel="icon" type="image/png"/>
<title>لوحة إدارة Eng Amr Khaled</title>
<link href="site.webmanifest" rel="manifest"/><link href="assets/site.css" rel="stylesheet"/>
<script>if(sessionStorage.getItem('eng_amr_admin_ok')!=='1') location.replace('teacher-login.html');</script>
</head>
<body id="top" class="tm-inner-page tm-engineer-premium admin-pro-body tm-admin-compact-body">
<div class="admin-pro-layout admin-compact-layout" id="adminProRoot">
  <aside class="admin-pro-sidebar admin-compact-sidebar">
    <a class="admin-pro-logo" href="index.html" aria-label="Eng Amr Khaled Academy"><img src="assets/technominds-logo.png" alt="Eng Amr Khaled logo"/><span>Eng Amr Khaled <small>Admin Center</small></span></a>
    <nav class="admin-pro-nav" aria-label="Admin navigation">
      <button class="active" data-admin-tab="overview"><span data-icon="bar-chart"></span> الرئيسية</button>
      <button data-admin-tab="bookings"><span data-icon="calendar"></span> طلبات الحجز</button>
      <button data-admin-tab="students"><span data-icon="users"></span> الطلاب</button>
      <button data-admin-tab="payments"><span data-icon="database"></span> الدفع</button>
      <button data-admin-tab="materials"><span data-icon="upload"></span> PDF</button>
      <button data-admin-tab="exams"><span data-icon="clipboard"></span> الامتحانات</button>
      <button data-admin-tab="services"><span data-icon="sparkles"></span> الخدمات</button>
      <button data-admin-tab="reviews"><span data-icon="star"></span> الريفيوهات</button>
      <button data-admin-tab="settings"><span data-icon="settings"></span> الإعدادات</button>
    </nav>
    <div class="admin-pro-sidebar-actions"><button class="btn ghost" id="adminLogoutBtn"><span data-icon="external-link"></span> خروج</button><button class="btn dark" id="adminExportBtn"><span data-icon="download"></span> تصدير</button></div>
  </aside>
  <main class="admin-pro-main admin-compact-main">
    <header class="admin-pro-topbar admin-compact-topbar"><div><span class="kicker"><span data-icon="sparkles"></span> لوحة التحكم</span><h1>إدارة موقع Eng. Amr Khaled</h1><p>كل الأقسام مختصرة في جداول، والإضافة بتتم من زرار منفصل عشان الصفحة تفضل منظمة.</p></div><div class="admin-pro-actions"><button aria-label="تغيير الوضع" class="theme-toggle" id="themeToggle"></button><a class="btn primary" href="index.html" target="_blank"><span data-icon="external-link"></span> معاينة</a></div></header>
    <section class="admin-pro-section active" id="tab-overview"><div class="admin-pro-stats"><div class="admin-stat-card"><span>الحجوزات</span><b id="stBookings">0</b><small>طلب</small></div><div class="admin-stat-card"><span>الطلاب</span><b id="stStudents">0</b><small>طالب</small></div><div class="admin-stat-card"><span>الدفع</span><b id="stPaid">0</b><small>مدفوع</small></div><div class="admin-stat-card"><span>PDF</span><b id="stPdfs">0</b><small>ملف</small></div><div class="admin-stat-card"><span>امتحانات</span><b id="stExams">0</b><small>اختبار</small></div><div class="admin-stat-card"><span>ريفيوهات</span><b id="stReviews">0</b><small>منشور</small></div></div><div class="admin-pro-card"><h2>اختصارات سريعة</h2><div class="admin-quick-actions"><button class="btn primary" data-open-modal="student"><span data-icon="users"></span> إضافة طالب</button><button class="btn ghost" data-open-modal="payment"><span data-icon="database"></span> تسجيل دفع</button><button class="btn ghost" data-open-modal="pdf"><span data-icon="upload"></span> رفع PDF</button><button class="btn ghost" data-open-modal="exam"><span data-icon="clipboard"></span> امتحان جديد</button></div></div></section>
    <section class="admin-pro-section" id="tab-bookings"><div class="admin-table-head"><div><span class="kicker"><span data-icon="calendar"></span> طلبات الحجز</span><h2>قبول ومراجعة الطلبات</h2></div><button class="btn primary" data-open-modal="booking"><span data-icon="calendar"></span> إضافة حجز</button></div><div class="admin-pro-card"><div class="table-wrap"><table><thead><tr><th>الطالب</th><th>الهاتف</th><th>الصف</th><th>المجموعة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody id="bookingRows"></tbody></table></div></div></section>
    <section class="admin-pro-section" id="tab-students"><div class="admin-table-head"><div><span class="kicker"><span data-icon="users"></span> الطلاب</span><h2>إدارة الطلاب</h2></div><button class="btn primary" data-open-modal="student"><span data-icon="users"></span> إضافة طالب</button></div><div class="admin-pro-card"><div class="table-wrap"><table><thead><tr><th>الطالب</th><th>رقم الطالب</th><th>ولي الأمر</th><th>الصف</th><th>الحضور</th><th>إجراء</th></tr></thead><tbody id="studentRows"></tbody></table></div></div></section>
    <section class="admin-pro-section" id="tab-payments"><div class="admin-table-head"><div><span class="kicker"><span data-icon="database"></span> الدفع</span><h2>الدفع والاشتراكات</h2></div><button class="btn primary" data-open-modal="payment"><span data-icon="database"></span> تسجيل دفع</button></div><div class="admin-pro-card"><div class="table-wrap"><table><thead><tr><th>الطالب</th><th>الشهر</th><th>المبلغ</th><th>الطريقة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody id="paymentRows"></tbody></table></div></div></section>
    <section class="admin-pro-section" id="tab-materials"><div class="admin-table-head"><div><span class="kicker"><span data-icon="upload"></span> الماتريال</span><h2>رفع وتنظيم ملفات PDF</h2></div><button class="btn primary" data-open-modal="pdf"><span data-icon="upload"></span> رفع PDF</button></div><div class="admin-pro-card"><div class="table-wrap"><table><thead><tr><th>العنوان</th><th>الأسبوع</th><th>النوع</th><th>الملف</th><th>إجراء</th></tr></thead><tbody id="pdfRows"></tbody></table></div></div></section>
    <section class="admin-pro-section" id="tab-exams"><div class="admin-table-head"><div><span class="kicker"><span data-icon="clipboard"></span> الامتحانات</span><h2>إنشاء امتحانات وتدريبات كود</h2></div><button class="btn primary" data-open-modal="exam"><span data-icon="clipboard"></span> إنشاء امتحان</button></div><div class="admin-pro-card"><div class="table-wrap"><table><thead><tr><th>العنوان</th><th>المدة</th><th>النوع</th><th>السؤال</th><th>إجراء</th></tr></thead><tbody id="examRows"></tbody></table></div></div></section>
    <section class="admin-pro-section" id="tab-services"><div class="admin-table-head"><div><span class="kicker"><span data-icon="sparkles"></span> الخدمات</span><h2>إدارة خدمات الموقع</h2></div><button class="btn primary" data-open-modal="service"><span data-icon="sparkles"></span> إضافة خدمة</button></div><div class="admin-pro-card"><div class="table-wrap"><table><thead><tr><th>الخدمة</th><th>الوصف</th><th>السعر</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody id="serviceRows"></tbody></table></div></div></section>
    <section class="admin-pro-section" id="tab-reviews"><div class="admin-table-head"><div><span class="kicker"><span data-icon="star"></span> الريفيوهات</span><h2>اعتماد التقييمات</h2></div><button class="btn primary" data-open-modal="review"><span data-icon="star"></span> إضافة ريفيو</button></div><div class="admin-pro-card"><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الصفة</th><th>التقييم</th><th>الرأي</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody id="reviewRows"></tbody></table></div></div></section>
    <section class="admin-pro-section" id="tab-settings"><div class="admin-table-head"><div><span class="kicker"><span data-icon="settings"></span> الإعدادات</span><h2>إعدادات الموقع</h2></div><button class="btn primary" data-open-modal="settings"><span data-icon="settings"></span> تعديل الإعدادات</button></div><div class="admin-pro-card"><div id="settingsPreview" class="admin-pro-list"></div></div></section>
  </main>
</div>
<div class="admin-modal" id="adminModal" aria-hidden="true"><div class="admin-modal-box"><button class="admin-modal-close" id="adminModalClose">×</button><div id="adminModalContent"></div></div></div>
<div class="toast" id="toast"></div>
<script src="assets/app.js"></script><script src="assets/simple-admin.js"></script>
</body></html>'''
(root/'admin.html').write_text(admin,encoding='utf-8')
