'use strict';

let adminData = typeof loadData === 'function' ? loadData() : {students:[],bookings:[],materials:[],questions:[],exams:[],examAttempts:[],reviews:[],groups:[],assignments:[],settings:{}};
let currentSection = 'overview';
let currentStaff = null;
let qrScanner = null;
let attendanceDate = new Date().toISOString().slice(0,10);
let adminCloudSaveTimer = null;
let bookingNotificationUnsubscribe = null;
let bookingListenerReady = false;
let adminRecordsLoadToken = 0;
const bookingActionPending = new Set();
const acceptedBookingCodes = new Set();
const classProgressActionPending = new Set();
const studentDeletionPending = new Set();
let adminDrawerReturnFocus = null;

const adminSections = [
  ['overview','bar-chart','الرئيسية'],
  ['students','users','الطلاب'],
  ['bookings','calendar','الحجوزات'],
  ['schedules','calendar','المواعيد'],
  ['attendance','qr','الحضور والغياب'],
  ['payments','database','حالة الدفع'],
  ['exams','clipboard','الاختبارات'],
  ['materials','book-open','التدريبات والأسئلة'],
  ['reviews','star','التقييمات']
];

function aToast(msg){const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2800);}
function safe(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function adminActionErrorMessage(error,fallback='تعذر تنفيذ العملية. حاول مرة أخرى.'){
  const nested=[error,error?.directError,error?.callableError].filter(Boolean);
  const raw=nested.map(item=>`${item?.code||''} ${item?.message||''}`).join(' | ');
  if(/الطالب غير موجود|student.*not found/i.test(raw))return 'الطالب غير موجود على قاعدة البيانات أو الحساب غير نشط.';
  if(/functions\/not-found|function.*unavailable|service.*unavailable|not found$/i.test(raw))return 'الخدمة المطلوبة غير منشورة. انشر Firebase Functions والقواعد من النسخة الجديدة.';
  if(/unauthenticated|auth\/user-token-expired/i.test(raw))return 'انتهت جلسة الدخول. سجّل دخول المدرس مرة أخرى.';
  if(/permission-denied|insufficient permissions|not authorized/i.test(raw))return 'الحساب لا يملك الصلاحية أو قواعد Firebase الجديدة لم تُنشر بعد.';
  if(/invalid-argument|كود.*غير صالح|بيانات.*غير مكتملة/i.test(raw))return 'البيانات غير مكتملة أو غير صحيحة. راجع المدخلات وحاول مرة أخرى.';
  if(/resource-exhausted|too many/i.test(raw))return 'تم تنفيذ محاولات كثيرة بسرعة. انتظر قليلًا ثم حاول مرة أخرى.';
  if(/unavailable|network|fetch|offline|deadline-exceeded|timeout/i.test(raw))return 'الاتصال بقاعدة البيانات غير متاح الآن. تحقق من الإنترنت وحاول مرة أخرى.';
  return fallback;
}
window.adminActionErrorMessage=adminActionErrorMessage;
// adminData is the in-memory source of truth after login. Re-parsing the full
// session cache on every render used to freeze slower phones and duplicate work.
function fresh(){ensureCollections();}
function ensureCollections(){['students','bookings','materials','questions','exams','examAttempts','grades','reviews','groups','assignments'].forEach(k=>{if(!Array.isArray(adminData[k]))adminData[k]=[];}); adminData.settings=adminData.settings||{};}
function persist(msg,meta){
  ensureCollections();
  saveData(adminData);
  clearTimeout(adminCloudSaveTimer);
  adminCloudSaveTimer=setTimeout(()=>{
    window.MFCloud?.saveSiteData?.(adminData).catch(()=>aToast('تم حفظ التغييرات على الجهاز، وسنحاول رفعها عند عودة الاتصال'));
  },350);
  if(msg){
    aToast(msg);
    setTimeout(()=>window.MFCloud?.logActivity?.(msg,meta||{}).catch(()=>{}),0);
  }
}
function deferAdminRender(fn){setTimeout(fn,40);}
function phoneDigits(v){return (typeof toEnglishDigits==='function'?toEnglishDigits(v):String(v||'').replace(/[٠-٩]/g,digit=>String(digit.charCodeAt(0)-1632)).replace(/[۰-۹]/g,digit=>String(digit.charCodeAt(0)-1776))).replace(/\D/g,'');}
function isoDateAdmin(d=new Date()){return d.toISOString().slice(0,10);}
function timeNow(){return new Date().toLocaleTimeString('ar-EG',{hour:'numeric',minute:'2-digit',hour12:true});}
function randomAccessCode(){const bytes=new Uint32Array(8);if(window.crypto?.getRandomValues)window.crypto.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*0xffffffff);return String((bytes[0]%9)+1)+[...bytes.slice(1)].map(x=>String(x%10)).join('');}
function uniqueAccessCode(prefix,field){let code;do{code=randomAccessCode(prefix);}while(adminData.students.some(s=>String(s[field]||'').toUpperCase()===code));return code;}
function newStudentCode(){return uniqueAccessCode('ST','studentCode');}
function newParentCode(){return uniqueAccessCode('PR','parentCode');}
function isWeakAccessCode(code){return !/^\d{8}$/.test(String(code||''));}
function adminWhatsAppPhone(v){const d=phoneDigits(v); if(!d) return ''; if(d.startsWith('20')) return d; if(d.startsWith('0')) return '2'+d; return d;}
function monthlyReportTextForStudent(st){const s=normalizeStudent(st); if(typeof parentReportText==='function') return parentReportText(s); const c=calcStudentAdmin(s); return `تقرير متابعة شهر ${s.month||''}\n\nالطالب: ${s.name}\nالكود: ${s.studentCode}\nالمسار: ${s.grade||'-'}\nالمجموعة: ${s.group||'-'}\n\nالمستوى العام: ${c.final||0}%\nنسبة الحضور: ${c.attendancePct||0}%\nمتوسط الدرجات: ${c.avg||0}%\nحالة الدفع: ${s.paid?'تم الدفع':'لم يتم الدفع'}\n\nملاحظات المدرس:\n${s.notes||'لا توجد ملاحظات حالية.'}`;}
function issuedCodesText(student){const s=normalizeStudent(student);return `اسم الطالب: ${s.name}\nكود الطالب وولي الأمر: ${s.studentCode}`;}
window.closeIssuedCodes=function(){document.getElementById('issuedCodesModal')?.remove();};
window.copyIssuedCodes=async function(){const modal=document.getElementById('issuedCodesModal'),text=modal?.dataset.copyText||'';try{await navigator.clipboard.writeText(text);aToast('تم نسخ الكود الموحّد');}catch(_){prompt('انسخ الكود',text);}};
window.showIssuedCodes=function(student,title='تم تسجيل الطالب بنجاح'){
  const s=normalizeStudent(student);closeIssuedCodes();document.body.insertAdjacentHTML('beforeend',`<div class="issued-codes-modal" id="issuedCodesModal" role="dialog" aria-modal="true" data-copy-text="${safe(issuedCodesText(s))}"><div class="card issued-codes-card"><button class="issued-codes-close" type="button" onclick="closeIssuedCodes()" aria-label="إغلاق">×</button><span class="badge good">تم الحفظ على النظام</span><h2>${safe(title)}</h2><p>${safe(s.name)} · ${safe(s.grade||'')}</p><div class="issued-code-row"><small>الكود الموحد للطالب وولي الأمر</small><code>${safe(s.studentCode)}</code></div><div class="mobile-actions"><button class="btn primary" type="button" onclick="copyIssuedCodes()"><span data-icon="clipboard"></span> نسخ الكود</button><button class="btn ghost" type="button" onclick="closeIssuedCodes()">تم</button></div></div></div>`);hydrateIcons();
};
function stCode(st){return st.studentCode||st.code||st.id||'';}
function stName(st){return st.studentName||st.name||'';}
function normalizeStudent(st){const normalize=typeof toEnglishDigits==='function'?toEnglishDigits:value=>String(value||'');const code=normalize(stCode(st)||'').toUpperCase(); return {...st,id:code,code,studentCode:code,parentCode:normalize(st.parentCode||'').toUpperCase(),studentPhone:phoneDigits(st.studentPhone),parentPhone:phoneDigits(st.parentPhone),name:stName(st),studentName:stName(st),active:st.active!==false};}
function groupOptions(){const data=[...(adminData.groups||[]).filter(g=>g.active!==false).map(g=>g.name),...(adminData.students||[]).map(s=>s.group)].filter(Boolean); return [...new Set(data)];}
function calcStudentAdmin(st){const c=typeof calcStudent==='function'?calcStudent(st):{attendancePct:0,avg:0,final:0,level:'-'}; return c;}
function badgeStatus(v){return v===true||v==='present'||v==='حاضر'||v==='تم الدفع'?'good':v===false||v==='absent'||v==='غائب'||v==='لم يدفع'?'danger':'warn';}
function content(html){const el=document.getElementById('adminContent'); if(el) el.innerHTML=`<section class="admin-section active">${html}</section>`; hydrateIcons();}
function selectedGrade(){return document.getElementById('attendanceGrade')?.value || 'all';}
function selectedGroup(){return document.getElementById('attendanceGroup')?.value || 'all';}
function filterStudents(grade='all', group='all'){return (adminData.students||[]).map(normalizeStudent).filter(s=>(grade==='all'||s.grade===grade)&&(group==='all'||s.group===group));}

async function cloudDelete(collection,id){if(!window.MFCloud?.deleteDocument)throw new Error('Delete service unavailable');await window.MFCloud.deleteDocument(collection,id);return true;}
async function saveAdminDataNow(){if(!window.MFCloud?.saveSiteData)throw new Error('Sync service unavailable');await window.MFCloud.saveSiteData(adminData);saveData(adminData);return true;}
async function reloadFromCloud(){
  if(!window.MFCloud?.loadSiteData) return;
  const data = await window.MFCloud.loadSiteData({fast:true});
  if(data){ adminData = mergeData(data); saveData(adminData); }
  const token=++adminRecordsLoadToken;
  setTimeout(()=>hydrateAdminRecords(token),80);
}

async function hydrateAdminRecords(token){
  if(!window.MFCloud?.loadStaffRecords)return;
  try{
    const records=await window.MFCloud.loadStaffRecords();
    if(token!==adminRecordsLoadToken||!records)return;
    const students=(adminData.students||[]).map(student=>({...student,attendance:[],grades:[],homeworks:[],recitations:[]}));
    const map=new Map(students.map(student=>[String(student.studentCode||student.code||student.id||'').toUpperCase(),student]));
    const getStudent=code=>map.get(String(code||'').toUpperCase());
    (records.attendance||[]).forEach(row=>{const student=getStudent(row.studentCode||row.studentId);if(student)student.attendance.push(row);});
    (records.grades||[]).forEach(row=>{const student=getStudent(row.studentCode||row.code);if(student)student.grades.push(row);});
    (records.recitations||[]).forEach(row=>{const student=getStudent(row.studentCode);if(student)student.recitations.push(row);});
    (records.homeworks||[]).forEach(row=>{const student=getStudent(row.studentCode);if(student)student.homeworks.push(row);});
    students.forEach(student=>{student.attendance.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));student.grades.sort((a,b)=>String(a.date||a.submittedAt||'').localeCompare(String(b.date||b.submittedAt||'')));});
    adminData.students=students;adminData.examAttempts=records.attempts||[];adminData.grades=records.grades||[];
    saveData(adminData);
    const focused=document.activeElement?.matches?.('input,textarea,select');
    if(document.querySelector('.admin-page')&&!focused&&!document.querySelector('[role="dialog"],.correction-modal-v40'))renderSection();
  }catch(error){console.warn('admin-records-background-load',error);}
}

function unauthorized(message='غير مصرح لك بالدخول.'){
  const root=document.getElementById('adminRoot');
  root.className='login-page';
  root.innerHTML=`<div class="card login-card"><div class="logo"><span class="logo-mark" aria-hidden="true"></span><span>Techno Minds <small>Programming &amp; AI</small></span></div><h1 class="section-title" style="font-size:2rem;margin:22px 0 8px">${safe(message)}</h1><p class="section-desc">هذه الصفحة مخصصة فقط لحسابات فريق العمل المعتمدة.</p><button class="btn ghost" onclick="location.reload()">رجوع لتسجيل الدخول</button></div>`;
  hydrateIcons();
}

