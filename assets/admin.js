'use strict';

let adminData = typeof loadData === 'function' ? loadData() : {students:[],bookings:[],materials:[],questions:[],exams:[],examAttempts:[],reviews:[],groups:[],assignments:[],settings:{}};
let currentSection = 'overview';
let currentStaff = null;
let qrScanner = null;
let attendanceDate = new Date().toISOString().slice(0,10);

const adminSections = [
  ['overview','bar-chart','الرئيسية'],
  ['students','users','الطلاب'],
  ['bookings','calendar','التسجيلات'],
  ['groups','users','المجموعات'],
  ['attendance','qr','الحضور والغياب'],
  ['payments','database','الدفع'],
  ['exams','clipboard','الاختبارات'],
  ['materials','book-open','Materials والتدريبات'],
  ['reviews','star','التقييمات'],
  ['settings','sparkles','الإعدادات']
];

function aToast(msg){const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2800);}
function safe(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function fresh(){adminData=typeof loadData==='function'?loadData():adminData; ensureCollections();}
function ensureCollections(){['students','bookings','materials','questions','exams','examAttempts','grades','reviews','groups','assignments'].forEach(k=>{if(!Array.isArray(adminData[k]))adminData[k]=[];}); adminData.settings=adminData.settings||{};}
function persist(msg){ensureCollections(); saveData(adminData); if(window.MFCloud?.saveSiteData) window.MFCloud.saveSiteData(adminData).catch(()=>aToast('تم الحفظ محليًا، وتعذرت مزامنة قاعدة البيانات')); if(msg)aToast(msg);}
function phoneDigits(v){return String(v||'').replace(/\D/g,'');}
function isoDateAdmin(d=new Date()){return d.toISOString().slice(0,10);}
function timeNow(){return new Date().toLocaleTimeString('ar-EG',{hour:'numeric',minute:'2-digit'});}
function newStudentCode(){let code; do{code=`ST-${Math.floor(1000+Math.random()*9000)}`;}while(adminData.students.some(s=>(s.studentCode||s.code)===code)); return code;}
function adminWhatsAppPhone(v){const d=phoneDigits(v); if(!d) return ''; if(d.startsWith('20')) return d; if(d.startsWith('0')) return '2'+d; return d;}
function monthlyReportTextForStudent(st){const s=normalizeStudent(st); if(typeof parentReportText==='function') return parentReportText(s); const c=calcStudentAdmin(s); return `تقرير متابعة مستوى ${s.month||''}\n\nالطالب: ${s.name}\nالكود: ${s.studentCode}\nالمستوى الدراسي: ${s.grade||'-'}\nالمجموعة: ${s.group||'-'}\n\nالمستوى العام: ${c.final||0}%\nنسبة الحضور: ${c.attendancePct||0}%\nمتوسط الدرجات: ${c.avg||0}%\nحالة الدفع: ${s.paid?'تم الدفع':'لم يدفع'}\n\nملاحظات الإدارة:\n${s.notes||'لا توجد ملاحظات حالية.'}`;}
function stCode(st){return st.studentCode||st.code||st.id||'';}
function stName(st){return st.studentName||st.name||'';}
function normalizeStudent(st){const code=stCode(st); return {...st,id:code,code,studentCode:code,name:stName(st),studentName:stName(st)};}

function normalizeGroup(g){const id=String(g?.id||g?.code||g?.name||'').trim(); return {...(g||{}),id,name:g?.name||g?.title||'',schedule:g?.schedule||'',mode:g?.mode||'اونلاين وأوفلاين',capacity:Number(g?.capacity||0),status:g?.status||'open',notes:g?.notes||''};}
function groupIdValue(g){return String(g?.id||g?.code||g?.name||'').trim();}
function groupStudentCount(group){const g=normalizeGroup(group); return (adminData.students||[]).filter(s=>normalizeText(s.groupId||s.group)===normalizeText(g.id)||normalizeText(s.group)===normalizeText(g.name)).length;}
function groupPendingCount(group){const g=normalizeGroup(group); return (adminData.bookings||[]).filter(b=>normalizeText(b.groupId||b.group)===normalizeText(g.id)||normalizeText(b.group)===normalizeText(g.name)).length;}
function groupIsFull(group){const g=normalizeGroup(group); const cap=Number(g.capacity||0); return cap>0 && groupStudentCount(g)>=cap;}
function groupOptions(){const base=['مجموعة اونلاين 1','مجموعة اونلاين 2','مجموعة اونلاين 3','اونلاين Zoom']; const data=[...(adminData.groups||[]).map(g=>normalizeGroup(g).name),...(adminData.students||[]).map(s=>s.group)].filter(Boolean); return [...new Set([...base,...data])];}

function calcStudentAdmin(st){const c=typeof calcStudent==='function'?calcStudent(st):{attendancePct:0,avg:0,final:0,level:'-'}; return c;}
function badgeStatus(v){return v===true||v==='present'||v==='حاضر'||v==='تم الدفع'?'good':v===false||v==='absent'||v==='غائب'||v==='لم يدفع'?'danger':'warn';}
function content(html){const el=document.getElementById('adminContent'); if(el) el.innerHTML=`<section class="admin-section active">${html}</section>`; hydrateIcons();}
function selectedGrade(){return document.getElementById('attendanceGrade')?.value || 'all';}
function selectedGroup(){return document.getElementById('attendanceGroup')?.value || 'all';}
function filterStudents(grade='all', group='all'){return (adminData.students||[]).map(normalizeStudent).filter(s=>(grade==='all'||s.grade===grade)&&(group==='all'||s.group===group));}

async function cloudDelete(collection,id){try{if(window.MFCloud?.deleteDocument) await window.MFCloud.deleteDocument(collection,id);}catch(e){}}
async function reloadFromCloud(){
  if(!window.MFCloud?.loadSiteData) return;
  const data = await window.MFCloud.loadSiteData();
  if(data){ adminData = mergeData(data); saveData(adminData); }
}

function unauthorized(message='غير مصرح لك بالدخول.'){
  const root=document.getElementById('adminRoot');
  root.className='login-page';
  root.innerHTML=`<div class="card login-card"><div class="logo"><span class="logo-mark" data-icon="code"></span><span>تيكنو مايندز <small>صفحة إدارة Techno Minds</small></span></div><h1 class="section-title" style="font-size:2rem;margin:22px 0 8px">${safe(message)}</h1><p class="section-desc">هذه اللوحة تعمل بحسابات قاعدة البيانات المصرح لها فقط.</p><button class="btn ghost" onclick="location.reload()">رجوع لتسجيل الدخول</button></div>`;
  hydrateIcons();
}

function adminLogin(){
  const form=document.getElementById('loginForm'); if(!form) return;
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=form.email.value.trim(); const pass=form.password.value;
    if(!window.MFCloud?.ready || !window.MFCloud.signIn) return aToast('قاعدة البيانات غير مفعل، لا يمكن فتح لوحة الإدارة.');
    try{
      await window.MFCloud.signIn(email,pass);
      currentStaff = await window.MFCloud.getCurrentStaffProfile();
      if(!currentStaff?.allowed){ await window.MFCloud.signOut?.(); unauthorized('غير مصرح لك بالدخول.'); return; }
      await reloadFromCloud();
      renderAdmin();
      aToast('تم الدخول إلى لوحة الإدارة');
    }catch(err){ aToast('بيانات الدخول غير صحيحة أو الحساب غير مصرح له'); }
  });
}

