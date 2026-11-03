(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  let currentCode='';


  let currentStudent=null;
  const cache=new Map(),pending=new Map(),openUnits=new Map(),scopes=new Map(),epochs=new Map(),dirty=new Set();
  const model=()=>window.TMLearningProgress;
  function currentRows(){const data=cache.get(currentCode),student=data?.resources?{...currentStudent,materials:data.resources.materials||[]}:currentStudent;return model().rows(student,data);}
  function key(row){return row.sourceCollection+':'+row.id;}
  function linkedActivity(row,kind){
    const id=kind==='homework'?row.linkedAssignmentId:row.linkedExamId;
    return id?(cache.get(currentCode)?.resources?.[kind==='homework'?'assignments':'exams']||currentStudent?.[kind==='homework'?'assignments':'exams']||[]).find(item=>String(item.id)===String(id)):null;
  }
  function lectureCard(row){
    const value=model().percent(row),id=key(row),state=model().state(row),status=state==='completed'?'مكتملة':state==='started'?'قيد الدراسة':'جديدة';
    const resources=model().resources(row).sort((a,b)=>Number(b.kind==='file')-Number(a.kind==='file')),assignment=linkedActivity(row,'homework'),exam=linkedActivity(row,'exams');
    const links=resources.map(resource=>{const label=resource.kind==='file'?'فتح ملف الشرح'+(resource.label==='فتح PDF'?' PDF':''):resource.label==='فتح Drive'?'فتح رابط Google Drive':resource.label;
      return resource.secure?`<button class="small-btn" type="button" data-learning-source-file="${esc(id)}"><span data-icon="external-link"></span>${esc(label)}</button>`:`<a class="small-btn ${resource.kind==='link'?'learning-gold-action':''}" href="${esc(resource.url)}" target="_blank" rel="noopener noreferrer" data-dashboard-lecture="${esc(row.id)}" data-learning-open="${esc(id)}"><span data-icon="external-link"></span>${esc(label)}</a>`;}).join('');
    const activities=[assignment?`<button type="button" class="small-btn" data-learning-tab="homework" data-learning-activity="${esc(assignment.id)}"><span data-icon="file-text"></span>حل ${esc(assignment.title||'الواجب المرتبط')}</button>`:'',exam?`<button type="button" class="small-btn" data-learning-tab="exams" data-learning-activity="${esc(exam.id)}"><span data-icon="clipboard"></span>${esc(exam.title||'الاختبار المرتبط')}</button>`:''].join('');
    const banks=(cache.get(currentCode)?.resources?.questions||currentStudent?.questions||[]).filter(bank=>bank.sourceCollection==='question_banks'&&bank.lectureSource===row.sourceCollection&&String(bank.lectureId)===String(row.id));
    return `<article class="curriculum-lecture-card" data-learning-row="${esc(id)}"><header class="learning-card-meta"><span class="curriculum-lecture-number">${Number(row.lectureNumber||row.order||0)||'—'}</span><div><span class="badge">${model().category(row)==='practical'?'عملي':'نظري'}</span><span class="badge">${esc(row.grade||currentStudent?.grade||'كل المسارات')}</span><span class="badge">${esc(row.unitTitle)}</span>${row.lecture?`<span class="badge">${esc(row.lecture)}</span>`:''}${resources.some(r=>r.kind==='link')?`<span class="badge good">${resources.some(r=>r.label==='فتح Drive')?'رابط Drive':'رابط المحاضرة'}</span>`:''}<span class="badge ${state==='completed'?'good':state==='started'?'warn':''}">${status}</span></div></header><div class="curriculum-lecture-body"><h3>${esc(row.title||'محاضرة')}</h3><p>${esc(row.desc||row.description||(resources.some(r=>r.kind==='link')?'رابط المحاضرة متاح للفتح والمذاكرة.':''))}</p><div class="curriculum-progress" role="progressbar" aria-label="إنجاز المحاضرة" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"><span style="width:${value}%"></span></div><small class="learning-progress-label">تم إنجاز ${value}%</small></div><div class="curriculum-lecture-actions">${links}${row.sourceCollection==='lectures'?`<button class="small-btn" type="button" data-open-lecture="${esc(row.id)}"><span data-icon="book-open"></span>محتوى المحاضرة والمرفقات</button>`:!resources.length&&!row.content?'<p class="learning-missing-resource">لم يُضف ملف شرح أو رابط لهذه المحاضرة بعد.</p>':''}${activities}<button class="small-btn learning-gold-action" type="button" data-learning-complete="${esc(id)}" ${value>=100?'disabled':''}><span data-icon="user-check"></span>${value>=100?'تم إكمال المحاضرة':'تحديد كمكتملة'}</button></div>${row.content?`<details class="learning-written-content"><summary>المحتوى المكتوب</summary><div class="written-box">${esc(row.content)}</div></details>`:''}${banks.map(bank=>`<details class="learning-written-content"><summary>بنك الأسئلة — ${esc(bank.title)}</summary>${bank.content?`<div class="written-box">${esc(bank.content)}</div>`:''}${bank.filePath?`<button class="small-btn" type="button" data-learning-bank-file="${esc(bank.id)}">فتح PDF بنك الأسئلة</button>`:''}</details>`).join('')}</article>`;
  }
  function renderCurriculum(data){
    if(data)cache.set(currentCode,data);
    const result=document.querySelector('#studentResult [data-student-panel="lectures"]');if(!result||!model())return;
    const old=result.querySelector('#studentCurriculumPanel');
    old?.querySelectorAll('[data-learning-unit]').forEach(unit=>openUnits.set(currentCode+':'+unit.dataset.learningUnit,unit.open));
    const search=old?.querySelector('[data-learning-search]')?.value||'',filter=old?.querySelector('[data-learning-state]')?.value||'',kind=old?.querySelector('[data-learning-kind]')?.value||'',unitFilter=old?.querySelector('[data-learning-unit-filter]')?.value||'';
    
    const rows=currentRows(),byKey=new Map(rows.map(row=>[key(row),row])),total=model().summary(rows),next=model().next(rows),terms=[...new Set(['الترم الأول','الترم الثاني',...rows.map(r=>r.term)])],selectedTerm=old?.querySelector('[data-curriculum-term].active')?.dataset.curriculumTerm||terms[0];
    const markup=`<section id="studentCurriculumPanel" class="student-curriculum card" data-curriculum-ready="true" data-curriculum-loaded="${cache.has(currentCode)}" aria-labelledby="studentCurriculumTitle"><header class="curriculum-head"><div><span class="kicker">تعلّمك خطوة بخطوة</span><h2 id="studentCurriculumTitle">محاضرات العملي والنظري</h2><p>${total.completed} / ${total.total} مكتملة</p></div><div class="curriculum-total"><b>${total.percent}%</b><small>إنجاز المحاضرات المتاحة</small></div><button type="button" class="small-btn" data-curriculum-refresh>تحديث المحاضرات</button></header>${pending.has(currentCode)?'<p role="status">جاري استكمال تحميل المنهج…</p>':''}${next?`<button class="btn primary learning-continue" type="button" data-learning-continue="${esc(key(next))}">متابعة من آخر محاضرة <span>${esc(next.title)}</span></button>`:rows.length?'<p class="badge good">أكملت كل المحاضرات المتاحة</p>':''}<div class="curriculum-term-tabs" role="tablist">${terms.map(term=>`<button type="button" role="tab" data-curriculum-term="${esc(term)}" class="${term===selectedTerm?'active':''}" aria-selected="${term===selectedTerm}">${esc(term)}</button>`).join('')}</div><label class="learning-kind-filter">نوع المحاضرة<select data-learning-kind><option value="">العملي والنظري</option><option value="practical">عملي</option><option value="theory">نظري</option></select></label><div class="learning-filters"><label>الوحدة<select data-learning-unit-filter><option value="">كل الوحدات</option>${[...new Set(rows.map(r=>r.unitTitle))].map(title=>`<option value="${esc(title)}">${esc(title)}</option>`).join('')}</select></label><label>بحث المحاضرات<input type="search" data-learning-search placeholder="اسم المحاضرة أو الوحدة" value="${esc(search)}"></label><label>الحالة<select data-learning-state><option value="">كل الحالات</option><option value="new">لم تبدأ</option><option value="started">قيد الدراسة</option><option value="completed">مكتملة</option></select></label></div><div class="learning-units">${model().units(rows).map((unit,index)=>`<details class="learning-unit" data-learning-unit="${esc(unit.key)}" ${(openUnits.get(currentCode+':'+unit.key)??true)?'open':''}><summary><div><small>${esc(unit.term)} · ${unit.number?'الوحدة '+unit.number:'وحدة دراسية'}</small><h3>${esc(unit.title)}</h3></div><span><b data-learning-unit-count>${unit.total} محاضرة</b><small>${unit.completed} مكتملة · ${unit.percent}%</small></span></summary><div class="curriculum-progress"><span style="width:${unit.percent}%"></span></div><div class="learning-unit-rows">${unit.rows.map(lectureCard).join('')}</div></details>`).join('')||'<div class="portal-empty"><h3>لا توجد محاضرات متاحة حاليًا</h3><p>المحتوى يظهر حسب نشره والمسار والمجموعة وسياسة الوصول.</p></div>'}</div><p data-learning-empty hidden>لا توجد محاضرات مطابقة. غيّر البحث أو الحالة.</p><div data-curriculum-error>${cache.get(currentCode)?.resourcesError?'<p role="alert">تعذر استكمال روابط الواجب والاختبار وبنوك الأسئلة. المحاضرات المحملة متاحة؛ اضغط تحديث المحاضرات لإعادة المحاولة.</p>':''}</div></section>`;
    if(old)old.outerHTML=markup;else result.insertAdjacentHTML('beforeend',markup);
    const panel=result.querySelector('#studentCurriculumPanel');panel.querySelector('[data-learning-state]').value=filter;panel.querySelector('[data-learning-kind]').value=kind;panel.querySelector('[data-learning-unit-filter]').value=unitFilter;
    const apply=()=>{const query=panel.querySelector('[data-learning-search]').value.trim().toLowerCase(),state=panel.querySelector('[data-learning-state]').value;let visible=0;
      panel.querySelectorAll('[data-learning-row]').forEach(card=>{const row=byKey.get(card.dataset.learningRow),matches=(!panel.querySelector('[data-learning-kind]').value||model().category(row)===panel.querySelector('[data-learning-kind]').value)&&(!panel.querySelector('[data-learning-unit-filter]').value||row.unitTitle===panel.querySelector('[data-learning-unit-filter]').value)&&(!query||[row.title,row.unitTitle,row.lecture,row.desc,row.description].filter(Boolean).join(' ').toLowerCase().includes(query))&&row.term===panel.querySelector('[data-curriculum-term].active')?.dataset.curriculumTerm&&(!state||model().state(row)===state);card.hidden=!matches;if(matches)visible++;});
      panel.querySelectorAll('[data-learning-unit]').forEach(unit=>{const cards=[...unit.querySelectorAll('[data-learning-row]')],count=cards.filter(row=>!row.hidden).length;unit.hidden=!count;unit.querySelector('[data-learning-unit-count]').textContent=(count===cards.length?count:count+' من '+cards.length)+' محاضرة';});panel.querySelector('[data-learning-empty]').hidden=visible>0||!rows.length;
    };
    panel.querySelector('[data-curriculum-refresh]').onclick=()=>{cache.delete(currentCode);showCurriculum(currentCode);};
    panel.querySelector('[data-learning-unit-filter]').onchange=apply;panel.querySelector('[data-learning-kind]').onchange=apply;panel.querySelector('[data-learning-search]').oninput=apply;panel.querySelector('[data-learning-state]').onchange=apply;panel.querySelectorAll('[data-curriculum-term]').forEach(button=>button.onclick=()=>{panel.querySelectorAll('[data-curriculum-term]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-selected',String(b===button));});apply();});apply();
    panel.querySelectorAll('[data-open-lecture]').forEach(button=>button.onclick=()=>openLecture(button.dataset.openLecture));
    panel.querySelectorAll('[data-learning-source-file]').forEach(button=>button.onclick=()=>openSourceFile(byKey.get(button.dataset.learningSourceFile)));
    panel.querySelectorAll('[data-learning-open]').forEach(button=>button.addEventListener('click',()=>activate(byKey.get(button.dataset.learningOpen),false)));
    panel.querySelector('[data-learning-continue]')?.addEventListener('click',event=>activate(byKey.get(event.currentTarget.dataset.learningContinue),true));
    panel.querySelectorAll('[data-learning-complete]').forEach(button=>button.onclick=()=>saveProgress(byKey.get(button.dataset.learningComplete),100,button));
    panel.querySelectorAll('[data-learning-tab]').forEach(button=>button.onclick=()=>openLinkedActivity(button));
    panel.querySelectorAll('[data-learning-bank-file]').forEach(button=>button.onclick=()=>openSourceFile({sourceCollection:'question_banks',id:button.dataset.learningBankFile}));
    const overview=document.querySelector('.continue-learning-card');
    if(overview){const heading=overview.querySelector('h3'),description=overview.querySelector('p'),link=overview.querySelector('[data-continue-lecture]');if(heading)heading.textContent=next?.title||'أكملت كل المحاضرات المتاحة';if(description)description.textContent=total.completed+' من '+total.total+' محاضرة مكتملة';if(link){link.hidden=!next;if(next)link.dataset.continueLecture=next.id;}}
    window.hydrateIcons?.(panel);window.TMAccount?.refreshAlerts?.();
    const focus=sessionStorage.getItem('tm-theory-focus');if(focus){const row=rows.find(r=>String(r.id)===focus);if(row){sessionStorage.removeItem('tm-theory-focus');const card=[...panel.querySelectorAll('[data-learning-row]')].find(n=>n.dataset.learningRow===key(row));if(card){card.closest('details.learning-unit').open=true;card.scrollIntoView({block:'center'});}}}
  }
  async function saveProgress(row,value,button){
    if(!row)return;const requested=currentCode,requestedStudent=currentStudent;if(button){button.disabled=true;button.textContent='جارٍ الحفظ…';}
    try{
      const result=await window.MFCloud.recordLectureProgress(requested,row.id,value,row.sourceCollection);
      const source=row.sourceCollection==='materials'?(cache.get(requested)?.resources?.materials||requestedStudent?.materials||[]):(cache.get(requested)?.lectures||[]);
      const original=source.find(r=>String(r.id)===String(row.id));if(original){original.progress=Math.max(model().percent(original),Number(result.percent)||value);original.completed=original.progress>=100;original.viewed=true;original.lastOpenedAt=new Date().toISOString();}
      if(currentCode===requested){renderCurriculum();window.TMAccount?.refreshAlerts?.();}
      return true;
    }catch(error){window.toast?.(error?.message||'تعذر حفظ تقدم المحاضرة.');if(button){button.disabled=false;button.textContent='إعادة محاولة حفظ الإكمال';}return false;}
  }
  function activate(row,follow){
    if(!row)return;
    const url=model().resourceUrl(row);
    if(url){if(follow){[...document.querySelectorAll('[data-curriculum-term]')].find(n=>n.dataset.curriculumTerm===row.term)?.click();const card=[...document.querySelectorAll('[data-learning-row]')].find(n=>n.dataset.learningRow===key(row));card?.closest('details.learning-unit')?.setAttribute('open','');card?.querySelector('a[data-learning-open]')?.click();}else if(model().percent(row)<100)saveProgress(row,25);}
    else if(row.sourceCollection==='lectures')openLecture(row.id);
    else if(row.filePath)openSourceFile(row);
    else {const card=[...document.querySelectorAll('[data-learning-row]')].find(n=>n.dataset.learningRow===key(row));const details=card?.querySelector('details.learning-written-content');if(details)details.open=true;card?.scrollIntoView({block:'center'});if(model().percent(row)<100)saveProgress(row,25);}
  }
  function requireCurriculumFileUrl(value){
    const raw=String(value||''),runtime=window.TM_LOCAL_EMULATORS;
    if(window.TM_LOCAL_PREVIEW===true&&runtime?.projectId==='demo-technominds'&&['127.0.0.1','localhost'].includes(location.hostname)&&Number.isInteger(runtime.storage)&&runtime.storage>=1024&&runtime.storage<=65535&&!/[\u0000-\u0020\u007f]/.test(raw)){
      try{const url=new URL(raw);if(url.origin==='http://127.0.0.1:'+runtime.storage&&!url.username&&!url.password&&url.pathname.startsWith('/demo-technominds.appspot.com/'))return url.href;}catch(_){}
    }
    return requireHttpsFileUrl(value);
  }
  async function openSourceFile(row){
    const requested=currentCode,placeholder=window.open('about:blank','_blank');if(placeholder)placeholder.opener=null;
    try{const result=await window.MFCloud.getCurriculumFileUrl(requested,row.sourceCollection,row.id),url=requireCurriculumFileUrl(result.url);if(currentCode!==requested){placeholder?.close();return;}if(placeholder)placeholder.location.replace(url);else location.assign(url);if(['lectures','materials'].includes(row.sourceCollection)&&model().percent(row)<100)saveProgress(row,25);}
    catch(error){placeholder?.close();window.toast?.(error?.message||'تعذر فتح الملف.');}
  }
  function openLinkedActivity(button){
    const tab=button.dataset.learningTab,id=button.dataset.learningActivity;
    document.querySelector('[data-student-tab="'+tab+'"]')?.click();
    const panel=document.querySelector('[data-student-panel="'+tab+'"]');if(!panel||!id)return;
    let observer,timer;
    const focus=()=>{const target=[...panel.querySelectorAll(tab==='homework'?'[data-assignment-id]':'[data-exam-id]')].find(n=>(n.dataset.assignmentId||n.dataset.examId)===id);if(!target)return false;observer?.disconnect();clearTimeout(timer);const card=target.closest('.student-assignment-card,.exam-portal-card')||target;if(card.tagName==='DETAILS')card.open=true;card.scrollIntoView({block:'center'});card.setAttribute('tabindex','-1');card.focus({preventScroll:true});return true;};
    (window.requestAnimationFrame||((callback)=>callback()))(()=>{if(!focus()){observer=new MutationObserver(focus);observer.observe(panel,{childList:true,subtree:true});timer=setTimeout(()=>observer.disconnect(),10000);}});
  }
  function tabs(items){
    const definitions=[['materials','الشرح'],['practical','التطبيق العملي'],['assignments','الواجب'],['questions','بنك الأسئلة'],['exams','الاختبار القصير']].filter(([key])=>(items[key]||[]).length);
    if(!definitions.length)return '<p class="learning-extra-empty">لا توجد مرفقات إضافية لهذه المحاضرة. ملفات الشرح وDrive المتاحة تظهر مباشرة على كارت المحاضرة.</p>';
    return `<div class="lecture-tabs" role="tablist">${definitions.map((item,index)=>`<button type="button" role="tab" aria-selected="${index===0}" class="${index===0?'active':''}" data-lecture-tab="${item[0]}">${item[1]}</button>`).join('')}</div>${definitions.map((definition,index)=>`<section class="lecture-tab-panel ${index===0?'show':''}" data-lecture-panel="${definition[0]}">${renderItems(items[definition[0]],definition[0])}</section>`).join('')}`;
  }

  function renderItems(rows,kind){
    if(!rows.length)return '<div class="empty-state"><h3>لا يوجد محتوى في هذا القسم حاليًا</h3></div>';
    const collections={materials:'lecture_materials',assignments:'assignments_v2',questions:'bank_questions',exams:'monthly_exams'};
    return rows.map(row=>`<article class="lecture-content-item"><h3>${esc(row.title)}</h3><p>${esc(row.description||'')}</p>${row.content?`<div class="written-box">${esc(row.content)}</div>`:''}${row.filePath?`<button class="btn ghost small" type="button" data-content-file="${esc(row.sourceCollection||collections[kind])}:${esc(row.id)}">فتح الملف</button>`:''}</article>`).join('');
  }

  async function openLecture(id){
    const returnFocus=document.activeElement;
    document.getElementById('curriculumLectureModal')?.remove();
    document.body.insertAdjacentHTML('beforeend','<div class="curriculum-modal" id="curriculumLectureModal" role="dialog" aria-modal="true"><div class="card curriculum-modal-card"><button class="curriculum-modal-close" type="button" aria-label="إغلاق">×</button><div class="portal-loading" role="status"><span></span><b>جاري فتح المحاضرة...</b></div></div></div>');
    const modal=document.getElementById('curriculumLectureModal');
    const close=()=>{modal.remove();document.documentElement.classList.remove('lecture-dialog-open');const target=returnFocus?.isConnected?returnFocus:[...document.querySelectorAll('[data-open-lecture]')].find(n=>n.dataset.openLecture===id);target?.focus({preventScroll:true});};
    document.documentElement.classList.add('lecture-dialog-open');
    modal.querySelector('.curriculum-modal-close').onclick=close;modal.querySelector('button').focus();
    modal.addEventListener('click',event=>{if(event.target===modal)close();});
    modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){const controls=[...modal.querySelectorAll('button,a[href],input,select,textarea')].filter(el=>!el.disabled&&(!el.closest('.lecture-tab-panel')||el.closest('.lecture-tab-panel').classList.contains('show'))),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
    try{
      const data=await window.MFCloud.getLectureContent(currentCode,id);if(!modal.isConnected)return;
      const empty=!['materials','practical','assignments','questions','exams'].some(key=>(data[key]||[]).length);modal.classList.toggle('lecture-empty-dialog',empty);modal.querySelector('.curriculum-modal-card').dataset.lectureEmpty=String(empty);
      modal.querySelector('.curriculum-modal-card').innerHTML=`<button class="curriculum-modal-close" type="button" aria-label="إغلاق">×</button><header><small>المحاضرة ${Number(data.lecture.lectureNumber||0)}</small><h2>${esc(data.lecture.title)}</h2><p>${esc(data.lecture.description||'')}</p></header>${model().resourceUrl({linkUrl:data.lecture.linkUrl})?`<a class="btn primary small" href="${esc(model().resourceUrl({linkUrl:data.lecture.linkUrl}))}" target="_blank" rel="noopener noreferrer">فتح Drive</a>`:''}${data.lecture.hasFile?'<button class="btn ghost small" type="button" data-content-file="lectures:'+esc(id)+'">فتح ملف المحاضرة</button>':''}${tabs(data)}<footer><button class="btn primary" type="button" data-complete-lecture>تحديد كمكتملة</button></footer>`;
      modal.querySelector('.curriculum-modal-close').onclick=close;modal.querySelector('button').focus();
      modal.querySelectorAll('[data-lecture-tab]').forEach(button=>button.addEventListener('click',()=>{modal.querySelectorAll('[data-lecture-tab]').forEach(item=>(item.classList.toggle('active',item===button),item.setAttribute('aria-selected',String(item===button))));modal.querySelectorAll('[data-lecture-panel]').forEach(panel=>panel.classList.toggle('show',panel.dataset.lecturePanel===button.dataset.lectureTab));}));
      modal.querySelector('[data-complete-lecture]').onclick=async event=>{const button=event.currentTarget,row=currentRows().find(r=>r.sourceCollection==='lectures'&&r.id===id);const saving=saveProgress(row,100,button);modal.querySelector('.curriculum-modal-close')?.focus({preventScroll:true});if(await saving){button.textContent='سجلت إكمال المحاضرة';button.disabled=true;}};
      modal.querySelectorAll('[data-content-file]').forEach(button=>button.addEventListener('click',async()=>{const [collection,entityId]=button.dataset.contentFile.split(':'),placeholder=window.open('about:blank','_blank');button.disabled=true;button.classList.add('is-loading');try{const file=await window.MFCloud.getCurriculumFileUrl(currentCode,collection,entityId);const url=requireCurriculumFileUrl(file.url);if(placeholder){placeholder.opener=null;placeholder.location.replace(url);}else location.assign(url);}catch(error){placeholder?.close();window.toast?.(error?.message||'تعذر فتح الملف.');}finally{button.disabled=false;button.classList.remove('is-loading');}}));
      const row=currentRows().find(r=>r.sourceCollection==='lectures'&&r.id===id);if(row&&model().percent(row)<100)saveProgress(row,10);
    }catch(error){if(!modal.isConnected)return;modal.querySelector('.curriculum-modal-card').innerHTML=`<button class="curriculum-modal-close" type="button">×</button><div class="empty-state"><h3>تعذر فتح المحاضرة</h3><p>${esc(error?.message||'حاول مرة أخرى.')}</p></div>`;modal.querySelector('button').onclick=close;modal.querySelector('button').focus();}
  }



  function setStudent(value){
    const code=String(typeof value==='object'?value.studentCode:value);
    if(currentCode!==code){currentCode=code;document.getElementById('curriculumLectureModal')?.remove();document.documentElement.classList.remove('lecture-dialog-open');}
    if(typeof value==='object'){
      const scope=JSON.stringify([value.grade,value.group,value.scheduleId,value.academicYear,value.term,value.contentAccessMode,value.acceptedAt,value.enrolledAt,value.createdAt]);
      if(scopes.has(code)&&scopes.get(code)!==scope){cache.delete(code);pending.delete(code);epochs.set(code,(epochs.get(code)||0)+1);}
      scopes.set(code,scope);if(currentStudent!==value)dirty.add(code);currentStudent=value;
    }else if(currentStudent?.studentCode!==code)currentStudent={studentCode:code,materials:[]};
  }
  async function showCurriculum(code){
    setStudent(code);
    const panel=document.querySelector('#studentResult [data-student-panel="lectures"].show');if(!panel)return;
    if(cache.has(currentCode)){if(!panel.querySelector('#studentCurriculumPanel[data-curriculum-loaded="true"]')||sessionStorage.getItem('tm-theory-focus')||dirty.has(currentCode)){dirty.delete(currentCode);renderCurriculum();}return;}
    const requested=currentCode,epoch=epochs.get(currentCode)||0;
    if(!pending.has(requested)){const legacyNeeded=(currentStudent?.materials||[]).length>0&&typeof window.MFCloud.getStudentResources==='function';const promise=Promise.all([window.MFCloud.getStudentCurriculum(requested),legacyNeeded?window.MFCloud.getStudentResources(requested).then(resources=>({resources})).catch(()=>({resourcesError:true})):Promise.resolve({})]).then(([data,legacy])=>({...data,...legacy})).finally(()=>{if(pending.get(requested)===promise)pending.delete(requested);});pending.set(requested,promise);}
    renderCurriculum();
    try{const data=await pending.get(requested);if((epochs.get(requested)||0)!==epoch)return;cache.set(requested,data);dirty.delete(requested);if(currentCode===requested&&document.querySelector('#studentResult [data-student-panel="lectures"].show'))renderCurriculum(data);}
    catch(error){if(currentCode!==requested)return;renderCurriculum();const target=panel.querySelector('[data-curriculum-error]');if(target){target.innerHTML='<p role="alert"></p><button class="btn ghost" type="button">إعادة تحميل المنهج</button>';target.querySelector('p').textContent=error?.message||'تعذر استكمال المنهج. المحاضرات المحملة ما زالت متاحة.';target.querySelector('button').onclick=()=>showCurriculum(requested);}}
  }
  document.addEventListener('technominds:student-tab',event=>{if(event.detail?.key==='lectures')showCurriculum(event.detail.code);});
  window.TMStudentCurriculum={setStudent,show:showCurriculum,getLoaded:()=>cache.get(currentCode)};
})();



