var DEFAULT_SITE_URL = 'https://technominds-academy.vercel.app';
var TEACHER_WHATSAPP = '201008454029';
var ENGINEER_WHATSAPP = '201008454029';
var GRADES = ['تانية ثانوي بكالوريا','تانية ثانوي عام','مبتدئين برمجة','أساسيات Python','تطبيقات ومراجعة'];
var MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
var STORAGE_KEY = 'technominds_academy_v1_data';
var OLD_STORAGE_KEY = 'mf_science_v11_data';
var cloudSaveTimer = null;
var icons = {
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m8 9-4 3 4 3"></path><path d="m16 9 4 3-4 3"></path><path d="M14 5 10 19"></path></svg>',
  atom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="2"></circle><path d="M12 2c3 3.8 5 7.1 5 10s-2 6.2-5 10c-3-3.8-5-7.1-5-10s2-6.2 5-10Z"></path><path d="M2 12c3.8-3 7.1-5 10-5s6.2 2 10 5c-3.8 3-7.1 5-10 5S5.8 15 2 12Z"></path></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 2v4M16 2v4M3 10h18"></path><rect x="3" y="5" width="18" height="17" rx="3"></rect></svg>',
  bookOpen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 7v14"></path><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H12V5H6.5A2.5 2.5 0 0 0 4 7.5v12Z"></path><path d="M20 19.5a2.5 2.5 0 0 0-2.5-2.5H12V5h5.5A2.5 2.5 0 0 1 20 7.5v12Z"></path></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="5" y="4" width="14" height="18" rx="2"></rect><path d="M9 4a3 3 0 0 1 6 0"></path><path d="M9 12h6M9 16h4"></path></svg>',
  barChart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 20V4"></path><path d="M4 20h17"></path><rect x="7" y="11" width="3" height="6" rx="1"></rect><rect x="12" y="7" width="3" height="10" rx="1"></rect><rect x="17" y="13" width="3" height="4" rx="1"></rect></svg>',
  userCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path><circle cx="9.5" cy="7" r="4"></circle><path d="m16 11 2 2 4-5"></path></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.45c1 .35 1.9.6 2.9.7A2 2 0 0 1 22 16.9Z"></path></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"></path><path d="M19 14l.9 2.6L22 17.5l-2.1.9L19 21l-.9-2.6-2.1-.9 2.1-.9L19 14ZM4 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z"></path></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m22 2-7 20-4-9-9-4 20-7Z"></path><path d="M22 2 11 13"></path></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"></path><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="7" r="4"></circle></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>',
  fileText: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6M8 13h8M8 17h6"></path></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 2 3.1 6.3 6.9 1-5 4.8 1.2 6.9L12 17.8 5.8 21 7 14.1 2 9.3l6.9-1L12 2Z"></path></svg>',
  externalLink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="1"></circle></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06C2 17.08 5.66 21.25 10.44 22v-7.03H7.9v-2.91h2.54V9.84c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.77l-.44 2.91h-2.33V22C18.34 21.25 22 17.08 22 12.06Z"/></svg>',
  helpCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><path d="M9.1 9a3 3 0 1 1 5.6 1.5c-.8 1.2-2.7 1.5-2.7 3"></path><path d="M12 17h.01"></path></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 13a8 8 0 0 1 16 0"></path><path d="M4 13v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2Z"></path><path d="M20 13v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z"></path><path d="M8 20c1.1.7 2.4 1 4 1s2.9-.3 4-1"></path><path d="M9 9h6M9 12h4"></path></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><path d="M14 14h3v3h-3zM18 14h3M14 19h7M19 18v3"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 15H6L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M17 8l-5-5-5 5"></path><path d="M12 3v12"></path></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M7 10l5 5 5-5"></path><path d="M12 15V3"></path></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"></path></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>'
};

var PRODUCTION_MODE = true;
var appDataLoadFailed = false;