function adminLogin(){
  const form=document.getElementById('loginForm'); if(!form) return;
  const resetButton=document.getElementById('adminPasswordReset');
  if(resetButton&&!resetButton.dataset.bound){
    resetButton.dataset.bound='true';
    resetButton.addEventListener('click',async()=>{
      const email=form.email.value.trim();
      if(!email||!form.email.checkValidity()){form.email.reportValidity();return;}
      resetButton.disabled=true;resetButton.classList.add('is-loading');
      try{
        if(!window.MFCloud?.sendPasswordReset)throw new Error('Password reset unavailable');
        await window.MFCloud.sendPasswordReset(email);
        aToast('تم إرسال رابط إعادة ضبط كلمة المرور إذا كان البريد مسجلًا في Authentication.');
      }catch(error){
        const raw=`${error?.code||''} ${error?.message||''}`;
        aToast(/network|unavailable/i.test(raw)?'تعذر الاتصال بـ Firebase الآن. حاول مرة أخرى.':'تعذر إرسال الرابط. راجع بريد Firebase Authentication ثم حاول.');
      }finally{resetButton.disabled=false;resetButton.classList.remove('is-loading');}
    });
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=form.email.value.trim(); const pass=form.password.value;
    if(!window.MFCloud?.ready || !window.MFCloud.signIn) return aToast('خدمة تسجيل الدخول غير متاحة الآن. تحقق من الإنترنت وحاول مرة أخرى.');
    try{
      await window.MFCloud.signIn(email,pass);
      await window.MFCloud.activateOwnerAccount?.().catch(error=>{
        if(/permission-denied/i.test(`${error?.code||''} ${error?.message||''}`))throw error;
      });
      currentStaff = await window.MFCloud.getCurrentStaffProfile();
      if(!currentStaff?.allowed){ await window.MFCloud.signOut?.(); unauthorized('غير مصرح لك بالدخول.'); return; }
      await reloadFromCloud();
      renderAdmin();
      aToast('تم الدخول إلى لوحة المدرس');
    }catch(err){const raw=String(err?.code||'')+' '+String(err?.message||'');const message=/invalid-credential|wrong-password|user-not-found|invalid-login/i.test(raw)?'البريد أو كلمة المرور غير صحيحة. استخدم نفس البريد الموجود في Firebase Authentication.':/permission-denied/i.test(raw)?'تم تسجيل الدخول لكن البريد غير موجود ضمن حسابات الإدارة المسموحة.':/unauthenticated/i.test(raw)?'تعذر تأكيد جلسة الدخول. حدّث الصفحة وحاول مرة أخرى.':/network|unavailable|internal|function.*unavailable/i.test(raw)?'تم الوصول إلى Firebase لكن وظائف الإدارة غير مرفوعة أو الاتصال غير متاح. ارفع Functions ثم حاول.':'تعذر فتح لوحة الإدارة. راجع البريد وكلمة المرور وصلاحية المستخدم.';aToast(message); }
  });
}

async function tryRestoreSession(){
  if(!window.MFCloud?.auth?.onAuthStateChanged) return;
  window.MFCloud.auth.onAuthStateChanged(async user=>{
    if(!user || document.querySelector('.admin-page')) return;
    try{
      await window.MFCloud.activateOwnerAccount?.().catch(()=>null);
      currentStaff = await window.MFCloud.getCurrentStaffProfile();
      if(currentStaff?.allowed){ await reloadFromCloud(); renderAdmin(); }
    }catch(e){}
  });
}

function adminSectionName(id){return adminSections.find(([sectionId])=>sectionId===id)?.[2]||'الرئيسية';}
function setAdminDrawer(open){
  const shouldOpen=!!open;
  document.body.classList.toggle('admin-drawer-open',shouldOpen);
  document.getElementById('adminDrawerBackdrop')?.classList.toggle('show',shouldOpen);
  const mobile=window.matchMedia?.('(max-width:980px)').matches;
  const sidebar=document.getElementById('adminSidebar');
  if(!sidebar)return;
  const shouldHide=!!mobile&&!shouldOpen;
  if(shouldOpen&&mobile&&document.activeElement instanceof HTMLElement&&!sidebar.contains(document.activeElement)){
    adminDrawerReturnFocus=document.activeElement;
  }
  // Move focus outside before hiding the drawer. Hiding a focused descendant
  // caused Edge's aria-hidden warning and trapped keyboard focus in a closed menu.
  if(shouldHide&&sidebar.contains(document.activeElement)){
    const fallback=document.querySelector('.admin-menu-button');
    const target=adminDrawerReturnFocus?.isConnected?adminDrawerReturnFocus:fallback;
    if(target instanceof HTMLElement)target.focus({preventScroll:true});
    else if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
  }
  sidebar.toggleAttribute('inert',shouldHide);
  sidebar.setAttribute('aria-hidden',shouldHide?'true':'false');
}
window.toggleAdminDrawer=function(open){setAdminDrawer(open ?? !document.body.classList.contains('admin-drawer-open'));};
function syncAdminChrome(){
  document.querySelectorAll('[data-admin-nav]').forEach(btn=>btn.classList.toggle('active',btn.dataset.adminNav===currentSection));
  const label=document.getElementById('adminCurrentSectionLabel');
  if(label) label.textContent=adminSectionName(currentSection);
}
window.goAdminSection=function(id){
  if(!adminSections.some(([sectionId])=>sectionId===id))return;
  currentSection=id;
  syncAdminChrome();
  setAdminDrawer(false);
  renderSection();
  window.scrollTo({top:0,behavior:'smooth'});
};

function renderAdmin(){
  fresh();
  document.querySelector('.site-header')?.remove();
  document.querySelector('.v56-public-menu')?.remove();
  document.querySelector('.v56-public-menu-backdrop')?.remove();
  document.body.classList.add('admin-dashboard-active');
  const root=document.getElementById('adminRoot');
  root.className='admin-page admin-page-v37';
  root.innerHTML=`
    <div class="admin-drawer-backdrop" id="adminDrawerBackdrop" onclick="toggleAdminDrawer(false)"></div>
    <aside class="admin-sidebar" id="adminSidebar" aria-label="أقسام لوحة التحكم">
      <div class="admin-sidebar-head">
        <div class="logo admin-brand"><span class="logo-mark admin-brand-logo" aria-hidden="true"></span><span>لوحة Techno Minds <small>حساب ${safe(currentStaff?.role||'staff')}</small></span></div>
        <button class="admin-sidebar-close" type="button" aria-label="إغلاق القائمة" onclick="toggleAdminDrawer(false)">×</button>
      </div>
      <div class="admin-nav">${adminSections.map(([id,ic,name])=>`<button type="button" data-admin-nav="${id}" class="${id===currentSection?'active':''}"><span data-icon="${ic}"></span><span>${name}</span></button>`).join('')}</div>
      <div class="admin-sidebar-footer"><button class="btn ghost" type="button" onclick="location.href='index.html'"><span data-icon="external-link"></span> معاينة الموقع</button></div>
    </aside>
    <main class="admin-main">
      <header class="admin-mobile-header">
        <button class="admin-menu-button" type="button" aria-label="فتح قائمة لوحة التحكم" onclick="toggleAdminDrawer(true)"><span aria-hidden="true">☰</span></button>
        <div class="admin-mobile-brand"><span class="admin-mobile-logo" aria-hidden="true"></span><span><small>لوحة Techno Minds</small><strong id="adminCurrentSectionLabel">${safe(adminSectionName(currentSection))}</strong></span></div>
        <button class="admin-mobile-home" type="button" aria-label="معاينة الموقع" onclick="location.href='index.html'"><span data-icon="external-link"></span></button>
      </header>
      <div class="admin-top">
        <div class="admin-welcome"><span class="kicker"><span data-icon="sparkles"></span> لوحة المدرس</span><h1 class="section-title">أهلًا يا م. عمرو خالد 👋</h1><p>الطلاب والحجوزات والمواعيد متصلة مباشرة بصفحات المنصة.</p><nav class="admin-site-links" aria-label="معاينة صفحات الموقع"><a href="index.html" target="_blank">الرئيسية</a><a href="index.html#booking" target="_blank">الحجز</a><a href="student.html" target="_blank">بوابة الطالب</a><a href="practical.html" target="_blank">المعمل العملي</a><a href="about.html" target="_blank">عن م. عمرو</a></nav></div>
        <div class="header-actions"><button class="theme-toggle" id="themeToggleAdmin" aria-label="تغيير الوضع"></button><button class="btn ghost" type="button" onclick="enableBookingNotifications()"><span data-icon="calendar"></span><span>تنبيهات الحجز</span></button><button class="btn ghost" type="button" onclick="forceFirestoreSync()"><span data-icon="refresh-cw"></span><span>حفظ التغييرات</span></button><button class="btn dark" type="button" onclick="adminLogout()">خروج</button></div>
      </div>
      <div id="adminContent"></div>
    </main>
    <nav class="admin-mobile-bottom" aria-label="التنقل السريع في لوحة التحكم">
      ${[['overview','bar-chart','الرئيسية'],['bookings','calendar','الحجوزات'],['schedules','calendar','المواعيد'],['students','users','الطلاب']].map(([id,ic,name])=>`<button type="button" data-admin-nav="${id}" class="${id===currentSection?'active':''}"><span data-icon="${ic}"></span><span>${name}</span></button>`).join('')}
      <button type="button" onclick="toggleAdminDrawer(true)"><span aria-hidden="true">☰</span><span>المزيد</span></button>
    </nav>`;
  setupTheme();
  bindNav();
  setAdminDrawer(false);
  renderSection();
  syncAdminChrome();
  hydrateIcons();
  startBookingNotifications();
}

window.enableBookingNotifications=async function(){if(!('Notification' in window))return aToast('المتصفح لا يدعم إشعارات الهاتف');const permission=await Notification.requestPermission();if(permission!=='granted')return aToast('اسمح بالإشعارات من إعدادات المتصفح');localStorage.setItem('mf-booking-notifications','1');startBookingNotifications();try{await window.MFCloud?.registerTeacherPushToken?.();aToast('تم تفعيل التنبيهات حتى عند إغلاق اللوحة');}catch(error){aToast('تم تفعيل تنبيهات الحجوزات أثناء فتح لوحة الإدارة');}};
function startBookingNotifications(){if(bookingNotificationUnsubscribe||!window.MFCloud?.subscribeToBookings)return;bookingNotificationUnsubscribe=window.MFCloud.subscribeToBookings((rows,changes)=>{adminData.bookings=rows.filter(row=>{const code=String(row.code||row.id||'');return !bookingActionPending.has(code)&&!acceptedBookingCodes.has(code);});saveData(adminData);if(bookingListenerReady){changes.filter(change=>change.type==='added').forEach(change=>{const b=change.doc.data();const code=String(b.code||change.doc.id||'');if(bookingActionPending.has(code)||acceptedBookingCodes.has(code))return;aToast(`حجز جديد: ${b.name||b.studentName||'طالب جديد'}`);if(Notification.permission==='granted'&&localStorage.getItem('mf-booking-notifications')==='1'){const n=new Notification('حجز طالب جديد',{body:`${b.name||b.studentName||''} · ${b.grade||''} · ${b.group||''}`,icon:'assets/technominds-logo.png',tag:`booking-${code}`});n.onclick=()=>{window.focus();goAdminSection('bookings');};}});}bookingListenerReady=true;if(currentSection==='bookings'&&!bookingActionPending.size)renderBookings();});}

function bindNav(){
  document.querySelectorAll('[data-admin-nav]').forEach(btn=>{btn.onclick=()=>goAdminSection(btn.dataset.adminNav);});
  if(!window.__adminEscapeBound){
    document.addEventListener('keydown',event=>{if(event.key==='Escape')setAdminDrawer(false);});
    window.addEventListener('resize',()=>{if(!window.matchMedia('(max-width:980px)').matches)setAdminDrawer(false);});
    window.__adminEscapeBound=true;
  }
}
window.adminLogout=async function(){try{await window.MFCloud?.signOut?.();}catch(e){} location.reload();};
window.forceFirestoreSync=async function(){try{if(!window.MFCloud?.saveSiteData)throw new Error('Sync service unavailable');await window.MFCloud.saveSiteData(adminData);saveData(adminData);aToast('تم حفظ جميع التغييرات');}catch(error){aToast(adminActionErrorMessage(error,'تعذر حفظ التغييرات.'));}};

function stats(){fresh(); const today=isoDateAdmin(); const att=(adminData.students||[]).filter(s=>(s.attendance||[]).some(a=>String(a.date)===today&&a.status==='present')).length; const bookings=adminData.bookings.filter(b=>!String(b.status||'').includes('تم القبول')).length; return {students:adminData.students.length,bookings,unpaid:adminData.students.filter(s=>!s.paid).length,att};}
function renderOverview(){const s=stats(); content(`<div class="section-head"><div><span class="kicker"><span data-icon="bar-chart"></span> ملخص المنصة</span><h2 class="section-title">جاهزية الموقع للتشغيل الحقيقي</h2><p class="section-desc">كل بيانات الطلاب والحضور محفوظة ومتاحة لفريق العمل حسب الصلاحيات.</p></div></div><div class="grid grid-4"><div class="card"><h3>الطلاب</h3><b class="big-num">${s.students}</b></div><div class="card"><h3>الحجوزات</h3><b class="big-num">${s.bookings}</b></div><div class="card"><h3>غير مشترك</h3><b class="big-num">${s.unpaid}</b></div><div class="card"><h3>حضور اليوم</h3><b class="big-num">${s.att}</b></div></div><div class="card" style="margin-top:18px"><h3>اختصارات سريعة</h3><div class="admin-task-grid-v37"><button class="btn primary" onclick="goAdminSection('attendance')"><span data-icon="qr"></span> فتح ماسح QR</button><button class="btn ghost" onclick="goAdminSection('students')"><span data-icon="users"></span> إدارة الطلاب</button><button class="btn ghost" onclick="goAdminSection('bookings')"><span data-icon="calendar"></span> مراجعة الحجوزات</button></div></div>`);}

