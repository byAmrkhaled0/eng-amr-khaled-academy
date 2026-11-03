/* Account composition owns existing nodes; data access remains in MFCloud. */
(function(){
  'use strict';
  const state={role:'',code:'',logo:null,dialog:null,parentView:'overview'},inboxes=new Map(),examCache=new Map();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>'<span data-icon="'+name+'" aria-hidden="true"></span>';
  function chrome(role,student){
    const first=!document.body.classList.contains('tm-account-active')||state.code!==String(student.studentCode||'');
    state.role=role;state.code=String(student.studentCode||'');state.student=student;
    document.body.classList.add('tm-account-active');document.body.dataset.account=role;
    const header=document.querySelector('.site-header'),navbar=header?.querySelector('.navbar');if(!navbar)return;
    state.logo=state.logo||navbar.querySelector('.logo');
    header.classList.add('account-topbar');
    navbar.querySelector('.navlinks')?.remove();
    navbar.querySelectorAll('.tm-header-login,.tm-header-booking,.v56-site-menu-button').forEach(n=>n.remove());
    document.querySelector('.mobile-bottom')?.remove();
    let actions=navbar.querySelector('.header-actions');
    if(!navbar.querySelector('.account-menu-button')){
      const menu=document.createElement('button');menu.type='button';menu.className='account-menu-button';menu.setAttribute('aria-label','فتح قائمة الحساب');menu.innerHTML=icon('menu');navbar.prepend(menu);
      menu.onclick=()=>{if(role==='student'){openStudentMenu();return;}const more=document.querySelector('.tm-nav-more');if(innerWidth<=700&&more){more.open=!more.open;more.querySelector('summary')?.focus();}else document.body.classList.toggle('account-sidebar-collapsed');};
      const profile=document.createElement('button');profile.type='button';profile.className='account-profile-button';profile.setAttribute('aria-label','الحساب وتغيير الكود');actions?.append(profile);profile.onclick=()=>openAccess();
      if(role==='student'){
        const bell=document.createElement('button');bell.type='button';bell.className='account-bell';bell.setAttribute('aria-label','الإشعارات');bell.innerHTML=icon('bell')+'<b data-notification-badge hidden></b>';actions?.prepend(bell);bell.onclick=()=>selectStudentTab('notifications');
      }
    }
    const profile=navbar.querySelector('.account-profile-button');if(profile)profile.textContent=String(student.name||'ط').trim().charAt(0);
    if(!document.getElementById('accountAccessDialog')){
      const dialog=document.createElement('dialog');dialog.id='accountAccessDialog';dialog.className='account-access-dialog';dialog.setAttribute('aria-labelledby','accountAccessTitle');
      dialog.innerHTML='<div class="account-dialog-head"><h2 id="accountAccessTitle">الحساب والدخول</h2><button type="button" aria-label="إغلاق">×</button></div>';
      const access=document.querySelector('.portal-access-switch');if(access)dialog.append(access);
      const exit=document.createElement('button');exit.type='button';exit.className='btn danger account-signout';exit.textContent='تسجيل الخروج';dialog.append(exit);exit.onclick=()=>signOut();
      const footer=document.querySelector('footer.footer');if(footer){const legal=document.createElement('details');legal.className='account-legal';legal.innerHTML='<summary>الخصوصية والتواصل</summary>';legal.append(footer);dialog.append(legal);}
      document.body.append(dialog);dialog.querySelector('.account-dialog-head button').onclick=()=>dialog.close();
      dialog.addEventListener('click',event=>{if(event.target.closest('[onclick="openParentQrScanner()"]'))dialog.close();},true);
      dialog.addEventListener('close',()=>window.stopStudentScanner?.());
      dialog.addEventListener('cancel',()=>window.stopStudentScanner?.());

      dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
    }
    document.querySelector('.parent-hero-v29')?.remove();
    const dialog=document.getElementById('accountAccessDialog');if(dialog.open)dialog.close();
    arrange();window.hydrateIcons?.(header);if(first)requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'auto'}));
  }
  function arrange(){
    if(!state.logo||!document.body.classList.contains('tm-account-active'))return;
    const compact=innerWidth<=700;if(state.compact!==compact){const actions=document.querySelector('.parent-report-actions');if(actions)actions.open=!compact;state.compact=compact;}
    const target=document.querySelector('.account-topbar .navbar');
    if(target&&target.firstElementChild!==state.logo)target.prepend(state.logo);
    if(state.role==='student'){
      const aside=document.querySelector('#studentResult .account-sidebar'),layout=document.querySelector('#studentResult .account-layout');
      if(!aside||!layout)return;
      const dialog=studentDrawer(layout);
      if(innerWidth<=820){if(aside.parentElement!==dialog)dialog.append(aside);}
      else{if(dialog.open)dialog.close();if(aside.parentElement!==layout)layout.prepend(aside);}
    }
  }
  function studentDrawer(layout){
    let dialog=layout.querySelector('#studentNavigationDialog');if(dialog)return dialog;
    dialog=document.createElement('dialog');dialog.id='studentNavigationDialog';dialog.className='student-navigation-dialog';dialog.setAttribute('aria-label','أقسام حساب الطالب');
    const close=document.createElement('button');close.type='button';close.className='student-drawer-close';close.setAttribute('aria-label','إغلاق القائمة');close.textContent='×';dialog.append(close);layout.append(dialog);
    close.onclick=()=>dialog.close();
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right)dialog.close();}});
    dialog.addEventListener('close',()=>{document.body.classList.remove('student-menu-open');document.querySelector('.account-menu-button')?.setAttribute('aria-expanded','false');});
    return dialog;
  }
  function openStudentMenu(){
    if(innerWidth>820){document.body.classList.toggle('account-sidebar-collapsed');return;}
    const dialog=document.getElementById('studentNavigationDialog');if(!dialog||dialog.open)return;
    document.getElementById('studentHelpPanel')?.setAttribute('hidden','');
    document.getElementById('studentHelpButton')?.setAttribute('aria-expanded','false');
    dialog.showModal();document.body.classList.add('student-menu-open');
    const menu=document.querySelector('.account-menu-button');menu?.setAttribute('aria-controls',dialog.id);menu?.setAttribute('aria-expanded','true');
  }
  function studentPage(key,{history=true}={}){
    const dashboard=document.querySelector('#studentResult .student-app-dashboard');if(!dashboard)return;
    const button=dashboard.querySelector('[data-student-tab="'+key+'"]');if(!button)return;
    dashboard.dataset.studentView=key;
    const crumb=dashboard.querySelector('.student-page-breadcrumb');if(crumb){crumb.hidden=key==='overview';crumb.querySelector('span').textContent=button.textContent.trim();}
    dashboard.querySelectorAll('[data-student-tab]').forEach(n=>n.setAttribute('aria-current',n===button?'page':'false'));
    const dialog=document.getElementById('studentNavigationDialog');if(dialog?.open)dialog.close();
    if(history&&location.hash!=='#'+key)window.history.pushState({studentPage:key},'','#'+key);
    requestAnimationFrame(()=>{window.scrollTo({top:0,behavior:'auto'});window.dispatchEvent(new Event('scroll'));});
  }
  function restoreStudentPage(){
    if(state.role!=='student')return;
    const key=location.hash.slice(1)||'overview',nav=document.querySelector('#studentResult .student-tabbar'),button=[...(nav?.querySelectorAll('[data-student-tab]')||[])].find(n=>n.dataset.studentTab===key);
    if(button&&!button.classList.contains('active')){state.restoringPage=true;try{button.click();}finally{state.restoringPage=false;}}
  }

  function openAccess(){const dialog=document.getElementById('accountAccessDialog');if(!dialog)return;const access=dialog.querySelector('.portal-access-switch');if(access)access.open=true;dialog.showModal();}
  async function signOut(){
    if(state.signingOut)return;state.signingOut=true;
    if(state.role==='student')await window.MFCloud?.unregisterStudentPushToken?.(state.code).catch(()=>{});
    window.MFCloud?.clearPortalSession?.(state.code,state.role);
    try{for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(/student|parent|exam|portal/i.test(key))sessionStorage.removeItem(key);}}catch(_){}
    inboxes.clear();examCache.clear();location.replace(state.role==='parent'?'parent.html':'student.html');
  }
  function sidebar(nav,student,role){
    const aside=document.createElement('aside');aside.className='account-sidebar';aside.setAttribute('aria-label',role==='parent'?'حساب ولي الأمر':'حساب الطالب');
    aside.innerHTML='<div class="account-brand-slot"></div><div class="account-sidebar-identity"><span class="account-avatar">'+esc(String(student.name||'ط').charAt(0))+'</span><div><strong>'+esc(student.name||'الطالب')+'</strong><small>'+esc(role==='parent'?'ولي أمر الطالب':student.grade||'حساب الطالب')+'</small></div></div>';
    nav.before(aside);aside.append(nav);
    const account=document.createElement('button');account.type='button';account.className='account-sidebar-access';account.innerHTML=icon('user')+'الحساب وتغيير الكود';account.onclick=openAccess;account.id='accountAccessButton';aside.append(account);
    const note=document.createElement('small');note.className='account-sidebar-note';note.textContent='تعلّم كل يوم، وطبّق ما تتعلّمه.';aside.append(note);
    return aside;
  }
  function selectStudentTab(key){const button=document.querySelector('[data-student-tab="'+key+'"]');button?.click();}
  let activityFocusCleanup=()=>{};
  function openActivity(tab,id){
    if(!['homework','exams'].includes(tab)||!id)return;
    if(window.protectedStudentWorkOpen?.()){window.toast?.('كمّل الامتحان أو الواجب المفتوح الأول.');return;}
    activityFocusCleanup();const code=state.code;selectStudentTab(tab);
    const panel=document.querySelector('[data-student-panel="'+tab+'"]');if(!panel)return;
    let observer,timer;const stop=()=>{observer?.disconnect();clearTimeout(timer);};activityFocusCleanup=stop;
    const focus=()=>{if(state.code!==code||state.role!=='student'){stop();return true;}const target=[...panel.querySelectorAll(tab==='homework'?'[data-assignment-id]':'[data-exam-id]')].find(node=>(node.dataset.assignmentId||node.dataset.examId)===id);if(!target)return false;stop();const card=target.closest('.student-assignment-card,.exam-portal-card')||target;if(card.tagName==='DETAILS')card.open=true;card.scrollIntoView({block:'center'});card.setAttribute('tabindex','-1');card.focus({preventScroll:true});return true;};
    requestAnimationFrame(()=>{if(!focus()){observer=new MutationObserver(focus);observer.observe(panel,{childList:true,subtree:true});timer=setTimeout(stop,10000);}});
  }
  function mountStudent(box,student){
    document.body.classList.remove('student-menu-open');document.querySelector('.account-menu-button')?.setAttribute('aria-expanded','false');
    const nav=box.querySelector('.student-tabbar');if(!nav)return;
    const dashboard=box.querySelector('.student-app-dashboard');if(dashboard.dataset.accountMounted)return;dashboard.dataset.accountMounted='true';
    const workspace=box.querySelector('.student-dashboard-content');workspace.prepend(workspace.querySelector('.student-app-header'),workspace.querySelector('.student-kpi-grid'));
    const widgets=workspace.querySelector('.student-dashboard-widgets');if(widgets?.children.length===2)widgets.prepend(widgets.lastElementChild);
    box.querySelector('.student-qr-details>summary')?.setAttribute('aria-label','عرض QR الحضور');
    box.querySelector('.student-dashboard-logo')?.remove();
    const previousCode=state.code;
    const layout=box.querySelector('.student-dashboard-layout');sidebar(nav,student,'student');layout.classList.add('account-layout');
    dashboard.dataset.studentView='overview';
    const crumb=document.createElement('nav');crumb.className='student-page-breadcrumb';crumb.setAttribute('aria-label','مسار الصفحة');crumb.hidden=true;crumb.innerHTML='<button type="button">الرئيسية</button><span></span>';crumb.firstChild.onclick=()=>selectStudentTab('overview');workspace.prepend(crumb);
    const overview=workspace.querySelector('[data-student-panel="overview"]'),extra=document.createElement('details');extra.className='student-home-details';extra.innerHTML='<summary>سجلك وأدوات التعلم والتفاصيل</summary><div></div>';
    const resources=overview.querySelector('.student-quick-links');if(resources){resources.setAttribute('aria-label','أقسامك الدراسية — بنفس حساب الطالب');}
    const continuing=overview.querySelector('.continue-learning-card');if(continuing)overview.querySelector('.student-dashboard-widgets')?.after(continuing);
    [...overview.children].filter(n=>n!==continuing&&n!==resources&&!n.classList.contains('student-dashboard-widgets')).forEach(n=>extra.lastChild.append(n));overview.append(extra);overview.prepend(...[widgets,continuing,resources].filter(node=>node&&node.parentElement===overview));
    const activity=overview.querySelector('.student-dashboard-widgets .student-dashboard-widget:last-child');if(activity)extra.lastChild.prepend(activity);
    const secondary=workspace.querySelector('.student-secondary-kpis');if(secondary)extra.lastChild.prepend(secondary);
    const exit=document.createElement('button');exit.type='button';exit.className='account-sidebar-access student-sidebar-signout';exit.textContent='تسجيل الخروج';exit.onclick=signOut;nav.closest('.account-sidebar').append(exit);
    nav.addEventListener('click',e=>{const button=e.target.closest('[data-student-tab]');if(button)studentPage(button.dataset.studentTab);});
    requestAnimationFrame(restoreStudentPage);
    chrome('student',student);
    if(previousCode&&previousCode!==state.code)inboxes.delete(previousCode);
    const pending=student.accessStatus==='pending'||student.active===false;
    if(!pending){paintInbox(student);loadInbox(student).catch(()=>{});restoreStudentPush(student);} // One cached inbox read supplies the requested account notification badge.
    if(!pending)window.TMStudentCurriculum?.setStudent?.(student);
    box.querySelectorAll('[data-continue-lecture]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();try{sessionStorage.setItem('tm-theory-focus',link.dataset.continueLecture||'');}catch(_){}selectStudentTab('lectures');}));
    window.__tmPlaceMobileTools?.();
  }
  function parentBlocks(root){
    const groups=[
      ['overview','.parent-report-overview-v72,.parent-report-kpis-v70'],
      ['attendance','.parent-report-attendance-v72'],
      ['exams','.parent-report-section-v70.academic'],
      ['homework','.parent-report-section-v70.homework'],
      ['progress','.parent-report-facts-v71'],
      ['payments','.parent-account-payment'],
      ['evaluation','.parent-report-feedback-v7002'],
      ['followup','.parent-report-followup-v71'],
      ['notes','.parent-report-data-note-v71']
    ];
    groups.forEach(([key,selector])=>root.querySelectorAll(selector).forEach((node,i)=>{node.dataset.parentBlock=node.dataset.parentBlock||key;node.dataset.parentBlocks=[...(new Set([...(node.dataset.parentBlocks||'').split(' ').filter(Boolean),key]))].join(' ');node.id=node.id||'parent-'+key+(i?'-'+i:'');}));
  }
  function showParent(key,scroll=true){
    if(!['overview','report','attendance','exams','homework','progress','payments','evaluation','followup','notes'].includes(key))return;
    state.parentView=key;const root=document.getElementById('parentMonthlyReport');if(!root)return;root.dataset.parentView=key;
    if(scroll&&innerWidth<=700){const actions=root.querySelector('.parent-report-actions');if(actions)actions.open=false;}
    root.querySelectorAll('[data-parent-block]').forEach(node=>{const keys=(node.dataset.parentBlocks||node.dataset.parentBlock).split(' ');node.hidden=key==='report'?false:key==='overview'?!keys.some(value=>['overview','payments','followup'].includes(value)):!keys.includes(key);});
    root.querySelectorAll('[data-parent-section]').forEach(b=>{b.classList.toggle('active',b.dataset.parentSection===key);b.setAttribute('aria-current',b.dataset.parentSection===key?'page':'false');});
    const details=root.querySelector('.parent-report-data-note-v71');if(key==='notes'&&details)details.open=true;
    if(scroll&&innerWidth<=700)root.querySelector('.parent-report-header-v72')?.scrollIntoView({block:'start',behavior:'auto'});
  }
  function mountParent(report){
    const root=document.getElementById('parentMonthlyReport');if(!root||root.dataset.accountMounted)return;root.dataset.accountMounted='true';
    const student=report.student||{},oldCode=state.code;if(oldCode&&oldCode!==student.studentCode)state.parentView='overview';
    const nav=document.createElement('nav');nav.className='parent-tabbar';nav.setAttribute('aria-label','أقسام متابعة ولي الأمر');
    const sections=[['overview','home','الرئيسية'],['report','file-text','التقرير الشهري'],['attendance','calendar','الحضور'],['exams','clipboard','الاختبارات'],['homework','file-text','الواجبات'],['progress','star','التحفيز والتقدم'],['payments','database','الدفع'],['evaluation','bar-chart','التقييم الشهري'],['followup','user-check','المتابعة'],['notes','info','الملاحظات واكتمال البيانات']];
    nav.innerHTML=sections.map(([key,glyph,label])=>'<button type="button" data-parent-section="'+key+'">'+icon(glyph)+'<span>'+label+'</span></button>').join('');
    root.prepend(nav);sidebar(nav,student,'parent');
    const workspace=document.createElement('div');workspace.className='parent-account-workspace';root.append(workspace);
    const article=root.querySelector('article.parent-report-sheet-v70'),toolbar=root.querySelector('.parent-report-toolbar-v70');workspace.append(article);
    const reportHeader=article.querySelector('.parent-report-header-v72');reportHeader.after(toolbar);
    const picture=reportHeader.querySelector('img');if(picture){const avatar=document.createElement('span');avatar.className='account-avatar';avatar.textContent=String(student.name||'ط').charAt(0);picture.replaceWith(avatar);}
    const buttons=toolbar.querySelector(':scope>div');if(buttons){const actions=document.createElement('details');actions.className='parent-report-actions';actions.open=innerWidth>700;actions.innerHTML='<summary>إجراءات التقرير</summary>';buttons.before(actions);actions.append(buttons);}

    const kpis=root.querySelector('.parent-report-kpis-v70');
    if(kpis&&kpis.children.length===8){
      const cards=[...kpis.children];[cards[0],cards[1],cards[2],cards[7],cards[3],cards[4],cards[5],cards[6]].forEach(node=>kpis.append(node));
      const extra=document.createElement('details');extra.className='parent-secondary-metrics';extra.innerHTML='<summary>باقي مؤشرات التقدّم الشهري</summary><div></div>';[...kpis.children].slice(4).forEach(node=>extra.lastChild.append(node));kpis.append(extra);
    }
    const facts=root.querySelector('.parent-report-facts-v71'),payment=facts?.children[2];
    if(payment){const section=document.createElement('section');section.className='parent-account-payment parent-report-section-v70';const heading=document.createElement('h3');heading.textContent='حالة الدفع';section.append(heading,payment);kpis?.after(section);}
    if(report.attendance?.consecutiveAbsenceWarning){const alert=document.createElement('p');alert.className='parent-account-warning';alert.setAttribute('role','status');alert.textContent='تنبيه: يوجد غياب متكرر يحتاج متابعة.';reportHeader.after(alert);}
    parentBlocks(root);nav.querySelectorAll('button').forEach(button=>button.onclick=()=>showParent(button.dataset.parentSection));
    chrome('parent',student);showParent(state.parentView,false);window.__tmPlaceMobileTools?.();window.hydrateIcons?.(nav);
  }
  function virtualRead(id){
    try{return Number(localStorage.getItem('tm-account-payment-read:'+id))||null;}catch(_){return null;}
  }
  function mergedRows(student){
    const cached=inboxes.get(String(student.studentCode)),stored=cached?.rows||[],refs=new Set(stored.filter(r=>r.contentRef).map(r=>r.contentRef.collection+':'+r.contentRef.id)),rows=[...stored,...(window.TMAccountDomain?.academicAlerts?.(student,{curriculum:window.TMStudentCurriculum?.getLoaded?.(),exams:student.accountExams})||[]).filter(r=>!r.contentRef||!refs.has(r.contentRef.collection+':'+r.contentRef.id)).map(row=>({...row,readAt:virtualRead(row.id)}))],alert=window.TMAccountDomain?.paymentAlert(student,student.monthlyReport);
    if(alert)rows.unshift({...alert,readAt:virtualRead(alert.id)});
    return [...new Map(rows.map(row=>[row.id,row])).values()].sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  }
  function paintInbox(student){
    if(state.role!=='student'||String(student.studentCode)!==state.code)return;
    if(state.code!==String(student.studentCode))return;
    const record=inboxes.get(state.code),rows=mergedRows(student),unread=rows.filter(r=>!r.readAt).length;
    const badge=document.querySelector('[data-notification-badge]');if(badge){badge.hidden=!unread;badge.textContent=String(unread);badge.parentElement.setAttribute('aria-label','الإشعارات، '+unread+' غير مقروء في القائمة الحالية');}
    const box=document.getElementById('studentAccountInbox');if(!box)return;
    const date=v=>v?new Intl.DateTimeFormat('ar-EG',{timeZone:'Africa/Cairo',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'';
    box.innerHTML='<div class="account-inbox-toolbar"><p>كل جديد يخص تعلّمك ومتابعتك.</p><button class="btn ghost small" type="button" data-inbox-refresh>تحديث الإشعارات</button></div>'+(record?.error?'<p class="account-inline-error" role="alert">'+esc(record.error)+'</p>':'')+'<div class="account-notification-list">'+(rows.map(row=>'<article class="account-notification '+(!row.readAt?'unread':'')+' '+(row.priority==='important'?'important':'')+'" data-notification-id="'+esc(row.id)+'"><span class="account-notification-icon">'+icon({HOMEWORK:'file-text',EXAM:'clipboard',LECTURE:'book-open',ATTENDANCE:'calendar',PAYMENT:'database',GENERAL:'bell'}[row.type]||'bell')+'</span><div><small>'+esc(({HOMEWORK:'واجب',EXAM:'اختبار',LECTURE:'محاضرة',ATTENDANCE:'حضور',PAYMENT:'دفع',GENERAL:'عام'}[row.type]||'إشعار')+' · '+date(row.createdAt))+(row.readAt?' · مقروء':' · جديد')+'</small><h3>'+esc(row.title)+'</h3><p>'+esc(row.body)+'</p><div class="account-notification-actions"><button class="small-btn primary" type="button" data-notification-open="'+esc(row.id)+'">فتح القسم</button><button class="small-btn" type="button" data-notification-read="'+esc(row.id)+'">'+(row.readAt?'تعليم كغير مقروء':'تعليم كمقروء')+'</button></div></div></article>').join('')||'<div class="portal-empty"><h3>'+(record?.loading?'جاري تحميل الإشعارات…':'لا توجد إشعارات حاليًا')+'</h3><p>الإشعارات الجديدة من المدرس هتظهر هنا. حدّث القائمة للاطلاع على الجديد.</p></div>')+'</div>'+(record?.hasMore?'<button class="btn ghost" type="button" data-inbox-more>تحميل إشعارات أقدم</button>':'');
    box.querySelector('[data-inbox-refresh]').onclick=()=>loadInbox(student,{refresh:true}).catch(()=>{});
    paintPushControls(box,student);
    box.querySelector('[data-inbox-more]')?.addEventListener('click',()=>loadInbox(student,{append:true}).catch(()=>{}));
    box.querySelectorAll('[data-notification-open],[data-notification-read]').forEach(button=>button.onclick=async()=>{
      const id=button.dataset.notificationOpen||button.dataset.notificationRead,row=rows.find(item=>item.id===id);if(!row)return;
      button.disabled=true;try{
        const read=button.dataset.notificationOpen?true:!row.readAt;let readAt;
        if(row.virtual){readAt=read?Date.now():null;try{if(read)localStorage.setItem('tm-account-payment-read:'+id,String(readAt));else localStorage.removeItem('tm-account-payment-read:'+id);}catch(_){}}
        else{const result=await window.MFCloud.setStudentAccountNotificationRead(state.code,id,read);readAt=result.readAt;const item=record.rows.find(n=>n.id===id);if(item)item.readAt=readAt;}
        paintInbox(student);if(button.dataset.notificationOpen){const ref=row.contentRef;if(ref&&row.actionTab==='lectures')try{sessionStorage.setItem('tm-theory-focus',ref.lectureId||ref.id);}catch(_){}selectStudentTab(row.actionTab||'overview');}
      }catch(error){window.toast?.(error?.message||'تعذر تحديث الإشعار.');button.disabled=false;}
    });
    window.hydrateIcons?.(box);
  }
  const restoredPush=new Set();
  function restoreStudentPush(student){
    if(restoredPush.has(student.studentCode)||window.MFCloud?.studentPushStatus?.(student.studentCode)!=='enabled')return;
    restoredPush.add(student.studentCode);window.MFCloud.registerStudentPushToken(student.studentCode,{restore:true}).catch(()=>{});
  }
  function paintPushControls(box,student){
    const status=window.MFCloud?.studentPushStatus?.(student.studentCode)||'unsupported',area=document.createElement('section');area.className='account-push-controls';
    const text=status==='local-preview'?'تجربة المحاكي: الإشعارات داخل الحساب تعمل. إشعارات الموبايل تتطلب النسخة المنشورة.':status==='unsupported'?'المتصفح الحالي لا يدعم إشعارات الموبايل.':status==='denied'?'الإشعارات مقفولة من إعدادات المتصفح. تقدر تسمح بيها من إعدادات الموقع.':'استقبل تنبيه بالجديد المخصص لصفك ومجموعتك، حتى والموقع مقفول، بإذنك.';
    area.innerHTML='<div><strong>إشعارات الموبايل</strong><p>'+esc(text)+'</p></div><button type="button" class="small-btn" data-student-push-toggle '+(['local-preview','unsupported','denied'].includes(status)?'disabled':'')+'>'+(status==='enabled'?'إيقاف إشعارات هذا الجهاز':'تفعيل إشعارات الموبايل')+'</button><p role="status" data-push-feedback></p>';
    box.querySelector('.account-inbox-toolbar')?.after(area);area.querySelector('button').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{if(status==='enabled')await window.MFCloud.unregisterStudentPushToken(student.studentCode);else await window.MFCloud.registerStudentPushToken(student.studentCode);paintInbox(student);}catch(error){area.querySelector('[data-push-feedback]').textContent=error.message;button.disabled=false;}};
  }
  async function loadInbox(student,options={}){
    const code=String(student.studentCode),existing=inboxes.get(code);
    if(existing?.promise)return existing.promise;
    if(existing?.loaded&&!options.refresh&&!options.append){paintInbox(student);return existing;}
    const record=existing||{rows:[],loaded:false};record.loading=true;record.error='';inboxes.set(code,record);paintInbox(student);
    record.promise=(async()=>{
      try{
        if(!window.MFCloud?.getStudentAccountNotifications)throw new Error('خدمة إشعارات الحساب غير متاحة حاليًا.');
        const result=await window.MFCloud.getStudentAccountNotifications(code,{cursor:options.append?record.cursor:null});
        record.rows=[...new Map([...(options.append?record.rows:[]),...(result.rows||[])].map(row=>[row.id,row])).values()];record.hasMore=result.hasMore===true;record.cursor=result.nextCursor;record.loaded=true;record.loadedAt=Date.now();
      }catch(error){record.error=error?.message||'تعذر تحميل الإشعارات. حاول التحديث.';}
      finally{record.loading=false;record.promise=null;paintInbox(student);}
      return record;
    })();
    return record.promise;
  }
  async function loadExams(student){
    const box=document.getElementById('examStudentResult');if(!box)return;
    const code=String(student.studentCode);
    if(!document.getElementById('examOverlay')){const overlay=document.createElement('div');overlay.className='exam-overlay';overlay.id='examOverlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','examDialogTitle');overlay.setAttribute('aria-hidden','true');overlay.innerHTML='<div class="exam-box card" id="examBox"></div>';document.body.append(overlay);}
    box.innerHTML='<div class="portal-loading" role="status">جاري تحميل اختباراتك…</div>';
    try{
      let pending=examCache.get(code);
      if(pending&&Date.now()>=(pending.expiresAt||0)){examCache.delete(code);pending=null;}
      if(!pending){pending=Promise.resolve(window.MFCloud.getExamDashboard(code)).catch(error=>{examCache.delete(code);throw error;});pending.expiresAt=Date.now()+5*60*1000;examCache.set(code,pending);}
      const data=await pending;if(state.code!==code||!box.isConnected)return;
      student.accountExams=data.exams||[];paintInbox(student);window.renderExamPortal(data.student,data.exams||[]);
    }catch(error){if(box.isConnected){box.innerHTML='<div class="portal-empty" role="alert"><h3>تعذر تحميل الاختبارات</h3><p>'+esc(error?.message||'حاول مرة أخرى.')+'</p><button class="btn ghost" type="button">إعادة المحاولة</button></div>';box.querySelector('button').onclick=()=>loadExams(student);}}
  }

  function rememberExams(student,exams){
    const times=(exams||[]).flatMap(exam=>[Date.parse(exam.openAt||''),Date.parse(exam.closeAt||'')]).filter(time=>Number.isFinite(time)&&time>Date.now());
    const promise=Promise.resolve({student,exams});promise.expiresAt=Math.min(Date.now()+5*60*1000,...times);
    examCache.set(String(student.studentCode),promise);
  }
  let curriculumBoot=null;
  async function curriculum(student){
    if(!curriculumBoot)curriculumBoot=(async()=>{
      await window.loadLazyScript('learning-progress','assets/learning-progress.js?v='+window.MF_ASSET_VERSION,()=>!!window.TMLearningProgress);
      await window.loadLazyScript('curriculum-student','assets/curriculum-student.js?v='+window.MF_ASSET_VERSION,()=>!!window.TMStudentCurriculum);
    })().catch(error=>{curriculumBoot=null;throw error;});
    await curriculumBoot;if(state.code!==String(student.studentCode))return;
    window.TMStudentCurriculum.setStudent(student);window.TMStudentCurriculum.show(student.studentCode);
  }
  function refreshAlerts(){if(state.role==='student'&&state.student)paintInbox(state.student);}
  function onTab(key,student){
    studentPage(key,{history:!state.restoringPage});
    if(key==='notifications')loadInbox(student).catch(()=>{});
    if(key==='exams')loadExams(student);
    if(key==='lectures')curriculum(student).catch(error=>{const host=document.querySelector('[data-account-lecture-host]');if(host){host.innerHTML='<p role="alert"></p><button type="button" class="btn ghost">إعادة المحاولة</button>';host.querySelector('p').textContent=error.message;host.querySelector('button').onclick=()=>onTab(key,student);}});
    refreshAlerts();document.dispatchEvent(new CustomEvent('technominds:student-tab',{detail:{key,code:student.studentCode}}));
  }
  window.addEventListener('resize',arrange,{passive:true});
  window.addEventListener('popstate',restoreStudentPage);
  window.addEventListener('hashchange',restoreStudentPage);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAlerts();});
  function refreshCurrentInbox(){const existing=inboxes.get(state.code);if(state.role==='student'&&state.student&&!document.hidden&&Date.now()-Number(existing?.loadedAt||0)>60000)loadInbox(state.student,{refresh:true}).catch(()=>{});}
  window.addEventListener('focus',refreshCurrentInbox);document.addEventListener('visibilitychange',refreshCurrentInbox);
  navigator.serviceWorker?.addEventListener?.('message',event=>{if(event.data?.type==='TM_STUDENT_NOTIFICATION_OPEN'&&event.data.studentCode===state.code&&state.role==='student'){if(window.protectedStudentWorkOpen?.())window.toast?.('الإشعار محفوظ. كمّل الامتحان أو الواجب المفتوح الأول.');else selectStudentTab(event.data.actionTab||'notifications');}if(event.data?.type==='TM_STUDENT_CONTENT_NEW'&&event.data.studentCode===state.code&&state.role==='student')loadInbox(state.student,{refresh:true}).catch(()=>{});});
  window.TMAccount={mountStudent,mountParent,onTab,openAccess,rememberExams,refreshAlerts,openActivity};
})();