async function tryRestoreSession(){
  if(!window.MFCloud?.auth?.onAuthStateChanged) return;
  window.MFCloud.auth.onAuthStateChanged(async user=>{
    if(!user || document.querySelector('.admin-page')) return;
    try{
      currentStaff = await window.MFCloud.getCurrentStaffProfile();
      if(currentStaff?.allowed){ await reloadFromCloud(); renderAdmin(); }
    }catch(e){}
  });
}

function renderAdmin(){
  fresh();
  const root=document.getElementById('adminRoot');
  root.className='admin-page admin-page-v37';
  root.innerHTML=`<aside class="admin-sidebar"><div class="logo"><span class="logo-mark" data-icon="code"></span><span>لوحة Techno Minds <small>حساب ${safe(currentStaff?.role||'staff')}</small></span></div><div class="admin-nav">${adminSections.map(([id,ic,name])=>`<button data-admin-nav="${id}" class="${id===currentSection?'active':''}"><span data-icon="${ic}"></span>${name}</button>`).join('')}</div><div style="margin-top:20px"><button class="btn ghost" style="width:100%" onclick="location.href='index.html'"><span data-icon="external-link"></span> معاينة الموقع</button></div></aside><main class="admin-main"><div class="admin-top"><div><span class="kicker"><span data-icon="sparkles"></span> لوحة الإدارة</span><h1 class="section-title" style="font-size:2.1rem">لوحة تحكم Techno Minds</h1></div><div class="header-actions"><button class="theme-toggle" id="themeToggleAdmin"></button><button class="btn ghost" onclick="forceFirestoreSync()"><span data-icon="database"></span> مزامنة قاعدة البيانات</button><button class="btn dark" onclick="adminLogout()">خروج</button></div></div><div id="adminContent"></div></main>`;
  setupTheme(); bindNav(); renderSection(); hydrateIcons();
}

function bindNav(){document.querySelectorAll('[data-admin-nav]').forEach(btn=>{btn.onclick=()=>{currentSection=btn.dataset.adminNav; document.querySelectorAll('[data-admin-nav]').forEach(b=>b.classList.toggle('active',b===btn)); renderSection();};});}
window.adminLogout=async function(){try{await window.MFCloud?.signOut?.();}catch(e){} location.reload();};
window.forceFirestoreSync=async function(){try{persist(); await window.MFCloud?.saveSiteData?.(adminData); aToast('تمت مزامنة البيانات مع قاعدة البيانات');}catch(e){aToast('تعذرت المزامنة، راجع Firestore Rules');}};

function stats(){fresh(); const today=isoDateAdmin(); const att=(adminData.students||[]).filter(s=>(s.attendance||[]).some(a=>String(a.date)===today&&a.status==='present')).length; return {students:adminData.students.length,bookings:adminData.bookings.length,unpaid:adminData.students.filter(s=>!s.paid).length,att};}
function renderOverview(){const s=stats(); content(`<div class="section-head"><div><span class="kicker"><span data-icon="bar-chart"></span> ملخص Techno Minds</span><h2 class="section-title">جاهزية الموقع للتشغيل الحقيقي</h2><p class="section-desc">لا توجد بيانات تجريبية، وكل بيانات الطلاب والحضور مرتبطة بالحفظ والمزامنة.</p></div></div><div class="grid grid-4"><div class="card"><h3>الطلاب</h3><b class="big-num">${s.students}</b></div><div class="card"><h3>التسجيلات</h3><b class="big-num">${s.bookings}</b></div><div class="card"><h3>لم يدفع</h3><b class="big-num">${s.unpaid}</b></div><div class="card"><h3>حضور اليوم</h3><b class="big-num">${s.att}</b></div></div><div class="grid grid-2" style="margin-top:18px"><div class="card"><h3>اختصارات سريعة</h3><div class="admin-task-grid-v37"><button class="btn primary" onclick="currentSection='attendance'; renderAdmin()"><span data-icon="qr"></span> فتح ماسح باركود</button><button class="btn ghost" onclick="currentSection='students'; renderAdmin()"><span data-icon="users"></span> إدارة الطلاب</button><button class="btn ghost" onclick="currentSection='bookings'; renderAdmin()"><span data-icon="calendar"></span> مراجعة التسجيلات</button></div></div><div class="card"><h3>تنبيه أمان</h3><p class="section-desc">لوحة الإدارة لا تفتح إلا لحساب قاعدة البيانات له role: admin أو teacher أو assistant.</p></div></div>`);}

