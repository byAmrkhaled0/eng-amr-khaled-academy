
/* Lazy Admin tools inside the existing Content and Attention workspaces. */
(function(){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const data=()=>typeof adminData!=='undefined'?adminData:{settings:{},groups:[]};
 const uid=()=>window.MFCloud?.currentUser?.()?.uid||(typeof currentStaff!=='undefined'?currentStaff?.uid:'')||'local';
 const groupCache={uid:'',loaded:false,promise:null,rows:[]};
 const history={uid:'',rows:[],loaded:false,promise:null,cursor:null,hasMore:false};
 const notify=message=>{const show=window.aToast||window.toast;if(show)show(message);};
 const options=(items,selected)=>items.map(item=>'<option value="'+esc(Array.isArray(item)?item[0]:item)+'" '+((Array.isArray(item)?item[0]:item)===selected?'selected':'')+'>'+esc(Array.isArray(item)?item[1]:item)+'</option>').join('');
 const requestId=()=>crypto.randomUUID?.().replace(/-/g,'')||('notice_'+Date.now()+'_'+Math.random().toString(36).slice(2));
 const types=[['GENERAL','إعلان عام'],['HOMEWORK','واجب'],['EXAM','امتحان'],['LECTURE','محاضرة'],['ATTENDANCE','الحضور'],['PAYMENT','الدفع']];
 const destinations=[['overview','الرئيسية'],['lectures','المحاضرات'],['homework','الواجبات'],['exams','الاختبارات'],['grades','الدرجات'],['attendance','الحضور'],['motivation','التحفيز'],['recitation','العملي'],['payments','المدفوعات'],['transfer','طلب نقل']];
 function feedback(form,message){let node=form.querySelector('[data-tool-error]');if(!node){node=document.createElement('p');node.dataset.toolError='';node.setAttribute('role','alert');form.append(node);}node.textContent=message||'';}
 function renderTracks(host){
  const settings=data().settings||{},tracks=window.TMAccountDomain.tracks(settings);
  host.innerHTML='<div class="section-head"><div><h3>المسارات التعليمية للموقع</h3><p class="section-desc">تحكم في المسارات التي يراها الزائر. المسار الدراسي للمجموعات والامتحانات يظل مستقلًا.</p></div><button class="btn primary" type="button" data-track-new>إضافة مسار</button></div><div class="account-admin-track-list">'+(tracks.map(track=>'<article><span data-icon="'+esc(track.icon||'book-open')+'"></span><div><h4>'+esc(track.title)+'</h4><p>'+esc(track.description||'')+'</p><small>الترتيب: '+esc(track.order)+' · '+esc(track.audienceLabel||'كل المستويات')+'</small></div><span class="badge '+(track.active!==false?'good':'warn')+'">'+(track.active!==false?'نشط':'غير نشط')+'</span><div class="mobile-actions"><button class="small-btn" type="button" data-track-edit="'+esc(track.id)+'">تعديل</button><button class="small-btn danger" type="button" data-track-remove="'+esc(track.id)+'">إزالة</button></div></article>').join('')||'<p>لا توجد مسارات. أضف مسارًا ليظهر بالموقع.</p>')+'</div>';
  host.querySelector('[data-track-new]').onclick=()=>editTrack(host);
  host.querySelectorAll('[data-track-edit]').forEach(button=>button.onclick=()=>editTrack(host,tracks.find(t=>t.id===button.dataset.trackEdit)));
  host.querySelectorAll('[data-track-remove]').forEach(button=>button.onclick=async()=>{
   const track=tracks.find(t=>t.id===button.dataset.trackRemove);if(!confirm('إزالة مسار «'+track.title+'» من الموقع؟ محتوى الطلاب ونتائجهم يظل محفوظًا.'))return;
   button.disabled=true;try{const result=await window.MFCloud.manageLearningTrackAdmin({action:'remove',id:track.id,expectedVersion:Number(settings.learningTracksVersion)||0});applySettings(result);renderTracks(host);}catch(error){notify(error?.message||'تعذر إزالة المسار.');button.disabled=false;}
  });window.hydrateIcons?.(host);
 }
 function applySettings(result){data().settings={...(data().settings||{}),...result};if(typeof saveData==='function')saveData(data());}
 function editTrack(host,item){
  document.getElementById('learningTrackEditor')?.remove();
  const dialog=document.createElement('dialog');dialog.id='learningTrackEditor';dialog.className='account-admin-dialog';dialog.setAttribute('aria-labelledby','learningTrackEditorTitle');
  dialog.innerHTML='<form class="account-admin-form"><div class="profile-top"><h2 id="learningTrackEditorTitle">'+(item?'تعديل المسار':'إضافة مسار')+'</h2><button class="small-btn" type="button" data-close-editor aria-label="إغلاق">×</button></div><div class="grid grid-2"><label class="field"><span>العنوان</span><input name="title" required minlength="2" maxlength="100"></label><label class="field"><span>المعرّف</span><input name="id" required pattern="[a-z0-9][a-z0-9-]{1,59}" maxlength="60" dir="ltr"></label></div><label class="field"><span>وصف مختصر</span><textarea name="description" maxlength="240" rows="2"></textarea></label><div class="grid grid-2"><label class="field"><span>الأيقونة</span><select name="icon">'+options(window.TMAccountDomain.ICONS,item?.icon||'code')+'</select></label><label class="field"><span>الترتيب</span><input name="order" type="number" min="0" max="999" required></label><label class="field"><span>وجهة المسار</span><input name="destination" maxlength="220" required dir="ltr" placeholder="learning-path.html"></label><label class="field"><span>المستوى / الجمهور (اختياري)</span><input name="audienceLabel" maxlength="80"></label></div><label class="field"><span>صورة محلية (اختياري)</span><select name="image">'+options([['','بدون صورة'],['assets/education-tracks-reference-v3.webp','المسارات التقنية'],['assets/student-learning-visual-v1.webp','التعلّم والتطبيق'],['assets/parent-learning-visual-v1.webp','المتابعة']],item?.image||'')+'</select></label><label class="check"><input name="active" type="checkbox"> نشط ويظهر في الموقع</label><div class="mobile-actions"><button class="btn primary" type="submit">حفظ المسار</button><button class="btn ghost" type="button" data-close-editor>إلغاء</button></div><p data-tool-error role="alert"></p></form>';
  document.body.append(dialog);const form=dialog.querySelector('form');
  const value=item||{id:'track-'+Date.now(),title:'',description:'',icon:'code',order:window.TMAccountDomain.tracks(data().settings).length+1,destination:'learning-path.html',audienceLabel:'',active:true};
  for(const [key,v]of Object.entries(value)){const field=form.elements[key];if(!field)continue;if(field.type==='checkbox')field.checked=v!==false;else field.value=v||'';}
  form.elements.id.readOnly=!!item;
  dialog.querySelectorAll('[data-close-editor]').forEach(button=>button.onclick=()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  let pending=false;form.onsubmit=async event=>{
   event.preventDefault();if(pending)return;
   let track;try{track=window.TMAccountDomain.normalizeTrack({...Object.fromEntries(new FormData(form)),order:Number(form.elements.order.value),active:form.elements.active.checked});}catch(error){feedback(form,error.message);return;}
   pending=true;const button=form.querySelector('[type=submit]');button.disabled=true;feedback(form,'');
   try{const result=await window.MFCloud.manageLearningTrackAdmin({action:'upsert',track,expectedVersion:Number(data().settings?.learningTracksVersion)||0});applySettings(result);dialog.close();renderTracks(host);notify('تم حفظ المسار.');}
   catch(error){feedback(form,error?.message||'تعذر الحفظ.');}finally{pending=false;button.disabled=false;}
  };dialog.showModal();
 }
 function targetLabel(target){return target?.scope==='all'?'كل الطلاب النشطين':target?.scope==='group'?'المجموعة: '+((data().groups||[]).find(g=>g.id===target.scheduleId)?.name||target.scheduleId):target?.scope==='grade'?'المسار: '+target.grade:(target?.studentCodes||[]).join('، ');}
 function paintHistory(host){
  const box=host.querySelector('[data-account-notification-history]');if(!box)return;
  box.innerHTML='<div class="section-head"><h4>سجل الإشعارات</h4><button class="small-btn" type="button" data-history-refresh>تحديث السجل</button></div>'+(history.rows.map(row=>'<article class="account-admin-history-row"><div><h4>'+esc(row.title)+'</h4><p>'+esc(row.body)+'</p><small>'+esc(targetLabel(row.target))+' · '+esc(new Date(row.createdAt).toLocaleDateString('ar-EG',{timeZone:'Africa/Cairo'}))+'</small></div><span class="badge '+(row.active?'good':'warn')+'">'+(row.active?'منشور':'موقوف')+'</span>'+(row.active?'<button class="small-btn danger" type="button" data-archive-notification="'+esc(row.id)+'">إيقاف</button>':'')+'</article>').join('')||'<p class="section-desc">لا توجد إشعارات منشورة.</p>')+(history.hasMore?'<button class="btn ghost" type="button" data-history-more>تحميل أقدم</button>':'');
  box.querySelector('[data-history-refresh]').onclick=()=>loadHistory(host,{refresh:true});
  box.querySelector('[data-history-more]')?.addEventListener('click',()=>loadHistory(host,{append:true}));
  box.querySelectorAll('[data-archive-notification]').forEach(button=>button.onclick=async()=>{
   if(!confirm('إيقاف ظهور هذا الإشعار للطلاب مع الاحتفاظ به في السجل؟'))return;
   button.disabled=true;try{await window.MFCloud.publishAccountNotificationAdmin({action:'archive',id:button.dataset.archiveNotification});const row=history.rows.find(n=>n.id===button.dataset.archiveNotification);if(row)row.active=false;paintHistory(host);}catch(error){notify(error?.message||'تعذر إيقاف الإشعار.');button.disabled=false;}
  });
 }
 async function loadHistory(host,options={}){
  if(history.uid!==uid()){Object.assign(history,{uid:uid(),rows:[],loaded:false,promise:null,cursor:null,hasMore:false});}
  if(history.promise)return history.promise;
  if(history.loaded&&!options.refresh&&!options.append){paintHistory(host);return;}
  const box=host.querySelector('[data-account-notification-history]');if(box)box.innerHTML='<p role="status">جاري تحميل سجل الإشعارات…</p>';
  history.promise=(async()=>{try{const result=await window.MFCloud.listAccountNotificationsAdmin({cursor:options.append?history.cursor:null});history.rows=[...new Map([...(options.append?history.rows:[]),...(result.rows||[])].map(n=>[n.id,n])).values()];history.hasMore=result.hasMore===true;history.cursor=result.nextCursor;history.loaded=true;paintHistory(host);}catch(error){if(box){box.innerHTML='<p role="alert">'+esc(error?.message||'تعذر تحميل السجل.')+'</p><button class="small-btn" type="button">إعادة المحاولة</button>';box.querySelector('button').onclick=()=>loadHistory(host,{refresh:true});}}finally{history.promise=null;}})();return history.promise;
 }
 function notificationCenter(host){
  const groups=(data().groups||[]).filter(g=>g.active!==false),grades=typeof GRADES!=='undefined'?GRADES:['أولى ثانوي بكالوريا','تانية ثانوي بكالوريا','أساسيات برمجة'];
  host.innerHTML='<div class="section-head"><div><h3>إشعارات حسابات الطلاب</h3><p class="section-desc">رسائل داخل المنصة. اختر الجمهور وراجع الرسالة قبل نشرها.</p></div></div><form id="accountNotificationForm" class="account-admin-form"><div class="grid grid-2"><label class="field"><span>نوع الإشعار</span><select name="type">'+options(types,'GENERAL')+'</select></label><label class="field"><span>الجمهور</span><select name="scope">'+options([['all','كل الطلاب النشطين'],['students','طالب / طلاب محددون'],['group','مجموعة'],['grade','مسار دراسي']],'all')+'</select></label><label class="field" data-notification-target="students" hidden><span>أكواد الطلاب — بحد أقصى 50</span><textarea name="studentCodes" maxlength="2100" rows="2" placeholder="كود واحد أو أكواد مفصولة بفاصلة"></textarea></label><label class="field" data-notification-target="group" hidden><span>المجموعة</span><select name="scheduleId">'+options(groups.map(g=>[g.id,g.name||g.id]))+'</select></label><label class="field" data-notification-target="grade" hidden><span>المسار الدراسي</span><select name="grade">'+options(grades)+'</select></label></div><label class="field"><span>العنوان</span><input name="title" required minlength="2" maxlength="100"></label><label class="field"><span>الرسالة</span><textarea name="body" required minlength="2" maxlength="1200" rows="3"></textarea></label><div class="grid grid-2"><label class="field"><span>يفتح قسم</span><select name="actionTab">'+options(destinations,'overview')+'</select></label><label class="field"><span>الأولوية</span><select name="priority">'+options([['normal','عادي'],['important','مهم']],'normal')+'</select></label><label class="field"><span>انتهاء الظهور (اختياري)</span><input name="expiresAt" type="datetime-local"></label></div><aside class="account-notification-preview" aria-label="معاينة الرسالة"><strong data-preview-title>عنوان الإشعار</strong><p data-preview-body>نص الرسالة كما سيظهر للطالب.</p><small data-preview-target></small></aside><div class="mobile-actions"><button class="btn primary" type="submit">نشر الإشعار</button></div><p data-tool-error role="alert"></p></form><section data-account-notification-history></section>';
  const form=host.querySelector('form');let pending=false,id=requestId();
  const preview=()=>{form.querySelector('[data-preview-title]').textContent=form.elements.title.value||'عنوان الإشعار';form.querySelector('[data-preview-body]').textContent=form.elements.body.value||'نص الرسالة كما سيظهر للطالب.';form.querySelector('[data-preview-target]').textContent=form.elements.scope.selectedOptions[0].textContent;host.querySelectorAll('[data-notification-target]').forEach(field=>{field.hidden=field.dataset.notificationTarget!==form.elements.scope.value;});};
  form.addEventListener('input',preview);form.addEventListener('change',preview);
  const ensureGroups=async()=>{
   if(form.elements.scope.value!=='group')return;
   const owner=uid();if(groupCache.uid!==owner)Object.assign(groupCache,{uid:owner,loaded:false,promise:null,rows:[]});
   if((data().groups||[]).length){groupCache.rows=data().groups;groupCache.loaded=true;}
   const select=form.elements.scheduleId;select.disabled=true;
   try{
    if(!groupCache.loaded){
     if(!window.MFCloud.getGroupsAdmin)throw new Error('خدمة المجموعات غير متاحة. افتح قسم المواعيد ثم أعد المحاولة.');
     if(!groupCache.promise){const promise=window.MFCloud.getGroupsAdmin().then(rows=>{if(groupCache.uid===owner){groupCache.rows=rows;groupCache.loaded=true;}}).finally(()=>{if(groupCache.uid===owner&&groupCache.promise===promise)groupCache.promise=null;});groupCache.promise=promise;}
     await groupCache.promise;
    }
    if(!form.isConnected||uid()!==owner)return;
    const rows=groupCache.rows.filter(g=>g.active!==false);select.innerHTML=options(rows.map(g=>[g.id,g.name||g.id]));select.disabled=!rows.length;if(!rows.length)feedback(form,'لا توجد مجموعات نشطة. يمكنك إضافتها من قسم المواعيد.');else feedback(form,'');
   }catch(error){if(form.isConnected)feedback(form,error.message);}finally{if(form.isConnected&&select.options.length)select.disabled=false;}
  };
  form.elements.scope.addEventListener('change',ensureGroups);
  form.elements.type.addEventListener('change',()=>{form.elements.actionTab.value={GENERAL:'overview',HOMEWORK:'homework',EXAM:'exams',LECTURE:'lectures',ATTENDANCE:'attendance',PAYMENT:'payments'}[form.elements.type.value];});
  form.onsubmit=async event=>{
   event.preventDefault();if(pending)return;feedback(form,'');
   const values=Object.fromEntries(new FormData(form)),target={scope:values.scope};
   if(target.scope==='students')target.studentCodes=values.studentCodes.split(/[\s,،;]+/).filter(Boolean);
   if(target.scope==='group')target.scheduleId=values.scheduleId;if(target.scope==='grade')target.grade=values.grade;
   let payload;try{payload=window.TMAccountDomain.normalizeNotification({...values,expiresAt:values.expiresAt?new Date(values.expiresAt).getTime():null});}catch(error){feedback(form,error.message);return;}
   pending=true;const button=form.querySelector('[type=submit]');button.disabled=true;
   try{const result=await window.MFCloud.publishAccountNotificationAdmin({...payload,target,requestId:id});
    if(result.duplicate){await loadHistory(host,{refresh:true});}else{history.rows.unshift({...result,readAt:null});history.loaded=true;paintHistory(host);}
    id=requestId();form.reset();preview();notify('تم نشر الإشعار لحسابات الجمهور المحدد.');
   }catch(error){feedback(form,error?.message||'تعذر نشر الإشعار.');}finally{pending=false;button.disabled=false;}
  };preview();loadHistory(host);
 }
 function mount(section){
  const content=document.getElementById('adminContent');if(!content||!['curriculum','warnings'].includes(section))return;
  const id=section==='curriculum'?'learningTracksAdmin':'accountNotificationsAdmin';if(content.querySelector('#'+id))return;
  const details=document.createElement('details');details.className='card account-admin-tools';details.id=id;
  details.innerHTML='<summary>'+ (section==='curriculum'?'إدارة مسارات الموقع':'مركز إشعارات حسابات الطلاب')+'</summary><div class="account-admin-tool-body"></div>';content.prepend(details);
  let initialized=false;details.addEventListener('toggle',()=>{if(!details.open||initialized)return;initialized=true;const body=details.querySelector('.account-admin-tool-body');if(section==='curriculum')renderTracks(body);else notificationCenter(body);});
  if(section==='warnings'&&window.__tmOpenNotificationCenter){window.__tmOpenNotificationCenter=false;details.open=true;}
 }
 window.TMAccountAdmin={mount};
})();
