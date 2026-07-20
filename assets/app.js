var DEFAULT_SITE_URL = 'https://eng-amr-khaled-academy.vercel.app';
var TEACHER_WHATSAPP = '201008454029';
var ENGINEER_WHATSAPP = '201008454029';
var GRADES = ['أولى ثانوي برمجة','تانية ثانوي بكالوريا','تانية ثانوي عام','مبتدئين برمجة','أساسيات Python','تطبيقات ومراجعة'];
var MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
var STORAGE_KEY = 'technominds_academy_v60_data';
var OLD_STORAGE_KEY = 'mf_science_v11_data';
var PUBLIC_STORAGE_KEY = 'technominds_academy_v60_public_cache';
var LAST_STUDENT_CODE_KEY = 'mf_last_student_code';
var LAST_EXAM_CODE_KEY = 'mf_last_exam_code';
var EXAM_DRAFT_PREFIX = 'mf_exam_draft_v2_';
var PENDING_BOOKING_REQUEST_KEY = 'mf_pending_booking_request_v1';
var cloudSaveTimer = null;
var MF_ASSET_VERSION = '60.6.2';
var mfLazyScriptPromises = Object.create(null);
var publicScheduleUnsubscribe = null;

function loadLazyScript(key, source, readyCheck){
  if(typeof readyCheck==='function'&&readyCheck())return Promise.resolve(true);
  if(mfLazyScriptPromises[key])return mfLazyScriptPromises[key];
  mfLazyScriptPromises[key]=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.async=true;
    script.dataset.mfLazy=key;
    const url=new URL(source,document.baseURI);
    if(url.origin===location.origin)url.searchParams.set('v',MF_ASSET_VERSION);
    script.src=url.href;
    script.onload=()=>{
      if(typeof readyCheck!=='function'||readyCheck())resolve(true);
      else reject(new Error(`Lazy asset did not initialize: ${key}`));
    };
    script.onerror=()=>reject(new Error(`Lazy asset failed to load: ${key}`));
    document.head.appendChild(script);
  }).catch(error=>{delete mfLazyScriptPromises[key];throw error;});
  return mfLazyScriptPromises[key];
}

window.MFAssets={
  loadQrScanner:()=>loadLazyScript('qr-scanner','assets/vendor/html5-qrcode-2.3.8.min.js',()=>typeof window.Html5Qrcode==='function'),
  loadSpreadsheet:()=>loadLazyScript('spreadsheet','assets/vendor/xlsx-0.18.5.full.min.js',()=>typeof window.XLSX!=='undefined')
};
var icons = {
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
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><path d="M14 14h3v3h-3zM18 14h3M14 19h7M19 18v3"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 15H6L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M17 8l-5-5-5 5"></path><path d="M12 3v12"></path></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"></path></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>'
};

var PRODUCTION_MODE = true;
var appDataLoadFailed = false;

function iconNameToKey(name){return String(name||'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());}
function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(el=>{const key=iconNameToKey(el.dataset.icon); if(icons[key]) el.innerHTML=icons[key];});}
function toast(msg){const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2800);}
function firebaseFriendlyError(err,fallback){const raw=`${err?.code||''} ${err?.message||''}`;if(/functions\/not-found|function.*unavailable|service.*unavailable/i.test(raw))return 'الخدمة غير مفعّلة حاليًا. تواصل مع المدرس أو حاول لاحقًا.';if(/resource-exhausted/i.test(raw))return 'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.';if(/failed-precondition/i.test(raw))return raw.split(':').pop().trim()||'الاختيار لم يعد متاحًا. حدّث الصفحة وحاول مرة أخرى.';if(/invalid-argument/i.test(raw)){const message=raw.split(':').pop().trim();return /firebase|firestore|function|permission|internal/i.test(message)?(fallback||'تعذر إتمام الطلب. راجع البيانات وحاول مرة أخرى.'):message;}if(/deadline-exceeded/i.test(raw))return 'انتهى وقت الامتحان.';if(/already-exists/i.test(raw))return 'تم تسليم الامتحان بالفعل.';if(/permission-denied|unauthenticated/i.test(raw))return 'لا يمكن تنفيذ الطلب حاليًا. حدّث الصفحة ثم حاول مرة أخرى.';if(/unavailable|network|internal|fetch|offline|timeout/i.test(raw))return 'تعذر الاتصال بالخدمة. تحقق من الإنترنت وحاول مرة أخرى.';if(/not-found/i.test(raw))return 'الكود غير صحيح أو غير موجود.';return fallback||'حدث خطأ غير متوقع.';}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function toEnglishDigits(v){return String(v||'').replace(/[٠-٩]/g,digit=>String(digit.charCodeAt(0)-1632)).replace(/[۰-۹]/g,digit=>String(digit.charCodeAt(0)-1776));}
function normalizeText(v){return toEnglishDigits(v).trim().toLowerCase().replace(/\s+/g,' ');}
function phoneDigits(v){return toEnglishDigits(v).replace(/\D/g,'');}
function formatTime12(value){
  const normalized=toEnglishDigits(value||'').trim();
  const match=normalized.match(/^(\d{1,2}):(\d{2})/);
  if(!match)return String(value||'');
  const hour=Math.min(23,Math.max(0,Number(match[1]))),minute=match[2];
  const shown=hour%12||12,suffix=hour<12?'ص':'م';
  return `${shown}:${minute} ${suffix}`.replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}
