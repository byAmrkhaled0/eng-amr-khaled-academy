
/* Entry does not initialize cloud services until an existing CODE flow needs them. */
(function(){
 'use strict';
 const template=document.getElementById('portalFirebaseAssets');if(!template)return;
 let boot=null;
 function script(src){
  return new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=src;node.async=true;node.onload=resolve;node.onerror=()=>{node.remove();reject(new Error('تعذر تحميل خدمة الدخول. تحقق من الإنترنت وأعد المحاولة.'));};document.head.append(node);});
 }
 function ensure(){
  if(window.MFCloud?.ready)return Promise.resolve();
  if(boot)return boot;
  boot=(async()=>{
   const urls=[...template.content.querySelectorAll('script[src]')].map(n=>n.getAttribute('src'));
   const app=urls.find(src=>src.includes('firebase-app-compat'));
   if(typeof window.firebase==='undefined')await script(app);
   await Promise.all(urls.filter(src=>/firebase-(auth|firestore|functions)-compat/.test(src)).filter(src=>{const name=src.match(/firebase-(\w+)-compat/)[1];return typeof window.firebase?.[name]!=='function';}).map(script));
   if(!window.MF_FIREBASE_CONFIG)await script(urls.find(src=>src.startsWith('assets/firebase-config.js')));
   await script(urls.find(src=>src.startsWith('assets/firebase-sync.js')));
   if(!window.MFCloud?.ready)throw new Error(window.MF_FIREBASE_CONFIG?.localOffline?'المعاينة المحلية غير متصلة بخدمات البيانات. شغّل وضع المحاكيات المحلي المرفق.':'خدمة الحساب غير متاحة حاليًا. حاول مرة أخرى.');
  })().catch(error=>{boot=null;throw error;});
  return boot;
 }
 const studentEntry=!!document.getElementById('studentSearchForm');
 const accountReady=()=>!!window.TMAccount&&(!studentEntry||!!window.TMAccountDomain&&!!window.TMResults);
 let accountBoot=null;
 function loadAccount(){
  if(accountReady())return Promise.resolve();
  if(accountBoot)return accountBoot;
  accountBoot=(async()=>{
   const urls=[...document.querySelector('#portalAccountAssets')?.content.querySelectorAll('script[src]')||[]].map(node=>node.getAttribute('src')).filter(src=>!(src.includes('account-domain')&&window.TMAccountDomain)&&!(src.includes('account-platform')&&window.TMAccount)&&!(src.includes('portal-results')&&window.TMResults));
   await Promise.all(urls.map(script));
   if(!accountReady())throw new Error('تعذر تجهيز شاشة الحساب. حدّث الصفحة وحاول مرة أخرى.');
  })().catch(error=>{accountBoot=null;throw error;});return accountBoot;
 }
 window.TMPortalEntry={loadAccount,needsBootstrap:()=>!window.MFCloud?.ready,loadLegacyResults:()=>window.loadLazyScript('portal-results','assets/portal-results.js?v='+window.MF_ASSET_VERSION,()=>!!window.TMResults)};
 for(const form of document.querySelectorAll('#studentSearchForm,#parentSearchForm')){
  let pending=false;
  form.addEventListener('submit',async event=>{
   // Account assets load only after the server accepts CODE.
   if(window.MFCloud?.ready)return;
   event.preventDefault();event.stopImmediatePropagation();if(pending)return;pending=true;
   const button=form.querySelector('[type="submit"]');if(button){button.disabled=true;button.classList.add('is-loading');}
   let status=form.querySelector('[data-entry-status]');
   if(!status){status=document.createElement('p');status.dataset.entryStatus='';status.setAttribute('role','status');form.append(status);}
   status.textContent='جاري تجهيز الدخول الآمن…';
   try{await ensure();status.textContent='';if(button){button.disabled=false;button.classList.remove('is-loading');}form.requestSubmit();}
   catch(error){status.textContent=error.message;if(button){button.disabled=false;button.classList.remove('is-loading');}}
   finally{pending=false;}
  },true);
 }
})();
