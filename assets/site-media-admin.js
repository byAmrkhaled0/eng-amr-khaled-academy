/* Lazy Settings-only editor. Uses existing Admin permissions and public upload folder. */
(function(){
 'use strict';
 const data=()=>typeof adminData!=='undefined'?adminData:{settings:{}};
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const notify=message=>(window.aToast||window.toast)?.(message);
 const bucket=()=>window.MF_FIREBASE_CONFIG?.storageBucket||window.MFCloud?.app?.options?.storageBucket||window.TMSiteMedia.DEFAULT_BUCKET;
 const emulator=()=>window.MF_FIREBASE_CONFIG?.emulators?.projectId==='demo-technominds';
 function value(spec){const raw=data().settings?.siteMedia?.[spec.id];try{return raw?.url?window.TMSiteMedia.normalize(spec.id,raw,bucket(),emulator()):null;}catch(_){return null;}}
 function record(spec,next){data().settings={...(data().settings||{}),siteMedia:{...(data().settings?.siteMedia||{}),[spec.id]:next}};if(typeof saveData==='function')saveData(data());}
 function paint(host){
  const specs=window.TMSiteMedia.slots(data().settings||{});
  host.innerHTML='<p class="section-desc">غيّر صور الموقع العامة من هنا. الصور تُرفع عند الحفظ فقط، مع تجهيز نسخة WebP خفيفة. التغيير لا يحذف الصور السابقة أو محتوى الطلاب.</p><div class="site-media-grid">'+specs.map(spec=>{const v=value(spec),src=v?.url||spec.src;return '<article class="site-media-card"><div class="site-media-thumb">'+(src?'<img loading="lazy" src="'+esc(src)+'" alt="'+esc(spec.title)+'" style="object-fit:'+esc(v?.fit||spec.fit)+'">':'<span>بدون صورة — تظهر أيقونة المسار</span>')+'</div><div><h4>'+esc(spec.title)+'</h4><span class="badge '+(v?'good':'')+'">'+(v?'صورة مخصصة':'الافتراضي')+'</span></div><button class="small-btn" type="button" data-edit-site-media="'+esc(spec.id)+'"><span data-icon="upload"></span> تغيير الصورة</button></article>';}).join('')+'</div>';
  host.querySelectorAll('[data-edit-site-media]').forEach(button=>button.addEventListener('click',()=>edit(host,specs.find(s=>s.id===button.dataset.editSiteMedia))));
  window.hydrateIcons?.(host);
 }
 function edit(host,spec){
  if(!spec||document.getElementById('siteMediaEditor'))return;
  const current=value(spec),expectedRevision=Number(data().settings?.siteMedia?.[spec.id]?.revision)||0;
  const dialog=document.createElement('dialog');dialog.id='siteMediaEditor';dialog.className='site-media-dialog';dialog.setAttribute('aria-labelledby','siteMediaEditorTitle');
  dialog.innerHTML='<form id="siteMediaEditForm" class="site-media-form"><div class="section-head"><div><h3 id="siteMediaEditorTitle">'+esc(spec.title)+'</h3><p class="section-desc">المعاينة لا تغيّر الموقع؛ اضغط حفظ لاعتماد الصورة.</p></div><button class="small-btn" type="button" data-media-close aria-label="إغلاق">×</button></div><div class="site-media-preview"><img data-media-preview alt="معاينة الصورة"'+((current?.url||spec.src)?' src="'+esc(current?.url||spec.src)+'"':' hidden')+'><span data-media-empty'+((current?.url||spec.src)?' hidden':'')+'>تظهر أيقونة المسار دون صورة</span></div><label class="field"><span>اختر صورة جديدة</span><input type="file" name="image" accept="image/jpeg,image/png,image/webp"><small class="field-hint">JPG / PNG / WebP حتى 10MB. تُصغّر الأبعاد وتُضغط إلى 1.5MB كحد أقصى قبل الرفع. تجنّب الصور التي تحتوي على بيانات خاصة.</small></label><label class="field"><span>وصف الصورة — لإمكانية الوصول</span><input name="alt" maxlength="180" value="'+esc(current?.alt||spec.alt)+'"></label><div class="grid grid-2"><label class="field"><span>طريقة العرض</span><select name="fit"><option value="cover">ملء المساحة</option><option value="contain">إظهار الصورة كاملة</option></select></label><div class="site-media-focus"><label>موضع أفقي<input type="range" name="x" min="0" max="100" value="'+esc(current?.x??50)+'"></label><label>موضع رأسي<input type="range" name="y" min="0" max="100" value="'+esc(current?.y??50)+'"></label></div></div><p data-media-status role="status" aria-live="polite"></p><div class="mobile-actions"><button class="btn primary" type="submit"><span data-icon="upload"></span> حفظ الصورة</button><button class="btn ghost" type="button" data-media-reset>استرجاع الافتراضي</button><button class="btn ghost" type="button" data-media-close>إلغاء</button></div></form>';
  document.body.append(dialog);const form=dialog.querySelector('form'),image=form.querySelector('[data-media-preview]'),empty=form.querySelector('[data-media-empty]'),status=form.querySelector('[data-media-status]'),fileInput=form.elements.image;
  let selected=null,previewURL='',prepared=null,uploaded=null,reset=false,pending=false,committing=false,closed=false;
  const transfer=new AbortController(),currentEditor=()=>!closed&&dialog.isConnected&&!transfer.signal.aborted;
  form.elements.fit.value=current?.fit||spec.fit;
  const message=(text,error=false)=>{status.textContent=text;status.setAttribute('role',error?'alert':'status');status.classList.toggle('site-media-error',error);};
  const preview=()=>{const src=previewURL||(reset?spec.src:current?.url||spec.src);image.hidden=!src;empty.hidden=!!src;if(src&&image.getAttribute('src')!==src)image.src=src;image.style.objectFit=form.elements.fit.value;image.style.objectPosition=form.elements.x.value+'% '+form.elements.y.value+'%';};
  const release=()=>{if(previewURL){URL.revokeObjectURL(previewURL);previewURL='';}};
  const closeEditor=(force=false)=>{if(committing&&!force)return;closed=true;transfer.abort();dialog.close();release();dialog.remove();};
  fileInput.addEventListener('change',()=>{if(pending)return;release();selected=fileInput.files?.[0]||null;prepared=uploaded=null;reset=false;if(selected&&(!['image/jpeg','image/png','image/webp'].includes(selected.type)||selected.size<=0||selected.size>window.TMSiteMedia.MAX_INPUT)){selected=null;fileInput.value='';message('اختر JPG أو PNG أو WebP بحجم لا يزيد عن 10MB.',true);preview();return;}if(selected){previewURL=URL.createObjectURL(selected);message('معاينة محلية — لم يتم رفع الصورة بعد.');}else message('');preview();});
  for(const name of ['fit','x','y'])form.elements[name].addEventListener('input',preview);
  form.querySelector('[data-media-reset]').addEventListener('click',()=>{if(pending)return;release();selected=prepared=uploaded=null;fileInput.value='';reset=true;form.elements.alt.value=spec.alt;form.elements.fit.value=spec.fit;form.elements.x.value=form.elements.y.value='50';message('الصورة الافتراضية في المعاينة. اضغط حفظ لاعتمادها.');preview();});
  dialog.querySelectorAll('[data-media-close]').forEach(button=>button.addEventListener('click',()=>closeEditor()));dialog.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});dialog.addEventListener('close',()=>{closed=true;transfer.abort();release();dialog.remove();},{once:true});
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(pending||closed)return;if(!selected&&!current&&!reset){message('اختر صورة أولًا أو اضغط إلغاء.',true);return;}
   if(!navigator.onLine){message('اتصل بالإنترنت قبل حفظ الصورة.',true);return;}
   pending=true;const controls=[...form.querySelectorAll('button,input,select')];controls.forEach(n=>n.disabled=!n.matches('[data-media-close]'));const submit=form.querySelector('[type=submit]');submit.classList.add('is-loading');
   try{
    let payload=null;
    if(!reset){
     if(selected){if(!prepared){message('جاري تجهيز صورة خفيفة…');prepared=await window.TMSiteMedia.prepare(selected,spec.id);if(!currentEditor())return;}if(!uploaded){message('جاري رفع الصورة…');if(!window.MFCloud?.uploadAttachment)throw new Error('خدمة رفع الصور غير متاحة.');uploaded=await window.MFCloud.uploadAttachment(prepared.file,'public/uploads',{fileName:prepared.file.name,signal:transfer.signal,onProgress:p=>{if(currentEditor())message('جاري رفع الصورة… '+p.percent+'%');}});if(!currentEditor())return;if(!uploaded?.url)throw new Error('لم يكتمل رفع الصورة.');}payload={url:uploaded.url,path:uploaded.path,width:prepared.width,height:prepared.height,contentType:'image/webp'};}
     else payload={...current};
     payload={...payload,alt:form.elements.alt.value,fit:form.elements.fit.value,x:Number(form.elements.x.value),y:Number(form.elements.y.value)};
     payload=window.TMSiteMedia.normalize(spec.id,payload,bucket(),emulator());
    }
    if(!currentEditor())return;committing=true;controls.forEach(n=>n.disabled=true);message('جاري حفظ إعداد الصورة…');if(!window.MFCloud?.saveSiteMedia)throw new Error('خدمة حفظ الصور غير متاحة.');const result=await window.MFCloud.saveSiteMedia(spec.id,payload,expectedRevision);if(!currentEditor())return;record(spec,result);paint(host);closeEditor(true);notify(reset?'تم استرجاع الصورة الافتراضية.':'تم حفظ الصورة. تظهر للزائر عند تحديث الصفحة.');
   }catch(error){if(currentEditor())message(error?.message||'تعذر حفظ الصورة. الصورة السابقة لم تتغير.',true);}
   finally{pending=false;committing=false;controls.forEach(n=>n.disabled=false);submit.classList.remove('is-loading');}
  });preview();window.hydrateIcons?.(dialog);dialog.showModal();
 }
 function mount(){
  const settings=document.getElementById('settingsForm'),root=document.getElementById('adminContent');if(!settings||!root||root.querySelector('#siteMediaManager')||!window.TMSiteMedia)return;
  const card=document.createElement('details');card.id='siteMediaManager';card.className='card site-media-manager';card.innerHTML='<summary><span data-icon="upload"></span> صور الموقع <small>الشعار، الرئيسية، صورتك، الشهادات، وصور المسارات</small></summary><div data-site-media-body></div>';
  (settings.closest('.card')||settings).after(card);let initialized=false;card.addEventListener('toggle',()=>{if(!card.open||initialized)return;initialized=true;paint(card.querySelector('[data-site-media-body]'));});window.hydrateIcons?.(card);
 }
 window.TMSiteMediaAdmin={mount};
})();