function uid(prefix='ST'){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=new Uint8Array(8);if(window.crypto?.getRandomValues)window.crypto.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);const body=[...bytes].map(x=>alphabet[x%alphabet.length]).join('');return `${prefix}-${body.slice(0,4)}-${body.slice(4,8)}`;}
function isoDate(d=new Date()){return d.toISOString().slice(0,10);}
function arStatus(status){return status==='present'?'حاضر':status==='absent'?'غائب':(status||'-');}
function statusClass(status){return status==='present'||status==='حاضر'||status===true?'good':status==='absent'||status==='غائب'||status===false?'danger':'warn';}
function whatsappLink(phone,msg){return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;}
function whatsappPhone(v){const d=phoneDigits(v); if(!d) return ''; if(d.startsWith('20')) return d; if(d.startsWith('0')) return '2'+d; return d;}
function monthLabel(st){return st?.month || MONTHS[new Date().getMonth()] || '';}
function safeStorageGet(key){try{return localStorage.getItem(key)||'';}catch(e){return '';}}
function safeStorageSet(key,value){try{localStorage.setItem(key,String(value??''));return true;}catch(e){return false;}}
function safeStorageRemove(key){try{localStorage.removeItem(key);}catch(e){}}
function formatPortalDate(value){if(!value)return '-'; try{return new Date(value).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'});}catch(e){return String(value);}}
function formatPortalMoney(value){const number=Number(value);return `${new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(Number.isFinite(number)?number:0)} ج.م`;}
function scoreLabel(score){const n=Number(score); if(Number.isNaN(n)) return 'بانتظار التصحيح'; return n>=90?'ممتاز':n>=75?'جيد جدًا':n>=60?'جيد':'يحتاج متابعة';}
function scoreClass(score){const n=Number(score); if(Number.isNaN(n)) return 'warn'; return n>=75?'good':n>=60?'warn':'danger';}
function getSiteBase(){return (appData.settings?.siteUrl || DEFAULT_SITE_URL || location.origin).replace(/\/$/,'');}
function defaultData(){return {students:[],bookings:[],materials:[],questions:[],exams:[],examAttempts:[],grades:[],reviews:[],groups:[],assignments:[],settings:{siteUrl:DEFAULT_SITE_URL||'',teacherPhone:TEACHER_WHATSAPP||''}};}
function mergeData(data){const d=defaultData(); const p=data||{}; return {...d,...p,settings:{...d.settings,...(p.settings||{})},students:Array.isArray(p.students)?p.students:[],bookings:Array.isArray(p.bookings)?p.bookings:[],materials:Array.isArray(p.materials)?p.materials:[],questions:Array.isArray(p.questions)?p.questions:[],exams:Array.isArray(p.exams)?p.exams:[],examAttempts:Array.isArray(p.examAttempts)?p.examAttempts:[],grades:Array.isArray(p.grades)?p.grades:[],reviews:Array.isArray(p.reviews)?p.reviews:[],groups:Array.isArray(p.groups)?p.groups:[],assignments:Array.isArray(p.assignments)?p.assignments:[]};}
function isStaffWorkspace(){return (location.pathname.split('/').pop()||'')==='teacher-login.html';}
function publicDataOnly(data){const d=mergeData(data),settings=d.settings||{};return {...defaultData(),materials:d.materials,questions:d.questions,reviews:d.reviews.filter(r=>r.approved===true),groups:d.groups,assignments:d.assignments,settings:{siteUrl:settings.siteUrl||DEFAULT_SITE_URL,teacherPhone:settings.teacherPhone||TEACHER_WHATSAPP,teacherName:settings.teacherName||'م. عمرو خالد',homeNotice:settings.homeNotice||''}};}
function staffCacheOnly(data){
  const d=mergeData(data);
  // Keep the browser cache intentionally small. Historical attendance, grades,
  // homework and exam attempts remain in Firestore and are loaded in the
  // background for staff instead of being JSON-stringified on every click.
  const students=d.students.map(raw=>{const student={...raw};delete student.attendance;delete student.grades;delete student.homeworks;delete student.recitations;return student;});
  return {...d,students,examAttempts:[],grades:[]};
}
function loadData(){
  try{
    if(isStaffWorkspace()){
      const current=sessionStorage.getItem(STORAGE_KEY);
      const legacy=current||localStorage.getItem(STORAGE_KEY)||'{}';
      if(!current&&legacy!=='{}'){sessionStorage.setItem(STORAGE_KEY,legacy);localStorage.removeItem(STORAGE_KEY);}
      return mergeData(JSON.parse(legacy));
    }
    return publicDataOnly(JSON.parse(localStorage.getItem(PUBLIC_STORAGE_KEY)||'{}'));
  }catch(e){return defaultData();}
}
function saveData(data){
  try{
    if(isStaffWorkspace()){
      sessionStorage.setItem(STORAGE_KEY,JSON.stringify(staffCacheOnly(data)));
      localStorage.removeItem(STORAGE_KEY);
    }else{
      localStorage.setItem(PUBLIC_STORAGE_KEY,JSON.stringify(publicDataOnly(data)));
    }
  }catch(e){}
}
function bookingFingerprint(payload){return [payload.name,payload.studentPhone,payload.parentPhone,payload.grade,payload.month,payload.scheduleId,payload.group].map(value=>normalizeText(value||'')).join('|');}
function newRequestId(){
  if(window.crypto?.randomUUID)return window.crypto.randomUUID();
  const bytes=new Uint8Array(16);window.crypto?.getRandomValues?.(bytes);
  return `booking-${Date.now()}-${[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('')}`;
}
function bookingRequestId(payload){
  const fingerprint=bookingFingerprint(payload);
  try{
    const pending=JSON.parse(sessionStorage.getItem(PENDING_BOOKING_REQUEST_KEY)||'null');
    if(pending?.id&&pending.fingerprint===fingerprint&&Date.now()-Number(pending.createdAt||0)<15*60*1000)return pending.id;
  }catch(_){ }
  const id=newRequestId();
  try{sessionStorage.setItem(PENDING_BOOKING_REQUEST_KEY,JSON.stringify({id,fingerprint,createdAt:Date.now()}));}catch(_){ }
  return id;
}
function clearBookingRequest(){try{sessionStorage.removeItem(PENDING_BOOKING_REQUEST_KEY);}catch(_){ }}
var appData = loadData();
function queueCloudSave(){ if(!window.MFCloud?.ready || !window.MFCloud.saveSiteData) return; clearTimeout(cloudSaveTimer); cloudSaveTimer=setTimeout(()=>window.MFCloud.saveSiteData(appData).catch(()=>{}),500); }
function persist(msg){saveData(appData); queueCloudSave(); if(msg) toast(msg); refreshActiveViews();}
function dataErrorHTML(message='تعذر تحميل بيانات الطالب'){return `<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="database"></span><h3>${esc(message)}</h3><p>راجع الكود واتصال الإنترنت وحاول مرة أخرى. لو استمرت المشكلة تواصل مع المدرس.</p></div>`;}
async function initFirebaseData(){
  // The admin bundle performs a staged staff load (core first, records later).
  // Starting the public full-data loader here as well caused duplicate reads
  // and was a major source of freezes on the teacher page.
  if(isStaffWorkspace())return;
  if(!window.MFCloud?.ready || !window.MFCloud.loadSiteData) return;
  startPublicScheduleSync();
  try{
    const cloudData = await window.MFCloud.loadSiteData();
    if(cloudData){ appData = mergeData(cloudData); saveData(appData); refreshActiveViews(); }
  }catch(e){ appDataLoadFailed=true; refreshActiveViews(); }
}
function startPublicScheduleSync(){
  if(publicScheduleUnsubscribe||!document.getElementById('bookingGroup')||!window.MFCloud?.subscribeToGroups)return;
  publicScheduleUnsubscribe=window.MFCloud.subscribeToGroups(rows=>{
    appData.groups=Array.isArray(rows)?rows:[];
    saveData(appData);
    renderBookingScheduleOptions();
    const live=document.getElementById('bookingSchedulesLive');
    if(live)live.textContent='المواعيد متصلة بلوحة الإدارة الآن';
  });
}
function refreshActiveViews(){
  const path=(location.pathname.split('/').pop()||'index.html');
  try{
    if(document.getElementById('liveCounts')) renderHomeCounts();
    if(document.getElementById('publicLeaderboard')) renderPublicLeaderboard();
    if(document.getElementById('reviewsList')) renderReviews();
    if(document.getElementById('bookingGroup')) renderBookingScheduleOptions();
    if(path==='materials.html') renderUnifiedResourcesPage();
  }catch(e){}
}
function setupUnifiedHeader(){
  const file=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  // The assessment workspace and the private staff workspace have their own
  // focused navigation. Never inject the public-site header into either page.
  if(file==='teacher-login.html')return;
  let header=document.querySelector('.site-header');
  if(!header){
    header=document.createElement('header');
    header.className='site-header';
    document.body.insertAdjacentElement('afterbegin',header);
  }
  const links=[
    ['index.html','الرئيسية'],['learning-path.html','المسار التعليمي'],
    ['about.html','عن م. عمرو'],['practical.html','العملي'],['index.html#booking','الحجز'],
    ['student.html','بوابة الطالب'],['parent.html','ولي الأمر'],['materials.html','المحاضرات'],['questions.html','الأسئلة'],['exams.html','الاختبارات']
  ];
  const activeFile=file==='teacher-login.html'?'':file;
  header.innerHTML=`<div class="container navbar"><a aria-label="Techno Minds" class="logo" href="index.html"><span class="logo-mark"></span><span>Techno Minds <small>Programming &amp; AI</small></span></a><nav aria-label="روابط الموقع" class="navlinks">${links.map(([href,label])=>{const parts=href.split('#'),target=parts[0],hash=parts[1]||'';const active=hash?activeFile==='index.html'&&location.hash===`#${hash}`:target===activeFile&&!location.hash;return `<a href="${href}"${active?' class="active" aria-current="page"':''}>${label}</a>`;}).join('')}</nav><div class="header-actions"><button aria-label="تغيير الوضع" class="theme-toggle" id="themeToggle"></button></div></div>`;
}
function setupImageLazyLoading(){
  document.querySelectorAll('img').forEach(image=>{
    image.decoding='async';
    if(image.getAttribute('fetchpriority')==='high'||image.closest('.teacher-photo,.about-photo'))return;
    if(!image.hasAttribute('loading'))image.loading='lazy';
    if(!image.hasAttribute('fetchpriority'))image.setAttribute('fetchpriority','low');
  });
}
function setupTheme(){
  const saved=localStorage.getItem('theme')||'light'; document.documentElement.dataset.theme=saved;
  document.querySelectorAll('#themeToggle,#themeToggleAdmin').forEach(btn=>{btn.innerHTML=icons[saved==='dark'?'sun':'moon']; btn.onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark'; document.documentElement.dataset.theme=next; localStorage.setItem('theme',next); setupTheme();};});
}
function fillSelects(){
  const grade=document.getElementById('bookingGrade'); if(grade) grade.innerHTML=GRADES.map(g=>`<option>${esc(g)}</option>`).join('');
  const month=document.getElementById('bookingMonth'); if(month) month.innerHTML=MONTHS.map(m=>`<option>${esc(m)}</option>`).join('');
  if(month){const currentMonth=MONTHS[new Date().getMonth()];if(currentMonth)month.value=currentMonth;}
  if(grade&&!grade.dataset.scheduleBound){grade.dataset.scheduleBound='true';grade.addEventListener('change',()=>{const search=document.getElementById('bookingGroupSearch');if(search)search.value='';renderBookingScheduleOptions();});}
  const groupSearch=document.getElementById('bookingGroupSearch');if(groupSearch&&!groupSearch.dataset.bound){groupSearch.dataset.bound='true';groupSearch.addEventListener('input',renderBookingScheduleOptions);}
  renderBookingScheduleOptions();
}
function activeSchedulesForGrade(grade){
  const selected=normalizeText(grade);
  return (appData.groups||[]).filter(item=>item&&item.active!==false&&normalizeText(item.grade)===selected);
}
function scheduleOptionLabel(item){const time=[item.startTime,item.endTime].filter(Boolean).map(formatTime12).join(' - ');return [item.name,item.days,time].filter(Boolean).join(' — ');}
function renderBookingScheduleOptions(){
  const select=document.getElementById('bookingGroup');if(!select)return;
  const grade=document.getElementById('bookingGrade')?.value||GRADES[0];
  const query=normalizeText(document.getElementById('bookingGroupSearch')?.value||'');
  const allSchedules=activeSchedulesForGrade(grade);
  const schedules=query?allSchedules.filter(item=>normalizeText([item.name,item.days,item.startTime,item.endTime].filter(Boolean).join(' ')).includes(query)):allSchedules;
  const currentId=document.getElementById('bookingScheduleId')?.value||'';
  const scheduleIdInput=document.getElementById('bookingScheduleId');
  const submit=document.querySelector('#bookingForm button[type="submit"]');
  const hint=document.getElementById('bookingGroupHint');
  select.disabled=false;
  select.onchange=()=>{const option=select.selectedOptions[0];if(scheduleIdInput)scheduleIdInput.value=option?.dataset.scheduleId||'';};
  if(!allSchedules.length){
    select.innerHTML='<option value="">سأسجل الآن وأحدد المجموعة لاحقًا</option>';
    if(scheduleIdInput)scheduleIdInput.value='';
    if(submit)submit.disabled=false;
    if(hint)hint.innerHTML='<b>لا توجد مواعيد معلنة حاليًا.</b> أكمل الحجز عادي، وسيتم نقلك إلى المجموعة المناسبة من لوحة الإدارة.';
    return;
  }
  if(!schedules.length){
    select.innerHTML='<option value="">سأسجل بدون مجموعة الآن</option>';
    if(scheduleIdInput)scheduleIdInput.value='';
    if(submit)submit.disabled=false;
    if(hint)hint.textContent='لا توجد مجموعة مطابقة للبحث؛ تقدر تكمل الحجز بدون مجموعة أو تمسح البحث.';
    return;
  }
  if(submit)submit.disabled=false;
  select.innerHTML='<option value="">التسجيل بدون مجموعة — أحددها لاحقًا</option>'+schedules.map(item=>`<option value="${esc(item.name||'')}" data-schedule-id="${esc(item.id||'')}">${esc(scheduleOptionLabel(item))}</option>`).join('');
  const retained=[...select.options].find(option=>option.dataset.scheduleId===currentId);
  if(retained)retained.selected=true;else if(scheduleIdInput)scheduleIdInput.value='';
  if(hint)hint.textContent=`اختيار المجموعة اختياري. يوجد ${allSchedules.length} موعدًا لـ ${grade}${query?` — نتائج البحث ${schedules.length}`:''}.`;
}
function groupOptions(){return (appData.groups||[]).filter(item=>item&&item.active!==false).map(item=>item.name).filter(Boolean);}
function classRecordComplete(record){return record?.completed===true||record?.approved===true||/^تم/.test(String(record?.status||''));}
function classRecordDate(record){const value=String(record?.date||record?.submittedAt||record?.createdAt||'');return value.slice(0,10);}
function calcStudent(st){
  const attendance = getAttendanceRows(st);
  const total = attendance.length;
  const present = attendance.filter(a=>(a.status==='present'||a.status==='حاضر'||a.status==='متأخر')).length;
  const attendancePct = total ? Math.round((present/total)*100) : 0;
  const graded=(st.grades||[]).filter(g=>g.score!==''&&g.score!==undefined&&g.score!==null&&!isNaN(Number(g.score)));
  const avg=graded.length?Math.round(graded.reduce((s,g)=>s+Number(g.score),0)/graded.length):0;
  const recitations=(st.recitations||[]).filter(classRecordComplete),homeworks=(st.homeworks||[]).filter(classRecordComplete);
  const classDates=new Set(attendance.map(classRecordDate).filter(Boolean));
  recitations.forEach(row=>{const date=classRecordDate(row);if(date)classDates.add(date);});
  homeworks.forEach(row=>{const date=classRecordDate(row);if(date)classDates.add(date);});
  const sessions=classDates.size;
  const completedDates=rows=>new Set(rows.map(classRecordDate).filter(Boolean)).size;
  const recitationCount=completedDates(recitations),homeworkCount=completedDates(homeworks);
  const recitationPct=sessions?Math.min(100,Math.round(recitationCount/sessions*100)):0;
  const homeworkPct=sessions?Math.min(100,Math.round(homeworkCount/sessions*100)):0;
  const final=Math.round(attendancePct*.3+avg*.4+homeworkPct*.15+recitationPct*.15);
  const level= final>=90?'ممتاز':final>=75?'جيد جدًا':final>=60?'جيد':'محتاج متابعة';
  return {attendancePct,avg,hwPct:homeworkPct,homeworkPct,recitationPct,homeworkCount,recitationCount,sessions,final,level,totalAttendance:total,present,absent:attendance.filter(a=>(a.status==='absent'||a.status==='غائب')).length,lastGrade:graded.at(-1)};
}
function normalizedStudent(st){const code=toEnglishDigits(st?.studentCode||st?.code||st?.id||'').trim().toUpperCase(); return {...(st||{}),id:code,code,studentCode:code,parentCode:toEnglishDigits(st?.parentCode||'').trim().toUpperCase(),name:st?.studentName||st?.name||'',studentName:st?.studentName||st?.name||''};}
function findStudentByCode(code){const q=normalizeText(code); return (appData.students||[]).map(normalizedStudent).find(s=>normalizeText(s.code)===q || normalizeText(s.studentCode)===q) || null;}
function attendanceDocId(st,date){return `${st.studentCode||st.code}_${date}`.replace(/[\\/#?\[\]]/g,'-');}
function getAttendanceRows(st){
  const legacy=(st.attendance||[]).map(a=>({...a,status:a.status==='حاضر'?'present':a.status==='غائب'?'absent':a.status,date:String(a.date||'').replaceAll('/','-'),time:a.time||'',group:a.group||st.group}));
  return legacy.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
function attendanceSummaryHTML(st){
  const rows=getAttendanceRows(st); const total=rows.length; const present=rows.filter(a=>a.status==='present'||a.status==='حاضر'||a.status==='متأخر').length; const absent=rows.filter(a=>a.status==='absent'||a.status==='غائب').length; const pct=total?Math.round(present/total*100):0;
  return `<div class="attendance-public-card"><div class="section-head mini"><div><span class="kicker"><span data-icon="calendar"></span> الحضور والغياب</span><h3>ملخص حضور الطالب</h3></div></div><div class="metric-grid parent-metrics-v29"><div class="metric"><b>${total}</b><small>إجمالي الحصص</small></div><div class="metric"><b>${present}</b><small>أيام الحضور</small></div><div class="metric"><b>${absent}</b><small>أيام الغياب</small></div><div class="metric"><b>${pct}%</b><small>نسبة الحضور</small></div></div><div class="mobile-card-table">${rows.slice(0,12).map(r=>`<div class="mobile-row"><b>${esc(r.date||'-')}</b><span class="badge ${statusClass(r.status)}">${arStatus(r.status)}</span><small>${esc(formatTime12(r.time)||'-')} · ${esc(r.group||st.group||'-')}</small></div>`).join('')||'<p class="section-desc">لا توجد سجلات حضور بعد.</p>'}</div><div class="table-wrap attendance-table"><table><thead><tr><th>التاريخ</th><th>الحالة</th><th>الوقت</th><th>المجموعة</th></tr></thead><tbody>${rows.slice(0,12).map(r=>`<tr><td>${esc(r.date||'-')}</td><td><span class="badge ${statusClass(r.status)}">${arStatus(r.status)}</span></td><td>${esc(formatTime12(r.time)||'-')}</td><td>${esc(r.group||st.group||'-')}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد سجلات حضور بعد</td></tr>'}</tbody></table></div></div>`;
}
function qrValue(st){return st.studentCode||st.code||'';}
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
  const text=String(value||'').trim().toUpperCase();
  if(!text || text.length>25 || ![...text].every(ch=>QR_ALPHA.includes(ch))) return `<div class="qr-card real-qr-svg"><span>${esc(text||'NO CODE')}</span></div>`;
  const m=qrMatrix(text), size=21, border=4, total=size+border*2, cell=5;
  let rects='';
  m.forEach((row,y)=>row.forEach((dark,x)=>{if(dark) rects+=`<rect x="${(x+border)*cell}" y="${(y+border)*cell}" width="${cell}" height="${cell}"/>`;}));
  return `<div class="qr-card real-qr-svg" title="${esc(text)}"><svg viewBox="0 0 ${total*cell} ${total*cell}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR ${esc(text)}"><rect width="100%" height="100%" fill="#fff"/><g fill="#0d1730">${rects}</g></svg></div>`;
}
function studentAssignmentCard(assignment,studentCode,isParent=false,submission=null){
  const type=['mcq','code','text','file'].includes(assignment.type)?assignment.type:'text';
  const typeName={mcq:'واجب اختياري',code:'واجب كود',text:'واجب كتابي',file:'ملف واجب'}[type];
  const due=assignment.dueDate?`آخر موعد: ${esc(assignment.dueDate)}`:'بدون موعد نهائي';
  const choices=Array.isArray(assignment.choices)?assignment.choices:[];
  let answer='';
  if(!isParent&&type==='mcq')answer=`<div class="assignment-choices">${choices.map((choice,index)=>`<label><input type="radio" name="selectedOption" value="${index}" required><span>${esc(choice)}</span></label>`).join('')}</div>`;
  if(!isParent&&type==='code')answer=`<label class="assignment-code-answer"><span>كودك — ${esc(assignment.language||'code')}</span><textarea name="answer" dir="ltr" rows="9" maxlength="20000" required spellcheck="false">${esc(assignment.starterCode||'')}</textarea></label>`;
  if(!isParent&&type==='text')answer='<label class="assignment-text-answer"><span>إجابتك</span><textarea name="answer" rows="5" maxlength="5000" required placeholder="اكتب إجابة الواجب هنا"></textarea></label>';
  const download=assignment.fileUrl?`<a class="btn ghost assignment-download" href="${esc(assignment.fileUrl)}" target="_blank" rel="noopener noreferrer"><span data-icon="book-open"></span> فتح ${esc(assignment.fileName||'ملف الواجب')}</a>`:'';
  const form=!isParent&&type!=='file'?`<form class="assignment-answer-form" data-student-code="${esc(studentCode)}" data-assignment-id="${esc(assignment.id)}" data-assignment-type="${esc(type)}">${answer}<div class="assignment-submit-row"><span class="assignment-form-state" aria-live="polite">${submission?'تم التسليم من قبل — يمكنك التعديل وإعادة التسليم.':''}</span><button class="btn primary" type="submit"><span data-icon="upload"></span> ${submission?'إعادة التسليم':'تسليم الواجب'}</button></div></form>`:'';
  return `<article class="student-assignment-card"><div class="student-assignment-head"><div><span class="record-eyebrow">${typeName}</span><h4>${esc(assignment.title||'واجب جديد')}</h4></div><span class="badge ${submission?'good':'warn'}">${submission?'تم التسليم':'مطلوب'}</span></div><p>${esc(assignment.description||'')}</p><small>${due}</small>${download}${form}${isParent?'<p class="assignment-parent-note">يستطيع الطالب تسليم الواجب من بوابة الطالب.</p>':''}</article>`;
}
function studentProfileHTML(raw, isParent=false){
  const st=normalizedStudent(raw); const c=calcStudent(st);
  const pending=/انتظار|قيد التسجيل/.test(String(st.approvalStatus||''));
  const attempts=[...(st.examAttempts||[]),...(appData.examAttempts||[]).filter(a=>normalizeText(a.studentCode)===normalizeText(st.studentCode))];
  const grades=[...(st.grades||[]),...attempts].slice().reverse();
  const attendance=getAttendanceRows(st);
  const homeworks=(st.homeworks||[]).slice().reverse();
  const assignments=(st.assignments||[]).slice().sort((a,b)=>String(b.createdAt||b.dueDate||'').localeCompare(String(a.createdAt||a.dueDate||'')));
  const recitations=(st.recitations||[]).slice().reverse();
  const monthlyPayments=(st.monthlyPayments||[]).slice().reverse();
  const initials=String(st.name||'ط').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('');
  const gradeCards=grades.length?grades.slice(0,12).map(g=>{
    const hasScore=g.score!==null&&g.score!==undefined&&g.score!=='';
    return `<article class="student-record-card grade-record-card"><div><span class="record-eyebrow">${esc(formatPortalDate(g.date||g.submittedAt))}</span><h4>${esc(g.exam||g.examTitle||'امتحان')}</h4><small>${hasScore?esc(scoreLabel(g.score)):'سيظهر التقييم بعد تصحيح المدرس'}</small></div><strong class="score-pill ${hasScore?scoreClass(g.score):'warn'}">${hasScore?esc(g.score)+'%':'قيد التصحيح'}</strong></article>`;
  }).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="bar-chart"></span><h3>لا توجد درجات بعد</h3><p>ستظهر نتائج الاختبارات هنا فور تسجيلها.</p></div>';
  const attendanceCards=attendance.length?attendance.slice(0,14).map(r=>`<article class="student-record-card"><div><span class="record-eyebrow">${esc(formatTime12(r.time)||'موعد الحصة')}</span><h4>${esc(r.date||'-')}</h4><small>${esc(r.group||st.group||'-')}</small></div><span class="badge ${statusClass(r.status)}">${arStatus(r.status)}</span></article>`).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="calendar"></span><h3>لا توجد سجلات حضور</h3><p>يضيف المدرس سجل الحضور، وسيظهر هنا تلقائيًا.</p></div>';
  const homeworkCards=homeworks.length?homeworks.slice(0,12).map(h=>`<article class="student-record-card"><div><span class="record-eyebrow">واجب دراسي</span><h4>${esc(h.title||h.homeworkTitle||'واجب')}</h4><small>${esc(h.notes||formatPortalDate(h.date||h.submittedAt)||'')}</small></div><span class="badge ${classRecordComplete(h)?'good':'warn'}">${esc(h.status||(classRecordComplete(h)?'تم عمل الواجب':'قيد المتابعة'))}</span></article>`).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="file-text"></span><h3>لا توجد واجبات مسجلة</h3><p>يمكنك رفع ملف الواجب من الزر الموجود بالأسفل.</p></div>';
  const submissionByAssignment=new Map(homeworks.filter(row=>row.assignmentId).map(row=>[String(row.assignmentId),row]));
  const assignmentCards=assignments.length?assignments.map(assignment=>studentAssignmentCard(assignment,st.studentCode,isParent,submissionByAssignment.get(String(assignment.id)))).join(''):st.assignmentLoadError?'<div class="portal-empty portal-assignment-error"><span class="iconbox" data-icon="alert-circle"></span><h3>تعذّر تحميل الواجبات</h3><p>نسخة Firebase Functions الخاصة بالواجبات غير متاحة حاليًا. أبلغ المدرس أو حاول بعد قليل.</p></div>':'<div class="portal-empty"><span class="iconbox" data-icon="file-text"></span><h3>لا يوجد واجب جديد لصفك</h3><p>عندما ينشر المدرس الواجب سيظهر هنا تلقائيًا.</p></div>';
  const recitationCards=recitations.length?recitations.slice(0,12).map(r=>`<article class="student-record-card"><div><span class="record-eyebrow">متابعة التطبيق العملي</span><h4>${esc(r.title||'تطبيق عملي الحصة')}</h4><small>${esc(formatPortalDate(r.date||r.createdAt))}</small></div><span class="badge ${classRecordComplete(r)?'good':'warn'}">${esc(r.status||(classRecordComplete(r)?'تم التطبيق العملي':'قيد المتابعة'))}</span></article>`).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="book-open"></span><h3>لا يوجد تطبيق عملي مسجل</h3><p>عندما يعلّم المدرس على التطبيق العملي سيظهر هنا تلقائيًا.</p></div>';
  const paymentCards=monthlyPayments.length?monthlyPayments.slice(0,24).map(row=>{const status=row.status==='paid'?'مدفوع بالكامل':row.status==='partial'?'دفع جزئي':'لم يدفع',badge=row.status==='paid'?'good':row.status==='partial'?'warn':'danger';return `<article class="student-record-card"><div><span class="record-eyebrow">${esc(row.academicYear||'-')} · ${esc(row.course||st.grade||'-')}</span><h4>${esc(row.month||'-')}</h4><small>المطلوب ${esc(formatPortalMoney(row.expectedAmount))} · المدفوع ${esc(formatPortalMoney(row.paidAmount))} · المتبقي ${esc(formatPortalMoney(row.remainingAmount))}</small></div><span class="badge ${badge}">${status}</span></article>`;}).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="clipboard"></span><h3>لا توجد دفعات شهرية مسجلة</h3><p>ستظهر هنا كل دفعة شهرية فور تسجيلها من الإدارة.</p></div>';
  return `<div class="student-app-dashboard">
    ${pending?`<section class="portal-pending-banner"><span data-icon="calendar"></span><div><b>قيد التسجيل — في انتظار موافقة المدرس</b><small>بياناتك اتسجلت وتقدر تدخل بنفس الكود في أي وقت. الحضور والدرجات هتظهر تلقائيًا بعد الاعتماد.</small></div></section>`:''}
    <section class="student-app-header">
      <div class="student-identity"><span class="student-avatar">${esc(initials||'ط')}</span><div><span class="kicker"><span data-icon="user-check"></span> ${isParent?'تقرير ولي الأمر':'مرحبًا بك'}</span><h2>${esc(st.name)}</h2><p>${esc(st.grade||'-')} <span>•</span> ${esc(st.group||'-')}${st.scheduleDays?` <span>•</span> ${esc(st.scheduleDays)}`:''}${st.scheduleStartTime?` <span>•</span> ${esc(formatTime12(st.scheduleStartTime))}`:''}</p><code>${esc(st.studentCode)}</code></div></div>
      <details class="student-qr-details"><summary><span data-icon="qr"></span> عرض QR الطالب</summary><div class="real-qr-wrap">${makeQR(qrValue(st))}<small>${esc(qrValue(st))}</small></div></details>
    </section>
    <section class="student-kpi-grid">
      <article><span data-icon="bar-chart"></span><b>${c.final}%</b><small>المستوى العام</small></article>
      <article><span data-icon="star"></span><b>${c.avg}%</b><small>متوسط الدرجات</small></article>
      <article><span data-icon="calendar"></span><b>${c.attendancePct}%</b><small>نسبة الحضور</small></article>
      <article><span data-icon="book-open"></span><b>${c.recitationPct}%</b><small>انتظام التطبيق العملي</small></article>
      <article><span data-icon="file-text"></span><b>${c.homeworkPct}%</b><small>انتظام الواجب</small></article>
      <article class="${st.paid?'paid':'unpaid'}"><span data-icon="clipboard"></span><b>${st.paid?'تم الدفع':'لم يتم الدفع'}</b><small>حالة الدفع</small></article>
    </section>
    <nav class="student-tabbar" aria-label="أقسام ملف الطالب">
      <button class="active" type="button" data-student-tab="overview"><span data-icon="sparkles"></span><span>الملخص</span></button>
      <button type="button" data-student-tab="grades"><span data-icon="bar-chart"></span><span>الدرجات</span></button>
      <button type="button" data-student-tab="attendance"><span data-icon="calendar"></span><span>الحضور</span></button>
      <button type="button" data-student-tab="recitation"><span data-icon="book-open"></span><span>التطبيق العملي</span></button>
      <button type="button" data-student-tab="homework"><span data-icon="file-text"></span><span>الواجبات</span></button>
      <button type="button" data-student-tab="payments"><span data-icon="database"></span><span>المدفوعات</span></button>
    </nav>
    <section class="student-tab-panel show" data-student-panel="overview">
      <div class="student-overview-grid">
        <article class="student-highlight-card"><span class="iconbox" data-icon="sparkles"></span><div><small>تقييمك الحالي</small><h3>${esc(c.level)}</h3><p>استمر في الحضور وحل الاختبارات والتطبيق العملي والواجبات لتحسين ترتيبك.</p></div></article>
        <article class="student-highlight-card"><span class="iconbox" data-icon="star"></span><div><small>آخر درجة</small><h3>${c.lastGrade?esc(c.lastGrade.score)+'%':'لا توجد بعد'}</h3><p>${c.lastGrade?esc(c.lastGrade.exam||c.lastGrade.examTitle||'آخر امتحان'):'ستظهر آخر نتيجة هنا.'}</p></div></article>
      </div>
      <article class="teacher-note-card"><span data-icon="clipboard"></span><div><small>ملاحظات المدرس</small><p>${esc(st.notes||'لا توجد ملاحظات حالية. استمر في المذاكرة والمتابعة.')}</p></div></article>
      <div class="student-quick-links"><a href="${esc(portalUrl('materials.html',st.studentCode))}"><span data-icon="book-open"></span><b>محاضرات المسار</b><small>راجع شرح وملفات مسارك</small></a><a href="${esc(portalUrl('questions.html',st.studentCode))}"><span data-icon="help-circle"></span><b>أسئلة المسار</b><small>تدرب على أسئلة ومراجعات مسارك</small></a><a href="${esc(portalUrl('exams.html',st.studentCode))}"><span data-icon="clipboard"></span><b>الاختبارات</b><small>ابدأ امتحانك بالكود</small></a><a href="index.html#contact"><span data-icon="phone"></span><b>تواصل مع المدرس</b><small>للاستفسار والمتابعة</small></a></div>
    </section>
    <section class="student-tab-panel" data-student-panel="grades"><div class="student-panel-title"><div><span class="kicker"><span data-icon="bar-chart"></span> النتائج</span><h3>درجات الاختبارات</h3></div><span class="badge">${grades.length} نتيجة</span></div><div class="student-record-list">${gradeCards}</div></section>
    <section class="student-tab-panel" data-student-panel="attendance"><div class="student-panel-title"><div><span class="kicker"><span data-icon="calendar"></span> المتابعة</span><h3>سجل الحضور والغياب</h3></div><span class="badge good">${c.present} حضور</span></div><div class="attendance-mini-kpis"><span><b>${c.totalAttendance}</b> إجمالي</span><span><b>${c.present}</b> حاضر</span><span><b>${c.absent}</b> غائب</span></div><div class="student-record-list">${attendanceCards}</div></section>
    <section class="student-tab-panel" data-student-panel="recitation"><div class="student-panel-title"><div><span class="kicker"><span data-icon="book-open"></span> التطبيق العملي</span><h3>سجل تطبيق عملي الطالب</h3></div><span class="badge good">${c.recitationCount} مرة</span></div><div class="student-record-list">${recitationCards}</div></section>
    <section class="student-tab-panel" data-student-panel="homework"><div class="student-panel-title"><div><span class="kicker"><span data-icon="file-text"></span> الواجبات</span><h3>الواجب المنشور لصفك</h3></div><span class="badge warn">${assignments.length} واجب</span></div><div class="student-assignment-list">${assignmentCards}</div><details class="student-homework-history"><summary>سجل الواجبات السابقة</summary><div class="student-record-list">${homeworkCards}</div></details>${isParent?'':`<form class="homework-upload-form student-upload-card" data-student-code="${esc(st.studentCode)}"><label><span data-icon="upload"></span><span><b>رفع ملف واجب إضافي</b><small>صورة أو PDF بحد أقصى 10MB</small></span><input type="file" name="file" accept="image/*,application/pdf"></label><button class="btn primary" type="submit"><span data-icon="upload"></span> رفع الملف</button></form>`}</section>
    <section class="student-tab-panel" data-student-panel="payments"><div class="student-panel-title"><div><span class="kicker"><span data-icon="database"></span> السجل المالي</span><h3>تاريخ الدفعات الشهرية</h3></div><span class="badge">${monthlyPayments.length} شهر</span></div><div class="student-record-list">${paymentCards}</div></section>
  </div>`;
}
function bindStudentDashboard(){
  const dashboard=document.querySelector('.student-app-dashboard'); if(!dashboard)return;
  const buttons=[...dashboard.querySelectorAll('[data-student-tab]')];
  const panels=[...dashboard.querySelectorAll('[data-student-panel]')];
  buttons.forEach(btn=>btn.addEventListener('click',()=>{
    const key=btn.dataset.studentTab;
    buttons.forEach(x=>x.classList.toggle('active',x===btn));
    panels.forEach(x=>x.classList.toggle('show',x.dataset.studentPanel===key));
    const target=dashboard.querySelector(`[data-student-panel="${key}"]`);
    if(window.innerWidth<700) target?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}
var portalStudentCache=new Map();
async function loadStudentForPortal(code){
  const key=normalizeText(code), cached=portalStudentCache.get(key);
  if(cached&&Date.now()-cached.time<120000)return cached.student;
  if(window.MFCloud?.ready && window.MFCloud.getStudentByCode){
    const student=await window.MFCloud.getStudentByCode(code);
    // A partially deployed Firebase backend can still return the old portal
    // payload without the assignments field. Try the secure resources endpoint
    // once and show its failure instead of pretending the grade has no homework.
    if(student&&!Array.isArray(student.assignments)&&window.MFCloud.getStudentResources){
      try{
        const resources=await window.MFCloud.getStudentResources(code);
        student.assignments=Array.isArray(resources?.assignments)?resources.assignments:[];
        if(resources?.student?.grade)student.grade=resources.student.grade;
      }catch(error){student.assignments=[];student.assignmentLoadError=String(error?.code||error?.message||'assignment-service-unavailable');}
    }
    if(student)portalStudentCache.set(key,{student,time:Date.now()});
    return student;
  }
  if(window.MF_FIREBASE_CONFIG?.useSecureFunctions===false){
    const student=findStudentByCode(code);if(student)portalStudentCache.set(key,{student,time:Date.now()});return student;
  }
  throw new Error('Secure student portal is unavailable');
}
async function setupStudent(){
  const form=document.getElementById('studentSearchForm'); if(!form) return;
  const input=form.querySelector('[name="query"],#studentQuery');
  const quickCode=toEnglishDigits(new URLSearchParams(location.search).get('code')||'').trim().toUpperCase();
  safeStorageRemove(LAST_STUDENT_CODE_KEY);
  if(input && quickCode)input.value=quickCode;
  input?.addEventListener('input',()=>{input.value=input.value.toUpperCase().replace(/\s+/g,'');});
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const code=toEnglishDigits(input?.value).trim().toUpperCase(); const box=document.getElementById('studentResult'); const button=form.querySelector('[type="submit"]');
    if(!code) return toast('اكتب كود الطالب أولًا');
    safeStorageRemove(LAST_STUDENT_CODE_KEY);
    button?.classList.add('is-loading'); if(button)button.disabled=true; form.setAttribute('aria-busy','true');
    box.innerHTML='<div class="portal-loading"><span></span><b>جاري تحميل ملف الطالب...</b><small>لحظات بسيطة</small></div>';
    try{
      const st=await loadStudentForPortal(code);
      if(!st){box.innerHTML=`<div class="portal-empty portal-empty-large"><span class="iconbox" data-icon="search"></span><h3>الكود غير صحيح</h3><p>راجع الكود المكتوب وحاول مرة أخرى، مع التأكد من الحروف والأرقام.</p><button class="btn ghost" type="button" onclick="document.getElementById('studentQuery')?.focus()">إعادة المحاولة</button></div>`; hydrateIcons(); return;}
      box.innerHTML=studentProfileHTML(st,false); bindStudentDashboard(); bindHomeworkForms(); hydrateIcons();
      document.dispatchEvent(new CustomEvent('technominds:student-loaded',{detail:{student:st,code}}));
      box.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){const raw=String(err?.code||'')+' '+String(err?.message||'');const message=/not-found/i.test(raw)?'الكود غير موجود في بيانات الطلاب. لو سجلت حجزًا جديدًا استخدم نفس الكود، أو راجع الإدارة للتأكد أن الطالب محفوظ ونشط.':/invalid-argument/i.test(raw)?'اكتب كود الطالب كاملًا كما يظهر في لوحة الإدارة.':/internal|unavailable|failed-precondition|function.*unavailable/i.test(raw)?'تعذر الاتصال ببوابة الطالب الآن. حدّث الصفحة وحاول مرة أخرى، وإن استمرت المشكلة تواصل مع الإدارة.':firebaseFriendlyError(err,'تعذر تحميل بيانات الطالب');box.innerHTML=dataErrorHTML(message);hydrateIcons();}
    finally{button?.classList.remove('is-loading'); if(button)button.disabled=false; form.removeAttribute('aria-busy');}
  });
  if(quickCode&&!form.dataset.autoLoaded){form.dataset.autoLoaded='true';setTimeout(()=>form.requestSubmit(),120);}
}
var parentQrScanner = null;
var lastParentStudent = null;

function studentReportRows(st){
  const attendance = getAttendanceRows(st);
  const grades = [...(st.grades||[]),...(st.examAttempts||[])];
  const homeworks = st.homeworks || [];
  const recitations = st.recitations || [];
  return { attendance, grades, homeworks, recitations };
}

function parentReportText(raw){
  const st = normalizedStudent(raw);
  const c = calcStudent(st);
  const rows = studentReportRows(st);
  const lastGrade = rows.grades.filter(g=>g.score!==undefined && g.score!==null && g.score!=='').slice(-1)[0];
  const lastAttendance = rows.attendance.slice(0,6).map(r=>`- ${r.date || '-'}: ${arStatus(r.status)} ${r.time ? '('+formatTime12(r.time)+')' : ''}`).join('\n') || '- لا توجد سجلات حضور بعد';
  return `تقرير متابعة شهر ${monthLabel(st)}\n\nالطالب: ${st.name || '-'}\nالكود الموحد: ${st.studentCode || '-'}\nالمسار: ${st.grade || '-'}\nالمجموعة: ${st.group || '-'}\n\nملخص الحالة:\n- المستوى العام: ${c.final}% - ${c.level}\n- نسبة الحضور: ${c.attendancePct}%\n- متوسط الدرجات: ${c.avg}%\n- انتظام التطبيق العملي: ${c.recitationPct}% (${c.recitationCount} مرة)\n- انتظام الواجب: ${c.homeworkPct}% (${c.homeworkCount} مرة)\n- حالة الدفع: ${st.paid ? 'تم الدفع' : 'لم يتم الدفع'}\n\nآخر درجة: ${lastGrade ? (lastGrade.exam || lastGrade.examTitle || 'امتحان') + ' - ' + (lastGrade.score ?? 'بانتظار التصحيح') : 'لا توجد درجات بعد'}\n\nالحضور والغياب:\n${lastAttendance}\n\nملاحظات المدرس:\n${st.notes || 'لا توجد ملاحظات حالية.'}\n\nمع تحيات م. عمرو خالد`;
}

function parentReportHTML(raw){
  const st = normalizedStudent(raw);
  const c = calcStudent(st);
  const rows = studentReportRows(st);
  const grades = rows.grades.slice(-8).reverse();
  const hw = rows.homeworks.slice(-6).reverse();
  const recitations = rows.recitations.slice(-6).reverse();
  const payClass = st.paid ? 'good' : 'danger';
  const teacherName = appData.settings?.teacherName || 'م. عمرو خالد';
  const today = new Date().toLocaleDateString('ar-EG');
  return `<div class="parent-monthly-report-v40" id="parentMonthlyReport">
    <div class="parent-report-cover-v40">
      <div class="parent-report-brand-v40">
        <span class="teacher-name-v40">${esc(teacherName)}</span>
        <span class="report-date-v40">${esc(today)}</span>
      </div>
      <div class="parent-report-cover-content-v40">
        <div class="parent-report-main-v40">
          <span class="kicker"><span data-icon="file-text"></span> تقرير ولي الأمر الشهري</span>
          <h2>${esc(st.name || '-')}</h2>
          <p>تقرير متابعة شهر <b>${esc(monthLabel(st))}</b> · كود الطالب: <b>${esc(st.studentCode)}</b></p>
          <div class="parent-report-tags-v40">
            <span>${esc(st.grade || '-')}</span>
            <span>${esc(st.group || '-')}</span>
            <span class="badge ${payClass}">${st.paid?'تم الدفع':'لم يتم الدفع'}</span>
          </div>
        </div>
        <div class="parent-report-qr-v40"><b>QR الطالب</b>${makeQR(qrValue(st))}<small>${esc(qrValue(st))}</small></div>
      </div>
    </div>
    <div class="parent-actions-v38 no-print">
      <button class="btn primary" onclick="printParentReport()"><span data-icon="file-text"></span> طباعة / حفظ PDF</button>
      <button class="btn ghost" onclick="copyParentReport('${esc(st.studentCode)}')"><span data-icon="clipboard"></span> نسخ التقرير</button>
      ${st.parentPhone?`<button class="btn whatsapp-report-btn" onclick="openParentWhatsApp('${esc(st.studentCode)}')"><span data-icon="phone"></span> إرسال واتساب</button>`:''}
    </div>
    <div class="metric-grid parent-report-metrics-v40">
      <div class="metric main-metric-v40"><b>${c.final}%</b><small>المستوى العام</small></div>
      <div class="metric"><b>${c.attendancePct}%</b><small>نسبة الحضور</small></div>
      <div class="metric"><b>${c.avg}%</b><small>متوسط الدرجات</small></div>
      <div class="metric"><b>${c.recitationPct}%</b><small>انتظام التطبيق العملي</small></div>
      <div class="metric"><b>${c.homeworkPct}%</b><small>انتظام الواجب</small></div>
      <div class="metric"><b>${c.totalAttendance}</b><small>إجمالي الحصص</small></div>
    </div>
    <div class="parent-status-card-v40 ${c.final>=75?'good':'warn'}">
      <div><span>الحالة العامة</span><h3>${esc(c.level)}</h3></div>
      <p>${c.final>=75?'المستوى مطمئن، حافظوا على نفس الالتزام.':'محتاج متابعة منتظمة في الحضور والتطبيق العملي والواجبات والدرجات.'}</p>
    </div>
    ${attendanceSummaryHTML(st)}
    <div class="parent-detail-grid-v40">
      <div class="mini-panel parent-panel-v40">
        <h3>الدرجات والاختبارات</h3>
        ${grades.length?grades.map(g=>`<div class="report-list-row-v40"><div><b>${esc(g.exam||g.examTitle||'امتحان')}</b><small>${esc(g.date||g.submittedAt||'')}</small></div><span class="badge ${g.score!==null&&g.score!==undefined?'good':'warn'}">${g.score!==null&&g.score!==undefined?esc(g.score)+'%':'بانتظار التصحيح'}</span></div>`).join(''):'<p class="section-desc">لا توجد درجات مسجلة بعد.</p>'}
      </div>
      <div class="mini-panel parent-panel-v40">
        <h3>الواجبات والمتابعة</h3>
        ${hw.length?hw.map(h=>`<div class="report-list-row-v40"><div><b>${esc(h.title||h.homeworkTitle||'واجب')}</b><small>${esc(formatPortalDate(h.date||h.submittedAt))}</small></div><span class="badge ${classRecordComplete(h)?'good':'warn'}">${esc(h.status||(classRecordComplete(h)?'تم عمل الواجب':'قيد المتابعة'))}</span></div>`).join(''):'<p class="section-desc">لا توجد واجبات مسجلة بعد.</p>'}
      </div>
      <div class="mini-panel parent-panel-v40">
        <h3>التطبيق العملي</h3>
        ${recitations.length?recitations.map(r=>`<div class="report-list-row-v40"><div><b>${esc(r.title||'تطبيق عملي الحصة')}</b><small>${esc(formatPortalDate(r.date||r.createdAt))}</small></div><span class="badge ${classRecordComplete(r)?'good':'warn'}">${esc(r.status||(classRecordComplete(r)?'تم التطبيق العملي':'قيد المتابعة'))}</span></div>`).join(''):'<p class="section-desc">لا يوجد تطبيق عملي مسجل بعد.</p>'}
      </div>
      <div class="mini-panel parent-panel-v40 parent-notes-v40">
        <h3>ملاحظات ${esc(teacherName)}</h3>
        <p>${esc(st.notes||'لا توجد ملاحظات حالية.')}</p>
      </div>
      <div class="mini-panel parent-panel-v40 parent-pay-v40">
        <h3>الدفع والشهر</h3>
        <p><b>الشهر:</b> ${esc(monthLabel(st))}</p>
        <p><b>حالة الدفع:</b> <span class="badge ${payClass}">${st.paid?'تم الدفع':'لم يتم الدفع'}</span></p>
        ${st.paymentDate?`<p><b>تاريخ التسجيل:</b> ${esc(st.paymentDate)}</p>`:''}
      </div>
    </div>
    <div class="report-footer-v40">مع تحيات ${esc(teacherName)}</div>
  </div>`;
}

async function showParentReportByCode(code){
  const box=document.getElementById('parentResult');
  if(!code){toast('اكتب كود الحساب الموحد'); return;}
  if(box) box.innerHTML='<div class="skeleton" style="height:160px"></div>';
  let st=null,lookupError=null;
  if(window.MFCloud?.ready && window.MFCloud.getParentStudent){
    try{st=await window.MFCloud.getParentStudent(code);}catch(error){lookupError=error;}
  }
  if(!st && window.MF_FIREBASE_CONFIG?.useSecureFunctions===false) st=findStudentByCode(code);
  if(!st&&lookupError){
    const raw=String(lookupError?.code||'')+' '+String(lookupError?.message||'');
    const message=/not-found|invalid-argument/i.test(raw)?'كود الحساب غير صحيح أو غير موجود.':firebaseFriendlyError(lookupError,'تعذر تحميل تقرير ولي الأمر. تحقق من الإنترنت وحاول مرة أخرى.');
    if(box)box.innerHTML=dataErrorHTML(message);
    hydrateIcons();
    return;
  }
  if(!st){
    if(box) box.innerHTML=`<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="search"></span><h3>كود الحساب غير صحيح.</h3><p>اكتب نفس الكود الموحّد الموجود مع الطالب أو امسح الباركود.</p></div>`;
    hydrateIcons();
    return;
  }
  lastParentStudent = normalizedStudent(st);
  const input=document.querySelector('#parentSearchForm [name="parentCode"]'); if(input) input.value=code;
  if(box) box.innerHTML=parentReportHTML(lastParentStudent);
  hydrateIcons();
}

async function setupParent(){
  const form=document.getElementById('parentSearchForm'); if(!form) return;
  const input=form.querySelector('[name="parentCode"],[name="code"],[name="query"]');
  const quickCode=toEnglishDigits(new URLSearchParams(location.search).get('code')||'').trim().toUpperCase();
  if(input&&quickCode)input.value=quickCode;
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const code=toEnglishDigits(form.querySelector('[name="parentCode"],[name="code"],[name="query"]')?.value).trim().toUpperCase();
    const button=form.querySelector('[type="submit"]');
    button?.classList.add('is-loading');if(button)button.disabled=true;form.setAttribute('aria-busy','true');
    try{await showParentReportByCode(code);}
    finally{button?.classList.remove('is-loading');if(button)button.disabled=false;form.removeAttribute('aria-busy');}
  });
  if(quickCode&&!form.dataset.autoLoaded){form.dataset.autoLoaded='true';setTimeout(()=>form.requestSubmit(),120);}
}

window.copyParentReport = async function(code){
  const st = (lastParentStudent && lastParentStudent.studentCode===code) ? lastParentStudent : (window.MF_FIREBASE_CONFIG?.useSecureFunctions===false ? findStudentByCode(code) : null);
  if(!st) return toast('لم يتم العثور على الطالب');
  try{await navigator.clipboard.writeText(parentReportText(st)); toast('تم نسخ التقرير');}
  catch(e){toast('تعذر النسخ، جرّب من متصفح أحدث');}
};

window.openParentWhatsApp = function(code){
  const st = (lastParentStudent && lastParentStudent.studentCode===code) ? lastParentStudent : (window.MF_FIREBASE_CONFIG?.useSecureFunctions===false ? findStudentByCode(code) : null);
  if(!st) return toast('لم يتم العثور على الطالب');
  const phone = whatsappPhone(st.parentPhone);
  if(!phone) return toast('رقم ولي الأمر غير موجود في بيانات الطالب');
  window.open(whatsappLink(phone, parentReportText(st)), '_blank');
};

window.printParentReport = function(){
  const result=document.getElementById('parentResult'),root=result?.closest('main');
  if(!result||!result.querySelector('#parentMonthlyReport'))return toast('اعرض تقرير الطالب أولًا');
  document.body.classList.add('printing-parent-report');
  root?.classList.add('print-root');
  const cleanup=()=>{document.body.classList.remove('printing-parent-report');root?.classList.remove('print-root');window.removeEventListener('afterprint',cleanup);};
  window.addEventListener('afterprint',cleanup,{once:true});
  setTimeout(()=>{window.print();setTimeout(cleanup,1500);},50);
};

window.openParentQrScanner = async function(){
  const modal=document.getElementById('parentQrModal'); const reader=document.getElementById('parentQrReader');
  if(!modal || !reader) return;
  modal.hidden=false; reader.innerHTML='<p class="section-desc">جاري تجهيز الكاميرا…</p>';
  try{
    const onDecoded = async decoded => { await closeParentQrScanner(); await showParentReportByCode(String(decoded||'').trim()); };
    if(!window.Html5Qrcode)await window.MFAssets?.loadQrScanner?.();
    reader.innerHTML='';
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
function bindHomeworkForms(){
  document.querySelectorAll('.assignment-answer-form').forEach(form=>{form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button[type=submit]'),state=form.querySelector('.assignment-form-state'),type=form.dataset.assignmentType,payload={studentCode:form.dataset.studentCode,assignmentId:form.dataset.assignmentId,type};if(type==='mcq')payload.selectedOption=Number(new FormData(form).get('selectedOption'));else payload.answer=String(new FormData(form).get('answer')||'').trim();if(type!=='mcq'&&!payload.answer)return toast('اكتب إجابة الواجب أولًا');button?.classList.add('is-loading');if(button)button.disabled=true;if(state)state.textContent='جارٍ التسليم…';try{if(!window.MFCloud?.submitAssignmentAnswer)throw new Error('Assignment answer service unavailable');const result=await window.MFCloud.submitAssignmentAnswer(payload);const message=result?.correct===true?'إجابة صحيحة — تم تسليم الواجب':result?.correct===false?'تم التسليم — راجع إجابتك':'تم تسليم الواجب بنجاح';if(state){state.textContent=message;state.classList.add('success');}button.innerHTML='<span data-icon="user-check"></span> إعادة التسليم';hydrateIcons();toast(message);}catch(error){const message=firebaseFriendlyError(error,'تعذر تسليم الواجب. لم يتم حفظ الإجابة.');if(state)state.textContent=message;toast(message);}finally{button?.classList.remove('is-loading');if(button)button.disabled=false;}};});
  document.querySelectorAll('.homework-upload-form').forEach(form=>{form.onsubmit=async event=>{event.preventDefault();const input=form.querySelector('input[type=file]'),button=form.querySelector('button[type=submit]'),file=input?.files?.[0],code=form.dataset.studentCode;if(!file)return toast('اختار ملف الواجب أولًا');if(file.size>10*1024*1024)return toast('حجم الملف أكبر من 10MB');button?.classList.add('is-loading');if(button)button.disabled=true;try{if(!window.MFCloud?.uploadHomework)throw new Error('Homework upload service unavailable');await window.MFCloud.uploadHomework(file,code);if(input)input.value='';toast('تم رفع الواجب بنجاح');}catch(error){toast(firebaseFriendlyError(error,'تعذر رفع الواجب. الملف لم يُسجل ويمكنك المحاولة مرة أخرى.'));}finally{button?.classList.remove('is-loading');if(button)button.disabled=false;}};});
}
function setupBookingSteps(form){if(!form)return;const steps=[...form.querySelectorAll('[data-booking-step]')],indicators=[...form.querySelectorAll('[data-booking-indicator]')];const show=number=>{steps.forEach(step=>step.classList.toggle('active',Number(step.dataset.bookingStep)===number));indicators.forEach(item=>{const value=Number(item.dataset.bookingIndicator);item.classList.toggle('active',value===number);item.classList.toggle('done',value<number);});};form.querySelector('[data-booking-next]')?.addEventListener('click',()=>{const first=steps[0],required=[...first.querySelectorAll('[required]')];for(const input of required){if(!input.checkValidity()){input.reportValidity();return;}}show(2);steps[1]?.scrollIntoView({behavior:'smooth',block:'center'});});form.querySelector('[data-booking-back]')?.addEventListener('click',()=>show(1));form.addEventListener('booking-success',()=>{show(3);form.scrollIntoView({behavior:'smooth',block:'center'});});show(1);}
function setupBooking(){
  const form=document.getElementById('bookingForm');
  if(form){
    setupBookingSteps(form);
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const button=form.querySelector('button[type="submit"]');
      const b=Object.fromEntries(new FormData(form).entries());
      const selectedSchedule=document.getElementById('bookingGroup')?.selectedOptions?.[0];
      b.studentPhone=phoneDigits(b.studentPhone);
      b.parentPhone=phoneDigits(b.parentPhone);
      b.scheduleId=selectedSchedule?.dataset?.scheduleId||'';
      b.group=selectedSchedule?.value||b.group||'';
      b.academicYear=typeof currentAcademicContext==='function'?currentAcademicContext().academicYear:'';
      const statusBox=document.getElementById('bookingSubmitStatus');
      const showStatus=(message,type='info')=>{if(!statusBox)return;if(!message){statusBox.hidden=true;statusBox.textContent='';statusBox.className='booking-submit-status';return;}statusBox.hidden=false;statusBox.textContent=message;statusBox.className=`booking-submit-status ${type}`;};
      if(!window.MFCloud?.ready || !window.MFCloud?.createBooking){showStatus('الاتصال بالحجز لم يكتمل. تأكد من الإنترنت ثم اضغط تأكيد مرة أخرى.','error');return toast('الاتصال بالحجز لم يكتمل.');}
      showStatus('جاري تسجيل الحجز وتأمين الكود… لا تغلق الصفحة.','loading');
      button?.classList.add('is-loading'); if(button)button.disabled=true;
      try{
        b.requestId=bookingRequestId(b);
        const result=await window.MFCloud.createBooking(b);
        Object.assign(b,result||{}); b.id=b.code; b.date=isoDate(); b.status=b.status||'بانتظار الموافقة';
        appData.bookings=Array.isArray(appData.bookings)?appData.bookings:[];
        appData.bookings.push(b); saveData(appData);
        renderBookingSuccess(b);
        form.dispatchEvent(new Event('booking-success'));
        toast('تم تسجيل الحجز بنجاح — الحالة: قيد التسجيل');
        showStatus('تم تسجيل الحجز بنجاح. احتفظ بالكود الظاهر أمامك.','success');
        clearBookingRequest();
        form.reset(); fillSelects();
      }catch(err){
        console.error(err);
        const message=firebaseFriendlyError(err,'لم يكتمل الحجز. بياناتك ما زالت موجودة؛ اضغط تأكيد مرة أخرى.');
        showStatus(message,'error');
        toast(message);
      }finally{button?.classList.remove('is-loading');if(button)button.disabled=false;}
    });
  }
}
function portalUrl(file,code){const url=new URL(file,document.baseURI);url.searchParams.set('code',String(code||''));return url.href;}
function renderBookingSuccess(b){
  const box=document.getElementById('bookingSuccess');if(!box)return;
  const code=b.studentCode||b.code;
  box.hidden=false;
  box.innerHTML=`<div class="booking-success-card booking-student-pass compact-booking-pass">
    <span class="badge good">تم التسجيل بنجاح</span>
    <h3>الكود الموحّد جاهز</h3>
    <div class="booking-code-spotlight student-code"><small>الكود الموحّد</small><code>${esc(code)}</code><button class="small-btn primary" type="button" onclick="copyBookingCode('${esc(code)}')">نسخ الكود</button></div>
    <div class="booking-result-qr"><div class="real-qr-wrap">${makeQR(code)}<small>باركود الحساب الموحّد</small></div></div>
    <div class="hero-cta compact-portal-links"><a class="btn primary" href="${esc(portalUrl('student.html',code))}"><span data-icon="user-check"></span> بوابة الطالب</a><a class="btn ghost" href="${esc(portalUrl('parent.html',code))}"><span data-icon="users"></span> بوابة ولي الأمر</a></div>
    <p class="section-desc booking-approval-note">احتفظ بصورة للكود؛ ويمكن للإدارة نقلك إلى المجموعة المناسبة من لوحة التحكم.</p>
  </div>`;
  hydrateIcons();
}
window.copyBookingCode=function(code){navigator.clipboard?.writeText(code); toast('تم نسخ الكود');};
function renderHomeCounts(){const el=document.getElementById('liveCounts'); if(!el)return; el.innerHTML=`<div class="stat"><b>${GRADES.length}</b><small>مسارات تعليمية</small></div><div class="stat"><b>متاحة</b><small>بوابة الطالب</small></div><div class="stat"><b>QR</b><small>حضور واختبارات</small></div>`;}
let publicLeaderboardState={rows:null,expiresAt:0,promise:null,grade:''};
let publicLeaderboardRenderId=0;
function selectedLeaderboardGrade(){return document.getElementById('leaderboardGrade')?.value||GRADES[0];}
function setupLeaderboardGradePicker(){
  const select=document.getElementById('leaderboardGrade');if(!select)return;
  const saved=sessionStorage.getItem('mf_leaderboard_grade');if(saved&&GRADES.includes(saved))select.value=saved;
  select.addEventListener('change',()=>{sessionStorage.setItem('mf_leaderboard_grade',select.value);publicLeaderboardState={rows:null,expiresAt:0,promise:null,grade:select.value};renderPublicLeaderboard(true);});
}
async function renderPublicLeaderboard(force=false){
  const box=document.getElementById('publicLeaderboard');if(!box)return;
  const selectedGrade=selectedLeaderboardGrade();
  const renderId=++publicLeaderboardRenderId;
  box.innerHTML='<div class="skeleton" style="height:90px"></div>';
  let rows=[];
  try{
    if(!force&&publicLeaderboardState.grade===selectedGrade&&publicLeaderboardState.rows&&Date.now()<publicLeaderboardState.expiresAt)rows=publicLeaderboardState.rows;
    else{
      if(!publicLeaderboardState.promise)publicLeaderboardState.promise=Promise.resolve(window.MFCloud?.getPublicLeaderboard?.(selectedGrade)||[]).finally(()=>{publicLeaderboardState.promise=null;});
      rows=await publicLeaderboardState.promise||[];
      publicLeaderboardState.rows=rows;publicLeaderboardState.grade=selectedGrade;publicLeaderboardState.expiresAt=Date.now()+5*60*1000;
    }
  }catch(_){rows=[];}
  if(renderId!==publicLeaderboardRenderId||selectedGrade!==selectedLeaderboardGrade())return;
  rows=(rows||[]).filter(row=>String(row.grade||'').trim()===selectedGrade);
  box.className='leaderboard-five';
  box.innerHTML=rows.length?rows.map((x,i)=>{
    const name=String(x.name||'طالب متميز').trim();
    const score=Math.max(0,Math.min(100,Number(x.score)||0));
    return `<article class="leaderboard-row rank-${i+1}">
      <span class="leaderboard-rank" aria-label="المركز ${i+1}">${i+1}</span>
      <div class="leaderboard-student-info">
        <div class="leaderboard-name-line"><span class="leaderboard-avatar" aria-hidden="true">${esc(name.charAt(0)||'★')}</span><div><small class="leaderboard-name-label">اسم الطالب</small><h3>${esc(name)}</h3></div></div>
        <span class="leaderboard-grade">${esc(x.grade||'المسار غير محدد')}</span>
        <div class="leaderboard-metrics"><span>الحضور <b>${esc(x.attendancePct||0)}%</b></span><span>الدرجات <b>${esc(x.gradePct||0)}%</b></span><span>التطبيق العملي <b>${esc(x.recitationPct||0)}%</b></span><span>الواجب <b>${esc(x.homeworkPct||0)}%</b></span></div>
        <div class="progress" aria-label="المجموع ${score}%"><span style="width:${score}%"></span></div>
      </div>
      <div class="leaderboard-score"><small>المجموع</small><b>${score}%</b></div>
    </article>`;
  }).join(''):`<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="star"></span><h3>لا يوجد ترتيب لصف ${esc(selectedGrade)} بعد</h3><p>سيظهر أفضل خمسة طلاب من هذا المسار تلقائيًا بعد تسجيل نشاطهم خلال الشهر الحالي.</p></div>`;
  hydrateIcons();
}
window.refreshPublicLeaderboard=async function(){
  const button=document.getElementById('refreshLeaderboardButton');
  publicLeaderboardState={rows:null,expiresAt:0,promise:null,grade:selectedLeaderboardGrade()};
  if(button){button.disabled=true;button.classList.add('is-loading');}
  try{await renderPublicLeaderboard(true);}
  finally{if(button){button.disabled=false;button.classList.remove('is-loading');}}
};
function setupReviews(){
  const form=document.getElementById('reviewForm'); if(!form)return; setupStarInputs();
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const button=form.querySelector('button[type="submit"]');
    const review=Object.fromEntries(new FormData(form).entries());
    button?.classList.add('is-loading');if(button)button.disabled=true;
    try{
      if(!window.MFCloud?.saveReview)throw new Error('Review service unavailable');
      await window.MFCloud.saveReview(review);
      toast('تم إرسال التقييم وينتظر مراجعة المدرس'); form.reset(); setupStarInputs();
    }catch(err){console.error(err);toast(firebaseFriendlyError(err,'تعذر إرسال التقييم، حاول لاحقًا.'));}
    finally{button?.classList.remove('is-loading');if(button)button.disabled=false;}
  });
}
function setupStarInputs(){document.querySelectorAll('[data-star-input]').forEach(w=>{const input=w.querySelector('input'); const label=w.querySelector('span'); const buttons=[...w.querySelectorAll('button')]; const paint=n=>{buttons.forEach(b=>b.classList.toggle('active',Number(b.dataset.rate)<=n)); if(label) label.textContent=n+' نجوم';}; buttons.forEach(b=>b.onclick=()=>{input.value=b.dataset.rate; paint(Number(b.dataset.rate));}); paint(Number(input?.value||5));});}
function renderReviews(){const box=document.getElementById('reviewsList');if(!box)return;const rows=(appData.reviews||[]).filter(r=>r.approved!==false).slice(-8).reverse();box.innerHTML=rows.length?rows.map(r=>{const name=String(r.name||'طالب').trim(),initials=name.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('');return `<article class="review-display-card"><header><span class="review-avatar">${esc(initials||'ط')}</span><div><h3>${esc(name)}</h3><small>${esc(r.role||'طالب')}</small></div><div class="review-stars">${'★'.repeat(Number(r.rating||5))}</div></header><p>${esc(r.text||'')}</p><footer><span data-icon="user-check"></span> تقييم تم اعتماده</footer></article>`;}).join(''):`<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="star"></span><h3>لا توجد تقييمات منشورة بعد</h3><p>التقييمات الجديدة تظهر بعد مراجعة المدرس.</p></div>`;hydrateIcons();}
function attachmentHtml(item){if(item.fileData||item.fileUrl){const url=item.fileData||item.fileUrl; if(String(item.fileType||item.type||'').includes('image')||/\.(png|jpe?g|webp|gif)$/i.test(url)) return `<img class="attach-preview" src="${esc(url)}" alt="${esc(item.title||'ملف')}">`; return `<a class="btn ghost" target="_blank" rel="noreferrer" href="${esc(url)}"><span data-icon="external-link"></span> فتح الملف</a>`;} return '';}
var currentStudentResources=null;
function resourceCard(x,kind){const meta=[x.unit,x.lecture].filter(Boolean);return `<article class="card resource-card student-track-resource"><div class="resource-top"><span class="iconbox" data-icon="${kind==='question'?'help-circle':'book-open'}"></span><div class="resource-meta-badges"><span class="badge">${esc(x.grade||'كل المسارات')}</span>${meta.map(value=>`<span class="badge soft">${esc(value)}</span>`).join('')}</div></div><h3>${esc(x.title||'بدون عنوان')}</h3><p>${esc(x.desc||x.content||'')}</p>${attachmentHtml(x)}${kind==='question'&&x.answer?`<details class="resource-answer"><summary>عرض الإجابة النموذجية</summary><div class="written-box">${esc(x.answer)}</div></details>`:''}</article>`;}
function sortStudentResources(rows){return [...(rows||[])].sort((a,b)=>[a.unit,a.lecture,a.title].filter(Boolean).join(' ').localeCompare([b.unit,b.lecture,b.title].filter(Boolean).join(' '),'ar',{numeric:true}));}
function renderUnifiedResourcesPage(){
  const content=document.getElementById('studentResourcesContent'),summary=document.getElementById('resourceStudentSummary'),m=document.getElementById('materialsPageGrid'),q=document.getElementById('questionsPageGrid');
  if(!m&&!q)return;
  if(!currentStudentResources){if(content)content.hidden=true;if(summary)summary.hidden=true;return;}
  const student=currentStudentResources.student||{},materials=sortStudentResources(currentStudentResources.materials),questions=sortStudentResources(currentStudentResources.questions);
  if(content)content.hidden=false;
  if(summary){summary.hidden=false;summary.innerHTML=`<span class="student-avatar">${esc((student.name||'ط').trim().charAt(0))}</span><div><small>تم فتح محتوى المسار</small><h2>${esc(student.name||'الطالب')}</h2><p>${esc(student.grade||'')} ${student.group?`<span>•</span> ${esc(student.group)}`:''}</p><code>${esc(student.studentCode||'')}</code></div><button class="small-btn" type="button" onclick="changeResourceStudent()">تغيير الطالب</button>`;}
  document.querySelectorAll('[data-resource-cross-link]').forEach(link=>{const url=new URL(link.getAttribute('href'),document.baseURI);url.searchParams.set('code',student.studentCode||'');link.href=url.href;});
  if(m)m.innerHTML=materials.length?materials.map(x=>resourceCard(x,'material')).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="book-open"></span><h3>لا توجد محاضرات منشورة لهذا المسار بعد</h3><p>ستظهر المحاضرات والملفات هنا فور إضافتها من لوحة الإدارة.</p></div>';
  if(q)q.innerHTML=questions.length?questions.map(x=>resourceCard(x,'question')).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="help-circle"></span><h3>لا توجد أسئلة منشورة لهذا المسار بعد</h3><p>ستظهر الأسئلة والإجابات هنا فور إضافتها من لوحة الإدارة.</p></div>';
  hydrateIcons();
}
window.changeResourceStudent=function(){currentStudentResources=null;const form=document.getElementById('studentResourceCodeForm'),content=document.getElementById('studentResourcesContent'),summary=document.getElementById('resourceStudentSummary'),message=document.getElementById('resourceAccessMessage');if(content)content.hidden=true;if(summary)summary.hidden=true;if(message){message.hidden=false;message.textContent='اكتب كود الطالب لفتح محتوى مساره.';message.className='resource-access-message';}form?.querySelector('[name="query"]')?.focus();};
function setupStudentResourcesPage(){
  const form=document.getElementById('studentResourceCodeForm');if(!form)return;
  const input=form.querySelector('[name="query"]'),remember=form.querySelector('[name="rememberCode"]'),button=form.querySelector('button[type="submit"]'),message=document.getElementById('resourceAccessMessage');
  const saved=safeStorageGet(LAST_STUDENT_CODE_KEY);if(saved&&input){input.value=saved;if(remember)remember.checked=true;}
  form.addEventListener('submit',async event=>{
    event.preventDefault();const code=toEnglishDigits(input?.value||'').trim().toUpperCase();if(!code)return toast('اكتب كود الطالب أولًا');
    if(remember?.checked)safeStorageSet(LAST_STUDENT_CODE_KEY,code);
    if(message){message.hidden=false;message.textContent='جاري التحقق من الكود وتحميل محتوى المسار…';message.className='resource-access-message loading';}
    button?.classList.add('is-loading');if(button)button.disabled=true;
    try{
      if(!window.MFCloud?.getStudentResources)throw new Error('resource-service-unavailable');
      const result=await window.MFCloud.getStudentResources(code);if(!result?.student)throw new Error('not-found');
      currentStudentResources=result;if(message)message.hidden=true;renderUnifiedResourcesPage();
    }catch(error){currentStudentResources=null;renderUnifiedResourcesPage();if(message){message.hidden=false;message.textContent=firebaseFriendlyError(error,'تعذر فتح المحتوى. تأكد من كود الطالب وحاول مرة أخرى.');message.className='resource-access-message error';}}
    finally{button?.classList.remove('is-loading');if(button)button.disabled=false;}
  });
  const quickCode=toEnglishDigits(new URLSearchParams(location.search).get('code')||saved).trim().toUpperCase();if(quickCode&&!form.dataset.autoLoaded){form.dataset.autoLoaded='true';input.value=quickCode;setTimeout(()=>form.requestSubmit(),140);}
}
function renderExamQuestionHtml(q,i){
  return `<article class="exam-question-card" data-question-index="${i}"><div class="exam-question-number">السؤال ${i+1}</div><h3>${esc(q.question)}</h3>${q.type==='essay'?`<label class="exam-essay-field"><span>اكتب إجابتك بوضوح</span><textarea name="q${i}" rows="6" placeholder="اكتب إجابتك هنا..."></textarea></label>`:`<div class="exam-options">${q.options.map((o,oi)=>`<label class="exam-option"><input type="radio" name="q${i}" value="${oi}"><span class="exam-option-marker">${esc(q.optionLabels?.[oi]||String(oi+1))}</span><span>${esc(o)}</span></label>`).join('')}</div>`}</article>`;
}
function cleanAnswerLine(line){return String(line||'').replace(/^(answer|correct|الإجابة|الاجابة|الإجابة الصحيحة|الاجابة الصحيحة)\s*[:=：-]?\s*/i,'').trim();}
function parseOptionLine(line){
  const raw=toEnglishDigits(line).trim();
  let m=raw.match(/^([A-Da-dأإابجدهـه]|[1-4])\s*[\)\.\-:：]\s*(.+)$/);
  if(m) return {label:m[1].replace('إ','أ').replace('هـ','ه'), text:m[2].trim()};
  m=raw.match(/^-\s*(.+)$/);
  if(m) return {label:'', text:m[1].trim()};
  return null;
}
function parseExamQuestions(text){
  const blocks=toEnglishDigits(text).split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
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
function hasSubmitted(examId, code){
  const attempts=[...(currentExamStudent?.examAttempts||[]),...(appData.examAttempts||[])];
  return attempts.some(a=>String(a.examId)===String(examId)&&normalizeText(a.studentCode||code)===normalizeText(code)&&a.status!=='started');
}
var currentExamStudent=null;
var currentSecureExams=[];
function renderExamPortal(st,exams){
  const box=document.getElementById('examStudentResult');if(!box)return;
  currentExamStudent=normalizedStudent(st);currentSecureExams=Array.isArray(exams)?exams:currentSecureExams;
  const attempts=(st.examAttempts||[]).slice().reverse();
  const available=currentSecureExams.map(ex=>{
    const done=attempts.some(a=>String(a.examId)===String(ex.id)&&a.status!=='started')&&!ex.allowRetake;
    const draft=readExamDraft(ex.id,st.studentCode);
    return `<article class="exam-portal-card ${done?'completed':''}"><div class="exam-card-top"><span class="iconbox" data-icon="clipboard"></span><div class="exam-card-badges"><span class="badge">${esc(ex.duration||20)} دقيقة</span><span class="badge">${esc(ex.questionCount||'-')} سؤال</span>${ex.pdfUrl?'<span class="badge good">ملف PDF</span>':''}${draft&&!done?'<span class="badge warn">محاولة محفوظة</span>':''}</div></div><h3>${esc(ex.title)}</h3><p>${esc(ex.instructions||'اقرأ كل سؤال جيدًا قبل اختيار الإجابة.')}</p>${ex.pdfUrl?`<a class="small-btn exam-pdf-link" href="${esc(ex.pdfUrl)}" target="_blank" rel="noopener noreferrer"><span data-icon="file-text"></span> فتح ملف الامتحان PDF</a>`:''}<button class="btn ${done?'ghost':'primary'} exam-start-btn" type="button" data-exam-id="${esc(ex.id)}" data-student-code="${esc(st.studentCode)}" ${done?'disabled':''}><span data-icon="${done?'user-check':'clipboard'}"></span>${done?'تم تسليم الامتحان':draft?'متابعة الامتحان':'بدء الامتحان'}</button></article>`;
  }).join('');
  const resultCards=attempts.length?attempts.map(a=>{const ready=a.score!==null&&a.score!==undefined&&a.score!=='';return `<article class="exam-result-card"><div><span class="record-eyebrow">${esc(formatPortalDate(a.submittedAt))}</span><h4>${esc(a.examTitle||'امتحان')}</h4><small>${a.needsManualReview?'ينتظر تصحيح الأسئلة المقالية':'تم التصحيح الآمن على الخادم'}</small></div><strong class="score-pill ${ready?scoreClass(a.score):'warn'}">${ready?esc(a.score)+'%':'قيد التصحيح'}</strong></article>`;}).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="bar-chart"></span><h3>لا توجد محاولات بعد</h3><p>ستظهر نتائجك هنا بعد التسليم.</p></div>';
  box.innerHTML=`<section class="exam-student-banner"><span class="student-avatar">${esc(String(st.name||'ط').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join(''))}</span><div><small>اختبارات الطالب</small><h2>${esc(st.name)}</h2><p>${esc(st.grade||'')} <span>•</span> ${esc(st.studentCode)}</p></div></section><div class="exam-security-note"><span data-icon="user-check"></span><div><b>التصحيح مؤمّن</b><small>الإجابات النموذجية تظل محمية، ويتم التصحيح تلقائيًا وبأمان بعد التسليم.</small></div></div><div class="exam-portal-section"><div class="student-panel-title"><div><span class="kicker"><span data-icon="clipboard"></span> المتاح الآن</span><h3>الاختبارات المتاحة</h3></div><span class="badge">${currentSecureExams.length} امتحان</span></div><div class="exam-portal-grid">${available||'<div class="portal-empty"><span class="iconbox" data-icon="clipboard"></span><h3>لا توجد اختبارات حاليًا</h3><p>ستظهر اختبارات مسارك هنا فور نشرها.</p></div>'}</div></div><div class="exam-portal-section"><div class="student-panel-title"><div><span class="kicker"><span data-icon="bar-chart"></span> النتائج</span><h3>سجل الاختبارات</h3></div><span class="badge good">${attempts.length} محاولة</span></div><div class="exam-results-grid">${resultCards}</div></div>`;
  box.querySelectorAll('.exam-start-btn').forEach(btn=>btn.addEventListener('click',()=>window.startExam(btn.dataset.examId,btn.dataset.studentCode)));
  hydrateIcons();
}
function setupExamsPage(){
  const form=document.getElementById('examCodeForm');if(!form)return;
  const input=form.querySelector('[name="query"]');const remember=form.querySelector('[name="rememberCode"]');const saved=safeStorageGet(LAST_EXAM_CODE_KEY)||safeStorageGet(LAST_STUDENT_CODE_KEY);
  if(saved&&input){input.value=saved;if(remember)remember.checked=true;}
  form.addEventListener('submit',async e=>{
    e.preventDefault();const code=toEnglishDigits(input.value).trim().toUpperCase();const box=document.getElementById('examStudentResult');const button=form.querySelector('button[type="submit"]');
    if(!code)return;if(remember?.checked){safeStorageSet(LAST_EXAM_CODE_KEY,code);safeStorageSet(LAST_STUDENT_CODE_KEY,code);}else safeStorageRemove(LAST_EXAM_CODE_KEY);
    box.innerHTML='<div class="skeleton" style="height:180px"></div>';button?.classList.add('is-loading');if(button)button.disabled=true;
    try{
      const dashboard=await window.MFCloud?.getExamDashboard?.(code);
      if(!dashboard?.student)throw new Error('not-found');
      renderExamPortal(dashboard.student,dashboard.exams||[]);
    }catch(err){box.innerHTML=`<div class="portal-empty"><span class="iconbox" data-icon="search"></span><h3>تعذر فتح الاختبارات</h3><p>${esc(firebaseFriendlyError(err,'تأكد من كود الطالب واتصال الإنترنت ثم حاول مرة أخرى.'))}</p></div>`;hydrateIcons();}
    finally{button?.classList.remove('is-loading');if(button)button.disabled=false;}
  });
  const quickCode=toEnglishDigits(new URLSearchParams(location.search).get('code')||saved).trim().toUpperCase();
  if(quickCode&&!form.dataset.autoLoaded){form.dataset.autoLoaded='true';input.value=quickCode;setTimeout(()=>form.requestSubmit(),120);}
}
function examDraftKey(examId,studentCode){return `${EXAM_DRAFT_PREFIX}${String(examId).replace(/[^\w-]/g,'_')}_${String(studentCode).replace(/[^\w-]/g,'_')}`;}
function readExamDraft(examId,studentCode){try{return JSON.parse(safeStorageGet(examDraftKey(examId,studentCode))||'null');}catch(e){return null;}}
function saveExamDraft(examId,studentCode,draft){safeStorageSet(examDraftKey(examId,studentCode),JSON.stringify(draft));}
function clearExamDraft(examId,studentCode){safeStorageRemove(examDraftKey(examId,studentCode));}
window.startExam=async function(examId,studentCode){
  const metadata=currentSecureExams.find(e=>String(e.id)===String(examId));
  const st=(currentExamStudent&&normalizeText(currentExamStudent.studentCode)===normalizeText(studentCode)?currentExamStudent:null)||{studentCode};
  if(!metadata)return toast('الامتحان غير متاح. أعد إدخال كود الطالب.');
  let draft=readExamDraft(examId,studentCode);
  const validDraft=draft&&draft.sessionId&&Array.isArray(draft.questions)&&Number(draft.expiresAt)>Date.now();
  if(!validDraft){
    toast('جاري تجهيز جلسة الامتحان الآمنة...');
    try{
      const session=await window.MFCloud?.startSecureExam?.(examId,studentCode);
      if(!session?.sessionId||!Array.isArray(session.questions))throw new Error('Secure session unavailable');
      draft={examId:String(examId),studentCode:String(studentCode),sessionId:session.sessionId,questions:session.questions,exam:session.exam||metadata,answers:{},startedAt:session.startedAt,expiresAt:Number(session.expiresAt),current:0};
      saveExamDraft(examId,studentCode,draft);
    }catch(err){return toast(firebaseFriendlyError(err,'تعذر بدء الامتحان الآن. حدّث الصفحة وحاول مرة أخرى.'));}
  }
  const ex=draft.exam||metadata,qs=draft.questions;
  if(!qs.length)return toast('الامتحان لا يحتوي على أسئلة صالحة');
  const overlay=document.getElementById('examOverlay'),box=document.getElementById('examBox');overlay.classList.add('show');document.body.classList.add('exam-open');
  box.innerHTML=`<div class="exam-app-shell"><header class="exam-app-header"><div><span class="record-eyebrow">${esc(st.name||'الطالب')}</span><h2>${esc(ex.title)}</h2>${ex.pdfUrl?`<a class="exam-live-pdf" href="${esc(ex.pdfUrl)}" target="_blank" rel="noopener noreferrer"><span data-icon="file-text"></span> فتح PDF</a>`:''}</div><div class="exam-timer" id="examTimer"><span data-icon="calendar"></span><b>--:--</b></div></header><div class="exam-progress-wrap"><div><b id="examProgressLabel">السؤال 1 من ${qs.length}</b><small id="examSaveStatus">يتم حفظ الإجابات تلقائيًا على جهازك</small></div><div class="progress"><span id="examProgressBar" style="width:${100/qs.length}%"></span></div></div><form id="liveExamForm" novalidate><div id="examQuestionStage"></div><footer class="exam-navigation"><button class="btn ghost" id="examExitBtn" type="button"><span data-icon="external-link"></span> حفظ وخروج</button><div><button class="btn ghost" id="examPrevBtn" type="button">السابق</button><button class="btn primary" id="examNextBtn" type="button">التالي</button><button class="btn primary" id="examSubmitBtn" type="submit"><span data-icon="send"></span> تسليم الامتحان</button></div></footer></form></div>`;
  hydrateIcons();
  const stage=box.querySelector('#examQuestionStage'),form=box.querySelector('#liveExamForm'),next=box.querySelector('#examNextBtn'),prev=box.querySelector('#examPrevBtn'),submit=box.querySelector('#examSubmitBtn'),exit=box.querySelector('#examExitBtn');
  let current=Math.min(Math.max(Number(draft.current||0),0),qs.length-1),finished=false,timer=null;
  const answeredCount=()=>Object.values(draft.answers||{}).filter(v=>String(v??'').trim()!=='').length;
  const persistDraft=()=>{draft.current=current;saveExamDraft(examId,studentCode,draft);const status=box.querySelector('#examSaveStatus');if(status){status.textContent=`تم الحفظ • ${answeredCount()} من ${qs.length}`;status.classList.add('saved');setTimeout(()=>status?.classList.remove('saved'),700);}};
  const saveVisibleAnswer=()=>{const q=qs[current];if(q.type==='mcq'){const checked=form.querySelector(`input[name="q${current}"]:checked`);draft.answers[String(current)]=checked?checked.value:'';}else{draft.answers[String(current)]=form.elements[`q${current}`]?.value||'';}persistDraft();};
  const renderCurrent=()=>{stage.innerHTML=renderExamQuestionHtml(qs[current],current);const stored=draft.answers[String(current)];if(qs[current].type==='mcq'&&stored!==undefined&&stored!==''){const radio=stage.querySelector(`input[value="${CSS.escape(String(stored))}"]`);if(radio)radio.checked=true;}else if(qs[current].type==='essay'&&stored!==undefined){const area=stage.querySelector('textarea');if(area)area.value=stored;}stage.querySelectorAll('input').forEach(el=>el.addEventListener('change',saveVisibleAnswer));stage.querySelectorAll('textarea').forEach(el=>el.addEventListener('input',saveVisibleAnswer));box.querySelector('#examProgressLabel').textContent=`السؤال ${current+1} من ${qs.length}`;box.querySelector('#examProgressBar').style.width=`${Math.round((current+1)/qs.length*100)}%`;prev.disabled=current===0;next.hidden=current===qs.length-1;submit.hidden=current!==qs.length-1;persistDraft();};
  const currentAnswered=()=>String(draft.answers[String(current)]??'').trim()!=='';
  next.addEventListener('click',()=>{saveVisibleAnswer();if(!currentAnswered())return toast('اختر أو اكتب إجابة السؤال أولًا');current++;renderCurrent();stage.scrollIntoView({behavior:'smooth',block:'start'});});
  prev.addEventListener('click',()=>{saveVisibleAnswer();if(current>0){current--;renderCurrent();}});
  exit.addEventListener('click',()=>{saveVisibleAnswer();if(confirm('سيتم حفظ إجاباتك والوقت سيستمر. هل تريد الخروج؟')){clearInterval(timer);overlay.classList.remove('show');document.body.classList.remove('exam-open');toast('تم حفظ المحاولة، يمكنك متابعتها قبل انتهاء الوقت');}});
  const finish=async(force=false)=>{if(finished)return;saveVisibleAnswer();const firstMissing=qs.findIndex((q,i)=>String(draft.answers[String(i)]??'').trim()==='');if(firstMissing>=0&&!force){current=firstMissing;renderCurrent();return toast(`أجب عن السؤال ${firstMissing+1} قبل التسليم`);}if(!force&&!confirm('هل أنت متأكد من تسليم الامتحان؟ لن تستطيع تعديل الإجابات بعد التسليم.'))return;finished=true;clearInterval(timer);submit.disabled=true;submit.classList.add('is-loading');try{const result=await submitExamAttempt(draft.sessionId,st,draft.answers);clearExamDraft(examId,studentCode);overlay.classList.remove('show');document.body.classList.remove('exam-open');currentExamStudent.examAttempts=[...(currentExamStudent.examAttempts||[]),result];renderExamPortal(currentExamStudent,currentSecureExams);}catch(err){finished=false;submit.disabled=false;submit.classList.remove('is-loading');toast(firebaseFriendlyError(err,'تعذر تسليم الامتحان. إجاباتك ما زالت محفوظة.'));}};
  form.addEventListener('submit',e=>{e.preventDefault();finish(false);});
  const updateTimer=()=>{const left=Math.max(0,Number(draft.expiresAt)-Date.now());const total=Math.ceil(left/1000),m=Math.floor(total/60),sec=total%60;const timerEl=box.querySelector('#examTimer b');if(timerEl)timerEl.textContent=`${m}:${String(sec).padStart(2,'0')}`;box.querySelector('#examTimer')?.classList.toggle('danger',total<=60);if(left<=0)finish(true);};
  timer=setInterval(updateTimer,1000);updateTimer();renderCurrent();
};
async function submitExamAttempt(sessionId,st,answers){
  if(!window.MFCloud?.submitSecureExam)throw new Error('Secure submit function unavailable');
  const result=await window.MFCloud.submitSecureExam(sessionId,st.studentCode||st.code,answers);
  toast(result?.needsManualReview?'تم التسليم وينتظر تصحيح المدرس':'تم التسليم والتصحيح بأمان');
  return result;
}

function setupContact(){const a=document.getElementById('teacherWhatsapp'); if(a) a.href=whatsappLink(appData.settings?.teacherPhone||TEACHER_WHATSAPP,'مرحبًا م. عمرو خالد، أريد الاستفسار عن الحجز.');}
function setupAdminLink(){document.querySelectorAll('a[href="teacher-login.html"]').forEach(a=>a.remove());}
var studentQrScanner=null,studentQrStream=null,studentQrDecoded=false;
window.startStudentScanner=async function(){
  const box=document.getElementById('qrScannerBox'),reader=document.getElementById('studentQrReader'),video=document.getElementById('qrScannerVideo');
  if(!box||!reader||!video)return;
  if(!window.isSecureContext&&!/^(localhost|127\.0\.0\.1)$/.test(location.hostname))return toast('الكاميرا تحتاج فتح الموقع من رابط HTTPS الآمن');
  await window.stopStudentScanner();studentQrDecoded=false;box.hidden=false;reader.innerHTML='<p class="section-desc">جاري تجهيز الكاميرا…</p>';
  const decoded=async value=>{if(studentQrDecoded)return;studentQrDecoded=true;const input=document.getElementById('studentQuery');if(input)input.value=toEnglishDigits(value).trim().toUpperCase();await window.stopStudentScanner();document.getElementById('studentSearchForm')?.requestSubmit();};
  try{
    if(!window.Html5Qrcode)await window.MFAssets?.loadQrScanner?.();
    reader.innerHTML='';
    if(window.Html5Qrcode){
      video.hidden=true;reader.hidden=false;studentQrScanner=new Html5Qrcode('studentQrReader');
      await studentQrScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:240,height:240},aspectRatio:1},decoded,()=>{});
      toast('وجّه الكاميرا على QR الطالب');return;
    }
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera-unavailable');
    reader.hidden=true;video.hidden=false;studentQrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});video.srcObject=studentQrStream;await video.play();
    if(!('BarcodeDetector' in window))throw new Error('scanner-unavailable');
    const detector=new BarcodeDetector({formats:['qr_code']});
    const loop=async()=>{if(box.hidden||studentQrDecoded)return;const codes=await detector.detect(video).catch(()=>[]);if(codes.length)return decoded(codes[0].rawValue);setTimeout(loop,250);};
    toast('وجّه الكاميرا على QR الطالب');loop();
  }catch(error){
    await window.stopStudentScanner();box.hidden=false;reader.hidden=false;reader.innerHTML='<p class="section-desc">تعذر تشغيل ماسح QR. اسمح للمتصفح باستخدام الكاميرا أو اكتب الكود يدويًا.</p>';toast('تعذر فتح الكاميرا أو قراءة QR');
  }
};
window.stopStudentScanner=async function(){
  const box=document.getElementById('qrScannerBox'),video=document.getElementById('qrScannerVideo'),reader=document.getElementById('studentQrReader');
  try{if(studentQrScanner){await studentQrScanner.stop();studentQrScanner.clear();}}catch(error){}
  studentQrScanner=null;(studentQrStream?.getTracks?.()||[]).forEach(track=>track.stop());studentQrStream=null;
  if(video?.srcObject)video.srcObject.getTracks().forEach(track=>track.stop());if(video){video.srcObject=null;video.hidden=true;}if(reader)reader.innerHTML='';if(box)box.hidden=true;
};
function setupActiveNavigation(){
  const mobileNav=document.querySelector('.mobile-bottom');
  document.body.classList.toggle('mobile-nav-active',!!mobileNav);
  const update=()=>{
    const currentFile=location.pathname.split('/').pop()||'index.html';
    const currentHash=location.hash||'';
    document.querySelectorAll('.navlinks a,.mobile-bottom a').forEach(a=>{
      const url=new URL(a.getAttribute('href')||'',location.href);
      const linkFile=url.pathname.split('/').pop()||'index.html';
      const sameFile=linkFile===currentFile;
      const active=sameFile&&(url.hash?url.hash===currentHash:!currentHash);
      a.classList.toggle('active',active);
      if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
  };
  update();
  window.addEventListener('hashchange',update);
}
function bindLocalizedDigits(){
  if(window.__mfLocalizedDigitsBound)return;window.__mfLocalizedDigitsBound=true;
  const digitsOnly=input=>input.matches('[data-digits-only],[inputmode="numeric"],[inputmode="tel"],input[type="tel"],input[type="number"]');
  document.addEventListener('beforeinput',event=>{
    const input=event.target;if(!(input instanceof HTMLInputElement)||event.data===null)return;
    const converted=toEnglishDigits(event.data),cleaned=digitsOnly(input)?converted.replace(/\D/g,''):converted;
    if(digitsOnly(input)&&!cleaned){event.preventDefault();return;}
    if(cleaned===event.data)return;
    event.preventDefault();
    if(input.type==='number'){input.value=`${input.value||''}${cleaned}`;input.dispatchEvent(new Event('input',{bubbles:true}));return;}
    if(typeof input.setRangeText!=='function')return;
    try{const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;input.setRangeText(cleaned,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));}catch(_){ }
  });
  document.addEventListener('input',event=>{
    const input=event.target;if(!(input instanceof HTMLInputElement))return;
    let converted=toEnglishDigits(input.value);if(digitsOnly(input))converted=converted.replace(/\D/g,'');if(converted!==input.value)input.value=converted;
  });
}
function registerServiceWorker(){
  if(!('serviceWorker' in navigator)||location.protocol==='file:')return;
  const localDevelopment=['localhost','127.0.0.1','0.0.0.0'].includes(location.hostname);
  if(localDevelopment){
    // A worker left by an older local preview can serve offline.html for valid
    // student/parent links. Development does not need offline caching.
    Promise.all([
      navigator.serviceWorker.getRegistrations().then(rows=>Promise.all(rows.map(row=>row.unregister()))),
      'caches' in window?caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))):Promise.resolve()
    ]).finally(()=>{
      if(navigator.serviceWorker.controller&&!sessionStorage.getItem('mf_local_sw_cleaned')){
        sessionStorage.setItem('mf_local_sw_cleaned','1');location.reload();
      }
    });
    return;
  }
  window.addEventListener('load',async()=>{
    try{
      const registration=await navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'});
      await registration.update().catch(()=>{});
      if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
      registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)worker.postMessage({type:'SKIP_WAITING'});});});
    }catch(_){ }
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{try{if(sessionStorage.getItem('mf_sw_reloaded_v5614'))return;sessionStorage.setItem('mf_sw_reloaded_v5614','1');location.reload();}catch(_){ }});
}
function setupPWAInstall(){
  const button=document.getElementById('installAppButton');if(!button)return;let installPrompt=null;
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;});
  button.addEventListener('click',async()=>{if(!installPrompt)return toast('يمكنك تثبيت الموقع من قائمة المتصفح');installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;button.hidden=true;});
  window.addEventListener('appinstalled',()=>{button.hidden=true;toast('تم تثبيت المنصة على الهاتف');});
}
function setupClientErrorReporting(){window.addEventListener('error',event=>{window.MFCloud?.reportClientError?.({message:String(event.message||'خطأ JavaScript'),page:location.href,userAgent:navigator.userAgent}).catch(()=>{});});window.addEventListener('unhandledrejection',event=>{window.MFCloud?.reportClientError?.({message:String(event.reason?.message||event.reason||'Promise rejection'),page:location.href,userAgent:navigator.userAgent}).catch(()=>{});});}
function setupMotionReveal(){const items=[...document.querySelectorAll('main section,.app-service-card,.path-stage,.certificate-card')];items.forEach((item,index)=>{item.classList.add('tm-reveal');item.style.setProperty('--reveal-delay',`${Math.min(index%6,5)*45}ms`);});if(!('IntersectionObserver'in window)||matchMedia('(prefers-reduced-motion: reduce)').matches){items.forEach(item=>item.classList.add('is-visible'));return;}const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{rootMargin:'0px 0px -6% 0px',threshold:.08});items.forEach(item=>observer.observe(item));}
function init(){setupUnifiedHeader();setupImageLazyLoading();setupTheme(); setupActiveNavigation(); bindLocalizedDigits(); registerServiceWorker(); setupPWAInstall(); setupClientErrorReporting(); hydrateIcons(); fillSelects(); setupBooking(); setupStudent(); setupParent(); setupExamsPage(); setupStudentResourcesPage(); setupReviews(); setupContact(); setupAdminLink(); setupLeaderboardGradePicker(); renderHomeCounts(); renderPublicLeaderboard(); renderReviews(); renderUnifiedResourcesPage(); setupMotionReveal(); initFirebaseData();}
document.addEventListener('DOMContentLoaded',init);
