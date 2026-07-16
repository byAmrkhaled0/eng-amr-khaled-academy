(function(){
  'use strict';

  const ACADEMIC_TERMS = ['الترم الأول','الترم الثاني'];
  const ACADEMIC_YEAR_PATTERN = /^20\d{2}\/20\d{2}$/;

  function calculatedAcademicYear(date=new Date()){
    const y=date.getFullYear();
    return date.getMonth()>=6?`${y}/${y+1}`:`${y-1}/${y}`;
  }
  function academicYearOptions(selected){
    const current=calculatedAcademicYear();
    const first=Number(current.slice(0,4));
    const values=[];
    for(let y=first-2;y<=first+2;y+=1) values.push(`${y}/${y+1}`);
    if(selected&&!values.includes(selected)) values.push(selected);
    return values.sort().map(v=>`<option value="${safeText(v)}" ${v===selected?'selected':''}>${safeText(v)}</option>`).join('');
  }
  function safeText(value){
    return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  }
  function currentAcademicContext(){
    const settings=(typeof adminData!=='undefined'?adminData?.settings:null)||(typeof appData!=='undefined'?appData?.settings:null)||{};
    return {
      academicYear:ACADEMIC_YEAR_PATTERN.test(String(settings.academicYear||''))?settings.academicYear:calculatedAcademicYear(),
      term:ACADEMIC_TERMS.includes(settings.term)?settings.term:'الترم الأول'
    };
  }
  window.ACADEMIC_TERMS=ACADEMIC_TERMS;
  window.currentAcademicYear=calculatedAcademicYear;


  // Data schema v53: academic context is first-class and settings are collection-backed.
  if(typeof defaultData==='function'){
    defaultData=function(){
      const ctx=currentAcademicContext();
      return {
        students:[],bookings:[],materials:[],questions:[],exams:[],examAttempts:[],grades:[],reviews:[],groups:[],assignments:[],
        settings:{siteUrl:typeof DEFAULT_SITE_URL!=='undefined'?DEFAULT_SITE_URL:'',teacherPhone:typeof TEACHER_WHATSAPP!=='undefined'?TEACHER_WHATSAPP:'',academicYear:ctx.academicYear,term:ctx.term,backupRetentionDays:14}
      };
    };
  }
  if(typeof mergeData==='function'){
    mergeData=function(data){
      const d=defaultData();
      const p=data&&typeof data==='object'?data:{};
      const arrays=['students','bookings','materials','questions','exams','examAttempts','grades','reviews','groups','assignments'];
      const result={...d,...p,settings:{...d.settings,...(p.settings||{})}};
      arrays.forEach(key=>{result[key]=Array.isArray(p[key])?p[key]:[];});
      result.students=result.students.map(st=>({...st,academicYear:st.academicYear||result.settings.academicYear,term:st.term||result.settings.term}));
      return result;
    };
  }
  if(typeof publicDataOnly==='function'){
    publicDataOnly=function(data){
      const d=mergeData(data),settings=d.settings||{};
      return {...defaultData(),materials:d.materials,questions:d.questions,reviews:d.reviews.filter(r=>r.approved===true),groups:d.groups,assignments:d.assignments,settings:{siteUrl:settings.siteUrl||DEFAULT_SITE_URL,teacherPhone:settings.teacherPhone||TEACHER_WHATSAPP,teacherName:settings.teacherName||'م. عمرو خالد',homeNotice:settings.homeNotice||'',academicYear:settings.academicYear||calculatedAcademicYear(),term:settings.term||'الترم الأول'}};
    };
  }
  if(typeof appData!=='undefined') appData=mergeData(appData);

  function populateAcademicSelects(){
    const ctx=currentAcademicContext();
    document.querySelectorAll('select[name="academicYear"],#bookingAcademicYear').forEach(select=>{
      const value=select.value||ctx.academicYear;
      select.innerHTML=academicYearOptions(value);
      select.value=value;
    });
    document.querySelectorAll('select[name="term"],#bookingTerm').forEach(select=>{
      const value=select.value||ctx.term;
      select.innerHTML=ACADEMIC_TERMS.map(term=>`<option ${term===value?'selected':''}>${term}</option>`).join('');
      select.value=value;
    });
  }
  if(typeof fillSelects==='function'){
    const fillSelectsV52=fillSelects;
    fillSelects=function(){fillSelectsV52();populateAcademicSelects();};
  }

  if(typeof renderBookingSuccess==='function'){
    const renderBookingSuccessV52=renderBookingSuccess;
    renderBookingSuccess=function(booking){
      renderBookingSuccessV52(booking);
      const card=document.querySelector('#bookingSuccess .booking-success-card');
      if(card&&!card.querySelector('.academic-context-line')){
        card.insertAdjacentHTML('beforeend',`<p class="academic-context-line"><b>العام الدراسي:</b> ${safeText(booking.academicYear||currentAcademicContext().academicYear)} · <b>${safeText(booking.term||currentAcademicContext().term)}</b></p>`);
      }
    };
  }

  // PWA installation: Android native prompt + clear iPhone instructions.
  function isStandalone(){return window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;}
  function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
  function isMobileDevice(){return /android|iphone|ipad|ipod/i.test(navigator.userAgent)||window.matchMedia?.('(max-width: 820px)').matches;}
  function isTeacherApp(){return !!document.getElementById('adminRoot');}
  function installHelpHTML(){
    const ios=isIOS();
    return `<div class="pwa-install-modal" id="pwaInstallModal" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">
      <div class="pwa-install-card card">
        <button type="button" class="pwa-install-close" aria-label="إغلاق" onclick="document.getElementById('pwaInstallModal')?.remove()">×</button>
        <span class="pwa-app-icon"><img src="assets/technominds-logo.png" alt="شعار Techno Minds"></span>
        <h2 id="pwaInstallTitle">${isTeacherApp()?'ثبّت لوحة المدرس على الموبايل':'ثبّت Techno Minds على الموبايل'}</h2>
        ${ios?`<ol><li>اضغط زر <b>المشاركة</b> في Safari.</li><li>اختر <b>إضافة إلى الشاشة الرئيسية</b>.</li><li>اضغط <b>إضافة</b>.</li></ol><p>لازم فتح الصفحة من Safari، وليس من المتصفح داخل فيسبوك أو واتساب.</p>`:`<ol><li>افتح قائمة المتصفح <b>⋮</b>.</li><li>اختر <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>.</li><li>وافق على التثبيت.</li></ol><p>التثبيت يحتاج HTTPS ومتصفح Chrome أو Edge حديث.</p>`}
        <button type="button" class="btn primary" onclick="document.getElementById('pwaInstallModal')?.remove()">فهمت</button>
      </div>
    </div>`;
  }
  function showInstallHelp(){document.getElementById('pwaInstallModal')?.remove();document.body.insertAdjacentHTML('beforeend',installHelpHTML());}
  setupPWAInstall=function(){
    const teacherMode=isTeacherApp();
    let button=document.getElementById('installAppButton');
    if(!button&&!isStandalone()&&(teacherMode||isMobileDevice())){
      button=document.createElement('button');
      button.id='installAppButton';button.type='button';button.className=teacherMode?'btn ghost teacher-install-button':'pwa-floating-install';
      button.innerHTML=teacherMode?'<span aria-hidden="true">⇩</span><span>تثبيت لوحة المدرس على الهاتف</span>':'<span aria-hidden="true">⇩</span><span>تثبيت المنصة</span>';
      if(teacherMode)document.querySelector('.login-card')?.appendChild(button);else document.body.appendChild(button);
    }
    if(!button)return;
    if(isStandalone()){button.hidden=true;button.style.display='none';return;}
    button.hidden=false;
    let installPrompt=window.__mfInstallPrompt||null;
    const updateLabel=()=>{
      button.title=isIOS()?(teacherMode?'إضافة لوحة المدرس إلى الشاشة الرئيسية':'إضافة المنصة إلى الشاشة الرئيسية'):(teacherMode?'تثبيت لوحة المدرس كتطبيق':'تثبيت المنصة كتطبيق');
      button.setAttribute('aria-label',button.title);
    };
    updateLabel();
    window.addEventListener('beforeinstallprompt',event=>{
      event.preventDefault();installPrompt=event;window.__mfInstallPrompt=event;button.hidden=false;button.style.display='';
    });
    button.onclick=async()=>{
      if(installPrompt){
        installPrompt.prompt();
        const choice=await installPrompt.userChoice.catch(()=>null);
        if(choice?.outcome==='accepted'){button.hidden=true;button.style.display='none';}
        installPrompt=null;window.__mfInstallPrompt=null;
      }else showInstallHelp();
    };
    window.addEventListener('appinstalled',()=>{button.hidden=true;button.style.display='none';if(typeof toast==='function')toast('تم تثبيت المنصة على الموبايل');});
  };

  // Login recovery.
  function addPasswordReset(){
    const form=document.getElementById('loginForm');
    if(!form||document.getElementById('forgotPasswordButton'))return;
    const button=document.createElement('button');
    button.type='button';button.id='forgotPasswordButton';button.className='small-btn login-reset-button';button.textContent='نسيت كلمة المرور؟';
    button.onclick=async()=>{
      const email=form.email?.value?.trim();
      if(!email)return typeof aToast==='function'&&aToast('اكتب البريد الإلكتروني أولًا');
      try{await window.MFCloud?.sendPasswordReset?.(email);aToast('تم إرسال رابط إعادة تعيين كلمة المرور إلى البريد');}
      catch(error){aToast('تعذر إرسال الرابط الآن. تأكد من البريد والإنترنت ثم حاول مرة أخرى.');}
    };
    form.appendChild(button);
  }

  function csvCell(value){return `"${String(value??'').replace(/"/g,'""')}"`;}
  function downloadCSV(filename,headers,rows){
    const csv='\ufeff'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  if(typeof parentReportText==='function'){
    const parentReportTextV52=parentReportText;
    parentReportText=function(student){
      const s=student||{},ctx=currentAcademicContext();
      return parentReportTextV52(s)
        + `\nالعام الدراسي: ${s.academicYear||ctx.academicYear} — ${s.term||ctx.term}`;
    };
  }

  // Admin-only upgrades are attached lazily because teacher login is a separate page.
  function initAdminUpgrades(){
    if(typeof adminSections==='undefined'||typeof renderAdmin!=='function')return;
    const paymentSection=adminSections.find(section=>section[0]==='payments');if(paymentSection)paymentSection[2]='الدفع';
    if(!adminSections.some(section=>section[0]==='schedules'))adminSections.splice(4,0,['schedules','calendar','المواعيد']);
    const isTeacherManager=()=>['admin','teacher'].includes(currentStaff?.role);
    const allowedSections=()=>currentStaff?.role==='assistant'?new Set(['overview','students','bookings','attendance','payments']):new Set(adminSections.map(x=>x[0]));

    const renderOverviewV53=renderOverview;
    renderOverview=function(){renderOverviewV53();const section=document.getElementById('adminContent');if(!section||document.getElementById('teacherQuickHub'))return;section.insertAdjacentHTML('beforeend',`<div class="card teacher-quick-hub" id="teacherQuickHub"><h3>إدارة سريعة</h3><p class="section-desc">أهم الأدوات اليومية في مكان واحد.</p><div class="admin-task-grid-v37"><button class="btn primary" onclick="goAdminSection('schedules')"><span data-icon="calendar"></span> إضافة أو تعديل موعد</button><button class="btn ghost" onclick="goAdminSection('students')"><span data-icon="users"></span> إضافة طالب</button><button class="btn ghost" onclick="goAdminSection('attendance')"><span data-icon="qr"></span> تسجيل الحضور</button><button class="btn ghost" onclick="goAdminSection('payments')"><span data-icon="clipboard"></span> تسجيل الدفع</button><button class="btn ghost teacher-only" onclick="goAdminSection('exams')"><span data-icon="clipboard"></span> إضافة امتحان</button><button class="btn ghost teacher-only" onclick="goAdminSection('materials')"><span data-icon="book-open"></span> إضافة مراجعة أو سؤال</button></div></div>`);hydrateIcons();};

    function scheduleCard(item){const active=item.active!==false;return `<article class="card schedule-admin-card ${active?'':'is-inactive'}"><div class="profile-top"><div><span class="badge ${active?'good':'warn'}">${active?'متاح للحجز':'متوقف'}</span><h3>${safe(item.name||'مجموعة بدون اسم')}</h3><p class="section-desc">${safe(item.grade||'كل المسارات')} · ${safe(item.days||'لم تُحدد الأيام')}</p></div><span class="schedule-time-badge">${safe(typeof formatTime12==='function'?formatTime12(item.startTime):(item.startTime||'--:--'))}</span></div><div class="mobile-actions"><button class="small-btn primary" onclick="editSchedule('${safe(item.id)}')">تعديل الموعد</button><button class="small-btn" onclick="toggleSchedule('${safe(item.id)}')">${active?'إيقاف مؤقت':'إتاحته للحجز'}</button><button class="small-btn danger teacher-only" onclick="deleteSchedule('${safe(item.id)}')">حذف</button></div></article>`;}
    function renderSchedules(){fresh();content(`<div class="section-head"><div><span class="kicker"><span data-icon="calendar"></span> المواعيد والمجموعات</span><h2 class="section-title">إدارة مواعيد الحصص</h2><p class="section-desc">أضف الموعد أو غيّر الأيام والوقت والمكان، وسيظهر اسم المجموعة في الحجز وملف الطالب.</p></div></div><form id="scheduleForm" class="card grid grid-3 schedule-form"><input type="hidden" name="id"><div class="field"><label>اسم المجموعة</label><input name="name" placeholder="مثال: مجموعة السبت والثلاثاء" required></div><div class="field"><label>المسار</label><select name="grade"><option>كل المسارات</option>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select></div><div class="field"><label>الأيام</label><input name="days" placeholder="مثال: السبت والثلاثاء" required></div><div class="field"><label>وقت البداية</label><input name="startTime" type="time" required></div><div class="field"><label>وقت النهاية</label><input name="endTime" type="time"></div><div class="field"><label>المكان</label><input name="location" placeholder="اسم الأكاديمية أو القاعة" required></div><div class="field"><label>الحد الأقصى للطلاب</label><input name="capacity" type="number" min="1" max="500" placeholder="مثال: 30"></div><div class="field grid-span-full"><label>ملاحظة للطلاب</label><textarea name="note" placeholder="أي تعليمات خاصة بالموعد"></textarea></div><label class="remember-code grid-span-full"><input name="active" type="checkbox" checked> <span>الموعد متاح للحجز والظهور للطلاب</span></label><div class="mobile-actions grid-span-full"><button class="btn primary" type="submit"><span data-icon="calendar"></span> حفظ الموعد</button><button class="btn ghost" type="reset" onclick="resetScheduleForm()">موعد جديد</button></div></form><div class="schedule-admin-grid" style="margin-top:16px">${(adminData.groups||[]).map(scheduleCard).join('')||'<div class="empty-state"><h3>لا توجد مواعيد مضافة</h3><p>ابدأ بإضافة أول مجموعة من النموذج.</p></div>'}</div>`);const form=document.getElementById('scheduleForm');form.onsubmit=async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form).entries());if(values.endTime&&values.endTime<=values.startTime)return aToast('وقت النهاية يجب أن يكون بعد وقت البداية');values.active=form.active.checked;values.id=values.id||`grp-${Date.now()}`;const index=adminData.groups.findIndex(group=>String(group.id)===String(values.id));if(index>=0)adminData.groups[index]={...adminData.groups[index],...values};else adminData.groups.push(values);saveData(adminData);try{await window.MFCloud?.saveSiteData?.(adminData);aToast(index>=0?'تم تعديل الموعد وظهر على الموقع':'تم إضافة الموعد وظهر على الموقع');}catch(error){aToast('تم حفظ الموعد على الجهاز، لكن تعذر تحديث الموقع. تحقق من الإنترنت.');}renderSchedules();};hydrateIcons();}
    window.editSchedule=function(id){const item=adminData.groups.find(group=>String(group.id)===String(id));if(!item)return;const form=document.getElementById('scheduleForm');Object.entries(item).forEach(([key,value])=>{if(form.elements[key]&&key!=='active')form.elements[key].value=value??'';});form.active.checked=item.active!==false;form.scrollIntoView({behavior:'smooth',block:'start'});form.name.focus();};
    window.resetScheduleForm=function(){setTimeout(()=>{const form=document.getElementById('scheduleForm');if(form){form.elements.id.value='';form.active.checked=true;}},0);};
    window.toggleSchedule=async function(id){const item=adminData.groups.find(group=>String(group.id)===String(id));if(!item)return;const previous=item.active;item.active=item.active===false;try{if(!window.MFCloud?.saveGroup)throw new Error('Schedule service unavailable');await window.MFCloud.saveGroup(item);saveData(adminData);aToast(item.active?'تم تفعيل الموعد':'تم إيقاف الموعد مؤقتًا');renderSchedules();}catch(error){item.active=previous;saveData(adminData);aToast(adminActionErrorMessage(error,'تعذر تحديث حالة الموعد.'));}};
    window.deleteSchedule=async function(id){if(!isTeacherManager())return aToast('الحذف متاح للمدرس أو المدير فقط');const item=adminData.groups.find(group=>String(group.id)===String(id));if(!item||!confirm(`حذف موعد ${item.name||''}؟ سيختفي من نموذج الحجز فورًا.`))return;try{if(!window.MFCloud?.deleteDocument)throw new Error('Delete service unavailable');await window.MFCloud.deleteDocument('groups',id);adminData.groups=adminData.groups.filter(group=>String(group.id)!==String(id));saveData(adminData);aToast('تم حذف الموعد من الموقع ونموذج الحجز');renderSchedules();}catch(error){aToast(adminActionErrorMessage(error,'تعذر حذف الموعد، ولم يتم حذفه من القائمة.'));}};

    const renderAdminV52=renderAdmin;
    renderAdmin=function(){
      if(!allowedSections().has(currentSection))currentSection='overview';
      renderAdminV52();
      applyAdminRoleGuards();
      const syncButton=[...document.querySelectorAll('.admin-top button')].find(btn=>/حفظ ومزامنة|مزامنة Firebase/.test(btn.textContent));
      if(syncButton)syncButton.innerHTML='<span data-icon="database"></span><span>حفظ التغييرات</span>';
      if(typeof hydrateIcons==='function')hydrateIcons();
    };

    const goAdminSectionV52=window.goAdminSection;
    window.goAdminSection=function(id){
      if(!allowedSections().has(id)){aToast('هذا القسم متاح للمدرس أو المدير فقط');return;}
      goAdminSectionV52(id);
    };

    const contentV52=content;
    content=function(html){contentV52(html);setTimeout(applyAdminRoleGuards,0);};

    function applyAdminRoleGuards(){
      const allowed=allowedSections();
      document.querySelectorAll('[data-admin-nav]').forEach(btn=>{if(!allowed.has(btn.dataset.adminNav))btn.remove();});
      if(!isTeacherManager()){
        document.querySelectorAll('button[onclick],a[onclick]').forEach(el=>{
          const action=el.getAttribute('onclick')||'';
          if(/deleteStudent|deleteItem|regenerate|upgradeLegacy|approveReview|correctAttempt|saveAttemptCorrection|importFullBackup|createAutomaticBackupNow|deleteClientError|clearClientErrors/.test(action))el.remove();
        });
      }
      document.body.dataset.staffRole=currentStaff?.role||'';
    }

    const studentRowV53=function(st){
      const s=normalizeStudent(st),c=calcStudentAdmin(s),manager=isTeacherManager();
      return `<tr><td><b>${safe(s.studentCode)}</b><small style="display:block">ولي الأمر: ${safe(s.parentCode||'غير منشأ')}</small></td><td>${safe(s.name)}<small style="display:block">${safe(s.academicYear||'-')} · ${safe(s.term||'-')}</small></td><td>${safe(s.grade)}</td><td>${safe(s.group||'-')}</td><td><span class="badge ${badgeStatus(s.paid)}">${s.paid?'تم الاشتراك':'غير مشترك'}</span></td><td>${c.attendancePct||0}%</td><td>${c.avg||0}%</td><td><div class="pay-row"><button class="small-btn primary" onclick="editStudent('${safe(s.studentCode)}')">تعديل</button><button class="small-btn" onclick="copyStudentCodes('${safe(s.studentCode)}')">نسخ الأكواد</button>${manager?`<button class="small-btn" onclick="regenerateParentCode('${safe(s.studentCode)}')">كود ولي أمر جديد</button><button class="small-btn danger" onclick="regenerateStudentCode('${safe(s.studentCode)}')">تغيير كود الطالب</button>`:''}<button class="small-btn" onclick="quickPresent('${safe(s.studentCode)}')">حضور</button><button class="small-btn" onclick="printStudentReport('${safe(s.studentCode)}')">تفاصيل</button><button class="small-btn whatsapp-report-btn" onclick="sendParentMonthlyReport('${safe(s.studentCode)}')">واتساب</button>${manager?`<button class="small-btn danger" onclick="deleteStudent('${safe(s.studentCode)}')">حذف</button>`:''}</div></td></tr>`;
    };
    studentRow=studentRowV53;
    studentMobileCards=function(rows){return `<div class="student-mobile-cards">${rows.map(st=>{const s=normalizeStudent(st),c=calcStudentAdmin(s),manager=isTeacherManager();return `<article class="mobile-admin-card"><div class="mobile-admin-card-head"><div><b>${safe(s.name)}</b><small>${safe(s.studentCode)} · ${safe(s.grade)} · ${safe(s.group||'-')}</small><small>${safe(s.academicYear||'-')} · ${safe(s.term||'-')}</small></div><span class="badge ${badgeStatus(s.paid)}">${s.paid?'مشترك':'غير مشترك'}</span></div><div class="mobile-card-kpis"><span><small>الحضور</small><b>${c.attendancePct||0}%</b></span><span><small>الدرجات</small><b>${c.avg||0}%</b></span><span><small>كود ولي الأمر</small><b>${safe(s.parentCode||'غير منشأ')}</b></span></div><div class="mobile-primary-actions"><button type="button" class="small-btn primary" onclick="editStudent('${safe(s.studentCode)}')">تعديل</button><button type="button" class="small-btn" onclick="quickPresent('${safe(s.studentCode)}')">حضور</button><button type="button" class="small-btn whatsapp-report-btn" onclick="sendParentMonthlyReport('${safe(s.studentCode)}')">واتساب</button></div><details class="admin-more-actions"><summary>المزيد من الإجراءات</summary><div class="mobile-actions"><button type="button" class="small-btn" onclick="copyStudentCodes('${safe(s.studentCode)}')">نسخ الأكواد</button>${manager?`<button type="button" class="small-btn" onclick="regenerateParentCode('${safe(s.studentCode)}')">كود ولي أمر جديد</button><button type="button" class="small-btn danger" onclick="regenerateStudentCode('${safe(s.studentCode)}')">تغيير كود الطالب</button>`:''}<button type="button" class="small-btn" onclick="printStudentReport('${safe(s.studentCode)}')">التفاصيل</button>${manager?`<button type="button" class="small-btn danger" onclick="deleteStudent('${safe(s.studentCode)}')">حذف الطالب</button>`:''}</div></details></article>`;}).join('')||'<p class="section-desc">لا يوجد طلاب.</p>'}</div>`;};

    window.refreshStudentsTable=function(){
      let rows=adminData.students.map(normalizeStudent);
      const q=(document.getElementById('studentSearchAdmin')?.value||'').trim().toLowerCase();
      const grade=document.getElementById('studentGradeAdmin')?.value||'all';
      const pay=document.getElementById('studentPayAdmin')?.value||'all';
      const year=document.getElementById('studentYearAdmin')?.value||'all';
      const term=document.getElementById('studentTermAdmin')?.value||'all';
      if(q)rows=rows.filter(s=>[s.studentCode,s.parentCode,s.name,s.parentPhone,s.studentPhone].some(v=>String(v||'').toLowerCase().includes(q)));
      if(grade!=='all')rows=rows.filter(s=>s.grade===grade);
      if(pay==='paid')rows=rows.filter(s=>s.paid);if(pay==='unpaid')rows=rows.filter(s=>!s.paid);
      if(year!=='all')rows=rows.filter(s=>(s.academicYear||currentAcademicContext().academicYear)===year);
      if(term!=='all')rows=rows.filter(s=>(s.term||currentAcademicContext().term)===term);
      const box=document.getElementById('studentsTableBox');if(box)box.innerHTML=studentsTable(rows);if(typeof hydrateIcons==='function')hydrateIcons();applyAdminRoleGuards();
    };

    const renderStudentsV52=renderStudents;
    renderStudents=function(){
      renderStudentsV52();
      const ctx=currentAcademicContext();
      const form=document.getElementById('addStudentForm');
      if(form&&!form.querySelector('[name="academicYear"]')){
        const notes=form.querySelector('[name="notes"]');
        notes?.insertAdjacentHTML('beforebegin',`<select name="academicYear" aria-label="العام الدراسي">${academicYearOptions(ctx.academicYear)}</select><select name="term" aria-label="الترم">${ACADEMIC_TERMS.map(t=>`<option ${t===ctx.term?'selected':''}>${t}</option>`).join('')}</select>`);
      }
      const toolbar=document.querySelector('.admin-toolbar');
      if(toolbar&&!document.getElementById('studentYearAdmin')){
        toolbar.insertAdjacentHTML('beforeend',`<select id="studentYearAdmin"><option value="all">كل الأعوام</option>${academicYearOptions(ctx.academicYear)}</select><select id="studentTermAdmin"><option value="all">كل الترمات</option>${ACADEMIC_TERMS.map(t=>`<option>${t}</option>`).join('')}</select>`);
        ['studentYearAdmin','studentTermAdmin'].forEach(id=>document.getElementById(id)?.addEventListener('change',window.refreshStudentsTable));
      }
      if(toolbar&&!document.getElementById('studentImportTools')){
        toolbar.insertAdjacentHTML('beforebegin',`<div class="card student-import-tools" id="studentImportTools"><div><h3>استيراد وتصدير الطلاب</h3><p>يدعم CSV وExcel. الأعمدة المقبولة: الاسم، هاتف الطالب، هاتف ولي الأمر، المسار، المجموعة، الشهر، العام الدراسي، الترم، الملاحظات.</p></div><div class="mobile-actions"><label class="btn ghost file-button">استيراد CSV / Excel<input type="file" accept=".csv,.xlsx,.xls" onchange="importStudentsFile(this)" hidden></label><button class="btn ghost" type="button" onclick="exportStudentsCSV()">تصدير الطلاب</button></div><div class="import-progress" id="studentImportProgress" hidden></div></div>`);
      }
      populateAcademicSelects();applyAdminRoleGuards();
    };

    window.exportStudentsCSV=function(){
      const rows=adminData.students.map(normalizeStudent).map(s=>[s.studentCode,s.parentCode,s.name,s.studentPhone,s.parentPhone,s.grade,s.group,s.month,s.academicYear,s.term,s.paid?'مشترك':'غير مشترك',s.notes]);
      downloadCSV('students-v54.csv',['كود الطالب','كود ولي الأمر','اسم الطالب','هاتف الطالب','هاتف ولي الأمر','المسار','المجموعة','الشهر','العام الدراسي','الترم','حالة الدفع','ملاحظات'],rows);
    };
    function parseCSV(text){
      const rows=[];let row=[],field='',quoted=false;
      for(let i=0;i<text.length;i+=1){const ch=text[i],next=text[i+1];if(ch==='"'){if(quoted&&next==='"'){field+='"';i+=1;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(field.trim());field='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i+=1;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=ch;}
      row.push(field.trim());if(row.some(Boolean))rows.push(row);return rows;
    }
    function mapImportedRow(row){
      const aliases={name:['name','studentname','اسم','اسم الطالب'],studentPhone:['studentphone','هاتف الطالب','رقم الطالب'],parentPhone:['parentphone','هاتف ولي الأمر','رقم ولي الامر','رقم ولي الأمر'],grade:['grade','المسار'],group:['group','المجموعة'],month:['month','الشهر'],academicYear:['academicyear','year','العام الدراسي'],term:['term','semester','الترم'],notes:['notes','ملاحظات']};
      const out={};Object.entries(aliases).forEach(([key,names])=>{for(const name of names){const found=Object.keys(row).find(k=>String(k).trim().toLowerCase()===name.toLowerCase());if(found!==undefined&&row[found]!==undefined){out[key]=String(row[found]).trim();break;}}});
      const ctx=currentAcademicContext();out.academicYear=out.academicYear||ctx.academicYear;out.term=out.term||ctx.term;out.month=out.month||MONTHS[new Date().getMonth()];out.group=out.group||groupOptions()[0]||'';out.grade=out.grade||GRADES[0];return out;
    }
    window.importStudentsFile=async function(input){
      const file=input?.files?.[0];if(!file)return;
      const progress=document.getElementById('studentImportProgress');
      try{
        let objects=[];
        if(/\.xlsx?$/i.test(file.name)){
          if(progress){progress.hidden=false;progress.textContent='جاري تجهيز قارئ Excel…';}
          if(typeof XLSX==='undefined')await window.MFAssets?.loadSpreadsheet?.();
          if(typeof XLSX==='undefined')throw new Error('تعذر تجهيز قارئ Excel. استخدم CSV أو حاول مرة أخرى.');
          const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});const sheet=workbook.Sheets[workbook.SheetNames[0]];objects=XLSX.utils.sheet_to_json(sheet,{defval:''});
        }else{
          const rows=parseCSV(await file.text());if(rows.length<2)throw new Error('الملف لا يحتوي على بيانات.');const headers=rows[0];objects=rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]||''])));
        }
        const mapped=objects.map(mapImportedRow).filter(r=>r.name&&r.parentPhone).slice(0,300);
        if(!mapped.length)throw new Error('لم يتم العثور على صفوف بها اسم الطالب ورقم ولي الأمر.');
        if(!confirm(`سيتم استيراد ${mapped.length} طالب وإنشاء أكواد جديدة لهم. متابعة؟`))return;
        if(progress){progress.hidden=false;progress.textContent=`بدء الاستيراد: 0 / ${mapped.length}`;}
        let success=0,failed=0;
        for(let i=0;i<mapped.length;i+=1){
          const item={...mapped[i],studentName:mapped[i].name,paid:false,active:true,attendance:[],grades:[],homeworks:[],recitations:[]};
          try{const created=await window.MFCloud?.createStudentAccess?.(item);if(!created?.studentCode)throw new Error('code');adminData.students.push({...item,...created,id:created.studentCode,code:created.studentCode});success+=1;}catch(error){failed+=1;}
          if(progress)progress.textContent=`تم ${i+1} / ${mapped.length} — ناجح: ${success} — تعذر: ${failed}`;
        }
        saveData(adminData);aToast(`تم استيراد ${success} طالب${failed?`، وتعذر ${failed}`:''}`);renderStudents();
      }catch(error){aToast(error.message||'تعذر قراءة ملف الطلاب');}
      finally{if(input)input.value='';}
    };

    window.editStudent=async function(code){
      const s=adminData.students.find(x=>stCode(x)===code);if(!s)return;
      const name=prompt('اسم الطالب',stName(s));if(name===null)return;
      const parentPhone=prompt('رقم ولي الأمر',s.parentPhone||'');if(parentPhone===null)return;
      const grade=prompt('المسار التعليمي',s.grade||GRADES[0]);if(grade===null)return;
      const group=prompt('المجموعة',s.group||'');if(group===null)return;
      const academicYear=prompt('العام الدراسي بصيغة 2026/2027',s.academicYear||currentAcademicContext().academicYear);if(academicYear===null)return;
      if(!ACADEMIC_YEAR_PATTERN.test(academicYear))return aToast('اكتب العام الدراسي بصيغة 2026/2027');
      const term=prompt('الترم',s.term||currentAcademicContext().term);if(term===null)return;
      const before={...s},updated={...s,name,studentName:name,parentPhone,grade,group,academicYear,term:ACADEMIC_TERMS.includes(term)?term:currentAcademicContext().term,notes:prompt('ملاحظات المدرس',s.notes||'')??s.notes??''};
      try{if(!window.MFCloud?.saveStudent)throw new Error('Student service unavailable');await window.MFCloud.saveStudent(updated);Object.assign(s,updated);saveData(adminData);aToast('تم تحديث بيانات الطالب');renderStudents();}
      catch(error){Object.assign(s,before);aToast(adminActionErrorMessage(error,'تعذر تحديث بيانات الطالب.'));}
    };
    window.deleteStudent=async function(code){
      if(!isTeacherManager())return aToast('الحذف متاح للمدرس أو المدير فقط');
      code=String(code||'');if(studentDeletionPending.has(code))return;
      if(!confirm('سيتم إنشاء نسخة استرجاع للطالب ثم حذف بياناته. متابعة؟'))return;
      const student=adminData.students.find(s=>stCode(s)===code);
      studentDeletionPending.add(code);
      try{const result=await window.MFCloud?.deleteStudentSafely?.(student||{studentCode:code});if(!result?.ok)throw new Error('تعذر تأكيد الحذف');adminData.students=adminData.students.filter(s=>stCode(s)!==code);saveData(adminData);aToast(result.backupMode==='browser'?'تم تنزيل نسخة استرجاع وحذف الطالب':'تم حفظ نسخة استرجاع وحذف الطالب');renderStudents();}
      catch(error){aToast(adminActionErrorMessage(error,'تعذر حذف الطالب بأمان، ولم يتم حذفه من القائمة.'));}
      finally{studentDeletionPending.delete(code);}
    };

    const attendanceRecordV52=attendanceRecord;
    attendanceRecord=function(st,status,method){const record=attendanceRecordV52(st,status,method);const ctx=currentAcademicContext();return {...record,academicYear:st.academicYear||ctx.academicYear,term:st.term||ctx.term};};
    const renderAttendanceV52=renderAttendance;
    renderAttendance=function(){
      renderAttendanceV52();
      const card=document.querySelector('.attendance-control-card');
      if(card&&!document.getElementById('exportAttendanceButton'))card.insertAdjacentHTML('afterbegin',`<div class="academic-context-banner"><b>${safe(currentAcademicContext().academicYear)}</b><span>${safe(currentAcademicContext().term)}</span><button id="exportAttendanceButton" class="small-btn" type="button" onclick="exportAttendanceCSV()">تصدير الحضور</button></div>`);
    };
    window.exportAttendanceCSV=function(){
      const rows=[];adminData.students.map(normalizeStudent).forEach(st=>(st.attendance||[]).forEach(a=>rows.push([a.date,a.time,a.status==='present'?'حاضر':'غائب',st.studentCode,st.name,st.grade,st.group,a.academicYear||st.academicYear,a.term||st.term,a.method||''])));
      downloadCSV('attendance-v54.csv',['التاريخ','الوقت','الحالة','كود الطالب','اسم الطالب','المسار','المجموعة','العام الدراسي','الترم','الطريقة'],rows);
    };

    renderPayments=function(){
      fresh();content(`<div class="section-head"><div><span class="kicker"><span data-icon="database"></span> المدفوعات</span><h2 class="section-title">تسجيل حالة الدفع</h2><p class="section-desc">لا يوجد دفع إلكتروني في المنصة. هذا القسم لتسجيل هل الطالب دفع في الأكاديمية فقط.</p></div><button class="btn ghost" onclick="exportCenterSubscriptionsCSV()">تصدير CSV</button></div><div class="grid">${GRADES.map(g=>{const rows=adminData.students.filter(s=>s.grade===g).map(normalizeStudent);return `<div class="card"><h3>${safe(g)}</h3>${rows.map(s=>`<div class="mobile-row"><div><b>${safe(s.name)}</b><small>${safe(s.studentCode)} · ${safe(s.month||'-')} · ${safe(s.academicYear||'-')} · ${safe(s.term||'-')}</small></div><span class="badge ${badgeStatus(s.paid)}">${s.paid?'تم الاشتراك':'غير مشترك'}</span><div class="mobile-actions"><button class="small-btn primary" onclick="setPaid('${safe(s.studentCode)}',true)">تم الدفع</button><button class="small-btn danger" onclick="setPaid('${safe(s.studentCode)}',false)">لم يدفع</button></div></div>`).join('')||'<p class="section-desc">لا يوجد طلاب.</p>'}</div>`;}).join('')}</div>`);
    };
    window.exportCenterSubscriptionsCSV=function(){const rows=adminData.students.map(normalizeStudent).map(s=>[s.studentCode,s.name,s.grade,s.group,s.month,s.academicYear,s.term,s.paid?'تم الدفع':'لم يدفع',s.paymentDate||'']);downloadCSV('center-subscriptions-v54.csv',['كود الطالب','الاسم','المسار','المجموعة','الشهر','العام الدراسي','الترم','الحالة','تاريخ التسجيل'],rows);};

    const renderExamsV52=renderExams;
    renderExams=function(){
      renderExamsV52();
      const form=document.getElementById('examForm'),ctx=currentAcademicContext();
      if(form&&!form.querySelector('[name="openAt"]')){
        const retake=form.querySelector('[name="allowRetake"]')?.closest('label');
        retake?.insertAdjacentHTML('beforebegin',`<select name="group"><option>كل المجموعات</option>${groupOptions().map(g=>`<option>${safe(g)}</option>`).join('')}</select><select name="academicYear">${academicYearOptions(ctx.academicYear)}</select><select name="term">${ACADEMIC_TERMS.map(t=>`<option ${t===ctx.term?'selected':''}>${t}</option>`).join('')}</select><label class="field"><span>فتح الامتحان</span><input name="openAt" type="datetime-local"></label><label class="field"><span>إغلاق الامتحان</span><input name="closeAt" type="datetime-local"></label>`);
        form.addEventListener('submit',event=>{const open=form.openAt.value,close=form.closeAt.value;if(open&&close&&new Date(close)<=new Date(open)){event.preventDefault();event.stopImmediatePropagation();aToast('موعد إغلاق الامتحان يجب أن يكون بعد موعد الفتح');}},true);
      }
      const questions=form?.querySelector('[name="text"]');
      if(questions&&!form.querySelector('[name="pdfFile"]')){
        questions.insertAdjacentHTML('beforebegin',`<label class="exam-pdf-upload"><span><b>ملف الامتحان PDF (اختياري)</b><small>يمكن رفع PDF حتى 15MB، وكتابة الأسئلة هنا أو تركها فارغة ليجيب الطالب عن الملف في مربع إجابة واحد.</small></span><input name="pdfFile" type="file" accept="application/pdf,.pdf"></label>`);
        questions.placeholder='اكتب الأسئلة هنا، أو ارفع PDF فقط.\n\nمثال اختياري:\nما ناتج print(2 + 3)؟\nأ) 5\nب) 23\nالإجابة: أ\n\nمثال مقالي:\nاشرح الفرق بين المتغير والقيمة في Python.';
      }
      if(form){
        form.onsubmit=async event=>{
          event.preventDefault();
          const button=form.querySelector('button[type="submit"]'),pdfFile=form.elements.pdfFile?.files?.[0]||null;
          const ex=Object.fromEntries(new FormData(form).entries());delete ex.pdfFile;
          if(ex.openAt&&ex.closeAt&&new Date(ex.closeAt)<=new Date(ex.openAt))return aToast('موعد إغلاق الامتحان يجب أن يكون بعد موعد الفتح');
          if(pdfFile&&(pdfFile.type!=='application/pdf'||pdfFile.size>15*1024*1024))return aToast('اختار ملف PDF صحيحًا بحجم لا يزيد عن 15MB');
          if(!String(ex.text||'').trim()&&!pdfFile)return aToast('اكتب أسئلة الامتحان أو ارفع ملف PDF');
          if(!String(ex.text||'').trim()&&pdfFile)ex.text='أجب عن أسئلة ملف الامتحان PDF بالترتيب، واكتب رقم كل سؤال قبل إجابته.';
          const parsed=typeof parseExamQuestions==='function'?parseExamQuestions(ex.text||''):[];
          if(!parsed.length)return aToast('تعذر قراءة الأسئلة. افصل بين كل سؤال والذي يليه بسطر فارغ.');
          const missing=parsed.filter(q=>q.type==='mcq'&&!String(q.answer||'').trim()).length;
          if(missing)return aToast('اكتب الإجابة الصحيحة لكل سؤال اختياري بصيغة: الإجابة: أ');
          button.disabled=true;button.classList.add('is-loading');
          try{
            if(pdfFile){const upload=await window.MFCloud?.uploadAttachment?.(pdfFile,'teacher-uploads');if(!upload?.url)throw new Error('pdf upload');ex.pdfUrl=upload.url;ex.pdfName=upload.fileName;ex.pdfPath=upload.path;}
            ex.id=`ex-${Date.now()}`;ex.allowRetake=!!ex.allowRetake;ex.active=true;ex.questionCount=parsed.length;ex.mcqCount=parsed.filter(q=>q.type==='mcq').length;ex.essayCount=parsed.filter(q=>q.type==='essay').length;
            adminData.exams.push(ex);await saveAdminDataNow();aToast(pdfFile?'تم رفع PDF وحفظ الامتحان':'تم حفظ الامتحان والأسئلة');renderExams();
          }catch(error){if(ex.id)adminData.exams=adminData.exams.filter(item=>item.id!==ex.id);saveData(adminData);aToast(adminActionErrorMessage(error,'تعذر حفظ الامتحان أو رفع ملف PDF.'));}
          finally{button.disabled=false;button.classList.remove('is-loading');}
        };
      }
      if(form&&!document.getElementById('exportGradesButton'))form.insertAdjacentHTML('afterend',`<div class="mobile-actions exam-export-tools"><button id="exportGradesButton" class="btn ghost" type="button" onclick="exportGradesCSV()">تصدير الدرجات</button></div>`);
      const existing=[...(form?.parentElement?.children||[])].find(element=>element!==form&&element.classList.contains('card'));
      if(existing&&!document.getElementById('examScheduleSummary')){
        existing.insertAdjacentHTML('beforeend',`<div id="examScheduleSummary" class="exam-schedule-summary"><h3>مواعيد الإتاحة</h3>${adminData.exams.map(ex=>`<div class="mobile-row"><div><b>${safe(ex.title)}</b><small>${safe(ex.academicYear||ctx.academicYear)} · ${safe(ex.term||ctx.term)} · ${safe(ex.group||'كل المجموعات')}</small></div><span class="badge ${examAvailabilityClass(ex)}">${safe(examAvailabilityText(ex))}</span>${ex.pdfUrl?`<a class="small-btn" href="${safe(ex.pdfUrl)}" target="_blank" rel="noopener noreferrer">فتح PDF</a>`:''}</div>`).join('')||'<p class="section-desc">لا توجد اختبارات.</p>'}</div>`);
      }
      populateAcademicSelects();
    };
    function examAvailabilityText(ex){const now=Date.now(),open=ex.openAt?new Date(ex.openAt).getTime():0,close=ex.closeAt?new Date(ex.closeAt).getTime():0;if(ex.active===false)return 'متوقف';if(open&&now<open)return 'لم يفتح بعد';if(close&&now>close)return 'مغلق';return 'متاح';}
    function examAvailabilityClass(ex){return examAvailabilityText(ex)==='متاح'?'good':examAvailabilityText(ex)==='لم يفتح بعد'?'warn':'danger';}
    window.exportGradesCSV=function(){const rows=(adminData.examAttempts||[]).map(a=>[a.studentCode,a.studentName,a.examTitle,a.score??'',a.autoScore??'',a.status,a.submittedAt,a.academicYear||'',a.term||'']);downloadCSV('exam-grades-v54.csv',['كود الطالب','اسم الطالب','الامتحان','الدرجة النهائية','الدرجة التلقائية','الحالة','تاريخ التسليم','العام الدراسي','الترم'],rows);};

    renderSettings=function(){
      fresh();const ctx=currentAcademicContext();content(`<div class="section-head"><div><span class="kicker"><span data-icon="sparkles"></span> الإعدادات</span><h2 class="section-title">إعدادات المنصة والعام الدراسي</h2></div></div><div class="card"><form id="settingsForm" class="grid grid-2"><div class="field"><label>الدومين الأساسي</label><input name="siteUrl" value="${safe(adminData.settings.siteUrl||DEFAULT_SITE_URL||'')}" placeholder="الدومين الأساسي"></div><div class="field"><label>رقم واتساب المدرس</label><input name="teacherPhone" value="${safe(adminData.settings.teacherPhone||TEACHER_WHATSAPP||'')}" placeholder="رقم واتساب المدرس"></div><div class="field"><label>العام الدراسي الحالي</label><select name="academicYear">${academicYearOptions(ctx.academicYear)}</select></div><div class="field"><label>الترم الحالي</label><select name="term">${ACADEMIC_TERMS.map(t=>`<option ${t===ctx.term?'selected':''}>${t}</option>`).join('')}</select></div><div class="field grid-span-full"><label>رسالة تنبيه للطلاب</label><textarea name="homeNotice" placeholder="رسالة تنبيه للطلاب">${safe(adminData.settings.homeNotice||'')}</textarea></div><button class="btn primary grid-span-full"><span data-icon="sparkles"></span> حفظ الإعدادات</button></form></div><div class="grid grid-3" style="margin-top:18px"><div class="seo-card"><h3>تخزين منفصل</h3><p>الطلاب والحضور والدرجات والاختبارات تُحفظ في Collections منفصلة، ولا يتم تحديث مستند ضخم واحد.</p></div><div class="seo-card"><h3>أمان النماذج</h3><p>الحجز والتقييم يعملان من خلال Cloud Functions فقط مع Rate Limit.</p></div><div class="seo-card"><h3>المصادقة الثنائية</h3><p>الكود جاهز لإعادة تعيين كلمة المرور. تفعيل MFA نفسه يحتاج تفعيل Identity Platform من Firebase Console.</p></div></div>`);
      document.getElementById('settingsForm').onsubmit=async event=>{event.preventDefault();const form=event.target,button=form.querySelector('[type="submit"]'),values=Object.fromEntries(new FormData(form).entries());if(!ACADEMIC_YEAR_PATTERN.test(values.academicYear))return aToast('صيغة العام الدراسي غير صحيحة');const before={...adminData.settings};adminData.settings={...adminData.settings,...values};button.disabled=true;button.classList.add('is-loading');try{await saveAdminDataNow();aToast('تم حفظ إعدادات العام الدراسي والمنصة');renderSettings();}catch(error){adminData.settings=before;saveData(adminData);aToast(adminActionErrorMessage(error,'تعذر حفظ إعدادات المنصة.'));}finally{button.disabled=false;button.classList.remove('is-loading');}};
    };

    renderBackup=async function(loading=false){
      fresh();content(`<div class="section-head"><div><span class="kicker"><span data-icon="database"></span> النسخ الاحتياطي</span><h2 class="section-title">حماية بيانات المنصة</h2><p class="section-desc">نسخ يدوية قابلة للاستعادة، ونسخ تلقائية مضغوطة محفوظة في Firebase Storage.</p></div></div><div class="grid grid-3"><div class="card backup-action-card"><h3>نسخة يدوية JSON</h3><p>تنزيل كل البيانات الحالية على جهازك.</p><button class="btn primary" onclick="exportFullBackup()">تنزيل نسخة</button></div><div class="card backup-action-card"><h3>استعادة نسخة يدوية</h3><p>يتم تنزيل نسخة من الوضع الحالي قبل الاستعادة.</p><label class="btn ghost file-button">اختيار JSON<input type="file" accept="application/json,.json" onchange="importFullBackup(this)" hidden></label></div><div class="card backup-action-card"><h3>نسخة سحابية الآن</h3><p>النسخ التلقائي اليومي يحتاج نشر Scheduled Function وخطة Firebase تدعم Scheduler.</p><button class="btn dark" onclick="createAutomaticBackupNow()">إنشاء نسخة الآن</button></div></div><div class="grid grid-2" style="margin-top:18px"><div class="card"><div class="section-head mini"><div><h3>النسخ السحابية</h3><p class="section-desc">يتم الاحتفاظ بآخر 14 يومًا افتراضيًا.</p></div><button class="small-btn" onclick="loadAutomaticBackups()">تحديث</button></div><div id="automaticBackupsBox">${loading?'جاري التحميل...':'اضغط تحديث لعرض النسخ.'}</div></div><div class="card"><div class="section-head mini"><div><h3>سجل العمليات</h3></div><button class="small-btn" onclick="refreshActivityLog()">تحديث</button></div><div id="activityLogBox">جاري التحميل...</div></div></div>`);
      try{const rows=await window.MFCloud?.getActivityLog?.(50)||[];const box=document.getElementById('activityLogBox');if(box)box.innerHTML=rows.length?rows.map(row=>`<div class="mobile-row"><b>${safe(row.action||'عملية')}</b><small>${safe(row.actorEmail||row.actorRole||'')} · ${safe(row.createdAt?.toDate?row.createdAt.toDate().toLocaleString('ar-EG'):'')}</small></div>`).join(''):'<p class="section-desc">لا توجد عمليات.</p>';}catch(e){document.getElementById('activityLogBox').innerHTML='<p class="section-desc">تعذر تحميل السجل.</p>';}
      if(!loading)loadAutomaticBackups();applyAdminRoleGuards();
    };
    window.createAutomaticBackupNow=async function(){if(!isTeacherManager())return aToast('النسخ السحابي متاح للمدرس أو المدير');try{if(!window.MFCloud?.createBackupNow)throw new Error('Backup service unavailable');aToast('جاري إنشاء النسخة السحابية');const result=await window.MFCloud.createBackupNow();if(!result?.name&&!result?.ok)throw new Error('تعذر تأكيد إنشاء النسخة');aToast('تم إنشاء النسخة السحابية');loadAutomaticBackups();}catch(error){aToast(adminActionErrorMessage(error,'تعذر إنشاء النسخة السحابية.'));}};
    window.loadAutomaticBackups=async function(){const box=document.getElementById('automaticBackupsBox');if(!box)return;box.innerHTML='<div class="skeleton" style="height:100px"></div>';try{const result=await window.MFCloud?.listAutomaticBackups?.();const rows=result?.backups||[];box.innerHTML=rows.length?rows.map(item=>`<div class="mobile-row"><div><b>${safe(item.name?.split('/').pop()||'نسخة')}</b><small>${safe(item.createdAt||'')} · ${Math.max(1,Math.round(Number(item.size||0)/1024))} KB</small></div><div class="mobile-actions"><button class="small-btn" onclick="downloadAutomaticBackup('${safe(item.name)}')">تنزيل</button><button class="small-btn danger" onclick="restoreAutomaticBackup('${safe(item.name)}')">استعادة</button></div></div>`).join(''):'<p class="section-desc">لا توجد نسخ سحابية بعد.</p>';}catch(error){box.innerHTML='<p class="section-desc">تعذر تحميل النسخ. انشر Cloud Functions الجديدة أولًا.</p>';}};
    window.downloadAutomaticBackup=async function(name){try{if(!window.MFCloud?.getBackupDownloadUrl)throw new Error('Backup download service unavailable');const result=await window.MFCloud.getBackupDownloadUrl(name);if(result?.url)window.open(result.url,'_blank','noopener');else throw new Error('تعذر تجهيز رابط النسخة');}catch(error){aToast(adminActionErrorMessage(error,'تعذر إنشاء رابط تنزيل النسخة.'));}};
    window.restoreAutomaticBackup=async function(name){if(!isTeacherManager())return aToast('الاستعادة متاحة للمدرس أو المدير فقط');const typed=prompt('الاستعادة ستستبدل بيانات المنصة، وسيتم إنشاء نسخة أمان قبلها. اكتب: استعادة');if(typed!=='استعادة')return aToast('تم إلغاء الاستعادة');try{if(!window.MFCloud?.restoreAutomaticBackup)throw new Error('Restore service unavailable');aToast('جاري إنشاء نسخة أمان ثم الاستعادة');const result=await window.MFCloud.restoreAutomaticBackup(name);if(!result?.ok)throw new Error('تعذر تأكيد الاستعادة');await reloadFromCloud();aToast('تمت الاستعادة بنجاح');renderBackup();}catch(error){aToast(adminActionErrorMessage(error,'تعذرت استعادة النسخة.'));}};

    async function renderClientErrors(){
      if(!isTeacherManager())return content('<div class="card"><h2>غير مصرح</h2></div>');
      content(`<div class="section-head"><div><span class="kicker"><span data-icon="database"></span> مراقبة الأخطاء</span><h2 class="section-title">أخطاء أجهزة المستخدمين</h2><p class="section-desc">آخر أخطاء JavaScript التي أرسلها الموقع بدون بيانات حساسة.</p></div><div class="mobile-actions"><button class="btn ghost" onclick="renderSection()">تحديث</button><button class="btn danger" onclick="clearClientErrors()">مسح الكل</button></div></div><div class="card" id="clientErrorsBox"><div class="skeleton" style="height:150px"></div></div>`);
      try{const rows=await window.MFCloud?.getClientErrors?.(100)||[];const box=document.getElementById('clientErrorsBox');box.innerHTML=rows.length?rows.map(row=>`<article class="error-log-card"><div><b>${safe(row.message||'خطأ')}</b><small>${safe(row.page||'')}</small><small>${safe(row.createdAt?.toDate?row.createdAt.toDate().toLocaleString('ar-EG'):row.createdAt||'')}</small></div><button class="small-btn danger" onclick="deleteClientError('${safe(row.id)}')">حذف</button></article>`).join(''):'<div class="empty-state"><h3>لا توجد أخطاء مسجلة</h3><p>هذا مؤشر جيد.</p></div>';}catch(error){document.getElementById('clientErrorsBox').innerHTML='<p class="section-desc">تعذر تحميل الأخطاء.</p>';}
    }
    window.deleteClientError=async function(id){if(!isTeacherManager())return;await window.MFCloud?.deleteClientError?.(id);renderClientErrors();};
    window.clearClientErrors=async function(){if(!isTeacherManager()||!confirm('مسح كل سجلات الأخطاء؟'))return;await window.MFCloud?.clearClientErrors?.();renderClientErrors();};

    const renderSectionV52=renderSection;
    renderSection=function(){
      if(!allowedSections().has(currentSection)){currentSection='overview';}
      if(currentSection==='errors')return renderClientErrors();
      if(currentSection==='schedules')return renderSchedules();
      renderSectionV52();setTimeout(applyAdminRoleGuards,0);
    };

    const deleteItemV52=window.deleteItem;
    window.deleteItem=function(collection,id){if(!isTeacherManager())return aToast('الحذف متاح للمدرس أو المدير فقط');return deleteItemV52(collection,id);};
    window.forceFirestoreSync=async function(){try{if(!window.MFCloud?.saveSiteData)throw new Error('Sync service unavailable');await window.MFCloud.saveSiteData(adminData);saveData(adminData);aToast('تم حفظ ومزامنة جميع البيانات');}catch(error){aToast(adminActionErrorMessage(error,'تعذرت مزامنة البيانات.'));}};

    const approveBookingV53=window.approveBooking;
    window.approveBooking=async function(code){return approveBookingV53(code);};
    window.approveReview=async function(id){const review=adminData.reviews.find(item=>String(item.id)===String(id));if(!review)return;const previous=review.approved;review.approved=true;try{await saveAdminDataNow();aToast('تم نشر التقييم على الموقع');renderReviewsAdmin();}catch(error){review.approved=previous;saveData(adminData);aToast(adminActionErrorMessage(error,'تعذر نشر التقييم.'));}};
    window.setPaid=async function(code,value){const student=adminData.students.find(item=>stCode(item)===code);if(!student)return aToast('الطالب غير موجود');const previous={paid:student.paid,paymentDate:student.paymentDate};student.paid=value;student.paymentDate=value?isoDateAdmin():'';try{if(!window.MFCloud?.saveStudent)throw new Error('Student service unavailable');await window.MFCloud.saveStudent(student);saveData(adminData);aToast('تم تحديث حالة الدفع');renderPayments();}catch(error){student.paid=previous.paid;student.paymentDate=previous.paymentDate;saveData(adminData);aToast(adminActionErrorMessage(error,'تعذر تحديث حالة الدفع.'));renderPayments();}};
  }

  const studentHelpItems=[
    {q:'مين هو المهندس عمرو خالد؟',keys:'مين عمرو خالد مهندس مدرس مدرب شهادات بورتفوليو ذكاء اصطناعي واجهات انترنت الاشياء هاردوير',a:'مؤسس Techno Minds، ومهندس ذكاء اصطناعي ومطور واجهات أمامية ومتخصص في إنترنت الأشياء والهاردوير. يركز على التطبيق العملي والمشروعات والمتابعة، وصفحة «عن م. عمرو» تضم الشهادات والمهارات وروابط الأعمال.',link:'about.html',label:'عن م. عمرو والشهادات'},
    {q:'أشوف مشروعات وبورتفوليو م. عمرو فين؟',keys:'بورتفوليو portfolio مشاريع اعمال github جيت هب',a:'تقدر تفتح البورتفوليو وGitHub وروابط التواصل الموثقة من صفحة «عن م. عمرو».',link:'about.html',label:'فتح الروابط المهنية'},
    {q:'إزاي أحجز في الأكاديمية؟',keys:'احجز حجز تسجيل سنتر',a:'الحجز 3 خطوات داخل نفس الصندوق: بيانات الطالب، ثم المسار والموعد الاختياري، ثم استلام الكود وروابط بوابة الطالب وولي الأمر.',link:'index.html#booking',label:'فتح الحجز'},
    {q:'إيه المسارات المتاحة؟',keys:'مسارات برمجة بايثون ذكاء اصطناعي ثانوي مبتدئين',a:'متاح أولى ثانوي برمجة، وتانية ثانوي، والمبتدئين، وأساسيات Python، والتطبيقات والمراجعة.'},
    {q:'إيه المسار التعليمي الكامل؟',keys:'المسار التعليمي خطة اتعلم ابدا مبتدئ مشاريع',a:'المسار يبدأ بالتفكير البرمجي وPython، ثم التطبيق والتحديات والذكاء الاصطناعي، وينتهي بمشروع Portfolio.',link:'learning-path.html',label:'شاهد المسار الكامل'},
    {q:'أشغّل الكود منين؟',keys:'عملي محرر كود تشغيل run python javascript c java rust kotlin ruby',a:'المعمل العملي مفتوح للجميع بدون كود طالب، ويدعم 12 لغة منها Python وJavaScript وC وC++ وJava وC# وGo وPHP وRuby وRust وKotlin.',link:'practical.html',label:'فتح المعمل العملي'},
    {q:'أجيب كود الطالب منين؟',keys:'كود الطالب ضاع نسيته',a:'كود الطالب يصدر بعد قبول الحجز. اطلبه من المدرس أو تواصل معه إذا فقدته.'},
    {q:'أدخل صفحة الطالب إزاي؟',keys:'صفحة بوابة بياناتي تقرير الطالب',a:'افتح صفحة الطالب واكتب الكود كما استلمته، أو امسح رمز QR الخاص بك.',link:'student.html',label:'فتح صفحة الطالب'},
    {q:'ولي الأمر يتابع إزاي؟',keys:'ولي الامر الاب الام متابعة تقرير',a:'يستخدم ولي الأمر نفس كود الطالب الموحّد أو يمسح نفس الباركود لعرض الحضور والتطبيق العملي والدرجات والواجبات والملاحظات.',link:'parent.html',label:'فتح صفحة ولي الأمر'},
    {q:'أشوف مواعيد ومجموعة الطالب فين؟',keys:'ميعاد مواعيد جدول مجموعة حصة',a:'بعد إدخال كود الطالب ستظهر المجموعة وجدولها داخل صفحة الطالب. لو الجدول غير ظاهر تواصل مع المدرس.'},
    {q:'أعرف الحضور والغياب إزاي؟',keys:'حضور غياب حضرت غبت',a:'سجل الحضور والغياب موجود داخل صفحة الطالب وصفحة ولي الأمر، ويتم تحديثه بعد تسجيل الحضور.'},
    {q:'أشوف الدرجات والنتائج فين؟',keys:'درجة درجات نتيجة نتائج امتحان',a:'تظهر الدرجات في صفحة الطالب وولي الأمر، ونتائج الاختبارات تظهر بعد التسليم أو بعد تصحيح الأسئلة المقالية.'},
    {q:'أدخل الامتحان إزاي؟',keys:'امتحان اختبار ابدأ',a:'افتح صفحة الاختبارات، اكتب كود الطالب، ثم اختر الامتحان المتاح لمسارك واضغط بدء.',link:'exams.html',label:'فتح الاختبارات'},
    {q:'خرجت من الامتحان قبل التسليم',keys:'خرجت قفلت امتحان حفظ اجابات اكمل',a:'ارجع من نفس الجهاز والمتصفح قبل انتهاء الوقت؛ المنصة تحفظ المحاولة لتكملها.'},
    {q:'الامتحان مش ظاهر',keys:'امتحان مش ظاهر غير موجود',a:'تأكد من كود الطالب وموعد فتح الامتحان وأنه مخصص لمسارك ومجموعتك. بعد ذلك حدّث الصفحة.'},
    {q:'أرفع الواجب إزاي؟',keys:'واجب ارفع ملف صورة pdf تسليم',a:'ادخل صفحة الطالب، افتح قسم الواجبات، اختر الملف ثم اضغط رفع. تأكد أن حجم الملف داخل الحد المسموح.'},
    {q:'ألاقي التدريبات والأسئلة فين؟',keys:'مراجعة تدريبات ملفات مذكرة اسئلة بنك',a:'التدريبات والتحديات البرمجية متاحان من صفحات المحتوى، ويمكنك تصفية المحتوى حسب المسار.',link:'materials.html',label:'فتح التدريبات'},
    {q:'أعرف حالة الدفع إزاي؟',keys:'دفع دفعت فلوس مصاريف حالة الدفع',a:'حالة الدفع تظهر داخل تقرير الطالب وولي الأمر. الدفع يتم داخل الأكاديمية فقط ولا يوجد دفع إلكتروني بالموقع.'},
    {q:'الموقع مش بيفتح أو البيانات مش ظاهرة',keys:'مشكلة مش بيفتح بيانات انترنت خطأ',a:'تأكد من الإنترنت، حدّث الصفحة، ثم جرّب إغلاق الموقع وفتحه. لو استمرت المشكلة تواصل مع المدرس وأرسل صورة للشاشة.'},
    {q:'أثبت المنصة على الموبايل إزاي؟',keys:'تثبيت تنزيل تطبيق موبايل شاشة رئيسية',a:'اضغط زر «تثبيت المنصة». على iPhone افتح من Safari ثم مشاركة ← إضافة إلى الشاشة الرئيسية.'},
    {q:'هل أقدر أغيّر بياناتي؟',keys:'تعديل تغيير اسم رقم صف مجموعة بيانات',a:'لحماية بيانات الطالب، تعديل الاسم أو الرقم أو المسار أو المجموعة يتم من خلال المدرس.'},
    {q:'عايز أتواصل مع المدرس',keys:'تواصل واتساب كلم مستر مساعدة',a:'استخدم زر التواصل الرسمي في الصفحة الرئيسية لإرسال استفسارك مباشرة.',link:'index.html#contact',label:'فتح التواصل'}
  ];

  function normalizeHelpText(value){return String(value||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[^\u0600-\u06ff0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
  function helpAnswerCard(item){return `<div class="student-help-answer"><b>${safeText(item.q)}</b><p>${safeText(item.a)}</p>${item.link?`<a href="${item.link}" class="small-btn primary">${safeText(item.label||'فتح الصفحة')}</a>`:''}</div>`;}
  function initStudentHelp(){
    if(document.getElementById('adminRoot')||document.getElementById('studentHelpButton'))return;
    document.body.insertAdjacentHTML('beforeend',`<button id="studentHelpButton" class="student-help-button robot-faq-btn" type="button" aria-label="افتح مساعد Techno Minds" title="مساعد Techno Minds" aria-expanded="false"><span class="tm-robot-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M24 8V4m-3 0h6"/><rect x="8" y="11" width="32" height="28" rx="10"/><path d="M8 23H4v9h4m32-9h4v9h-4M16 39v5m16-5v5"/><circle cx="18" cy="24" r="3" fill="currentColor" stroke="none"/><circle cx="30" cy="24" r="3" fill="currentColor" stroke="none"/><path d="M17 32c4 3 10 3 14 0"/></svg></span><span class="tm-robot-pulse"></span></button><section id="studentHelpPanel" class="student-help-panel" hidden aria-label="مساعد Techno Minds"><header><div><b>روبوت Techno Minds</b><small>اسأل عن م. عمرو أو المنصة أو خدمات الطالب</small></div><button type="button" id="studentHelpClose" aria-label="إغلاق">×</button></header><form id="studentHelpSearch"><input name="question" autocomplete="off" placeholder="مثال: أشغّل الكود منين؟" aria-label="اكتب سؤالك"><button type="submit">إرسال</button></form><div id="studentHelpAnswer" aria-live="polite"><p>أقدر أساعدك في التعرف على م. عمرو، المسار، الحجز، المعمل العملي، بوابات المتابعة والاختبارات.</p></div><div class="student-help-questions">${studentHelpItems.map((item,index)=>`<button type="button" data-help-index="${index}">${safeText(item.q)}</button>`).join('')}</div></section>`);
    const button=document.getElementById('studentHelpButton'),panel=document.getElementById('studentHelpPanel'),answer=document.getElementById('studentHelpAnswer');
    const toggle=open=>{panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)panel.querySelector('input')?.focus();};
    const show=index=>{answer.innerHTML=helpAnswerCard(studentHelpItems[index]);};
    button.onclick=()=>toggle(panel.hidden);document.getElementById('studentHelpClose').onclick=()=>toggle(false);
    panel.querySelectorAll('[data-help-index]').forEach(el=>el.onclick=()=>show(Number(el.dataset.helpIndex)));
    document.getElementById('studentHelpSearch').onsubmit=event=>{event.preventDefault();const query=normalizeHelpText(event.target.question.value);if(!query)return;let best=-1,score=0;studentHelpItems.forEach((item,index)=>{const words=normalizeHelpText(item.q+' '+item.keys).split(' ');const current=words.filter(word=>word.length>2&&query.includes(word)).length;if(current>score){score=current;best=index;}});answer.innerHTML=best>=0?helpAnswerCard(studentHelpItems[best]):`<div class="student-help-answer"><b>محتاج مساعدة إضافية؟</b><p>مش لاقي إجابة دقيقة للسؤال ده. تواصل مع المدرس واكتب سؤالك بالتفصيل.</p><a href="index.html#contact" class="small-btn primary">التواصل مع المدرس</a></div>`;};
    if(typeof hydrateIcons==='function')hydrateIcons();
  }

  function usePaymentWording(root=document){
    const replacements=[['المدفوعات','الدفع'],['حالة الدفع','الدفع'],['حالة الدفع','حالة الدفع'],['تم الاشتراك','تم الدفع'],['غير مشترك','لم يتم الدفع']];
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(node=>{if(node.parentElement?.closest('script,style'))return;let text=node.nodeValue;replacements.forEach(([from,to])=>{text=text.replaceAll(from,to);});node.nodeValue=text;});
  }

  function simplifyScheduleEditor(root=document){const form=(root.id==='scheduleForm'?root:root.querySelector?.('#scheduleForm'));if(!form||form.dataset.simplified)return;form.dataset.simplified='true';['endTime','location','capacity','note'].forEach(name=>form.elements[name]?.closest('.field')?.remove());const time=form.elements.startTime;if(time){const label=time.closest('.field')?.querySelector('label');if(label)label.textContent='ميعاد الحصة';}const days=form.elements.days;if(days&&!document.getElementById('commonScheduleDays')){days.setAttribute('list','commonScheduleDays');days.placeholder='اختار أو اكتب الأيام';days.insertAdjacentHTML('afterend','<datalist id="commonScheduleDays"><option value="السبت والثلاثاء"><option value="الأحد والأربعاء"><option value="الإثنين والخميس"><option value="الجمعة"><option value="يوميًا"></datalist>');}const description=form.previousElementSibling?.querySelector?.('.section-desc');if(description)description.textContent='اسم المجموعة، المسار، الأيام وميعاد الحصة فقط.';form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button[type="submit"]');const values=Object.fromEntries(new FormData(form).entries());values.endTime='';values.active=form.active.checked;values.id=values.id||`grp-${Date.now()}`;button.disabled=true;button.classList.add('is-loading');try{if(!window.MFCloud?.saveGroup)throw new Error('Schedule service unavailable');const saved=await window.MFCloud.saveGroup(values);if(!saved?.id)throw new Error('save failed');const index=adminData.groups.findIndex(group=>String(group.id)===String(saved.id));if(index>=0)adminData.groups[index]={...adminData.groups[index],...saved};else adminData.groups.push(saved);saveData(adminData);aToast(index>=0?'تم تعديل موعد الحصة':'تمت إضافة المجموعة إلى صفحة الحجز');renderSection();}catch(error){aToast(adminActionErrorMessage(error,'تعذر حفظ المجموعة.'));}finally{button.disabled=false;button.classList.remove('is-loading');}};}

  document.addEventListener('DOMContentLoaded',()=>{
    populateAcademicSelects();
    addPasswordReset();
    initAdminUpgrades();
    initStudentHelp();
    usePaymentWording();
    simplifyScheduleEditor();
    new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1){usePaymentWording(node);simplifyScheduleEditor(node);}}))).observe(document.body,{childList:true,subtree:true});
    // Admin's original init may render after auth restoration; role guards are re-applied by wrappers.
  });
})();