function iconNameToKey(name){return String(name||'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());}
function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(el=>{const key=iconNameToKey(el.dataset.icon); if(icons[key]) el.innerHTML=icons[key];});}
function toast(msg){const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2800);}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function normalizeText(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ');}
function phoneDigits(v){return String(v||'').replace(/\D/g,'');}
function uid(prefix='ST'){return `${prefix}-${Date.now().toString().slice(-4)}${Math.floor(100+Math.random()*900)}`;}
function isoDate(d=new Date()){return d.toISOString().slice(0,10);}
function arStatus(status){return status==='present'?'حاضر':status==='absent'?'غائب':(status||'-');}
function statusClass(status){return status==='present'||status==='حاضر'||status===true?'good':status==='absent'||status==='غائب'||status===false?'danger':'warn';}
function whatsappLink(phone,msg){return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;}
function whatsappPhone(v){const d=phoneDigits(v); if(!d) return ''; if(d.startsWith('20')) return d; if(d.startsWith('0')) return '2'+d; return d;}
function monthLabel(st){return st?.month || MONTHS[new Date().getMonth()] || '';}
function getSiteBase(){return (appData.settings?.siteUrl || DEFAULT_SITE_URL || location.origin).replace(/\/$/,'');}
function defaultData(){return {students:[],bookings:[],payments:[],attendance:[],materials:[],questions:[],exams:[],examAttempts:[],grades:[],reviews:[],groups:[],assignments:[],services:[],onlineLectures:[],onlineLectureAttendance:[],settings:{siteUrl:DEFAULT_SITE_URL||'',teacherPhone:TEACHER_WHATSAPP||''},files:[]};}
function mergeData(data){const d=defaultData(); const p=data||{}; return {...d,...p,settings:{...d.settings,...(p.settings||{})},students:Array.isArray(p.students)?p.students:[],bookings:Array.isArray(p.bookings)?p.bookings:[],materials:Array.isArray(p.materials)?p.materials:[],questions:Array.isArray(p.questions)?p.questions:[],exams:Array.isArray(p.exams)?p.exams:[],examAttempts:Array.isArray(p.examAttempts)?p.examAttempts:[],grades:Array.isArray(p.grades)?p.grades:[],reviews:Array.isArray(p.reviews)?p.reviews:[],groups:Array.isArray(p.groups)?p.groups:[],assignments:Array.isArray(p.assignments)?p.assignments:[],payments:Array.isArray(p.payments)?p.payments:[],attendance:Array.isArray(p.attendance)?p.attendance:[],services:Array.isArray(p.services)?p.services:[],onlineLectures:Array.isArray(p.onlineLectures)?p.onlineLectures:[],onlineLectureAttendance:Array.isArray(p.onlineLectureAttendance)?p.onlineLectureAttendance:[],files:Array.isArray(p.files)?p.files:[]};}
function loadData(){try{return mergeData(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'));}catch(e){return defaultData();}}
function saveData(data){localStorage.setItem(STORAGE_KEY,JSON.stringify(mergeData(data)));}
var appData = loadData();
function queueCloudSave(){ if(!window.MFCloud?.ready || !window.MFCloud.saveSiteData) return; clearTimeout(cloudSaveTimer); cloudSaveTimer=setTimeout(()=>window.MFCloud.saveSiteData(appData).catch(()=>{}),500); }
function persist(msg){saveData(appData); queueCloudSave(); if(msg) toast(msg); refreshActiveViews();}
function dataErrorHTML(){return `<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="database"></span><h3>تعذر تحميل البيانات، حاول لاحقًا.</h3><p>لم يتم عرض أي بيانات وهمية في نسخة الإنتاج.</p></div>`;}
async function loadBookingGroupsDirect(){
  // تحميل المجموعات كـ Dropdown مباشر من Firestore فقط.
  // لا نستخدم LocalStorage للمجموعات في صفحة الحجز حتى لا تظهر مواعيد قديمة.
  const select = document.getElementById('bookingGroup');
  if(!select) return [];
  select.disabled = true;
  select.innerHTML = '<option value="">جار تحميل المجموعات...</option>';

  function readFsValue(v){
    if(!v || typeof v !== 'object') return '';
    if('stringValue' in v) return v.stringValue || '';
    if('integerValue' in v) return Number(v.integerValue || 0);
    if('doubleValue' in v) return Number(v.doubleValue || 0);
    if('booleanValue' in v) return !!v.booleanValue;
    if('timestampValue' in v) return v.timestampValue || '';
    if('nullValue' in v) return '';
    return '';
  }
  function parseRestDoc(doc){
    const f = doc.fields || {};
    const id = String(readFsValue(f.id) || (doc.name || '').split('/').pop() || '').trim();
    return {
      id,
      name: readFsValue(f.name) || readFsValue(f.title) || readFsValue(f.groupName) || readFsValue(f.group) || '',
      schedule: readFsValue(f.schedule) || readFsValue(f.time) || readFsValue(f.times) || '',
      mode: readFsValue(f.mode) || readFsValue(f.type) || '',
      capacity: Number(readFsValue(f.capacity) || readFsValue(f.limit) || readFsValue(f.maxStudents) || 0),
      status: String(readFsValue(f.status) || 'open').trim()
    };
  }
  function normalizeCloudGroup(data, docId){
    data = data || {};
    return {
      ...data,
      id: String(data.id || docId || data.name || '').trim(),
      name: data.name || data.title || data.groupName || data.group || '',
      schedule: data.schedule || data.time || data.times || '',
      mode: data.mode || data.type || '',
      capacity: Number(data.capacity || data.limit || data.maxStudents || 0),
      status: String(data.status || 'open').trim()
    };
  }

  try{
    let cloudGroups = [];

    // الطريقة الأولى: Firebase SDK لو اشتغل.
    try{
      const db = window.MFCloud?.db || (window.firebase && firebase.firestore ? firebase.firestore() : null);
      if(db){
        const snap = await db.collection('groups').get();
        cloudGroups = snap.docs.map(doc => normalizeCloudGroup(doc.data() || {}, doc.id)).filter(g => g.name);
      }
    }catch(sdkErr){
      console.warn('تعذر تحميل المجموعات عبر SDK، سيتم استخدام REST', sdkErr);
    }

    // الطريقة الثانية: Firestore REST كخطة احتياطية، عشان الدروب داون يظهر حتى لو MFCloud اتأخر.
    if(!cloudGroups.length){
      const projectId = (window.MF_FIREBASE_CONFIG && window.MF_FIREBASE_CONFIG.projectId) || 'eng-amr-khaled-academy';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups`;
      const res = await fetch(url, { cache:'no-store' });
      if(!res.ok) throw new Error('فشل تحميل بيانات المجموعات: ' + res.status);
      const json = await res.json();
      cloudGroups = (json.documents || []).map(parseRestDoc).filter(g => g.name);
    }

    appData.groups = cloudGroups;
    try{ saveData(appData); }catch(e){}

    const groups = openGroups();
    select.disabled = false;
    select.innerHTML = groups.length ? groups.map(g=>{
      const used = groupStudentCount(g), cap = Number(g.capacity || 0), full = cap > 0 && used >= cap;
      return `<option value="${esc(g.id)}" ${full?'disabled':''} data-name="${esc(g.name)}" data-full="${full?'1':'0'}">${esc(g.name)} — ${esc(g.schedule || g.mode || '')} ${cap?`(${full?'مكتملة':'متاح '+(cap-used)+' من '+cap})`:''}</option>`;
    }).join('') : '<option value="">لا توجد مجموعات متاحة حاليًا</option>';
    renderSelectedGroupInfo();
    return groups;
  }catch(err){
    console.warn('تعذر تحميل قائمة المجموعات من Firebase', err);
    appData.groups = [];
    select.disabled = false;
    select.innerHTML = '<option value="">تعذر تحميل المجموعات من Firebase</option>';
    renderSelectedGroupInfo();
    return [];
  }
}
async function initFirebaseData(){
  // نخزن Promise التحميل عشان صفحة الحجز تستنى Firebase قبل التسجيل
  window.__bookingGroupsLoading = (async()=>{
    if(!window.MFCloud?.ready || !window.MFCloud.loadSiteData){
      await loadBookingGroupsDirect();
      return;
    }
  try{
    const cloudData = await window.MFCloud.loadSiteData();
    if(cloudData){ appData = mergeData(cloudData); saveData(appData); refreshActiveViews(); }
  }catch(e){ appDataLoadFailed=true; refreshActiveViews(); }
  await loadBookingGroupsDirect();
  })();
  return window.__bookingGroupsLoading;
}
function refreshActiveViews(){
  const path=(location.pathname.split('/').pop()||'index.html');
  try{
    if(document.getElementById('liveCounts')) renderHomeCounts();
    if(document.getElementById('publicLeaderboard')) renderPublicLeaderboard();
    if(document.getElementById('reviewsList')) renderReviews();
    if(document.getElementById('bookingPreview')) renderBookingPreview();
    if(document.getElementById('bookingGroup')) fillSelects();
    if(path==='materials.html') renderUnifiedResourcesPage();
    if(path==='online-lectures.html') renderOnlineLecturesPage();
  }catch(e){}
}
function setupTheme(){
  const saved=localStorage.getItem('theme')||'light'; document.documentElement.dataset.theme=saved;
  document.querySelectorAll('#themeToggle,#themeToggleAdmin').forEach(btn=>{btn.innerHTML=icons[saved==='dark'?'sun':'moon']; btn.onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark'; document.documentElement.dataset.theme=next; localStorage.setItem('theme',next); setupTheme();};});
}

function groupIdValue(g){return String(g?.id||g?.code||g?.name||'').trim();}
function normalizeGroup(g){const id=groupIdValue(g); const name=g?.name||g?.title||g?.groupName||g?.group||''; return {...(g||{}),id,name,schedule:g?.schedule||g?.time||g?.times||'',mode:g?.mode||g?.type||'',capacity:Number(g?.capacity||g?.limit||g?.maxStudents||0),status:String(g?.status||'open').trim()};}
function groupStudentCount(group){const g=normalizeGroup(group); return (appData.students||[]).filter(s=>normalizeText(s.groupId||s.group)===normalizeText(g.id)||normalizeText(s.group)===normalizeText(g.name)).length;}
function groupIsFull(group){const g=normalizeGroup(group); return Number(g.capacity||0)>0 && groupStudentCount(g)>=Number(g.capacity||0);}
function openGroups(){return (appData.groups||[]).map(normalizeGroup).filter(g=>{const st=normalizeText(g.status||'open'); return g.name && !['closed','close','مغلق','مغلقة','مغلقة مؤقتا','مغلقة مؤقتًا'].includes(st);});}
function fillSelects(){
  const grade=document.getElementById('bookingGrade'); if(grade) grade.innerHTML=GRADES.map(g=>`<option>${esc(g)}</option>`).join('');
  const month=document.getElementById('bookingMonth'); if(month) month.innerHTML=MONTHS.map(m=>`<option>${esc(m)}</option>`).join('');
  const group=document.getElementById('bookingGroup');
  if(group){
    const groups=openGroups();
    group.innerHTML = groups.length ? groups.map(g=>{
      const used=groupStudentCount(g), cap=Number(g.capacity||0), full=cap>0&&used>=cap;
      return `<option value="${esc(g.id)}" ${full?'disabled':''} data-name="${esc(g.name)}" data-full="${full?'1':'0'}">${esc(g.name)} — ${esc(g.schedule||g.mode||'')} ${cap?`(${full?'مكتملة':'متاح '+(cap-used)+' من '+cap})`:''}</option>`;
    }).join('') : '<option value="">جار تحميل المجموعات...</option>';
    renderSelectedGroupInfo();
    group.onchange=renderSelectedGroupInfo;
  }
}
function groupOptions(){const fromData=(appData.groups||[]).map(g=>g.name||g.group||g.title).filter(Boolean); const fromStudents=(appData.students||[]).map(s=>s.group).filter(Boolean); return [...new Set([...fromData,...fromStudents])];}
function selectedBookingGroup(){const sel=document.getElementById('bookingGroup'); const id=sel?.value||''; const txt=sel?.selectedOptions?.[0]?.dataset?.name||sel?.selectedOptions?.[0]?.textContent||''; return openGroups().find(g=>normalizeText(g.id)===normalizeText(id)||normalizeText(g.name)===normalizeText(txt));}
function renderSelectedGroupInfo(){const box=document.getElementById('bookingGroupInfo'); if(!box)return; const g=selectedBookingGroup(); if(!g){ box.innerHTML='<span class="badge warn">لا توجد مجموعة متاحة الآن</span>'; return; } const used=groupStudentCount(g), cap=Number(g.capacity||0), full=cap>0&&used>=cap; box.innerHTML=`<div class="booking-group-info"><span class="badge ${full?'danger':'good'}">${full?'المجموعة مكتملة':'متاحة'}</span><b>${esc(g.name)}</b><small>${esc(g.schedule||'-')} · ${esc(g.mode||'-')} · ${cap?`المتاح ${Math.max(cap-used,0)} من ${cap}`:'بدون حد أقصى'}</small></div>`;}

function calcStudent(st){
  const attendance = getAttendanceRows(st);
  const total = attendance.length;
  const present = attendance.filter(a=>(a.status==='present'||a.status==='حاضر'||a.status==='متأخر')).length;
  const attendancePct = total ? Math.round((present/total)*100) : 0;
  const graded=(st.grades||[]).filter(g=>g.score!==''&&g.score!==undefined&&g.score!==null&&!isNaN(Number(g.score)));
  const avg=graded.length?Math.round(graded.reduce((s,g)=>s+Number(g.score),0)/graded.length):0;
  const hw=(st.homeworks||[]); const hwPct=hw.length?Math.round(hw.filter(h=>String(h.status||'').includes('تم')).length/hw.length*100):0;
  const final=Math.round(attendancePct*.3+avg*.5+hwPct*.2);
  const level= final>=90?'ممتاز':final>=75?'جيد جدًا':final>=60?'جيد':'محتاج متابعة';
  return {attendancePct,avg,hwPct,final,level,totalAttendance:total,present,absent:attendance.filter(a=>(a.status==='absent'||a.status==='غائب')).length,lastGrade:graded.at(-1)};
}
function normalizedStudent(st){const code=st?.studentCode||st?.code||st?.id||''; return {...(st||{}),id:code,code,studentCode:code,name:st?.studentName||st?.name||'',studentName:st?.studentName||st?.name||''};}
function findStudentByCode(code){const q=normalizeText(code); return (appData.students||[]).map(normalizedStudent).find(s=>normalizeText(s.code)===q || normalizeText(s.studentCode)===q) || null;}
function attendanceDocId(st,date){return `${st.studentCode||st.code}_${date}`.replace(/[\\/#?\[\]]/g,'-');}
function getAttendanceRows(st){
  const legacy=(st.attendance||[]).map(a=>({...a,status:a.status==='حاضر'?'present':a.status==='غائب'?'absent':a.status,date:String(a.date||'').replaceAll('/','-'),time:a.time||'',group:a.group||st.group}));
  return legacy.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
function attendanceSummaryHTML(st){
  const rows=getAttendanceRows(st); const total=rows.length; const present=rows.filter(a=>a.status==='present'||a.status==='حاضر'||a.status==='متأخر').length; const absent=rows.filter(a=>a.status==='absent'||a.status==='غائب').length; const pct=total?Math.round(present/total*100):0;
  return `<div class="attendance-public-card"><div class="section-head mini"><div><span class="kicker"><span data-icon="calendar"></span> الحضور والغياب</span><h3>ملخص حضور الطالب</h3></div></div><div class="metric-grid parent-metrics-v29"><div class="metric"><b>${total}</b><small>إجمالي الحصص</small></div><div class="metric"><b>${present}</b><small>أيام الحضور</small></div><div class="metric"><b>${absent}</b><small>أيام الغياب</small></div><div class="metric"><b>${pct}%</b><small>نسبة الحضور</small></div></div><div class="mobile-card-table">${rows.slice(0,12).map(r=>`<div class="mobile-row"><b>${esc(r.date||'-')}</b><span class="badge ${statusClass(r.status)}">${arStatus(r.status)}</span><small>${esc(r.time||'-')} · ${esc(r.group||st.group||'-')}</small></div>`).join('')||'<p class="section-desc">لا توجد سجلات حضور بعد.</p>'}</div><div class="table-wrap attendance-table"><table><thead><tr><th>التاريخ</th><th>الحالة</th><th>الوقت</th><th>المجموعة</th></tr></thead><tbody>${rows.slice(0,12).map(r=>`<tr><td>${esc(r.date||'-')}</td><td><span class="badge ${statusClass(r.status)}">${arStatus(r.status)}</span></td><td>${esc(r.time||'-')}</td><td>${esc(r.group||st.group||'-')}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد سجلات حضور بعد</td></tr>'}</tbody></table></div></div>`;
}
function studentPortalUrl(code){return `${location.origin}${location.pathname.replace(/[^/]*$/, 'student.html')}?code=${encodeURIComponent(code||'')}`;}
function qrValue(st){return studentPortalUrl(st.studentCode||st.code||'');}
function portalDisplayCode(st){return st?.studentCode||st?.code||'';}
function extractStudentCodeInput(value){
  const raw=String(value||'').trim();
  if(!raw) return '';
  try{
    const u=new URL(raw, location.origin);
    const c=u.searchParams.get('code') || u.searchParams.get('studentCode') || u.searchParams.get('student');
    if(c) return c.trim();
  }catch(e){}
  const m=raw.match(/(?:code|studentCode|student)=([^&\s]+)/i);
  return m ? decodeURIComponent(m[1]).trim() : raw;
}
const QR_ALPHA='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
function qrGfTables(){
  const exp=new Array(512).fill(0), log=new Array(256).fill(0); let x=1;
  for(let i=0;i<255;i++){exp[i]=x; log[x]=i; x<<=1; if(x&0x100) x^=0x11d;}
  for(let i=255;i<512;i++) exp[i]=exp[i-255];
  return {exp,log};
}
const QR_GF=qrGfTables();
function qrGfMul(x,y){return (!x||!y)?0:QR_GF.exp[(QR_GF.log[x]+QR_GF.log[y])%255];}
function qrRsDivisor(deg){
  const res=new Array(deg).fill(0); res[deg-1]=1; let root=1;
  for(let i=0;i<deg;i++){
    for(let j=0;j<deg;j++){res[j]=qrGfMul(res[j],root); if(j+1<deg) res[j]^=res[j+1];}
    root=qrGfMul(root,2);
  }
  return res;
}
function qrRsRemainder(data,deg){
  const div=qrRsDivisor(deg), rem=new Array(deg).fill(0);
  for(const b of data){const factor=b^rem.shift(); rem.push(0); for(let i=0;i<deg;i++) rem[i]^=qrGfMul(div[i],factor);}
  return rem;
}
function qrAppendBits(arr,val,len){for(let i=len-1;i>=0;i--) arr.push((val>>>i)&1);}
function qrDataCodewords(text){
  const bits=[]; qrAppendBits(bits,0b0010,4); qrAppendBits(bits,text.length,9);
  for(let i=0;i<text.length;i+=2){
    if(i+1<text.length) qrAppendBits(bits,QR_ALPHA.indexOf(text[i])*45+QR_ALPHA.indexOf(text[i+1]),11);
    else qrAppendBits(bits,QR_ALPHA.indexOf(text[i]),6);
  }
  const capacity=19*8; qrAppendBits(bits,0,Math.min(4,capacity-bits.length));
  while(bits.length%8) bits.push(0);
  const data=[]; for(let i=0;i<bits.length;i+=8){let b=0; for(let j=0;j<8;j++) b=(b<<1)|bits[i+j]; data.push(b);}
  for(let p=0;data.length<19;p++) data.push(p%2?0x11:0xec);
  return data;
}
function qrFormatBits(ecl,mask){
  const data=(ecl<<3)|mask; let rem=data;
  for(let i=0;i<10;i++) rem=(rem<<1)^(((rem>>>9)&1)*0x537);
  return ((data<<10)|rem)^0x5412;
}
function qrMatrix(value){
  const size=21, modules=Array.from({length:size},()=>Array(size).fill(false)), reserved=Array.from({length:size},()=>Array(size).fill(false));
  const set=(x,y,v)=>{if(x>=0&&x<size&&y>=0&&y<size){modules[y][x]=!!v; reserved[y][x]=true;}};
  const finder=(x,y)=>{for(let dy=-1;dy<=7;dy++)for(let dx=-1;dx<=7;dx++){const xx=x+dx, yy=y+dy; if(xx<0||xx>=size||yy<0||yy>=size) continue; const dark=dx>=0&&dx<=6&&dy>=0&&dy<=6&&(dx===0||dx===6||dy===0||dy===6||(dx>=2&&dx<=4&&dy>=2&&dy<=4)); set(xx,yy,dark);}};
  finder(0,0); finder(size-7,0); finder(0,size-7);
  for(let i=8;i<size-8;i++){set(i,6,i%2===0); set(6,i,i%2===0);}
  const f=qrFormatBits(1,0), bit=i=>((f>>>i)&1)===1;
  for(let i=0;i<6;i++) set(8,i,bit(i)); set(8,7,bit(6)); set(8,8,bit(7)); set(7,8,bit(8));
  for(let i=9;i<15;i++) set(14-i,8,bit(i));
  for(let i=0;i<8;i++) set(size-1-i,8,bit(i));
  for(let i=8;i<15;i++) set(8,size-15+i,bit(i));
  set(8,size-8,true);
  const data=qrDataCodewords(value), all=data.concat(qrRsRemainder(data,7)), bits=[];
  for(const b of all) for(let i=7;i>=0;i--) bits.push((b>>>i)&1);
  let idx=0, upward=true;
  for(let x=size-1;x>0;x-=2){
    if(x===6) x--;
    for(let step=0;step<size;step++){
      const y=upward ? size-1-step : step;
      for(const dx of [0,1]){const xx=x-dx; if(!reserved[y][xx]){let v=idx<bits.length?bits[idx++]:0; if((xx+y)%2===0) v^=1; modules[y][xx]=!!v;}}
    }
    upward=!upward;
  }
  return modules;
}
function makeQR(value){
  const text=String(value||'').trim();
  if(!text) return `<div class="qr-card real-qr-svg"><span>NO CODE</span></div>`;
  return `<div class="qr-card real-qr-svg" title="${esc(text)}"><img class="real-qr-img" src="https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=220&margin=2" alt="QR"></div>`;
}
function studentProfileHTML(raw, isParent=false){
  const st=normalizedStudent(raw); const c=calcStudent(st);
  const attempts=[...(st.examAttempts||[]),...(appData.examAttempts||[]).filter(a=>a.studentCode===st.studentCode||a.studentCode===st.code)];
  const grades=[...(st.grades||[]),...attempts];
  const homeworks=st.homeworks||[];
  const lastGrade=grades.filter(g=>g.score!==undefined&&g.score!==null&&g.score!=='').slice(-1)[0];
  const lastHomework=homeworks.slice(-1)[0];
  const payClass=st.paid?'good':'danger';
  const nextAction=c.final>=75?'استمر على نفس المستوى وادخل Challenge جديد.':'راجع آخر واجب وافتح صفحة العملي للتدريب مرة أخرى.';
  const gradeRows=grades.length?grades.slice(-10).reverse().map(g=>`<div class="mobile-row"><b>${esc(g.exam||g.examTitle||'Coding Challenge')}</b><span class="badge ${g.score!==null&&g.score!==undefined?'good':'warn'}">${g.score!==null&&g.score!==undefined?esc(g.score)+'%':'بانتظار التصحيح'}</span><small>${esc(g.date||g.submittedAt||'')}</small></div>`).join(''):'<p class="section-desc">لا توجد اختبارات مسجلة.</p>';
  const hwRows=homeworks.length?homeworks.slice(-10).reverse().map(h=>`<div class="mobile-row"><b>${esc(h.title||'واجب')}</b><span class="badge ${String(h.status||'').includes('تم')?'good':'warn'}">${esc(h.status||'بانتظار التسليم')}</span><small>${esc(h.date||h.createdAt||'')}</small></div>`).join(''):'<p class="section-desc">لا توجد تدريبات مسجلة.</p>';
  return `<div class="student-profile student-dev-dashboard-v41">
    <div class="student-cover-v41">
      <div class="student-cover-info-v41"><span class="kicker"><span data-icon="user-check"></span> ${isParent?'تقرير ولي الأمر':'Student Dashboard'}</span><h2>أهلاً يا ${esc(st.name||'طالب Techno Minds')}</h2><p>جاهز تكمل تدريبك العملي؟ الكود: <b>${esc(st.studentCode)}</b> · ${esc(st.grade||'-')} · ${esc(st.group||'-')}</p><div class="hero-cta"><a class="btn primary" href="practical.html"><span data-icon="code"></span> دخول العملي</a><a class="btn ghost" href="exams.html"><span data-icon="clipboard"></span> Coding Challenges</a><a class="btn gold" href="materials.html"><span data-icon="book-open"></span> Materials</a><a class="btn ghost" href="online-lectures.html?code=${encodeURIComponent(st.studentCode||st.code||'')}"><span data-icon="video"></span> محاضرات الأونلاين</a></div></div>
      <div class="student-qr-card-v41"><b>QR الطالب</b>${makeQR(qrValue(st))}<small>${esc(portalDisplayCode(st))}</small></div>
    </div>
    <div class="metric-grid student-summary-grid-v41"><div class="metric"><b>${c.final}%</b><small>المستوى العام</small></div><div class="metric"><b>${c.avg}%</b><small>متوسط الدرجات</small></div><div class="metric"><b>${c.attendancePct}%</b><small>نسبة الحضور</small></div><div class="metric"><b>${c.hwPct}%</b><small>إنجاز الواجبات</small></div><div class="metric"><b class="pay-${st.paid?'ok':'no'}">${st.paid?'تم الدفع':'لم يدفع'}</b><small>حالة الدفع</small></div><div class="metric"><b>${c.totalAttendance}</b><small>عدد الحصص</small></div></div>
    <div class="grid grid-4 student-pulse-v41">
      <div class="card"><span class="iconbox" data-icon="book-open"></span><small>Last Session</small><h3>${esc(st.lastSession||'Input & Output')}</h3><p>${esc(st.lastSessionNote||'تطبيق عملي على الإدخال والطباعة ومراجعة أول كود.')}</p></div>
      <div class="card"><span class="iconbox" data-icon="clipboard"></span><small>Homework</small><h3>${esc(lastHomework?.title||'Welcome Program')}</h3><p>${esc(lastHomework?.status||'برنامج يسأل عن الاسم والسن ويطبع رسالة منظمة.')}</p></div>
      <div class="card"><span class="iconbox" data-icon="star"></span><small>Latest Assessment</small><h3>${esc(lastGrade?.exam||lastGrade?.examTitle||'تقييم الحصة')}</h3><p>${lastGrade?`النتيجة: ${esc(lastGrade.score)}%`:'النتيجة تظهر بعد التسليم والمتابعة.'}</p></div>
      <div class="card action"><span class="iconbox" data-icon="sparkles"></span><small>Next Step</small><h3>الخطوة التالية</h3><p>${esc(nextAction)}</p></div>
    </div>
    <div class="grid grid-2 student-info-grid-v41"><div class="card"><h3>ملاحظات الإدارة</h3><p>${esc(st.notes||'لا توجد ملاحظات حالية.')}</p></div><div class="card"><h3>بيانات الطالب</h3><p>المجموعة: <b>${esc(st.group||'-')}</b><br/>المستوى: <b>${esc(st.grade||'-')}</b><br/>كود الدخول: <b>${esc(st.studentCode||'-')}</b></p></div></div>
    ${studentLearningHTML(st)}
    ${attendanceSummaryHTML(st)}
    <div class="grid grid-2 student-records-v41"><div class="card"><h3>سجل الاختبارات والدرجات</h3>${gradeRows}</div><div class="card"><h3>التدريبات والواجبات</h3>${hwRows}${!isParent?`<form class="homework-upload-form" data-student-code="${esc(st.studentCode)}"><input type="file" name="file" accept="image/*,application/pdf"><button class="btn ghost" type="submit"><span data-icon="upload"></span> رفع واجب</button></form>`:''}</div></div>
  </div>`;
}
async function loadStudentForPortal(code){
  const clean=extractStudentCodeInput(code);
  if(window.MFCloud?.ready && window.MFCloud.getStudentByCode){try{return await window.MFCloud.getStudentByCode(clean);}catch(e){}}
  return findStudentByCode(clean);
}
async function setupStudent(){
  const form=document.getElementById('studentSearchForm'); if(!form) return;
  const runSearch=async(code)=>{ code=extractStudentCodeInput(code); const box=document.getElementById('studentResult'); if(!code||!box) return; box.innerHTML='<div class="skeleton" style="height:160px"></div>'; const st=await loadStudentForPortal(code); if(!st){box.innerHTML=`<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="search"></span><h3>لم يتم العثور على طالب بهذا الكود.</h3><p>دخول الطالب أصبح بالكود فقط لحماية البيانات.</p></div>`; hydrateIcons(); return;} box.innerHTML=studentProfileHTML(st,false); bindHomeworkForms(); hydrateIcons(); };
  form.addEventListener('submit', async e=>{e.preventDefault(); const code=extractStudentCodeInput(form.querySelector('[name="query"],#studentQuery')?.value); await runSearch(code);});
  const urlCode=new URLSearchParams(location.search).get('code');
  if(urlCode){ const clean=extractStudentCodeInput(urlCode); const input=form.querySelector('[name="query"],#studentQuery'); if(input) input.value=clean; runSearch(clean); }
}
var parentQrScanner = null;
var lastParentStudent = null;

function studentReportRows(st){
  const attendance = getAttendanceRows(st);
  const grades = [...(st.grades||[]),...(st.examAttempts||[])];
  const homeworks = st.homeworks || [];
  return { attendance, grades, homeworks };
}

function parentReportText(raw){
  const st = normalizedStudent(raw);
  const c = calcStudent(st);
  const rows = studentReportRows(st);
  const lastGrade = rows.grades.filter(g=>g.score!==undefined && g.score!==null && g.score!=='').slice(-1)[0];
  const lastAttendance = rows.attendance.slice(0,6).map(r=>`- ${r.date || '-'}: ${arStatus(r.status)} ${r.time ? '('+r.time+')' : ''}`).join('\n') || '- لا توجد سجلات حضور بعد';
  return `تقرير متابعة مستوى ${monthLabel(st)}\n\nالطالب: ${st.name || '-'}\nالكود: ${st.studentCode || '-'}\nالمستوى الدراسي: ${st.grade || '-'}\nالمجموعة: ${st.group || '-'}\n\nملخص الحالة:\n- المستوى العام: ${c.final}% - ${c.level}\n- نسبة الحضور: ${c.attendancePct}%\n- متوسط الدرجات: ${c.avg}%\n- حالة الدفع: ${st.paid ? 'تم الدفع' : 'لم يدفع'}\n\nآخر درجة: ${lastGrade ? (lastGrade.exam || lastGrade.examTitle || 'اختبار') + ' - ' + (lastGrade.score ?? 'بانتظار التصحيح') : 'لا توجد درجات بعد'}\n\nالحضور والغياب:\n${lastAttendance}\n\nملاحظات الإدارة:\n${st.notes || 'لا توجد ملاحظات حالية.'}\n\nمع تحيات تيكنو مايندز`;
}

function parentReportHTML(raw){
  const st = normalizedStudent(raw);
  const c = calcStudent(st);
  const rows = studentReportRows(st);
  const grades = rows.grades.slice(-8).reverse();
  const hw = rows.homeworks.slice(-6).reverse();
  const payClass = st.paid ? 'good' : 'danger';
  const teacherName = appData.settings?.teacherName || 'تيكنو مايندز';
  const today = new Date().toLocaleDateString('ar-EG');
  return `<div class="parent-monthly-report-v40" id="parentMonthlyReport">
    <div class="parent-report-cover-v40">
      <div class="parent-report-brand-v40">
        <span class="teacher-name-v40">${esc(teacherName)}</span>
        <span class="report-date-v40">${esc(today)}</span>
      </div>
      <div class="parent-report-cover-content-v40">
        <div class="parent-report-main-v40">
          <span class="kicker"><span data-icon="file-text"></span> تقرير ولي الأمر المستوىي</span>
          <h2>${esc(st.name || '-')}</h2>
          <p>تقرير متابعة مستوى <b>${esc(monthLabel(st))}</b> · كود الطالب: <b>${esc(st.studentCode)}</b></p>
          <div class="parent-report-tags-v40">
            <span>${esc(st.grade || '-')}</span>
            <span>${esc(st.group || '-')}</span>
            <span class="badge ${payClass}">${st.paid?'تم الدفع':'لم يدفع'}</span>
          </div>
        </div>
        <div class="parent-report-qr-v40"><b>QR الطالب</b>${makeQR(qrValue(st))}<small>الكود: ${esc(portalDisplayCode(st))}</small></div>
      </div>
    </div>
    <div class="parent-actions-v38 no-print">
      <button class="btn primary" onclick="window.print()"><span data-icon="file-text"></span> طباعة / حفظ PDF</button>
      <button class="btn ghost" onclick="copyParentReport('${esc(st.studentCode)}')"><span data-icon="clipboard"></span> نسخ التقرير</button>
      <button class="btn whatsapp-report-btn" onclick="openParentWhatsApp('${esc(st.studentCode)}')"><span data-icon="phone"></span> إرسال واتساب</button>
    </div>
    <div class="metric-grid parent-report-metrics-v40">
      <div class="metric main-metric-v40"><b>${c.final}%</b><small>المستوى العام</small></div>
      <div class="metric"><b>${c.attendancePct}%</b><small>نسبة الحضور</small></div>
      <div class="metric"><b>${c.avg}%</b><small>متوسط الدرجات</small></div>
      <div class="metric"><b>${c.totalAttendance}</b><small>إجمالي الحصص</small></div>
      <div class="metric"><b>${c.present}</b><small>حضور</small></div>
      <div class="metric"><b>${c.absent}</b><small>غياب</small></div>
    </div>
    <div class="parent-status-card-v40 ${c.final>=75?'good':'warn'}">
      <div><span>الحالة العامة</span><h3>${esc(c.level)}</h3></div>
      <p>${c.final>=75?'المستوى مطمئن، حافظوا على نفس الالتزام.':'محتاج متابعة منتظمة في الحضور والتدريبات والدرجات.'}</p>
    </div>
    ${attendanceSummaryHTML(st)}
    <div class="parent-detail-grid-v40">
      <div class="mini-panel parent-panel-v40">
        <h3>الدرجات والاختبارات</h3>
        ${grades.length?grades.map(g=>`<div class="report-list-row-v40"><div><b>${esc(g.exam||g.examTitle||'اختبار')}</b><small>${esc(g.date||g.submittedAt||'')}</small></div><span class="badge ${g.score!==null&&g.score!==undefined?'good':'warn'}">${g.score!==null&&g.score!==undefined?esc(g.score)+'%':'بانتظار التصحيح'}</span></div>`).join(''):'<p class="section-desc">لا توجد درجات مسجلة بعد.</p>'}
      </div>
      <div class="mini-panel parent-panel-v40">
        <h3>التدريبات والمتابعة</h3>
        ${hw.length?hw.map(h=>`<div class="report-list-row-v40"><div><b>${esc(h.title||h.homeworkTitle||'واجب')}</b><small>${esc(h.date||'')}</small></div><span class="badge ${String(h.status||'').includes('تم')?'good':'warn'}">${esc(h.status||'-')}</span></div>`).join(''):'<p class="section-desc">لا توجد تدريبات مسجلة بعد.</p>'}
      </div>
      <div class="mini-panel parent-panel-v40 parent-notes-v40">
        <h3>ملاحظات ${esc(teacherName)}</h3>
        <p>${esc(st.notes||'لا توجد ملاحظات حالية.')}</p>
      </div>
      <div class="mini-panel parent-panel-v40 parent-pay-v40">
        <h3>الدفع والمستوى</h3>
        <p><b>المستوى:</b> ${esc(monthLabel(st))}</p>
        <p><b>حالة الدفع:</b> <span class="badge ${payClass}">${st.paid?'تم الدفع':'لم يدفع'}</span></p>
        ${st.paymentDate?`<p><b>تاريخ الدفع:</b> ${esc(st.paymentDate)}</p>`:''}
      </div>
    </div>
    <div class="report-footer-v40">مع تحيات ${esc(teacherName)}</div>
  </div>`;
}

async function showParentReportByCode(code){
  code=extractStudentCodeInput(code);
  const box=document.getElementById('parentResult');
  if(!code){toast('اكتب كود الطالب أو امسح QR'); return;}
  if(box) box.innerHTML='<div class="skeleton" style="height:160px"></div>';
  let st=null;
  if(window.MFCloud?.ready && window.MFCloud.getParentStudent){
    try{st=await window.MFCloud.getParentStudent(code);}catch(e){}
  }
  if(!st) st=findStudentByCode(code);
  if(!st){
    if(box) box.innerHTML=`<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="search"></span><h3>لم يتم العثور على طالب بهذا الكود.</h3><p>تأكد من كتابة كود الطالب أو امسح QR الصحيح.</p></div>`;
    hydrateIcons();
    return;
  }
  lastParentStudent = normalizedStudent(st);
  const input=document.querySelector('#parentSearchForm [name="studentCode"]'); if(input) input.value=lastParentStudent.studentCode;
  if(box) box.innerHTML=parentReportHTML(lastParentStudent);
  hydrateIcons();
}

async function setupParent(){
  const form=document.getElementById('parentSearchForm'); if(!form) return;
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const code=extractStudentCodeInput(form.querySelector('[name="studentCode"],[name="code"],[name="query"]')?.value);
    await showParentReportByCode(code);
  });
}

window.copyParentReport = async function(code){
  const st = (lastParentStudent && lastParentStudent.studentCode===code) ? lastParentStudent : findStudentByCode(code);
  if(!st) return toast('لم يتم العثور على الطالب');
  try{await navigator.clipboard.writeText(parentReportText(st)); toast('تم نسخ التقرير');}
  catch(e){toast('تعذر النسخ، جرّب من متصفح أحدث');}
};

window.openParentWhatsApp = function(code){
  const st = (lastParentStudent && lastParentStudent.studentCode===code) ? lastParentStudent : findStudentByCode(code);
  if(!st) return toast('لم يتم العثور على الطالب');
  const phone = whatsappPhone(st.parentPhone);
  if(!phone) return toast('رقم ولي الأمر غير موجود في بيانات الطالب');
  window.open(whatsappLink(phone, parentReportText(st)), '_blank');
};

window.openParentQrScanner = async function(){
  const modal=document.getElementById('parentQrModal'); const reader=document.getElementById('parentQrReader');
  if(!modal || !reader) return;
  modal.hidden=false; reader.innerHTML='';
  try{
    const onDecoded = async decoded => { await closeParentQrScanner(); await showParentReportByCode(String(decoded||'').trim()); };
    if(window.Html5Qrcode){
      parentQrScanner = new Html5Qrcode('parentQrReader');
      await parentQrScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:250}}, onDecoded);
    } else if('BarcodeDetector' in window){
      reader.innerHTML='<video id="parentQrVideo" autoplay playsinline></video>';
      const video=document.getElementById('parentQrVideo');
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      video.srcObject=stream;
      const detector=new BarcodeDetector({formats:['qr_code']});
      const loop=async()=>{ if(modal.hidden) return; const codes=await detector.detect(video).catch(()=>[]); if(codes.length) return onDecoded(codes[0].rawValue); setTimeout(loop,700); };
      loop();
    } else {
      reader.innerHTML='<p class="section-desc">المتصفح لا يدعم ماسح QR. استخدم إدخال الكود اليدوي.</p>';
    }
  }catch(e){
    reader.innerHTML='<p class="section-desc">تعذر فتح الكاميرا. افتح الموقع من HTTPS واسمح باستخدام الكاميرا.</p>';
  }
};

window.closeParentQrScanner = async function(){
  try{ if(parentQrScanner){ await parentQrScanner.stop(); parentQrScanner.clear(); parentQrScanner=null; } }catch(e){}
  const v=document.getElementById('parentQrVideo'); if(v?.srcObject) v.srcObject.getTracks().forEach(t=>t.stop());
  const modal=document.getElementById('parentQrModal'); if(modal) modal.hidden=true;
};
function bindHomeworkForms(){document.querySelectorAll('.homework-upload-form').forEach(form=>{form.onsubmit=async e=>{e.preventDefault(); const file=form.querySelector('input[type=file]').files[0]; const code=form.dataset.studentCode; if(!file) return toast('اختار ملف الواجب أولًا'); if(file.size>10*1024*1024) return toast('حجم الملف أكبر من المسموح'); try{if(window.MFCloud?.uploadHomework){await window.MFCloud.uploadHomework(file,code); toast('تم رفع الواجب بنجاح');} else toast('تعذر رفع الواجب، حاول لاحقًا.');}catch(err){toast('تعذر رفع الواجب، حاول لاحقًا.');}};});}
function setupBooking(){
  const form=document.getElementById('bookingForm');
  if(form && !form.dataset.tmBookingBound){
    form.dataset.tmBookingBound='1';
    form.dataset.safeBookingBound='1';
    form.addEventListener('submit', async e=>{
      e.preventDefault();
      window.__mainBookingHandled = true;
      const submitBtn = form.querySelector('button[type="submit"]');
      if(submitBtn){ submitBtn.disabled=true; submitBtn.dataset.oldText=submitBtn.innerHTML; submitBtn.innerHTML='جار تسجيل الطالب...'; }
      try{
        const b=Object.fromEntries(new FormData(form).entries());
        if(!String(b.name||'').trim()) return toast('اكتب اسم الطالب');
        if(!String(b.studentPhone||'').trim()) return toast('اكتب رقم الطالب');
        if(!String(b.parentPhone||'').trim()) return toast('اكتب رقم ولي الأمر');
        if(phoneDigits(b.studentPhone)===phoneDigits(b.parentPhone)) toast('تم التسجيل، ويفضل لاحقًا إضافة رقم ولي أمر مختلف للمتابعة.');
        b.code=b.code||uid('ST');
        b.id=b.code;
        b.studentCode=b.code;
        b.studentName=b.name;
        b.date=isoDate();
        b.createdAt=new Date().toISOString();
        b.status='بانتظار الموافقة';
        // مهم: لو الطالب ضغط تسجيل قبل ما Firebase يخلص تحميل المجموعات، نستنى التحميل ونحاول تاني
        if(window.__bookingGroupsLoading){
          try{ await window.__bookingGroupsLoading; }catch(err){}
        }
        let g=selectedBookingGroup();
        if(!g){
          try{ await loadBookingGroupsDirect(); }catch(err){}
          g=selectedBookingGroup();
        }
        if(!g){ toast('لا توجد مجموعة متاحة حاليًا، تأكد أن صفحة الحجز محملة من Firebase وليس LocalStorage'); return; }
        if(groupIsFull(g)){ toast('المجموعة المختارة مكتملة، اختار مجموعة أخرى'); fillSelects(); return; }
        b.groupId=g.id;
        b.group=g.name;
        b.groupName=g.name;
        b.groupSchedule=g.schedule;
        b.groupMode=g.mode;

        appData=mergeData(loadData());
        appData.bookings=Array.isArray(appData.bookings)?appData.bookings:[];
        const oldIndex = appData.bookings.findIndex(x=>normalizeText(x.code)===normalizeText(b.code));
        if(oldIndex>=0) appData.bookings[oldIndex]=b; else appData.bookings.unshift(b);
        saveData(appData);
        try{ localStorage.setItem('last_booking_code', b.code); }catch(err){}
        try{ if(window.MFCloud?.ready && window.MFCloud?.createBooking){ await window.MFCloud.createBooking(b); } }catch(err){}
        renderBookingSuccess(b);
        renderBookingPreview();
        renderBookingStatusResult(b.code);
        toast('تم تسجيل الطالب بنجاح وظهر كود المتابعة');
        form.reset();
        fillSelects();
      } finally {
        if(submitBtn){ submitBtn.disabled=false; submitBtn.innerHTML=submitBtn.dataset.oldText||'تسجيل الطالب'; }
      }
    });
  }
  const statusForm=document.getElementById('bookingStatusForm'); if(statusForm && !statusForm.dataset.tmStatusBound){statusForm.dataset.tmStatusBound='1'; statusForm.addEventListener('submit',async e=>{e.preventDefault(); const code=statusForm.querySelector('[name="code"]').value.trim(); appData=mergeData(loadData()); await renderBookingStatusResult(code);});}
}
function renderBookingSuccess(b){const box=document.getElementById('bookingSuccess'); if(!box) return; box.hidden=false; box.innerHTML=`<div class="booking-success-card"><span class="badge good">تم تسجيل الطالب بنجاح</span><h3>${esc(b.name)}</h3><div class="grid grid-2"><p><b>كود الطالب/التسجيل:</b> ${esc(b.code)}</p><p><b>المستوى الدراسي:</b> ${esc(b.grade)}</p><p><b>المستوى:</b> ${esc(b.month)}</p><p><b>المجموعة:</b> ${esc(b.group)}</p></div><div class="hero-cta"><button class="btn ghost" onclick="copyBookingCode('${esc(b.code)}')"><span data-icon="clipboard"></span> نسخ الكود</button><a class="btn primary" target="_blank" rel="noreferrer" href="${whatsappLink(appData.settings?.teacherPhone||TEACHER_WHATSAPP,`تم تسجيل طالب جديد ${b.name} - الكود ${b.code}`)}"><span data-icon="send"></span> تواصل واتساب</a></div></div>`; hydrateIcons();}
window.copyBookingCode=function(code){navigator.clipboard?.writeText(code); toast('تم نسخ الكود');};
function renderBookingPreview(){const box=document.getElementById('bookingPreview'); if(!box) return; const count=(appData.bookings||[]).length; box.innerHTML=count?`آخر التسجيلات المسجلة: <b>${count}</b> — لا تظهر بيانات التسجيل كاملة إلا للإدارة.`:'لا توجد تسجيلات مسجلة حاليًا.';}
async function renderBookingStatusResult(code){
  const box=document.getElementById('bookingStatusResult'); if(!box) return;
  const clean=extractStudentCodeInput(code);
  if(!clean){ box.innerHTML=''; return; }
  let b=(appData.bookings||[]).find(x=>normalizeText(x.code||x.studentCode)===normalizeText(clean));
  if(!b && window.MFCloud?.ready && window.MFCloud.getBookingByCode){
    try{ b=await window.MFCloud.getBookingByCode(clean); }catch(e){}
  }
  if(!b && window.MFCloud?.ready && window.MFCloud.getStudentByCode){
    try{ const st=await window.MFCloud.getStudentByCode(clean); if(st) b={...st,status:'مقبول'}; }catch(e){}
  }
  const status = b?.status || (b?.approved ? 'مقبول' : 'بانتظار الموافقة');
  const cls = status==='مقبول' ? 'good' : 'warn';
  box.innerHTML=b?`<div class="mobile-row"><b>${esc(b.name||b.studentName)}</b><span class="badge ${cls}">${esc(status)}</span><small>${esc(b.grade||'')} · ${esc(b.month||'')} · ${esc(b.group||'')}</small>${status==='مقبول'?`<a class="btn primary small" href="student.html?code=${encodeURIComponent(clean)}">فتح بوابة الطالب</a>`:''}</div>`:`<p class="section-desc">لم يتم العثور على تسجيل بهذا الكود.</p>`;
}
function renderHomeCounts(){const el=document.getElementById('liveCounts'); if(!el)return; el.innerHTML=`<div class="stat"><b>Python</b><small>بداية من الصفر</small></div><div class="stat"><b>Online / Offline</b><small>حضور حسب المجموعة</small></div><div class="stat"><b>Baccalaureate</b><small>تأهيل منظم</small></div>`;}
function renderPublicLeaderboard(){const box=document.getElementById('publicLeaderboard'); if(!box) return; const rows=(appData.students||[]).map(normalizedStudent).map(st=>({st,c:calcStudent(st)})).sort((a,b)=>b.c.final-a.c.final).slice(0,3); box.innerHTML=rows.length?rows.map((x,i)=>`<div class="card"><span class="badge good">#${i+1}</span><h3>${esc(x.st.name)}</h3><p>${esc(x.st.grade||'')}</p><div class="progress"><span style="width:${x.c.final}%"></span></div><b>${x.c.final}%</b></div>`).join(''):`<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="star"></span><h3>لا توجد بيانات طلاب بعد</h3><p>لن يتم عرض بيانات تجريبية في الإنتاج.</p></div>`; hydrateIcons();}
function setupReviews(){const form=document.getElementById('reviewForm'); if(!form || form.dataset.tmReviewBound) return; form.dataset.tmReviewBound='1'; setupStarInputs(); form.addEventListener('submit',async e=>{e.preventDefault(); const r=Object.fromEntries(new FormData(form).entries()); r.id='rev-'+Date.now(); r.date=isoDate(); r.approved=true; r.featured=false; appData=mergeData(loadData()); appData.reviews=Array.isArray(appData.reviews)?appData.reviews:[]; appData.reviews.unshift(r); saveData(appData); try{if(window.MFCloud?.saveReview) await window.MFCloud.saveReview(r);}catch(err){} toast('تم نشر التقييم بنجاح'); form.reset(); setupStarInputs(); if(window.MFCloud?.ready && window.MFCloud.loadSiteData){ try{ const fresh=await window.MFCloud.loadSiteData(); if(fresh){ appData=mergeData(fresh); saveData(appData); } }catch(err){} } renderReviews();});}
function setupStarInputs(){document.querySelectorAll('[data-star-input]').forEach(w=>{const input=w.querySelector('input'); const label=w.querySelector('span'); const buttons=[...w.querySelectorAll('button')]; const paint=n=>{buttons.forEach(b=>b.classList.toggle('active',Number(b.dataset.rate)<=n)); if(label) label.textContent=n+' نجوم';}; buttons.forEach(b=>b.onclick=()=>{input.value=b.dataset.rate; paint(Number(b.dataset.rate));}); paint(Number(input?.value||5));});}
function renderReviews(){const box=document.getElementById('reviewsList'); if(!box) return; appData=mergeData(loadData()); const rows=(appData.reviews||[]).filter(r=>r.approved!==false && r.hidden!==true).slice(0,12); box.innerHTML=rows.length?rows.map(r=>`<div class="card tm-review-mini"><div class="review-stars">${'★'.repeat(Number(r.rating||5))}</div><div class="tm-review-mini-head"><h3>${esc(r.name)}</h3><span class="badge">${esc(r.role||'طالب')}</span></div><p>${esc(r.text||'')}</p></div>`).join(''):`<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="star"></span><h3>لا توجد تقييمات منشورة بعد</h3><p>كن أول شخص يكتب رأيه.</p></div>`; hydrateIcons();}
function fmtFileSize(bytes){const n=Number(bytes||0); if(!n) return ''; if(n<1024) return n+' B'; if(n<1024*1024) return (n/1024).toFixed(1)+' KB'; return (n/1024/1024).toFixed(1)+' MB';}
function fmtShortDate(v){if(!v) return ''; try{return new Date(v).toLocaleDateString('ar-EG');}catch{return String(v||'');}}
function materialMetaHtml(item){const parts=[item.type||item.category, item.week, item.group||item.targetGroup||'كل المجموعات', item.fileName, fmtFileSize(item.size), item.uploadedAt?('تاريخ الرفع: '+fmtShortDate(item.uploadedAt)):item.createdAt?('تاريخ الإضافة: '+fmtShortDate(item.createdAt)):''].filter(Boolean); return parts.length?`<div class="resource-meta material-file-meta">${parts.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:'';}
function attachmentHtml(item){const url=item.fileData||item.fileUrl||item.link||item.url||''; if(!url) return ''; if(String(item.fileType||item.contentType||'').includes('image')||/\.(png|jpe?g|webp|gif)$/i.test(url)) return `<img class="attach-preview" src="${esc(url)}" alt="${esc(item.title||'ملف')}"><div class="hero-cta compact-actions"><a class="btn ghost" target="_blank" rel="noreferrer" href="${esc(url)}">فتح الصورة</a><a class="btn primary" target="_blank" rel="noreferrer" download href="${esc(url)}">تحميل</a></div>`; return `<div class="hero-cta compact-actions"><a class="btn ghost" target="_blank" rel="noreferrer" href="${esc(url)}"><span data-icon="external-link"></span> فتح الملف</a><a class="btn primary" target="_blank" rel="noreferrer" download href="${esc(url)}"><span data-icon="download"></span> تحميل</a></div>`;}
function resourceCard(x, kind){return `<div class="card resource-card"><div class="resource-top"><span class="iconbox" data-icon="${kind==='question'?'help-circle':'book-open'}"></span><span class="badge">${esc(x.group||x.targetGroup||x.grade||'كل المجموعات')}</span></div><h3>${esc(x.title||'بدون عنوان')}</h3><p>${esc(x.desc||x.content||'')}</p>${kind==='material'?materialMetaHtml(x):''}${attachmentHtml(x)}${x.answer?`<div class="written-box">الإجابة: ${esc(x.answer)}</div>`:''}</div>`;}

function targetMatchesStudent(item, st){
  const g=String(item.group||item.targetGroup||'').trim();
  if(!g || g==='كل المجموعات' || g==='كل الطلاب') return true;
  return normalizeText(g)===normalizeText(st.group||'') || normalizeText(g)===normalizeText(st.groupId||'');
}
function courseCard(c){return `<article class="card resource-card-v31"><span class="badge good">كورس</span><h3>${esc(c.title||'كورس')}</h3><p>${esc(c.desc||'')}</p><div class="resource-meta"><span>${esc(c.grade||'-')}</span><span>${esc(c.group||'كل المجموعات')}</span><span>${esc(c.status||'متاح')}</span></div></article>`;}
function lectureCard(l){const open=l.fileUrl||l.link; return `<article class="card resource-card-v31"><span class="badge">محاضرة</span><h3>${esc(l.title||'محاضرة')}</h3><p>${esc(l.desc||'')}</p><div class="resource-meta"><span>${esc(l.course||'-')}</span><span>${esc(l.date||'')}</span><span>${esc(l.time||'')}</span></div>${open?`<a class="btn ghost" href="${esc(open)}" target="_blank" rel="noreferrer"><span data-icon="external-link"></span> فتح المحتوى</a>`:''}</article>`;}
function studentLearningHTML(st){
  const items=(appData.materials||[]).filter(m=>targetMatchesStudent(m,st) && String(m.status||'منشور')!=='مخفي');
  const row=m=>{ const u=m.fileUrl||m.link||m.url||''; const meta=[m.type||m.category,m.week,m.group||m.targetGroup||'كل المجموعات',m.fileName,fmtFileSize(m.size),m.uploadedAt?('رفع: '+fmtShortDate(m.uploadedAt)):''].filter(Boolean).join(' • '); return `<div class="mobile-row material-student-row"><b>${esc(m.title||'محتوى')}</b><small>${esc(meta)}</small>${m.desc?`<p>${esc(m.desc)}</p>`:''}${u?`<div class="mobile-actions"><a class="small-btn primary" href="${esc(u)}" target="_blank" rel="noreferrer">فتح</a><a class="small-btn" href="${esc(u)}" download target="_blank" rel="noreferrer">تحميل</a></div>`:''}</div>`};
  const lessons=items.filter(x=>['محاضرة','شرح','فيديو','لينك'].some(t=>String(x.type||x.category||'').includes(t))).slice(0,8).map(row).join('');
  const files=items.filter(x=>!['محاضرة','شرح','فيديو','لينك'].some(t=>String(x.type||x.category||'').includes(t))).slice(0,10).map(row).join('');
  return `<div class="grid grid-2 student-learning-grid"><div class="card"><h3>المحاضرات والشرح</h3>${lessons||'<p class="section-desc">لا يوجد شرح منشور لك حاليًا.</p>'}</div><div class="card"><h3>الملفات والواجبات</h3>${files||'<p class="section-desc">لا توجد ملفات أو واجبات منشورة بعد.</p>'}</div></div>`;
}

function renderUnifiedResourcesPage(){const m=document.getElementById('materialsPageGrid'); const q=document.getElementById('questionsPageGrid'); if(m) m.innerHTML=(appData.materials||[]).length?(appData.materials||[]).map(x=>resourceCard(x,'material')).join(''):'<p class="section-desc">لا يوجد محتوى مضاف حاليًا.</p>'; if(q) q.innerHTML=(appData.questions||[]).length?(appData.questions||[]).map(x=>resourceCard(x,'question')).join(''):'<p class="section-desc">لا توجد أسئلة مضافة حاليًا.</p>'; hydrateIcons();}
function renderExamQuestionsHtml(questions){return questions.map((q,i)=>`<div class="exam-question"><h3>${i+1}. ${esc(q.question)}</h3>${q.type==='essay'?`<textarea class="exam-answer-code" name="q${i}" placeholder="اكتب إجابتك أو الكود هنا" required></textarea>`:`<div class="grid">${q.options.map((o,oi)=>`<label class="option-card"><input type="radio" name="q${i}" value="${oi}" required> ${esc(q.optionLabels?.[oi] ? q.optionLabels[oi] + ') ' : '')}${esc(o)}</label>`).join('')}</div>`}<details class="exam-inline-code"><summary>مكان كتابة كود للسؤال ده</summary><div class="exam-code-runner"><div class="exam-code-toolbar"><b>سؤال_${i+1}.py</b><button type="button" class="btn ghost mini-run" data-run-exam-code><span data-icon="sparkles"></span> تشغيل</button></div><textarea name="q${i}_code" class="exam-code-editor mini" spellcheck="false" placeholder="اكتب الكود هنا لو السؤال محتاج حل برمجي..."></textarea><pre class="tm-output exam-mini-output">الناتج</pre></div></details></div>`).join('');}
function cleanAnswerLine(line){return String(line||'').replace(/^(answer|correct|الإجابة|الاجابة|الإجابة الصحيحة|الاجابة الصحيحة)\s*[:=：-]?\s*/i,'').trim();}
function parseOptionLine(line){
  const raw=String(line||'').trim();
  let m=raw.match(/^([A-Da-dأإابجدهـه]|[1-4])\s*[\)\.\-:：]\s*(.+)$/);
  if(m) return {label:m[1].replace('إ','أ').replace('هـ','ه'), text:m[2].trim()};
  m=raw.match(/^-\s*(.+)$/);
  if(m) return {label:'', text:m[1].trim()};
  return null;
}
function parseExamQuestions(text){
  const blocks=String(text||'').split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  return blocks.map(block=>{
    const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);
    const answerLine=lines.find(l=>/^(answer|correct|الإجابة|الاجابة|الإجابة الصحيحة|الاجابة الصحيحة)\s*[:=：-]?/i.test(l));
    const answer=answerLine?cleanAnswerLine(answerLine):'';
    const optionObjs=[];
    const questionLines=[];
    lines.forEach(l=>{
      if(l===answerLine) return;
      const opt=parseOptionLine(l);
      if(opt) optionObjs.push(opt); else questionLines.push(l.replace(/^س\d*\s*[:\-]?\s*/,'').trim());
    });
    const q=(questionLines[0]||lines[0]||'سؤال').replace(/^س\d*\s*[:\-]?\s*/,'').trim();
    if(optionObjs.length){
      return {type:'mcq',question:q,options:optionObjs.map(o=>o.text),optionLabels:optionObjs.map(o=>o.label),answer};
    }
    return {type:'essay',question:q,answer:''};
  });
}
function normalizeExamAnswerValue(v){return normalizeText(String(v||'').replace(/[\)\.\-:：]/g,'').trim()).replace(/إ/g,'أ').replace(/هـ/g,'ه');}
function mcqAnswerIsCorrect(q, chosenIndex){
  const chosen=q.options?.[Number(chosenIndex)]||'';
  const label=q.optionLabels?.[Number(chosenIndex)]||String(Number(chosenIndex)+1);
  const correct=String(q.answer||'').trim();
  if(!correct) return null;
  const c=normalizeExamAnswerValue(correct);
  const labelNorm=normalizeExamAnswerValue(label);
  const chosenNorm=normalizeExamAnswerValue(chosen);
  const numberNorm=String(Number(chosenIndex)+1);
  const answerToken=(correct.match(/^([A-Da-dأإابجدهـه]|[1-4])/)||[])[1]||'';
  const tokenNorm=normalizeExamAnswerValue(answerToken);
  return c===labelNorm || c===chosenNorm || c===numberNorm || (tokenNorm && tokenNorm===labelNorm);
}
function hasSubmitted(examId, code){return (appData.examAttempts||[]).some(a=>a.examId===examId && normalizeText(a.studentCode)===normalizeText(code) && a.status!=='started');}
function examVisibleForStudent(e, st){
  const target=e.targetType||'all';
  const stCode=st.studentCode||st.code||st.id||'';
  if(String(e.status||'منشور')==='مخفي') return false;
  if(target==='student') return normalizeText(e.targetStudentCode)===normalizeText(stCode);
  if(target==='group') return normalizeText(e.targetGroup)===normalizeText(st.group||'') || normalizeText(e.targetGroup)===normalizeText(st.groupId||'');
  return (!e.grade || e.grade===st.grade || e.grade==='كل الصفوف' || target==='all');
}
function renderExamPortal(st){const box=document.getElementById('examStudentResult'); if(!box)return; const exams=(appData.exams||[]).filter(e=>examVisibleForStudent(e,st)); const attempts=(appData.examAttempts||[]).filter(a=>normalizeText(a.studentCode)===normalizeText(st.studentCode)); box.innerHTML=`<div class="profile-top"><div><h2>${esc(st.name)}</h2><p class="section-desc">${esc(st.grade||'')} · ${esc(st.studentCode)}</p></div></div><h3>الاختبارات المتاحة</h3><div class="grid grid-2">${exams.map(ex=>{const done=hasSubmitted(ex.id,st.studentCode)&&!ex.allowRetake; return `<div class="card exam-card"><span class="badge">${esc(ex.duration||20)} دقيقة</span><h3>${esc(ex.title)}</h3><p>${esc(ex.instructions||'')}</p><button class="btn primary" ${done?'disabled':''} onclick="startExam('${esc(ex.id)}','${esc(st.studentCode)}')">${done?'تم تسليم الاختبار':'بدء الاختبار'}</button></div>`;}).join('')||'<p class="section-desc">لا توجد اختبارات لهذا الصف حاليًا.</p>'}</div><h3 style="margin-top:20px">سجل الاختبارات والدرجات</h3>${attempts.length?attempts.slice().reverse().map(a=>`<div class="mobile-row"><b>${esc(a.examTitle||'اختبار')}</b><span class="badge ${a.needsManualReview?'warn':'good'}">${a.needsManualReview?'بانتظار التصحيح':esc(a.score)+'%'}</span><small>بدأ: ${esc(a.startedAt||'-')} · تسليم: ${esc(a.submittedAt||'-')}</small></div>`).join(''):'<p class="section-desc">لا توجد محاولات بعد.</p>'}`; hydrateIcons();}
function setupExamsPage(){const form=document.getElementById('examCodeForm'); if(!form)return; form.addEventListener('submit',async e=>{e.preventDefault(); const code=form.querySelector('[name="query"]').value.trim(); const st=await loadStudentForPortal(code); const box=document.getElementById('examStudentResult'); if(!st){box.innerHTML='<p class="section-desc">لم يتم العثور على طالب بهذا الكود.</p>'; return;} renderExamPortal(st);});}
window.startExam=function(examId, studentCode){const ex=(appData.exams||[]).find(e=>String(e.id)===String(examId)); const st=findStudentByCode(studentCode) || {studentCode}; if(!ex) return; if(hasSubmitted(examId,studentCode)&&!ex.allowRetake) return toast('تم تسليم الاختبار.'); const qs=parseExamQuestions(ex.text||ex.questionsText||ex.question||''); if(!qs.length) return toast('الاختبار لا يحتوي على أسئلة صالحة'); const startedAt=new Date().toISOString(); const overlay=document.getElementById('examOverlay'), box=document.getElementById('examBox'); overlay.classList.add('show'); box.innerHTML=`<div class="profile-top exam-live-top"><h2>${esc(ex.title)}</h2><span class="badge warn" id="examTimer">${esc(ex.duration||20)}:00</span></div><form id="liveExamForm">${renderExamQuestionsHtml(qs)}<div class="exam-code-lab"><div class="terminal-top"><span></span><span></span><span></span><b>إجابة.py</b><button type="button" class="btn ghost mini-run" data-run-exam-code><span data-icon="sparkles"></span> تشغيل</button></div><textarea name="examCodeAnswer" class="exam-code-editor" spellcheck="false" placeholder="لو السؤال محتاج كود اكتب الحل هنا..."></textarea><pre class="tm-output exam-live-output">الناتج</pre></div><button class="btn primary exam-submit-btn"><span data-icon="send"></span> تسليم الاختبار</button></form>`; hydrateIcons(); let left=Number(ex.duration||20)*60; const timer=setInterval(()=>{left--; const m=Math.max(0,Math.floor(left/60)), s=Math.max(0,left%60); const t=document.getElementById('examTimer'); if(t)t.textContent=`${m}:${String(s).padStart(2,'0')}`; if(left<=0){clearInterval(timer); document.getElementById('liveExamForm')?.requestSubmit();}},1000); document.getElementById('liveExamForm').onsubmit=e=>{e.preventDefault(); clearInterval(timer); submitExamAttempt(ex, st, qs, new FormData(e.target), startedAt); overlay.classList.remove('show');};};
async function submitExamAttempt(ex, st, qs, fd, startedAt){
  let auto=0, mcqTotal=0, essayTotal=0, needsManual=false;
  const answers=[];
  qs.forEach((q,i)=>{
    const val=fd.get(`q${i}`);
    if(q.type==='mcq'){
      mcqTotal++;
      const chosenIndex=Number(val);
      const chosen=q.options?.[chosenIndex]||'';
      const ok=mcqAnswerIsCorrect(q, chosenIndex);
      if(ok===true) auto++;
      if(ok===null) needsManual=true;
      answers.push({question:q.question,type:q.type,answer:chosen,answerIndex:chosenIndex,correct:ok,correctAnswer:q.answer||'',options:q.options||[],optionLabels:q.optionLabels||[]});
    }else{
      essayTotal++;
      needsManual=true;
      answers.push({question:q.question,type:q.type,answer:val||'',correct:null,correctAnswer:'يصححها الإدارة'});
    }
  });
  const autoScore=mcqTotal?Math.round(auto/mcqTotal*100):null;
  const finalScore=needsManual?null:(autoScore??0);
  const attempt={
    id:`${ex.id}_${st.studentCode}_${Date.now()}`,
    examId:ex.id,examTitle:ex.title,studentCode:st.studentCode||st.code,studentName:st.name||'',grade:st.grade||'',group:st.group||'',
    startedAt,submittedAt:new Date().toISOString(),score:finalScore,autoScore,maxScore:100,mcqCount:mcqTotal,essayCount:essayTotal,questionCount:qs.length,correctCount:auto,
    needsManualReview:needsManual,status:needsManual?'pending_manual':'submitted',answers,codeAnswer:fd.get('examCodeAnswer')||''
  };
  appData.examAttempts.push(attempt);
  persist(needsManual?'تم تسليم الاختبار وينتظر تصحيح الإدارة':'تم تسليم الاختبار وتصحيحه تلقائيًا');
  try{if(window.MFCloud?.saveExamAttempt) await window.MFCloud.saveExamAttempt(attempt);}catch(e){}
  renderExamPortal(st);
}


window.toggleFaqBot=function(force){
  const panel=document.getElementById('faqBotPanel');
  if(!panel) return;
  const show = typeof force==='boolean' ? force : !panel.classList.contains('show');
  panel.classList.toggle('show', show);
  panel.setAttribute('aria-hidden', show ? 'false' : 'true');
  document.body.classList.toggle('tm-chat-open', show);
  if(show && typeof hydrateIcons==='function') hydrateIcons();
};

function setupContact(){const a=document.getElementById('teacherWhatsapp'); if(a) a.href=whatsappLink(TEACHER_WHATSAPP,'Hello Techno Minds, I want to ask about the Programming course');}
function setupAdminLink(){document.querySelectorAll('a[href="teacher-login.html"]').forEach(a=>a.remove());}
window.startStudentScanner=async function(){const box=document.getElementById('qrScannerBox'), video=document.getElementById('qrScannerVideo'); if(!box||!video) return; box.hidden=false; try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); video.srcObject=stream; await video.play(); toast('وجّه الكاميرا على QR الطالب'); if('BarcodeDetector' in window){const detector=new BarcodeDetector({formats:['qr_code']}); const loop=async()=>{if(box.hidden) return; try{const codes=await detector.detect(video); if(codes.length){document.getElementById('studentQuery').value=extractStudentCodeInput(codes[0].rawValue); stopStudentScanner(); document.getElementById('studentSearchForm').requestSubmit(); return;}}catch(e){} requestAnimationFrame(loop);}; loop();} }catch(e){toast('تعذر فتح الكاميرا');}};
window.stopStudentScanner=function(){const box=document.getElementById('qrScannerBox'), video=document.getElementById('qrScannerVideo'); if(video?.srcObject) video.srcObject.getTracks().forEach(t=>t.stop()); if(box) box.hidden=true;};


// تشغيل بايثون لصفحة العملي والامتحانات
var tmPyodidePromise = null;
function tmCleanPythonCode(code){
  return String(code || '')
    .replace(/^\uFEFF/, '')
    .replace(/(^|\n)\\n/g, '$1')
    .replace(/(^|\n)\\t/g, '$1    ')
    .replace(/^\s+/, '');
}
function tmPatchInput(code){
  const shim = `
import builtins
from js import prompt as __tm_prompt

def input(prompt=''):
    value = __tm_prompt(str(prompt))
    if value is None:
        value = ''
    print(str(prompt) + str(value))
    return str(value)
`;
  return shim + '\n' + tmCleanPythonCode(code);
}
async function tmRunPython(code, outputEl){
  if(!outputEl) return;
  outputEl.className = (outputEl.className || 'tm-output').replace(/\s?(error|loading|success)/g,'') + ' loading';
  outputEl.textContent = 'جاري تجهيز مشغل بايثون...';
  const errPanel = document.getElementById('pythonErrorOutput'); if(errPanel) errPanel.textContent='الأخطاء هتظهر هنا لو الكود فيه مشكلة';
  try{
    if(typeof loadPyodide !== 'function') throw new Error('تعذر تحميل مشغل بايثون. افتح الصفحة والإنترنت متصل ثم جرّب مرة أخرى.');
    if(!tmPyodidePromise) tmPyodidePromise = loadPyodide();
    const pyodide = await tmPyodidePromise;
    let printed=[];
    pyodide.setStdout({batched:(msg)=>printed.push(msg)});
    pyodide.setStderr({batched:(msg)=>printed.push(msg)});
    outputEl.textContent='جاري التشغيل...';
    if(!String(code||'').trim()) throw new Error('اكتب كود Python أولًا ثم اضغط تشغيل.');
    await pyodide.runPythonAsync(tmPatchInput(code));
    outputEl.className = (outputEl.className || 'tm-output').replace(/\s?(error|loading|success)/g,'') + ' success';
    outputEl.textContent = printed.join('\n').trim() || 'تم التشغيل بنجاح، لكن الكود لم يطبع مخرجات.';
    if(errPanel) errPanel.textContent='لا توجد أخطاء.';
  }catch(err){
    outputEl.className = (outputEl.className || 'tm-output').replace(/\s?(error|loading|success)/g,'') + ' error';
    const msg='خطأ:\n' + (err && err.message ? err.message : err); outputEl.textContent=msg; if(errPanel) errPanel.textContent=msg;
  }
}
function setupCodePlayground(){
  const runBtn=document.getElementById('runPythonBtn');
  const resetBtn=document.getElementById('resetPythonBtn');
  const clearBtn=document.getElementById('clearPythonBtn');
  const copyBtn=document.getElementById('copyPythonBtn');
  const downloadBtn=document.getElementById('downloadPythonBtn');
  const examples=document.getElementById('pythonExampleSelect');
  const editor=document.getElementById('pythonEditor');
  const output=document.getElementById('pythonOutput');
  if(!editor||!output) return;
  const saveState=document.getElementById('pythonSaveState');
  try{const saved=localStorage.getItem('tm_playground_code'); if(saved) editor.value=saved;}catch(e){}
  editor.addEventListener('input',()=>{try{localStorage.setItem('tm_playground_code',editor.value||''); if(saveState) saveState.textContent='تم الحفظ على الجهاز';}catch(e){}});
  document.querySelectorAll('[data-output-tab]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-output-tab]').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); const tab=btn.getAttribute('data-output-tab'); document.querySelectorAll('[data-tab-panel]').forEach(p=>{p.hidden=p.getAttribute('data-tab-panel')!==tab;});}));
  const samples={
    hello:'name = input("اكتب اسمك: ")\nprint("أهلا يا", name)\nprint("Code executed successfully")',
    calc:'num1 = int(input("اكتب الرقم الأول: "))\nnum2 = int(input("اكتب الرقم الثاني: "))\nprint("المجموع =", num1 + num2)',
    grade:'grade = int(input("اكتب درجتك: "))\n\nif grade >= 50:\n    print("ناجح")\nelse:\n    print("محتاج تذاكر أكتر")',
    loop:'for i in range(1, 6):\n    print("تدريب عملي", i)'
  };
  resetBtn&&resetBtn.addEventListener('click',()=>{editor.value=samples.hello; try{localStorage.setItem('tm_playground_code',editor.value)}catch(e){}; output.className='tm-output tm-vscode-output'; output.textContent='اضغط تشغيل وشوف النتيجة هنا';});
  clearBtn&&clearBtn.addEventListener('click',()=>{editor.value=''; try{localStorage.removeItem('tm_playground_code')}catch(e){}; output.className='tm-output tm-vscode-output'; output.textContent='تم مسح الناتج.'; editor.focus();});
  copyBtn&&copyBtn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(editor.value||''); toast('تم نسخ الكود');}catch(e){toast('تعذر النسخ');}});
  downloadBtn&&downloadBtn.addEventListener('click',()=>{const blob=new Blob([editor.value||''],{type:'text/x-python'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='main.py'; a.click(); URL.revokeObjectURL(a.href);});
  examples&&examples.addEventListener('change',()=>{if(samples[examples.value]) editor.value=samples[examples.value]; try{localStorage.setItem('tm_playground_code',editor.value)}catch(e){}; editor.focus();});
  runBtn&&runBtn.addEventListener('click',()=>tmRunPython(editor.value, output));
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-run-exam-code]');
    if(!btn) return;
    const box=btn.closest('.exam-code-runner, .exam-code-lab');
    const ta=box?.querySelector('textarea');
    const out=box?.querySelector('pre');
    if(ta&&out) tmRunPython(ta.value,out);
  });
}


function onlineLectureStatusClass(status){
  const st=normalizeText(status||'متاحة');
  if(['متاحة','active','open','available','live'].includes(st)) return 'good';
  if(['انتهت','ended','closed','مغلقة'].includes(st)) return 'danger';
  return 'warn';
}
function onlineLectureIsVisible(lecture){
  const st=normalizeText(lecture?.status||'متاحة');
  return !['مخفي','hidden','deleted'].includes(st);
}
function onlineLectureMatchesStudent(lecture, st){
  const group=normalizeText(st?.group||st?.groupName||'');
  const groupId=normalizeText(st?.groupId||'');
  const target=normalizeText(lecture?.group||lecture?.targetGroup||lecture?.groupName||'كل المجموعات');
  const targetId=normalizeText(lecture?.groupId||'');
  if(!target || ['كل المجموعات','all','all groups','كل الطلاب'].includes(target)) return true;
  return (group && target===group) || (groupId && targetId && targetId===groupId);
}
function onlineLectureDateText(l){
  const parts=[l.date||'', l.time||''].filter(Boolean);
  return parts.join(' - ') || 'يتم تحديد الموعد من الإدارة';
}
function onlineLectureCard(l, st){
  const status=l.status||'متاحة';
  const canEnter=String(l.meetingUrl||l.link||'').trim() && !['انتهت','ended','closed','مغلقة'].includes(normalizeText(status));
  const url=esc(l.meetingUrl||l.link||'');
  return `<div class="card online-lecture-card"><div class="online-lecture-top"><span class="iconbox"><span data-icon="video"></span></span><span class="badge ${onlineLectureStatusClass(status)}">${esc(status)}</span></div><h3>${esc(l.title||'محاضرة أونلاين')}</h3><p>${esc(l.notes||l.desc||'راجع موعد المحاضرة وجهز اللاب قبل الدخول.')}</p><div class="online-lecture-meta"><span><b>المجموعة:</b> ${esc(l.group||l.targetGroup||'كل المجموعات')}</span><span><b>الموعد:</b> ${esc(onlineLectureDateText(l))}</span></div><div class="hero-cta">${canEnter?`<button class="btn primary" data-enter-online-lecture="${esc(l.id)}" data-url="${url}" data-student="${esc(st?.studentCode||st?.code||'')}"><span data-icon="external-link"></span> دخول المحاضرة</button>`:'<button class="btn ghost" disabled>الرابط غير متاح حاليًا</button>'}</div></div>`;
}
async function recordOnlineLectureAttendance(lectureId, st){
  const lecture=(appData.onlineLectures||[]).find(x=>String(x.id)===String(lectureId));
  if(!lecture) return;
  const rec={id:`OLATT-${lectureId}-${st?.studentCode||st?.code||'guest'}-${Date.now()}`,lectureId,lectureTitle:lecture.title||'',studentCode:st?.studentCode||st?.code||'',studentName:st?.name||st?.studentName||'',group:st?.group||st?.groupName||lecture.group||'',joinedAt:new Date().toISOString()};
  appData.onlineLectureAttendance=Array.isArray(appData.onlineLectureAttendance)?appData.onlineLectureAttendance:[];
  appData.onlineLectureAttendance.unshift(rec);
  saveData(appData);
  try{ if(window.MFCloud?.recordOnlineLectureAttendance) await window.MFCloud.recordOnlineLectureAttendance(rec); else queueCloudSave(); }catch(e){}
}
async function renderOnlineLecturesPage(student){
  const grid=document.getElementById('onlineLecturesGrid');
  const info=document.getElementById('onlineStudentInfo');
  if(!grid) return;
  appData=mergeData(loadData());
  let st=student||null;
  const code=new URLSearchParams(location.search).get('code');
  if(!st && code){ try{ st=await loadStudentForPortal(code); }catch(e){} }
  if(info){ info.innerHTML=st?`<div class="online-student-badge"><span class="badge good">تم التعرف على الطالب</span><b>${esc(st.name||st.studentName||'طالب Techno Minds')}</b><small>${esc(st.studentCode||st.code||'')} · ${esc(st.group||st.groupName||'بدون مجموعة')}</small></div>`:'<p class="section-desc">اكتب كود الطالب لعرض محاضرات مجموعته. المحاضرات العامة تظهر للجميع.</p>'; }
  const all=(appData.onlineLectures||[]).filter(onlineLectureIsVisible);
  const rows=st ? all.filter(l=>onlineLectureMatchesStudent(l, st)) : all.filter(l=>['كل المجموعات','all','كل الطلاب',''].includes(normalizeText(l.group||l.targetGroup||'')));
  grid.innerHTML=rows.length?rows.map(l=>onlineLectureCard(l, st||{})).join(''):`<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="video"></span><h3>لا توجد محاضرات أونلاين متاحة حاليًا</h3><p>تابع الصفحة قبل موعد الحصة أو تواصل مع الإدارة.</p></div>`;
  hydrateIcons();
}
function setupOnlineLecturesPage(){
  const form=document.getElementById('onlineLectureCodeForm');
  if(!form) return;
  const input=form.querySelector('[name="query"]');
  const qsCode=new URLSearchParams(location.search).get('code');
  if(qsCode && input) input.value=qsCode;
  form.addEventListener('submit',async e=>{e.preventDefault(); const code=extractStudentCodeInput(input?.value||''); const box=document.getElementById('onlineLecturesGrid'); if(box) box.innerHTML='<div class="skeleton" style="height:160px"></div>'; let st=null; if(code) st=await loadStudentForPortal(code); if(code && !st){ const info=document.getElementById('onlineStudentInfo'); if(info) info.innerHTML='<span class="badge warn">لم يتم العثور على طالب بهذا الكود</span>'; } renderOnlineLecturesPage(st);});
  document.addEventListener('click',async e=>{ const btn=e.target.closest('[data-enter-online-lecture]'); if(!btn) return; const id=btn.dataset.enterOnlineLecture; const url=btn.dataset.url; const code=extractStudentCodeInput(btn.dataset.student||input?.value||''); let st=code?await loadStudentForPortal(code):null; await recordOnlineLectureAttendance(id, st||{}); if(url) window.open(url,'_blank','noopener,noreferrer'); });
  renderOnlineLecturesPage();
}

function setupCertificateModal(){
  const modal=document.getElementById('certificateModal');
  if(!modal) return;
  const imageBox=document.getElementById('certificateModalImage');
  const title=document.getElementById('certificateModalTitle');
  const org=document.getElementById('certificateModalOrg');
  const desc=document.getElementById('certificateModalDesc');
  const meta=document.getElementById('certificateModalMeta');
  const open=(card)=>{
    const img=card.dataset.certImg||'';
    imageBox.innerHTML=img?`<img src="${esc(img)}" alt="${esc(card.dataset.certTitle||'Certificate')}">`:`<div class="aws-modal-badge-v41">AWS</div>`;
    title.textContent=card.dataset.certTitle||'Certificate';
    org.textContent=card.dataset.certOrg||'Certificate';
    desc.textContent=card.dataset.certDesc||'';
    meta.textContent=card.dataset.certMeta||'';
    modal.classList.add('show'); modal.setAttribute('aria-hidden','false');
  };
  const close=()=>{modal.classList.remove('show'); modal.setAttribute('aria-hidden','true');};
  document.querySelectorAll('[data-cert-title]').forEach(card=>{
    card.addEventListener('click',()=>open(card));
    card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault(); open(card);}});
  });
  modal.querySelectorAll('[data-cert-close]').forEach(x=>x.addEventListener('click',close));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('show')) close();});
}

function init(){setupTheme(); hydrateIcons(); fillSelects(); setupBooking(); setupStudent(); setupParent(); setupExamsPage(); setupReviews(); setupContact(); setupAdminLink(); setupCodePlayground(); setupOnlineLecturesPage(); setupCertificateModal(); renderHomeCounts(); renderPublicLeaderboard(); renderReviews(); renderBookingPreview(); renderUnifiedResourcesPage(); initFirebaseData();}
document.addEventListener('DOMContentLoaded',init);


// V54 mobile drawer menu
function toggleMobileMenu(force){
  const open = typeof force === 'boolean' ? force : !document.body.classList.contains('tm-menu-open');
  document.body.classList.toggle('tm-menu-open', open);
  document.querySelectorAll('.tm-mobile-menu-backdrop').forEach(el=>el.setAttribute('aria-hidden', open ? 'false' : 'true'));
}
document.addEventListener('click', (event)=>{
  const link = event.target.closest && event.target.closest('.tm-mobile-drawer a');
  if(link) toggleMobileMenu(false);
});
document.addEventListener('keydown', (event)=>{
  if(event.key === 'Escape') toggleMobileMenu(false);
});
