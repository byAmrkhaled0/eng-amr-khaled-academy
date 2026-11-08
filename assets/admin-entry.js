/* Teacher login stays small; admin scripts load only after a verified staff profile. */
(function(){
  'use strict';
  const form=document.getElementById('loginForm');
  if(!form)return;
  const resetButton=document.getElementById('adminPasswordReset');
  const submitButton=form.querySelector('[type="submit"]');
  const bundle=document.getElementById('adminBundles');
  let signingIn=false,opening=null,bundlePromise=null,suppressedUid=null,messageTimer=null;
  const notify=message=>{const target=document.getElementById('toast');if(target){target.textContent=message;target.classList.add('show');clearTimeout(messageTimer);messageTimer=setTimeout(()=>target.classList.remove('show'),2800);}else console.warn(message);};
  const busy=state=>{if(submitButton){submitButton.disabled=state;submitButton.classList.toggle('is-loading',state);}};
  const loadBundles=()=>{
    if(bundlePromise)return bundlePromise;
    window.__adminBootstrapAuth=true;window.__tmAdminBundleState='loading';
    bundlePromise=(async()=>{
      // Attach enhancement handlers only after the page's native DOMContentLoaded.
      if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
      // Presentation assets stay out of the login critical path. The authorized
      // workspace waits for the same styles before its existing scripts render.
      const assets=Array.from(bundle.content.querySelectorAll('script[src]'));
      const assetPromises=new Map(),loaded=new Set();
      const loadScript=original=>{
        const src=original.src;if(assetPromises.has(src))return assetPromises.get(src);
        const promise=new Promise((resolve,reject)=>{
          const script=document.createElement('script');script.src=src;script.async=false;
          script.onload=()=>{loaded.add(src);resolve();};script.onerror=()=>reject(new Error(`تعذر تحميل ملف الإدارة: ${original.getAttribute('src')}`));
          document.body.appendChild(script);
        }).catch(error=>{assetPromises.delete(src);throw error;});
        assetPromises.set(src,promise);return promise;
      };
      const forSection=section=>assets.filter(asset=>(asset.dataset?.adminSections||'').split(/\s+/).includes(section));
      window.__tmAdminSectionAssetsReady=section=>forSection(section).every(asset=>loaded.has(asset.src));
      window.__tmLoadAdminSectionAssets=section=>Promise.all(forSection(section).map(loadScript)).then(()=>{window.__tmAdminInstallRenderEnhancers?.();});
      // CSS and the ordered shared shell scripts download in parallel. No section
      // bundles or section events execute until the existing router asks for them.
      const styles=document.getElementById?.('adminStyles');
      const stylePromise=styles?Promise.all(Array.from(styles.content.querySelectorAll('link[rel="stylesheet"]'),original=>new Promise((resolve,reject)=>{
        const link=document.createElement('link');link.rel='stylesheet';link.href=original.href;link.onload=resolve;link.onerror=()=>reject(new Error('تعذر تحميل تنسيق لوحة الإدارة.'));document.head.appendChild(link);
      }))):Promise.resolve();
      await Promise.all([stylePromise,Promise.all(assets.filter(asset=>!asset.dataset?.adminSections).map(loadScript))]);
      // The existing admin enhancements install on DOMContentLoaded. They must
      // see the same script order as the former deferred production scripts.
      window.__tmAdminBundleState='ready';
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await (window.__tmAdminRenderReady||Promise.resolve());
    })().catch(error=>{window.__tmAdminBundleState='failed';window.__adminBootstrapAuth=false;throw error;});
    return bundlePromise;
  };
  const openWorkspace=profile=>{
    if(opening)return opening;
    opening=(async()=>{
      busy(true);notify('جاري تجهيز لوحة الإدارة…');
      const preparedShell=profile.allowed&&profile.uid===window.MFCloud?.auth?.currentUser?.uid
        ? window.MFCloud.prepareStaffShell?.()
        : undefined;
      await loadBundles();
      await window.__tmAdminBootstrapStart(profile,preparedShell);
      notify('تم الدخول إلى لوحة الإدارة');
    })().catch(error=>{
      console.error('admin-workspace-load',error);
      notify('تعذر فتح لوحة الإدارة. حدّث الصفحة وحاول مرة أخرى.');
      opening=null;
    }).finally(()=>busy(false));
    return opening;
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(signingIn||opening)return;
    const cloud=window.MFCloud;
    if(!cloud?.ready){notify('خدمة تسجيل الدخول غير متاحة الآن. تحقق من الإنترنت.');return;}
    signingIn=true;suppressedUid=null;busy(true);
    try{
      await cloud.signIn(form.email.value.trim(),form.password.value);
      const profile=await cloud.getCurrentStaffProfile();
      if(!profile?.allowed){suppressedUid=cloud.auth.currentUser?.uid||null;localStorage.removeItem('tm-offline-staff-profile-v1');await cloud.signOut();notify('غير مصرح لك بالدخول.');return;}
      await openWorkspace(profile);
    }catch(error){
      const raw=`${error?.code||''} ${error?.message||''}`;
      notify(/invalid-credential|wrong-password|user-not-found|invalid-login/i.test(raw)?'البريد أو كلمة المرور غير صحيحة.':'تعذر تأكيد صلاحية حساب الإدارة. حاول مرة أخرى.');
    }finally{signingIn=false;busy(false);}
  });
  resetButton?.addEventListener('click',async()=>{
    if(!form.email.value.trim()||!form.email.checkValidity()){form.email.reportValidity();return;}
    resetButton.disabled=true;resetButton.classList.add('is-loading');
    try{await window.MFCloud.sendPasswordReset(form.email.value.trim());notify('تم إرسال رابط إعادة ضبط كلمة المرور إذا كان البريد مسجلًا.');}
    catch(error){notify(/user-not-found/i.test(String(error?.code||''))?'تم إرسال رابط إعادة ضبط كلمة المرور إذا كان البريد مسجلًا.':'تعذر إرسال رابط إعادة الضبط. حاول مرة أخرى.');}
    finally{resetButton.disabled=false;resetButton.classList.remove('is-loading');}
  });
  const restoreOffline=async()=>{
    if(navigator.onLine!==false)return;
    try{
      const cached=JSON.parse(localStorage.getItem('tm-offline-staff-profile-v1')||'null');
      if(cached?.allowed&&cached.role==='admin'&&Number.isFinite(Number(cached.expiresAt))&&Number(cached.expiresAt)>Date.now()){await loadBundles();if(document.querySelector('.admin-page'))await window.tryOfflineStaffWorkspace?.();}
    }catch(error){console.warn('offline-admin-load',error);}
  };
  if(window.MFCloud?.auth?.onIdTokenChanged){
    window.MFCloud.auth.onIdTokenChanged(async user=>{
      // Existing offline roster and expiring staff profile remain the only
      // way to open offline attendance without a live Auth session.
      if(!user){
        if(navigator.onLine===false){await restoreOffline();return;}
        if(document.querySelector('.admin-page')){localStorage.removeItem('tm-offline-staff-profile-v1');sessionStorage.removeItem('technominds_academy_v60_data');document.getElementById('adminRoot').textContent='انتهت جلسة الإدارة. سجّل الدخول مرة أخرى.';location.reload();}
        return;
      }
      if(signingIn||user.uid===suppressedUid)return;
      try{
        const profile=await window.MFCloud.getCurrentStaffProfile();
        if(!profile?.allowed){suppressedUid=user.uid;localStorage.removeItem('tm-offline-staff-profile-v1');await window.MFCloud.signOut();if(document.querySelector('.admin-page'))location.reload();else notify('انتهت صلاحية جلسة الإدارة. سجّل الدخول مرة أخرى.');return;}
        if(!document.querySelector('.admin-page'))await openWorkspace(profile);
      }catch(error){
        if(navigator.onLine===false){await restoreOffline();return;}
        const raw=`${error?.code||''} ${error?.message||''}`;
        if(/permission-denied|unauthenticated|invalid-user-token|user-token-expired/i.test(raw)){
          localStorage.removeItem('tm-offline-staff-profile-v1');
          await window.MFCloud.signOut().catch(()=>{});
          if(document.querySelector('.admin-page'))location.reload();
        }else notify('تعذر تحديث جلسة الإدارة مؤقتًا. حاول مرة أخرى.');
      }
    });
  }
})();