function studentRow(st){const s=normalizeStudent(st), c=calcStudentAdmin(s); return `<tr><td>${safe(s.studentCode)}</td><td>${safe(s.name)}</td><td>${safe(s.grade)}</td><td>${safe(s.group||'-')}</td><td><span class="badge ${badgeStatus(s.paid)}">${s.paid?'تم الدفع':'لم يدفع'}</span></td><td>${c.attendancePct||0}%</td><td>${c.avg||0}%</td><td><div class="pay-row"><button class="small-btn primary" onclick="editStudent('${safe(s.studentCode)}')">تعديل</button><button class="small-btn" onclick="quickPresent('${safe(s.studentCode)}')">حضور</button><button class="small-btn" onclick="printStudentReport('${safe(s.studentCode)}')">تفاصيل</button><button class="small-btn whatsapp-report-btn" onclick="sendParentMonthlyReport('${safe(s.studentCode)}')">واتساب</button><button class="small-btn danger" onclick="deleteStudent('${safe(s.studentCode)}')">حذف</button></div></td></tr>`;}
function studentMobileCards(rows){return `<div class="student-mobile-cards">${rows.map(st=>{const s=normalizeStudent(st); return `<div class="mobile-admin-card"><div><b>${safe(s.name)}</b><small>${safe(s.studentCode)} · ${safe(s.grade)} · ${safe(s.group||'-')}</small></div><span class="badge ${badgeStatus(s.paid)}">${s.paid?'تم الدفع':'لم يدفع'}</span><div class="mobile-actions"><button class="small-btn primary" onclick="editStudent('${safe(s.studentCode)}')">تعديل</button><button class="small-btn" onclick="quickPresent('${safe(s.studentCode)}')">حضور</button><button class="small-btn" onclick="printStudentReport('${safe(s.studentCode)}')">تفاصيل</button><button class="small-btn whatsapp-report-btn" onclick="sendParentMonthlyReport('${safe(s.studentCode)}')">واتساب</button><button class="small-btn danger" onclick="deleteStudent('${safe(s.studentCode)}')">حذف</button></div></div>`;}).join('')||'<p class="section-desc">لا يوجد طلاب.</p>'}</div>`;}
function renderStudents(){fresh(); const rows=adminData.students.map(normalizeStudent); content(`<div class="section-head"><div><span class="kicker"><span data-icon="users"></span> الطلاب</span><h2 class="section-title">بيانات الطلاب والمتابعة</h2><p class="section-desc">من هنا تقدر تبعت تقرير مستوىي لولي الأمر على واتساب بضغطة واحدة.</p></div></div><div class="card monthly-report-help-v38"><h3>تقارير أول المستوى</h3><p>زر واتساب بجوار كل طالب يفتح رسالة جاهزة لولي الأمر فيها الحضور، الدرجات، الدفع، وملاحظات الإدارة.</p></div><div class="card" style="margin-bottom:18px"><form id="addStudentForm" class="grid grid-4"><input name="name" placeholder="اسم الطالب" required><input name="studentPhone" placeholder="رقم الطالب"><input name="parentPhone" placeholder="رقم ولي الأمر" required><select name="grade">${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select><select name="month">${MONTHS.map(m=>`<option>${safe(m)}</option>`).join('')}</select><select name="group">${groupOptions().map(g=>`<option>${safe(g)}</option>`).join('')}</select><textarea name="notes" placeholder="ملاحظات الإدارة"></textarea><button class="btn primary" type="submit"><span data-icon="user"></span> تسجيل طالب</button></form></div><div class="admin-toolbar"><input id="studentSearchAdmin" placeholder="بحث بالكود أو رقم ولي الأمر"><select id="studentGradeAdmin"><option value="all">كل الصفوف</option>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select><select id="studentPayAdmin"><option value="all">كل حالات الدفع</option><option value="paid">تم الدفع</option><option value="unpaid">لم يدفع</option></select><button class="btn ghost" onclick="refreshStudentsTable()"><span data-icon="search"></span> بحث</button></div><div id="studentsTableBox">${studentsTable(rows)}</div>`); document.getElementById('addStudentForm').onsubmit=async e=>{e.preventDefault(); const s=Object.fromEntries(new FormData(e.target).entries()); s.code=s.studentCode=newStudentCode(); s.studentName=s.name; s.paid=false; s.attendance=[]; s.grades=[]; s.homeworks=[]; s.recitations=[]; adminData.students.push(s); persist('تم تسجيل الطالب وإنشاء باركود Code له'); try{await window.MFCloud?.saveStudent?.(s);}catch(err){} renderStudents();}; ['studentSearchAdmin','studentGradeAdmin','studentPayAdmin'].forEach(id=>document.getElementById(id)?.addEventListener('input',refreshStudentsTable));}
function studentsTable(rows){return `${studentMobileCards(rows)}<div class="table-wrap admin-table-desktop"><table><thead><tr><th>الكود</th><th>الطالب</th><th>الصف</th><th>المجموعة</th><th>الدفع</th><th>الحضور</th><th>الدرجات</th><th>إجراء</th></tr></thead><tbody>${rows.map(studentRow).join('')||'<tr><td colspan="8">لا يوجد طلاب</td></tr>'}</tbody></table></div>`;}
window.refreshStudentsTable=function(){let rows=adminData.students.map(normalizeStudent); const q=(document.getElementById('studentSearchAdmin')?.value||'').trim(); const g=document.getElementById('studentGradeAdmin')?.value||'all'; const pay=document.getElementById('studentPayAdmin')?.value||'all'; if(q) rows=rows.filter(s=>[s.studentCode,s.parentPhone,s.studentPhone].some(v=>String(v||'').includes(q))); if(g!=='all') rows=rows.filter(s=>s.grade===g); if(pay==='paid') rows=rows.filter(s=>s.paid); if(pay==='unpaid') rows=rows.filter(s=>!s.paid); document.getElementById('studentsTableBox').innerHTML=studentsTable(rows); hydrateIcons();};
window.editStudent=function(code){const s=adminData.students.find(x=>stCode(x)===code); if(!s)return; const name=prompt('اسم الطالب',stName(s)); if(name===null)return; const parentPhone=prompt('رقم ولي الأمر',s.parentPhone||''); if(parentPhone===null)return; s.name=s.studentName=name; s.parentPhone=parentPhone; s.notes=prompt('ملاحظات الإدارة',s.notes||'')||s.notes||''; persist('تم تحديث بيانات الطالب'); renderStudents();};
window.deleteStudent=async function(code){if(!confirm('حذف الطالب وكل بياناته؟'))return; adminData.students=adminData.students.filter(s=>stCode(s)!==code); persist('تم حذف الطالب'); await Promise.all([cloudDelete('students',code),cloudDelete('student_portal',code)]); renderStudents();};
window.printStudentReport=function(code){const s=adminData.students.find(x=>stCode(x)===code); if(!s)return; const w=window.open('','_blank'); w.document.write(`<html dir="rtl"><head><title>تقرير ${safe(stName(s))}</title><link rel="stylesheet" href="assets/site.css"></head><body><main class="section"><div class="container">${studentProfileHTML(normalizeStudent(s),true)}</div></main></body></html>`); w.document.close();};
window.sendParentMonthlyReport=function(code){const s=adminData.students.find(x=>stCode(x)===code); if(!s)return aToast('لم يتم العثور على الطالب'); const phone=adminWhatsAppPhone(s.parentPhone); if(!phone)return aToast('رقم ولي الأمر غير موجود'); window.open(whatsappLink(phone, monthlyReportTextForStudent(s)),'_blank');};
window.copyParentMonthlyReport=function(code){const s=adminData.students.find(x=>stCode(x)===code); if(!s)return aToast('لم يتم العثور على الطالب'); navigator.clipboard?.writeText(monthlyReportTextForStudent(s)).then(()=>aToast('تم نسخ التقرير')).catch(()=>aToast('تعذر النسخ'));};