function studentRow(st){const s=normalizeStudent(st), c=calcStudentAdmin(s); return `<tr><td><b>${safe(s.studentCode)}</b><small style="display:block">موحّد للطالب وولي الأمر</small></td><td>${safe(s.name)}</td><td>${safe(s.grade)}</td><td>${safe(s.group||'بدون مجموعة')}</td><td><span class="badge ${badgeStatus(s.paid)}">${s.paid?'تم الدفع':'لم يتم الدفع'}</span></td><td>${c.attendancePct||0}%</td><td>${c.avg||0}%</td><td><div class="pay-row"><button class="small-btn primary" onclick="moveStudentToGroup('${safe(s.studentCode)}')">نقل لمجموعة</button><button class="small-btn" onclick="editStudent('${safe(s.studentCode)}')">تعديل</button><button class="small-btn" onclick="copyStudentCodes('${safe(s.studentCode)}')">نسخ الكود</button><button class="small-btn danger" onclick="regenerateStudentCode('${safe(s.studentCode)}')">تغيير الكود الموحّد</button><button class="small-btn" onclick="quickPresent('${safe(s.studentCode)}')">حضور</button><button class="small-btn" onclick="printStudentReport('${safe(s.studentCode)}')">تفاصيل</button><button class="small-btn whatsapp-report-btn" onclick="sendParentMonthlyReport('${safe(s.studentCode)}')">واتساب</button><button class="small-btn danger" onclick="deleteStudent('${safe(s.studentCode)}')">حذف</button></div></td></tr>`;}
function studentMobileCards(rows){return `<div class="student-mobile-cards">${rows.map(st=>{const s=normalizeStudent(st),c=calcStudentAdmin(s); return `<article class="mobile-admin-card"><div class="mobile-admin-card-head"><div><b>${safe(s.name)}</b><small>${safe(s.studentCode)} · ${safe(s.grade)} · ${safe(s.group||'بدون مجموعة')}</small></div><span class="badge ${badgeStatus(s.paid)}">${s.paid?'تم الدفع':'لم يتم الدفع'}</span></div><div class="mobile-card-kpis"><span><small>الحضور</small><b>${c.attendancePct||0}%</b></span><span><small>الدرجات</small><b>${c.avg||0}%</b></span><span><small>التطبيق العملي</small><b>${c.recitationPct||0}%</b></span><span><small>الواجب</small><b>${c.homeworkPct||0}%</b></span></div><div class="mobile-primary-actions"><button type="button" class="small-btn primary" onclick="moveStudentToGroup('${safe(s.studentCode)}')">نقل لمجموعة</button><button type="button" class="small-btn" onclick="editStudent('${safe(s.studentCode)}')">تعديل</button><button type="button" class="small-btn" onclick="quickPresent('${safe(s.studentCode)}')">حضور</button></div><details class="admin-more-actions"><summary>المزيد من الإجراءات</summary><div class="mobile-actions"><button type="button" class="small-btn whatsapp-report-btn" onclick="sendParentMonthlyReport('${safe(s.studentCode)}')">واتساب</button><button type="button" class="small-btn" onclick="copyStudentCodes('${safe(s.studentCode)}')">نسخ الكود</button><button type="button" class="small-btn danger" onclick="regenerateStudentCode('${safe(s.studentCode)}')">تغيير الكود الموحّد</button><button type="button" class="small-btn" onclick="printStudentReport('${safe(s.studentCode)}')">التفاصيل</button><button type="button" class="small-btn danger" onclick="deleteStudent('${safe(s.studentCode)}')">حذف الطالب</button></div></details></article>`;}).join('')||'<p class="section-desc">لا يوجد طلاب.</p>'}</div>`;}
function renderStudents(){fresh(); const rows=adminData.students.map(normalizeStudent); content(`<div class="section-head"><div><span class="kicker"><span data-icon="users"></span> الطلاب</span><h2 class="section-title">بيانات الطلاب والمتابعة</h2><p class="section-desc">لكل طالب كود وباركود موحّدان يفتحان بوابة الطالب وبوابة ولي الأمر.</p></div><button class="btn ghost" onclick="upgradeLegacyAccessCodes()">توحيد الأكواد القديمة</button></div><div class="card monthly-report-help-v38"><h3>تقارير أول الشهر</h3><p>زر واتساب بجوار كل طالب يفتح رسالة جاهزة لولي الأمر فيها الحضور والتطبيق العملي والدرجات والواجب والدفع وملاحظات المدرس.</p></div><div class="card" style="margin-bottom:18px"><form id="addStudentForm" class="grid grid-4"><input name="name" placeholder="اسم الطالب" required><input name="studentPhone" inputmode="tel" placeholder="رقم الطالب"><input name="parentPhone" inputmode="tel" placeholder="رقم ولي الأمر" required><select name="grade">${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select><select name="month">${MONTHS.map(m=>`<option>${safe(m)}</option>`).join('')}</select><select name="group">${groupOptions().map(g=>`<option>${safe(g)}</option>`).join('')}</select><textarea name="notes" placeholder="ملاحظات المدرس"></textarea><button class="btn primary" type="submit"><span data-icon="user"></span> تسجيل طالب وإظهار الكود الموحّد</button></form></div><div class="admin-toolbar"><input id="studentSearchAdmin" placeholder="بحث بالكود أو رقم ولي الأمر"><select id="studentGradeAdmin"><option value="all">كل المسارات</option>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select><select id="studentPayAdmin"><option value="all">كل حالات الدفع</option><option value="paid">تم الدفع</option><option value="unpaid">لم يتم الدفع</option></select><button class="btn ghost" onclick="refreshStudentsTable()"><span data-icon="search"></span> بحث</button></div><div id="studentsTableBox">${studentsTable(rows)}</div>`); document.getElementById('addStudentForm').onsubmit=async e=>{e.preventDefault(); const form=e.target; const button=form.querySelector('button[type="submit"]'); const input=Object.fromEntries(new FormData(form).entries()); input.studentPhone=phoneDigits(input.studentPhone); input.parentPhone=phoneDigits(input.parentPhone); input.studentName=input.name; input.paid=false; input.active=true; input.attendance=[]; input.grades=[]; input.homeworks=[]; input.recitations=[]; button.disabled=true; button.classList.add('is-loading'); try{const created=await window.MFCloud?.createStudentAccess?.(input); if(!created?.studentCode)throw new Error('تعذر إنشاء الكود'); const s={...input,...created,parentCode:created.studentCode,code:created.studentCode,id:created.studentCode}; adminData.students.push(s); saveData(adminData); aToast('تم تسجيل الطالب وإنشاء الكود الموحّد'); window.MFCloud?.logActivity?.('تم تسجيل طالب جديد',{studentCode:s.studentCode}).catch(()=>{}); form.reset(); renderStudents(); showIssuedCodes(s,'تم تسجيل الطالب وإصدار الكود الموحّد');}catch(error){aToast(adminActionErrorMessage(error,'تعذر تسجيل الطالب وإنشاء الكود.'));}finally{button.disabled=false; button.classList.remove('is-loading');}}; ['studentSearchAdmin','studentGradeAdmin','studentPayAdmin'].forEach(id=>document.getElementById(id)?.addEventListener('input',refreshStudentsTable));}
function studentsTable(rows){return `${studentMobileCards(rows)}<div class="table-wrap admin-table-desktop"><table><thead><tr><th>الكود</th><th>الطالب</th><th>المسار</th><th>المجموعة</th><th>حالة الدفع</th><th>الحضور</th><th>الدرجات</th><th>إجراء</th></tr></thead><tbody>${rows.map(studentRow).join('')||'<tr><td colspan="8">لا يوجد طلاب</td></tr>'}</tbody></table></div>`;}
window.refreshStudentsTable=function(){let rows=adminData.students.map(normalizeStudent); const q=normalizeText(document.getElementById('studentSearchAdmin')?.value||''); const g=document.getElementById('studentGradeAdmin')?.value||'all'; const pay=document.getElementById('studentPayAdmin')?.value||'all'; if(q) rows=rows.filter(s=>normalizeText([s.name,s.studentCode,s.parentCode,s.parentPhone,s.studentPhone,s.group].join(' ')).includes(q)); if(g!=='all') rows=rows.filter(s=>s.grade===g); if(pay==='paid') rows=rows.filter(s=>s.paid); if(pay==='unpaid') rows=rows.filter(s=>!s.paid); document.getElementById('studentsTableBox').innerHTML=studentsTable(rows); hydrateIcons();};
window.editStudent=function(code){const s=adminData.students.find(x=>stCode(x)===code); if(!s)return; const name=prompt('اسم الطالب',stName(s)); if(name===null)return; const parentPhone=prompt('رقم ولي الأمر',s.parentPhone||''); if(parentPhone===null)return; s.name=s.studentName=name; s.parentPhone=parentPhone; s.notes=prompt('ملاحظات المدرس',s.notes||'')||s.notes||''; persist('تم تحديث بيانات الطالب'); renderStudents();};
window.moveStudentToGroup=function(code){
  const student=adminData.students.find(item=>stCode(item)===String(code));if(!student)return;
  const groups=(adminData.groups||[]).filter(group=>group.active!==false&&(!student.grade||!group.grade||String(group.grade)===String(student.grade)));
  let modal=document.getElementById('studentGroupMoveModal');if(!modal){modal=document.createElement('div');modal.id='studentGroupMoveModal';modal.className='admin-action-modal';document.body.appendChild(modal);}
  modal.innerHTML=`<div class="admin-action-dialog" role="dialog" aria-modal="true" aria-labelledby="moveGroupTitle"><button class="modal-close" type="button" onclick="closeStudentGroupMove()" aria-label="إغلاق">×</button><span class="kicker">تنظيم المجموعة</span><h3 id="moveGroupTitle">نقل ${safe(stName(student))}</h3><p>المسار: <b>${safe(student.grade||'غير محدد')}</b>. المواعيد التالية مقروءة مباشرة من صفحة المواعيد والمجموعات.</p><label class="field"><span>المجموعة الجديدة</span><select id="studentGroupMoveSelect"><option value="">بدون مجموعة — تحديد لاحق</option>${groups.map(group=>`<option value="${safe(group.id)}" ${String(group.name||'')===String(student.group||'')?'selected':''}>${safe([group.name,group.days,[group.startTime,group.endTime].filter(Boolean).join(' - ')].filter(Boolean).join(' — '))}</option>`).join('')}</select></label>${groups.length?'':'<div class="empty-state compact-empty-v29"><p>لا توجد مجموعة نشطة لهذا المسار. أضفها أولًا من صفحة المواعيد.</p></div>'}<div class="booking-step-actions"><button class="btn ghost" type="button" onclick="closeStudentGroupMove()">إلغاء</button><button class="btn primary" type="button" onclick="confirmStudentGroupMove('${safe(code)}')">حفظ النقل</button></div></div>`;
  modal.classList.add('show');document.getElementById('studentGroupMoveSelect')?.focus();
};
window.closeStudentGroupMove=function(){document.getElementById('studentGroupMoveModal')?.classList.remove('show');};
window.confirmStudentGroupMove=async function(code){const student=adminData.students.find(item=>stCode(item)===String(code)),select=document.getElementById('studentGroupMoveSelect');if(!student||!select)return;const group=(adminData.groups||[]).find(item=>String(item.id)===String(select.value));Object.assign(student,{group:group?.name||'',groupId:group?.id||'',scheduleId:group?.id||'',scheduleDays:group?.days||'',scheduleStartTime:group?.startTime||'',scheduleEndTime:group?.endTime||'',groupAssignmentPending:!group});try{await window.MFCloud?.saveStudent?.(student);persist(group?'تم نقل الطالب إلى المجموعة':'تم حفظ الطالب بدون مجموعة');closeStudentGroupMove();renderStudents();}catch(error){aToast(adminActionErrorMessage(error,'تعذر حفظ المجموعة الجديدة.'));}};
window.deleteStudent=async function(code){code=String(code||'');if(studentDeletionPending.has(code)||!confirm('سيتم إنشاء نسخة استرجاع ثم حذف الطالب وكل بياناته. متابعة؟'))return;const student=adminData.students.find(s=>stCode(s)===code);studentDeletionPending.add(code);try{const result=await window.MFCloud?.deleteStudentSafely?.(student||{studentCode:code});if(!result?.ok)throw new Error('تعذر تأكيد الحذف');adminData.students=adminData.students.filter(s=>stCode(s)!==code);saveData(adminData);aToast(result.backupMode==='browser'?'تم تنزيل نسخة استرجاع وحذف الطالب':'تم حفظ نسخة استرجاع وحذف الطالب');renderStudents();}catch(error){aToast(adminActionErrorMessage(error,'تعذر حذف الطالب بأمان، ولم يتم حذفه من القائمة.'));}finally{studentDeletionPending.delete(code);}};
window.printStudentReport=function(code){const s=adminData.students.find(x=>stCode(x)===code); if(!s)return; const w=window.open('','_blank'); w.document.write(`<html dir="rtl"><head><title>تقرير ${safe(stName(s))}</title><link rel="stylesheet" href="assets/site.css"></head><body><main class="section"><div class="container">${studentProfileHTML(normalizeStudent(s),true)}</div></main></body></html>`); w.document.close();};
window.sendParentMonthlyReport=function(code){const s=adminData.students.find(x=>stCode(x)===code); if(!s)return aToast('لم يتم العثور على الطالب'); const phone=adminWhatsAppPhone(s.parentPhone); if(!phone)return aToast('رقم ولي الأمر غير موجود'); window.open(whatsappLink(phone, monthlyReportTextForStudent(s)),'_blank');};
window.copyParentMonthlyReport=function(code){const s=adminData.students.find(x=>stCode(x)===code); if(!s)return aToast('لم يتم العثور على الطالب'); navigator.clipboard?.writeText(monthlyReportTextForStudent(s)).then(()=>aToast('تم نسخ التقرير')).catch(()=>aToast('تعذر النسخ'));};

