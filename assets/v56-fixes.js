(function(){
  'use strict';

  function connectLabels(){
    document.querySelectorAll('.field').forEach((field,index)=>{
      const label=field.querySelector(':scope > label');
      const control=field.querySelector('input:not([type="hidden"]),select,textarea');
      if(!label||!control)return;
      if(!control.id)control.id=`mf-field-${index+1}`;
      if(!label.htmlFor)label.htmlFor=control.id;
    });
    document.querySelectorAll('[data-star-input] button[data-rate]').forEach(button=>{
      const rate=Number(button.dataset.rate||0);
      button.setAttribute('aria-label',`${rate} ${rate===1?'نجمة':'نجوم'}`);
      button.setAttribute('aria-pressed',String(Number(button.parentElement?.querySelector('input')?.value||5)===rate));
      button.addEventListener('click',()=>{
        button.parentElement?.querySelectorAll('button[data-rate]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      });
    });
    document.querySelectorAll('.theme-toggle').forEach(button=>{
      if(!button.getAttribute('aria-label'))button.setAttribute('aria-label','تغيير ألوان العرض');
    });
    const toast=document.getElementById('toast');
    if(toast){toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');}
  }

  function closePublicMenu(){document.body.classList.remove('v56-public-menu-open');document.querySelector('.v56-site-menu-button')?.setAttribute('aria-expanded','false');}
  function installPublicMobileMenu(){
    const navbar=document.querySelector('.site-header .navbar'),nav=document.querySelector('.site-header .navlinks');
    if(!navbar||!nav||document.querySelector('.v56-site-menu-button'))return;
    const links=[...nav.querySelectorAll('a')].map(link=>`<a href="${link.getAttribute('href')||'#'}">${link.textContent.trim()}</a>`).join('');
    navbar.insertAdjacentHTML('beforeend','<button class="v56-site-menu-button" type="button" aria-label="فتح قائمة الموقع" aria-expanded="false"><span></span><span></span><span></span></button>');
    document.body.insertAdjacentHTML('beforeend',`<div class="v56-public-menu-backdrop" aria-hidden="true"></div><aside class="v56-public-menu" aria-label="قائمة الموقع"><div class="v56-public-menu-head"><div><small>Techno Minds</small><b>م. عمرو خالد</b></div><button type="button" aria-label="إغلاق القائمة">×</button></div><nav>${links}</nav><a class="btn primary" href="index.html#booking">احجز مكانك الآن</a></aside>`);
    const button=document.querySelector('.v56-site-menu-button'),backdrop=document.querySelector('.v56-public-menu-backdrop'),drawer=document.querySelector('.v56-public-menu');
    button.addEventListener('click',()=>{const open=!document.body.classList.contains('v56-public-menu-open');document.body.classList.toggle('v56-public-menu-open',open);button.setAttribute('aria-expanded',String(open));});
    backdrop.addEventListener('click',closePublicMenu);drawer.querySelector('.v56-public-menu-head button').addEventListener('click',closePublicMenu);drawer.querySelectorAll('a').forEach(link=>link.addEventListener('click',closePublicMenu));
  }

  function removeLegacyMobileBars(){
    document.querySelectorAll('.mobile-bottom,.admin-mobile-bottom,.floating-top-tools,.pro-scroll-top').forEach(bar=>bar.remove());
    document.body.classList.remove('mobile-nav-active');
  }

  function installCleanScrollTop(){
    if(document.getElementById('v56ScrollTop'))return;
    document.body.insertAdjacentHTML('beforeend','<button id="v56ScrollTop" class="v56-scroll-top" type="button" aria-label="الرجوع لأول الصفحة"><span aria-hidden="true">↑</span></button>');
    const button=document.getElementById('v56ScrollTop');
    const update=()=>button.classList.toggle('show',window.scrollY>320);
    button.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
    window.addEventListener('scroll',update,{passive:true});update();
  }

  function installAdminDrawerActions(){
    // V60.5 restores these actions to the dedicated administration header.
    // Remove a cached legacy drawer block instead of creating duplicate buttons.
    document.querySelector('.v56-admin-drawer-actions')?.remove();
  }

  let adminStudentRows=[];
  let adminStudentVisible=60;
  function renderAdminStudentRows(){
    const normalized=adminStudentRows;
    const paid=normalized.filter(student=>student.paid).length;
    const manager=typeof currentStaff!=='undefined'&&['admin','teacher'].includes(currentStaff?.role);
    const visible=normalized.slice(0,adminStudentVisible);
    const cards=visible.map(student=>{
      const result=typeof calcStudentAdmin==='function'?calcStudentAdmin(student):{attendancePct:0,avg:0};
      const initial=String(student.name||'ط').trim().charAt(0)||'ط';
      return `<article class="v56-student-row">
        <div class="v56-student-identity"><span class="student-avatar">${safe(initial)}</span><div><b>${safe(student.name)}</b><small>${safe(student.studentCode)} · ${safe(student.grade||'-')} · ${safe(student.group||'-')}</small></div></div>
        <div class="v56-student-kpis"><span class="badge ${student.paid?'good':'warn'}">${student.paid?'مشترك':'غير مشترك'}</span><span><small>الحضور</small><b>${Number(result.attendancePct||0)}%</b></span><span><small>الدرجات</small><b>${Number(result.avg||0)}%</b></span><span><small>التطبيق العملي</small><b>${Number(result.recitationPct||0)}%</b></span><span><small>الواجب</small><b>${Number(result.homeworkPct||0)}%</b></span></div>
        <div class="v56-student-actions"><button class="small-btn primary" type="button" onclick="editStudent('${safe(student.studentCode)}')">تعديل</button><button class="small-btn" type="button" onclick="printStudentReport('${safe(student.studentCode)}')">الملف</button><details><summary class="small-btn" aria-label="إجراءات الطالب">إجراءات</summary><div class="v56-action-menu"><button type="button" onclick="openStudentGroupManager('${safe(student.studentCode)}')">نقل أو إضافة لمجموعة</button><button type="button" onclick="quickPresent('${safe(student.studentCode)}')">تسجيل حضور</button><button type="button" onclick="sendParentMonthlyReport('${safe(student.studentCode)}')">إرسال واتساب</button><button type="button" onclick="copyStudentCodes('${safe(student.studentCode)}')">نسخ الكود الموحّد</button>${manager?`<button type="button" onclick="regenerateStudentCode('${safe(student.studentCode)}')">تغيير الكود الموحّد</button><button class="danger" type="button" onclick="deleteStudent('${safe(student.studentCode)}')">حذف الطالب</button>`:''}</div></details></div>
      </article>`;
    }).join('');
    const more=adminStudentVisible<normalized.length?`<button class="btn ghost full-width" type="button" onclick="showMoreAdminStudents()">عرض ${Math.min(60,normalized.length-adminStudentVisible)} طالب إضافي</button>`:'';
    return `<div class="v56-student-summary"><span><b>${normalized.length}</b><small>طالب مطابق</small></span><span><b>${paid}</b><small>مشترك</small></span><span><b>${normalized.length-paid}</b><small>غير مشترك</small></span></div><div class="v56-student-list">${cards||'<div class="empty-state"><h3>لا يوجد طلاب مطابقون</h3><p>غيّر البحث أو أضف طالبًا جديدًا.</p></div>'}${more}</div>`;
  }
  window.showMoreAdminStudents=function(){adminStudentVisible+=60;const box=document.getElementById('studentsTableBox');if(box)box.innerHTML=renderAdminStudentRows();if(typeof hydrateIcons==='function')hydrateIcons();};
  function applyAdminStudentList(){
    if(typeof studentsTable!=='function'||typeof normalizeStudent!=='function')return;
    studentsTable=function(rows){
      adminStudentRows=(rows||[]).map(normalizeStudent);adminStudentVisible=60;
      return renderAdminStudentRows();
    };
  }

  window.closeStudentGroupManager=function(){document.getElementById('studentGroupManager')?.remove();};
  window.openStudentGroupManager=function(code){
    const student=(adminData.students||[]).find(item=>String(item.studentCode||item.code)===String(code));
    if(!student)return aToast('تعذر العثور على الطالب');
    closeStudentGroupManager();
    const groups=(adminData.groups||[]).filter(group=>group.active!==false&&group.grade===student.grade);
    const unique=[];groups.forEach(group=>{if(group.name&&!unique.some(item=>item.name===group.name))unique.push(group);});
    if(student.group&&!unique.some(group=>group.name===student.group))unique.unshift({name:student.group,id:student.scheduleId||'',days:student.scheduleDays||'',startTime:student.scheduleStartTime||''});
    document.body.insertAdjacentHTML('beforeend',`<div class="v56-group-modal" id="studentGroupManager" role="dialog" aria-modal="true" aria-labelledby="studentGroupManagerTitle"><div class="v56-group-dialog"><div class="v56-group-dialog-head"><div><small>إدارة مجموعة الطالب</small><h3 id="studentGroupManagerTitle">${safe(student.name||student.studentName||'الطالب')}</h3></div><button type="button" onclick="closeStudentGroupManager()" aria-label="إغلاق">×</button></div><div class="v56-current-group"><span>المجموعة الحالية</span><b>${safe(student.group||'لم يتم تحديد مجموعة')}</b><small>${safe(student.grade||'')}</small></div><div class="field"><label for="studentNewGroup">اختار من مواعيد نفس المسار</label><select id="studentNewGroup"><option value="">اختار مجموعة</option>${unique.map(group=>`<option value="${safe(group.name)}" data-id="${safe(group.id||'')}" ${group.name===student.group?'selected':''}>${safe(group.name)}${group.days?` — ${safe(group.days)}`:''}${group.startTime?` — ${safe(typeof formatTime12==='function'?formatTime12(group.startTime):group.startTime)}`:''}</option>`).join('')}</select></div><div class="v56-group-dialog-actions"><button class="btn ghost" type="button" onclick="closeStudentGroupManager()">إلغاء</button><button class="btn primary" id="saveStudentGroupButton" type="button" onclick="saveStudentGroupChange('${safe(code)}')">حفظ المجموعة</button></div></div></div>`);
  };
  window.saveStudentGroupChange=async function(code){
    const student=(adminData.students||[]).find(item=>String(item.studentCode||item.code)===String(code));
    const select=document.getElementById('studentNewGroup');
    if(!student||!select)return;
    const groupName=select.value;
    if(!groupName)return aToast('اختار مجموعة من مواعيد نفس المسار');
    const schedule=(adminData.groups||[]).find(group=>group.name===groupName&&group.active!==false);
    const before={group:student.group||'',scheduleId:student.scheduleId||'',scheduleDays:student.scheduleDays||'',scheduleStartTime:student.scheduleStartTime||'',scheduleEndTime:student.scheduleEndTime||'',updatedAt:student.updatedAt};
    const oldGroup=student.group||'بدون مجموعة';
    student.group=groupName;student.scheduleId=schedule?.id||'';student.scheduleDays=schedule?.days||'';student.scheduleStartTime=schedule?.startTime||'';student.scheduleEndTime=schedule?.endTime||'';student.updatedAt=new Date().toISOString();
    const button=document.getElementById('saveStudentGroupButton');if(button){button.disabled=true;button.classList.add('is-loading');}
    try{if(!window.MFCloud?.saveStudent)throw new Error('Student service unavailable');await window.MFCloud.saveStudent(student);saveData(adminData);aToast(`تم نقل الطالب من ${oldGroup} إلى ${groupName}`);closeStudentGroupManager();renderStudents();}
    catch(error){Object.assign(student,before);saveData(adminData);aToast(adminActionErrorMessage(error,'تعذر حفظ مجموعة الطالب.'));if(button){button.disabled=false;button.classList.remove('is-loading');}}
  };

  function enhanceStudentTools(){
    const section=document.querySelector('.admin-section');
    const form=document.getElementById('addStudentForm');
    const toolbar=document.querySelector('.admin-toolbar');
    if(!section||!form||!toolbar||section.querySelector('.v56-student-tools'))return;
    const head=section.querySelector(':scope > .section-head');
    const addPanel=form.parentElement;
    const reportPanel=section.querySelector('.monthly-report-help-v38');
    const importPanel=document.getElementById('studentImportTools');
    const legacyButton=[...(head?.querySelectorAll('button')||[])].find(button=>/ترقية الأكواد|توحيد الأكواد/.test(button.textContent));
    head?.querySelectorAll('button').forEach(button=>button.hidden=true);
    [addPanel,reportPanel,importPanel].forEach(panel=>{if(panel){panel.hidden=true;panel.classList.add('v56-tool-panel');}});
    toolbar.classList.add('v56-student-filterbar');
    toolbar.insertAdjacentHTML('afterbegin','<div class="v56-filter-title"><span data-icon="search"></span><div><b>ابحث وصفّي الطلاب</b><small>اكتب الكود أو رقم ولي الأمر، ثم حدّد المسار والدفع والعام والترم.</small></div></div>');
    head?.insertAdjacentHTML('afterend',`<div class="v56-student-tools" aria-label="أدوات إدارة الطلاب">
      <button type="button" data-student-tool="add"><span class="iconbox" data-icon="user"></span><span><b>إضافة طالب</b><small>تسجيل وإصدار الكود الموحّد</small></span></button>
      <button type="button" data-student-tool="report"><span class="iconbox" data-icon="send"></span><span><b>تقارير الشهر</b><small>رسالة واتساب جاهزة</small></span></button>
      <button type="button" data-student-tool="import"><span class="iconbox" data-icon="file-text"></span><span><b>استيراد وتصدير</b><small>CSV وExcel</small></span></button>
      <button type="button" data-student-tool="upgrade"><span class="iconbox" data-icon="refresh-cw"></span><span><b>توحيد الأكواد</b><small>تحديث أي حساب قديم</small></span></button>
    </div>`);
    const panels={add:addPanel,report:reportPanel,import:importPanel};
    section.querySelectorAll('[data-student-tool]').forEach(button=>button.addEventListener('click',()=>{
      const key=button.dataset.studentTool;
      if(key==='upgrade'){legacyButton?.click();return;}
      const target=panels[key];if(!target)return;
      const willOpen=target.hidden;
      Object.values(panels).forEach(panel=>{if(panel)panel.hidden=true;});
      section.querySelectorAll('[data-student-tool]').forEach(item=>item.classList.remove('active'));
      target.hidden=!willOpen;
      if(willOpen){button.classList.add('active');target.scrollIntoView({behavior:'smooth',block:'nearest'});}
    }));
    if(typeof hydrateIcons==='function')hydrateIcons();
  }

  function installStudentPageEnhancement(){
    if(typeof renderStudents!=='function'||renderStudents.v56Enhanced)return;
    const base=renderStudents;
    renderStudents=function(){base();enhanceStudentTools();};
    renderStudents.v56Enhanced=true;
    if(document.getElementById('addStudentForm'))enhanceStudentTools();
  }

  function closeOpenMenus(event){
    if(event.target.closest('.v56-student-actions details'))return;
    document.querySelectorAll('.v56-student-actions details[open]').forEach(item=>item.removeAttribute('open'));
  }

  document.addEventListener('DOMContentLoaded',()=>{
    connectLabels();
    removeLegacyMobileBars();
    installCleanScrollTop();
    installPublicMobileMenu();
    setTimeout(()=>{applyAdminStudentList();installStudentPageEnhancement();installAdminDrawerActions();},30);
    const adminMenuObserver=new MutationObserver(()=>{removeLegacyMobileBars();installAdminDrawerActions();if(document.querySelector('.admin-command-header'))adminMenuObserver.disconnect();});
    adminMenuObserver.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',closeOpenMenus);
  });
})();