function renderGroups(){
  fresh();
  const rows=(adminData.groups||[]).map(normalizeGroup);
  content(`<div class="section-head"><div><span class="kicker"><span data-icon="users"></span> المجموعات</span><h2 class="section-title">إدارة المجموعات والمواعيد</h2><p class="section-desc">أنشئ مجموعة وحدد موعدها والعدد المسموح. لو العدد اكتمل هتظهر للطالب كمجموعة مكتملة ومش هيقدر يحجز فيها.</p></div><button class="btn primary" onclick="openGroupModal()"><span data-icon="plus"></span> إنشاء مجموعة</button></div><div class="card"><div class="table-wrap admin-table-desktop"><table><thead><tr><th>المجموعة</th><th>المواعيد</th><th>الحضور</th><th>العدد</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${rows.map(groupRow).join('')||'<tr><td colspan="6">لا توجد مجموعات بعد</td></tr>'}</tbody></table></div><div class="mobile-card-table">${rows.map(groupCard).join('')||'<p class="section-desc">لا توجد مجموعات بعد.</p>'}</div></div><div id="groupModal" class="admin-modal" hidden><div class="card admin-modal-card"><div class="profile-top"><h3 id="groupModalTitle">إنشاء مجموعة</h3><button class="small-btn danger" onclick="closeGroupModal()">إغلاق</button></div><form id="groupForm" class="grid grid-2"><input type="hidden" name="id"><div class="field"><label>اسم المجموعة</label><input name="name" placeholder="مثال: مجموعة السبت والثلاثاء" required></div><div class="field"><label>المواعيد</label><input name="schedule" placeholder="السبت والثلاثاء 7 مساءً" required></div><div class="field"><label>طريقة الحضور</label><select name="mode"><option>اونلاين</option><option>أوفلاين</option><option>اونلاين وأوفلاين</option></select></div><div class="field"><label>العدد الأقصى</label><input name="capacity" type="number" min="1" placeholder="مثال: 20" required></div><div class="field"><label>الحالة</label><select name="status"><option value="open">متاحة</option><option value="closed">مغلقة</option></select></div><div class="field"><label>ملاحظات</label><input name="notes" placeholder="اختياري"></div><button class="btn primary" style="grid-column:1/-1"><span data-icon="save"></span> حفظ المجموعة</button></form></div></div>`);
  const form=document.getElementById('groupForm');
  if(form) form.onsubmit=e=>{e.preventDefault(); const g=Object.fromEntries(new FormData(form).entries()); g.id=g.id||('grp-'+Date.now()); g.capacity=Number(g.capacity||0); const i=adminData.groups.findIndex(x=>groupIdValue(x)===g.id); if(i>=0) adminData.groups[i]=g; else adminData.groups.unshift(g); persist('تم حفظ المجموعة'); closeGroupModal(); renderGroups();};
}
function groupRow(g){const n=groupStudentCount(g), p=groupPendingCount(g), cap=Number(g.capacity||0), full=cap>0&&n>=cap, status=g.status==='closed'?'مغلقة':full?'مكتملة':'متاحة'; return `<tr><td>${safe(g.name)}</td><td>${safe(g.schedule)}</td><td>${safe(g.mode)}</td><td>${n}${p?` + ${p} حجز`:''} / ${cap||'-'}</td><td><span class="badge ${status==='متاحة'?'good':status==='مكتملة'?'warn':'danger'}">${status}</span></td><td><button class="small-btn primary" onclick="openGroupModal('${safe(g.id)}')">تعديل</button><button class="small-btn danger" onclick="deleteGroup('${safe(g.id)}')">حذف</button></td></tr>`;}
function groupCard(g){const n=groupStudentCount(g), p=groupPendingCount(g), cap=Number(g.capacity||0), full=cap>0&&n>=cap, status=g.status==='closed'?'مغلقة':full?'مكتملة':'متاحة'; return `<div class="mobile-row"><b>${safe(g.name)}</b><span class="badge ${status==='متاحة'?'good':status==='مكتملة'?'warn':'danger'}">${status}</span><small>${safe(g.schedule)} · ${n}${p?` + ${p} حجز`:''} / ${cap||'-'}</small><div class="mobile-actions"><button class="small-btn primary" onclick="openGroupModal('${safe(g.id)}')">تعديل</button><button class="small-btn danger" onclick="deleteGroup('${safe(g.id)}')">حذف</button></div></div>`;}
window.openGroupModal=function(id=''){
  const m=document.getElementById('groupModal'); if(!m)return; m.hidden=false; const form=document.getElementById('groupForm'); const g=(adminData.groups||[]).map(normalizeGroup).find(x=>x.id===id)||{}; form.id.value=g.id||''; form.name.value=g.name||''; form.schedule.value=g.schedule||''; form.mode.value=g.mode||'اونلاين وأوفلاين'; form.capacity.value=g.capacity||''; form.status.value=g.status||'open'; form.notes.value=g.notes||''; document.getElementById('groupModalTitle').textContent=id?'تعديل مجموعة':'إنشاء مجموعة';
};
window.closeGroupModal=function(){const m=document.getElementById('groupModal'); if(m)m.hidden=true;};
window.deleteGroup=function(id){if(!confirm('حذف المجموعة؟ لن يتم حذف الطلاب، لكن الأفضل نقلهم لمجموعة أخرى أولًا.'))return; adminData.groups=adminData.groups.filter(g=>groupIdValue(g)!==id); persist('تم حذف المجموعة'); renderGroups();};

function renderBookings(){fresh(); content(`<div class="section-head"><div><span class="kicker"><span data-icon="calendar"></span> التسجيلات</span><h2 class="section-title">طلبات تسجيل الكورسة</h2></div><button class="btn ghost" onclick="exportBookingsCSV()"><span data-icon="database"></span> تصدير CSV</button></div><div class="grid">${GRADES.map(g=>{const rows=adminData.bookings.filter(b=>b.grade===g); return `<div class="card"><h3>${safe(g)}</h3><div class="mobile-card-table">${rows.map(bookingCard).join('')||'<p class="section-desc">لا توجد حجوزات.</p>'}</div><div class="table-wrap admin-table-desktop"><table><thead><tr><th>الكود</th><th>الاسم</th><th>المستوى</th><th>المجموعة</th><th>ولي الأمر</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${rows.map(b=>`<tr><td>${safe(b.code)}</td><td>${safe(b.name)}</td><td>${safe(b.month)}</td><td>${safe(b.group)}</td><td>${safe(b.parentPhone)}</td><td><span class="badge warn">${safe(b.status||'تسجيل جديد')}</span></td><td><button class="small-btn primary" onclick="approveBooking('${safe(b.code)}')">قبول</button><button class="small-btn danger" onclick="deleteBooking('${safe(b.code)}')">حذف</button></td></tr>`).join('')||'<tr><td colspan="7">لا توجد حجوزات</td></tr>'}</tbody></table></div></div>`;}).join('')}</div>`);}
function bookingCard(b){return `<div class="mobile-row"><b>${safe(b.name)}</b><span class="badge warn">${safe(b.status||'تسجيل جديد')}</span><small>${safe(b.code)} · ${safe(b.grade)} · ${safe(b.group)}</small><div class="mobile-actions"><button class="small-btn primary" onclick="approveBooking('${safe(b.code)}')">قبول</button><button class="small-btn danger" onclick="deleteBooking('${safe(b.code)}')">حذف</button></div></div>`;}
window.approveBooking=async function(code){
  const b=adminData.bookings.find(x=>(x.code||x.studentCode||x.id)===code);
  if(!b)return;
  const stCodeValue=b.code||b.studentCode||code;
  const g=(adminData.groups||[]).map(normalizeGroup).find(x=>normalizeText(x.id)===normalizeText(b.groupId)||normalizeText(x.name)===normalizeText(b.group));
  if(g && (g.status==='closed' || groupIsFull(g))){ aToast('المجموعة مكتملة أو مغلقة، اختر مجموعة أخرى قبل القبول'); return; }
  const student={...b,code:stCodeValue,studentCode:stCodeValue,studentName:b.studentName||b.name,name:b.name||b.studentName,group:b.groupName||b.group,groupId:b.groupId||g?.id||'',paid:false,attendance:[],grades:[],homeworks:[],recitations:[],status:'active',acceptedAt:new Date().toISOString()};
  if(!adminData.students.some(s=>stCode(s)===stCodeValue)){adminData.students.push(student);}
  adminData.bookings=adminData.bookings.filter(x=>(x.code||x.studentCode||x.id)!==code);
  persist('تم قبول التسجيل وتحويله لطالب');
  try{ await window.MFCloud?.saveStudent?.(student); await window.MFCloud?.deleteDocument?.('bookings', stCodeValue); }catch(e){}
  renderBookings();
};
window.deleteBooking=async function(code){if(!confirm('حذف التسجيل؟'))return; adminData.bookings=adminData.bookings.filter(b=>b.code!==code); persist('تم حذف التسجيل'); await cloudDelete('bookings',code); renderBookings();};

