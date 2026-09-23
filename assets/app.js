var DEFAULT_SITE_URL = 'https://eng-amr-khaled-academy.vercel.app';
var TEACHER_WHATSAPP = '201008454029';
var ENGINEER_WHATSAPP = '201008454029';
var GRADES = ['أولى ثانوي بكالوريا','تانية ثانوي بكالوريا','أساسيات برمجة'];
var MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
var STORAGE_KEY = 'technominds_academy_v60_data';
var OLD_STORAGE_KEY = 'mf_science_v11_data';
var PUBLIC_STORAGE_KEY = 'technominds_academy_v60_public_cache';
var LAST_STUDENT_CODE_KEY = 'mf_last_student_code';
var LAST_EXAM_CODE_KEY = 'mf_last_exam_code';
var EXAM_DRAFT_PREFIX = 'mf_exam_draft_v2_';
var HOMEWORK_DRAFT_PREFIX = 'mf_homework_draft_v1_';
var HOMEWORK_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
var PENDING_BOOKING_REQUEST_KEY = 'mf_pending_booking_request_v1';
var cloudSaveTimer = null;
var staffCacheTimer = null;
var MF_ASSET_VERSION = '70.0.0';
var mfLazyScriptPromises = Object.create(null);
var publicScheduleUnsubscribe = null;

function setupInteractionPerformance(){
  if(window.__tmPerformanceBound)return;window.__tmPerformanceBound=true;window.__tmPerformanceSamples=[];
  document.addEventListener('click',event=>{const button=event.target.closest('button,.btn,.small-btn');if(!button)return;const started=performance.now(),name=String(button.dataset.performanceName||button.textContent||button.getAttribute('aria-label')||'button').trim().replace(/\s+/g,' ').slice(0,80);button.classList.add('tm-pressed');requestAnimationFrame(()=>{button.classList.remove('tm-pressed');const visualMs=Math.round((performance.now()-started)*100)/100,record={name,visualMs,totalMs:null,at:new Date().toISOString()};window.__tmPerformanceSamples.push(record);if(window.__tmPerformanceSamples.length>100)window.__tmPerformanceSamples.shift();const finish=()=>{record.totalMs=Math.round((performance.now()-started)*100)/100;};let checks=0;const poll=()=>{checks+=1;if(!button.isConnected||(!button.disabled&&!button.classList.contains('is-loading'))||checks>=200)return finish();setTimeout(poll,50);};setTimeout(poll,0);});},{capture:true});
}

function setupFastNavigationPrefetch(){
  if(window.__tmNavigationPrefetchBound)return;window.__tmNavigationPrefetchBound=true;
  const seen=new Set();
  const prefetch=event=>{
    if(seen.size>=12||navigator.connection?.saveData)return;
    const anchor=event.target.closest?.('a[href]');if(!anchor||anchor.hasAttribute('download'))return;
    let url;try{url=new URL(anchor.href,location.href);}catch(_){return;}
    if(url.origin!==location.origin||url.search||(!url.pathname.endsWith('.html')&&url.pathname!=='/'))return;
    url.hash='';if(seen.has(url.href))return;seen.add(url.href);
    fetch(url.href,{method:'GET',cache:'force-cache',credentials:'same-origin'}).catch(()=>seen.delete(url.href));
  };
  document.addEventListener('pointerover',prefetch,{passive:true});
  document.addEventListener('touchstart',prefetch,{passive:true});
  document.addEventListener('focusin',prefetch);
}

function setupValidationFeedback(){
  if(window.__tmValidationBound)return;window.__tmValidationBound=true;
  let notifiedForm=null;
  document.addEventListener('invalid',event=>{
    const control=event.target;if(!(control instanceof HTMLElement))return;
    control.setAttribute('aria-invalid','true');const form=control.closest('form');
    if(form!==notifiedForm){notifiedForm=form;toast('راجع الحقل المحدد وأكمل البيانات المطلوبة.');setTimeout(()=>{if(notifiedForm===form)notifiedForm=null;},800);}
  },true);
  const clear=event=>{const control=event.target;if(control instanceof HTMLElement&&control.matches('input,select,textarea')&&control.checkValidity?.())control.removeAttribute('aria-invalid');};
  document.addEventListener('input',clear,{passive:true});document.addEventListener('change',clear,{passive:true});
}

function setupDuplicateSubmitGuard(){
  if(window.__tmSubmitGuardBound)return;window.__tmSubmitGuardBound=true;
  document.addEventListener('submit',event=>{
    const form=event.target;if(!(form instanceof HTMLFormElement)||form.dataset.allowRapidSubmit==='true')return;
    const now=Date.now(),lockedUntil=Number(form.dataset.tmSubmitLockedUntil||0);
    if(lockedUntil>now){event.preventDefault();event.stopImmediatePropagation();toast('الطلب قيد التنفيذ بالفعل…');return;}
    form.dataset.tmSubmitLockedUntil=String(now+900);
    setTimeout(()=>{if(Number(form.dataset.tmSubmitLockedUntil||0)<=Date.now())delete form.dataset.tmSubmitLockedUntil;},950);
  },true);
}

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
  loadQrScanner:()=>loadLazyScript('qr-scanner','assets/vendor/html5-qrcode-2.3.8.min.js?v=65.0.8',()=>typeof window.Html5Qrcode==='function'),
  loadSpreadsheet:()=>loadLazyScript('spreadsheet','assets/vendor/xlsx-0.18.5.full.min.js',()=>typeof window.XLSX!=='undefined')
};

async function ensureQrScannerLibrary(){
  if(typeof window.Html5Qrcode==='function')return true;
  try{await window.MFAssets?.loadQrScanner?.();}
  catch(error){console.warn('QR scanner library failed to initialize; trying the browser fallback.',error);}
  return typeof window.Html5Qrcode==='function';
}
async function startCompatibleQrCamera(scanner,onDecoded,size=240){
  const config={fps:10,qrbox:{width:size,height:size},aspectRatio:1};
  const attempts=[{facingMode:'environment'},{facingMode:{ideal:'environment'}}];
  let lastError=null;
  for(const camera of attempts){try{await scanner.start(camera,config,onDecoded,()=>{});return true;}catch(error){lastError=error;}}
  const cameras=await window.Html5Qrcode.getCameras().catch(error=>{lastError=error;return[];});
  const back=(cameras||[]).find(item=>/back|rear|environment|خلف/i.test(item.label||''))||(cameras||[]).at(-1);
  if(back){try{await scanner.start(back.id,config,onDecoded,()=>{});return true;}catch(error){lastError=error;}}
  throw lastError||new Error('camera-unavailable');
}
window.startCompatibleQrCamera=startCompatibleQrCamera;
function cameraStartMessage(error){
  const name=String(error?.name||''),message=String(error?.message||error||'');
  if(!window.isSecureContext)return 'الكاميرا تحتاج فتح الموقع من رابط HTTPS الآمن.';
  if(/NotAllowed|Permission|denied/i.test(name+' '+message))return 'إذن الكاميرا مرفوض. افتح إعدادات الموقع وفعّل الكاميرا ثم أعد المحاولة.';
  if(/NotFound|DevicesNotFound|no camera/i.test(name+' '+message))return 'لم يتم العثور على كاميرا متاحة على هذا الجهاز.';
  if(/NotReadable|TrackStart|in use|Could not start/i.test(name+' '+message))return 'الكاميرا مستخدمة في تطبيق آخر. أغلقه ثم أعد المحاولة.';
  return 'تعذر تشغيل الكاميرا. فعّل إذن الكاميرا أو استخدم إدخال الكود يدويًا.';
}
window.cameraStartMessage=cameraStartMessage;
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
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 15H6L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M17 8l-5-5-5 5"></path><path d="M12 3v12"></path></svg>',
  refreshCw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 7h-5V2"></path><path d="M20 2v5l-3.5-3.5A9 9 0 1 0 21 12"></path></svg>',
  alertTriangle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.3 3.6 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4M12 17h.01"></path></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"></path></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>'
};

var PRODUCTION_MODE = true;
var appDataLoadFailed = false;

