(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  let currentCode='';

  function stateFor(lecture){
    if(lecture.progress>=100)return ['تمت المشاهدة','good'];
    if(lecture.viewed)return ['قيد الدراسة','warn'];
    return ['متاحة','good'];
  }

  function lectureCard(item){
    const [label,tone]=stateFor(item);
    return `<article class="curriculum-lecture-card">
      <div class="curriculum-lecture-number">${Number(item.lectureNumber||item.order||0)}</div>
      <div class="curriculum-lecture-body"><small>${esc(item.unitTitle||'محاضرة')}</small><h3>${esc(item.title)}</h3><p>${esc(item.description||'')}</p>
      <div class="curriculum-progress"><span style="width:${Math.max(0,Math.min(100,Number(item.progress||0)))}%"></span></div></div>
      <div class="curriculum-lecture-actions"><span class="badge ${tone}">${label}</span><button class="btn primary small" type="button" data-open-lecture="${esc(item.id)}">فتح المحاضرة</button></div>
    </article>`;
  }

  function renderCurriculum(data){
    const result=document.getElementById('studentResult');if(!result)return;
    result.querySelector('#studentCurriculumPanel')?.remove();
    const units=new Map((data.units||[]).map(unit=>[unit.id,unit]));
    const lectures=(data.lectures||[]).map(item=>({...item,unitTitle:units.get(item.unitId)?.title||''}));
    const terms=[...new Set(['الترم الأول','الترم الثاني',...lectures.map(item=>item.term).filter(Boolean)])];
    if(!lectures.length)return;
    const html=`<section id="studentCurriculumPanel" class="student-curriculum card" aria-labelledby="studentCurriculumTitle">
      <header class="curriculum-head"><div><span class="kicker">منهجي</span><h2 id="studentCurriculumTitle">منهج ${esc(data.student?.grade||'الطالب')}</h2><p>المحاضرات مرتبة من 1 إلى 36 حسب رقم المحاضرة.</p></div><div class="curriculum-total"><b>${Number(data.overallProgress||0)}%</b><small>إنجاز المنهج</small></div></header>
      <div class="curriculum-term-tabs" role="tablist">${terms.map((term,index)=>`<button type="button" role="tab" class="${index===0?'active':''}" data-curriculum-term="${esc(term)}">${esc(term)}</button>`).join('')}</div>
      ${terms.map((term,index)=>`<div class="curriculum-term-panel ${index===0?'show':''}" data-term-panel="${esc(term)}">${lectures.filter(item=>item.term===term||(!item.term&&index===0)).sort((a,b)=>Number(a.lectureNumber)-Number(b.lectureNumber)).map(lectureCard).join('')||'<div class="empty-state"><h3>لا توجد محاضرات منشورة في هذا الترم</h3></div>'}</div>`).join('')}
    </section>`;
    result.insertAdjacentHTML('beforeend',html);
    result.querySelectorAll('[data-curriculum-term]').forEach(button=>button.addEventListener('click',()=>{
      result.querySelectorAll('[data-curriculum-term]').forEach(item=>item.classList.toggle('active',item===button));
      result.querySelectorAll('[data-term-panel]').forEach(panel=>panel.classList.toggle('show',panel.dataset.termPanel===button.dataset.curriculumTerm));
    }));
    result.querySelectorAll('[data-open-lecture]').forEach(button=>button.addEventListener('click',()=>openLecture(button.dataset.openLecture)));
  }

  function tabs(items){
    const definitions=[['materials','الشرح'],['practical','التطبيق العملي'],['assignments','الواجب'],['questions','بنك الأسئلة'],['exams','الاختبار القصير']];
    return `<div class="lecture-tabs" role="tablist">${definitions.map((item,index)=>`<button type="button" class="${index===0?'active':''}" data-lecture-tab="${item[0]}">${item[1]}</button>`).join('')}</div>
      ${definitions.map((definition,index)=>`<section class="lecture-tab-panel ${index===0?'show':''}" data-lecture-panel="${definition[0]}">${renderItems(items[definition[0]]||[],definition[0])}</section>`).join('')}`;
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
    const close=()=>{modal.remove();document.documentElement.classList.remove('lecture-dialog-open');if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});};
    document.documentElement.classList.add('lecture-dialog-open');
    modal.querySelector('.curriculum-modal-close').onclick=close;modal.querySelector('button').focus();
    modal.addEventListener('click',event=>{if(event.target===modal)close();});
    modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){const controls=[...modal.querySelectorAll('button,a[href],input,select,textarea')].filter(el=>!el.disabled&&(!el.closest('.lecture-tab-panel')||el.closest('.lecture-tab-panel').classList.contains('show'))),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
    try{
      const data=await window.MFCloud.getLectureContent(currentCode,id);if(!modal.isConnected)return;
      modal.querySelector('.curriculum-modal-card').innerHTML=`<button class="curriculum-modal-close" type="button" aria-label="إغلاق">×</button><header><small>المحاضرة ${Number(data.lecture.lectureNumber||0)}</small><h2>${esc(data.lecture.title)}</h2><p>${esc(data.lecture.description||'')}</p></header>${tabs(data)}<footer><button class="btn primary" type="button" data-complete-lecture>تحديد كمكتملة</button></footer>`;
      modal.querySelector('.curriculum-modal-close').onclick=close;modal.querySelector('button').focus();
      modal.querySelectorAll('[data-lecture-tab]').forEach(button=>button.addEventListener('click',()=>{modal.querySelectorAll('[data-lecture-tab]').forEach(item=>item.classList.toggle('active',item===button));modal.querySelectorAll('[data-lecture-panel]').forEach(panel=>panel.classList.toggle('show',panel.dataset.lecturePanel===button.dataset.lectureTab));}));
      modal.querySelector('[data-complete-lecture]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='جارٍ الحفظ…';try{await window.MFCloud.recordLectureProgress(currentCode,id,100);button.textContent='سجلت إكمال المحاضرة';}catch(error){button.disabled=false;button.textContent='إعادة محاولة حفظ الإكمال';window.toast?.(error?.message||'تعذر حفظ التقدم.');}};
      modal.querySelectorAll('[data-content-file]').forEach(button=>button.addEventListener('click',async()=>{const [collection,entityId]=button.dataset.contentFile.split(':'),placeholder=window.open('about:blank','_blank');button.disabled=true;button.classList.add('is-loading');try{const file=await window.MFCloud.getCurriculumFileUrl(currentCode,collection,entityId);if(placeholder){placeholder.opener=null;placeholder.location.replace(file.url);}else location.assign(file.url);}catch(error){placeholder?.close();window.toast?.(error?.message||'تعذر فتح الملف.');}finally{button.disabled=false;button.classList.remove('is-loading');}}));
      window.MFCloud.recordLectureProgress(currentCode,id,10).catch(()=>window.toast?.('فُتحت المحاضرة، وتعذر حفظ سجل الفتح.'));
    }catch(error){if(!modal.isConnected)return;modal.querySelector('.curriculum-modal-card').innerHTML=`<button class="curriculum-modal-close" type="button">×</button><div class="empty-state"><h3>تعذر فتح المحاضرة</h3><p>${esc(error?.message||'حاول مرة أخرى.')}</p></div>`;modal.querySelector('button').onclick=close;modal.querySelector('button').focus();}
  }

  document.addEventListener('technominds:student-loaded',async event=>{
    currentCode=event.detail.code;
    const result=document.getElementById('studentResult');
    result?.insertAdjacentHTML('beforeend','<section id="studentCurriculumPanel" class="student-curriculum card"><div class="skeleton" style="height:96px"></div></section>');
    try{renderCurriculum(await window.MFCloud.getStudentCurriculum(currentCode));}
    catch(error){const panel=document.getElementById('studentCurriculumPanel');if(panel)panel.innerHTML=`<div class="empty-state"><h3>المنهج غير متاح الآن</h3><p>${esc(error?.message||'حاول مرة أخرى لاحقًا.')}</p></div>`;}
  });
})();