function findAttendance(st,date){return (st.attendance||[]).find(a=>String(a.date)===date);}
function attendanceRecord(st,status,method){const s=normalizeStudent(st); st.studentCode=s.studentCode; st.code=s.studentCode; st.name=s.name; st.studentName=s.name; return {studentId:s.studentCode,studentCode:s.studentCode,studentName:s.name,grade:s.grade,group:s.group,status,date:attendanceDate,time:status==='present'?timeNow():null,method,scannedBy:currentStaff?.email||currentStaff?.uid||'teacher',createdAt:new Date().toISOString()};}
async function saveAttendanceRecord(st,status,method){st.attendance=st.attendance||[]; const existing=findAttendance(st,attendanceDate); if(existing){Object.assign(existing, attendanceRecord(st,status,method));} else st.attendance.push(attendanceRecord(st,status,method)); persist(); try{await window.MFCloud?.upsertAttendance?.(attendanceRecord(st,status,method)); await window.MFCloud?.saveStudent?.(st);}catch(e){} }
async function registerQrAttendance(code){fresh(); const st=adminData.students.map(normalizeStudent).find(s=>String(s.studentCode).trim()===String(code).trim()); if(!st){aToast('لم يتم العثور على طالب بهذا الكود.'); return;} const original=adminData.students.find(s=>stCode(s)===st.studentCode); const existing=findAttendance(original,attendanceDate); if(existing?.status==='present'){aToast('الطالب مسجل حضور بالفعل اليوم.'); return;} await saveAttendanceRecord(original,'present','qr_scan'); aToast(`تم تسجيل حضور ${st.name}`); renderAttendance();}
window.quickPresent=function(code){attendanceDate=isoDateAdmin(); registerQrAttendance(code);};
window.markAbsentForMissing=async function(){fresh(); const grade=selectedGrade(), group=selectedGroup(); const students=filterStudents(grade,group); let count=0; for(const st of students){const original=adminData.students.find(s=>stCode(s)===st.studentCode); if(!findAttendance(original,attendanceDate)){await saveAttendanceRecord(original,'absent','auto_absent'); count++;}} aToast(`تم تسجيل غياب ${count} طالب غير حاضر`); renderAttendance();};
function todayAttendanceRows(){const grade=selectedGrade(), group=selectedGroup(); return filterStudents(grade,group).flatMap(st=>(st.attendance||[]).filter(a=>String(a.date)===attendanceDate).map(a=>({...a,studentName:st.name,studentCode:st.studentCode,grade:st.grade,group:st.group})));}
function renderAttendance(){fresh(); const gOpts=['all',...GRADES], grpOpts=['all',...groupOptions()]; content(`<div class="section-head"><div><span class="kicker"><span data-icon="qr"></span> الحضور والغياب</span><h2 class="section-title">ماسح باركود وتسجيل حضور اليوم</h2><p class="section-desc">الـ باركود يحتوي على studentCode فقط، والمسح يسجل present. الغياب من زر منفصل.</p></div></div><div class="card attendance-control-card"><div class="grid grid-4"><select id="attendanceGrade">${gOpts.map(g=>`<option value="${safe(g)}">${g==='all'?'كل الصفوف':safe(g)}</option>`).join('')}</select><select id="attendanceGroup">${grpOpts.map(g=>`<option value="${safe(g)}">${g==='all'?'كل المجموعات':safe(g)}</option>`).join('')}</select><input id="attendanceDate" type="date" value="${attendanceDate}"><button class="btn ghost" onclick="renderAttendance()"><span data-icon="search"></span> عرض</button></div><div class="attendance-actions"><button class="btn primary qr-open-btn" onclick="openQrScanner()"><span data-icon="qr"></span> فتح ماسح باركود Code</button><button class="btn ghost" onclick="manualAttendancePrompt()"><span data-icon="user-check"></span> إدخال كود يدوي</button><button class="btn dark" onclick="markAbsentForMissing()"><span data-icon="calendar"></span> تسجيل غياب الطلاب غير الحاضرين</button></div></div><div class="grid grid-2" style="margin-top:18px"><div class="card"><h3>سجل حضور اليوم</h3>${attendanceLogHTML()}</div><div class="card"><h3>تقرير سريع</h3>${attendanceReportHTML()}</div></div><div id="qrScannerModal" class="qr-modal" hidden><div class="card qr-modal-card"><div class="profile-top"><h3>ماسح باركود الطالب</h3><button class="small-btn danger" onclick="closeQrScanner()">إغلاق</button></div><div id="adminQrReader"></div><p class="section-desc">وجّه كاميرا الموبايل على باركود الطالب لتسجيل الحضور.</p></div></div>`); const gd=document.getElementById('attendanceGrade'), gr=document.getElementById('attendanceGroup'), date=document.getElementById('attendanceDate'); if(gd)gd.value=sessionStorage.getItem('attGrade')||'all'; if(gr)gr.value=sessionStorage.getItem('attGroup')||'all'; if(date)date.onchange=()=>{attendanceDate=date.value; renderAttendance();}; if(gd)gd.onchange=()=>{sessionStorage.setItem('attGrade',gd.value); renderAttendance();}; if(gr)gr.onchange=()=>{sessionStorage.setItem('attGroup',gr.value); renderAttendance();};}
function attendanceLogHTML(){const rows=todayAttendanceRows(); return `<div class="mobile-card-table">${rows.map(r=>`<div class="mobile-row"><b>${safe(r.studentName)}</b><span class="badge ${badgeStatus(r.status)}">${r.status==='present'?'حاضر':'غائب'}</span><small>${safe(r.studentCode)} · ${safe(r.time||'-')} · ${safe(r.group||'-')}</small></div>`).join('')||'<p class="section-desc">لا توجد سجلات اليوم.</p>'}</div><div class="table-wrap admin-table-desktop"><table><thead><tr><th>الطالب</th><th>الكود</th><th>الحالة</th><th>الوقت</th><th>الطريقة</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${safe(r.studentName)}</td><td>${safe(r.studentCode)}</td><td><span class="badge ${badgeStatus(r.status)}">${r.status==='present'?'حاضر':'غائب'}</span></td><td>${safe(r.time||'-')}</td><td>${safe(r.method||'-')}</td></tr>`).join('')||'<tr><td colspan="5">لا توجد سجلات اليوم</td></tr>'}</tbody></table></div>`;}
function attendanceReportHTML(){const rows=todayAttendanceRows(); const present=rows.filter(r=>r.status==='present').length, absent=rows.filter(r=>r.status==='absent').length; return `<div class="metric-grid"><div class="metric"><b>${rows.length}</b><small>إجمالي مسجل</small></div><div class="metric"><b>${present}</b><small>حاضر</small></div><div class="metric"><b>${absent}</b><small>غائب</small></div><div class="metric"><b>${rows.length?Math.round(present/rows.length*100):0}%</b><small>نسبة الحضور</small></div></div>`;}
window.manualAttendancePrompt=function(){const code=prompt('اكتب كود الطالب الموجود في باركود'); if(code) registerQrAttendance(code.trim());};
window.openQrScanner=async function(){document.getElementById('qrScannerModal').hidden=false; const reader=document.getElementById('adminQrReader'); if(!reader)return; try{ if(window.Html5Qrcode){ qrScanner = new Html5Qrcode('adminQrReader'); await qrScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:250}}, decoded=>{registerQrAttendance(decoded);}); } else if('BarcodeDetector' in window){ reader.innerHTML='<video id="adminQrVideo" autoplay playsinline></video>'; const video=document.getElementById('adminQrVideo'); const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); video.srcObject=stream; const detector=new BarcodeDetector({formats:['qr_code']}); const loop=async()=>{if(document.getElementById('qrScannerModal').hidden) return; const codes=await detector.detect(video).catch(()=>[]); if(codes.length) await registerQrAttendance(codes[0].rawValue); setTimeout(loop,800);}; loop(); } else {reader.innerHTML='<p class="section-desc">المتصفح لا يدعم ماسح باركود. استخدم إدخال كود يدوي.</p>';}}catch(e){reader.innerHTML='<p class="section-desc">تعذر فتح الكاميرا. تأكد من السماح للمتصفح باستخدام الكاميرا.</p>';}};
window.closeQrScanner=async function(){try{if(qrScanner){await qrScanner.stop(); qrScanner.clear(); qrScanner=null;}}catch(e){} const v=document.getElementById('adminQrVideo'); if(v?.srcObject) v.srcObject.getTracks().forEach(t=>t.stop()); const m=document.getElementById('qrScannerModal'); if(m)m.hidden=true;};

function renderPayments(){fresh(); content(`<div class="section-head"><div><span class="kicker"><span data-icon="database"></span> الدفع</span><h2 class="section-title">حالة دفع الطلاب</h2></div></div><div class="grid">${GRADES.map(g=>{const rows=adminData.students.filter(s=>s.grade===g).map(normalizeStudent); return `<div class="card"><h3>${safe(g)}</h3>${rows.map(s=>`<div class="mobile-row"><b>${safe(s.name)}</b><span class="badge ${badgeStatus(s.paid)}">${s.paid?'تم الدفع':'لم يدفع'}</span><small>${safe(s.studentCode)} · ${safe(s.month||'-')}</small><div class="mobile-actions"><button class="small-btn primary" onclick="setPaid('${safe(s.studentCode)}',true)">تم الدفع</button><button class="small-btn danger" onclick="setPaid('${safe(s.studentCode)}',false)">لم يدفع</button></div></div>`).join('')||'<p class="section-desc">لا يوجد طلاب.</p>'}</div>`;}).join('')}</div>`);}
window.setPaid=function(code,val){const s=adminData.students.find(x=>stCode(x)===code); if(!s)return; s.paid=val; s.paymentDate=val?isoDateAdmin():''; persist(val?'تم تسجيل الدفع':'تم تعليم الطالب لم يدفع'); renderPayments();};

function renderMaterials(){fresh(); content(`<div class="section-head"><div><span class="kicker"><span data-icon="book-open"></span> المحتوى</span><h2 class="section-title">Materials والتدريبات</h2></div></div><div class="grid grid-2"><form id="materialForm" class="card grid"><h3>إضافة مراجعة / ملف</h3><input name="title" placeholder="العنوان" required><select name="grade"><option>كل الصفوف</option>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select><textarea name="desc" placeholder="وصف مختصر"></textarea><input type="file" name="file" accept="image/*,application/pdf"><button class="btn primary"><span data-icon="upload"></span> إضافة</button></form><form id="questionForm" class="card grid"><h3>إضافة سؤال</h3><input name="title" placeholder="عنوان السؤال" required><select name="grade"><option>كل الصفوف</option>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select><textarea name="content" placeholder="نص السؤال"></textarea><textarea name="answer" placeholder="الإجابة النموذجية"></textarea><button class="btn primary"><span data-icon="help-circle"></span> إضافة سؤال</button></form></div><div class="grid grid-2" style="margin-top:18px"><div class="card"><h3>المراجعات</h3>${adminData.materials.map(m=>`<div class="mobile-row"><b>${safe(m.title)}</b><small>${safe(m.grade||'')}</small><button class="small-btn danger" onclick="deleteItem('materials','${safe(m.id)}')">حذف</button></div>`).join('')||'<p class="section-desc">لا توجد مراجعات.</p>'}</div><div class="card"><h3>الأسئلة</h3>${adminData.questions.map(q=>`<div class="mobile-row"><b>${safe(q.title)}</b><small>${safe(q.grade||'')}</small><button class="small-btn danger" onclick="deleteItem('questions','${safe(q.id)}')">حذف</button></div>`).join('')||'<p class="section-desc">لا توجد أسئلة.</p>'}</div></div>`); document.getElementById('materialForm').onsubmit=async e=>{e.preventDefault(); const f=e.target.file.files[0]; const m=Object.fromEntries(new FormData(e.target).entries()); m.id='mat-'+Date.now(); if(f&&window.MFCloud?.uploadAttachment){try{const up=await window.MFCloud.uploadAttachment(f,'teacher-uploads'); m.fileUrl=up.url; m.fileName=up.fileName;}catch(err){aToast('تعذر رفع الملف');}} adminData.materials.push(m); persist('تم إضافة المراجعة'); renderMaterials();}; document.getElementById('questionForm').onsubmit=e=>{e.preventDefault(); const q=Object.fromEntries(new FormData(e.target).entries()); q.id='q-'+Date.now(); adminData.questions.push(q); persist('تم إضافة السؤال'); renderMaterials();};}
window.deleteItem=async function(collection,id){if(!confirm('حذف العنصر؟'))return; adminData[collection]=adminData[collection].filter(x=>x.id!==id); persist('تم الحذف'); await cloudDelete(collection,id); renderSection();};


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
    rows.push({...a,rowKind:'attempt',rowId:String(a.id||`attempt-${code}-${a.examId||a.examTitle||i}-${i}`),studentCode:code,studentName:a.studentName||'',examTitle:a.examTitle||a.exam||'اختبار',date:gradeRowDateValue(a)});
  });
  (adminData.grades||[]).forEach((g,i)=>{
    const code = g.studentCode || g.code || '';
    rows.push({...g,rowKind:'grade',rowId:String(g.id||`grade-${code}-${g.exam||g.examTitle||i}-${i}`),studentCode:code,studentName:g.studentName||g.name||'',examTitle:g.examTitle||g.exam||'اختبار',date:gradeRowDateValue(g)});
  });
  (adminData.students||[]).map(normalizeStudent).forEach(st=>{
    (st.grades||[]).forEach((g,i)=>{
      rows.push({...g,rowKind:'student-grade',rowId:String(g.id||`${st.studentCode}-student-grade-${i}`),studentCode:st.studentCode,studentName:st.name,examTitle:g.examTitle||g.exam||'اختبار',date:gradeRowDateValue(g)});
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
المستوى الدراسي: ${s.grade || row.grade || '-'}
المجموعة: ${s.group || row.group || '-'}

الاختبار: ${row.examTitle || row.exam || 'اختبار'}
الدرجة: ${scoreText(row)}
تاريخ التسليم: ${row.submittedAt || row.date || '-'}

تيكنو مايندز`;
}
function examGradeRowHTML(row){
  const st = studentForGradeRow(row) || {};
  const parentPhone = st.parentPhone || row.parentPhone || '';
  const canSend = !!parentPhone && scoreIsReady(row);
  const badge = scoreIsReady(row) ? 'good' : 'warn';
  return `<div class="mobile-row exam-grade-row-v39"><div><b>${safe(row.studentName || st.name || '-')} — ${safe(row.examTitle || row.exam || 'اختبار')}</b><small>${safe(row.studentCode || st.studentCode || '-')} · ${safe(row.submittedAt || row.date || '-')}</small></div><span class="badge ${badge}">${safe(scoreText(row))}</span><div class="mobile-actions exam-grade-actions-v39"><button class="small-btn whatsapp-report-btn" ${canSend?'':'disabled'} onclick="sendExamGradeToParent('${safe(row.rowId)}')">واتساب ولي الأمر</button></div></div>`;
}
window.sendExamGradeToParent=function(rowId){
  const rows = window.__adminExamGradeRows || examGradeRows();
  const row = rows.find(r=>String(r.rowId)===String(rowId));
  if(!row) return aToast('لم يتم العثور على درجة الاختبار');
  if(!scoreIsReady(row)) return aToast('الدرجة لم يتم تصحيحها بعد');
  const st = studentForGradeRow(row);
  const phone = adminWhatsAppPhone(st?.parentPhone || row.parentPhone || '');
  if(!phone) return aToast('رقم ولي الأمر غير موجود لهذا الطالب');
  window.open(whatsappLink(phone, examGradeWhatsappText(row, st)), '_blank');
};