window.copyStudentCodes=async function(code){
  const raw=adminData.students.find(x=>stCode(x)===code);if(!raw)return aToast('لم يتم العثور على الطالب');const s=normalizeStudent(raw);
  const text=`اسم الطالب: ${s.name}\nالكود الموحد للطالب وولي الأمر: ${s.studentCode}`;
  try{await navigator.clipboard.writeText(text);aToast('تم نسخ الكود الموحد');}catch(e){prompt('انسخ الكود',text);}
};
window.regenerateParentCode=async function(code){
  return window.regenerateStudentCode(code);
};
window.regenerateStudentCode=async function(code){
  const s=adminData.students.find(x=>stCode(x)===code);if(!s)return;
  if(!confirm('سيتم تغيير الكود الموحّد للطالب وولي الأمر وتحديث جميع السجلات. يجب إرسال الكود الجديد للأسرة. متابعة؟'))return;
  const oldCode=stCode(s),oldParentCode=String(s.parentCode||oldCode).toUpperCase(),newCode=newStudentCode();
  const proposed={...s,studentCode:newCode,code:newCode,id:newCode,parentCode:newCode};
  try{if(!window.MFCloud?.migrateStudentCode)throw new Error('Student migration service unavailable');await window.MFCloud.migrateStudentCode(oldCode,newCode,proposed);if(oldParentCode&&oldParentCode!==oldCode&&oldParentCode!==newCode)await window.MFCloud?.deleteDocument?.('parent_portal',oldParentCode);Object.assign(s,proposed);(adminData.bookings||[]).forEach(item=>{if(item.studentCode===oldCode)item.studentCode=newCode;});(adminData.examAttempts||[]).forEach(item=>{if(item.studentCode===oldCode)item.studentCode=newCode;});(adminData.grades||[]).forEach(item=>{if(item.studentCode===oldCode)item.studentCode=newCode;});saveData(adminData);aToast('تم تغيير الكود الموحّد وتحديث جميع السجلات');renderStudents();}
  catch(error){aToast(adminActionErrorMessage(error,'تعذر تغيير الكود؛ ظل الكود القديم كما هو.'));}
};
window.upgradeLegacyAccessCodes=async function(){
  fresh();const targets=adminData.students.filter(s=>isWeakAccessCode(stCode(s))||String(s.parentCode||'').toUpperCase()!==String(stCode(s)).toUpperCase());
  if(!targets.length)return aToast('كل الطلاب يستخدمون الكود الموحّد بالفعل');
  if(!confirm(`سيتم توحيد كود الطالب وولي الأمر لعدد ${targets.length} طالب. احفظ نسخة احتياطية أولًا. متابعة؟`))return;
  let success=0,failed=0,cleanupFailed=0;
  for(const student of targets){
    const oldCode=stCode(student),oldParentCode=String(student.parentCode||'').toUpperCase();
    try{
      if(isWeakAccessCode(oldCode)){
        if(!window.MFCloud?.migrateStudentCode)throw new Error('Student migration service unavailable');
        const newCode=newStudentCode(),proposed={...student,studentCode:newCode,code:newCode,id:newCode,parentCode:newCode};
        await window.MFCloud.migrateStudentCode(oldCode,newCode,proposed);Object.assign(student,proposed);
        (adminData.bookings||[]).forEach(item=>{if(item.studentCode===oldCode)item.studentCode=newCode;});
        (adminData.examAttempts||[]).forEach(item=>{if(item.studentCode===oldCode)item.studentCode=newCode;});
        (adminData.grades||[]).forEach(item=>{if(item.studentCode===oldCode)item.studentCode=newCode;});
      }else{
        if(!window.MFCloud?.saveStudent)throw new Error('Student service unavailable');
        const proposed={...student,parentCode:oldCode};await window.MFCloud.saveStudent(proposed);Object.assign(student,proposed);
      }
      success+=1;
      if(oldParentCode&&oldParentCode!==String(student.parentCode||'')){try{await window.MFCloud?.deleteDocument?.('parent_portal',oldParentCode);}catch(error){cleanupFailed+=1;}}
    }catch(error){failed+=1;}
  }
  saveData(adminData);aToast(failed?`تم توحيد ${success} وتعذر ${failed}${cleanupFailed?`، ويوجد ${cleanupFailed} كود قديم يحتاج تنظيف`:''}`:`تم توحيد أكواد ${success} طالب بنجاح`);renderStudents();
};

function pendingBookings(){return (adminData.bookings||[]).filter(b=>!String(b.status||'').includes('تم القبول'));}
function renderBookings(){fresh();const rows=pendingBookings();content(`<div class="section-head"><div><span class="kicker"><span data-icon="calendar"></span> طلبات التسجيل</span><h2 class="section-title">قبول الطلاب الجدد</h2><p class="section-desc">اقبل الطلب مرة واحدة؛ بعدها ينتقل الطالب تلقائيًا لقائمة الطلاب ويختفي من هنا.</p></div><button class="btn ghost" onclick="exportBookingsCSV()"><span data-icon="database"></span> تصدير CSV</button></div><div class="grid grid-3 booking-admin-summary"><div class="card"><small>طلبات تنتظر القبول</small><b class="big-num">${rows.length}</b></div><div class="card"><label for="bookingSearchAdmin">بحث سريع</label><input id="bookingSearchAdmin" placeholder="الاسم أو الكود أو الهاتف"></div><div class="card"><label for="bookingGradeAdmin">المسار</label><select id="bookingGradeAdmin"><option value="all">كل المسارات</option>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select></div></div><div class="card" style="margin-top:14px"><div id="bookingRowsAdmin" class="booking-admin-list">${rows.map(bookingCard).join('')||'<div class="empty-state"><h3>لا توجد طلبات جديدة</h3><p>أي حجز جديد من الموقع سيظهر هنا فورًا.</p></div>'}</div></div>`);['bookingSearchAdmin','bookingGradeAdmin'].forEach(id=>document.getElementById(id)?.addEventListener('input',refreshBookingsTable));}

function scheduleCard(g){return `<article class="mobile-row schedule-admin-row"><div><b>${safe(g.name||'مجموعة بدون اسم')}</b><small>${safe(g.grade||'كل المسارات')} · ${safe(g.days||'-')} · ${safe(formatTime12(g.startTime)||'-')} ${g.endTime?`— ${safe(formatTime12(g.endTime))}`:''}</small></div><span class="badge ${g.active===false?'danger':'good'}">${g.active===false?'متوقفة':'متاحة للحجز'}</span><div class="mobile-actions"><button class="small-btn" type="button" onclick="editSchedule('${safe(g.id)}')">تعديل</button><button class="small-btn ${g.active===false?'primary':'danger'}" type="button" onclick="toggleSchedule('${safe(g.id)}')">${g.active===false?'تفعيل':'إيقاف'}</button></div></article>`;}
function renderSchedules(){fresh();content(`<div class="section-head"><div><span class="kicker"><span data-icon="calendar"></span> المواعيد والمجموعات</span><h2 class="section-title">إدارة المواعيد بسهولة</h2><p class="section-desc">كل موعد مرتبط بصف واحد، والمواعيد المفعلة فقط تظهر لطلاب هذا المسار في الحجز.</p></div></div><div class="grid grid-2 schedule-admin-layout"><form id="scheduleForm" class="card grid"><h3 id="scheduleFormTitle">إضافة مجموعة جديدة</h3><input name="id" type="hidden"><div class="field"><label>اسم المجموعة</label><input name="name" required placeholder="مثال: مجموعة السبت والثلاثاء"></div><div class="field"><label>المسار</label><select name="grade" required>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select></div><div class="field"><label>الأيام</label><input name="days" required placeholder="السبت والثلاثاء"></div><div class="grid grid-2"><div class="field"><label>من</label><input name="startTime" type="time" required></div><div class="field"><label>إلى</label><input name="endTime" type="time" required></div></div><label class="option-card"><input name="active" type="checkbox" checked> متاح للحجز الآن</label><button class="btn primary" type="submit"><span data-icon="calendar"></span> حفظ الموعد</button><button class="btn ghost" type="reset" onclick="resetScheduleForm()">إلغاء التعديل</button></form><div class="card"><h3>المواعيد الحالية</h3><div class="schedule-admin-list">${(adminData.groups||[]).map(scheduleCard).join('')||'<p class="section-desc">لا توجد مواعيد بعد. أضف أول مجموعة من النموذج.</p>'}</div></div></div>`);document.getElementById('scheduleForm').onsubmit=saveSchedule;}
window.resetScheduleForm=function(){const form=document.getElementById('scheduleForm');if(form){form.reset();form.elements.id.value='';form.elements.active.checked=true;}const title=document.getElementById('scheduleFormTitle');if(title)title.textContent='إضافة مجموعة جديدة';};
window.editSchedule=function(id){const g=(adminData.groups||[]).find(x=>String(x.id)===String(id)),form=document.getElementById('scheduleForm');if(!g||!form)return;['id','name','grade','days','startTime','endTime'].forEach(k=>{if(form.elements[k])form.elements[k].value=g[k]||'';});form.active.checked=g.active!==false;document.getElementById('scheduleFormTitle').textContent='تعديل الموعد';form.scrollIntoView({behavior:'smooth',block:'start'});};
window.toggleSchedule=async function(id){const g=(adminData.groups||[]).find(x=>String(x.id)===String(id));if(!g)return;g.active=g.active===false;persist(g.active?'تم تفعيل الموعد':'تم إيقاف الموعد');try{await window.MFCloud?.saveGroup?.(g);}catch(e){}renderSchedules();};
async function saveSchedule(event){event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());data.id=data.id||`group-${Date.now()}`;data.active=form.active.checked;const index=(adminData.groups||[]).findIndex(x=>String(x.id)===String(data.id));if(index>=0)adminData.groups[index]={...adminData.groups[index],...data};else adminData.groups.push(data);persist('تم حفظ الموعد');try{await window.MFCloud?.saveGroup?.(data);}catch(e){aToast('تم الحفظ محليًا وتعذرت المزامنة الآن');}renderSchedules();}
window.refreshBookingsTable=function(){let rows=pendingBookings();const query=(document.getElementById('bookingSearchAdmin')?.value||'').trim().toLowerCase(),grade=document.getElementById('bookingGradeAdmin')?.value||'all';if(query)rows=rows.filter(b=>[b.code,b.name,b.studentName,b.parentPhone,b.studentPhone].some(value=>String(value||'').toLowerCase().includes(query)));if(grade!=='all')rows=rows.filter(b=>b.grade===grade);const box=document.getElementById('bookingRowsAdmin');if(box)box.innerHTML=rows.map(bookingCard).join('')||'<div class="empty-state"><h3>لا توجد نتائج</h3><p>غيّر البحث أو المسار.</p></div>';};
function bookingCard(b){return `<article class="booking-admin-card compact-booking-card" data-booking-code="${safe(b.code||b.id)}"><div class="compact-booking-main"><span class="student-avatar">${safe(String(b.name||b.studentName||'ط').charAt(0))}</span><div><div class="compact-booking-title"><h3>${safe(b.name||b.studentName)}</h3><span class="badge warn">قيد التسجيل</span></div><small>${safe(b.code)} · ${safe(b.grade)} · ${safe(b.group)}</small></div></div><div class="compact-booking-meta"><span><small>الطالب</small><b dir="ltr">${safe(b.studentPhone||'-')}</b></span><span><small>ولي الأمر</small><b dir="ltr">${safe(b.parentPhone||'-')}</b></span><span><small>الشهر</small><b>${safe(b.month||'-')}</b></span></div><div class="compact-booking-actions"><button class="small-btn primary" type="button" onclick="approveBooking('${safe(b.code)}')"><span data-icon="user-check"></span> قبول</button><button class="small-btn danger" type="button" onclick="deleteBooking('${safe(b.code)}')"><span data-icon="trash"></span> رفض</button></div></article>`;}
window.approveBooking=async function(code){
  code=String(code||'');
  if(bookingActionPending.has(code)||acceptedBookingCodes.has(code))return false;
  const b=adminData.bookings.find(x=>String(x.code||x.id)===code);if(!b)return false;
  bookingActionPending.add(code);
  const card=document.querySelector(`[data-booking-code="${CSS.escape(code)}"]`);
  card?.classList.add('is-processing');
  card?.querySelectorAll('button').forEach(button=>button.disabled=true);
  adminData.bookings=adminData.bookings.filter(item=>String(item.code||item.id)!==code);
  saveData(adminData);
  requestAnimationFrame(()=>{card?.remove();const count=document.querySelector('.booking-admin-summary .big-num');if(count)count.textContent=String(pendingBookings().length);});
  try{
    const created=await window.MFCloud?.approveBooking?.(code);
    if(!created?.studentCode||!created?.parentCode)throw new Error('تعذر إنشاء الأكواد');
    let student=adminData.students.find(s=>stCode(s)===created.studentCode||String(s.bookingCode||'')===String(code));
    const data={...b,...created,bookingCode:code,studentName:created.studentName||created.name||b.studentName||b.name,name:created.name||created.studentName||b.name,studentPhone:phoneDigits(created.studentPhone||b.studentPhone),parentPhone:phoneDigits(created.parentPhone||b.parentPhone),paid:false,active:true,attendance:student?.attendance||[],grades:student?.grades||[],homeworks:student?.homeworks||[],recitations:student?.recitations||[]};
    if(student)Object.assign(student,data);else{student=data;adminData.students.push(student);}
    acceptedBookingCodes.add(code);
    saveData(adminData);
    return true;
  }catch(error){adminData.bookings.unshift(b);saveData(adminData);renderBookings();const raw=String(error?.code||'')+' '+String(error?.message||'');const message=/unauthenticated/i.test(raw)?'انتهت جلسة الدخول. سجّل دخول المدرس من جديد.':/permission-denied/i.test(raw)?'حساب المدرس غير مفعّل أو لا يملك صلاحية القبول.':/not-found/i.test(raw)?'الحجز غير موجود أو تم التعامل معه بالفعل.':/internal|unavailable|function.*unavailable/i.test(raw)?'خدمة قبول الحجز غير متاحة حاليًا.':(error?.message?.split(':').pop()?.trim()||'تعذر قبول الحجز.');aToast(message);return false;}
  finally{bookingActionPending.delete(code);}
};
window.deleteBooking=async function(code){if(!confirm('رفض الحجز وإيقاف الأكواد التي صدرت له؟'))return;try{await window.MFCloud?.rejectBooking?.(code);adminData.bookings=adminData.bookings.filter(b=>String(b.code||b.id)!==String(code));saveData(adminData);aToast('تم رفض الحجز وإيقاف الأكواد');deferAdminRender(renderBookings);}catch(error){const raw=String(error?.code||'')+' '+String(error?.message||'');const message=/unauthenticated/i.test(raw)?'انتهت جلسة الدخول. سجّل الدخول من جديد.':/permission-denied/i.test(raw)?'الحساب لا يملك صلاحية رفض الحجوزات.':/not-found/i.test(raw)?'الحجز غير موجود أو تم التعامل معه بالفعل.':/internal|unavailable|function.*unavailable/i.test(raw)?'خدمة رفض الحجز غير متاحة حاليًا.':(error?.message?.split(':').pop()?.trim()||'تعذر رفض الحجز.');aToast(message);}};