function iconNameToKey(name){return String(name||'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());}
function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(el=>{const key=iconNameToKey(el.dataset.icon);if(!icons[key]||el.dataset.iconRendered===key)return;el.innerHTML=icons[key];el.dataset.iconRendered=key;});}
function toast(msg){const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2800);}
function firebaseFriendlyError(err,fallback){const raw=`${err?.code||''} ${err?.message||''}`;if(/BACKEND_VERSION_MISMATCH/i.test(raw))return 'يوجد تحديث غير مكتمل للمنصة. حاول لاحقًا أو تواصل مع الإدارة.';if(/functions\/not-found|secure .* (?:function|service).*unavailable/i.test(raw))return 'الخدمة غير مفعّلة حاليًا. تواصل مع المدرس أو حاول لاحقًا.';if(/resource-exhausted/i.test(raw)){const message=raw.split(':').pop().trim();return /اكتمل عدد|تعذر إنشاء/.test(message)?message:'تم إرسال طلبات كثيرة لهذا الكود. انتظر لحظة ثم حاول مرة أخرى.';}if(/failed-precondition/i.test(raw))return raw.split(':').pop().trim()||'الاختيار لم يعد متاحًا. حدّث الصفحة وحاول مرة أخرى.';if(/invalid-argument/i.test(raw)){const message=raw.split(':').pop().trim();return /firebase|firestore|function|permission|internal/i.test(message)?(fallback||'تعذر إتمام الطلب. راجع البيانات وحاول مرة أخرى.'):message;}if(/deadline-exceeded/i.test(raw)){const message=raw.split(':').pop().trim();return /انتهى (?:وقت الامتحان|موعد تسليم)/.test(message)?message:'استغرق الاتصال وقتًا أطول من المعتاد. حاول مرة أخرى.';}if(/already-exists/i.test(raw)){const message=raw.split(':').pop().trim();return /الطالب موجود|كود الطالب|رقم الطالب|ولي الأمر/.test(message)?message:'تم تنفيذ العملية بالفعل.';}if(/permission-denied|unauthenticated/i.test(raw))return 'لا يمكن تنفيذ الطلب حاليًا. حدّث الصفحة ثم حاول مرة أخرى.';if(/unavailable|network|internal|fetch|offline|timeout/i.test(raw))return 'تعذر الاتصال بالخدمة. تحقق من الإنترنت وحاول مرة أخرى.';if(/not-found/i.test(raw))return 'الكود غير صحيح أو غير موجود.';return fallback||'حدث خطأ غير متوقع.';}
function studentCodeFriendlyError(err,fallback){const raw=`${err?.code||''} ${err?.message||''}`;if(/functions\/not-found|\bnot-found\b/i.test(raw))return 'الكود غير صحيح أو غير موجود.';return firebaseFriendlyError(err,fallback);}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function toEnglishDigits(v){return String(v||'').replace(/[٠-٩]/g,digit=>String(digit.charCodeAt(0)-1632)).replace(/[۰-۹]/g,digit=>String(digit.charCodeAt(0)-1776));}
function normalizeText(v){return toEnglishDigits(v).trim().toLowerCase().replace(/\s+/g,' ');}
function academicBaseValue(value){return normalizeText(String(value||'').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,'').replace(/\u0640/g,'').replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي'));}
function canonicalAcademicKey(value){
  const key=academicBaseValue(value),aliases={
    'اولي ثانوي برمجة':'اولي ثانوي بكالوريا','اولي ثانوي برمجه':'اولي ثانوي بكالوريا','اولي ثانوي':'اولي ثانوي بكالوريا',
    'تانيه ثانوي بكالوريا':'تانية ثانوي بكالوريا','ثانية ثانوي بكالوريا':'تانية ثانوي بكالوريا','ثانيه ثانوي بكالوريا':'تانية ثانوي بكالوريا',
    'تانية ثانوي عام':'تانية ثانوي بكالوريا','تانيه ثانوي عام':'تانية ثانوي بكالوريا','ثانية ثانوي عام':'تانية ثانوي بكالوريا','ثانيه ثانوي عام':'تانية ثانوي بكالوريا',
    'تانية ثانوي':'تانية ثانوي بكالوريا','تانيه ثانوي':'تانية ثانوي بكالوريا','ثانية ثانوي':'تانية ثانوي بكالوريا','ثانيه ثانوي':'تانية ثانوي بكالوريا',
    'اساسيات برمجه':'اساسيات برمجة','اساسيات python':'اساسيات برمجة','اساسيات بايثون':'اساسيات برمجة','تطبيقات ومراجعة':'اساسيات برمجة','تطبيقات و مراجعة':'اساسيات برمجة',
    'مبتدئين برمجة':'أساسيات برمجة','مبتدئين برمجه':'أساسيات برمجة','مبتدئين':'أساسيات برمجة'
  };
  return aliases[key]||key;
}
function canonicalAcademicLabel(value){const key=canonicalAcademicKey(value),labels=new Map(GRADES.map(label=>[academicBaseValue(label),label]));return labels.get(key)||String(value||'').trim();}
function sameAcademicValueClient(left,right){const a=canonicalAcademicKey(left),b=canonicalAcademicKey(right);return Boolean(a&&b&&a===b);}
function phoneDigits(v){return toEnglishDigits(v).replace(/\D/g,'');}
function validBookingPhone(v){const phone=phoneDigits(v);return phone.length>=10&&phone.length<=15&&!/^(\d)\1+$/.test(phone);}
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
function localDateTimeToIso(value){
  if(!value)return '';
  const raw=String(value).trim(),local=raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if(!local){const date=new Date(raw);return Number.isFinite(date.getTime())?date.toISOString():'';}
  // datetime-local has no timezone. Interpret the teacher's schedule as Cairo
  // time regardless of the phone/computer timezone, then store an ISO value.
  const desired=Date.UTC(Number(local[1]),Number(local[2])-1,Number(local[3]),Number(local[4]),Number(local[5]),Number(local[6]||0));
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  let guess=desired;
  for(let attempt=0;attempt<3;attempt+=1){
    const parts=Object.fromEntries(formatter.formatToParts(new Date(guess)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
    const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
    const adjustment=desired-represented;if(!adjustment)break;guess+=adjustment;
  }
  return new Date(guess).toISOString();
}
function isoToLocalDateTimeInput(value){
  if(!value)return '';
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return String(value).slice(0,16);
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function arStatus(status){return status==='present'?'حاضر':status==='absent'?'غائب':(status||'-');}
function statusClass(status){return status==='present'||status==='حاضر'||status===true?'good':status==='absent'||status==='غائب'||status===false?'danger':'warn';}
function whatsappLink(phone,msg){return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;}
function whatsappPhone(v){const d=phoneDigits(v); if(!d) return ''; if(d.startsWith('20')) return d; if(d.startsWith('0')) return '2'+d; return d;}
function monthLabel(st){return st?.month || MONTHS[new Date().getMonth()] || '';}
function safeStorageGet(key){try{return localStorage.getItem(key)||'';}catch(e){return '';}}
function safeStorageSet(key,value){try{localStorage.setItem(key,String(value??''));return true;}catch(e){return false;}}
function safeStorageRemove(key){try{localStorage.removeItem(key);}catch(e){}}
function portalSessionGet(key){try{return sessionStorage.getItem(key)||'';}catch(e){return '';}}
function portalSessionSet(key,value){try{sessionStorage.setItem(key,String(value??''));return true;}catch(e){return false;}}
function portalSessionRemove(key){try{sessionStorage.removeItem(key);}catch(e){}}
function clearLegacyPortalCodeFromUrl(){
  try{
    const url=new URL(location.href);
    if(!url.searchParams.has('code'))return;
    url.searchParams.delete('code');
    const query=url.searchParams.toString();
    history.replaceState(null,'',`${url.pathname}${query?`?${query}`:''}${url.hash}`);
  }catch(e){}
}
function formatPortalDate(value){if(!value)return '-'; try{return new Date(value).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'});}catch(e){return String(value);}}
function formatPortalMoney(value){const number=Number(value);return `${new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(Number.isFinite(number)?number:0)} ج.م`;}
function scoreLabel(score){const n=Number(score); if(Number.isNaN(n)) return 'بانتظار التصحيح'; return n>=90?'ممتاز':n>=75?'جيد جدًا':n>=60?'جيد':'يحتاج متابعة';}
function scoreClass(score){const n=Number(score); if(Number.isNaN(n)) return 'warn'; return n>=75?'good':n>=60?'warn':'danger';}
function getSiteBase(){return (appData.settings?.siteUrl || DEFAULT_SITE_URL || location.origin).replace(/\/$/,'');}
function assignmentPublishMillis(value){const millis=Date.parse(String(value||''));return Number.isFinite(millis)?millis:0;}
function assignmentIsReleasedClient(item,now=Date.now()){return item?.active!==false&&item?.published!==false&&item?.archived!==true&&item?.cancelled!==true&&!['مسودة','cancelled','archived'].includes(item?.status)&&(!assignmentPublishMillis(item?.publishAt)||assignmentPublishMillis(item.publishAt)<=now);}
function defaultData(){return {students:[],bookings:[],materials:[],questions:[],exams:[],examAttempts:[],grades:[],reviews:[],groups:[],assignments:[],studentTransferRequests:[],settings:{siteUrl:DEFAULT_SITE_URL||'',teacherPhone:TEACHER_WHATSAPP||''}};}
function mergeData(data){const d=defaultData(); const p=data||{}; return {...d,...p,settings:{...d.settings,...(p.settings||{})},students:Array.isArray(p.students)?p.students:[],bookings:Array.isArray(p.bookings)?p.bookings:[],materials:Array.isArray(p.materials)?p.materials:[],questions:Array.isArray(p.questions)?p.questions:[],exams:Array.isArray(p.exams)?p.exams:[],examAttempts:Array.isArray(p.examAttempts)?p.examAttempts:[],grades:Array.isArray(p.grades)?p.grades:[],reviews:Array.isArray(p.reviews)?p.reviews:[],groups:Array.isArray(p.groups)?p.groups:[],assignments:Array.isArray(p.assignments)?p.assignments:[],studentTransferRequests:Array.isArray(p.studentTransferRequests)?p.studentTransferRequests:[]};}
function isStaffWorkspace(){return (location.pathname.split('/').pop()||'')==='teacher-login.html';}
function publicDataOnly(data){const d=mergeData(data),settings=d.settings||{};return {...defaultData(),materials:d.materials,questions:d.questions,reviews:d.reviews.filter(r=>r.approved===true),groups:d.groups,assignments:d.assignments.filter(item=>assignmentIsReleasedClient(item)),settings:{siteUrl:settings.siteUrl||DEFAULT_SITE_URL,teacherPhone:settings.teacherPhone||TEACHER_WHATSAPP,teacherName:settings.teacherName||'م. عمرو خالد',homeNotice:settings.homeNotice||''}};}
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
      clearTimeout(staffCacheTimer);
      staffCacheTimer=setTimeout(()=>{
        try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(staffCacheOnly(data)));localStorage.removeItem(STORAGE_KEY);}catch(_){ }
      },120);
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
    if(path==='materials.html'||path==='theory-lectures.html') renderUnifiedResourcesPage();
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
    ['index.html','الرئيسية'],['materials.html','محاضرات عملي'],['theory-lectures.html','محاضرات نظري'],
    ['about.html','عن م. عمرو'],['practical.html','العملي'],['index.html#booking','الحجز'],
    ['student.html','بوابة الطالب'],['parent.html','ولي الأمر'],['questions.html','بنوك الأسئلة'],['exams.html','الاختبارات']
  ];
  const activeFile=file==='teacher-login.html'?'':file;
  header.innerHTML=`<div class="container navbar"><a aria-label="Techno Minds" class="logo" href="index.html"><span class="logo-mark"></span><span>Techno Minds <small>Programming &amp; AI</small></span></a><nav aria-label="روابط الموقع" class="navlinks">${links.map(([href,label])=>{const parts=href.split('#'),target=parts[0],hash=parts[1]||'';const active=hash?activeFile==='index.html'&&location.hash===`#${hash}`:target===activeFile&&!location.hash;return `<a href="${href}"${active?' class="active" aria-current="page"':''}>${label}</a>`;}).join('')}</nav><div class="header-actions"><button aria-label="تغيير الوضع" class="theme-toggle" id="themeToggle" type="button"></button></div></div>`;
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
  const root=document.documentElement;
  let saved='light';
  try{saved=localStorage.getItem('theme')==='dark'?'dark':'light';}catch(_){}
  root.dataset.theme=saved;
  document.querySelectorAll('#themeToggle,#themeToggleAdmin').forEach(btn=>{
    btn.innerHTML=icons[saved==='dark'?'sun':'moon'];
    btn.onclick=()=>{
      const next=root.dataset.theme==='dark'?'light':'dark';
      root.classList.add('theme-switching');
      root.dataset.theme=next;
      try{localStorage.setItem('theme',next);}catch(_){}
      document.querySelectorAll('#themeToggle,#themeToggleAdmin').forEach(toggle=>{toggle.innerHTML=icons[next==='dark'?'sun':'moon'];});
      requestAnimationFrame(()=>requestAnimationFrame(()=>root.classList.remove('theme-switching')));
    };
  });
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
  return (appData.groups||[]).filter(item=>item&&item.active!==false&&sameAcademicValueClient(item.grade,grade));
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
  const monthly=st.monthlyReport||null;
  if(st.monthlyReportError)return {attendancePct:null,avg:null,gradeCount:0,gradeState:'error',hwPct:null,homeworkPct:null,homeworkGradeAvg:null,homeworkCount:0,homeworkRequired:0,recitationPct:null,homeworkLastGrade:null,recitationCount:0,sessions:0,final:null,level:'تعذر تحميل بيانات الشهر',totalAttendance:0,present:0,absent:0,lastGrade:null};
  const attendance = getAttendanceRows(st);
  const total = attendance.length;
  const present = attendance.filter(a=>(a.status==='present'||a.status==='حاضر'||a.status==='متأخر')).length;
  const attendancePct = monthly?.attendance?.percentage??null;
  const unified=window.TMResults.normalizeUnifiedResults({grades:[...(st.results||[]),...(st.grades||[])],examAttempts:st.examAttempts||[],homeworks:st.homeworks||[]});
  const graded=window.TMResults.latestResults(unified).filter(g=>g.type!=='practical'&&g.status==='graded'&&g.score!==null&&g.maxScore>0);
  const gradePercent=g=>Number(g.maxScore)>0?Number(g.score)/Number(g.maxScore)*100:Number(g.score);
  const avg=graded.length?Math.round(graded.reduce((s,g)=>s+gradePercent(g),0)/graded.length):0;
  const recitations=(st.recitations||[]).filter(classRecordComplete),homeworks=(st.homeworks||[]).filter(classRecordComplete);
  const classDates=new Set(attendance.map(classRecordDate).filter(Boolean));
  recitations.forEach(row=>{const date=classRecordDate(row);if(date)classDates.add(date);});
  homeworks.forEach(row=>{const date=classRecordDate(row);if(date)classDates.add(date);});
  const sessions=classDates.size;
  const completedDates=rows=>new Set(rows.map(classRecordDate).filter(Boolean)).size;
  const homeworkSummary=st.homeworkMetrics||window.TMResults.homeworkMetrics(st.assignments||[],st.homeworks||[]);
  const recitationCount=completedDates(recitations),homeworkCount=homeworkSummary.submittedCount;
  const recitationPct=sessions?Math.min(100,Math.round(recitationCount/sessions*100)):0;
  const homeworkPct=homeworkSummary.submissionPercentage;
  const homeworkGradeAvg=homeworkSummary.averageGrade;
  const monthlyOverall=monthly?.overallScore;
  const final=monthlyOverall===null||monthlyOverall===undefined||monthlyOverall===''?null:Number.isFinite(Number(monthlyOverall))?Number(monthlyOverall):null;
  const level=monthly?.level||'بيانات الشهر غير متاحة';
  const ordered=graded.slice().sort((a,b)=>String(b.date||b.submittedAt||'').localeCompare(String(a.date||a.submittedAt||'')));
  return {attendancePct,avg:monthly?monthly.results?.average??null:graded.length?avg:null,gradeCount:monthly?.results?.gradedCount??graded.length,gradeState:st.monthlyReportError?'error':st.gradeRecordsLoaded===false?'loading':st.gradeRecordsError?'error':graded.length?'graded':'empty',hwPct:monthly?.homework?monthly.homework.completionPercentage:homeworkPct,homeworkPct:monthly?.homework?monthly.homework.completionPercentage:homeworkPct,homeworkGradeAvg:monthly?.homework?monthly.homework.averageGrade:homeworkGradeAvg,homeworkCount:monthly?.homework?monthly.homework.submitted:homeworkCount,homeworkRequired:monthly?.homework?monthly.homework.required:homeworkSummary.requiredCount,recitationPct,homeworkLastGrade:homeworkSummary.lastGrade||null,recitationCount,sessions,final,level,totalAttendance:monthly?.attendance?.total??total,present:monthly?.attendance?.present??present,absent:monthly?.attendance?.absent??attendance.filter(a=>(a.status==='absent'||a.status==='غائب')).length,lastGrade:ordered[0]||null};
}
function normalizedStudent(st){const code=toEnglishDigits(st?.studentCode||st?.code||st?.id||'').trim().toUpperCase(); return {...(st||{}),id:code,code,studentCode:code,parentCode:code,name:st?.studentName||st?.name||'',studentName:st?.studentName||st?.name||'',grade:canonicalAcademicLabel(st?.grade)};}
function findStudentByCode(code){const q=normalizeText(code); return (appData.students||[]).map(normalizedStudent).find(s=>normalizeText(s.code)===q || normalizeText(s.studentCode)===q) || null;}
function attendanceDocId(st,date){return `${st.studentCode||st.code}_${date}`.replace(/[\\/#?\[\]]/g,'-');}
function getAttendanceRows(st){
  const legacy=(st.attendance||[]).map(a=>({...a,status:a.status==='حاضر'?'present':a.status==='غائب'?'absent':a.status,date:String(a.date||'').replaceAll('/','-'),time:a.time||'',group:a.group||st.group}));
  return legacy.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
function attendanceSummaryHTML(st){
  const summary=st.monthlyReport?.attendance,rows=summary?.rows||getAttendanceRows(st); const total=summary?.required??null,present=summary?.present??null,absent=summary?.absent??null,pct=summary?.percentage??null;
  return `<div class="attendance-public-card"><div class="section-head mini"><div><span class="kicker"><span data-icon="calendar"></span> الحضور والغياب</span><h3>ملخص حضور الطالب</h3></div></div><div class="metric-grid parent-metrics-v29"><div class="metric"><b>${total??'—'}</b><small>إجمالي الحصص</small></div><div class="metric"><b>${present??'—'}</b><small>أيام الحضور</small></div><div class="metric"><b>${absent??'—'}</b><small>أيام الغياب</small></div><div class="metric"><b>${pct==null?'—':`${pct}%`}</b><small>نسبة الحضور</small></div></div><div class="mobile-card-table">${rows.slice(0,12).map(r=>`<div class="mobile-row"><b>${esc(r.date||'-')}</b><span class="badge ${statusClass(r.status)}">${arStatus(r.status)}</span><small>${esc(formatTime12(r.time)||'-')} · ${esc(r.group||st.group||'-')}</small></div>`).join('')||'<p class="section-desc">لا توجد سجلات حضور بعد.</p>'}</div><div class="table-wrap attendance-table"><table><thead><tr><th>التاريخ</th><th>الحالة</th><th>الوقت</th><th>المجموعة</th></tr></thead><tbody>${rows.slice(0,12).map(r=>`<tr><td>${esc(r.date||'-')}</td><td><span class="badge ${statusClass(r.status)}">${arStatus(r.status)}</span></td><td>${esc(formatTime12(r.time)||'-')}</td><td>${esc(r.group||st.group||'-')}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد سجلات حضور بعد</td></tr>'}</tbody></table></div></div>`;
}
function qrValue(st){return st.attendanceCode||st.studentCode||st.code||'';}
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
function homeworkQuestionHtml(question,index){const type=['mcq','truefalse','code','text'].includes(question.type)?question.type:'text';if(type==='mcq'||type==='truefalse')return `<fieldset class="homework-question-card" data-homework-question="${index}"><legend>${index+1}. ${esc(question.question)} <small>(${esc(question.mark||1)} درجة)</small></legend><div class="assignment-choices">${(question.choices||[]).map((choice,choiceIndex)=>`<label><input type="radio" name="q${index}" value="${choiceIndex}" required><span>${esc(choice)}</span></label>`).join('')}</div></fieldset>`;return `<label class="homework-question-card ${type==='code'?'assignment-code-answer':'assignment-text-answer'}" data-homework-question="${index}"><span>${index+1}. ${esc(question.question)} <small>(${esc(question.mark||1)} درجة)</small></span><textarea name="q${index}" rows="${type==='code'?9:5}" maxlength="${type==='code'?20000:5000}" required ${type==='code'?'dir="ltr" spellcheck="false"':''} placeholder="${type==='code'?'اكتب الكود هنا':'اكتب إجابتك هنا'}">${type==='code'?esc(question.starterCode||''):''}</textarea></label>`;}
function homeworkCorrectionHtml(submission){
  if(!submission?.answersRevealed)return '';
  const all=Array.isArray(submission.answers)?submission.answers:[],wrong=Array.isArray(submission.wrongAnswers)?submission.wrongAnswers:all.filter(row=>row.correct===false);
  if(!wrong.length)return '<div class="homework-perfect-result"><span aria-hidden="true">✓</span><div><b>إجاباتك كلها صحيحة</b><small>ممتاز! لا يوجد نموذج إضافي لأنك لم تخطئ في أي سؤال.</small></div></div>';
  return `<details class="homework-wrong-review" open><summary>نموذج حل الأسئلة الخاطئة فقط <span class="badge danger">${wrong.length}</span></summary><div class="homework-wrong-list">${wrong.map((row,index)=>`<article class="homework-wrong-item"><header><span>السؤال الخاطئ ${index+1}</span><small>${esc(row.awardedMark??0)} من ${esc(row.mark||1)}</small></header><h5>${esc(row.question||'السؤال')}</h5><div class="homework-answer-compare"><p><b>إجابتك</b><span>${esc(row.answer||'لم تُسجل إجابة')}</span></p><p class="correct"><b>الإجابة الصحيحة</b><span>${esc(row.correctAnswer||'لم يُضف المدرس نموذج إجابة لهذا السؤال')}</span></p></div></article>`).join('')}</div></details>`;
}
function studentAssignmentCard(assignment,studentCode,isParent=false,submission=null){
  const type=['mcq','truefalse','code','text','file','multi'].includes(assignment.type)?assignment.type:'text';
  const extra=assignment.extraAttemptAvailable===true;
  const closed=assignment.submissionClosed===true&&!extra;
  const typeName={mcq:'واجب اختياري',truefalse:'واجب صح وغلط',code:'واجب كود',text:'واجب كتابي',file:'ملف واجب',multi:'واجب الحصة'}[type];
  const due=assignment.dueDate?`آخر موعد: ${esc(assignment.dueDate)}`:'بدون موعد نهائي';
  const choices=Array.isArray(assignment.choices)?assignment.choices:[];
  let answer='';
  if(!isParent&&(type==='mcq'||type==='truefalse'))answer=`<div class="assignment-choices">${choices.map((choice,index)=>`<label><input type="radio" name="selectedOption" value="${index}" required><span>${esc(choice)}</span></label>`).join('')}</div>`;
  if(!isParent&&type==='code')answer=`<label class="assignment-code-answer"><span>كودك — ${esc(assignment.language||'code')}</span><textarea name="answer" dir="ltr" rows="9" maxlength="20000" required spellcheck="false">${esc(assignment.starterCode||'')}</textarea></label>`;
  if(!isParent&&type==='text')answer='<label class="assignment-text-answer"><span>إجابتك</span><textarea name="answer" rows="5" maxlength="5000" required placeholder="اكتب إجابة الواجب هنا"></textarea></label>';
  if(!isParent&&type==='multi')answer=`<div class="homework-question-list">${(assignment.questions||[]).map(homeworkQuestionHtml).join('')}</div>`;
  const download=assignment.fileUrl?`<a class="btn ghost assignment-download" href="${esc(assignment.fileUrl)}" target="_blank" rel="noopener noreferrer"><span data-icon="book-open"></span> فتح ${esc(assignment.fileName||'ملف الواجب')}</a>`:'';
  const form=!isParent&&type!=='file'&&!closed&&(!submission||extra)?`<form class="assignment-answer-form" data-student-code="${esc(studentCode)}" data-assignment-id="${esc(assignment.id)}" data-assignment-type="${esc(type)}" ${type==='multi'?'novalidate':''}>${answer}<div class="assignment-submit-row"><span class="assignment-form-state" aria-live="polite">${extra?`المحاولة الإضافية رقم ${esc(assignment.extraAttemptNumber||2)} متاحة الآن.`:''}</span><button class="btn primary" type="submit"><span data-icon="upload"></span> ${extra?'تسليم المحاولة الإضافية':'تسليم الواجب'}</button></div></form>`:'';
  const max=Number(submission?.maxScore||assignment.totalScore||1),percentage=submission?.score===null||submission?.score===undefined?null:Math.round(Number(submission.score||0)/Math.max(1,max)*100);
  const result=submission?`<div class="homework-submission-result" role="status"><b>${submission.needsManualReview?'تم التسليم وقيد التصحيح':`تم التصحيح: ${esc(submission.score??0)} من ${esc(max)} — ${esc(percentage)}%`}</b><small>المحاولة ${esc(submission.attemptNumber||1)} · ${esc(formatPortalDate(submission.submittedAt)||'')}</small>${submission.needsManualReview?'<p class="homework-review-wait">سيظهر نموذج الحل للأسئلة الخاطئة فور انتهاء المدرس من التصحيح.</p>':homeworkCorrectionHtml(submission)}</div>`:'';
  const status=extra?'محاولة إضافية متاحة':submission?(submission.needsManualReview?'قيد التصحيح':'تم التصحيح'):closed?'انتهى بدون تسليم':'مطلوب الآن';
  const badge=extra?'warn':submission?(submission.needsManualReview?'warn':'good'):closed?'danger':'warn';
  return `<details class="student-assignment-card"><summary class="student-assignment-head"><div><span class="record-eyebrow">${typeName}${assignment.lessonNumber?` · الحصة ${esc(assignment.lessonNumber)}`:''}</span><h4>${esc(assignment.title||'واجب جديد')}</h4><small>${esc(assignment.lessonTitle||'')} · ${due}</small></div><span class="badge ${badge}">${status}</span></summary><div class="student-assignment-body"><p>${esc(assignment.description||'')}</p><small>${esc(assignment.questionCount||1)} سؤال · من ${esc(assignment.totalScore||1)} درجة</small>${download}${result}${form}${isParent&&!submission?'<p class="assignment-parent-note">يستطيع الطالب تسليم الواجب من بوابة الطالب.</p>':''}</div></details>`;
}
const MONTHLY_REPORT_POLICY='monthly-v11-student-level';
function compatibleMonthlyReport(report,code){return report?.schemaVersion===11&&report.policyVersion===MONTHLY_REPORT_POLICY&&report.student?.studentCode===code&&/^\d{4}-\d{2}$/.test(report.monthKey)&&typeof report.monthlyTitle==='string'&&!!report.attendance&&!!report.homework&&!!report.results&&typeof report.level==='string'&&Object.prototype.hasOwnProperty.call(report,'overallScore');}
function monthlyReportTitle(report,failed=false){return report?report.monthlyTitle:failed?'تعذر تحميل بيانات الشهر':'جاري تحميل بيانات الشهر';}
function studentProfileHTML(raw, isParent=false){
  const st=normalizedStudent(raw),monthlyReport=compatibleMonthlyReport(st.monthlyReport,st.studentCode)?st.monthlyReport:null;
  st.monthlyReport=monthlyReport;
  st.monthlyReportError=!monthlyReport&&st.accessStatus!=='pending';
  const c=calcStudent(st),metric=value=>value===null||value===undefined?'غير متاح':`${esc(value)}%`;
  const monthlyTrend=monthlyReport?parentReportTrend(monthlyReport):null,monthlyTitle=monthlyReportTitle(monthlyReport,st.monthlyReportError);
  const pending=st.accessStatus==='pending'||st.active===false||/لم يتم قبول|انتظار|قيد التسجيل/.test(String(st.approvalStatus||''));
  const attempts=[...(st.examAttempts||[]),...(appData.examAttempts||[]).filter(a=>normalizeText(a.studentCode)===normalizeText(st.studentCode))];
  const unifiedProfileResults=window.TMResults?.normalizeUnifiedResults?window.TMResults.normalizeUnifiedResults({grades:[...(st.results||[]),...(st.grades||[])],examAttempts:attempts,homeworks:st.homeworks||[]}):[...(st.results||[]),...(st.grades||[]),...attempts,...(st.homeworks||[])];
  const grades=(window.TMResults?.latestResults?window.TMResults.latestResults(unifiedProfileResults):unifiedProfileResults).slice().sort((a,b)=>String(b.date||b.submittedAt||b.reviewedAt||'').localeCompare(String(a.date||a.submittedAt||a.reviewedAt||'')));
  const attendance=[...(monthlyReport?.attendance?.rows||[]),...getAttendanceRows(st).filter(row=>!monthlyReport?.monthKey||!String(row.date||'').startsWith(monthlyReport.monthKey))];
  const homeworks=(st.homeworks||[]).slice().reverse();
  const latestExam=grades.find(row=>row.type==='exam'||row.examId||row.examTitle||row.exam),latestHomework=grades.find(row=>row.type==='homework'||row.assignmentId||row.homeworkTitle);
  const assignments=(st.assignments||[]).slice().sort((a,b)=>String(b.createdAt||b.dueDate||'').localeCompare(String(a.createdAt||a.dueDate||'')));
  const materials=(st.materials||[]).slice().reverse();
  const theoryMaterials=sortStudentResources(materials.filter(item=>item.lectureCategory==='theory'||item.resourceType==='class-link'));
  const completedLectures=theoryMaterials.filter(item=>Number(item.progress||0)>=100).length;
  const continueLecture=theoryMaterials.filter(item=>Number(item.progress||0)>0&&Number(item.progress||0)<100).sort((a,b)=>Date.parse(b.lastOpenedAt||0)-Date.parse(a.lastOpenedAt||0))[0]||theoryMaterials.find(item=>Number(item.progress||0)<100)||null;
  const recitations=(st.recitations||[]).slice().reverse();
  const monthlyPayments=(st.monthlyPayments||[]).slice().reverse();
  const paymentCairoParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).formatToParts(new Date());
  const cairoPart=type=>Number(paymentCairoParts.find(part=>part.type===type)?.value||0);
  const paymentYear=cairoPart('month')>=7?cairoPart('year'):cairoPart('year')-1;
  const paymentPeriod=st.paymentPeriod||{month:MONTHS[cairoPart('month')-1],academicYear:`${paymentYear}/${paymentYear+1}`};
  const periodPayments=monthlyPayments.filter(row=>row.month===paymentPeriod.month&&row.academicYear===paymentPeriod.academicYear);
  const periodDue=periodPayments.reduce((sum,row)=>sum+Number(row.expectedAmount||0),0);
  const periodPaid=periodPayments.reduce((sum,row)=>sum+Number(row.paidAmount||0),0);
  const paymentLabel=st.paymentHistoryUnavailable?'الحالة غير متاحة':periodPaid<=0?'لم يتم الدفع':periodDue>periodPaid?'دفع جزئي':'تم الدفع';
  const transferOptions=Array.isArray(st.transferOptions)?st.transferOptions:[];
  const transferRequest=st.transferRequest||null;
  const transferPending=transferRequest?.status==='pending';
  const initials=String(st.name||'ط').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('');
  const gradeCards=grades.length?grades.slice(0,12).map(g=>{
    const hasScore=g.score!==null&&g.score!==undefined&&g.score!=='';
    const max=Number(g.maxScore||100),percent=hasScore&&max>0?Math.round(Number(g.score)/max*100):Number(g.score||0);return `<article class="student-record-card grade-record-card"><div><span class="record-eyebrow">${esc(g.typeLabel||({exam:'امتحان',homework:'واجب',practical:'عملي',manual:'درجة يدوية'}[g.type])||'نتيجة')} · ${esc(formatPortalDate(g.date||g.submittedAt))}</span><h4>${esc(g.activityName||g.exam||g.examTitle||g.homeworkTitle||g.title||'نشاط')}</h4><small>${hasScore?`${esc(g.score)} من ${esc(max)} — ${esc(percent)}%`:'سيظهر التقييم بعد تصحيح المدرس'}</small></div><strong class="score-pill ${hasScore?scoreClass(percent):'warn'}">${hasScore?`${esc(percent)}%`:'قيد التصحيح'}</strong></article>`;
  }).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="bar-chart"></span><h3>لا توجد درجات بعد</h3><p>ستظهر نتائج الامتحانات والواجبات والعملي هنا بعد تسجيلها.</p></div>';
  const attendanceCards=attendance.length?attendance.slice(0,14).map(r=>`<article class="student-record-card"><div><span class="record-eyebrow">${esc(formatTime12(r.time)||'موعد الحصة')}</span><h4>${esc(r.date||'-')}</h4><small>${esc(r.group||st.group||'-')}</small></div><span class="badge ${statusClass(r.status)}">${arStatus(r.status)}</span></article>`).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="calendar"></span><h3>لا توجد سجلات حضور</h3><p>يضيف المدرس سجل الحضور، وسيظهر هنا تلقائيًا.</p></div>';
  const cairoParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).formatToParts(new Date()),currentAttendanceMonth=`${cairoParts.find(x=>x.type==='year')?.value}-${cairoParts.find(x=>x.type==='month')?.value}`;
  const attendanceMonthKeys=[...new Set([currentAttendanceMonth,...attendance.map(row=>String(row.date||'').slice(0,7)).filter(key=>/^\d{4}-\d{2}$/.test(key))])].sort().reverse();
  const attendanceMonthLabel=key=>{const [year,month]=key.split('-').map(Number);return new Intl.DateTimeFormat('ar-EG',{timeZone:'Africa/Cairo',year:'numeric',month:'long'}).format(new Date(Date.UTC(year,month-1,2)));};
  const attendanceMonthView=key=>{const rows=attendance.filter(row=>String(row.date||'').startsWith(key)),summary=monthlyReport?.monthKey===key?monthlyReport.attendance:null,present=summary?.present??null,absent=summary?.absent??null,total=summary?.required??null,pct=summary?.percentage??null,cards=rows.length?rows.map(r=>`<article class="student-record-card"><div><span class="record-eyebrow">${esc(formatTime12(r.time)||'موعد الحصة')}</span><h4>${esc(r.date||'-')}</h4><small>${esc(r.group||st.group||'-')}</small></div><span class="badge ${statusClass(r.status)}">${arStatus(r.status)}</span></article>`).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="calendar"></span><h3>لا توجد حصص مسجلة في هذا الشهر</h3><p>يبدأ عداد كل شهر من الصفر وتظل الشهور السابقة محفوظة في الفلتر.</p></div>';return `<div class="attendance-month-view ${key===currentAttendanceMonth?'show':''}" data-attendance-month-view="${esc(key)}"><div class="attendance-mini-kpis"><span><b>${total??'—'}</b> إجمالي الحصص</span><span><b>${present??'—'}</b> حضور</span><span><b>${absent??'—'}</b> غياب</span><span><b>${pct==null?'—':`${pct}%`}</b> النسبة</span></div><div class="student-record-list">${cards}</div></div>`;};
  const homeworkCards=homeworks.length?homeworks.slice(0,12).map(h=>{const graded=h.score!==null&&h.score!==undefined&&Number(h.maxScore||h.totalScore||0)>0,max=Number(h.maxScore||h.totalScore||100),percent=graded?Math.round(Number(h.score)/max*100):null;return `<article class="student-record-card"><div><span class="record-eyebrow">واجب دراسي</span><h4>${esc(h.title||h.homeworkTitle||'واجب')}</h4><small>${graded?`${esc(h.score)} من ${esc(max)} · ${esc(percent)}%`:esc(h.notes||formatPortalDate(h.date||h.submittedAt)||'بانتظار التصحيح')}</small></div><span class="badge ${graded?'good':classRecordComplete(h)?'warn':'warn'}">${graded?`${esc(percent)}%`:esc(h.status||(classRecordComplete(h)?'قيد التصحيح':'قيد المتابعة'))}</span></article>`;}).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="file-text"></span><h3>لا توجد واجبات مسجلة</h3><p>يمكنك رفع ملف الواجب من الزر الموجود بالأسفل.</p></div>';
  const submissionByAssignment=new Map();homeworks.filter(row=>row.assignmentId).forEach(row=>{const key=String(row.assignmentId),current=submissionByAssignment.get(key);if(!current||Number(row.attemptNumber||1)>=Number(current.attemptNumber||1))submissionByAssignment.set(key,row);});
  const assignmentGroups={required:[],pending:[],graded:[],missed:[],extra:[]};
  assignments.forEach(assignment=>{const submission=submissionByAssignment.get(String(assignment.id));if(assignment.extraAttemptAvailable)assignmentGroups.extra.push(assignment);else if(submission?.needsManualReview||submission&&submission.score===null)assignmentGroups.pending.push(assignment);else if(submission)assignmentGroups.graded.push(assignment);else if(assignment.submissionClosed)assignmentGroups.missed.push(assignment);else assignmentGroups.required.push(assignment);});
  const assignmentSection=(key,title,badge)=>assignmentGroups[key].length?`<section class="assignment-status-section" data-assignment-section="${key}"><div class="student-panel-title"><h4>${title}</h4><span class="badge ${badge}">${assignmentGroups[key].length}</span></div>${assignmentGroups[key].map((assignment,index)=>`<div ${index>=6?'hidden data-assignment-lazy':''}>${studentAssignmentCard(assignment,st.studentCode,isParent,submissionByAssignment.get(String(assignment.id)))}</div>`).join('')}${assignmentGroups[key].length>6?'<button class="btn ghost assignment-show-more" type="button">عرض المزيد</button>':''}</section>`:'';
  const assignmentCards=assignments.length?[assignmentSection('required','مطلوب الآن','warn'),assignmentSection('extra','محاولة إضافية متاحة','warn'),assignmentSection('pending','تم التسليم وقيد التصحيح','warn'),assignmentSection('graded','تم التصحيح','good'),assignmentSection('missed','انتهى بدون تسليم','danger')].join(''):st.assignmentLoadError?'<div class="portal-empty portal-assignment-error"><span class="iconbox" data-icon="alert-circle"></span><h3>تعذّر تحميل الواجبات</h3><p>نسخة Firebase Functions الخاصة بالواجبات غير متاحة حاليًا. أبلغ المدرس أو حاول بعد قليل.</p></div>':'<div class="portal-empty"><span class="iconbox" data-icon="file-text"></span><h3>لا يوجد واجب جديد لصفك</h3><p>عندما ينشر المدرس الواجب سيظهر هنا تلقائيًا.</p></div>';
  const materialCards=theoryMaterials.length?theoryMaterials.map(item=>{const progress=Math.max(0,Math.min(100,Number(item.progress||0))),url=item.linkUrl||item.fileUrl||portalUrl('theory-lectures.html',st.studentCode);return `<article class="student-record-card lecture-progress-row"><div><span class="record-eyebrow">${esc(item.unit||item.lecture||'محاضرة نظري')} · رقم ${esc(item.lectureNumber||item.order||'—')}</span><h4>${esc(item.title||'محاضرة')}</h4><small>${esc(item.desc||item.fileName||'ملف المحاضرة')}</small><div class="theory-progress"><span style="width:${progress}%"></span></div></div><span class="badge ${progress>=100?'good':progress>0?'warn':''}">${progress}%</span><a class="small-btn primary" href="${esc(url)}" ${item.linkUrl||item.fileUrl?'target="_blank" rel="noopener noreferrer"':''} data-dashboard-lecture="${esc(item.id)}">${progress>0&&progress<100?'متابعة':'فتح'}</a></article>`;}).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="book-open"></span><h3>لا توجد محاضرات منشورة لصفك ومجموعتك</h3><p>ستظهر المحاضرات هنا فور نشرها من المدرس.</p></div>';
  const recitationCards=recitations.length?recitations.slice(0,12).map(r=>`<article class="student-record-card"><div><span class="record-eyebrow">متابعة التطبيق العملي</span><h4>${esc(r.title||'تطبيق عملي الحصة')}</h4><small>${esc(formatPortalDate(r.date||r.createdAt))}</small></div><span class="badge ${classRecordComplete(r)?'good':'warn'}">${esc(r.status||(classRecordComplete(r)?'تم التطبيق العملي':'قيد المتابعة'))}</span></article>`).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="book-open"></span><h3>لا يوجد تطبيق عملي مسجل</h3><p>عندما يعلّم المدرس على التطبيق العملي سيظهر هنا تلقائيًا.</p></div>';
  const paymentCards=monthlyPayments.length?monthlyPayments.slice(0,24).map(row=>{const status=row.status==='paid'?'مدفوع بالكامل':row.status==='partial'?'دفع جزئي':'لم يدفع',badge=row.status==='paid'?'good':row.status==='partial'?'warn':'danger';return `<article class="student-record-card"><div><span class="record-eyebrow">${esc(row.academicYear||'-')} · ${esc(row.course||st.grade||'-')}</span><h4>${esc(row.month||'-')}</h4><small>المطلوب ${esc(formatPortalMoney(row.expectedAmount))} · المدفوع ${esc(formatPortalMoney(row.paidAmount))} · المتبقي ${esc(formatPortalMoney(row.remainingAmount))}</small></div><span class="badge ${badge}">${status}</span></article>`;}).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="clipboard"></span><h3>لا توجد دفعات شهرية مسجلة</h3><p>ستظهر هنا كل دفعة شهرية فور تسجيلها من الإدارة.</p></div>';
  const motivationTransactions=Array.isArray(st.motivation?.transactions)?st.motivation.transactions:[];
  const motivationCurrent=monthlyReport?.motivation||null;
  const motivationCards=motivationTransactions.length?motivationTransactions.slice(0,20).map(row=>`<article class="student-record-card motivation-record"><div><span class="record-eyebrow">${esc(row.month||'-')} · ${esc(row.academicYear||'-')}</span><h4>${esc(row.reason||'نقاط تحفيز')}</h4><small>${esc(row.notes||formatPortalDate(row.createdAt)||'')}</small></div><strong class="score-pill ${Number(row.points)>=0?'good':'danger'}">${Number(row.points)>=0?'+':''}${esc(row.points)} نقطة</strong></article>`).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="star"></span><h3>لا توجد نقاط تحفيز بعد</h3><p>ستظهر هنا نقاط الحضور والمشاركة والالتزام عند تسجيلها من المدرس.</p></div>';
  const now=Date.now(),soonAssignments=assignmentGroups.required.filter(item=>{const time=Date.parse(item.dueDate||'');return Number.isFinite(time)&&time>=now&&time-now<=3*86400000;}),latestMotivation=motivationTransactions[0],latestMotivationTime=Date.parse(latestMotivation?.createdAt||'');
  const deadlineAlert=soonAssignments.length?`<section class="portal-action-alert deadline"><span data-icon="alert-circle"></span><div><b>${soonAssignments.length===1?'واجب يقترب موعد إغلاقه':`${soonAssignments.length} واجبات تقترب مواعيد إغلاقها`}</b><small>افتح قسم الواجبات وسلّم قبل الموعد المحدد.</small></div></section>`:'';
  const motivationAlert=latestMotivation&&Number.isFinite(latestMotivationTime)&&now-latestMotivationTime<7*86400000?`<section class="portal-action-alert motivation"><span data-icon="star"></span><div><b>لديك ${Number(latestMotivation.points)>=0?'نقاط تحفيز جديدة':'تحديث جديد في نقاط التحفيز'}</b><small>${Number(latestMotivation.points)>=0?'+':''}${esc(latestMotivation.points)} — ${esc(latestMotivation.reason)}</small></div></section>`:'';
  return `<div class="student-app-dashboard">
    ${pending?`<section class="portal-pending-banner" role="status"><span data-icon="alert-circle"></span><div><b>لم يتم قبول الحجز حتى الآن</b><small>تم تسجيل بياناتك ويمكنك فتح بوابة الطالب بنفس الكود. ستتفعّل المحاضرات والواجبات والاختبارات بعد قبول الحجز.</small></div></section>`:''}
    ${pending?'':deadlineAlert}${motivationAlert}
    ${monthlyReport?.concerns?.length?`<section class="portal-action-alert" role="status"><span data-icon="alert-triangle"></span><div><b>نقاط تحتاج متابعة هذا الشهر</b><small>${monthlyReport.concerns.slice(0,2).map(esc).join(' · ')}</small></div></section>`:''}
    <section class="student-app-header">
      <div class="student-identity"><span class="student-avatar">${esc(initials||'ط')}</span><div><span class="kicker"><span data-icon="user-check"></span> ${isParent?'تقرير ولي الأمر':'مرحبًا بك'}</span><h2>${esc(st.name)}</h2><p>${esc(st.grade||'-')} <span>•</span> ${esc(st.group||'-')}${st.scheduleDays?` <span>•</span> ${esc(st.scheduleDays)}`:''}${st.scheduleStartTime?` <span>•</span> ${esc(formatTime12(st.scheduleStartTime))}`:''}</p><code>${esc(st.studentCode)}</code></div></div>
      <details class="student-qr-details"><summary><span data-icon="qr"></span> عرض QR الحضور</summary><div class="real-qr-wrap">${makeQR(qrValue(st))}<small>رمز الحضور منفصل عن كود فتح البوابة</small></div></details>
    </section>
    <section class="student-kpi-grid">
      <article><span data-icon="bar-chart"></span><b>${metric(c.final)}</b><small>المستوى العام</small></article>
      <article><span data-icon="star"></span><b>${metric(c.avg)}</b><small>متوسط الدرجات</small></article>
      <article><span data-icon="calendar"></span><b>${metric(c.attendancePct)}</b><small>نسبة الحضور</small></article>
      <article class="motivation-kpi"><span data-icon="star"></span><b>${esc(motivationCurrent?.totalPoints??'—')}</b><small>نقاط تحفيز الشهر</small></article>
    </section>
    <details class="student-secondary-kpis"><summary>عرض باقي المؤشرات</summary><div><span><b>${metric(c.homeworkPct)}</b> نسبة تسليم الواجبات</span><span><b>${metric(c.homeworkGradeAvg)}</b> متوسط درجات الواجبات</span><span><b>${metric(c.recitationPct)}</b> انتظام العملي</span><span><b>${paymentLabel}</b> حالة دفع ${esc(paymentPeriod.month||'')} ${esc(paymentPeriod.academicYear||'')}</span></div></details>
    <nav class="student-tabbar" aria-label="أقسام ملف الطالب">
      <button class="active" type="button" data-student-tab="overview"><span data-icon="sparkles"></span><span>الملخص</span></button>
      <button type="button" data-student-tab="lectures"><span data-icon="book-open"></span><span>المحاضرات</span></button>
      <button type="button" data-student-tab="homework"><span data-icon="file-text"></span><span>الواجبات</span></button>
      <button type="button" data-student-tab="grades"><span data-icon="bar-chart"></span><span>الدرجات</span></button>
      <button type="button" data-student-tab="attendance"><span data-icon="calendar"></span><span>الحضور</span></button>
      <button type="button" data-student-tab="motivation"><span data-icon="star"></span><span>التحفيز</span></button>
      <button type="button" data-student-tab="recitation"><span data-icon="book-open"></span><span>العملي</span></button>
      <button type="button" data-student-tab="payments"><span data-icon="database"></span><span>المدفوعات</span></button>
      ${isParent||pending?'':'<button type="button" data-student-tab="transfer"><span data-icon="user-check"></span><span>طلب نقل</span></button>'}
    </nav>
    <section class="student-tab-panel show" data-student-panel="overview">
      <div class="student-overview-grid">
        <article class="student-highlight-card monthly-title-card ${esc(monthlyReport?.monthlyTitleTone||'neutral')}"><span class="iconbox" data-icon="star"></span><div><small>لقبك هذا الشهر</small><h3>${monthlyReport?parentReportTitleIcon(monthlyTitle):''} ${esc(monthlyTitle)}</h3><p>${esc(monthlyReport?monthlyTrend?.detail||'سيظهر تقدمك مقارنة بالشهر السابق بعد اكتمال بيانات الشهر.':st.monthlyReportError?'لم يصل التقرير الموحّد. حاول تحميله مجددًا.':'جاري تحميل التقرير الشهري.')}</p>${st.monthlyReportError&&!isParent?'<button class="small-btn" type="button" data-retry-monthly-report>إعادة المحاولة</button>':''}</div></article>
        <article class="student-highlight-card continue-learning-card"><span class="iconbox" data-icon="book-open"></span><div><small>${continueLecture&&Number(continueLecture.progress)>0?'كمّل من حيث توقفت':'المحاضرة التالية'}</small><h3>${esc(continueLecture?.title||'لا توجد محاضرة جديدة')}</h3><p>${theoryMaterials.length?`${completedLectures} من ${theoryMaterials.length} محاضرة مكتملة`:'ستظهر المحاضرات المنشورة هنا.'}</p>${continueLecture?`<a class="small-btn primary" href="${esc(portalUrl('theory-lectures.html',st.studentCode))}" data-continue-lecture="${esc(continueLecture.id)}">${Number(continueLecture.progress)>0?'متابعة المحاضرة':'ابدأ المحاضرة'}</a>`:''}</div></article>
        <article class="student-highlight-card"><span class="iconbox" data-icon="file-text"></span><div><small>المطلوب الآن</small><h3>${assignmentGroups.required.length} واجب</h3><p>${assignmentGroups.extra.length?`ولديك ${assignmentGroups.extra.length} محاولة إضافية متاحة.`:'افتح قسم الواجبات لمتابعة أقرب موعد.'}</p></div></article>
        <article class="student-highlight-card"><span class="iconbox" data-icon="clipboard"></span><div><small>درجة آخر امتحان</small><h3>${latestExam&&latestExam.score!==null&&latestExam.score!==undefined?`${esc(latestExam.score)} من ${esc(latestExam.maxScore||100)}`:'لا توجد بعد'}</h3><p>${latestExam?esc(latestExam.activityName||latestExam.exam||latestExam.examTitle||'آخر امتحان'):'ستظهر آخر نتيجة امتحان هنا.'}</p></div></article>
        <article class="student-highlight-card"><span class="iconbox" data-icon="file-text"></span><div><small>درجة آخر واجب</small><h3>${latestHomework&&latestHomework.score!==null&&latestHomework.score!==undefined?`${esc(latestHomework.score)} من ${esc(latestHomework.maxScore||100)}`:'لا توجد بعد'}</h3><p>${latestHomework?esc(latestHomework.activityName||latestHomework.homeworkTitle||latestHomework.title||'آخر واجب'):'ستظهر آخر نتيجة واجب هنا.'}</p></div></article>
      </div>
      <article class="teacher-note-card"><span data-icon="clipboard"></span><div><small>ملاحظات المدرس</small><p>${esc(st.notes||'لا توجد ملاحظات حالية. استمر في المذاكرة والمتابعة.')}</p></div></article>
      ${pending?'<div class="portal-empty"><span class="iconbox" data-icon="calendar"></span><h3>الخدمات التعليمية في انتظار القبول</h3><p>بعد قبول الحجز ستظهر هنا روابط المحاضرات والأسئلة والاختبارات تلقائيًا.</p></div>':`<div class="student-quick-links"><a href="${esc(portalUrl('materials.html',st.studentCode))}"><span data-icon="book-open"></span><b>محاضرات المسار</b><small>راجع شرح وملفات مسارك</small></a><a href="${esc(portalUrl('theory-lectures.html',st.studentCode))}"><span data-icon="book-open"></span><b>محاضرات النظري</b><small>افتح محاضرات النظري الخاصة بمسارك</small></a><a href="${esc(portalUrl('questions.html',st.studentCode))}"><span data-icon="help-circle"></span><b>أسئلة المسار</b><small>تدرب على أسئلة ومراجعات مسارك</small></a><a href="${esc(portalUrl('exams.html',st.studentCode))}"><span data-icon="clipboard"></span><b>الاختبارات</b><small>ابدأ امتحانك بالكود</small></a><a href="index.html#contact"><span data-icon="phone"></span><b>تواصل مع المدرس</b><small>للاستفسار والمتابعة</small></a></div>`}
    </section>
    <section class="student-tab-panel" data-student-panel="grades"><div class="student-panel-title"><div><span class="kicker"><span data-icon="bar-chart"></span> سجل موحد</span><h3>درجات الامتحانات والواجبات والعملي</h3></div><span class="badge">${grades.length} نتيجة</span></div><div class="homework-metric-pair"><span><b>${metric(c.homeworkPct)}</b> نسبة تسليم الواجبات</span><span><b>${metric(c.homeworkGradeAvg)}</b> متوسط درجات الواجبات</span></div><div class="student-record-list">${gradeCards}</div></section>
    <section class="student-tab-panel" data-student-panel="attendance"><div class="student-panel-title"><div><span class="kicker"><span data-icon="calendar"></span> المتابعة الشهرية</span><h3>سجل الحضور والغياب</h3><p>كل شهر له عداد مستقل، مع الاحتفاظ بسجل الشهور السابقة.</p></div><label class="attendance-month-filter"><span>الشهر</span><select data-attendance-month-select>${attendanceMonthKeys.map(key=>`<option value="${esc(key)}" ${key===currentAttendanceMonth?'selected':''}>${esc(attendanceMonthLabel(key))}</option>`).join('')}</select></label></div>${attendanceMonthKeys.map(attendanceMonthView).join('')}</section>
    <section class="student-tab-panel" data-student-panel="recitation"><div class="student-panel-title"><div><span class="kicker"><span data-icon="book-open"></span> التطبيق العملي</span><h3>سجل تطبيق عملي الطالب</h3></div><span class="badge good">${c.recitationCount} مرة</span></div><div class="student-record-list">${recitationCards}</div></section>
    <section class="student-tab-panel" data-student-panel="motivation"><div class="student-panel-title"><div><span class="kicker"><span data-icon="star"></span> التحفيز الشهري</span><h3>نقاط المشاركة والالتزام</h3><p>نقاط الشهر تشمل الحضور والنقاط اليدوية؛ درجات الامتحانات والواجبات تدخل في تقييم المستوى والترتيب.</p></div><span class="badge good">${esc(motivationCurrent?.totalPoints??'—')} نقطة</span></div><div class="student-ranking-card" data-student-ranking data-student-code="${esc(st.studentCode)}"><span class="portal-loading"><b>جارٍ حساب مركزك في ترتيب الشهر…</b></span></div><div class="student-record-list">${motivationCards}</div></section>
    <section class="student-tab-panel" data-student-panel="homework"><div class="student-panel-title"><div><span class="kicker"><span data-icon="file-text"></span> الواجبات</span><h3>واجباتك حسب الحالة</h3></div><span class="badge warn">${assignments.length} واجب</span></div><div class="homework-metric-pair"><span><b>${c.homeworkCount} من ${c.homeworkRequired}</b> تم تسليمها</span><span><b>${metric(c.homeworkGradeAvg)}</b> متوسط الدرجات المصححة</span></div><div class="student-assignment-list">${assignmentCards}</div><details class="student-homework-history"><summary>سجل المتابعة والدرجات السابق</summary><div class="student-record-list">${homeworkCards}</div></details></section>
    <section class="student-tab-panel" data-student-panel="lectures"><div class="student-panel-title"><div><span class="kicker"><span data-icon="book-open"></span> المحاضرات</span><h3>محاضرات صفك ومجموعتك</h3></div><span class="badge good">${materials.length} محاضرة</span></div><div class="student-record-list">${materialCards}</div></section>
    <section class="student-tab-panel" data-student-panel="payments"><div class="student-panel-title"><div><span class="kicker"><span data-icon="database"></span> السجل المالي</span><h3>تاريخ الدفعات الشهرية</h3></div><span class="badge">${monthlyPayments.length} شهر</span></div><div class="student-record-list">${paymentCards}</div></section>
    ${isParent||pending?'':`<section class="student-tab-panel" data-student-panel="transfer"><div class="student-panel-title"><div><span class="kicker"><span data-icon="user-check"></span> طلب نقل</span><h3>الانتقال إلى مجموعة أخرى</h3><p>تظهر فقط مجموعات Firebase النشطة المطابقة لمسارك والترم الحالي.</p></div>${transferRequest?`<span class="badge ${transferRequest.status==='approved'?'good':transferRequest.status==='rejected'?'danger':'warn'}">${transferRequest.status==='approved'?'تمت الموافقة':transferRequest.status==='rejected'?'تم الرفض':'قيد المراجعة'}</span>`:''}</div>${transferRequest?`<article class="student-transfer-status-card"><small>آخر طلب</small><h4>${esc(transferRequest.currentGroup||st.group||'-')} ← ${esc(transferRequest.targetGroup||'-')}</h4><p>${esc(transferRequest.reason||'')}</p>${transferRequest.teacherNote?`<small>رد المدرس: ${esc(transferRequest.teacherNote)}</small>`:''}</article>`:''}${transferPending?'<div class="portal-empty"><h3>طلبك قيد المراجعة</h3><p>لا يمكن إرسال طلب جديد قبل مراجعة الطلب الحالي.</p></div>':transferOptions.length?`<form class="student-transfer-form" data-student-code="${esc(st.studentCode)}"><label><span>المجموعة الجديدة</span><select name="targetScheduleId" required><option value="">اختر مجموعة متاحة</option>${transferOptions.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} — ${esc(item.days||'')} ${item.startTime?`· ${esc(formatTime12(item.startTime))}`:''}${item.availableSeats!==null&&item.availableSeats!==undefined?` · متبقي ${esc(item.availableSeats)} مكان`:''}</option>`).join('')}</select></label><label><span>سبب طلب النقل</span><textarea name="reason" rows="4" maxlength="800" required placeholder="اكتب سبب طلب النقل"></textarea></label><button class="btn primary" type="submit"><span data-icon="user-check"></span> إرسال الطلب للإدارة</button></form>`:'<div class="portal-empty"><h3>لا توجد مجموعات أخرى متاحة</h3><p>أي مجموعة مكتملة أو غير مطابقة لمسارك لا تظهر هنا.</p></div>'}</section>`}
  </div>`;
}
function bindStudentDashboard(){
  const dashboard=document.querySelector('.student-app-dashboard'); if(!dashboard)return;
  const buttons=[...dashboard.querySelectorAll('[data-student-tab]')];
  const panels=[...dashboard.querySelectorAll('[data-student-panel]')];
  const attendanceMonthSelect=dashboard.querySelector('[data-attendance-month-select]');
  dashboard.querySelector('.student-tabbar')?.setAttribute('role','tablist');
  buttons.forEach(button=>{const key=button.dataset.studentTab,panel=panels.find(item=>item.dataset.studentPanel===key);button.setAttribute('role','tab');button.setAttribute('aria-selected',String(button.classList.contains('active')));if(panel){panel.id=`student-panel-${key}`;panel.setAttribute('role','tabpanel');button.setAttribute('aria-controls',panel.id);}});
  dashboard.querySelectorAll('[data-continue-lecture],[data-dashboard-lecture]').forEach(link=>link.addEventListener('click',()=>{const lectureId=link.dataset.continueLecture||link.dataset.dashboardLecture||'';try{sessionStorage.setItem('tm-theory-focus',lectureId);}catch(_){}if(link.dataset.dashboardLecture&&lastPortalStudent?.studentCode&&window.MFCloud?.recordLectureProgress)window.MFCloud.recordLectureProgress(lastPortalStudent.studentCode,lectureId,25,'materials').catch(()=>{});}));
  attendanceMonthSelect?.addEventListener('change',()=>dashboard.querySelectorAll('[data-attendance-month-view]').forEach(view=>view.classList.toggle('show',view.dataset.attendanceMonthView===attendanceMonthSelect.value)));
  buttons.forEach(btn=>btn.addEventListener('click',async()=>{
    const key=btn.dataset.studentTab;
    buttons.forEach(x=>x.classList.toggle('active',x===btn));
    buttons.forEach(x=>x.setAttribute('aria-selected',String(x===btn)));
    panels.forEach(x=>x.classList.toggle('show',x.dataset.studentPanel===key));
    const target=dashboard.querySelector(`[data-student-panel="${key}"]`);
    if(window.innerWidth<700) target?.scrollIntoView({behavior:'smooth',block:'start'});
    if(key==='motivation'&&target&&!target.dataset.rankingLoaded&&lastPortalStudent&&window.MFCloud?.getStudentLeaderboardPosition){
      target.dataset.rankingLoaded='loading';const ranking=target.querySelector('[data-student-ranking]');
      try{
        const result=await window.MFCloud.getStudentLeaderboardPosition(lastPortalStudent.studentCode);target.dataset.rankingLoaded='true';
        if(ranking){
          const bonus=Number(result.motivationBonus||0),rank=result.rank,delta=Number(result.scoreDelta||0),trend=result.scoreDelta===null||result.scoreDelta===undefined?'أول شهر لك':delta>0?`تحسن +${delta}`:delta<0?`تراجع ${delta}`:'ثابت';
          ranking.innerHTML=`<div><small>مركزك في المسار</small><b>${rank?`رقم ${esc(rank)}`:'لم تدخل الترتيب بعد'}</b><span>${rank?`من ${esc(result.totalStudents)} طالب · المجموعة رقم ${esc(result.groupRank||'-')}`:'ابدأ نشاطك لتحصل على مركز'}</span></div><div><small>${esc(result.level||'المستوى')}</small><b>${esc(result.score||0)}%</b><span>${esc(trend)} · بونص ${bonus>=0?'+':''}${esc(bonus)}</span></div><div class="student-motivation-detail"><div class="motivation-score-breakdown-v683"><span>درجات الامتحانات <b>${result.gradePct==null?'—':`${esc(result.gradePct)}%`}</b></span><span>تسليم الواجبات <b>${result.homeworkPct==null?'—':`${esc(result.homeworkPct)}%`}</b></span><span>درجات الواجبات <b>${result.homeworkGradePct==null?'—':`${esc(result.homeworkGradePct)}%`}</b></span><span>الحضور <b>${esc(result.attendancePct||0)}%</b></span></div><p><b>خطوتك القادمة:</b> ${esc(result.nextAction||'استمر في التقدم')}</p>${result.nextRankGap?`<small>تحتاج ${esc(result.nextRankGap)} نقطة لتتجاوز المركز السابق.</small>`:''}<div class="motivation-achievements">${(result.achievements||[]).map(item=>`<span class="badge good">${esc(item)}</span>`).join('')||'<span class="badge">ابدأ نشاطك لتحصل على إنجاز</span>'}</div>${(result.penaltyReasons||[]).length?`<div class="motivation-penalties">${result.penaltyReasons.map(item=>`<span class="badge danger">${esc(item.label)} (${esc(item.points)})</span>`).join('')}</div>`:''}</div>`;
        }
      }
      catch(error){target.dataset.rankingLoaded='';if(ranking)ranking.innerHTML=dataErrorHTML(firebaseFriendlyError(error,'تعذر حساب المركز الآن. حاول مرة أخرى.'));}
    }
    if(key==='transfer'&&lastPortalStudent&&!lastPortalStudent.transferDataLoaded&&window.MFCloud?.getStudentByCode){
      if(target)target.innerHTML='<div class="portal-loading"><span></span><b>جاري تحميل المجموعات المتاحة…</b></div>';
      try{const refreshed=await window.MFCloud.getStudentByCode(lastPortalStudent.studentCode,{includeTransfers:true});lastPortalStudent={...lastPortalStudent,...refreshed,transferDataLoaded:true};portalStudentCache.set(normalizeText(lastPortalStudent.studentCode),{student:lastPortalStudent,time:Date.now()});const box=document.getElementById('studentResult');if(box)renderStudentPortal(box,lastPortalStudent,{activeTab:'transfer'});}
      catch(error){if(target)target.innerHTML=dataErrorHTML(firebaseFriendlyError(error,'تعذر تحميل المجموعات المتاحة.'));}
    }
  }));
  try{const requested=sessionStorage.getItem('tm-student-target-tab');if(requested){sessionStorage.removeItem('tm-student-target-tab');buttons.find(button=>button.dataset.studentTab===requested)?.click();}}catch(_){ }
  dashboard.querySelectorAll('.assignment-show-more').forEach(button=>button.addEventListener('click',()=>{const section=button.closest('[data-assignment-section]'),rows=[...section.querySelectorAll('[data-assignment-lazy][hidden]')];rows.slice(0,6).forEach(row=>row.hidden=false);if(rows.length<=6)button.remove();}));
}
function renderStudentPortal(box,student,options={}){
  if(!box||!student)return;
  const portalForm=options.portalForm||document.getElementById('studentSearchForm');
  const activeTab=options.activeTab||box.querySelector('[data-student-tab].active')?.dataset.studentTab||'overview';
  box.innerHTML=studentProfileHTML(student,false);
  box.querySelector('[data-retry-monthly-report]')?.addEventListener('click',()=>portalForm?.requestSubmit());
  bindStudentDashboard();
  bindHomeworkForms();
  bindStudentTransferForms(portalForm,student.studentCode);
  hydrateIcons();
  if(activeTab!=='overview')box.querySelector(`[data-student-tab="${activeTab}"]`)?.click();
}
var portalStudentCache=new Map();
var lastPortalStudent=null;
async function loadStudentForPortal(code,options={}){
  const key=normalizeText(code), cached=portalStudentCache.get(key);
  if(options.force!==true&&cached&&Date.now()-cached.time<15000)return cached.student;
  if(window.MFCloud?.ready && window.MFCloud.getStudentByCode){
    const student=await window.MFCloud.getStudentByCode(code);
    if(student&&(!compatibleMonthlyReport(student.monthlyReport,student.studentCode)||student.monthlyReportError))student.monthlyReportError=true;
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
  const rememberedCode=portalSessionGet(LAST_STUDENT_CODE_KEY)||'';
  if(input && (quickCode||rememberedCode))input.value=quickCode||rememberedCode;
  input?.addEventListener('input',()=>{input.value=input.value.toUpperCase().replace(/\s+/g,'');});
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const code=toEnglishDigits(input?.value).trim().toUpperCase(); const box=document.getElementById('studentResult'); const button=form.querySelector('[type="submit"]');
    if(!code) return toast('اكتب كود الطالب أولًا');
    button?.classList.add('is-loading'); if(button)button.disabled=true; form.setAttribute('aria-busy','true');
    box.innerHTML='<div class="portal-loading"><span></span><b>جاري تحميل ملف الطالب...</b><small>لحظات بسيطة</small></div>';
    try{
      const st=await loadStudentForPortal(code,{force:true});
      if(!st){box.innerHTML=`<div class="portal-empty portal-empty-large"><span class="iconbox" data-icon="search"></span><h3>الكود غير صحيح</h3><p>راجع الكود المكتوب وحاول مرة أخرى، مع التأكد من الحروف والأرقام.</p><button class="btn ghost" type="button" onclick="document.getElementById('studentQuery')?.focus()">إعادة المحاولة</button></div>`; hydrateIcons(); return;}
      lastPortalStudent=st;
      portalSessionSet(LAST_STUDENT_CODE_KEY,st.studentCode||code);
      if(quickCode&&history.replaceState)history.replaceState(null,'',location.pathname+location.hash);
      renderStudentPortal(box,st,{portalForm:form});
      document.dispatchEvent(new CustomEvent('technominds:student-loaded',{detail:{student:st,code}}));
      box.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){const raw=String(err?.code||'')+' '+String(err?.message||'');const message=/not-found/i.test(raw)?'الكود غير موجود في بيانات الطلاب. لو سجلت حجزًا جديدًا استخدم نفس الكود، أو راجع الإدارة للتأكد أن الطالب محفوظ ونشط.':/invalid-argument/i.test(raw)?'اكتب كود الطالب كاملًا كما يظهر في لوحة الإدارة.':/internal|unavailable|failed-precondition|function.*unavailable/i.test(raw)?'تعذر الاتصال ببوابة الطالب الآن. حدّث الصفحة وحاول مرة أخرى، وإن استمرت المشكلة تواصل مع الإدارة.':firebaseFriendlyError(err,'تعذر تحميل بيانات الطالب');box.innerHTML=dataErrorHTML(message);hydrateIcons();}
    finally{button?.classList.remove('is-loading'); if(button)button.disabled=false; form.removeAttribute('aria-busy');}
  });
  if(quickCode&&!form.dataset.autoLoaded){form.dataset.autoLoaded='true';setTimeout(()=>form.requestSubmit(),120);}
  if(!window.__studentPortalAutoRefreshBound){let lastRefresh=0;const refresh=async()=>{
    if(document.hidden||!lastPortalStudent||Date.now()-lastRefresh<15000||protectedStudentWorkOpen())return;
    lastRefresh=Date.now();
    const dashboard=document.querySelector('.student-app-dashboard'),active=dashboard?.querySelector('[data-student-tab].active')?.dataset.studentTab||'overview';
    try{const refreshed=await loadStudentForPortal(lastPortalStudent.studentCode,{force:true});if(protectedStudentWorkOpen())return;lastPortalStudent=refreshed;const box=document.getElementById('studentResult');if(box)renderStudentPortal(box,refreshed,{portalForm:form,activeTab:active});}
    catch(error){console.warn('student-portal-background-refresh',error?.code||error?.message||error);}
  };document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('focus',refresh);window.__studentPortalAutoRefreshBound=true;}
}
var parentQrScanner = null;
var lastParentStudent = null;
var lastParentReportMonth = '';
var lastParentMonthlyReport = null;

function cairoMonthKey(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).format(date);}
function previousMonthKey(monthKey){const match=String(monthKey||'').match(/^(\d{4})-(\d{2})$/);if(!match)return '';const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-2,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;}
function reportMonthLabel(key){const [year,month]=String(key||'').split('-').map(Number);if(!year||!month)return String(key||'');return new Intl.DateTimeFormat('ar-EG',{year:'numeric',month:'long',timeZone:'Africa/Cairo'}).format(new Date(Date.UTC(year,month-1,2)));}

function studentReportRows(st){
  const attendance = getAttendanceRows(st);
  const grades = Array.isArray(st.results) ? st.results : [...(st.grades||[]),...(st.examAttempts||[])];
  const homeworks = st.homeworks || [];
  const recitations = st.recitations || [];
  return { attendance, grades, homeworks, recitations };
}

function parentReportText(raw){
  const report=raw?.monthlyReport;
  return report?parentMonthlyReportText({...report,student:report.student||normalizedStudent(raw)}):'التقرير الشهري الموحّد غير متاح بعد. افتح التقرير واختر الشهر ثم أعد المحاولة.';
}

function parentReportHTML(raw){
  const report=raw?.monthlyReport;
  if(compatibleMonthlyReport(report,normalizedStudent(raw).studentCode))return parentMonthlyReportHTML(report);
  return `<div class="parent-report-loading-v70" role="status"><span class="loader" aria-hidden="true"></span><b>جاري تحميل التقرير الشهري الموحّد…</b><small>لن نعرض أرقامًا تقديرية قبل وصول بيانات الشهر من المصدر الموحّد.</small></div>`;
}
function monthlyResultStatus(row){
  return ({absent:'غائب عن الامتحان',available:'متاح للبدء',upcoming:'لم يبدأ موعده',started:'بدأ ولم يسلّم',pending_review:'قيد التصحيح'})[row.status]||(row.score===null||row.score===undefined?'قيد التصحيح':`${row.score} من ${row.maxScore} — ${row.percentage===null||row.percentage===undefined?'-':Math.round(row.percentage*100)/100}%`);
}
function parentReportTitleIcon(title=''){
  return /إنذار|تراجع|متأخر|تدخل/.test(title)?'⚠️':title.includes('مبرمج')?'💻':title.includes('مهندس')?'⚙️':title.includes('حضور')?'⭐':title.includes('واجب')?'🏅':title.includes('تطور')?'📈':title.includes('التزام')?'⭐':title.includes('متفوق')?'📚':'🏆';
}
function parentReportPaymentLabel(pay){
  return pay?(pay.status==='paid'?'مدفوع':pay.status==='partial'?'دفع جزئي':'غير مدفوع'):'غير مسجل';
}
function parentReportRankText(motivation={},scope='path'){
  if(scope==='group')return motivation.groupRank?`${motivation.groupRank} / ${motivation.groupTotalStudents||'-'}`:'غير متاح';
  return motivation.rank?`${motivation.rank} / ${motivation.totalStudents||'-'}`:'غير متاح';
}
function parentReportTrend(report={}){
  const trend=report.trend||{},current=Number(report.overallScore),previous=Number(trend.previousScore),delta=Number(trend.delta);
  if(trend.delta===null||trend.delta===undefined||trend.previousScore===null||trend.previousScore===undefined||!Number.isFinite(current)||!Number.isFinite(previous)||!Number.isFinite(delta))return {available:false,short:'لا توجد مقارنة كافية',detail:'لا توجد بيانات كافية لمقارنة هذا الشهر بالشهر السابق.'};
  const amount=Math.round(Math.abs(delta)*10)/10,direction=delta>0?'تحسن':delta<0?'تراجع':'ثبات',symbol=delta>0?'↑':delta<0?'↓':'•';
  return {available:true,status:delta>0?'improved':delta<0?'declined':'stable',short:delta===0?'ثبات عن الشهر السابق':`${symbol} ${direction} ${amount} نقطة`,detail:delta===0?`المستوى ثابت عند ${current}% مقارنة بالشهر السابق.`:`${direction} ${amount} نقطة مئوية عن الشهر السابق — من ${previous}% إلى ${current}%.`};
}
function parentHomeworkStatus(row){
  return row.status==='missing'?'لم يسلّم':row.status==='available'?'متاح':row.submission?.score===null||row.submission?.score===undefined?'قيد التصحيح':`${row.submission.score} من ${row.submission.maxScore||row.assignment?.totalScore||100}`;
}
function parentAttendanceStatus(row={}){
  return ({present:'حاضر',absent:'غائب',late:'متأخر',excused:'بعذر',unrecorded:'غير مسجل',scheduled:'غير مسجل'})[row.status]||'غير مسجل';
}
function parentReportCount(done,total,label=''){
  return `${Number(done||0)} من ${Number(total||0)}${label?` ${label}`:''}`;
}
function parentMonthlyReportText(report){
  const st=report.student||{},a=report.attendance||{},r=report.results||{},h=report.homework||{},pay=report.payment,motivation=report.motivation||{},lines=[];
  const title=monthlyReportTitle(report,true),score=value=>value===null||value===undefined?'غير محسوب':`${value}%`,trend=parentReportTrend(report);
  lines.push('Techno Minds — تقرير ولي الأمر الشهري',`الطالب: ${st.name||'-'} — ${st.studentCode||'-'}`,`اللقب الشهري: ${parentReportTitleIcon(title)} ${title}`,`الشهر: ${reportMonthLabel(report.monthKey)} — المسار: ${st.grade||'-'} — المجموعة: ${st.group||'-'}`,'',
    `المستوى العام: ${score(report.overallScore)} — متوسط الدرجات: ${score(r.average)}`,`التقدم: ${trend.detail}`,`الحضور: ${score(a.percentage)} — حاضر ${a.present||0} · غائب ${a.absent||0} · متأخر ${a.late||0} · بعذر ${a.excused||0}`,
    `الواجبات: ${h.submitted||0} من ${h.required||0} — متوسط المصحح: ${score(h.averageGrade)}`,
    `ترتيب المسار: ${parentReportRankText(motivation)} — ترتيب المجموعة: ${parentReportRankText(motivation,'group')}`,
    `التحفيز: ${motivation.totalPoints??0} نقطة · ${motivation.transactionCount??0} حركة${motivation.lastReason?` · آخر سبب: ${motivation.lastReason}`:''}`,
    `الدفع: ${parentReportPaymentLabel(pay)}`,'','الأداء الأكاديمي',
    `الامتحانات: سلّم ${r.submittedExams||0} من ${r.requiredExams||0} · قيد التصحيح ${r.pendingReview||0} · غياب ${r.missedExams||0}`,
    ...(r.rows||[]).slice(0,3).map(row=>`• ${row.activityName||row.examTitle||'امتحان'}: ${monthlyResultStatus(row)}`));
  if((r.rows||[]).length>3)lines.push(`+ ${r.rows.length-3} امتحانات أخرى`);
  lines.push('','الواجبات',...(h.rows||[]).slice(0,3).map(row=>`• ${row.assignment?.title||'واجب'}: ${parentHomeworkStatus(row)}`));
  if((h.rows||[]).length>3)lines.push(`+ ${h.rows.length-3} واجبات أخرى`);
  lines.push('','ملخص المتابعة',`✓ نقطة القوة: ${report.strengths?.[0]||report.summaryNote||'الأداء مستقر هذا الشهر.'}`,`△ يحتاج متابعة: ${report.concerns?.[0]||'الأداء مستقر ولا توجد ملاحظات سلبية هذا الشهر.'}`,`ملاحظة المدرس: ${report.teacherNotes||'لا توجد ملاحظة إضافية.'}`,'',`آخر تحديث: ${reportMonthLabel(report.monthKey)} — Techno Minds`);
  return lines.join('\n');
}
window.parentMonthlyReportText=parentMonthlyReportText;

function parentMonthlyReportHTMLLegacy(report){
  const st=report?.student||{},attendance=report?.attendance||{},results=report?.results||{},homework=report?.homework||{},study=report?.study||{},practical=report?.practical||{},pay=report?.payment,motivation=report?.motivation||{};
  const score=value=>value===null||value===undefined?'—':`${esc(value)}%`,monthOptions=(report.availableMonths||[report.monthKey]).map(key=>`<option value="${esc(key)}" ${key===report.monthKey?'selected':''}>${esc(reportMonthLabel(key))}</option>`).join('');
  const title=monthlyReportTitle(report,true),examRows=(results.rows||[]).slice(0,4),homeworkRows=(homework.rows||[]).slice(0,4),moreExams=Math.max(0,(results.rows||[]).length-examRows.length),moreHomework=Math.max(0,(homework.rows||[]).length-homeworkRows.length);
  const stableNote=(report.concerns||[]).length?'':'الأداء مستقر ولا توجد ملاحظات سلبية هذا الشهر.',trend=parentReportTrend(report),recommendation=report.recommendations?.[0]||'الاستمرار على نفس مستوى المتابعة والتواصل مع المدرس عند ظهور أي ملاحظة.';
  return `<div class="parent-monthly-report-v70" id="parentMonthlyReport">
    <div class="parent-report-toolbar-v70 no-print"><label><span>شهر التقرير</span><select onchange="renderParentMonth(this.value)">${monthOptions}</select></label><div><button class="btn primary" type="button" onclick="printParentReport()">طباعة / PDF</button><button class="btn ghost" type="button" onclick="copyParentReport('${esc(st.studentCode||'')}')">نسخ</button>${st.parentPhone?`<button class="btn whatsapp-report-btn" type="button" onclick="openParentWhatsApp('${esc(st.studentCode||'')}',this)">صورة + واتساب</button>`:''}</div></div>
    <article class="parent-report-sheet-v70 parent-report-sheet-v71">
      <header class="parent-report-header-v70"><img src="assets/technominds-logo.png" alt="Techno Minds"><div><span>Techno Minds · تقرير ولي الأمر الشهري</span><h2>${esc(st.name||'-')}</h2><strong class="monthly-title-${esc(report.monthlyTitleTone||'neutral')}">${parentReportTitleIcon(title)} ${esc(title)}</strong><p>${esc(reportMonthLabel(report.monthKey))} · ${esc(st.grade||'-')} · ${esc(st.group||'-')}</p></div></header>
      <section class="parent-report-status-v71" aria-label="حالة الطالب"><div><small>حالة الطالب</small><b>${esc(report.level||'بيانات غير كافية')} · ${score(report.overallScore)}</b></div><div><small>المستوى الأكاديمي</small><b>${esc(report.academicLevel||'بيانات غير كافية')} · ${score(report.academicScore)}</b></div><div><small>الالتزام والمتابعة</small><b>${esc(report.commitmentLevel||'بيانات غير كافية')} · ${score(report.commitmentScore)}</b></div></section>
      <section class="parent-report-progress-v71"><div><small>التقدم عن الشهر السابق</small><b class="${esc(trend.status||'insufficient')}">${esc(trend.detail)}</b></div><span>كود الطالب الموحّد: <strong>${esc(st.studentCode||'-')}</strong></span></section>
      <section class="parent-report-kpis-v70 parent-report-kpis-v71" aria-label="ملخص مؤشرات الشهر">
        <div class="primary"><b>${score(report.overallScore)}</b><small>المستوى العام</small><span class="parent-report-trend-v70 ${esc(trend.status||'insufficient')}">${esc(trend.short)}</span></div><div><b>${score(results.average)}</b><small>متوسط الامتحانات</small></div><div><b>${score(homework.averageGrade)}</b><small>متوسط درجات الواجب</small></div><div><b>${score(attendance.percentage)}</b><small>الحضور المسجل</small></div>
        <div><b>${esc(homework.submitted||0)} / ${esc(homework.required||0)}</b><small>تسليم الواجبات</small></div><div><b>${esc(study.lecturesCompleted||0)} / ${esc(study.lecturesAvailable||0)}</b><small>المحاضرات المكتملة</small></div><div><b dir="ltr">${esc(parentReportRankText(motivation,'group'))}</b><small>ترتيب المجموعة</small></div><div><b>${Number(motivation.totalPoints||0)>0?'+':''}${esc(motivation.totalPoints??0)}</b><small>التحفيز</small></div>
      </section>
      <div class="parent-report-content-grid-v71">
        <section class="parent-report-section-v70 academic"><div class="parent-report-section-head-v70"><h3>الامتحانات والدرجات</h3><p>سلّم ${esc(results.submittedExams||0)} من ${esc(results.requiredExams||0)} · متوسط المصحح ${score(results.average)}</p></div><div class="parent-report-list-v70">${examRows.map(row=>`<div><span><b>${esc(row.activityName||row.examTitle||'امتحان')}</b><small>${esc(formatPortalDate(row.date||row.submittedAt))} · ${esc(row.status==='started'?'بدأ ولم يسلّم':row.status==='absent'?'غائب':row.status==='pending_review'?'قيد التصحيح':'تم التصحيح')}</small></span><strong>${esc(monthlyResultStatus(row))}</strong></div>`).join('')||'<p>لا يوجد نشاط امتحانات مسجل في هذا الشهر.</p>'}${moreExams?`<small class="parent-report-more-v70">+ ${moreExams} امتحانات أخرى</small>`:''}</div></section>
        <section class="parent-report-section-v70 homework"><div class="parent-report-section-head-v70"><h3>الواجبات ودرجاتها</h3><p>${esc(homework.submitted||0)} تسليم · ${esc(homework.graded||0)} مصحح · متوسط ${score(homework.averageGrade)}</p></div><div class="parent-report-list-v70">${homeworkRows.map(row=>`<div><span><b>${esc(row.assignment?.title||row.submission?.homeworkTitle||'واجب')}</b><small>${row.status==='missing'?'لم يسلّم':row.status==='available'?'مطلوب ولم ينته موعده':row.submission?.needsManualReview?'قيد التصحيح':'تم التسليم والتصحيح'}</small></span><strong>${esc(parentHomeworkStatus(row))}</strong></div>`).join('')||'<p>لا توجد واجبات مطلوبة أو مسجلة في هذا الشهر.</p>'}${moreHomework?`<small class="parent-report-more-v70">+ ${moreHomework} واجبات أخرى</small>`:''}</div></section>
      </div>
      <div class="parent-report-duo-v70 parent-report-engagement-v71">
        <section class="parent-report-section-v70"><h3>الحضور والانضباط</h3><b class="parent-report-inline-score-v70">${score(attendance.percentage)}</b><p>${esc(attendance.present||0)} حاضر · ${esc(attendance.absent||0)} غائب · ${esc(attendance.late||0)} متأخر · ${esc(attendance.excused||0)} بعذر</p><small>${esc(attendance.unrecorded||0)} حصة غير مسجلة · لا تُحسب كغياب حتى يسجل المدرس حالتها</small></section>
        <section class="parent-report-section-v70"><h3>التعلّم والتطبيق</h3><b class="parent-report-inline-score-v70">${score(study.lectureCompletionPercentage)}</b><p>${esc(study.lecturesCompleted||0)} مكتملة من ${esc(study.lecturesAvailable||0)} محاضرة · ${esc(practical.completed||0)} تطبيق عملي مكتمل</p><small>فتح المحاضرة وحده لا يعني إكمالها؛ الاعتماد على التقدم المثبت فقط.</small></section>
      </div>
      <section class="parent-report-facts-v70 parent-report-facts-v71"><div><small>ترتيب المسار</small><b dir="ltr">${esc(parentReportRankText(motivation))}</b></div><div><small>ترتيب المجموعة</small><b dir="ltr">${esc(parentReportRankText(motivation,'group'))}</b></div><div><small>الدفع</small><b>${esc(parentReportPaymentLabel(pay))}</b></div><div><small>التحفيز</small><b>${esc(motivation.totalPoints??0)} نقطة · ${esc(motivation.transactionCount??0)} حركة</b><span>${esc(motivation.lastReason||'لا توجد حركة مسجلة')}</span></div><div><small>الحالة الأكاديمية</small><b>${esc(report.academicLevel||'غير محسوبة')}</b><span>${score(report.academicScore)}</span></div></section>
      <section class="parent-report-section-v70 parent-report-followup-v70 parent-report-followup-v71"><h3>خطة متابعة ولي الأمر</h3><div><p class="strength"><b>نقطة قوة:</b> ${esc(report.strengths?.[0]||report.summaryNote||'الأداء مستقر هذا الشهر.')}</p><p class="concern"><b>يحتاج متابعة:</b> ${esc(report.concerns?.[0]||stableNote)}</p><p class="action"><b>الخطوة المقترحة:</b> ${esc(recommendation)}</p><p class="teacher"><b>ملاحظة المدرس:</b> ${esc(report.teacherNotes||'لا توجد ملاحظة إضافية.')}</p></div></section>
      ${(report.warnings||[]).length?`<details class="parent-report-data-note-v71"><summary>ملاحظات اكتمال البيانات (${esc(report.warnings.length)})</summary><ul>${report.warnings.slice(0,4).map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details>`:''}
      <footer>آخر تحديث: ${esc(reportMonthLabel(report.monthKey))}<span>Techno Minds</span></footer>
    </article>
  </div>`;
}

function parentMonthlyReportHTML(report){
  const st=report?.student||{},attendance=report?.attendance||{},results=report?.results||{},homework=report?.homework||{},study=report?.study||{},practical=report?.practical||{},pay=report?.payment,motivation=report?.motivation||{};
  const score=value=>value===null||value===undefined?'—':`${esc(value)}%`,monthOptions=(report.availableMonths||[report.monthKey]).map(key=>`<option value="${esc(key)}" ${key===report.monthKey?'selected':''}>${esc(reportMonthLabel(key))}</option>`).join('');
  const title=monthlyReportTitle(report,true),examRows=results.rows||[],homeworkRows=homework.rows||[],attendanceRows=attendance.rows||[],trend=parentReportTrend(report);
  const stableNote=(report.concerns||[]).length?'':'الأداء مستقر ولا توجد ملاحظات سلبية هذا الشهر.',recommendation=report.recommendations?.[0]||'الاستمرار على نفس مستوى المتابعة والتواصل مع المدرس عند ظهور أي ملاحظة.';
  return `<div class="parent-monthly-report-v70" id="parentMonthlyReport">
    <div class="parent-report-toolbar-v70 no-print"><label><span>شهر التقرير</span><select onchange="renderParentMonth(this.value)">${monthOptions}</select></label><div><button class="btn primary" type="button" onclick="printParentReport()">طباعة / PDF</button><button class="btn ghost" type="button" onclick="copyParentReport('${esc(st.studentCode||'')}')">نسخ</button>${st.parentPhone?`<button class="btn whatsapp-report-btn" type="button" onclick="openParentWhatsApp('${esc(st.studentCode||'')}',this)">إرسال الصورة على واتساب</button>`:''}</div></div>
    <article class="parent-report-sheet-v70 parent-report-sheet-v71 parent-report-sheet-v72">
      <header class="parent-report-header-v70 parent-report-header-v72"><img src="assets/technominds-logo.png" alt="Techno Minds"><div><span>TECHNO MINDS · تقرير ولي الأمر</span><h2>${esc(st.name||'-')}</h2><p>${esc(reportMonthLabel(report.monthKey))} · ${esc(st.grade||'-')} · ${esc(st.group||'-')}</p></div><div class="parent-report-title-v72"><small>اللقب الشهري</small><strong class="monthly-title-${esc(report.monthlyTitleTone||'neutral')}">${parentReportTitleIcon(title)} ${esc(title)}</strong><code>${esc(st.studentCode||'-')}</code></div></header>
      <section class="parent-report-overview-v72" aria-label="حالة الطالب"><div class="parent-report-score-v72"><small>المستوى العام</small><b>${score(report.overallScore)}</b><span>${esc(report.level||'بيانات غير كافية')}</span></div><div class="parent-report-overview-copy-v72"><b class="${esc(trend.status||'insufficient')}">${esc(trend.short)}</b><p>${esc(trend.detail)}</p><div><span>أكاديميًا <strong>${esc(report.academicLevel||'غير محسوب')} · ${score(report.academicScore)}</strong></span><span>الالتزام <strong>${esc(report.commitmentLevel||'غير محسوب')} · ${score(report.commitmentScore)}</strong></span></div></div></section>
      <section class="parent-report-kpis-v70 parent-report-kpis-v71" aria-label="ملخص مؤشرات الشهر">
        <div class="primary"><b>${score(attendance.percentage)}</b><small>الحضور والانضباط</small></div><div><b>${score(results.average)}</b><small>متوسط الامتحانات</small></div><div><b>${score(homework.averageGrade)}</b><small>درجات الواجب</small></div><div><b>${esc(parentReportCount(homework.submitted,homework.required))}</b><small>تسليم الواجبات</small></div>
        <div><b>${esc(parentReportCount(study.lecturesCompleted,study.lecturesAvailable))}</b><small>المحاضرات المكتملة</small></div><div><b>${esc(practical.completed||0)}</b><small>تطبيق عملي مكتمل</small></div><div><b>${motivation.groupRank?`${esc(motivation.groupRank)} من ${esc(motivation.groupTotalStudents||'-')}`:'غير متاح'}</b><small>ترتيب المجموعة</small></div><div><b>${Number(motivation.totalPoints||0)>0?'+':''}${esc(motivation.totalPoints??0)}</b><small>نقاط التحفيز</small></div>
      </section>
      <div class="parent-report-content-grid-v71 parent-report-activity-grid-v72">
        <section class="parent-report-section-v70 academic"><div class="parent-report-section-head-v70"><h3>الامتحانات والدرجات</h3><p>${esc(parentReportCount(results.submittedExams,results.requiredExams,'تم تسليمها'))} · متوسط ${score(results.average)}</p></div><div class="parent-report-list-v70">${examRows.map(row=>`<div><span><b>${esc(row.activityName||row.examTitle||'امتحان')}</b><small>${esc(formatPortalDate(row.date||row.submittedAt))} · ${esc(row.status==='started'?'بدأ ولم يسلّم':row.status==='absent'?'غائب عن الامتحان':row.status==='pending_review'?'قيد التصحيح':'تم التصحيح')}</small></span><strong>${esc(monthlyResultStatus(row))}</strong></div>`).join('')||'<p>لا يوجد نشاط امتحانات مسجل في هذا الشهر.</p>'}</div></section>
        <section class="parent-report-section-v70 homework"><div class="parent-report-section-head-v70"><h3>الواجبات ودرجاتها</h3><p>${esc(parentReportCount(homework.submitted,homework.required,'تم تسليمها'))} · متوسط ${score(homework.averageGrade)}</p></div><div class="parent-report-list-v70">${homeworkRows.map(row=>`<div><span><b>${esc(row.assignment?.title||row.submission?.homeworkTitle||'واجب')}</b><small>${esc(formatPortalDate(row.submission?.submittedAt||row.assignment?.dueDate))} · ${row.status==='missing'?'لم يسلّم':row.status==='available'?'مطلوب ولم ينته موعده':row.submission?.needsManualReview?'قيد التصحيح':'تم التسليم والتصحيح'}</small></span><strong>${esc(parentHomeworkStatus(row))}</strong></div>`).join('')||'<p>لا توجد واجبات مطلوبة أو مسجلة في هذا الشهر.</p>'}</div></section>
      </div>
      <section class="parent-report-section-v70 parent-report-attendance-v72"><div class="parent-report-section-head-v70"><h3>سجل الحضور خلال الشهر</h3><p>${esc(attendance.present||0)} حاضر · ${esc(attendance.absent||0)} غائب · ${esc(attendance.late||0)} متأخر · ${esc(attendance.excused||0)} بعذر</p></div><div class="parent-report-attendance-list-v72">${attendanceRows.map(row=>`<span class="${esc(row.status||'unrecorded')}"><b>${esc(formatPortalDate(row.date))}</b><small>${esc(parentAttendanceStatus(row))}</small></span>`).join('')||'<p>لا توجد حصص مسجلة في هذا الشهر.</p>'}</div>${attendance.unrecorded?`<small>${esc(attendance.unrecorded)} حصة غير مسجلة لا تُحسب غيابًا حتى يسجل المدرس حالتها.</small>`:''}</section>
      <section class="parent-report-facts-v70 parent-report-facts-v71"><div><small>ترتيب المسار</small><b dir="ltr">${esc(parentReportRankText(motivation))}</b></div><div><small>ترتيب المجموعة</small><b dir="ltr">${esc(parentReportRankText(motivation,'group'))}</b></div><div><small>الدفع</small><b>${esc(parentReportPaymentLabel(pay))}</b></div><div><small>التحفيز</small><b>${esc(motivation.totalPoints??0)} نقطة · ${esc(motivation.transactionCount??0)} حركة</b><span>${esc(motivation.lastReason||'لا توجد حركة مسجلة')}</span></div><div><small>التعلّم والتطبيق</small><b>${score(study.lectureCompletionPercentage)}</b><span>${esc(study.lecturesCompleted||0)} محاضرة · ${esc(practical.completed||0)} تطبيق</span></div></section>
      <section class="parent-report-section-v70 parent-report-followup-v70 parent-report-followup-v71"><h3>ملخص المتابعة وخطة ولي الأمر</h3><div><p class="strength"><b>نقطة قوة:</b> ${esc(report.strengths?.[0]||report.summaryNote||'الأداء مستقر هذا الشهر.')}</p><p class="concern"><b>يحتاج متابعة:</b> ${esc(report.concerns?.[0]||stableNote)}</p><p class="action"><b>الخطوة المقترحة:</b> ${esc(recommendation)}</p><p class="teacher"><b>ملاحظة المدرس:</b> ${esc(report.teacherNotes||'لا توجد ملاحظة إضافية.')}</p></div></section>
      ${(report.warnings||[]).length?`<details class="parent-report-data-note-v71"><summary>ملاحظات اكتمال البيانات (${esc(report.warnings.length)})</summary><ul>${report.warnings.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details>`:''}
      <footer><span>Techno Minds · Programming & AI</span><b>آخر تحديث: ${esc(reportMonthLabel(report.monthKey))}</b></footer>
    </article>
  </div>`;
}

let parentReportLoadGeneration=0;
async function loadParentMonthlyReport(monthKey){
  if(!lastParentStudent||!window.MFCloud?.getParentMonthlyReport)return null;
  const generation=++parentReportLoadGeneration;lastParentMonthlyReport=null;
  const report=await window.MFCloud.getParentMonthlyReport(lastParentStudent.studentCode,monthKey);
  if(generation!==parentReportLoadGeneration)return null;
  if(report.monthKey!==monthKey)throw new Error('فترة التقرير غير مطابقة للطلب');
  if(!compatibleMonthlyReport(report,lastParentStudent.studentCode))throw new Error('نسخة التقرير غير متوافقة أو لا تخص الطالب المحدد. يرجى تحديث الخدمة.');
  lastParentMonthlyReport=report;lastParentReportMonth=report.monthKey;
  const box=document.getElementById('parentResult');if(box)box.innerHTML=parentMonthlyReportHTML(report);hydrateIcons();return report;
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
  portalSessionSet(LAST_STUDENT_CODE_KEY,lastParentStudent.studentCode);
  clearLegacyPortalCodeFromUrl();
  const input=document.querySelector('#parentSearchForm [name="parentCode"]'); if(input) input.value=lastParentStudent.studentCode;
  if(box) box.innerHTML=parentReportHTML(lastParentStudent);
  hydrateIcons();
  if(window.MFCloud?.getParentMonthlyReport){
    const cairoDay=Number(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',day:'2-digit'}).format(new Date())),current=cairoMonthKey(),initial=lastParentReportMonth||(cairoDay<=7?previousMonthKey(current):current);
    try{await loadParentMonthlyReport(initial);}catch(error){console.warn('parent-monthly-report-load',error?.code||error?.message||error);}
  }
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
  if(!window.__parentPortalAutoRefreshBound){let lastRefresh=0;const refresh=async()=>{if(document.hidden||!lastParentStudent||Date.now()-lastRefresh<15000)return;lastRefresh=Date.now();try{await showParentReportByCode(lastParentStudent.studentCode);}catch(error){console.warn('parent-portal-background-refresh',error?.code||error?.message||error);}};document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('focus',refresh);window.__parentPortalAutoRefreshBound=true;}
}

window.renderParentMonth=async function(month){lastParentReportMonth=month;const box=document.getElementById('parentResult');if(!box||!lastParentStudent)return;box.innerHTML='<div class="skeleton" style="height:220px"></div>';try{if(await loadParentMonthlyReport(month))return;}catch(error){toast(firebaseFriendlyError(error,'تعذر تحميل تقرير الشهر.'));}lastParentMonthlyReport=null;box.innerHTML='<p role="alert">تعذر تحميل تقرير الشهر. أعد المحاولة؛ لم يتم عرض بيانات شهر آخر.</p>';hydrateIcons();};

window.copyParentReport = async function(code){
  const st = (lastParentStudent && lastParentStudent.studentCode===code) ? lastParentStudent : (window.MF_FIREBASE_CONFIG?.useSecureFunctions===false ? findStudentByCode(code) : null);
  if(!st) return toast('لم يتم العثور على الطالب');
  try{await navigator.clipboard.writeText(lastParentMonthlyReport?.student?.studentCode===code?parentMonthlyReportText(lastParentMonthlyReport):parentReportText(st,lastParentReportMonth)); toast('تم نسخ التقرير');}
  catch(e){toast('تعذر النسخ، جرّب من متصفح أحدث');}
};

function parentReportWhatsAppIntro(report){
  const st=report?.student||{},trend=parentReportTrend(report),portal='https://eng-amr-khaled-academy.vercel.app/parent.html';
  const score=report?.overallScore===null||report?.overallScore===undefined?'غير محسوب':`${report.overallScore}%`;
  const progress=trend.available?trend.detail:'لا توجد بيانات كافية للمقارنة';
  return `السلام عليكم ورحمة الله وبركاته،
مع حضرتك م. عمرو خالد، مدرس البرمجة والذكاء الاصطناعي ومؤسس Techno Minds.

مرفق لحضرتك صورة التقرير الشهري للطالب/ة ${st.name||'-'} عن شهر ${reportMonthLabel(report.monthKey)}، ويوضح التقرير الحضور والواجبات والامتحانات والتقييم العام.

المستوى العام: ${report?.level||'بيانات غير كافية'}
التقييم: ${score}
التقدم: ${progress}

يمكن لحضرتك متابعة التقرير من بوابة ولي الأمر:
${portal}

كود الطالب الموحّد: ${st.studentCode||'-'}
اكتب الكود داخل صفحة ولي الأمر لعرض تفاصيل الشهر.

مع تحياتي
م. عمرو خالد
Techno Minds`;
}
window.parentReportWhatsAppIntro=parentReportWhatsAppIntro;

let parentReportLogoPromise=null;
function loadParentReportLogo(){
  if(parentReportLogoPromise)return parentReportLogoPromise;
  parentReportLogoPromise=new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=new URL('assets/technominds-logo.png',location.href).href;});
  return parentReportLogoPromise;
}

async function parentReportImageBlobLegacy(report){
  const [,logo]=await Promise.all([document.fonts?.ready,loadParentReportLogo()]);
  const canvas=document.createElement('canvas'),width=1080,height=1600,margin=48,ctx=canvas.getContext('2d'),student=report?.student||{},attendance=report?.attendance||{},results=report?.results||{},homework=report?.homework||{},study=report?.study||{},practical=report?.practical||{},motivation=report?.motivation||{};
  if(!ctx)throw new Error('المتصفح لا يدعم إنشاء صورة التقرير');
  canvas.width=width;canvas.height=height;ctx.direction='rtl';ctx.textAlign='right';ctx.textBaseline='middle';
  const font=(size,weight=700)=>`${weight} ${size}px Cairo, Arial, sans-serif`,score=value=>value===null||value===undefined?'—':`${Math.round(Number(value)*10)/10}%`;
  const rounded=(x,y,w,h,r=20)=>{const radius=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+radius,y);ctx.arcTo(x+w,y,x+w,y+h,radius);ctx.arcTo(x+w,y+h,x,y+h,radius);ctx.arcTo(x,y+h,x,y,radius);ctx.arcTo(x,y,x+w,y,radius);ctx.closePath();};
  const card=(x,y,w,h,fill='#fff',stroke='#dce7f2')=>{rounded(x,y,w,h);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();};
  const fit=(value,maxWidth,size=24,weight=700)=>{ctx.font=font(size,weight);let out=String(value||'-');while(out.length>4&&ctx.measureText(out).width>maxWidth)out=out.slice(0,-2);return out===String(value||'-')?out:`${out.trim()}…`;};
  const write=(value,x,y,size=24,color='#18324d',weight=700,maxWidth=Infinity)=>{ctx.font=font(size,weight);ctx.fillStyle=color;ctx.fillText(fit(value,maxWidth,size,weight),x,y);};
  const wrap=(value,x,y,maxWidth,lineHeight=28,maxLines=2,size=20,color='#18324d',weight=700)=>{ctx.font=font(size,weight);ctx.fillStyle=color;const words=String(value||'-').split(/\s+/),lines=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width<=maxWidth)line=next;else{if(line)lines.push(line);line=word;if(lines.length===maxLines-1)break;}}if(line&&lines.length<maxLines)lines.push(line);if(words.length&&lines.join(' ').length<String(value||'').length&&lines.length)lines[lines.length-1]=fit(`${lines.at(-1)}…`,maxWidth,size,weight);lines.forEach((text,index)=>ctx.fillText(text,x,y+index*lineHeight));return lines.length;};
  const title=monthlyReportTitle(report,true),trend=parentReportTrend(report),examRows=(results.rows||[]).slice(0,3),homeworkRows=(homework.rows||[]).slice(0,3);
  ctx.fillStyle='#f2f6fb';ctx.fillRect(0,0,width,height);
  const header=ctx.createLinearGradient(0,0,width,250);header.addColorStop(0,'#0d527f');header.addColorStop(1,'#071827');ctx.fillStyle=header;ctx.fillRect(0,0,width,250);ctx.fillStyle='#3ed3f3';ctx.fillRect(0,242,width,8);
  if(logo){const max=146,ratio=(logo.naturalWidth||logo.width)/(logo.naturalHeight||logo.height),w=ratio>=1?max:max*ratio,h=ratio>=1?max/ratio:max;ctx.drawImage(logo,margin,48+(max-h)/2,w,h);}
  write('TECHNO MINDS · تقرير ولي الأمر الشهري',width-margin,38,24,'#55daf5',900,760);write(student.name||'-',width-margin,84,41,'#fff',900,760);write(`${parentReportTitleIcon(title)} ${title}`,width-margin,132,27,report.monthlyTitleTone==='negative'?'#ffb7ae':'#f4d17c',900,760);write(`${reportMonthLabel(report.monthKey)} · ${student.grade||'-'} · ${student.group||'-'}`,width-margin,177,22,'#d8e6f4',700,760);write(`كود الطالب: ${student.studentCode||'-'}`,width-margin,216,19,'#aeeeff',800,500);

  const gap=12;card(margin,270,width-2*margin,90,'#fff','#dce7f2');write(`حالة الطالب: ${report.level||'بيانات غير كافية'} · ${score(report.overallScore)}`,width-margin-18,296,24,'#12314f',900,460);write(`الأكاديمي: ${report.academicLevel||'غير محسوب'} · ${score(report.academicScore)}`,width-margin-18,333,18,'#5d7288',800,430);ctx.textAlign='left';write(trend.detail,margin+18,314,18,trend.status==='declined'?'#b84336':trend.status==='improved'?'#16845b':'#657a90',800,470);ctx.textAlign='right';

  const metrics=[['المستوى العام',score(report.overallScore)],['متوسط الامتحانات',score(results.average)],['درجات الواجب',score(homework.averageGrade)],['الحضور',score(attendance.percentage)],['تسليم الواجبات',`${homework.submitted||0} / ${homework.required||0}`],['المحاضرات المكتملة',`${study.lecturesCompleted||0} / ${study.lecturesAvailable||0}`],['ترتيب المجموعة',motivation.groupRank?`${motivation.groupRank} من ${motivation.groupTotalStudents||'-'}`:'غير متاح'],['التحفيز',`${Number(motivation.totalPoints||0)>0?'+':''}${motivation.totalPoints??0}`]],tileW=(width-2*margin-gap*3)/4,tileH=94;
  metrics.forEach(([label,value],index)=>{const col=index%4,row=Math.floor(index/4),x=width-margin-tileW-col*(tileW+gap),y=378+row*(tileH+12);card(x,y,tileW,tileH,index===0?'#e8f7fb':'#fff',index===0?'#8cd8e8':'#dce7f2');write(label,x+tileW-14,y+25,16,'#6b7f93',800,tileW-28);write(value,x+tileW-14,y+63,27,index===0?'#08739a':'#12314f',900,tileW-28);});

  const duoW=(width-2*margin-gap)/2;let y=584;card(width-margin-duoW,y,duoW,302);card(margin,y,duoW,302);write('الامتحانات والدرجات',width-margin-18,y+29,24,'#0c3151',900,duoW-36);write(`متوسط المصحح ${score(results.average)} · ${results.submittedExams||0} من ${results.requiredExams||0}`,width-margin-18,y+63,17,'#657a90',700,duoW-36);
  if(examRows.length)examRows.forEach((row,index)=>{const lineY=y+111+index*57;write(row.activityName||row.examTitle||'امتحان',width-margin-18,lineY,18,'#18324d',800,duoW-36);write(monthlyResultStatus(row),width-margin-18,lineY+27,16,row.status==='absent'?'#b84336':row.status==='pending_review'||row.status==='started'?'#a56700':'#16845b',800,duoW-36);});else write('لا توجد امتحانات مسجلة في هذا الشهر.',width-margin-18,y+122,18,'#657a90',700,duoW-36);
  write('الواجبات ودرجاتها',margin+duoW-18,y+29,24,'#0c3151',900,duoW-36);write(`متوسط المصحح ${score(homework.averageGrade)} · ${homework.submitted||0} تسليم`,margin+duoW-18,y+63,17,'#657a90',700,duoW-36);
  if(homeworkRows.length)homeworkRows.forEach((row,index)=>{const lineY=y+111+index*57;write(row.assignment?.title||row.submission?.homeworkTitle||'واجب',margin+duoW-18,lineY,18,'#18324d',800,duoW-36);write(parentHomeworkStatus(row),margin+duoW-18,lineY+27,16,row.status==='missing'?'#b84336':row.submission?.needsManualReview?'#a56700':'#16845b',800,duoW-36);});else write('لا توجد واجبات مسجلة في هذا الشهر.',margin+duoW-18,y+122,18,'#657a90',700,duoW-36);

  y=902;card(width-margin-duoW,y,duoW,176);card(margin,y,duoW,176);write('الحضور والانضباط',width-margin-18,y+29,23,'#0c3151',900);write(score(attendance.percentage),width-margin-18,y+68,29,'#08739a',900);write(`${attendance.present||0} حاضر · ${attendance.absent||0} غائب · ${attendance.late||0} متأخر`,width-margin-18,y+111,18,'#445e77',700,duoW-36);write(`${attendance.unrecorded||0} حصة غير مسجلة لا تُحسب غيابًا`,width-margin-18,y+143,16,'#718399',700,duoW-36);
  write('التعلّم والتطبيق',margin+duoW-18,y+29,23,'#0c3151',900);write(score(study.lectureCompletionPercentage),margin+duoW-18,y+68,29,'#6d4bc1',900);write(`${study.lecturesCompleted||0} من ${study.lecturesAvailable||0} محاضرة مكتملة`,margin+duoW-18,y+111,18,'#445e77',700,duoW-36);write(`${practical.completed||0} تطبيق عملي مكتمل`,margin+duoW-18,y+143,16,'#718399',700,duoW-36);

  y=1094;const facts=[['ترتيب المسار',motivation.rank?`${motivation.rank} من ${motivation.totalStudents||'-'}`:'غير متاح'],['ترتيب المجموعة',motivation.groupRank?`${motivation.groupRank} من ${motivation.groupTotalStudents||'-'}`:'غير متاح'],['التحفيز',`${motivation.totalPoints??0} نقطة · ${motivation.transactionCount??0} حركة`],['الدفع',parentReportPaymentLabel(report.payment)]],factW=(width-2*margin-gap*3)/4;facts.forEach(([label,value],index)=>{const x=width-margin-factW-index*(factW+gap);card(x,y,factW,116,'#f9fbfd');write(label,x+factW-13,y+27,16,'#73869a',800,factW-26);write(value,x+factW-13,y+71,17,'#18324d',900,factW-26);});

  y=1226;card(margin,y,width-2*margin,304,'#fffdf8','#eadfbe');write('خطة متابعة ولي الأمر',width-margin-20,y+31,25,'#473a20',900);wrap(`نقطة القوة: ${report.strengths?.[0]||report.summaryNote||'الأداء مستقر هذا الشهر.'}`,width-margin-20,y+70,width-2*margin-40,26,2,18,'#237351',700);wrap(`يحتاج متابعة: ${report.concerns?.[0]||'لا توجد ملاحظات سلبية مسجلة هذا الشهر.'}`,width-margin-20,y+130,width-2*margin-40,26,2,18,'#9a6020',700);wrap(`الخطوة المقترحة: ${report.recommendations?.[0]||'الاستمرار على نفس مستوى المتابعة والتواصل مع المدرس عند ظهور أي ملاحظة.'}`,width-margin-20,y+190,width-2*margin-40,26,2,18,'#245b86',700);wrap(`ملاحظة المدرس: ${report.teacherNotes||'لا توجد ملاحظة إضافية.'}`,width-margin-20,y+250,width-2*margin-40,26,2,18,'#435b72',700);

  ctx.fillStyle='#071827';ctx.fillRect(0,1550,width,50);write(`آخر تحديث: ${reportMonthLabel(report.monthKey)}`,width-margin,1575,18,'#dce8f4',700,420);ctx.textAlign='left';write('Techno Minds',margin,1575,18,'#f4d17c',900,260);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('تعذر إنشاء صورة التقرير')),'image/png'));
}

async function parentReportImageBlob(report){
  const [,logo]=await Promise.all([document.fonts?.ready,loadParentReportLogo()]);
  const width=1080,margin=48,gap=12,student=report?.student||{},attendance=report?.attendance||{},results=report?.results||{},homework=report?.homework||{},study=report?.study||{},practical=report?.practical||{},motivation=report?.motivation||{};
  const examRows=results.rows||[],homeworkRows=homework.rows||[],attendanceRows=attendance.rows||[],activityRows=Math.max(1,examRows.length,homeworkRows.length),activityHeight=112+activityRows*54,attendanceHeight=attendanceRows.length?100+Math.ceil(attendanceRows.length/4)*66:132;
  const headerHeight=220,overviewHeight=122,metricsHeight=202,factsHeight=122,followupHeight=272,footerHeight=54;
  const height=margin+headerHeight+18+overviewHeight+18+metricsHeight+18+activityHeight+18+attendanceHeight+18+factsHeight+18+followupHeight+footerHeight;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw new Error('المتصفح لا يدعم إنشاء صورة التقرير');canvas.width=width;canvas.height=height;ctx.direction='rtl';ctx.textAlign='right';ctx.textBaseline='middle';
  const font=(size,weight=700)=>`${weight} ${size}px Cairo, Arial, sans-serif`,score=value=>value===null||value===undefined?'—':`${Math.round(Number(value)*10)/10}%`;
  const rounded=(x,y,w,h,r=20)=>{const radius=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+radius,y);ctx.arcTo(x+w,y,x+w,y+h,radius);ctx.arcTo(x+w,y+h,x,y+h,radius);ctx.arcTo(x,y+h,x,y,radius);ctx.arcTo(x,y,x+w,y,radius);ctx.closePath();};
  const card=(x,y,w,h,fill='#fff',stroke='#dce7f2')=>{rounded(x,y,w,h);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();};
  const fit=(value,maxWidth,size=24,weight=700)=>{ctx.font=font(size,weight);let out=String(value??'-');while(out.length>4&&ctx.measureText(out).width>maxWidth)out=out.slice(0,-2);return out===String(value??'-')?out:`${out.trim()}…`;};
  const write=(value,x,y,size=24,color='#18324d',weight=700,maxWidth=Infinity)=>{ctx.font=font(size,weight);ctx.fillStyle=color;ctx.fillText(fit(value,maxWidth,size,weight),x,y);};
  const wrap=(value,x,y,maxWidth,lineHeight=28,maxLines=2,size=19,color='#18324d',weight=700)=>{ctx.font=font(size,weight);ctx.fillStyle=color;const words=String(value||'-').split(/\s+/),lines=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width<=maxWidth)line=next;else{if(line)lines.push(line);line=word;if(lines.length===maxLines-1)break;}}if(line&&lines.length<maxLines)lines.push(line);if(lines.join(' ').length<String(value||'').length&&lines.length)lines[lines.length-1]=fit(`${lines.at(-1)}…`,maxWidth,size,weight);lines.forEach((text,index)=>ctx.fillText(text,x,y+index*lineHeight));};
  const title=monthlyReportTitle(report,true),trend=parentReportTrend(report);
  ctx.fillStyle='#f3f7fb';ctx.fillRect(0,0,width,height);
  const header=ctx.createLinearGradient(0,0,width,headerHeight);header.addColorStop(0,'#0d527f');header.addColorStop(1,'#071827');ctx.fillStyle=header;ctx.fillRect(0,0,width,headerHeight);ctx.fillStyle='#3ed3f3';ctx.fillRect(0,headerHeight-7,width,7);
  if(logo){const max=132,ratio=(logo.naturalWidth||logo.width)/(logo.naturalHeight||logo.height),w=ratio>=1?max:max*ratio,h=ratio>=1?max/ratio:max;ctx.drawImage(logo,margin,42+(max-h)/2,w,h);}
  write('TECHNO MINDS · تقرير ولي الأمر',width-margin,32,23,'#55daf5',900,720);write(student.name||'-',width-margin,76,40,'#fff',900,720);write(`${reportMonthLabel(report.monthKey)} · ${student.grade||'-'} · ${student.group||'-'}`,width-margin,122,20,'#d8e6f4',700,720);write(`${parentReportTitleIcon(title)} ${title}`,width-margin,164,26,report.monthlyTitleTone==='negative'?'#ffb7ae':'#f4d17c',900,650);write(`كود الطالب: ${student.studentCode||'-'}`,width-margin,198,17,'#aeeeff',800,500);
  let y=headerHeight+18;card(margin,y,width-2*margin,overviewHeight,'#fff','#cfe0ed');
  card(width-margin-170,y+14,150,overviewHeight-28,'#e8f7fb','#8cd8e8');write('المستوى العام',width-margin-38,y+35,16,'#61798e',800,116);write(score(report.overallScore),width-margin-38,y+69,34,'#08739a',900,116);write(report.level||'غير محسوب',width-margin-38,y+96,16,'#173750',800,116);
  write(trend.short,width-margin-196,y+30,21,trend.status==='declined'?'#b84336':trend.status==='improved'?'#16845b':'#405d78',900,700);write(trend.detail,width-margin-196,y+62,17,'#61768b',700,700);write(`أكاديميًا: ${report.academicLevel||'غير محسوب'} · ${score(report.academicScore)}     الالتزام: ${report.commitmentLevel||'غير محسوب'} · ${score(report.commitmentScore)}`,width-margin-196,y+94,16,'#294963',800,700);
  y+=overviewHeight+18;const metrics=[['الحضور والانضباط',score(attendance.percentage)],['متوسط الامتحانات',score(results.average)],['درجات الواجب',score(homework.averageGrade)],['تسليم الواجبات',parentReportCount(homework.submitted,homework.required)],['المحاضرات المكتملة',parentReportCount(study.lecturesCompleted,study.lecturesAvailable)],['التطبيق العملي',`${practical.completed||0} مكتمل`],['ترتيب المجموعة',motivation.groupRank?`${motivation.groupRank} من ${motivation.groupTotalStudents||'-'}`:'غير متاح'],['نقاط التحفيز',`${Number(motivation.totalPoints||0)>0?'+':''}${motivation.totalPoints??0}`]],tileW=(width-2*margin-gap*3)/4,tileH=94;
  metrics.forEach(([label,value],index)=>{const col=index%4,row=Math.floor(index/4),x=width-margin-tileW-col*(tileW+gap),tileY=y+row*(tileH+12);card(x,tileY,tileW,tileH,index===0?'#e8f7fb':'#fff',index===0?'#8cd8e8':'#dce7f2');write(label,x+tileW-14,tileY+25,15,'#6b7f93',800,tileW-28);write(value,x+tileW-14,tileY+63,25,index===0?'#08739a':'#12314f',900,tileW-28);});
  y+=metricsHeight+18;const duoW=(width-2*margin-gap)/2;card(width-margin-duoW,y,duoW,activityHeight);card(margin,y,duoW,activityHeight);write('الامتحانات والدرجات',width-margin-18,y+28,23,'#0c3151',900,duoW-36);write(`${parentReportCount(results.submittedExams,results.requiredExams)} · متوسط ${score(results.average)}`,width-margin-18,y+60,16,'#657a90',700,duoW-36);write('الواجبات ودرجاتها',margin+duoW-18,y+28,23,'#0c3151',900,duoW-36);write(`${parentReportCount(homework.submitted,homework.required)} · متوسط ${score(homework.averageGrade)}`,margin+duoW-18,y+60,16,'#657a90',700,duoW-36);
  if(examRows.length)examRows.forEach((row,index)=>{const lineY=y+101+index*54;write(row.activityName||row.examTitle||'امتحان',width-margin-18,lineY,17,'#18324d',800,duoW-150);ctx.textAlign='left';write(monthlyResultStatus(row),width-margin-duoW+18,lineY,15,row.status==='absent'?'#b84336':row.status==='pending_review'||row.status==='started'?'#9a6200':'#16845b',800,125);ctx.textAlign='right';});else write('لا توجد امتحانات مسجلة.',width-margin-18,y+106,18,'#657a90',700,duoW-36);
  if(homeworkRows.length)homeworkRows.forEach((row,index)=>{const lineY=y+101+index*54;write(row.assignment?.title||row.submission?.homeworkTitle||'واجب',margin+duoW-18,lineY,17,'#18324d',800,duoW-150);ctx.textAlign='left';write(parentHomeworkStatus(row),margin+18,lineY,15,row.status==='missing'?'#b84336':row.submission?.needsManualReview?'#9a6200':'#16845b',800,125);ctx.textAlign='right';});else write('لا توجد واجبات مسجلة.',margin+duoW-18,y+106,18,'#657a90',700,duoW-36);
  y+=activityHeight+18;card(margin,y,width-2*margin,attendanceHeight,'#fff','#dce7f2');write('سجل الحضور خلال الشهر',width-margin-18,y+29,23,'#0c3151',900,450);write(`${attendance.present||0} حاضر · ${attendance.absent||0} غائب · ${attendance.late||0} متأخر · ${attendance.excused||0} بعذر`,width-margin-18,y+62,16,'#657a90',700,540);
  if(attendanceRows.length){const chipGap=10,chipW=(width-2*margin-chipGap*3)/4;attendanceRows.forEach((row,index)=>{const col=index%4,line=Math.floor(index/4),x=width-margin-chipW-col*(chipW+chipGap),chipY=y+88+line*66,status=parentAttendanceStatus(row),tone=row.status==='absent'?'#fff0ed':row.status==='late'?'#fff7e8':row.status==='present'?'#edf9f4':'#f5f7fa',stroke=row.status==='absent'?'#efb5ad':row.status==='late'?'#ead09b':row.status==='present'?'#b8e1d0':'#dce3ea';card(x,chipY,chipW,52,tone,stroke);write(formatPortalDate(row.date),x+chipW-12,chipY+18,14,'#536b82',800,chipW-24);write(status,x+chipW-12,chipY+37,15,row.status==='absent'?'#b84336':row.status==='present'?'#16845b':'#8b631d',900,chipW-24);});}else write('لا توجد حصص مسجلة في هذا الشهر.',width-margin-18,y+102,18,'#657a90',700,600);
  y+=attendanceHeight+18;const facts=[['ترتيب المسار',motivation.rank?`${motivation.rank} من ${motivation.totalStudents||'-'}`:'غير متاح'],['ترتيب المجموعة',motivation.groupRank?`${motivation.groupRank} من ${motivation.groupTotalStudents||'-'}`:'غير متاح'],['التحفيز',`${motivation.totalPoints??0} نقطة · ${motivation.transactionCount??0} حركة`],['الدفع',parentReportPaymentLabel(report.payment)]],factW=(width-2*margin-gap*3)/4;facts.forEach(([label,value],index)=>{const x=width-margin-factW-index*(factW+gap);card(x,y,factW,factsHeight,'#fff');write(label,x+factW-13,y+30,15,'#73869a',800,factW-26);write(value,x+factW-13,y+70,18,'#18324d',900,factW-26);if(index===2&&motivation.lastReason)write(motivation.lastReason,x+factW-13,y+99,13,'#718399',700,factW-26);});
  y+=factsHeight+18;card(margin,y,width-2*margin,followupHeight,'#fffdf8','#ead79e');write('ملخص المتابعة وخطة ولي الأمر',width-margin-20,y+31,24,'#473a20',900);wrap(`نقطة القوة: ${report.strengths?.[0]||report.summaryNote||'الأداء مستقر هذا الشهر.'}`,width-margin-20,y+72,width-2*margin-40,27,2,18,'#237351',700);wrap(`يحتاج متابعة: ${report.concerns?.[0]||'لا توجد ملاحظات سلبية مسجلة هذا الشهر.'}`,width-margin-20,y+132,width-2*margin-40,27,2,18,'#9a6020',700);wrap(`الخطوة المقترحة: ${report.recommendations?.[0]||'الاستمرار على نفس مستوى المتابعة والتواصل مع المدرس عند ظهور أي ملاحظة.'}`,width-margin-20,y+192,width-2*margin-40,27,2,18,'#245b86',700);wrap(`ملاحظة المدرس: ${report.teacherNotes||'لا توجد ملاحظة إضافية.'}`,width-margin-20,y+246,width-2*margin-40,27,1,17,'#435b72',700);
  y+=followupHeight;ctx.fillStyle='#071827';ctx.fillRect(0,y,width,footerHeight);write(`آخر تحديث: ${reportMonthLabel(report.monthKey)}`,width-margin,y+footerHeight/2,17,'#dce8f4',700,420);ctx.textAlign='left';write('Techno Minds · Programming & AI',margin,y+footerHeight/2,17,'#f4d17c',900,380);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('تعذر إنشاء صورة التقرير')),'image/png'));
}
window.parentReportImageBlob=parentReportImageBlob;

window.deliverParentMonthlyReport=async function(report,parentPhone,notify=toast){
  const phone=whatsappPhone(parentPhone||report?.student?.parentPhone),code=report?.student?.studentCode||'',name=String(report?.student?.name||'student').replace(/[^\p{L}\p{N}-]+/gu,'-');
  if(!phone)throw new Error('رقم ولي الأمر غير موجود في بيانات الطالب');
  if(!compatibleMonthlyReport(report,code))throw new Error('نسخة التقرير غير متوافقة. حمّل أحدث تقرير أولًا.');
  if(!confirm(`سيتم فتح التقرير على رقم ولي الأمر:\n${phone}\n\nهل تريد المتابعة؟`))return false;
  window.parentReportDeliveryMode='';
  notify('جاري إنشاء صورة التقرير…');const blob=await parentReportImageBlob(report),fileName=`Techno-Minds-${name}-${report.monthKey||'report'}.png`,message=parentReportWhatsAppIntro(report),file=typeof File==='function'?new File([blob],fileName,{type:'image/png'}):null;
  if(file&&navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({title:`تقرير ${report?.student?.name||'الطالب'}`,text:message,files:[file]});window.parentReportDeliveryMode='system-share-opened';notify('تم فتح مشاركة صورة التقرير والنص. تأكد من إرسالهما داخل التطبيق المختار.');return true;}catch(error){if(error?.name==='AbortError')return false;}}
  const url=URL.createObjectURL(blob),download=document.createElement('a');download.href=url;download.download=fileName;document.body.appendChild(download);download.click();download.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);try{await navigator.clipboard.writeText(message);}catch(_){}
  const opened=window.open(whatsappLink(phone,message),'_blank');if(opened)opened.opener=null;
  window.parentReportDeliveryMode=opened?'whatsapp-opened':'image-downloaded';
  notify(opened?'تم فتح رسالة ولي الأمر وتنزيل صورة التقرير. أرفق الصورة التي تم تنزيلها داخل محادثة واتساب.':'تم تنزيل صورة التقرير، لكن المتصفح منع فتح واتساب تلقائيًا. اسمح بالنوافذ المنبثقة ثم أعد المحاولة وأرفق الصورة يدويًا.');return true;
};

let parentReportSharePending=false;
window.openParentWhatsApp = async function(code,button){
  if(parentReportSharePending)return toast('جاري تجهيز الصورة بالفعل');
  const st=(lastParentStudent&&lastParentStudent.studentCode===code)?lastParentStudent:(window.MF_FIREBASE_CONFIG?.useSecureFunctions===false?findStudentByCode(code):null);
  if(!st)return toast('لم يتم العثور على الطالب');
  if(!lastParentMonthlyReport||lastParentMonthlyReport?.student?.studentCode!==code)return toast('انتظر تحميل التقرير الشهري أولًا');
  parentReportSharePending=true;if(button){button.disabled=true;button.classList.add('is-loading');}
  try{await window.deliverParentMonthlyReport(lastParentMonthlyReport,st.parentPhone,toast);}catch(error){toast(error?.message||'تعذر تجهيز صورة التقرير');}finally{parentReportSharePending=false;if(button){button.disabled=false;button.classList.remove('is-loading');}}
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
    await ensureQrScannerLibrary();
    reader.innerHTML='';
    if(typeof window.Html5Qrcode==='function'){
      parentQrScanner = new window.Html5Qrcode('parentQrReader');
      await startCompatibleQrCamera(parentQrScanner,onDecoded,250);
    } else if(navigator.mediaDevices?.getUserMedia && 'BarcodeDetector' in window){
      reader.innerHTML='<video id="parentQrVideo" autoplay playsinline></video>';
      const video=document.getElementById('parentQrVideo');
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      video.srcObject=stream;
      video.muted=true;
      await video.play();
      const detector=new window.BarcodeDetector({formats:['qr_code']});
      const loop=async()=>{ if(modal.hidden) return; const codes=await detector.detect(video).catch(()=>[]); if(codes.length) return onDecoded(codes[0].rawValue); setTimeout(loop,700); };
      loop();
    } else {
      reader.innerHTML='<p class="section-desc">المتصفح لا يدعم ماسح QR. استخدم إدخال الكود اليدوي.</p>';
    }
  }catch(error){
    const video=document.getElementById('parentQrVideo');
    if(video?.srcObject){video.srcObject.getTracks().forEach(track=>track.stop());video.srcObject=null;}
    console.warn('Parent QR scanner failed to start.',error);
    reader.innerHTML=`<p class="section-desc">${esc(cameraStartMessage(error))}</p><button class="btn ghost small" type="button" onclick="openParentQrScanner()">إعادة المحاولة</button>`;
  }
};

window.closeParentQrScanner = async function(){
  try{ if(parentQrScanner){ await parentQrScanner.stop(); parentQrScanner.clear(); parentQrScanner=null; } }catch(e){}
  const v=document.getElementById('parentQrVideo'); if(v?.srcObject) v.srcObject.getTracks().forEach(t=>t.stop());
  const modal=document.getElementById('parentQrModal'); if(modal) modal.hidden=true;
};
function homeworkDraftKey(form){return `${HOMEWORK_DRAFT_PREFIX}${String(form?.dataset?.assignmentId||'').replace(/[^\w-]/g,'_')}_${String(form?.dataset?.studentCode||'').replace(/[^\w-]/g,'_')}`;}
function homeworkDraftValues(form){const values={};form?.querySelectorAll('input[name],textarea[name],select[name]').forEach(control=>{if((control.type==='radio'||control.type==='checkbox')&&!control.checked)return;values[control.name]=String(control.value??'').slice(0,20000);});return values;}
function homeworkQuestionAnswered(card){const controls=[...card.querySelectorAll('input[name],textarea[name],select[name]')];return controls.some(control=>(control.type==='radio'||control.type==='checkbox')?control.checked:String(control.value||'').trim()!=='');}
function firstMissingHomeworkQuestion(form){return [...form.querySelectorAll('[data-homework-question]')].findIndex(card=>!homeworkQuestionAnswered(card));}
function cleanupHomeworkDrafts(){
  try{for(let index=localStorage.length-1;index>=0;index-=1){const key=localStorage.key(index)||'';if(!key.startsWith(HOMEWORK_DRAFT_PREFIX))continue;let draft=null;try{draft=JSON.parse(localStorage.getItem(key)||'null');}catch(_){ }if(!draft?.updatedAt||Date.now()-Number(draft.updatedAt)>HOMEWORK_DRAFT_TTL_MS)localStorage.removeItem(key);}}catch(_){ }
}
function saveHomeworkDraft(form){
  if(!form||form.dataset.submitted==='true')return;
  const values=homeworkDraftValues(form),snapshot=JSON.stringify(values),changed=snapshot!==String(form.dataset.initialSnapshot||'{}');
  form.dataset.draftDirty=changed?'true':'false';
  if(!changed)return;
  try{localStorage.setItem(homeworkDraftKey(form),JSON.stringify({version:2,values,updatedAt:Date.now()}));}catch(_){ }
  const state=form.querySelector('.assignment-form-state');if(state&&!form.dataset.submitting)state.textContent='تم حفظ المسودة لمدة 7 أيام على هذا الجهاز';
}
function restoreHomeworkDraft(form){
  let draft=null;try{draft=JSON.parse(localStorage.getItem(homeworkDraftKey(form))||'null');}catch(_){ }
  form.dataset.initialSnapshot=JSON.stringify(homeworkDraftValues(form));
  if(!draft?.values||Date.now()-Number(draft.updatedAt||0)>HOMEWORK_DRAFT_TTL_MS){try{localStorage.removeItem(homeworkDraftKey(form));}catch(_){ }return false;}
  Object.entries(draft.values).forEach(([name,value])=>{const controls=[...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];controls.forEach(control=>{if(control.type==='radio'||control.type==='checkbox')control.checked=String(control.value)===String(value);else control.value=String(value);});});
  form.dataset.draftDirty='true';const state=form.querySelector('.assignment-form-state');if(state)state.textContent='تم استعادة مسودة محفوظة — راجعها ثم سلّم';return true;
}
function clearHomeworkDraft(form,submitted=false){try{localStorage.removeItem(homeworkDraftKey(form));}catch(_){ }if(form){form.dataset.draftDirty='false';form.dataset.submitted=submitted?'true':'false';}}
function setupHomeworkStepper(form){
  if(!form||form.dataset.assignmentType!=='multi'||form.dataset.stepperBound==='true')return null;
  const list=form.querySelector('.homework-question-list'),cards=[...(list?.querySelectorAll('[data-homework-question]')||[])];
  if(!list||cards.length<2)return null;
  form.dataset.stepperBound='true';form.noValidate=true;
  list.insertAdjacentHTML('beforebegin',`<div class="homework-stepper"><div class="homework-stepper-head"><b data-homework-step-label>السؤال 1 من ${cards.length}</b><small data-homework-answered aria-live="polite">0 مجاب</small></div><div class="progress"><span data-homework-progress style="width:0%"></span></div><div class="homework-stepper-actions"><small class="homework-draft-privacy">المسودة تبقى 7 أيام. امسحها لو الجهاز مشترك.</small><button type="button" data-homework-clear-draft>مسح المسودة</button></div></div>`);
  list.insertAdjacentHTML('afterend','<nav class="homework-step-navigation" aria-label="التنقل بين أسئلة الواجب"><button type="button" data-homework-prev>السابق</button><button type="button" data-homework-next>التالي</button></nav>');
  const label=form.querySelector('[data-homework-step-label]'),answeredLabel=form.querySelector('[data-homework-answered]'),progress=form.querySelector('[data-homework-progress]'),previous=form.querySelector('[data-homework-prev]'),next=form.querySelector('[data-homework-next]'),clear=form.querySelector('[data-homework-clear-draft]');
  let current=Math.max(0,cards.findIndex(card=>!homeworkQuestionAnswered(card)));if(current<0)current=0;
  const update=()=>{const answered=cards.filter(homeworkQuestionAnswered).length;label.textContent=`السؤال ${current+1} من ${cards.length}`;answeredLabel.textContent=`${answered} مجاب من ${cards.length}`;progress.style.width=`${Math.round(answered/cards.length*100)}%`;previous.disabled=current===0;next.disabled=current===cards.length-1;};
  const goTo=(index,focus=true)=>{current=Math.min(Math.max(Number(index)||0,0),cards.length-1);cards.forEach((card,cardIndex)=>card.classList.toggle('homework-step-hidden',cardIndex!==current));update();if(focus)requestAnimationFrame(()=>{const card=cards[current],reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;card.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'center'});card.querySelector('input:not([disabled]),textarea:not([disabled]),select:not([disabled])')?.focus({preventScroll:true});});};
  previous.addEventListener('click',()=>goTo(current-1));next.addEventListener('click',()=>goTo(current+1));
  clear.addEventListener('click',()=>{if(!confirm('مسح كل إجابات المسودة من هذا الجهاز؟'))return;form.reset();clearHomeworkDraft(form);form.dataset.initialSnapshot=JSON.stringify(homeworkDraftValues(form));goTo(0,false);const state=form.querySelector('.assignment-form-state');if(state)state.textContent='تم مسح المسودة من الجهاز';toast('تم مسح مسودة الواجب');});
  form.addEventListener('input',update);form.addEventListener('change',update);goTo(current,false);
  const controller={goTo,firstMissing:()=>firstMissingHomeworkQuestion(form),update};form.__homeworkStepper=controller;return controller;
}
function protectedStudentWorkOpen(){return Boolean(window.__tmExamInProgress||document.body?.classList.contains('exam-open')||document.querySelector('.student-assignment-card[open] .assignment-answer-form,.assignment-answer-form[data-submitting="true"],.assignment-answer-form[data-draft-dirty="true"]'));}
function refreshHomeworkSummary(student){
  student.homeworkMetrics=window.TMResults.homeworkMetrics(student.assignments||[],student.homeworks||[]);
  const nonHomework=(Array.isArray(student.results)?student.results:[]).filter(row=>row.type!=='homework');
  student.results=window.TMResults.normalizeUnifiedResults({homeworks:student.homeworks||[],grades:nonHomework});
  if(student.gradingPolicy)delete student.gradingPolicy.overallPercentage;
}
function bindHomeworkForms(){
  if(!window.__tmHomeworkDraftCleanupDone){cleanupHomeworkDrafts();window.__tmHomeworkDraftCleanupDone=true;}
  document.querySelectorAll('.assignment-answer-form').forEach(form=>{
    if(form.dataset.draftBound!=='true'){
      form.dataset.draftBound='true';restoreHomeworkDraft(form);setupHomeworkStepper(form);
      let draftTimer=null;const scheduleDraft=()=>{clearTimeout(draftTimer);draftTimer=setTimeout(saveHomeworkDraft,250,form);};
      form.addEventListener('input',scheduleDraft);form.addEventListener('change',scheduleDraft);
    }
    form.onsubmit=async event=>{
      event.preventDefault();saveHomeworkDraft(form);
      const button=form.querySelector('button[type=submit]'),state=form.querySelector('.assignment-form-state'),type=form.dataset.assignmentType,payload={studentCode:form.dataset.studentCode,assignmentId:form.dataset.assignmentId,type},data=new FormData(form);
      if(type==='multi'){
        const firstMissing=firstMissingHomeworkQuestion(form);
        if(firstMissing>=0){form.__homeworkStepper?.goTo(firstMissing);return toast(`أجب عن السؤال ${firstMissing+1} قبل تسليم الواجب`);}
        payload.answers={};
        [...form.querySelectorAll('[name^="q"]')].forEach(input=>{const index=input.name.slice(1);if(input.type==='radio'){if(input.checked)payload.answers[index]=input.value;}else payload.answers[index]=input.value.trim();});
      }else if(type==='mcq'||type==='truefalse'){
        const selected=data.get('selectedOption');if(selected===null)return toast('اختر إجابة الواجب أولًا');payload.selectedOption=Number(selected);
      }else{
        payload.answer=String(data.get('answer')||'').trim();if(!payload.answer)return toast('اكتب إجابة الواجب أولًا');
      }
      form.dataset.submitting='true';button?.classList.add('is-loading');if(button)button.disabled=true;if(state)state.textContent='جارٍ التسليم…';
      try{
        if(!window.MFCloud?.submitAssignmentAnswer)throw new Error('Assignment answer service unavailable');
        const result=await window.MFCloud.submitAssignmentAnswer(payload),message='تم تسليم الواجب بنجاح';
        clearHomeworkDraft(form,true);form.querySelectorAll('input,textarea,select,button').forEach(control=>control.disabled=true);form.replaceWith(Object.assign(document.createElement('div'),{className:'assignment-form-state success assignment-locked',textContent:message}));
        if(lastPortalStudent&&String(lastPortalStudent.studentCode)===String(payload.studentCode)){
          const submission={assignmentId:payload.assignmentId,studentCode:payload.studentCode,submittedAt:new Date().toISOString(),status:result.needsManualReview?'قيد التصحيح':'تم التصحيح',score:result.score,maxScore:result.maxScore,attemptNumber:result.attemptNumber||1,...(result.submission||{})};
          lastPortalStudent.homeworks=[...(lastPortalStudent.homeworks||[]),submission];const assignment=(lastPortalStudent.assignments||[]).find(row=>String(row.id)===String(payload.assignmentId));if(assignment)assignment.extraAttemptAvailable=false;
          refreshHomeworkSummary(lastPortalStudent);portalStudentCache.set(normalizeText(payload.studentCode),{student:lastPortalStudent,time:Date.now()});const box=document.getElementById('studentResult');if(box)renderStudentPortal(box,lastPortalStudent,{activeTab:'homework'});
        }
        toast(message);
      }catch(error){
        form.dataset.submitting='false';const message=firebaseFriendlyError(error,'تعذر تسليم الواجب. إجابتك محفوظة ويمكنك المحاولة مرة أخرى.');if(state)state.textContent=message;toast(message);button?.classList.remove('is-loading');if(button)button.disabled=false;
      }
    };
  });
  if(!window.__tmHomeworkPageHideBound){window.addEventListener('pagehide',()=>document.querySelectorAll('.assignment-answer-form[data-draft-dirty="true"]').forEach(saveHomeworkDraft));window.__tmHomeworkPageHideBound=true;}
  document.querySelectorAll('.homework-upload-form').forEach(form=>{form.onsubmit=async event=>{event.preventDefault();const input=form.querySelector('input[type=file]'),button=form.querySelector('button[type=submit]'),file=input?.files?.[0],code=form.dataset.studentCode;if(!file)return toast('اختار ملف الواجب أولًا');if(file.size>10*1024*1024)return toast('حجم الملف أكبر من 10MB');button?.classList.add('is-loading');if(button)button.disabled=true;try{if(!window.MFCloud?.uploadHomework)throw new Error('Homework upload service unavailable');await window.MFCloud.uploadHomework(file,code);if(input)input.value='';toast('تم رفع الواجب بنجاح');}catch(error){toast(firebaseFriendlyError(error,'تعذر رفع الواجب. الملف لم يُسجل ويمكنك المحاولة مرة أخرى.'));}finally{button?.classList.remove('is-loading');if(button)button.disabled=false;}};});
}
function bindStudentTransferForms(portalForm,studentCode){
  document.querySelectorAll('.student-transfer-form').forEach(form=>{form.onsubmit=async event=>{
    event.preventDefault();
    const button=form.querySelector('[type=submit]'),payload=Object.fromEntries(new FormData(form).entries());
    if(!payload.targetScheduleId)return toast('اختر المجموعة الجديدة');
    if(String(payload.reason||'').trim().length<3)return toast('اكتب سبب طلب النقل');
    if(button)button.disabled=true;
    try{
      if(!window.MFCloud?.createStudentTransferRequest)throw new Error('Student transfer service unavailable');
      await window.MFCloud.createStudentTransferRequest({studentCode,targetScheduleId:payload.targetScheduleId,reason:String(payload.reason||'').trim()});
      portalStudentCache.delete(normalizeText(studentCode));
      toast('تم إرسال طلب النقل للإدارة');
      portalForm?.requestSubmit();
    }catch(error){toast(firebaseFriendlyError(error,'تعذر إرسال طلب النقل.'));}
    finally{if(button)button.disabled=false;}
  };});
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
      if(!validBookingPhone(b.studentPhone)){form.elements.studentPhone?.focus();showStatus('اكتب رقم الطالب كاملًا من 10 إلى 15 رقمًا.','error');return toast('راجع رقم الطالب.');}
      if(!validBookingPhone(b.parentPhone)){form.elements.parentPhone?.focus();showStatus('اكتب رقم ولي الأمر كاملًا من 10 إلى 15 رقمًا.','error');return toast('راجع رقم ولي الأمر.');}
      if(!window.MFCloud?.ready || !window.MFCloud?.createBooking){showStatus('الاتصال بالحجز لم يكتمل. تأكد من الإنترنت ثم اضغط تأكيد مرة أخرى.','error');return toast('الاتصال بالحجز لم يكتمل.');}
      showStatus('جاري تسجيل الحجز وتأمين الكود… لا تغلق الصفحة.','loading');
      button?.classList.add('is-loading'); if(button)button.disabled=true;
      try{
        b.requestId=bookingRequestId(b);
        const result=await window.MFCloud.createBooking(b);
        Object.assign(b,result||{}); b.id=b.code; b.date=isoDate(); b.status=b.status||'بانتظار الموافقة';
        if(!b.alreadyExists){appData.bookings=Array.isArray(appData.bookings)?appData.bookings:[];appData.bookings.push(b);saveData(appData);}
        renderBookingSuccess(b);
        form.dispatchEvent(new Event('booking-success'));
        toast(b.alreadyExists?'الطالب موجود بالفعل — تم استرجاع الكود المسجل':'تم تسجيل الحجز بنجاح — الحالة: قيد التسجيل');
        showStatus(b.alreadyExists?'الطالب موجود بالفعل؛ لم يتم إنشاء حجز مكرر، وظهر الكود المسجل.':'تم تسجيل الحجز بنجاح. احتفظ بالكود الظاهر أمامك.','success');
        clearBookingRequest();
        form.reset(); fillSelects();
      }catch(err){
        const message=firebaseFriendlyError(err,'لم يكتمل الحجز. بياناتك ما زالت موجودة؛ اضغط تأكيد مرة أخرى.');
        showStatus(message,'error');
        toast(message);
      }finally{button?.classList.remove('is-loading');if(button)button.disabled=false;}
    });
  }
}
function portalUrl(file,code){if(code)portalSessionSet(LAST_STUDENT_CODE_KEY,String(code));return new URL(file,document.baseURI).href;}
function renderBookingSuccess(b){
  const box=document.getElementById('bookingSuccess');if(!box)return;
  const code=b.studentCode||b.code;
  const existing=b.alreadyExists===true;
  box.hidden=false;
  box.innerHTML=`<div class="booking-success-card booking-student-pass compact-booking-pass ${existing?'existing-student-pass':''}">
    <span class="badge ${existing?'warn':'good'}">${existing?'الطالب موجود بالفعل':'تم التسجيل بنجاح'}</span>
    <h3>${existing?'ده كود الطالب المسجل':'الكود الموحّد جاهز'}</h3>
    ${existing?'<p class="existing-student-message">لم يتم إنشاء حجز أو حساب جديد. استخدم نفس الكود للدخول إلى المنصة.</p>':''}
    <div class="booking-code-spotlight student-code"><small>الكود الموحّد</small><code>${esc(code)}</code><button class="small-btn primary" type="button" onclick="copyBookingCode('${esc(code)}')">نسخ الكود</button></div>
    <div class="booking-result-qr"><div class="real-qr-wrap">${makeQR(code)}<small>باركود الحساب الموحّد</small></div></div>
    <div class="hero-cta compact-portal-links"><a class="btn primary" href="${esc(portalUrl('student.html',code))}"><span data-icon="user-check"></span> بوابة الطالب</a><a class="btn ghost" href="${esc(portalUrl('parent.html',code))}"><span data-icon="users"></span> بوابة ولي الأمر</a></div>
    <p class="section-desc booking-approval-note">${existing?'لو البيانات أو المجموعة محتاجة تعديل، تواصل مع الإدارة بدل تسجيل طالب جديد.':'احتفظ بصورة للكود؛ ويمكن للإدارة نقلك إلى المجموعة المناسبة من لوحة التحكم.'}</p>
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
  let rows=[],loadError=null;
  try{
    if(!force&&publicLeaderboardState.grade===selectedGrade&&publicLeaderboardState.rows&&Date.now()<publicLeaderboardState.expiresAt)rows=publicLeaderboardState.rows;
    else{
      if(!publicLeaderboardState.promise)publicLeaderboardState.promise=Promise.resolve(window.MFCloud?.getPublicLeaderboard?.(selectedGrade)||[]).finally(()=>{publicLeaderboardState.promise=null;});
      rows=await publicLeaderboardState.promise||[];
      publicLeaderboardState.rows=rows;publicLeaderboardState.grade=selectedGrade;publicLeaderboardState.expiresAt=Date.now()+5*60*1000;
    }
  }catch(error){rows=[];loadError=error;}
  if(renderId!==publicLeaderboardRenderId||selectedGrade!==selectedLeaderboardGrade())return;
  rows=Array.isArray(rows)?rows:[];
  box.className='leaderboard-five';
  if(loadError){box.innerHTML=`<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="alert-triangle"></span><h3>تعذر تحميل ترتيب الطلاب الآن</h3><p>تأكد من الاتصال ثم اضغط «تحديث الترتيب» للمحاولة مرة أخرى.</p></div>`;hydrateIcons();return;}
  const periodNote=rows[0]?.isPreviousPeriod?`<div class="leaderboard-period-note"><b>ترتيب شهر ${esc(rows[0].periodMonth||'السابق')}</b><span>يظل ظاهرًا لحين تسجيل أول نشاط في الشهر الحالي.</span></div>`:'';
  box.innerHTML=rows.length?periodNote+rows.map((x,i)=>{
    const name=String(x.name||'طالب متميز').trim();
    const score=Math.max(0,Math.min(100,Number(x.score)||0));
    return `<article class="leaderboard-row rank-${i+1}">
      <span class="leaderboard-rank" aria-label="المركز ${i+1}">${i+1}</span>
      <div class="leaderboard-student-info">
        <div class="leaderboard-name-line"><span class="leaderboard-avatar" aria-hidden="true">${esc(name.charAt(0)||'★')}</span><div><small class="leaderboard-name-label">اسم الطالب</small><h3>${esc(name)}</h3></div></div>
        <span class="leaderboard-grade">${esc(x.grade||'المسار غير محدد')} · ${esc(x.level||'المستوى')}</span>
        <div class="leaderboard-metrics"><span>الحضور <b>${esc(x.attendancePct||0)}%</b></span><span>درجات الامتحانات <b>${x.gradePct==null?'—':`${esc(x.gradePct)}%`}</b></span><span>التطبيق العملي <b>${esc(x.recitationPct||0)}%</b></span><span>تسليم الواجب <b>${x.homeworkPct==null?'—':`${esc(x.homeworkPct)}%`}</b></span><span>درجات الواجب <b>${x.homeworkGradePct==null?'—':`${esc(x.homeworkGradePct)}%`}</b></span><span>بونص التحفيز <b>${Number(x.motivationBonus||0)>=0?'+':''}${esc(x.motivationBonus||0)}</b></span></div>
        <div class="motivation-achievements">${(x.achievements||[]).slice(0,2).map(item=>`<span class="badge good">${esc(item)}</span>`).join('')}${x.scoreDelta!==null&&x.scoreDelta!==undefined?`<span class="badge ${Number(x.scoreDelta)>=0?'good':'danger'}">${Number(x.scoreDelta)>=0?'تحسن +':'تغير '}${esc(x.scoreDelta)}</span>`:''}</div><div class="progress" aria-label="المجموع ${score}%"><span style="width:${score}%"></span></div>
      </div>
      <div class="leaderboard-score"><small>المجموع</small><b>${score}%</b></div>
    </article>`;
  }).join(''):`<div class="empty-state compact-empty-v29"><span class="iconbox" data-icon="star"></span><h3>لا يوجد نشاط مسجل لصف ${esc(selectedGrade)}</h3><p>لم يتم العثور على نشاط في الشهر الحالي أو الشهر السابق. سيظهر الترتيب تلقائيًا بعد تسجيل حضور أو درجة أو واجب أو تطبيق عملي.</p></div>`;
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
function lessonQuestionBanks(lecture){
  const banks=(currentStudentResources?.questions||[]).filter(bank=>bank.sourceCollection==='question_banks'&&bank.lectureSource==='materials'&&String(bank.lectureId)===String(lecture.id));
  if(!banks.length)return '';
  return `<section class="lesson-question-banks" aria-label="بنك أسئلة المحاضرة"><h4>بنك الأسئلة</h4><ul>${banks.map(bank=>`<li><strong>${esc(bank.title)}</strong>${bank.filePath?`<button class="btn ghost" type="button" data-question-bank-file="${esc(bank.id)}" data-question-bank-collection="question_banks">فتح PDF — ${esc(bank.fileName||bank.title)}</button>`:''}${bank.content?`<details><summary>عرض الأسئلة المكتوبة</summary><div class="written-box">${esc(bank.content)}</div></details>`:''}</li>`).join('')}</ul></section>`;
}
function resourceCard(x,kind){
  const meta=[x.unit,x.lecture].filter(Boolean),legacyClassLink=x.resourceType==='class-link'||x.materialType==='class-link',driveUrl=x.linkUrl||(legacyClassLink?x.fileUrl:'')||'',fileUrl=x.fileUrl&&x.fileUrl!==driveUrl?x.fileUrl:'',isImage=Boolean(fileUrl)&&((x.fileType||x.type||'').includes('image')||/\.(png|jpe?g|webp|gif)$/i.test(fileUrl));
  const preview=isImage?`<img class="attach-preview" src="${esc(fileUrl)}" alt="${esc(x.title||'ملف المحاضرة')}">`:'';
  const isQuestionBank=kind==='question'&&(x.questionBank===true||x.sourceCollection==='question_banks'),isTheory=kind==='material'&&(x.lectureCategory==='theory'||legacyClassLink),progress=Math.max(0,Math.min(100,Number(x.progress||0))),assignment=(currentStudentResources?.assignments||[]).find(row=>String(row.id)===String(x.linkedAssignmentId||'')),exam=(currentStudentResources?.exams||[]).find(row=>String(row.id)===String(x.linkedExamId||''));
  const lectureKind=kind==='material'?(isTheory?'نظري':x.lectureCategory==='practical'?'عملي':'محاضرة'):'';
  const actions=[isQuestionBank&&x.filePath?`<button class="btn primary" type="button" data-question-bank-file="${esc(x.id)}" data-question-bank-collection="${esc(x.sourceCollection||'question_banks')}"><span data-icon="external-link"></span> فتح ملف بنك الأسئلة PDF</button>`:fileUrl&&!isImage?`<a class="btn ghost" data-theory-open="${esc(x.id)}" target="_blank" rel="noopener noreferrer" href="${esc(fileUrl)}"><span data-icon="external-link"></span> ${isQuestionBank?'فتح ملف بنك الأسئلة PDF':'فتح ملف الشرح'}</a>`:'',driveUrl?`<a class="btn primary class-link-button" data-theory-open="${esc(x.id)}" target="_blank" rel="noopener noreferrer" href="${esc(driveUrl)}"><span data-icon="external-link"></span> فتح رابط Google Drive</a>`:'',assignment?`<a class="btn ghost" data-student-destination="homework" href="student.html"><span data-icon="file-text"></span> حل ${esc(assignment.title||'الواجب')}</a>`:'',exam?`<a class="btn ghost" data-student-destination="exam" href="exams.html"><span data-icon="clipboard"></span> ${esc(exam.title||'الاختبار')}</a>`:'',isTheory?`<button class="btn ${progress>=100?'ghost':'primary'}" type="button" data-theory-complete="${esc(x.id)}" ${progress>=100?'disabled':''}><span data-icon="user-check"></span> ${progress>=100?'تم إكمال المحاضرة':'تحديد كمكتملة'}</button>`:''].filter(Boolean).join('');
  const bankContent=isQuestionBank&&x.content?`<details class="resource-answer question-bank-written"><summary>عرض الأسئلة المكتوبة</summary><div class="written-box">${esc(x.content)}</div></details>`:'';
  return `<article class="card resource-card student-track-resource ${driveUrl?'class-link-card':''} ${isTheory?'theory-learning-card':''} ${isQuestionBank?'question-bank-card':''}" data-resource-id="${esc(x.id||'')}"><div class="resource-top">${isTheory?`<span class="lecture-order-chip">${Number(x.lectureNumber||x.order||0)||'—'}</span>`:`<span class="iconbox" data-icon="${kind==='question'?'help-circle':'book-open'}"></span>`}<div class="resource-meta-badges">${lectureKind?`<span class="badge lecture-kind-badge">${lectureKind}</span>`:''}${isQuestionBank?'<span class="badge good">بنك أسئلة</span>':''}<span class="badge">${esc(x.grade||'كل المسارات')}</span>${meta.map(value=>`<span class="badge soft">${esc(value)}</span>`).join('')}${driveUrl?'<span class="badge good">رابط Drive</span>':''}${isTheory?`<span class="badge ${progress>=100?'good':progress>0?'warn':''}">${progress>=100?'مكتملة':progress>0?'قيد الدراسة':'جديدة'}</span>`:''}</div></div><h3>${esc(x.title||'بدون عنوان')}</h3><p>${esc(x.desc||(!isQuestionBank?x.content:'')||(driveUrl?'رابط المحاضرة متاح على Google Drive.':' '))}</p>${isTheory?`<div class="theory-progress" aria-label="نسبة إنجاز المحاضرة"><span style="width:${progress}%"></span></div><small class="theory-progress-label">تم إنجاز ${progress}%</small>`:''}${preview}${actions?`<div class="resource-actions">${actions}</div>`:''}${bankContent}${kind==='question'&&!isQuestionBank&&x.answer?`<details class="resource-answer"><summary>عرض الإجابة النموذجية</summary><div class="written-box">${esc(x.answer)}</div></details>`:''}${isTheory?lessonQuestionBanks(x):''}</article>`;
}
function sortStudentResources(rows){return [...(rows||[])].sort((a,b)=>Number(a.order||a.lectureNumber||0)-Number(b.order||b.lectureNumber||0)||[a.unit,a.lecture,a.title].filter(Boolean).join(' ').localeCompare([b.unit,b.lecture,b.title].filter(Boolean).join(' '),'ar',{numeric:true}));}
function theoryStudentList(materials){
  const query=String(document.getElementById('theoryStudentSearch')?.value||'').trim().toLowerCase(),unit=document.getElementById('theoryStudentUnit')?.value||'',state=document.getElementById('theoryStudentState')?.value||'';
  const filtered=materials.filter(item=>(!query||`${item.title||''} ${item.desc||''} ${item.lecture||''}`.toLowerCase().includes(query))&&(!unit||String(item.unit||'')===unit)&&(!state||(state==='completed'?Number(item.progress)>=100:state==='started'?Number(item.progress)>0&&Number(item.progress)<100:Number(item.progress)<=0)));
  const groups=new Map();filtered.forEach(item=>{const key=item.unit||'محاضرات عامة';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
  return groups.size?[...groups].map(([name,rows])=>`<section class="theory-unit-group"><header><div><span class="kicker">وحدة دراسية</span><h2>${esc(name)}</h2></div><span class="badge">${rows.length} محاضرة</span></header><div class="grid grid-3 resources-grid-v31">${rows.map(item=>resourceCard(item,'material')).join('')}</div></section>`).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="book-open"></span><h3>لا توجد محاضرات مطابقة</h3><p>غيّر البحث أو الفلاتر لعرض باقي المحاضرات.</p></div>';
}
function bindTheoryResourceActions(){
  const code=currentStudentResources?.student?.studentCode||'';
  document.querySelectorAll('[data-theory-open]').forEach(link=>link.addEventListener('click',()=>{const id=link.dataset.theoryOpen,item=(currentStudentResources.materials||[]).find(row=>String(row.id)===String(id));if(item)item.progress=Math.max(Number(item.progress||0),25);window.MFCloud?.recordLectureProgress?.(code,id,25,'materials').catch(()=>{});}));
  document.querySelectorAll('[data-theory-complete]').forEach(button=>button.onclick=async()=>{button.disabled=true;button.classList.add('is-loading');try{const result=await window.MFCloud.recordLectureProgress(code,button.dataset.theoryComplete,100,'materials'),item=(currentStudentResources.materials||[]).find(row=>String(row.id)===String(button.dataset.theoryComplete));if(item){item.progress=Number(result.percent||100);item.completed=true;item.viewed=true;}renderUnifiedResourcesPage();toast('تم تسجيل المحاضرة كمكتملة');}catch(error){button.disabled=false;button.classList.remove('is-loading');toast(firebaseFriendlyError(error,'تعذر حفظ تقدم المحاضرة.'));}});
  document.querySelectorAll('[data-student-destination]').forEach(link=>link.addEventListener('click',()=>{try{sessionStorage.setItem('tm-student-target-tab',link.dataset.studentDestination);}catch(_){}}));
  const focusId=sessionStorage.getItem('tm-theory-focus')||'';if(focusId){const card=document.querySelector(`[data-resource-id="${CSS.escape(focusId)}"]`);if(card){sessionStorage.removeItem('tm-theory-focus');card.classList.add('focus-pulse');setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'center'}),80);}}
}
function bindQuestionBankActions(){
  document.querySelectorAll('[data-question-bank-file]').forEach(button=>button.onclick=async()=>{
    const placeholder=window.open('about:blank','_blank');button.disabled=true;button.classList.add('is-loading');
    try{
      if(!window.MFCloud?.getCurriculumFileUrl)throw new Error('question-bank-file-service-unavailable');
      const code=currentStudentResources?.student?.studentCode||'',result=await window.MFCloud.getCurriculumFileUrl(code,button.dataset.questionBankCollection||'question_banks',button.dataset.questionBankFile);
      if(!result?.url)throw new Error('question-bank-file-unavailable');
      if(placeholder)placeholder.location.replace(result.url);else location.assign(result.url);
    }catch(error){if(placeholder)placeholder.close();toast(firebaseFriendlyError(error,'تعذر فتح ملف بنك الأسئلة. حاول مرة أخرى.'));}
    finally{button.disabled=false;button.classList.remove('is-loading');}
  });
}
function renderUnifiedResourcesPage(){
  const content=document.getElementById('studentResourcesContent'),summary=document.getElementById('resourceStudentSummary'),m=document.getElementById('materialsPageGrid'),q=document.getElementById('questionsPageGrid');
  if(!m&&!q)return;
  if(!currentStudentResources){if(content)content.hidden=true;if(summary)summary.hidden=true;return;}
  const student=currentStudentResources.student||{},resourceMode=document.body.dataset.resourceMode||'materials',allMaterials=sortStudentResources(currentStudentResources.materials),isLegacyClassLink=row=>row.resourceType==='class-link'||row.materialType==='class-link',materials=allMaterials.filter(row=>resourceMode==='theory'?(row.lectureCategory==='theory'||isLegacyClassLink(row)):(row.lectureCategory!=='theory'&&!isLegacyClassLink(row))),questions=sortStudentResources(currentStudentResources.questions);
  if(content)content.hidden=false;
  if(summary){summary.hidden=false;summary.innerHTML=`<span class="student-avatar">${esc((student.name||'ط').trim().charAt(0))}</span><div><small>تم فتح محتوى المسار</small><h2>${esc(student.name||'الطالب')}</h2><p>${esc(student.grade||'')} ${student.group?`<span>•</span> ${esc(student.group)}`:''}</p><code>${esc(student.studentCode||'')}</code></div><button class="small-btn" type="button" onclick="changeResourceStudent()">تغيير الطالب</button>`;}
  document.querySelectorAll('[data-resource-cross-link]').forEach(link=>{const url=new URL(link.getAttribute('href'),document.baseURI);url.searchParams.delete('code');link.href=url.href;});
  const theoryTools=document.getElementById('theoryStudentTools');if(theoryTools){theoryTools.hidden=false;const unitSelect=document.getElementById('theoryStudentUnit'),selected=unitSelect?.value||'',units=[...new Set(materials.map(item=>item.unit).filter(Boolean))];if(unitSelect){unitSelect.innerHTML=`<option value="">كل الوحدات</option>${units.map(value=>`<option ${value===selected?'selected':''}>${esc(value)}</option>`).join('')}`;}}
  if(m)m.innerHTML=materials.length?(resourceMode==='theory'?theoryStudentList(materials):materials.map(x=>resourceCard(x,'material')).join('')):'<div class="portal-empty"><span class="iconbox" data-icon="book-open"></span><h3>لا توجد محاضرات منشورة لهذا المسار بعد</h3><p>ستظهر المحاضرات والملفات هنا فور إضافتها من لوحة الإدارة.</p></div>';
  if(q)q.innerHTML=questions.length?questions.map(x=>resourceCard(x,'question')).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="help-circle"></span><h3>لا توجد بنوك أسئلة منشورة لهذا المسار بعد</h3><p>ستظهر الأسئلة وملفات PDF هنا فور نشرها من لوحة الإدارة.</p></div>';
  if(q||resourceMode==='theory')bindQuestionBankActions();
  if(resourceMode==='theory')bindTheoryResourceActions();hydrateIcons();
}
window.changeResourceStudent=function(){currentStudentResources=null;const form=document.getElementById('studentResourceCodeForm'),content=document.getElementById('studentResourcesContent'),summary=document.getElementById('resourceStudentSummary'),message=document.getElementById('resourceAccessMessage');if(content)content.hidden=true;if(summary)summary.hidden=true;if(message){message.hidden=false;message.textContent='اكتب كود الطالب لفتح محتوى مساره.';message.className='resource-access-message';}form?.querySelector('[name="query"]')?.focus();};
function setupStudentResourcesPage(){
  const form=document.getElementById('studentResourceCodeForm');if(!form)return;
  const input=form.querySelector('[name="query"]'),remember=form.querySelector('[name="rememberCode"]'),button=form.querySelector('button[type="submit"]'),message=document.getElementById('resourceAccessMessage');
  const saved=portalSessionGet(LAST_STUDENT_CODE_KEY);if(saved&&input)input.value=saved;
  form.addEventListener('submit',async event=>{
    event.preventDefault();const code=toEnglishDigits(input?.value||'').trim().toUpperCase();if(!code)return toast('اكتب كود الطالب أولًا');
    portalSessionSet(LAST_STUDENT_CODE_KEY,code);
    if(message){message.hidden=false;message.textContent='جاري التحقق من الكود وتحميل محتوى المسار…';message.className='resource-access-message loading';}
    button?.classList.add('is-loading');if(button)button.disabled=true;
    try{
      if(!window.MFCloud?.getStudentResources)throw new Error('resource-service-unavailable');
      const result=await window.MFCloud.getStudentResources(code);if(!result?.student)throw new Error('not-found');
      currentStudentResources=result;portalSessionSet(LAST_STUDENT_CODE_KEY,result.student.studentCode||code);clearLegacyPortalCodeFromUrl();if(message)message.hidden=true;renderUnifiedResourcesPage();
    }catch(error){currentStudentResources=null;renderUnifiedResourcesPage();if(message){message.hidden=false;message.textContent=studentCodeFriendlyError(error,'تعذر فتح المحتوى. تأكد من كود الطالب وحاول مرة أخرى.');message.className='resource-access-message error';}}
    finally{button?.classList.remove('is-loading');if(button)button.disabled=false;}
  });
  const quickCode=toEnglishDigits(new URLSearchParams(location.search).get('code')||saved).trim().toUpperCase();if(quickCode&&!form.dataset.autoLoaded){form.dataset.autoLoaded='true';input.value=quickCode;setTimeout(()=>form.requestSubmit(),140);}
  ['theoryStudentSearch','theoryStudentUnit','theoryStudentState'].forEach(id=>document.getElementById(id)?.addEventListener(id==='theoryStudentSearch'?'input':'change',renderUnifiedResourcesPage));
}
function renderExamQuestionHtml(q,i){
  const written=q.type==='essay'||q.type==='code',options=Array.isArray(q.options)?q.options:[];return `<article class="exam-question-card" data-question-index="${i}"><div class="exam-question-number">السؤال ${i+1} · ${esc(q.mark||1)} درجة</div><h3 class="exam-question-prompt" dir="auto" style="white-space:pre-wrap;unicode-bidi:plaintext;tab-size:4">${esc(q.question)}</h3>${written?`<label class="exam-essay-field"><span>${q.type==='code'?'اكتب الكود':'اكتب إجابتك بوضوح'}</span><textarea name="q${i}" rows="${q.type==='code'?10:6}" ${q.type==='code'?'dir="ltr" spellcheck="false"':''} placeholder="${q.type==='code'?'اكتب الكود هنا...':'اكتب إجابتك هنا...'}"></textarea></label>`:`<div class="exam-options">${options.map((o,oi)=>`<label class="exam-option"><input type="radio" name="q${i}" value="${oi}"><span class="exam-option-marker">${esc(q.optionLabels?.[oi]||String(oi+1))}</span><span>${esc(o)}</span></label>`).join('')}</div>`}</article>`;
}
function examCairoDateTime(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('ar-EG',{timeZone:'Africa/Cairo',dateStyle:'medium',timeStyle:'short'}):'';}
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
  const lines=toEnglishDigits(text).replace(/\r\n?/g,'\n').split('\n'),questions=[];
  let cursor=0;
  const typePattern=/^(type|النوع)\s*[:=：-]?/i,markPattern=/^(mark|points|الدرجة)\s*[:=：-]?/i,answerPattern=/^(answer|correct|الإجابة|الاجابة|الإجابة الصحيحة|الاجابة الصحيحة)\s*[:=：-]?/i,modelPattern=/^(model|النموذج|الإجابة النموذجية)\s*[:=：-]?/i;
  const findMetadata=start=>{for(let index=start;index<lines.length;index+=1){const current=lines[index].trim();if(!typePattern.test(current))continue;let markIndex=index+1;while(markIndex<lines.length&&!lines[markIndex].trim())markIndex+=1;if(markIndex<lines.length&&markPattern.test(lines[markIndex].trim()))return {typeIndex:index,markIndex};}return null;};
  while(cursor<lines.length&&questions.length<200){
    while(cursor<lines.length&&!lines[cursor].trim())cursor+=1;
    if(cursor>=lines.length)break;
    const metadata=findMetadata(cursor);if(!metadata)break;
    const {typeIndex,markIndex}=metadata;
    const rawQuestionLines=lines.slice(cursor,typeIndex);
    while(rawQuestionLines.length&&!rawQuestionLines[0].trim())rawQuestionLines.shift();
    while(rawQuestionLines.length&&!rawQuestionLines[rawQuestionLines.length-1].trim())rawQuestionLines.pop();
    if(rawQuestionLines.length)rawQuestionLines[0]=rawQuestionLines[0].replace(/^(\s*)س\d*\s*[:\-]?\s*/,'$1');
    const question=rawQuestionLines.join('\n').trim().slice(0,1500);
    const declaredType=lines[typeIndex].trim().replace(typePattern,'').trim().toLowerCase();
    const mark=Math.max(.25,Math.min(1000,Number(lines[markIndex].trim().replace(markPattern,'').trim())||1));
    const choiceType=['mcq','truefalse','اختياري','صح وخطأ','صح أو غلط'].includes(declaredType),optionObjs=[];
    let answer='',modelAnswer='',blockEnd=markIndex+1;
    if(choiceType){
      for(let index=markIndex+1;index<lines.length;index+=1){const trimmed=lines[index].trim();if(!trimmed){blockEnd=index;break;}if(answerPattern.test(trimmed)){answer=cleanAnswerLine(trimmed);blockEnd=index+1;break;}const option=parseOptionLine(lines[index]);if(option)optionObjs.push(option);blockEnd=index+1;}
    }else{
      const candidate=markIndex+1;
      if(candidate<lines.length&&modelPattern.test(lines[candidate].trim())){const firstModelLine=lines[candidate].trim().replace(modelPattern,'').trim();let end=candidate+1;while(end<lines.length&&lines[end].trim())end+=1;modelAnswer=[firstModelLine,...lines.slice(candidate+1,end)].join('\n').trim().slice(0,2000);blockEnd=end;}
    }
    if(choiceType&&optionObjs.length)questions.push({type:declaredType==='truefalse'||declaredType==='صح وخطأ'||declaredType==='صح أو غلط'?'truefalse':'mcq',question,options:optionObjs.slice(0,8).map(o=>o.text),optionLabels:optionObjs.slice(0,8).map(o=>o.label),answer,mark,modelAnswer});
    else questions.push({type:declaredType==='code'||declaredType==='كود'?'code':'essay',question,options:[],optionLabels:[],answer:'',mark,modelAnswer});
    cursor=Math.max(blockEnd,markIndex+1);
  }
  return questions.filter(item=>item.question);
}
function hasSubmitted(examId, code){
  const attempts=[...(currentExamStudent?.examAttempts||[]),...(appData.examAttempts||[])];
  return attempts.some(a=>String(a.examId)===String(examId)&&normalizeText(a.studentCode||code)===normalizeText(code)&&a.status!=='started');
}
var currentExamStudent=null;
var currentSecureExams=[];
function renderExamPortal(st,exams){
  const box=document.getElementById('examStudentResult');if(!box)return;
  currentExamStudent=normalizedStudent(st);currentSecureExams=(Array.isArray(exams)?exams:currentSecureExams).filter(ex=>ex&&ex.archived!==true&&ex.active!==false&&ex.published!==false&&(ex.scheduleState||'open')!=='inactive');
  const attempts=(st.examAttempts||[]).slice().reverse();
  const available=currentSecureExams.map(ex=>{
    const done=attempts.some(a=>String(a.examId)===String(ex.id)&&a.status!=='started')&&!ex.allowRetake;
    const draft=readExamDraft(ex.id,st.studentCode);
    const state=ex.scheduleState||'open',blocked=done||state!=='open',label=done?'تم تسليم الامتحان':state==='upcoming'?'ترقّب الامتحان وذاكر ببراعة':state==='closed'?'انتهى الوقت، لم تستطع الامتحان هذه المرة':state==='inactive'?'الامتحان متوقف مؤقتًا':draft?'متابعة الامتحان':'بدء الامتحان';const timeNote=state==='open'&&ex.closeAt?`متاح الآن حتى ${examCairoDateTime(ex.closeAt)}`:state==='upcoming'&&ex.openAt?`يفتح ${examCairoDateTime(ex.openAt)}`:'';
    return `<article class="exam-portal-card ${blocked?'completed':''}"><div class="exam-card-top"><span class="iconbox" data-icon="clipboard"></span><div class="exam-card-badges"><span class="badge">${esc(ex.duration||20)} دقيقة</span><span class="badge">${esc(ex.questionCount||'-')} سؤال</span>${state==='open'?'<span class="badge good">متاح الآن</span>':`<span class="badge warn">${esc(label)}</span>`}</div></div><h3>${esc(ex.title)}</h3><p class="exam-card-schedule">${esc(timeNote||ex.instructions||'اقرأ كل سؤال جيدًا قبل اختيار الإجابة.')}</p>${timeNote&&ex.instructions?`<p class="exam-card-instructions">${esc(ex.instructions)}</p>`:''}${ex.encouragement?`<aside class="exam-card-message" role="note"><span data-icon="sparkles"></span><b>${esc(ex.encouragement)}</b></aside>`:''}${ex.pdfUrl?`<a class="small-btn exam-pdf-link" href="${esc(ex.pdfUrl)}" target="_blank" rel="noopener noreferrer"><span data-icon="file-text"></span> فتح ملف الامتحان PDF</a>`:''}<button class="btn ${blocked?'ghost':'primary'} exam-start-btn" type="button" data-exam-id="${esc(ex.id)}" data-student-code="${esc(st.studentCode)}" ${blocked?'disabled':''}><span data-icon="${done?'user-check':'clipboard'}"></span>${esc(label)}</button></article>`;
  }).join('');
  const resultCards=attempts.length?attempts.map(a=>{const ready=!window.TMResults.isExamGradePending(a);const max=Number(a.maxScore||100),review=Array.isArray(a.review)?a.review:[];return `<article class="exam-result-card"><div><span class="record-eyebrow">${esc(formatPortalDate(a.submittedAt))}</span><h4>${esc(a.examTitle||'امتحان')}</h4><small>${ready?'تم التصحيح الآمن على الخادم':'ينتظر تصحيح الأسئلة المقالية'}</small>${review.length?`<details class="exam-answer-review"><summary>${a.answersRevealed?'مراجعة الإجابات ونموذج الحل':'عرض إجاباتي'}</summary>${review.map((row,index)=>`<div class="exam-review-item ${row.correct===true?'correct':row.correct===false?'wrong':'pending'}"><b>${index+1}. ${esc(row.question)}</b><small>إجابتك: ${esc(row.answer||'لم يجب')}</small>${a.answersRevealed?`<small>الإجابة النموذجية: ${esc(row.correctAnswer||'لا يوجد نموذج محفوظ')}</small><small>${row.awardedMark??0} من ${row.mark||1}</small>`:'<small>بيانات التصحيح محمية وفق سياسة المدرس، ويظهر النموذج بعد التصحيح إذا سمحت الإدارة.</small>'}</div>`).join('')}</details>`:''}</div><strong class="score-pill ${ready?scoreClass((Number(a.score)/max)*100):'warn'}">${ready?`${esc(a.score)} من ${esc(max)} — ${esc(Math.round(Number(a.score)/max*100))}%`:'قيد التصحيح'}</strong></article>`;}).join(''):'<div class="portal-empty"><span class="iconbox" data-icon="bar-chart"></span><h3>لا توجد محاولات بعد</h3><p>ستظهر نتائجك هنا بعد التسليم.</p></div>';
  box.innerHTML=`<section class="exam-student-banner"><span class="student-avatar">${esc(String(st.name||'ط').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join(''))}</span><div><small>اختبارات الطالب</small><h2>${esc(st.name)}</h2><p>${esc(st.grade||'')} <span>•</span> ${esc(st.studentCode)}</p></div></section><div class="exam-security-note"><span data-icon="user-check"></span><div><b>التصحيح مؤمّن</b><small>الإجابات النموذجية تظل محمية، ويتم التصحيح تلقائيًا وبأمان بعد التسليم.</small></div></div><div class="exam-portal-section"><div class="student-panel-title"><div><span class="kicker"><span data-icon="clipboard"></span> المتاح الآن</span><h3>الاختبارات المتاحة</h3></div><span class="badge">${currentSecureExams.length} امتحان</span></div><div class="exam-portal-grid">${available||'<div class="portal-empty"><span class="iconbox" data-icon="clipboard"></span><h3>لا توجد اختبارات حاليًا</h3><p>ستظهر اختبارات مسارك هنا فور نشرها.</p></div>'}</div></div><div class="exam-portal-section"><div class="student-panel-title"><div><span class="kicker"><span data-icon="bar-chart"></span> النتائج</span><h3>سجل الاختبارات</h3></div><span class="badge good">${attempts.length} محاولة</span></div><div class="exam-results-grid">${resultCards}</div></div>`;
  box.querySelectorAll('.exam-start-btn').forEach(btn=>btn.addEventListener('click',()=>window.startExam(btn.dataset.examId,btn.dataset.studentCode,btn)));
  hydrateIcons();
  const resumableExam=currentSecureExams.find(ex=>{const saved=readExamDraft(ex.id,st.studentCode);return (ex.scheduleState||'open')==='open'&&saved?.sessionId&&Array.isArray(saved.questions)&&Number(saved.expiresAt)>examClockNow(saved);});
  if(resumableExam&&!document.body.classList.contains('exam-open')&&!window.__tmExamResumeScheduled){window.__tmExamResumeScheduled=true;setTimeout(()=>{window.__tmExamResumeScheduled=false;if(!document.body.classList.contains('exam-open'))window.startExam(resumableExam.id,st.studentCode);},180);}
}
function setupExamsPage(){
  const form=document.getElementById('examCodeForm');if(!form)return;
  const input=form.querySelector('[name="query"]');const saved=portalSessionGet(LAST_EXAM_CODE_KEY)||portalSessionGet(LAST_STUDENT_CODE_KEY);
  if(saved&&input)input.value=saved;
  form.addEventListener('submit',async e=>{
    e.preventDefault();const code=toEnglishDigits(input.value).trim().toUpperCase();const box=document.getElementById('examStudentResult');const button=form.querySelector('button[type="submit"]');
    if(!code)return;portalSessionSet(LAST_EXAM_CODE_KEY,code);portalSessionSet(LAST_STUDENT_CODE_KEY,code);
    box.innerHTML='<div class="skeleton" style="height:180px"></div>';button?.classList.add('is-loading');if(button)button.disabled=true;
    try{
      const dashboard=await window.MFCloud?.getExamDashboard?.(code);
      if(!dashboard?.student)throw new Error('not-found');
      clearLegacyPortalCodeFromUrl();
      renderExamPortal(dashboard.student,dashboard.exams||[]);
    }catch(err){const offlineDraft=findExamDraftForStudent(code);if(offlineDraft){currentSecureExams=[offlineDraft.exam||{id:offlineDraft.examId,title:'امتحان محفوظ',scheduleState:'open'}];currentExamStudent={studentCode:code,name:'الطالب',examAttempts:[]};renderExamPortal(currentExamStudent,currentSecureExams);toast('تمت استعادة المحاولة المحفوظة على الجهاز، والوقت مستمر حسب الخادم.');}else{box.innerHTML=`<div class="portal-empty"><span class="iconbox" data-icon="search"></span><h3>تعذر فتح الاختبارات</h3><p>${esc(studentCodeFriendlyError(err,'تأكد من كود الطالب واتصال الإنترنت ثم حاول مرة أخرى.'))}</p></div>`;hydrateIcons();}}
    finally{button?.classList.remove('is-loading');if(button)button.disabled=false;}
  });
  const quickCode=toEnglishDigits(new URLSearchParams(location.search).get('code')||saved).trim().toUpperCase();
  if(quickCode&&!form.dataset.autoLoaded){form.dataset.autoLoaded='true';input.value=quickCode;setTimeout(()=>form.requestSubmit(),120);}
}
function examDraftKey(examId,studentCode){return `${EXAM_DRAFT_PREFIX}${String(examId).replace(/[^\w-]/g,'_')}_${String(studentCode).replace(/[^\w-]/g,'_')}`;}
function readExamDraft(examId,studentCode){try{return JSON.parse(portalSessionGet(examDraftKey(examId,studentCode))||'null');}catch(e){return null;}}
function saveExamDraft(examId,studentCode,draft){portalSessionSet(examDraftKey(examId,studentCode),JSON.stringify(draft));}
function clearExamDraft(examId,studentCode){portalSessionRemove(examDraftKey(examId,studentCode));}
function examClockNow(draft){return Date.now()+Number(draft?.serverOffset||0);}
function findExamDraftForStudent(studentCode){try{for(let i=0;i<sessionStorage.length;i+=1){const key=sessionStorage.key(i)||'';if(!key.startsWith(EXAM_DRAFT_PREFIX))continue;const draft=JSON.parse(sessionStorage.getItem(key)||'null');if(normalizeText(draft?.studentCode)===normalizeText(studentCode)&&draft?.sessionId&&Array.isArray(draft.questions)&&Number(draft.expiresAt)>examClockNow(draft))return draft;}}catch(_){ }return null;}
async function openSecureExam(examId,studentCode){
  const metadata=currentSecureExams.find(e=>String(e.id)===String(examId));
  const st=(currentExamStudent&&normalizeText(currentExamStudent.studentCode)===normalizeText(studentCode)?currentExamStudent:null)||{studentCode};
  if(!metadata)return toast('الامتحان غير متاح. أعد إدخال كود الطالب.');
  let draft=readExamDraft(examId,studentCode);
  const validDraft=draft&&draft.sessionId&&Array.isArray(draft.questions)&&Number(draft.expiresAt)>examClockNow(draft);
  if(!validDraft){
    toast('جاري تجهيز جلسة الامتحان الآمنة...');
    try{
      const session=await window.MFCloud?.startSecureExam?.(examId,studentCode);
      if(!session?.sessionId||!Array.isArray(session.questions))throw new Error('Secure session unavailable');
      draft={examId:String(examId),studentCode:String(studentCode),sessionId:session.sessionId,questions:session.questions,exam:session.exam||metadata,answers:session.draft?.answers||{},startedAt:session.startedAt,expiresAt:Number(session.expiresAt),current:Number(session.draft?.current||0),revision:Number(session.draft?.revision||0),serverOffset:Number(session.serverNow||Date.now())-Date.now()};
      saveExamDraft(examId,studentCode,draft);
    }catch(err){return toast(firebaseFriendlyError(err,'تعذر بدء الامتحان الآن. حدّث الصفحة وحاول مرة أخرى.'));}
  }
  const ex=draft.exam||metadata,qs=draft.questions;
  if(!qs.length)return toast('الامتحان لا يحتوي على أسئلة صالحة');
  const overlay=document.getElementById('examOverlay'),box=document.getElementById('examBox'),previousFocus=document.activeElement;overlay.classList.add('show');overlay.setAttribute('aria-hidden','false');document.body.classList.add('exam-open');window.__tmExamInProgress=true;
  const examMapHtml=qs.map((_,index)=>`<button type="button" data-exam-question="${index}" aria-label="الانتقال إلى السؤال ${index+1}">${index+1}</button>`).join('');
  box.innerHTML=`<div class="exam-app-shell ${ex.encouragement?'has-teacher-message':''}"><header class="exam-app-header"><div class="exam-title-wrap"><span class="record-eyebrow">${esc(st.name||'الطالب')}</span><h2 id="examDialogTitle">${esc(ex.title)}</h2>${ex.pdfUrl?`<a class="exam-live-pdf" href="${esc(ex.pdfUrl)}" target="_blank" rel="noopener noreferrer"><span data-icon="file-text"></span> فتح PDF</a>`:''}</div><div class="exam-header-actions"><div class="exam-timer" id="examTimer" role="timer" aria-label="الوقت المتبقي"><span data-icon="calendar"></span><b>--:--</b></div><button class="exam-save-exit" id="examExitBtn" type="button" aria-label="حفظ الامتحان والخروج"><span data-icon="external-link"></span><span>حفظ وخروج</span></button></div></header>${ex.encouragement?`<aside class="exam-teacher-message" id="examTeacherMessage" role="note"><span class="exam-teacher-message-icon" data-icon="sparkles"></span><p><small>رسالة من م. عمرو</small><strong>${esc(ex.encouragement)}</strong></p></aside>`:''}<div class="exam-progress-wrap"><div><b id="examProgressLabel">السؤال 1 من ${qs.length}</b><small id="examSaveStatus" aria-live="polite">يتم حفظ الإجابات تلقائيًا على جهازك</small></div><div class="progress"><span id="examProgressBar" style="width:${100/qs.length}%"></span></div><div class="exam-progress-actions"><span class="exam-connection-status" id="examConnectionStatus" role="status"></span><button class="exam-review-toggle" id="examReviewToggle" type="button" aria-pressed="false">☆ علّم للمراجعة</button></div><nav class="exam-question-map" id="examQuestionMap" aria-label="خريطة أسئلة الامتحان">${examMapHtml}</nav></div><form id="liveExamForm" novalidate><div id="examQuestionStage"></div><footer class="exam-navigation"><button class="btn ghost" id="examPrevBtn" type="button"><span aria-hidden="true">→</span> السابق</button><button class="btn primary" id="examNextBtn" type="button">التالي <span aria-hidden="true">←</span></button><button class="btn primary" id="examSubmitBtn" type="submit"><span data-icon="send"></span> تسليم الامتحان</button></footer></form></div>`;
  hydrateIcons();
  const stage=box.querySelector('#examQuestionStage'),form=box.querySelector('#liveExamForm'),next=box.querySelector('#examNextBtn'),prev=box.querySelector('#examPrevBtn'),submit=box.querySelector('#examSubmitBtn'),exit=box.querySelector('#examExitBtn'),questionMap=box.querySelector('#examQuestionMap'),reviewToggle=box.querySelector('#examReviewToggle'),connectionStatus=box.querySelector('#examConnectionStatus');
  let current=Math.min(Math.max(Number(draft.current||0),0),qs.length-1),finished=false,timeExpired=false,timer=null,serverSaveTimer=null,autoSubmitRetryTimer=null,lastServerSnapshot='',autoSubmitTriggered=false;
  draft.reviewFlags=draft.reviewFlags&&typeof draft.reviewFlags==='object'?draft.reviewFlags:{};
  const isAnswered=index=>String(draft.answers?.[String(index)]??'').trim()!=='';
  const answeredCount=()=>Object.values(draft.answers||{}).filter(v=>String(v??'').trim()!=='').length;
  const updateConnectivity=()=>{const online=navigator.onLine!==false;connectionStatus.textContent=online?'● متصل':'● بدون اتصال';connectionStatus.classList.toggle('offline',!online);return online;};
  const updateQuestionMap=()=>{questionMap.querySelectorAll('[data-exam-question]').forEach(button=>{const index=Number(button.dataset.examQuestion),answered=isAnswered(index),flagged=draft.reviewFlags[String(index)]===true;button.classList.toggle('current',index===current);button.classList.toggle('answered',answered);button.classList.toggle('review',flagged);button.setAttribute('aria-current',index===current?'step':'false');button.setAttribute('aria-label',`السؤال ${index+1}${answered?' — تمت الإجابة':' — بدون إجابة'}${flagged?' — معلّم للمراجعة':''}`);});const flagged=draft.reviewFlags[String(current)]===true;reviewToggle.classList.toggle('active',flagged);reviewToggle.setAttribute('aria-pressed',String(flagged));reviewToggle.textContent=flagged?'★ إلغاء علامة المراجعة':'☆ علّم للمراجعة';};
  const persistServerDraft=async()=>{if(finished||!window.MFCloud?.saveSecureExamProgress)return;const snapshot=JSON.stringify({answers:draft.answers,current});if(snapshot===lastServerSnapshot)return;draft.revision=Math.max(0,Number(draft.revision||0))+1;try{const saved=await window.MFCloud.saveSecureExamProgress(draft.sessionId,studentCode,draft.answers,current,draft.revision);lastServerSnapshot=snapshot;if(saved?.serverNow)draft.serverOffset=Number(saved.serverNow)-Date.now();saveExamDraft(examId,studentCode,draft);updateConnectivity();const status=box.querySelector('#examSaveStatus');if(status)status.textContent=`محفوظ على الجهاز والخادم • ${answeredCount()} من ${qs.length}`;}catch(error){connectionStatus.textContent='● تعذر الاتصال';connectionStatus.classList.add('offline');const status=box.querySelector('#examSaveStatus');if(status)status.textContent='محفوظ على الجهاز — سيُعاد الحفظ على الخادم عند عودة الاتصال';}};
  const scheduleServerSave=()=>{clearTimeout(serverSaveTimer);serverSaveTimer=setTimeout(persistServerDraft,1200);};
  const persistDraft=()=>{draft.current=current;saveExamDraft(examId,studentCode,draft);scheduleServerSave();updateQuestionMap();const status=box.querySelector('#examSaveStatus');if(status){status.textContent=`تم الحفظ على الجهاز • ${answeredCount()} من ${qs.length}`;status.classList.add('saved');setTimeout(()=>status?.classList.remove('saved'),700);}};
  const saveVisibleAnswer=()=>{const q=qs[current];if(q.type==='mcq'||q.type==='truefalse'){const checked=form.querySelector(`input[name="q${current}"]:checked`);draft.answers[String(current)]=checked?checked.value:'';}else{draft.answers[String(current)]=form.elements[`q${current}`]?.value||'';}persistDraft();};
  const resetQuestionScroll=()=>{if(typeof stage.scrollTo==='function')stage.scrollTo({top:0,left:0,behavior:'auto'});else stage.scrollTop=0;};
  const renderCurrent=()=>{stage.innerHTML=renderExamQuestionHtml(qs[current],current);resetQuestionScroll();const stored=draft.answers[String(current)];if((qs[current].type==='mcq'||qs[current].type==='truefalse')&&stored!==undefined&&stored!==''){const radio=stage.querySelector(`input[value="${CSS.escape(String(stored))}"]`);if(radio)radio.checked=true;}else if(stored!==undefined){const area=stage.querySelector('textarea');if(area)area.value=stored;}stage.querySelectorAll('input').forEach(el=>el.addEventListener('change',saveVisibleAnswer));stage.querySelectorAll('textarea').forEach(el=>el.addEventListener('input',saveVisibleAnswer));box.querySelector('#examProgressLabel').textContent=`السؤال ${current+1} من ${qs.length}`;box.querySelector('#examProgressBar').style.width=`${Math.round((current+1)/qs.length*100)}%`;prev.disabled=current===0;next.hidden=current===qs.length-1;submit.hidden=current!==qs.length-1;persistDraft();requestAnimationFrame(()=>stage.querySelector('input:not([disabled]),textarea:not([disabled])')?.focus({preventScroll:true}));};
  next.addEventListener('click',()=>{saveVisibleAnswer();current++;renderCurrent();});
  prev.addEventListener('click',()=>{saveVisibleAnswer();if(current>0){current--;renderCurrent();}});
  questionMap.addEventListener('click',event=>{const button=event.target.closest('[data-exam-question]');if(!button||timeExpired)return;saveVisibleAnswer();current=Math.min(Math.max(Number(button.dataset.examQuestion),0),qs.length-1);renderCurrent();});
  reviewToggle.addEventListener('click',()=>{draft.reviewFlags[String(current)]=draft.reviewFlags[String(current)]!==true;persistDraft();});
  const pageHideSave=()=>{if(!finished){try{saveVisibleAnswer();}catch(_){ }}};
  const unloadGuard=event=>{if(finished)return;pageHideSave();event.preventDefault();event.returnValue='';};
  const examKeydown=event=>{if(event.key==='Escape'&&!finished){event.preventDefault();exit.click();}};
  const onlineHandler=()=>{updateConnectivity();persistServerDraft();},offlineHandler=updateConnectivity;
  window.addEventListener('pagehide',pageHideSave);window.addEventListener('beforeunload',unloadGuard);window.addEventListener('online',onlineHandler);window.addEventListener('offline',offlineHandler);
  document.addEventListener('keydown',examKeydown);
  const closeExamShell=()=>{clearInterval(timer);clearTimeout(serverSaveTimer);clearTimeout(autoSubmitRetryTimer);window.removeEventListener('pagehide',pageHideSave);window.removeEventListener('beforeunload',unloadGuard);window.removeEventListener('online',onlineHandler);window.removeEventListener('offline',offlineHandler);document.removeEventListener('keydown',examKeydown);window.__tmExamInProgress=false;overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true');document.body.classList.remove('exam-open');previousFocus?.focus?.({preventScroll:true});};
  exit.addEventListener('click',async()=>{saveVisibleAnswer();if(confirm('سيتم حفظ إجاباتك والوقت سيستمر. هل تريد الخروج؟')){await persistServerDraft();closeExamShell();toast('تم حفظ المحاولة، يمكنك متابعتها قبل انتهاء الوقت');}});
  const lockExpiredExam=()=>{timeExpired=true;form.querySelectorAll('input,textarea').forEach(control=>control.disabled=true);questionMap.querySelectorAll('button').forEach(button=>button.disabled=true);reviewToggle.disabled=true;prev.disabled=true;next.disabled=true;exit.disabled=true;submit.hidden=false;submit.textContent='إعادة محاولة التسليم';};
  const finish=async(force=false)=>{if(finished||(force&&autoSubmitTriggered))return;if(force){autoSubmitTriggered=true;saveVisibleAnswer();lockExpiredExam();}else saveVisibleAnswer();const firstMissing=qs.findIndex((q,i)=>String(draft.answers[String(i)]??'').trim()==='');if(firstMissing>=0&&!force&&!timeExpired){current=firstMissing;renderCurrent();return toast(`أجب عن السؤال ${firstMissing+1} قبل التسليم`);}if(!force&&!timeExpired&&!confirm('هل أنت متأكد من تسليم الامتحان؟ لن تستطيع تعديل الإجابات بعد التسليم.'))return;finished=true;clearInterval(timer);clearTimeout(serverSaveTimer);submit.disabled=true;submit.classList.add('is-loading');try{const result=await submitExamAttempt(draft.sessionId,st,draft.answers);clearExamDraft(examId,studentCode);closeExamShell();currentExamStudent.examAttempts=[...(currentExamStudent.examAttempts||[]),result];renderExamPortal(currentExamStudent,currentSecureExams);toast('تم تسليم الامتحان بنجاح ولا يمكن فتحه مرة أخرى');}catch(err){finished=false;submit.disabled=false;submit.classList.remove('is-loading');if(timeExpired){autoSubmitTriggered=false;clearTimeout(autoSubmitRetryTimer);autoSubmitRetryTimer=setTimeout(()=>finish(true),8000);}toast(firebaseFriendlyError(err,timeExpired?'انتهى الوقت وإجاباتك مقفلة ومحفوظة. ستتم إعادة محاولة التسليم تلقائيًا.':'تعذر تسليم الامتحان. إجاباتك ما زالت محفوظة.'));}};
  form.addEventListener('submit',e=>{e.preventDefault();finish(timeExpired);});
  const updateTimer=()=>{const left=Math.max(0,Number(draft.expiresAt)-examClockNow(draft));const total=Math.ceil(left/1000),m=Math.floor(total/60),sec=total%60,timerBox=box.querySelector('#examTimer'),timerEl=timerBox?.querySelector('b');if(timerEl)timerEl.textContent=`${m}:${String(sec).padStart(2,'0')}`;timerBox?.classList.toggle('warn',total>60&&total<=300);timerBox?.classList.toggle('danger',total<=60);if(left<=0&&!autoSubmitTriggered)finish(true);};
  timer=setInterval(updateTimer,1000);updateConnectivity();updateTimer();renderCurrent();
}
const examStartRequests=new Map();
window.startExam=function(examId,studentCode,triggerButton){
  const key=`${String(examId)}:${normalizeText(studentCode)}`,existing=examStartRequests.get(key);
  if(existing)return existing;
  const buttons=[...document.querySelectorAll('.exam-start-btn')].filter(button=>String(button.dataset.examId)===String(examId)&&normalizeText(button.dataset.studentCode)===normalizeText(studentCode));
  if(triggerButton&&!buttons.includes(triggerButton))buttons.push(triggerButton);
  buttons.forEach(button=>{button.disabled=true;button.classList.add('is-loading');button.setAttribute('aria-busy','true');});
  const request=Promise.resolve().then(()=>openSecureExam(examId,studentCode)).finally(()=>{
    examStartRequests.delete(key);
    buttons.forEach(button=>{if(!button.isConnected)return;button.disabled=false;button.classList.remove('is-loading');button.removeAttribute('aria-busy');});
  });
  examStartRequests.set(key,request);
  return request;
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
    await ensureQrScannerLibrary();
    reader.innerHTML='';
    if(typeof window.Html5Qrcode==='function'){
      video.hidden=true;reader.hidden=false;studentQrScanner=new window.Html5Qrcode('studentQrReader');
      await startCompatibleQrCamera(studentQrScanner,decoded,240);
      toast('وجّه الكاميرا على QR الطالب');return;
    }
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera-unavailable');
    reader.hidden=true;video.hidden=false;studentQrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});video.srcObject=studentQrStream;await video.play();
    if(!('BarcodeDetector' in window))throw new Error('scanner-unavailable');
    const detector=new BarcodeDetector({formats:['qr_code']});
    const loop=async()=>{if(box.hidden||studentQrDecoded)return;const codes=await detector.detect(video).catch(()=>[]);if(codes.length)return decoded(codes[0].rawValue);setTimeout(loop,250);};
    toast('وجّه الكاميرا على QR الطالب');loop();
  }catch(error){
    console.warn('Student QR scanner failed to start.',error);await window.stopStudentScanner();box.hidden=false;reader.hidden=false;reader.innerHTML=`<p class="section-desc">${esc(cameraStartMessage(error))}</p><button class="btn ghost small" type="button" onclick="startStudentScanner()">إعادة المحاولة</button>`;toast(cameraStartMessage(error));
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
      'caches' in window?caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('technominds-')).map(key=>caches.delete(key)))):Promise.resolve()
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
      const notifyUpdate=()=>toast('تحديث جديد جاهز؛ احفظ عملك ثم أغلق تبويبات المنصة وأعد فتحها.');
      if(registration.waiting)notifyUpdate();
      registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)notifyUpdate();});});
    }catch(_){ }
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{try{if(protectedStudentWorkOpen()||location.pathname.endsWith('teacher-login.html')||document.querySelector('[role=dialog]')){sessionStorage.setItem('mf_sw_reload_deferred_v6400','1');return;}if(sessionStorage.getItem('mf_sw_reloaded_v6400'))return;sessionStorage.setItem('mf_sw_reloaded_v6400','1');location.reload();}catch(_){ }});
}
function setupPWAInstall(){
  const button=document.getElementById('installAppButton');if(!button)return;let installPrompt=null;
  // Let the browser own its native install UI. The platform button provides
  // manual instructions, avoiding a suppressed-banner warning in DevTools.
  window.addEventListener('beforeinstallprompt',()=>{button.hidden=false;});
  button.addEventListener('click',async()=>{if(!installPrompt)return toast('يمكنك تثبيت الموقع من قائمة المتصفح');installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;button.hidden=true;});
  window.addEventListener('appinstalled',()=>{button.hidden=true;toast('تم تثبيت المنصة على الهاتف');});
}
function setupClientErrorReporting(){window.addEventListener('error',event=>{window.MFCloud?.reportClientError?.({message:String(event.message||'خطأ JavaScript'),page:location.href,userAgent:navigator.userAgent}).catch(()=>{});});window.addEventListener('unhandledrejection',event=>{window.MFCloud?.reportClientError?.({message:String(event.reason?.message||event.reason||'Promise rejection'),page:location.href,userAgent:navigator.userAgent}).catch(()=>{});});}
function setupMotionReveal(){const items=[...document.querySelectorAll('main section,.app-service-card,.path-stage,.certificate-card')];items.forEach((item,index)=>{item.classList.add('tm-reveal');item.style.setProperty('--reveal-delay',`${Math.min(index%6,5)*45}ms`);});if(!('IntersectionObserver'in window)||matchMedia('(prefers-reduced-motion: reduce)').matches){items.forEach(item=>item.classList.add('is-visible'));return;}const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{rootMargin:'0px 0px -6% 0px',threshold:.08});items.forEach(item=>observer.observe(item));}
function setupAccessibleDialogs(){
  const dialogs=[...document.querySelectorAll('[id*="Modal"],.modal,[role="dialog"]')];
  let active=null,returnFocus=null;
  const focusable=dialog=>[...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node=>!node.hidden&&node.offsetParent!==null);
  const activate=dialog=>{if(active===dialog)return;active=dialog;returnFocus=document.activeElement;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('tabindex','-1');document.body.classList.add('dialog-open');requestAnimationFrame(()=>{(focusable(dialog)[0]||dialog).focus();});};
  const deactivate=dialog=>{if(active!==dialog)return;active=null;document.body.classList.remove('dialog-open');if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null;};
  dialogs.forEach(dialog=>{if(!dialog.getAttribute('aria-label')&&!dialog.getAttribute('aria-labelledby')){const title=dialog.querySelector('h1,h2,h3');if(title){if(!title.id)title.id=`dialog-title-${dialog.id||Math.random().toString(36).slice(2)}`;dialog.setAttribute('aria-labelledby',title.id);}else dialog.setAttribute('aria-label','نافذة حوار');}const observer=new MutationObserver(()=>{dialog.hidden?deactivate(dialog):activate(dialog);});observer.observe(dialog,{attributes:true,attributeFilter:['hidden','class']});if(!dialog.hidden)activate(dialog);});
  document.addEventListener('keydown',event=>{if(!active)return;if(event.key==='Escape'){event.preventDefault();const close=active.querySelector('[data-dialog-close],.modal-close,[onclick*="close" i]');if(close)close.click();else active.hidden=true;return;}if(event.key==='Tab'){const items=focusable(active);if(!items.length){event.preventDefault();active.focus();return;}const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  document.querySelectorAll('input,select,textarea').forEach(control=>{if(control.type==='hidden'||control.getAttribute('aria-label')||control.getAttribute('aria-labelledby'))return;const label=control.id?document.querySelector(`label[for="${CSS.escape(control.id)}"]`):control.closest('label');if(!label)control.setAttribute('aria-label',control.placeholder||control.name||'حقل إدخال');});
}
function init(){setupInteractionPerformance();setupFastNavigationPrefetch();setupValidationFeedback();setupDuplicateSubmitGuard();setupUnifiedHeader();setupImageLazyLoading();setupTheme(); setupActiveNavigation(); bindLocalizedDigits(); registerServiceWorker(); setupPWAInstall(); setupClientErrorReporting(); hydrateIcons(); fillSelects(); setupBooking(); setupStudent(); setupParent(); setupExamsPage(); setupStudentResourcesPage(); setupReviews(); setupContact(); setupAdminLink(); setupLeaderboardGradePicker(); renderHomeCounts(); renderPublicLeaderboard(); renderReviews(); renderUnifiedResourcesPage(); setupMotionReveal(); setupAccessibleDialogs(); initFirebaseData();}
document.addEventListener('DOMContentLoaded',init);

window.printCurrentMonthlyReport=function(){if(!lastParentMonthlyReport)return toast('انتظر تحميل التقرير الصحيح أولًا.');window.printParentReport();};