function examHelpSample(){return `<div class="exam-help-v40"><h3>طريقة كتابة الأسئلة الصحيحة</h3><p>للاختياري لازم تكتب الاختيارات وسطر <b>الإجابة:</b> عشان الموقع يصحح تلقائيًا. للمقالي اكتب السؤال فقط بدون اختيارات وسيظهر كاملًا للمدرس للتصحيح.</p><pre>ما عاصمة مصر؟
أ) القاهرة
ب) الإسكندرية
ج) طنطا
د) أسوان
الإجابة: أ

اشرح أهمية الضوء للنبات.</pre></div>`;}
function examAttemptBadge(a){if(a.needsManualReview||a.status==='pending_manual')return '<span class="badge warn">بانتظار التصحيح</span>'; if(a.status==='corrected')return '<span class="badge good">تم التصحيح</span>'; return '<span class="badge good">مصحح تلقائيًا</span>';}
function examAttemptScoreText(a){return (a.score!==null&&a.score!==undefined&&a.score!=='')?`${a.score}%`:(a.autoScore!==null&&a.autoScore!==undefined?`تلقائي ${a.autoScore}% · ينتظر النهائي`:'بانتظار التصحيح');}
function examAttemptRowHTML(a){return `<div class="mobile-row exam-review-row-v40"><div><b>${safe(a.studentName||'-')} — ${safe(a.examTitle||'اختبار')}</b><small>${safe(a.studentCode||'-')} · ${safe(a.submittedAt||'-')}</small></div>${examAttemptBadge(a)}<span class="badge ${a.score!==null&&a.score!==undefined?'good':'warn'}">${safe(examAttemptScoreText(a))}</span><div class="mobile-actions"><button class="small-btn primary" onclick="correctAttempt('${safe(a.id)}')">عرض وتصحيح</button></div></div>`;}
function renderExams(){fresh(); const attempts=(adminData.examAttempts||[]).slice().reverse(); const pending=attempts.filter(a=>a.needsManualReview||a.status==='pending_manual'); const gradeRows=examGradeRows(); window.__adminExamGradeRows=gradeRows; content(`<div class="section-head"><div><span class="kicker"><span data-icon="clipboard"></span> الاختبارات</span><h2 class="section-title">إدارة الاختبارات والتصحيح</h2><p class="section-desc">الاختياري يتصحح تلقائيًا عند كتابة الإجابة الصحيحة، والمقالي يظهر كاملًا للمدرس للتصحيح.</p></div></div><div class="grid grid-2"><form id="examForm" class="card grid"><h3>إضافة اختبار</h3><input name="title" placeholder="عنوان الاختبار" required><select name="grade"><option>كل الصفوف</option>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select><input name="duration" type="number" min="1" value="20" placeholder="المدة بالدقائق"><label class="option-card"><input type="checkbox" name="allowRetake" value="true"> السماح بإعادة التسليم</label><textarea name="instructions" placeholder="تعليمات الاختبار"></textarea><textarea name="text" rows="10" placeholder="مثال اختياري:
ما عاصمة مصر؟
أ) القاهرة
ب) الإسكندرية
ج) طنطا
د) أسوان
الإجابة: أ

مثال مقالي:
اشرح أهمية الضوء للنبات."></textarea><button class="btn primary"><span data-icon="clipboard"></span> حفظ الاختبار</button></form><div class="card">${examHelpSample()}<h3 style="margin-top:16px">الاختبارات الحالية</h3>${adminData.exams.map(e=>`<div class="mobile-row"><b>${safe(e.title)}</b><small>${safe(e.grade)} · ${safe(e.duration)} دقيقة · ${safe(e.questionCount||'')} سؤال</small><button class="small-btn danger" onclick="deleteItem('exams','${safe(e.id)}')">حذف</button></div>`).join('')||'<p class="section-desc">لا توجد اختبارات.</p>'}</div></div><div class="card exam-review-list-v40" style="margin-top:18px"><h3>محاولات الطلاب والتصحيح</h3><p class="section-desc">اضغط عرض وتصحيح لعرض إجابات الطالب كاملة، علّم كل إجابة صح أو غلط، ثم اكتب الدرجة النهائية.</p>${attempts.map(examAttemptRowHTML).join('')||'<p class="section-desc">لا توجد محاولات بعد.</p>'}</div><div class="card" style="margin-top:18px"><h3>أسئلة مقالية بانتظار التصحيح</h3>${pending.map(a=>`<div class="mobile-row"><b>${safe(a.studentName)} — ${safe(a.examTitle)}</b><small>${safe(a.studentCode)} · ${safe(a.submittedAt)}</small><button class="small-btn primary" onclick="correctAttempt('${safe(a.id)}')">تصحيح</button></div>`).join('')||'<p class="section-desc">لا توجد محاولات تحتاج تصحيح.</p>'}</div><div class="card exam-grade-list-v39" style="margin-top:18px"><h3>درجات الطلاب وإرسال واتساب</h3><p class="section-desc">بعد تصحيح الاختبار، اضغط زر واتساب بجانب درجة الطالب لإرسال النتيجة لولي الأمر برسالة جاهزة.</p>${gradeRows.map(examGradeRowHTML).join('')||'<p class="section-desc">لا توجد درجات أو محاولات اختبارات بعد.</p>'}</div>`); document.getElementById('examForm').onsubmit=e=>{e.preventDefault(); const ex=Object.fromEntries(new FormData(e.target).entries()); const qs=typeof parseExamQuestions==='function'?parseExamQuestions(ex.text||''):[]; if(!qs.length)return aToast('اكتب أسئلة الاختبار أولًا'); const missing=qs.filter(q=>q.type==='mcq'&&!String(q.answer||'').trim()).length; if(missing)return aToast('لازم تكتب الإجابة الصحيحة لكل سؤال اختياري بصيغة: الإجابة: أ'); ex.id='ex-'+Date.now(); ex.allowRetake=!!ex.allowRetake; ex.questionCount=qs.length; ex.mcqCount=qs.filter(q=>q.type==='mcq').length; ex.essayCount=qs.filter(q=>q.type==='essay').length; adminData.exams.push(ex); persist('تم حفظ الاختبار'); renderExams();};}
window.correctAttempt=function(id){const a=adminData.examAttempts.find(x=>String(x.id)===String(id)); if(!a)return; document.querySelector('.correction-modal-v40')?.remove(); const answers=Array.isArray(a.answers)?a.answers:[]; const checkedDefault=x=>x.correct===true?'checked':''; const html=`<div class="correction-modal-v40"><div class="correction-card-v40 card"><div class="profile-top"><div><span class="kicker">تصحيح اختبار</span><h2>${safe(a.studentName||'-')}</h2><p class="section-desc">${safe(a.examTitle||'اختبار')} · ${safe(a.studentCode||'-')}</p></div><button class="small-btn danger" onclick="closeCorrectionModal()">إغلاق</button></div><div class="correction-list-v40">${answers.map((ans,i)=>`<div class="correction-question-v40"><h3>${i+1}. ${safe(ans.question||'سؤال')}</h3><div class="correction-answer-grid-v40"><div><span>إجابة الطالب</span><p>${safe(ans.answer||'-')}</p></div><div><span>الإجابة الصحيحة / النموذجية</span><p>${safe(ans.correctAnswer||ans.modelAnswer||'يصَححها الإدارة')}</p></div></div><label class="correction-toggle-v40"><input type="checkbox" data-correct-index="${i}" ${checkedDefault(ans)} onchange="recalculateCorrectionScore()"> الإجابة صحيحة</label></div>`).join('')||'<p class="section-desc">لا توجد إجابات محفوظة.</p>'}</div><div class="correction-final-v40"><button class="small-btn" type="button" onclick="recalculateCorrectionScore()">حساب الدرجة من الصح والغلط</button><label>الدرجة النهائية من 100<input id="manualFinalScore" type="number" min="0" max="100" value="${safe(a.score??a.autoScore??0)}"></label><button class="btn primary" onclick="saveAttemptCorrection('${safe(a.id)}')">حفظ التصحيح والنتيجة</button></div></div></div>`; document.body.insertAdjacentHTML('beforeend',html); recalculateCorrectionScore();};
window.closeCorrectionModal=function(){document.querySelector('.correction-modal-v40')?.remove();};
window.recalculateCorrectionScore=function(){const checks=[...document.querySelectorAll('.correction-modal-v40 [data-correct-index]')]; if(!checks.length)return; const correct=checks.filter(c=>c.checked).length; const score=Math.round(correct/checks.length*100); const input=document.getElementById('manualFinalScore'); if(input && !input.dataset.touched){input.value=score;} if(input){input.oninput=()=>{input.dataset.touched='1';};}};
window.saveAttemptCorrection=async function(id){const a=adminData.examAttempts.find(x=>String(x.id)===String(id)); if(!a)return; const checks=[...document.querySelectorAll('.correction-modal-v40 [data-correct-index]')]; let correct=0; checks.forEach(ch=>{const i=Number(ch.dataset.correctIndex); const ok=!!ch.checked; if(a.answers&&a.answers[i]){a.answers[i].correct=ok; a.answers[i].teacherReviewed=true;} if(ok)correct++;}); const score=Number(document.getElementById('manualFinalScore')?.value); if(Number.isNaN(score)||score<0||score>100)return aToast('اكتب درجة صحيحة من 0 إلى 100'); a.score=score; a.maxScore=100; a.correctCount=correct; a.questionCount=checks.length||a.questionCount||0; a.needsManualReview=false; a.status='corrected'; a.teacherCorrectedAt=new Date().toISOString(); persist('تم حفظ التصحيح والنتيجة'); try{await window.MFCloud?.saveExamAttempt?.(a);}catch(e){} closeCorrectionModal(); renderExams();};