function findAttendance(st,date){return (st.attendance||[]).find(a=>String(a.date)===date);}
function classProgressRows(st,type){return type==='recitation'?(st.recitations||[]):(st.homeworks||[]);}
function findClassProgress(st,type,date=attendanceDate){return classProgressRows(st,type).find(row=>String(row.date||'')===String(date)&&(row.completed===true||row.approved===true||String(row.status||'').startsWith('تم')));}
function attendanceRecord(st,status,method){const s=normalizeStudent(st); st.studentCode=s.studentCode; st.code=s.studentCode; st.name=s.name; st.studentName=s.name; return {studentId:s.studentCode,studentCode:s.studentCode,studentName:s.name,grade:s.grade,group:s.group,status,date:attendanceDate,time:status==='present'?timeNow():null,method,scannedBy:currentStaff?.email||currentStaff?.uid||'teacher',createdAt:new Date().toISOString()};}
async function saveAttendanceRecord(st,status,method){st.attendance=st.attendance||[];const before=st.attendance.map(item=>({...item})),record=attendanceRecord(st,status,method),existing=findAttendance(st,attendanceDate);if(existing)Object.assign(existing,record);else st.attendance.push(record);saveData(adminData);try{if(!window.MFCloud?.upsertAttendance)throw new Error('Attendance service unavailable');const saved=await window.MFCloud.upsertAttendance(record);if(!saved?.id)throw new Error('تعذر تأكيد حفظ الحضور');return saved;}catch(error){st.attendance=before;saveData(adminData);throw error;}}
async function registerQrAttendance(code){fresh(); const st=adminData.students.map(normalizeStudent).find(s=>String(s.studentCode).trim()===String(code).trim()); if(!st){aToast('لم يتم العثور على طالب بهذا الكود.'); return;} const original=adminData.students.find(s=>stCode(s)===st.studentCode); const existing=findAttendance(original,attendanceDate); if(existing?.status==='present'){aToast('الطالب مسجل حضور بالفعل اليوم.'); return;}try{await saveAttendanceRecord(original,'present','qr_scan');aToast(`تم تسجيل حضور ${st.name}`);}catch(error){aToast(adminActionErrorMessage(error,'تعذر تسجيل الحضور.'));}renderAttendance();}
window.quickPresent=function(code){attendanceDate=isoDateAdmin(); registerQrAttendance(code);};
window.markAbsentForMissing=async function(){fresh();const grade=selectedGrade(),group=selectedGroup(),students=filterStudents(grade,group),records=[];for(const st of students){const original=adminData.students.find(s=>stCode(s)===st.studentCode);if(original&&!findAttendance(original,attendanceDate)){const record=attendanceRecord(original,'absent','auto_absent');original.attendance=original.attendance||[];original.attendance.push(record);records.push(record);}}if(!records.length)return aToast('كل الطلاب لديهم حالة مسجلة لهذا اليوم');saveData(adminData);const results=[];for(let index=0;index<records.length;index+=20){const chunk=records.slice(index,index+20);if(!window.MFCloud?.upsertAttendance){chunk.forEach(()=>results.push({status:'rejected',reason:new Error('Attendance service unavailable')}));continue;}results.push(...await Promise.allSettled(chunk.map(record=>window.MFCloud.upsertAttendance(record))));}let saved=0;results.forEach((result,index)=>{if(result.status==='fulfilled')saved+=1;else{const record=records[index],student=adminData.students.find(item=>stCode(item)===record.studentCode);if(student)student.attendance=(student.attendance||[]).filter(item=>!(item.date===record.date&&item.method==='auto_absent'));}});saveData(adminData);if(saved)window.MFCloud?.logActivity?.('تم تسجيل الغياب الجماعي',{date:attendanceDate,count:saved}).catch(()=>{});aToast(saved===records.length?`تم تسجيل غياب ${saved} طالب غير حاضر`:`تم حفظ غياب ${saved} وتعذر ${records.length-saved}؛ راجع الاتصال والصلاحيات`);renderAttendance();};
function todayAttendanceRows(){const grade=selectedGrade(), group=selectedGroup(); return filterStudents(grade,group).flatMap(st=>(st.attendance||[]).filter(a=>String(a.date)===attendanceDate).map(a=>({...a,studentName:st.name,studentCode:st.studentCode,grade:st.grade,group:st.group})));}
function attendanceRosterHTML(){const rows=filterStudents(selectedGrade(),selectedGroup());return `<div class="attendance-roster">${rows.map(st=>{const record=findAttendance(st,attendanceDate),status=record?.status||'',recited=!!findClassProgress(st,'recitation'),homework=!!findClassProgress(st,'homework');return `<article class="attendance-student ${status||'pending'}"><span class="student-avatar">${safe(String(st.name||'ط').trim().charAt(0))}</span><div><b>${safe(st.name)}</b><small>${safe(st.studentCode)} · ${safe(st.group||'-')}</small><small>${recited?'✓ سمّع':'لم يسمّع'} · ${homework?'✓ عمل الواجب':'لم يعمل الواجب'}</small></div><span class="badge ${status?badgeStatus(status):'warn'}">${status==='present'?'حاضر':status==='absent'?'غائب':'لم يسجل'}</span><div class="attendance-row-actions class-progress-actions"><button class="small-btn primary" onclick="setAttendanceStatus('${safe(st.studentCode)}','present')">حاضر</button><button class="small-btn danger" onclick="setAttendanceStatus('${safe(st.studentCode)}','absent')">غائب</button><button class="small-btn ${recited?'primary':'ghost'}" onclick="toggleClassProgress('${safe(st.studentCode)}','recitation')">${recited?'تم التطبيق العملي ✓':'تطبيق عملي'}</button><button class="small-btn ${homework?'primary':'ghost'}" onclick="toggleClassProgress('${safe(st.studentCode)}','homework')">${homework?'تم الواجب ✓':'عمل الواجب'}</button></div></article>`;}).join('')||'<p class="section-desc">لا يوجد طلاب مطابقون للاختيار.</p>'}</div>`;}
window.setAttendanceStatus=async function(code,status){const st=adminData.students.find(item=>String(stCode(item))===String(code));if(!st)return aToast('الطالب غير موجود');try{await saveAttendanceRecord(st,status,'manual_button');aToast(status==='present'?'تم تسجيل الحضور':'تم تسجيل الغياب');}catch(error){aToast(adminActionErrorMessage(error,'تعذر حفظ حالة الحضور.'));}renderAttendance();};
window.toggleClassProgress=async function(code,type){
  const student=adminData.students.find(item=>String(stCode(item))===String(code));if(!student)return aToast('الطالب غير موجود');
  const actionKey=`${code}:${type}:${attendanceDate}`;
  if(classProgressActionPending.has(actionKey))return;
  const existing=findClassProgress(student,type),completed=!existing,key=type==='recitation'?'recitations':'homeworks';
  student[key]=student[key]||[];
  const before=student[key].slice();
  const record={id:`${code}_${attendanceDate}_class`,studentCode:code,studentName:stName(student),grade:student.grade||'',group:student.group||'',academicYear:student.academicYear||'',term:student.term||'',type,date:attendanceDate,time:timeNow(),completed,approved:completed,method:'teacher_class_check',status:completed?(type==='recitation'?'تم التطبيق العملي':'تم عمل الواجب'):''};
  student[key]=student[key].filter(row=>!(String(row.date||'')===String(attendanceDate)&&(row.type===type||row.method==='teacher_class_check')));
  if(completed)student[key].push(record);
  classProgressActionPending.add(actionKey);
  saveData(adminData);
  renderAttendance();
  try{
    const result=await window.MFCloud?.recordClassProgress?.(record);
    if(!result)throw new Error('تعذر الحفظ');
    student[key]=student[key].filter(row=>!(String(row.date||'')===String(attendanceDate)&&(row.type===type||row.method==='teacher_class_check')));
    if(completed)student[key].push({...result,completed:true,approved:true});
    saveData(adminData);
    aToast(completed?(type==='recitation'?`تم تسجيل تطبيق عملي ${stName(student)}`:`تم تسجيل واجب ${stName(student)}`):(type==='recitation'?'تم إلغاء علامة التطبيق العملي':'تم إلغاء علامة الواجب'));
  }catch(error){
    student[key]=before;saveData(adminData);renderAttendance();
    aToast(adminActionErrorMessage(error,'تعذر حفظ متابعة الحصة.'));
  }finally{classProgressActionPending.delete(actionKey);}
};
function renderAttendance(){fresh(); const gOpts=['all',...GRADES], grpOpts=['all',...groupOptions()]; content(`<div class="section-head"><div><span class="kicker"><span data-icon="qr"></span> الحضور والغياب</span><h2 class="section-title">ماسح QR وتسجيل حضور اليوم</h2><p class="section-desc">الـ QR يحتوي على studentCode فقط، والمسح يسجل present. الغياب من زر منفصل.</p></div></div><div class="card attendance-control-card"><div class="grid grid-4"><select id="attendanceGrade">${gOpts.map(g=>`<option value="${safe(g)}">${g==='all'?'كل المسارات':safe(g)}</option>`).join('')}</select><select id="attendanceGroup">${grpOpts.map(g=>`<option value="${safe(g)}">${g==='all'?'كل المجموعات':safe(g)}</option>`).join('')}</select><input id="attendanceDate" type="date" value="${attendanceDate}"><button class="btn ghost" onclick="renderAttendance()"><span data-icon="search"></span> عرض</button></div><div class="attendance-actions"><button class="btn primary qr-open-btn" onclick="openQrScanner()"><span data-icon="qr"></span> فتح ماسح QR Code</button><button class="btn ghost" onclick="manualAttendancePrompt()"><span data-icon="user-check"></span> إدخال كود يدوي</button><button class="btn dark" onclick="markAbsentForMissing()"><span data-icon="calendar"></span> تسجيل غياب الطلاب غير الحاضرين</button></div></div><div class="grid grid-2" style="margin-top:18px"><div class="card"><h3>سجل حضور اليوم</h3>${attendanceLogHTML()}</div><div class="card"><h3>تقرير سريع</h3>${attendanceReportHTML()}</div></div><div id="qrScannerModal" class="qr-modal" hidden><div class="card qr-modal-card"><div class="profile-top"><h3>ماسح QR الطالب</h3><button class="small-btn danger" onclick="closeQrScanner()">إغلاق</button></div><div id="adminQrReader"></div><p class="section-desc">وجّه كاميرا الموبايل على QR الطالب لتسجيل الحضور.</p></div></div>`); const gd=document.getElementById('attendanceGrade'), gr=document.getElementById('attendanceGroup'), date=document.getElementById('attendanceDate'); if(gd)gd.value=sessionStorage.getItem('attGrade')||'all'; if(gr)gr.value=sessionStorage.getItem('attGroup')||'all'; if(date)date.onchange=()=>{attendanceDate=date.value; renderAttendance();}; if(gd)gd.onchange=()=>{sessionStorage.setItem('attGrade',gd.value); renderAttendance();}; if(gr)gr.onchange=()=>{sessionStorage.setItem('attGroup',gr.value); renderAttendance();};}
function attendanceLogHTML(){const rows=todayAttendanceRows(); return `<div class="mobile-card-table">${rows.map(r=>`<div class="mobile-row"><b>${safe(r.studentName)}</b><span class="badge ${badgeStatus(r.status)}">${r.status==='present'?'حاضر':'غائب'}</span><small>${safe(r.studentCode)} · ${safe(formatTime12(r.time)||'-')} · ${safe(r.group||'-')}</small></div>`).join('')||'<p class="section-desc">لا توجد سجلات اليوم.</p>'}</div><div class="table-wrap admin-table-desktop"><table><thead><tr><th>الطالب</th><th>الكود</th><th>الحالة</th><th>الوقت</th><th>الطريقة</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${safe(r.studentName)}</td><td>${safe(r.studentCode)}</td><td><span class="badge ${badgeStatus(r.status)}">${r.status==='present'?'حاضر':'غائب'}</span></td><td>${safe(formatTime12(r.time)||'-')}</td><td>${safe(r.method||'-')}</td></tr>`).join('')||'<tr><td colspan="5">لا توجد سجلات اليوم</td></tr>'}</tbody></table></div>`;}
function attendanceReportHTML(){const rows=todayAttendanceRows(); const present=rows.filter(r=>r.status==='present').length, absent=rows.filter(r=>r.status==='absent').length; return `<div class="metric-grid"><div class="metric"><b>${rows.length}</b><small>إجمالي مسجل</small></div><div class="metric"><b>${present}</b><small>حاضر</small></div><div class="metric"><b>${absent}</b><small>غائب</small></div><div class="metric"><b>${rows.length?Math.round(present/rows.length*100):0}%</b><small>نسبة الحضور</small></div></div>`;}
window.manualAttendancePrompt=function(){const code=prompt('اكتب كود الطالب الموجود في QR'); if(code) registerQrAttendance(code.trim());};
window.openQrScanner=async function(){document.getElementById('qrScannerModal').hidden=false;const reader=document.getElementById('adminQrReader');if(!reader)return;reader.innerHTML='<p class="section-desc">جاري تجهيز الكاميرا…</p>';try{if(!window.Html5Qrcode)await window.MFAssets?.loadQrScanner?.();reader.innerHTML='';if(window.Html5Qrcode){qrScanner=new Html5Qrcode('adminQrReader');await qrScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:250}},decoded=>{registerQrAttendance(decoded);});}else if('BarcodeDetector'in window){reader.innerHTML='<video id="adminQrVideo" autoplay playsinline></video>';const video=document.getElementById('adminQrVideo');const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});video.srcObject=stream;const detector=new BarcodeDetector({formats:['qr_code']});const loop=async()=>{if(document.getElementById('qrScannerModal').hidden)return;const codes=await detector.detect(video).catch(()=>[]);if(codes.length)await registerQrAttendance(codes[0].rawValue);setTimeout(loop,800);};loop();}else{reader.innerHTML='<p class="section-desc">المتصفح لا يدعم ماسح QR. استخدم إدخال كود يدوي.</p>';}}catch(e){reader.innerHTML='<p class="section-desc">تعذر فتح الكاميرا. تأكد من السماح للمتصفح باستخدام الكاميرا.</p>';}};
window.closeQrScanner=async function(){try{if(qrScanner){await qrScanner.stop(); qrScanner.clear(); qrScanner=null;}}catch(e){} const v=document.getElementById('adminQrVideo'); if(v?.srcObject) v.srcObject.getTracks().forEach(t=>t.stop()); const m=document.getElementById('qrScannerModal'); if(m)m.hidden=true;};

function renderPayments(){fresh(); content(`<div class="section-head"><div><span class="kicker"><span data-icon="database"></span> حالة الدفع</span><h2 class="section-title">حالة الدفع</h2></div></div><div class="grid">${GRADES.map(g=>{const rows=adminData.students.filter(s=>s.grade===g).map(normalizeStudent); return `<div class="card"><h3>${safe(g)}</h3>${rows.map(s=>`<div class="mobile-row"><b>${safe(s.name)}</b><span class="badge ${badgeStatus(s.paid)}">${s.paid?'تم الدفع':'لم يتم الدفع'}</span><small>${safe(s.studentCode)} · ${safe(s.month||'-')}</small><div class="mobile-actions"><button class="small-btn primary" onclick="setPaid('${safe(s.studentCode)}',true)">تم الدفع</button><button class="small-btn danger" onclick="setPaid('${safe(s.studentCode)}',false)">لم يتم الدفع</button></div></div>`).join('')||'<p class="section-desc">لا يوجد طلاب.</p>'}</div>`;}).join('')}</div>`);}
window.setPaid=function(code,val){const s=adminData.students.find(x=>stCode(x)===code); if(!s)return; s.paid=val; s.paymentDate=val?isoDateAdmin():''; persist(val?'تم تسجيل الدفع':'تم تسجيل عدم الدفع'); renderPayments();};

function renderMaterials(){fresh(); content(`<div class="section-head"><div><span class="kicker"><span data-icon="book-open"></span> المحتوى</span><h2 class="section-title">التدريبات والتحديات البرمجية</h2></div></div><div class="grid grid-2"><form id="materialForm" class="card grid"><h3>إضافة محاضرة / ملف</h3><input name="title" placeholder="العنوان" required><select name="grade"><option>كل المسارات</option>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select><textarea name="desc" placeholder="وصف مختصر"></textarea><input type="file" name="file" accept="image/*,application/pdf"><button class="btn primary"><span data-icon="upload"></span> إضافة</button></form><form id="questionForm" class="card grid"><h3>إضافة سؤال</h3><input name="title" placeholder="عنوان السؤال" required><select name="grade"><option>كل المسارات</option>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select><textarea name="content" placeholder="نص السؤال"></textarea><textarea name="answer" placeholder="الإجابة النموذجية"></textarea><button class="btn primary"><span data-icon="help-circle"></span> إضافة سؤال</button></form></div><div class="grid grid-2" style="margin-top:18px"><div class="card"><h3>التدريبات</h3>${adminData.materials.map(m=>`<div class="mobile-row"><b>${safe(m.title)}</b><small>${safe(m.grade||'')}</small><button class="small-btn danger" onclick="deleteItem('materials','${safe(m.id)}')">حذف</button></div>`).join('')||'<p class="section-desc">لا توجد تدريبات.</p>'}</div><div class="card"><h3>الأسئلة</h3>${adminData.questions.map(q=>`<div class="mobile-row"><b>${safe(q.title)}</b><small>${safe(q.grade||'')}</small><button class="small-btn danger" onclick="deleteItem('questions','${safe(q.id)}')">حذف</button></div>`).join('')||'<p class="section-desc">لا توجد أسئلة.</p>'}</div></div>`); document.getElementById('materialForm').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('[type="submit"]'),f=form.file.files[0],m=Object.fromEntries(new FormData(form).entries());m.id='mat-'+Date.now();button.disabled=true;button.classList.add('is-loading');try{if(f){if(!window.MFCloud?.uploadAttachment)throw new Error('Upload service unavailable');const up=await window.MFCloud.uploadAttachment(f,'teacher-uploads');m.fileUrl=up.url;m.fileName=up.fileName;}adminData.materials.push(m);await saveAdminDataNow();aToast('تمت إضافة المحتوى');renderMaterials();}catch(error){adminData.materials=adminData.materials.filter(item=>item.id!==m.id);aToast(adminActionErrorMessage(error,'تعذر رفع وحفظ المحتوى.'));}finally{button.disabled=false;button.classList.remove('is-loading');}}; document.getElementById('questionForm').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('[type="submit"]'),q=Object.fromEntries(new FormData(form).entries());q.id='q-'+Date.now();button.disabled=true;try{adminData.questions.push(q);await saveAdminDataNow();aToast('تم إضافة السؤال');renderMaterials();}catch(error){adminData.questions=adminData.questions.filter(item=>item.id!==q.id);aToast(adminActionErrorMessage(error,'تعذر حفظ السؤال.'));}finally{button.disabled=false;}};}
window.deleteItem=async function(collection,id){if(!confirm('حذف العنصر؟'))return;const before=(adminData[collection]||[]).slice();try{await cloudDelete(collection,id);adminData[collection]=before.filter(item=>String(item.id)!==String(id));saveData(adminData);aToast('تم الحذف');deferAdminRender(renderSection);}catch(error){adminData[collection]=before;aToast(adminActionErrorMessage(error,'تعذر حذف العنصر، ولم يتم حذفه من القائمة.'));}};


function scoreIsReady(row){return row && row.score !== null && row.score !== undefined && row.score !== '' && !isNaN(Number(row.score));}
function scoreText(row){
  if(!scoreIsReady(row)) return 'بانتظار التصحيح';
  const score = Number(row.score);
  const max = row.maxScore || row.totalScore || row.fullMark || 100;
  if(max && !isNaN(Number(max)) && Number(max) !== 100) return `${score} من ${Number(max)}`;
  return `${score}%`;
}
function gradeRowDateValue(row){return row.submittedAt || row.date || row.createdAt || row.updatedAt || '';}
function studentForGradeRow(row){const code=String(row?.studentCode||row?.code||''); return (adminData.students||[]).map(normalizeStudent).find(s=>normalizeText(s.studentCode)===normalizeText(code));}
function examGradeRows(){
  const rows = [];
  (adminData.examAttempts||[]).forEach((a,i)=>{
    const code = a.studentCode || a.code || '';
    rows.push({...a,rowKind:'attempt',rowId:String(a.id||`attempt-${code}-${a.examId||a.examTitle||i}-${i}`),studentCode:code,studentName:a.studentName||'',examTitle:a.examTitle||a.exam||'امتحان',date:gradeRowDateValue(a)});
  });
  (adminData.grades||[]).forEach((g,i)=>{
    const code = g.studentCode || g.code || '';
    rows.push({...g,rowKind:'grade',rowId:String(g.id||`grade-${code}-${g.exam||g.examTitle||i}-${i}`),studentCode:code,studentName:g.studentName||g.name||'',examTitle:g.examTitle||g.exam||'امتحان',date:gradeRowDateValue(g)});
  });
  (adminData.students||[]).map(normalizeStudent).forEach(st=>{
    (st.grades||[]).forEach((g,i)=>{
      rows.push({...g,rowKind:'student-grade',rowId:String(g.id||`${st.studentCode}-student-grade-${i}`),studentCode:st.studentCode,studentName:st.name,examTitle:g.examTitle||g.exam||'امتحان',date:gradeRowDateValue(g)});
    });
  });
  const seen = new Set();
  return rows.filter(r=>{
    const key = `${r.rowKind}|${r.rowId}|${r.studentCode}|${r.examTitle}|${r.score}|${r.date}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return r.studentCode || r.studentName || r.examTitle;
  }).sort((a,b)=>String(gradeRowDateValue(b)).localeCompare(String(gradeRowDateValue(a))));
}
function examGradeWhatsappText(row, st){
  const s = st || studentForGradeRow(row) || {};
  return `السلام عليكم ورحمة الله وبركاته

تقرير درجة الطالب

الطالب: ${row.studentName || s.name || '-'}
كود الطالب: ${row.studentCode || s.studentCode || '-'}
المسار: ${s.grade || row.grade || '-'}
المجموعة: ${s.group || row.group || '-'}

الامتحان: ${row.examTitle || row.exam || 'امتحان'}
الدرجة: ${scoreText(row)}
تاريخ التسليم: ${row.submittedAt || row.date || '-'}

م. عمرو خالد`;
}
function examGradeRowHTML(row){
  const st = studentForGradeRow(row) || {};
  const parentPhone = st.parentPhone || row.parentPhone || '';
  const canSend = !!parentPhone && scoreIsReady(row);
  const badge = scoreIsReady(row) ? 'good' : 'warn';
  return `<div class="mobile-row exam-grade-row-v39"><div><b>${safe(row.studentName || st.name || '-')} — ${safe(row.examTitle || row.exam || 'امتحان')}</b><small>${safe(row.studentCode || st.studentCode || '-')} · ${safe(row.submittedAt || row.date || '-')}</small></div><span class="badge ${badge}">${safe(scoreText(row))}</span><div class="mobile-actions exam-grade-actions-v39"><button class="small-btn whatsapp-report-btn" ${canSend?'':'disabled'} onclick="sendExamGradeToParent('${safe(row.rowId)}')">واتساب ولي الأمر</button></div></div>`;
}
window.sendExamGradeToParent=function(rowId){
  const rows = window.__adminExamGradeRows || examGradeRows();
  const row = rows.find(r=>String(r.rowId)===String(rowId));
  if(!row) return aToast('لم يتم العثور على درجة الامتحان');
  if(!scoreIsReady(row)) return aToast('الدرجة لم يتم تصحيحها بعد');
  const st = studentForGradeRow(row);
  const phone = adminWhatsAppPhone(st?.parentPhone || row.parentPhone || '');
  if(!phone) return aToast('رقم ولي الأمر غير موجود لهذا الطالب');
  window.open(whatsappLink(phone, examGradeWhatsappText(row, st)), '_blank');
};

