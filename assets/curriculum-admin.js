(function(){
  'use strict';
  const safe=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const sections=[
    ['lectures','المحاضرات'],['assignments_v2','الواجبات'],['question_banks','بنوك الأسئلة'],
    ['bank_questions','الأسئلة'],['lecture_materials','التطبيقات والملفات'],['monthly_exams','الامتحانات الشهرية'],['teacher_files','ملفات المدرس']
  ];
  let active='lectures',rows=[],cursor=null,hasMore=false,editing=null;

  const gradeOptions='<option value="">اختر الصف</option><option>أولى ثانوي برمجة</option><option>تانية ثانوي بكالوريا</option>';
  const termOptions='<option value="">اختر الترم</option><option>الترم الأول</option><option>الترم الثاني</option>';

  function shell(){
    return `<div class="section-head"><div><span class="kicker">Curriculum V61</span><h2>إدارة المحتوى التعليمي</h2><p class="section-desc">الصف ← الترم ← الوحدة ← المحاضرة ← عناصر المحاضرة</p></div><button class="btn primary" type="button" data-new-content>إضافة محتوى</button></div>
    <div class="curriculum-admin-tabs">${sections.map(item=>`<button type="button" class="${item[0]===active?'active':''}" data-content-section="${item[0]}">${item[1]} <small data-section-count="${item[0]}"></small></button>`).join('')}</div>
    <div class="card curriculum-admin-toolbar"><input type="search" id="curriculumSearch" placeholder="بحث بالعنوان" aria-label="بحث بالعنوان"><select id="curriculumGradeFilter" aria-label="فلترة حسب الصف">${gradeOptions}<option value="all">كل الصفوف</option></select><select id="curriculumTermFilter" aria-label="فلترة حسب الترم">${termOptions}<option value="all">كل الترمات</option></select><select id="curriculumDirection" aria-label="الترتيب"><option value="asc">تصاعدي</option><option value="desc">تنازلي</option></select><button class="btn ghost" type="button" data-apply-filter>تطبيق</button></div>
    <div id="curriculumAdminList"><div class="skeleton" style="height:240px"></div></div>
    <div class="pagination-actions"><button class="btn ghost" type="button" data-load-more hidden>تحميل المزيد</button></div>
    <section class="card curriculum-import"><h3>استيراد ملفات المنهج</h3><p>ارفع عدة ملفات PDF أو Word أو صور بحد أقصى 15MB للملف. يتم استخراج رقم المحاضرة من اسم الملف ويمكن مراجعة البيانات قبل الحفظ.</p><div class="grid three"><select id="importGrade">${gradeOptions}</select><select id="importTerm">${termOptions}</select><input id="importUnit" placeholder="اسم/معرّف الوحدة"></div><label class="btn ghost file-button">اختيار الملفات<input id="curriculumBulkFiles" type="file" multiple accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp" hidden></label><div id="curriculumImportPreview"></div></section>
    <section class="card curriculum-migration"><h3>خطة الامتحانات الشهرية</h3><p>إنشاء 12 امتحانًا كمسودات، كل امتحان يغطي 3 محاضرات، دون إنشاء أسئلة وهمية.</p><div class="grid three"><select id="examPlanGrade">${gradeOptions}</select><input id="examPlanYear" placeholder="العام الدراسي"><button class="btn primary" type="button" data-create-exam-plan>إنشاء الخطة</button></div></section>
    <section class="card curriculum-migration"><h3>ترحيل المحتوى القديم</h3><p>الفحص التجريبي لا يكتب أو يحذف أي بيانات. التنفيذ قابل للإعادة ويمنع التكرار.</p><button class="btn ghost" type="button" data-migration-dry>فحص Dry Run</button><button class="btn primary" type="button" data-migration-apply>تنفيذ الترحيل</button><pre id="curriculumMigrationResult" aria-live="polite"></pre></section>`;
  }

  function list(){
    const query=(document.getElementById('curriculumSearch')?.value||'').trim().toLowerCase();
    const filtered=rows.filter(item=>!query||String(item.title||'').toLowerCase().includes(query));
    const box=document.getElementById('curriculumAdminList');if(!box)return;
    box.innerHTML=filtered.length?`<div class="curriculum-admin-list">${filtered.map(item=>`<article class="curriculum-admin-row"><div><small>${safe(item.grade||'')} · ${safe(item.term||'')} · رقم ${Number(item.lectureNumber||item.order||0)}</small><h3>${safe(item.title)}</h3><p>${safe(item.description||'')}</p></div><span class="badge ${item.status==='published'?'good':item.status==='hidden'?'danger':'warn'}">${item.status==='published'?'منشور':item.status==='hidden'?'مخفي':'مسودة'}</span><div class="mobile-actions"><button class="small-btn" type="button" data-edit-content="${safe(item.id)}">تعديل</button><button class="small-btn" type="button" data-copy-content="${safe(item.id)}">نسخ</button><button class="small-btn danger" type="button" data-delete-content="${safe(item.id)}">حذف</button></div></article>`).join('')}</div>`:'<div class="empty-state"><h3>لا يوجد محتوى مطابق</h3><p>ابدأ بإضافة أول عنصر أو غيّر الفلاتر.</p></div>';
    bindRows();
  }

  async function load(append=false){
    const box=document.getElementById('curriculumAdminList');if(!append&&box)box.innerHTML='<div class="skeleton" style="height:240px"></div>';
    try{
      const grade=document.getElementById('curriculumGradeFilter')?.value;
      const term=document.getElementById('curriculumTermFilter')?.value;
      const result=await window.MFCloud.listCurriculumAdmin({collection:active,pageSize:20,cursor:append?cursor:null,direction:document.getElementById('curriculumDirection')?.value||'asc',grade:grade&&grade!=='all'?grade:'',term:term&&term!=='all'?term:''});
      rows=append?[...rows,...result.rows]:result.rows;cursor=result.nextCursor;hasMore=result.hasMore;list();
      const more=document.querySelector('[data-load-more]');if(more)more.hidden=!hasMore;
    }catch(error){if(box)box.innerHTML=`<div class="empty-state"><h3>تعذر تحميل المحتوى</h3><p>${safe(error?.message||'انشر Functions والفهارس الجديدة أولًا.')}</p></div>`;}
  }

  function modal(item={}){
    editing=item.id||null;
    document.getElementById('curriculumEditorModal')?.remove();
    const isQuestion=['bank_questions','assignment_questions','exam_questions_v2'].includes(active);
    document.body.insertAdjacentHTML('beforeend',`<div class="curriculum-modal" id="curriculumEditorModal" role="dialog" aria-modal="true" aria-labelledby="curriculumEditorTitle"><form class="card curriculum-editor" id="curriculumEditorForm"><button class="curriculum-modal-close" type="button" aria-label="إغلاق">×</button><h2 id="curriculumEditorTitle">${editing?'تعديل':'إضافة'} ${safe(sections.find(section=>section[0]===active)?.[1]||'محتوى')}</h2>
      <div class="grid three"><label class="field"><span>الصف</span><select name="grade" required>${gradeOptions}</select></label><label class="field"><span>الترم</span><select name="term" required>${termOptions}</select></label><label class="field"><span>الوحدة</span><input name="unitId" required></label></div>
      <div class="grid three"><label class="field"><span>رقم المحاضرة</span><input name="lectureNumber" type="number" min="1" max="36" required></label><label class="field"><span>معرّف المحاضرة</span><input name="lectureId"></label><label class="field"><span>الترتيب</span><input name="order" type="number" min="0"></label></div>
      <label class="field"><span>العنوان</span><input name="title" maxlength="220" required></label><label class="field"><span>الوصف</span><textarea name="description" rows="3"></textarea></label><label class="field"><span>أهداف التعلم — هدف في كل سطر</span><textarea name="learningObjectives" rows="4"></textarea></label>
      ${isQuestion?`<div class="grid three"><label class="field"><span>نوع السؤال</span><select name="questionType"><option value="mcq">اختيار من متعدد</option><option value="true_false">صح وخطأ</option><option value="complete">أكمل</option><option value="concept">مفاهيم</option><option value="trace_code">توقع ناتج الكود</option><option value="debug">اكتشاف الخطأ</option><option value="order_code">ترتيب الكود</option><option value="program">كتابة برنامج</option><option value="essay">مقالي</option></select></label><label class="field"><span>الصعوبة</span><select name="difficulty"><option>سهل</option><option>متوسط</option><option>متقدم</option></select></label><label class="field"><span>الدرجة</span><input name="points" type="number" min="0"></label></div><label class="field"><span>الاختيارات — اختيار في كل سطر</span><textarea name="choices"></textarea></label><label class="field"><span>الإجابة الصحيحة</span><textarea name="correctAnswer"></textarea></label><label class="field"><span>شرح الإجابة</span><textarea name="answerExplanation"></textarea></label>`:''}
      <div class="grid three"><label class="field"><span>تاريخ الفتح</span><input name="openAt" type="datetime-local"></label><label class="field"><span>تاريخ الإغلاق</span><input name="closeAt" type="datetime-local"></label><label class="field"><span>الحالة</span><select name="status"><option value="draft">مسودة</option><option value="published">منشور</option><option value="hidden">مخفي</option></select></label></div>
      <label class="field"><span>ملف اختياري (PDF / Word / صورة، 15MB)</span><input name="file" type="file" accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp"></label><label class="check"><input name="allowDownload" type="checkbox"> السماح بالتحميل</label>
      <div class="mobile-actions"><button class="btn primary" type="submit">حفظ</button><button class="btn ghost" type="button" data-cancel-editor>إلغاء</button></div></form></div>`);
    const form=document.getElementById('curriculumEditorForm');
    Object.entries(item).forEach(([key,value])=>{const field=form.elements[key];if(!field)return;if(field.type==='checkbox')field.checked=value===true;else if(key==='learningObjectives'&&Array.isArray(value))field.value=value.join('\n');else if(key==='choices'&&Array.isArray(value))field.value=value.join('\n');else if(!value?.toDate)field.value=value??'';});
    form.querySelector('.curriculum-modal-close').onclick=()=>form.closest('.curriculum-modal').remove();form.querySelector('[data-cancel-editor]').onclick=()=>form.closest('.curriculum-modal').remove();form.onsubmit=save;
  }

  async function save(event){
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;
    try{
      const data=Object.fromEntries(new FormData(form).entries()),file=form.elements.file.files[0];delete data.file;
      data.allowDownload=form.elements.allowDownload.checked;data.learningObjectives=String(data.learningObjectives||'').split('\n').filter(Boolean);if(data.choices)data.choices=String(data.choices).split('\n').filter(Boolean);
      if(file){if(file.size>15*1024*1024)throw new Error('حجم الملف أكبر من 15MB.');const upload=await window.MFCloud.uploadAttachment(file,active==='teacher_files'?'teacher-files':`curriculum/${data.grade}/${active}`);data.filePath=upload.path;data.fileName=file.name;data.contentType=file.type;}
      await window.MFCloud.upsertCurriculumEntity({collection:active,id:editing||undefined,data});form.closest('.curriculum-modal').remove();if(typeof aToast==='function')aToast('تم حفظ المحتوى');await load();
    }catch(error){if(typeof aToast==='function')aToast(error?.message||'تعذر حفظ المحتوى');}finally{button.disabled=false;}
  }

  function confirmDelete(item){
    document.getElementById('curriculumConfirmModal')?.remove();document.body.insertAdjacentHTML('beforeend',`<div class="curriculum-modal" id="curriculumConfirmModal" role="dialog" aria-modal="true"><div class="card confirm-card"><h2>حذف المحتوى؟</h2><p>سيتم حذف «${safe(item.title)}». لا يؤثر ذلك في البيانات القديمة.</p><div class="mobile-actions"><button class="btn danger" data-confirm-delete>حذف</button><button class="btn ghost" data-cancel-delete>إلغاء</button></div></div></div>`);const modal=document.getElementById('curriculumConfirmModal');modal.querySelector('[data-cancel-delete]').onclick=()=>modal.remove();modal.querySelector('[data-confirm-delete]').onclick=async event=>{event.currentTarget.disabled=true;await window.MFCloud.deleteCurriculumEntity(active,item.id);modal.remove();await load();};
  }

  function bindRows(){
    document.querySelectorAll('[data-edit-content]').forEach(button=>button.onclick=()=>modal(rows.find(item=>item.id===button.dataset.editContent)||{}));
    document.querySelectorAll('[data-copy-content]').forEach(button=>button.onclick=()=>{const item={...(rows.find(row=>row.id===button.dataset.copyContent)||{})};delete item.id;item.title=`نسخة من ${item.title||''}`;item.status='draft';modal(item);});
    document.querySelectorAll('[data-delete-content]').forEach(button=>button.onclick=()=>confirmDelete(rows.find(item=>item.id===button.dataset.deleteContent)||{}));
  }

  function previewFiles(files){
    const box=document.getElementById('curriculumImportPreview');if(!box)return;const list=[...files];box.innerHTML=list.map((file,index)=>{const number=Number(file.name.match(/(?:lecture|lec|محاضرة|l)[-_ ]?(\d{1,2})/i)?.[1]||file.name.match(/\b(\d{1,2})\b/)?.[1]||0);return `<div class="import-preview-row" data-import-index="${index}"><span>${safe(file.name)}</span><input value="${safe(file.name.replace(/\.[^.]+$/,''))}" aria-label="العنوان"><input type="number" min="1" max="36" value="${number||''}" placeholder="رقم المحاضرة" aria-label="رقم المحاضرة"><button class="small-btn primary" type="button">رفع</button><small>${(file.size/1024/1024).toFixed(2)} MB</small></div>`;}).join('');box.querySelectorAll('.import-preview-row').forEach(row=>row.querySelector('button').onclick=async()=>{const file=list[Number(row.dataset.importIndex)],button=row.querySelector('button');if(file.size>15*1024*1024){button.textContent='أكبر من 15MB';button.classList.add('danger');return;}const grade=document.getElementById('importGrade').value,term=document.getElementById('importTerm').value,unitId=document.getElementById('importUnit').value,lectureNumber=row.querySelector('input[type="number"]').value,title=row.querySelector('input:not([type="number"])').value;if(!grade||!term||!unitId||!lectureNumber){if(typeof aToast==='function')aToast('أكمل الصف والترم والوحدة ورقم المحاضرة');return;}button.disabled=true;button.textContent='جارٍ الرفع';try{const uploaded=await window.MFCloud.uploadAttachment(file,`curriculum/${grade}/${active}`);await window.MFCloud.upsertCurriculumEntity({collection:active,data:{grade,term,unitId,lectureId:`lecture-${lectureNumber}`,lectureNumber,order:lectureNumber,title,status:'draft',filePath:uploaded.path,fileName:file.name,contentType:file.type}});button.textContent='نجح';button.classList.add('good');}catch(error){button.textContent='فشل';button.classList.add('danger');}finally{button.disabled=false;}});}

  async function migration(apply){const output=document.getElementById('curriculumMigrationResult');output.textContent='جاري الفحص...';try{const result=await window.MFCloud.migrateCurriculumV61(apply);output.textContent=JSON.stringify(result,null,2);}catch(error){output.textContent=error?.message||'تعذر تشغيل الترحيل';}}

  window.renderCurriculumAdmin=function(){
    if(typeof content!=='function')return;content(shell());
    document.querySelectorAll('[data-content-section]').forEach(button=>button.onclick=()=>{active=button.dataset.contentSection;rows=[];cursor=null;window.renderCurriculumAdmin();});
    document.querySelector('[data-new-content]').onclick=()=>modal();document.querySelector('[data-apply-filter]').onclick=()=>load();document.getElementById('curriculumSearch').oninput=list;document.querySelector('[data-load-more]').onclick=()=>load(true);document.getElementById('curriculumBulkFiles').onchange=event=>previewFiles(event.target.files);document.querySelector('[data-migration-dry]').onclick=()=>migration(false);document.querySelector('[data-migration-apply]').onclick=()=>migration(true);document.querySelector('[data-create-exam-plan]').onclick=async event=>{const grade=document.getElementById('examPlanGrade').value,year=document.getElementById('examPlanYear').value;if(!grade){if(typeof aToast==='function')aToast('اختر الصف');return;}event.currentTarget.disabled=true;try{const result=await window.MFCloud.createMonthlyExamPlan(grade,year);if(typeof aToast==='function')aToast(`تم إنشاء ${result.created} وتخطي ${result.skipped}`);}finally{event.currentTarget.disabled=false;}};load();
  };
})();