function renderReviewsAdmin(){fresh(); content(`<div class="admin-table-head"><div><span class="kicker"><span data-icon="star"></span> التقييمات</span><h2>إدارة آراء الطلاب وأولياء الأمور</h2><p class="section-desc">التقييمات الجديدة تظهر في الموقع، ومن هنا تقدر تخفيها أو تنشرها أو تحذفها.</p></div><button class="btn primary" onclick="openReviewModal()"><span data-icon="plus"></span> إضافة تقييم</button></div><div class="admin-pro-card"><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الصفة</th><th>النجوم</th><th>الرأي</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${adminData.reviews.map(r=>`<tr><td>${safe(r.name)}</td><td>${safe(r.role||'طالب')}</td><td><span class="review-stars">${'★'.repeat(Number(r.rating||5))}</span></td><td>${safe(String(r.text||'').slice(0,90))}</td><td><span class="badge ${r.approved!==false&&!r.hidden?'good':'warn'}">${r.approved!==false&&!r.hidden?'ظاهر':'مخفي'}</span></td><td><div class="pay-row"><button class="small-btn primary" onclick="toggleReview('${safe(r.id)}')">${r.approved!==false&&!r.hidden?'إخفاء':'إظهار'}</button><button class="small-btn danger" onclick="deleteItem('reviews','${safe(r.id)}')">حذف</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="muted-cell">لا توجد تقييمات.</td></tr>'}</tbody></table></div></div>`);}
window.openReviewModal=function(){openModal('إضافة تقييم يدوي',`<form class="admin-modal-form" id="adminReviewForm"><label>الاسم<input name="name" required></label><label>الصفة<select name="role"><option>طالب</option><option>ولي أمر</option></select></label><label>التقييم<select name="rating"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></label><label class="wide">الرأي<textarea name="text" required></textarea></label><button class="btn primary wide" type="submit">حفظ التقييم</button></form>`); document.getElementById('adminReviewForm').onsubmit=e=>{e.preventDefault(); const r=Object.fromEntries(new FormData(e.target).entries()); r.id='rev-'+Date.now(); r.date=isoDateAdmin(); r.approved=true; adminData.reviews.unshift(r); persist('تم إضافة التقييم'); closeModal(); renderReviewsAdmin();};};
window.toggleReview=function(id){const r=adminData.reviews.find(x=>x.id===id); if(!r)return; const visible=r.approved!==false && !r.hidden; r.approved=!visible; r.hidden=visible; persist(visible?'تم إخفاء التقييم':'تم إظهار التقييم'); renderReviewsAdmin();};
window.approveReview=function(id){const r=adminData.reviews.find(x=>x.id===id); if(!r)return; r.approved=true; r.hidden=false; persist('تم نشر التقييم'); renderReviewsAdmin();};

function renderSettings(){fresh(); content(`<div class="section-head"><div><span class="kicker"><span data-icon="sparkles"></span> الإعدادات</span><h2 class="section-title">إعدادات الموقع والدومين</h2></div></div><div class="card"><form id="settingsForm" class="grid"><input name="siteUrl" value="${safe(adminData.settings.siteUrl||DEFAULT_SITE_URL||'')}" placeholder="الدومين الأساسي"><input name="teacherPhone" value="${safe(adminData.settings.teacherPhone||TEACHER_WHATSAPP||'')}" placeholder="رقم واتساب الإدارة"><textarea name="homeNotice" placeholder="رسالة تنبيه للطلاب">${safe(adminData.settings.homeNotice||'')}</textarea><button class="btn primary"><span data-icon="sparkles"></span> حفظ الإعدادات</button></form></div><div class="seo-card" style="margin-top:18px"><h3>SEO</h3><p>تم جعل صفحة الإدارة noindex، ولا يوجد رابط ظاهر للوحة الإدارة في الموقع العام.</p></div>`); document.getElementById('settingsForm').onsubmit=e=>{e.preventDefault(); adminData.settings={...adminData.settings,...Object.fromEntries(new FormData(e.target).entries())}; persist('تم حفظ الإعدادات');};}

function renderSection(){({overview:renderOverview,students:renderStudents,bookings:renderBookings,groups:renderGroups,attendance:renderAttendance,payments:renderPayments,exams:renderExams,materials:renderMaterials,reviews:renderReviewsAdmin,settings:renderSettings}[currentSection]||renderOverview)();}
function exportCSV(name, rows){const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'})); a.download=name; a.click();}
window.exportBookingsCSV=function(){exportCSV('bookings.csv',[['code','name','grade','month','group','parentPhone','status'],...adminData.bookings.map(b=>[b.code,b.name,b.grade,b.month,b.group,b.parentPhone,b.status])]);};

function initAdmin(){setupTheme(); hydrateIcons(); adminLogin(); tryRestoreSession();}
document.addEventListener('DOMContentLoaded',initAdmin);