function examHelpSample(){return `<div class="exam-help-v40"><h3>طريقة كتابة الأسئلة الصحيحة</h3><p>للاختياري لازم تكتب الاختيارات وسطر <b>الإجابة:</b> عشان الموقع يصحح تلقائيًا. للمقالي اكتب السؤال فقط بدون اختيارات وسيظهر كاملًا للمدرس للتصحيح.</p><pre>ما ناتج print(2 + 3)؟
أ) 5
ب) 23
ج) 6
د) Error
الإجابة: أ

اشرح الفرق بين المتغير والقيمة في Python.</pre></div>`;}
function examAttemptBadge(a){if(a.needsManualReview||a.status==='pending_manual')return '<span class="badge warn">بانتظار التصحيح</span>'; if(a.status==='corrected')return '<span class="badge good">تم التصحيح</span>'; return '<span class="badge good">مصحح تلقائيًا</span>';}
function examAttemptScoreText(a){return (a.score!==null&&a.score!==undefined&&a.score!=='')?`${a.score}%`:(a.autoScore!==null&&a.autoScore!==undefined?`تلقائي ${a.autoScore}% · ينتظر النهائي`:'بانتظار التصحيح');}
function examAttemptRowHTML(a){return `<div class="mobile-row exam-review-row-v40"><div><b>${safe(a.studentName||'-')} — ${safe(a.examTitle||'امتحان')}</b><small>${safe(a.studentCode||'-')} · ${safe(a.submittedAt||'-')}</small></div>${examAttemptBadge(a)}<span class="badge ${a.score!==null&&a.score!==undefined?'good':'warn'}">${safe(examAttemptScoreText(a))}</span><div class="mobile-actions"><button class="small-btn primary" onclick="correctAttempt('${safe(a.id)}')">عرض وتصحيح</button></div></div>`;}
function renderExams(){fresh(); const attempts=(adminData.examAttempts||[]).slice().reverse(); const pending=attempts.filter(a=>a.needsManualReview||a.status==='pending_manual'); const gradeRows=examGradeRows(); window.__adminExamGradeRows=gradeRows; content(`<div class="section-head"><div><span class="kicker"><span data-icon="clipboard"></span> الاختبارات</span><h2 class="section-title">إدارة الاختبارات والتصحيح</h2><p class="section-desc">الاختياري يتصحح تلقائيًا عند كتابة الإجابة الصحيحة، والمقالي يظهر كاملًا للمدرس للتصحيح.</p></div></div><div class="grid grid-2"><form id="examForm" class="card grid"><h3>إضافة امتحان</h3><input name="title" placeholder="عنوان الامتحان" required><select name="grade"><option>كل المسارات</option>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select><input name="duration" type="number" min="1" value="20" placeholder="المدة بالدقائق"><label class="option-card"><input type="checkbox" name="allowRetake" value="true"> السماح بإعادة التسليم</label><textarea name="instructions" placeholder="تعليمات الامتحان"></textarea><textarea name="text" rows="10" placeholder="مثال اختياري:
ما ناتج print(2 + 3)؟
أ) 5
ب) 23
ج) 6
د) Error
الإجابة: أ

مثال مقالي:
اشرح الفرق بين المتغير والقيمة في Python."></textarea><button class="btn primary"><span data-icon="clipboard"></span> حفظ الامتحان</button></form><div class="card">${examHelpSample()}<h3 style="margin-top:16px">الاختبارات الحالية</h3>${adminData.exams.map(e=>`<div class="mobile-row"><b>${safe(e.title)}</b><small>${safe(e.grade)} · ${safe(e.duration)} دقيقة · ${safe(e.questionCount||'')} سؤال</small><button class="small-btn danger" onclick="deleteItem('exams','${safe(e.id)}')">حذف</button></div>`).join('')||'<p class="section-desc">لا توجد اختبارات.</p>'}</div></div><div class="card exam-review-list-v40" style="margin-top:18px"><h3>محاولات الطلاب والتصحيح</h3><p class="section-desc">اضغط عرض وتصحيح لعرض إجابات الطالب كاملة، علّم كل إجابة صح أو غلط، ثم اكتب الدرجة النهائية.</p>${attempts.map(examAttemptRowHTML).join('')||'<p class="section-desc">لا توجد محاولات بعد.</p>'}</div><div class="card" style="margin-top:18px"><h3>أسئلة مقالية بانتظار التصحيح</h3>${pending.map(a=>`<div class="mobile-row"><b>${safe(a.studentName)} — ${safe(a.examTitle)}</b><small>${safe(a.studentCode)} · ${safe(a.submittedAt)}</small><button class="small-btn primary" onclick="correctAttempt('${safe(a.id)}')">تصحيح</button></div>`).join('')||'<p class="section-desc">لا توجد محاولات تحتاج تصحيح.</p>'}</div><div class="card exam-grade-list-v39" style="margin-top:18px"><h3>درجات الطلاب وإرسال واتساب</h3><p class="section-desc">بعد تصحيح الامتحان، اضغط زر واتساب بجانب درجة الطالب لإرسال النتيجة لولي الأمر برسالة جاهزة.</p>${gradeRows.map(examGradeRowHTML).join('')||'<p class="section-desc">لا توجد درجات أو محاولات اختبارات بعد.</p>'}</div>`); document.getElementById('examForm').onsubmit=e=>{e.preventDefault(); const ex=Object.fromEntries(new FormData(e.target).entries()); const qs=typeof parseExamQuestions==='function'?parseExamQuestions(ex.text||''):[]; if(!qs.length)return aToast('اكتب أسئلة الامتحان أولًا'); const missing=qs.filter(q=>q.type==='mcq'&&!String(q.answer||'').trim()).length; if(missing)return aToast('لازم تكتب الإجابة الصحيحة لكل سؤال اختياري بصيغة: الإجابة: أ'); ex.id='ex-'+Date.now(); ex.allowRetake=!!ex.allowRetake; ex.questionCount=qs.length; ex.mcqCount=qs.filter(q=>q.type==='mcq').length; ex.essayCount=qs.filter(q=>q.type==='essay').length; adminData.exams.push(ex); persist('تم حفظ الامتحان'); renderExams();};}
window.correctAttempt=function(id){const a=adminData.examAttempts.find(x=>String(x.id)===String(id)); if(!a)return; document.querySelector('.correction-modal-v40')?.remove(); const answers=Array.isArray(a.answers)?a.answers:[]; const checkedDefault=x=>x.correct===true?'checked':''; const html=`<div class="correction-modal-v40"><div class="correction-card-v40 card"><div class="profile-top"><div><span class="kicker">تصحيح امتحان</span><h2>${safe(a.studentName||'-')}</h2><p class="section-desc">${safe(a.examTitle||'امتحان')} · ${safe(a.studentCode||'-')}</p></div><button class="small-btn danger" onclick="closeCorrectionModal()">إغلاق</button></div><div class="correction-list-v40">${answers.map((ans,i)=>`<div class="correction-question-v40"><h3>${i+1}. ${safe(ans.question||'سؤال')}</h3><div class="correction-answer-grid-v40"><div><span>إجابة الطالب</span><p>${safe(ans.answer||'-')}</p></div><div><span>الإجابة الصحيحة / النموذجية</span><p>${safe(ans.correctAnswer||ans.modelAnswer||'يصَححها المدرس')}</p></div></div><label class="correction-toggle-v40"><input type="checkbox" data-correct-index="${i}" ${checkedDefault(ans)} onchange="recalculateCorrectionScore()"> الإجابة صحيحة</label></div>`).join('')||'<p class="section-desc">لا توجد إجابات محفوظة.</p>'}</div><div class="correction-final-v40"><button class="small-btn" type="button" onclick="recalculateCorrectionScore()">حساب الدرجة من الصح والغلط</button><label>الدرجة النهائية من 100<input id="manualFinalScore" type="number" min="0" max="100" value="${safe(a.score??a.autoScore??0)}"></label><button class="btn primary" onclick="saveAttemptCorrection('${safe(a.id)}')">حفظ التصحيح والنتيجة</button></div></div></div>`; document.body.insertAdjacentHTML('beforeend',html); recalculateCorrectionScore();};
window.closeCorrectionModal=function(){document.querySelector('.correction-modal-v40')?.remove();};
window.recalculateCorrectionScore=function(){const checks=[...document.querySelectorAll('.correction-modal-v40 [data-correct-index]')]; if(!checks.length)return; const correct=checks.filter(c=>c.checked).length; const score=Math.round(correct/checks.length*100); const input=document.getElementById('manualFinalScore'); if(input && !input.dataset.touched){input.value=score;} if(input){input.oninput=()=>{input.dataset.touched='1';};}};
window.saveAttemptCorrection=async function(id){const attempt=adminData.examAttempts.find(item=>String(item.id)===String(id));if(!attempt)return;const before=JSON.parse(JSON.stringify(attempt)),checks=[...document.querySelectorAll('.correction-modal-v40 [data-correct-index]')];let correct=0;checks.forEach(check=>{const index=Number(check.dataset.correctIndex),ok=!!check.checked;if(attempt.answers&&attempt.answers[index]){attempt.answers[index].correct=ok;attempt.answers[index].teacherReviewed=true;}if(ok)correct++;});const score=Number(document.getElementById('manualFinalScore')?.value);if(Number.isNaN(score)||score<0||score>100){Object.assign(attempt,before);return aToast('اكتب درجة صحيحة من 0 إلى 100');}attempt.score=score;attempt.maxScore=100;attempt.correctCount=correct;attempt.questionCount=checks.length||attempt.questionCount||0;attempt.needsManualReview=false;attempt.status='corrected';attempt.teacherCorrectedAt=new Date().toISOString();try{if(!window.MFCloud?.saveExamAttempt)throw new Error('Exam correction service unavailable');await window.MFCloud.saveExamAttempt(attempt);saveData(adminData);aToast('تم حفظ التصحيح والنتيجة');closeCorrectionModal();renderExams();}catch(error){Object.keys(attempt).forEach(key=>delete attempt[key]);Object.assign(attempt,before);saveData(adminData);aToast(adminActionErrorMessage(error,'تعذر حفظ التصحيح.'));}};

function renderReviewsAdmin(){fresh(); content(`<div class="section-head"><div><span class="kicker"><span data-icon="star"></span> التقييمات</span><h2 class="section-title">مراجعة تقييمات الطلاب</h2></div></div><div class="grid grid-2">${adminData.reviews.map(r=>`<div class="card"><div class="review-stars">${'★'.repeat(Number(r.rating||5))}</div><h3>${safe(r.name)}</h3><p>${safe(r.text||'')}</p><span class="badge ${r.approved!==false?'good':'warn'}">${r.approved!==false?'منشور':'بانتظار الموافقة'}</span><div class="mobile-actions"><button class="small-btn primary" onclick="approveReview('${safe(r.id)}')">نشر</button><button class="small-btn danger" onclick="deleteItem('reviews','${safe(r.id)}')">حذف</button></div></div>`).join('')||'<p class="section-desc">لا توجد تقييمات.</p>'}</div>`);}
window.approveReview=function(id){const r=adminData.reviews.find(x=>x.id===id); if(!r)return; r.approved=true; persist('تم نشر التقييم'); renderReviewsAdmin();};


function backupPayload(){fresh();return {schemaVersion:2,exportedAt:new Date().toISOString(),project:'eng-amr-khaled-academy',data:adminData};}
function downloadJson(filename,payload){const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
window.exportFullBackup=function(){const stamp=new Date().toISOString().replace(/[:.]/g,'-');downloadJson(`mf-platform-backup-${stamp}.json`,backupPayload());aToast('تم تنزيل النسخة الاحتياطية');};
function validateBackupData(value){const data=value?.data||value;if(!data||typeof data!=='object')throw new Error('ملف غير صالح');for(const key of ['students','bookings','materials','questions','exams','examAttempts','reviews','groups','assignments'])if(data[key]!==undefined&&!Array.isArray(data[key]))throw new Error(`القسم ${key} غير صالح`);return mergeData(data);}
window.importFullBackup=async function(input){const file=input?.files?.[0];if(!file)return;const before=adminData;try{const parsed=JSON.parse(await file.text()),restored=validateBackupData(parsed);if(!confirm(`استعادة نسخة تحتوي على ${restored.students.length} طالب و${restored.exams.length} امتحان؟ سيتم استبدال البيانات الحالية.`))return;downloadJson(`mf-platform-before-restore-${Date.now()}.json`,backupPayload());if(!window.MFCloud?.saveSiteData)throw new Error('Restore service unavailable');await window.MFCloud.saveSiteData(restored,{full:true});adminData=restored;saveData(adminData);aToast('تمت استعادة النسخة الاحتياطية');renderBackup();}catch(error){adminData=before;saveData(adminData);aToast(adminActionErrorMessage(error,'تعذر استعادة النسخة؛ لم تتغير البيانات الحالية.'));}finally{if(input)input.value='';}};
window.refreshActivityLog=async function(){renderBackup(true);};
async function renderBackup(loading=false){
  fresh();
  content(`<div class="section-head"><div><span class="kicker"><span data-icon="database"></span> النسخ الاحتياطي</span><h2 class="section-title">حماية بيانات المنصة</h2><p class="section-desc">نزّل نسخة كاملة قبل أي تعديل كبير أو ترقية للأكواد.</p></div></div><div class="grid grid-2"><div class="card backup-action-card"><h3>تصدير نسخة كاملة</h3><p>تشمل الطلاب والحجوزات والحضور والدرجات والاختبارات والمحتوى والإعدادات.</p><button class="btn primary" onclick="exportFullBackup()"><span data-icon="database"></span> تنزيل النسخة الاحتياطية</button></div><div class="card backup-action-card"><h3>استعادة نسخة</h3><p>سيتم تنزيل نسخة تلقائية من الوضع الحالي قبل الاستعادة.</p><label class="btn ghost file-button">اختيار ملف النسخة<input type="file" accept="application/json,.json" onchange="importFullBackup(this)" hidden></label></div></div><div class="card" style="margin-top:18px"><div class="section-head mini"><div><h3>سجل العمليات</h3><p class="section-desc">آخر التعديلات التي نفذها فريق الإدارة.</p></div><button class="small-btn" onclick="refreshActivityLog()">تحديث</button></div><div id="activityLogBox">${loading?'<div class="skeleton" style="height:140px"></div>':'جاري التحميل...'}</div></div>`);
  try{const rows=await window.MFCloud?.getActivityLog?.(50)||[];const box=document.getElementById('activityLogBox');if(box)box.innerHTML=rows.length?rows.map(row=>`<div class="mobile-row"><b>${safe(row.action||'عملية')}</b><small>${safe(row.actorEmail||row.actorRole||'')} · ${safe(row.createdAt?.toDate?row.createdAt.toDate().toLocaleString('ar-EG'):'')}</small></div>`).join(''):'<p class="section-desc">لا توجد عمليات مسجلة بعد.</p>';}catch(e){const box=document.getElementById('activityLogBox');if(box)box.innerHTML='<p class="section-desc">تعذر تحميل السجل.</p>';}
}

function renderSettings(){fresh(); content(`<div class="section-head"><div><span class="kicker"><span data-icon="sparkles"></span> الإعدادات</span><h2 class="section-title">إعدادات الموقع والرابط</h2></div></div><div class="card"><form id="settingsForm" class="grid"><input name="siteUrl" value="${safe(adminData.settings.siteUrl||DEFAULT_SITE_URL||'')}" placeholder="رابط الموقع الأساسي"><input name="teacherPhone" value="${safe(adminData.settings.teacherPhone||TEACHER_WHATSAPP||'')}" placeholder="رقم واتساب المدرس"><textarea name="homeNotice" placeholder="رسالة تنبيه للطلاب">${safe(adminData.settings.homeNotice||'')}</textarea><button class="btn primary"><span data-icon="sparkles"></span> حفظ الإعدادات</button></form></div><div class="grid grid-2" style="margin-top:18px"><div class="seo-card"><h3>الظهور في البحث</h3><p>صفحة المدرس خاصة ولا تظهر في نتائج البحث أو داخل الموقع العام.</p></div><div class="seo-card"><h3>حماية المنصة</h3><p>صلاحيات الدخول والحفظ مفعّلة لحماية بيانات الطلاب وفريق العمل.</p></div></div>`); document.getElementById('settingsForm').onsubmit=e=>{e.preventDefault(); adminData.settings={...adminData.settings,...Object.fromEntries(new FormData(e.target).entries())}; persist('تم حفظ الإعدادات');};}

function renderAttendance(){fresh();const gOpts=['all',...GRADES],grpOpts=['all',...groupOptions()];content(`<div class="section-head compact-admin-head"><div><span class="kicker"><span data-icon="qr"></span> متابعة الحصة</span><h2 class="section-title">الحضور والتطبيق العملي والواجب</h2><p class="section-desc">سجّل حضور الطالب، ثم علّم على التطبيق العملي والواجب؛ كل علامة تُضاف لملفه وتدخل في ترتيب الانتظام.</p></div></div><div class="card attendance-control-card"><div class="attendance-filters"><select id="attendanceGrade">${gOpts.map(g=>`<option value="${safe(g)}">${g==='all'?'كل المسارات':safe(g)}</option>`).join('')}</select><select id="attendanceGroup">${grpOpts.map(g=>`<option value="${safe(g)}">${g==='all'?'كل المجموعات':safe(g)}</option>`).join('')}</select><input id="attendanceDate" type="date" value="${attendanceDate}"></div><div class="attendance-actions"><button class="btn primary qr-open-btn" onclick="openQrScanner()"><span data-icon="qr"></span> مسح QR</button><button class="btn ghost" onclick="manualAttendancePrompt()"><span data-icon="user-check"></span> إدخال الكود</button><button class="btn ghost" onclick="markAbsentForMissing()"><span data-icon="calendar"></span> الباقي غياب</button></div></div><div class="attendance-summary-card card">${attendanceReportHTML()}</div><div class="card attendance-roster-card"><div class="profile-top"><div><h3>طلاب المجموعة</h3><p class="section-desc">الأزرار المعلّمة بعلامة ✓ محفوظة في ملف الطالب لنفس تاريخ الحصة.</p></div></div>${attendanceRosterHTML()}</div><details class="card attendance-history"><summary>عرض سجل اليوم بالتفصيل</summary>${attendanceLogHTML()}</details><div id="qrScannerModal" class="qr-modal" hidden><div class="card qr-modal-card"><div class="profile-top"><h3>ماسح QR الطالب</h3><button class="small-btn danger" onclick="closeQrScanner()">إغلاق</button></div><div id="adminQrReader"></div><p class="section-desc">وجّه كاميرا الموبايل على QR الطالب لتسجيل الحضور.</p></div></div>`);const gd=document.getElementById('attendanceGrade'),gr=document.getElementById('attendanceGroup'),date=document.getElementById('attendanceDate');if(gd)gd.value=sessionStorage.getItem('attGrade')||'all';if(gr)gr.value=sessionStorage.getItem('attGroup')||'all';if(date)date.onchange=()=>{attendanceDate=date.value;renderAttendance();};if(gd)gd.onchange=()=>{sessionStorage.setItem('attGrade',gd.value);renderAttendance();};if(gr)gr.onchange=()=>{sessionStorage.setItem('attGroup',gr.value);renderAttendance();};hydrateIcons();}
function examBuilderCard(index){return `<article class="exam-builder-question" data-exam-question><div class="exam-question-head"><b>السؤال <span data-question-number>${index+1}</span></b><button class="small-btn danger" type="button" onclick="removeExamQuestion(this)">حذف</button></div><div class="field"><label>نص السؤال</label><textarea data-question-text rows="2" required placeholder="اكتب السؤال هنا"></textarea></div><div class="exam-options-grid">${['أ','ب','ج','د'].map((label,i)=>`<label><span>${label}</span><input data-question-option="${i}" required placeholder="الإجابة ${label}"></label>`).join('')}</div><div class="field correct-answer-field"><label>الإجابة الصحيحة للتصحيح التلقائي</label><select data-correct-answer required><option value="">اختار الإجابة الصحيحة</option>${['أ','ب','ج','د'].map(label=>`<option value="${label}">${label}</option>`).join('')}</select></div></article>`;}
function renumberExamQuestions(){document.querySelectorAll('[data-exam-question]').forEach((card,index)=>{const number=card.querySelector('[data-question-number]');if(number)number.textContent=index+1;});}
window.addExamQuestion=function(){const list=document.getElementById('examQuestionsBuilder');if(!list)return;list.insertAdjacentHTML('beforeend',examBuilderCard(list.children.length));renumberExamQuestions();list.lastElementChild?.scrollIntoView({behavior:'smooth',block:'center'});};
window.removeExamQuestion=function(button){const list=document.getElementById('examQuestionsBuilder');if(!list)return;if(list.children.length===1)return aToast('لازم الامتحان يحتوي على سؤال واحد على الأقل');button.closest('[data-exam-question]')?.remove();renumberExamQuestions();};
function serializeExamQuestions(){const cards=[...document.querySelectorAll('[data-exam-question]')];return cards.map(card=>{const question=card.querySelector('[data-question-text]')?.value.trim(),options=[...card.querySelectorAll('[data-question-option]')].map(input=>input.value.trim()),answer=card.querySelector('[data-correct-answer]')?.value;if(!question||options.some(value=>!value)||!answer)return null;return `${question}\nأ) ${options[0]}\nب) ${options[1]}\nج) ${options[2]}\nد) ${options[3]}\nالإجابة: ${answer}`;}).filter(Boolean).join('\n\n');}
function renderExams(){fresh();const attempts=(adminData.examAttempts||[]).slice().reverse(),pending=attempts.filter(a=>a.needsManualReview||a.status==='pending_manual'),gradeRows=examGradeRows();window.__adminExamGradeRows=gradeRows;content(`<div class="section-head compact-admin-head"><div><span class="kicker"><span data-icon="clipboard"></span> الاختبارات</span><h2 class="section-title">إنشاء امتحان</h2><p class="section-desc">اكتب السؤال وأربع إجابات، ثم اختار الإجابة الصحيحة للتصحيح التلقائي.</p></div></div><div class="exam-admin-layout"><form id="examForm" class="card exam-builder-form"><div class="exam-meta-grid"><div class="field"><label>اسم الامتحان</label><input name="title" required placeholder="مثال: امتحان الوحدة الأولى"></div><div class="field"><label>المسار</label><select name="grade"><option>كل المسارات</option>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select></div><div class="field"><label>المدة بالدقائق</label><input name="duration" type="number" min="1" value="20"></div></div><div class="field"><label>تعليمات للطلاب</label><textarea name="instructions" rows="2" placeholder="تعليمات اختيارية"></textarea></div><label class="exam-pdf-upload"><span><b>ملف PDF اختياري</b><small>يمكن إرفاق ملف مع الأسئلة بحجم أقصى 15MB.</small></span><input name="pdfFile" type="file" accept="application/pdf,.pdf"></label><textarea name="text" hidden></textarea><div class="exam-builder-title"><div><h3>الأسئلة</h3><small>كل سؤال له أربع اختيارات وإجابة صحيحة.</small></div><button class="btn ghost" type="button" onclick="addExamQuestion()">+ إضافة سؤال</button></div><div id="examQuestionsBuilder" class="exam-questions-builder">${examBuilderCard(0)}</div><label class="option-card"><input type="checkbox" name="allowRetake" value="true"> السماح للطالب بإعادة الامتحان</label><button class="btn primary full-width" type="submit"><span data-icon="clipboard"></span> حفظ ونشر الامتحان</button></form><aside class="card compact-exam-list"><h3>الاختبارات الحالية</h3>${adminData.exams.map(e=>`<div class="mobile-row"><div><b>${safe(e.title)}</b><small>${safe(e.grade)} · ${safe(e.duration)} دقيقة · ${safe(e.questionCount||0)} سؤال</small></div>${e.pdfUrl?`<a class="small-btn" href="${safe(e.pdfUrl)}" target="_blank">PDF</a>`:''}<button class="small-btn danger" onclick="deleteItem('exams','${safe(e.id)}')">حذف</button></div>`).join('')||'<p class="section-desc">لا توجد اختبارات بعد.</p>'}</aside></div><details class="card admin-collapsible" ${pending.length?'open':''}><summary>محاولات تحتاج تصحيح <span class="badge warn">${pending.length}</span></summary>${pending.map(examAttemptRowHTML).join('')||'<p class="section-desc">لا توجد محاولات معلقة.</p>'}</details><details class="card admin-collapsible"><summary>كل المحاولات والنتائج <span class="badge">${attempts.length}</span></summary>${attempts.map(examAttemptRowHTML).join('')||'<p class="section-desc">لا توجد محاولات.</p>'}</details><details class="card admin-collapsible"><summary>درجات الطلاب وإرسال واتساب</summary>${gradeRows.map(examGradeRowHTML).join('')||'<p class="section-desc">لا توجد درجات بعد.</p>'}</details>`);const form=document.getElementById('examForm');form.addEventListener('submit',event=>{const text=serializeExamQuestions(),count=document.querySelectorAll('[data-exam-question]').length;if(!text||text.split('\n\n').length!==count){event.preventDefault();event.stopImmediatePropagation();return aToast('كمّل السؤال والاختيارات وحدد الإجابة الصحيحة لكل سؤال');}form.elements.text.value=text;},true);hydrateIcons();}
function bindAdminGradeGroupPicker(){
  const form=document.getElementById('addStudentForm'),grade=form?.elements?.grade,group=form?.elements?.group;
  if(!form||!grade||!group)return;
  const refresh=()=>{
    const rows=(adminData.groups||[]).filter(item=>item&&item.active!==false&&normalizeText(item.grade)===normalizeText(grade.value));
    group.innerHTML=rows.length?'<option value="">اختر موعد المسار</option>'+rows.map(item=>`<option value="${safe(item.name||'')}">${safe(scheduleOptionLabel(item))}</option>`).join(''):'<option value="">لا توجد مواعيد لهذا المسار</option>';
    group.required=true;group.disabled=!rows.length;
  };
  grade.addEventListener('change',refresh);refresh();
}
function renderSection(){({overview:renderOverview,students:renderStudents,bookings:renderBookings,schedules:renderSchedules,attendance:renderAttendance,payments:renderPayments,exams:renderExams,materials:renderMaterials,reviews:renderReviewsAdmin}[currentSection]||renderOverview)();if(currentSection==='students')bindAdminGradeGroupPicker();}
function exportCSV(name, rows){const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'})); a.download=name; a.click();}
window.exportBookingsCSV=function(){exportCSV('bookings.csv',[['code','name','grade','month','group','parentPhone','status'],...adminData.bookings.map(b=>[b.code,b.name,b.grade,b.month,b.group,b.parentPhone,b.status])]);};

function initAdmin(){const requested=new URLSearchParams(location.search).get('section');if(adminSections.some(([id])=>id===requested))currentSection=requested;setupTheme(); hydrateIcons(); adminLogin(); tryRestoreSession();}
document.addEventListener('DOMContentLoaded',initAdmin);
