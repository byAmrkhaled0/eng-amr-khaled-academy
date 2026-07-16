(function(){
  'use strict';

  const empty=message=>`<div class="admin-workflow-empty"><span data-icon="clipboard"></span><p>${safe(message)}</p></div>`;
  const grades=()=>`<option>كل المسارات</option>${GRADES.map(grade=>`<option>${safe(grade)}</option>`).join('')}`;
  const nowContext=()=>typeof currentAcademicContext==='function'?currentAcademicContext():{academicYear:adminData.settings?.academicYear||'',term:adminData.settings?.term||'الترم الأول'};
  const fileLimit=15*1024*1024;
  const typeLabel=type=>({mcq:'اختياري',code:'كود برمجي',text:'إجابة كتابية',file:'ملف للتحميل'})[type]||'واجب';

  async function uploadTeacherFile(file,acceptPdfOnly=false){
    if(!file)return null;
    if(file.size>fileLimit)throw new Error('حجم الملف أكبر من 15MB');
    if(acceptPdfOnly&&file.type!=='application/pdf'&&!String(file.name||'').toLowerCase().endsWith('.pdf'))throw new Error('اختر ملف PDF صحيحًا');
    if(!window.MFCloud?.uploadAttachment)throw new Error('خدمة رفع الملفات غير متاحة');
    const uploaded=await window.MFCloud.uploadAttachment(file,'teacher-uploads');
    if(!uploaded?.url)throw new Error('لم يتم تأكيد رفع الملف');
    return uploaded;
  }

  function examStatus(exam){
    if(exam.active===false)return ['متوقف','danger'];
    const now=Date.now(),open=exam.openAt?new Date(exam.openAt).getTime():0,close=exam.closeAt?new Date(exam.closeAt).getTime():0;
    if(open&&now<open)return ['لم يفتح بعد','warn'];
    if(close&&now>close)return ['مغلق','danger'];
    return ['متاح','good'];
  }

  function renderExamsV6061(){
    fresh();
    const attempts=(adminData.examAttempts||[]).slice().reverse();
    const pending=attempts.filter(row=>row.needsManualReview||row.status==='pending_manual');
    const gradeRows=typeof examGradeRows==='function'?examGradeRows():[];
    const ctx=nowContext();
    window.__adminExamGradeRows=gradeRows;
    const examCards=(adminData.exams||[]).slice().reverse().map(exam=>{const [label,badge]=examStatus(exam);return `<article class="admin-exam-card"><div class="admin-exam-card-head"><span class="iconbox" data-icon="clipboard"></span><span class="badge ${badge}">${label}</span></div><h3>${safe(exam.title)}</h3><p>${safe(exam.grade||'كل المسارات')} · ${safe(exam.duration||20)} دقيقة</p><div class="admin-exam-meta"><span>${safe(exam.questionCount||0)} سؤال</span><span>${safe(exam.academicYear||ctx.academicYear||'-')}</span></div><div class="admin-exam-actions">${exam.pdfUrl?`<a class="small-btn" href="${safe(exam.pdfUrl)}" target="_blank" rel="noopener noreferrer">PDF</a>`:''}<button class="small-btn danger" type="button" onclick="deleteItem('exams','${safe(exam.id)}')">حذف</button></div></article>`;}).join('');
    content(`<div class="section-head compact-admin-head"><div><span class="kicker"><span data-icon="clipboard"></span> الاختبارات</span><h2 class="section-title">إدارة الاختبارات</h2><p class="section-desc">إنشاء الامتحان، متابعة المحاولات، والتصحيح من شاشة واحدة منظمة.</p></div><button class="btn primary" type="button" onclick="toggleExamCreator()"><span data-icon="plus"></span> إضافة اختبار</button></div>
      <div class="admin-exam-kpis"><article><b>${adminData.exams.length}</b><small>اختبار منشور</small></article><article class="warn"><b>${pending.length}</b><small>يحتاج تصحيحًا</small></article><article><b>${attempts.length}</b><small>محاولة طالب</small></article></div>
      <section id="examCreatorPanel" class="card admin-exam-creator" hidden>
        <div class="admin-workflow-title"><div><span class="kicker">اختبار جديد</span><h3>البيانات والأسئلة</h3></div><button class="small-btn" type="button" onclick="toggleExamCreator(false)">إغلاق</button></div>
        <form id="examFormV6061" class="exam-builder-form">
          <div class="exam-meta-grid"><div class="field"><label>اسم الاختبار</label><input name="title" required maxlength="200" placeholder="مثال: اختبار الوحدة الأولى"></div><div class="field"><label>الصف</label><select name="grade">${grades()}</select></div><div class="field"><label>المدة بالدقيقة</label><input name="duration" type="number" inputmode="numeric" min="1" max="300" value="20" required></div></div>
          <div class="exam-meta-grid"><div class="field"><label>العام الدراسي</label><input name="academicYear" value="${safe(ctx.academicYear||'')}" maxlength="20"></div><div class="field"><label>الترم</label><select name="term"><option ${ctx.term==='الترم الأول'?'selected':''}>الترم الأول</option><option ${ctx.term==='الترم الثاني'?'selected':''}>الترم الثاني</option></select></div><div class="field"><label>المجموعة</label><select name="group"><option value="">كل المجموعات</option>${(adminData.groups||[]).map(group=>`<option>${safe(group.name||group.group||'')}</option>`).join('')}</select></div></div>
          <div class="exam-meta-grid"><div class="field"><label>موعد الفتح</label><input name="openAt" type="datetime-local"></div><div class="field"><label>موعد الإغلاق</label><input name="closeAt" type="datetime-local"></div><label class="option-card"><input type="checkbox" name="allowRetake" value="true"> السماح بإعادة التسليم</label></div>
          <div class="field"><label>تعليمات للطلاب</label><textarea name="instructions" rows="2" maxlength="2000" placeholder="تعليمات اختيارية"></textarea></div>
          <label class="exam-pdf-upload"><span><b>ملف PDF اختياري</b><small>الحد الأقصى 15MB. يظهر للطالب مع الاختبار.</small></span><input name="pdfFile" type="file" accept="application/pdf,.pdf"></label>
          <div class="exam-builder-title"><div><h3>الأسئلة الاختيارية</h3><small>أربعة اختيارات وإجابة صحيحة للتصحيح التلقائي.</small></div><button class="btn ghost" type="button" onclick="addExamQuestion()">+ إضافة سؤال</button></div>
          <div id="examQuestionsBuilder" class="exam-questions-builder">${typeof examBuilderCard==='function'?examBuilderCard(0):''}</div><button class="btn primary full-width" type="submit"><span data-icon="clipboard"></span> حفظ ونشر الاختبار</button>
        </form>
      </section>
      <div class="admin-workflow-title admin-list-title"><div><h3>الاختبارات الحالية</h3><p>كل الاختبارات المتاحة للطلاب.</p></div></div><div class="admin-exam-grid">${examCards||empty('لا توجد اختبارات بعد.')}</div>
      <details class="card admin-collapsible" ${pending.length?'open':''}><summary>يحتاج تصحيحًا <span class="badge warn">${pending.length}</span></summary><div class="admin-detail-body">${pending.map(examAttemptRowHTML).join('')||empty('لا توجد محاولات معلقة.')}</div></details>
      <details class="card admin-collapsible"><summary>كل المحاولات والنتائج <span class="badge">${attempts.length}</span></summary><div class="admin-detail-body">${attempts.map(examAttemptRowHTML).join('')||empty('لا توجد محاولات.')}</div></details>
      <details class="card admin-collapsible"><summary>درجات الطلاب وواتساب</summary><div class="admin-detail-body">${gradeRows.map(examGradeRowHTML).join('')||empty('لا توجد درجات بعد.')}</div></details>`);
    document.getElementById('examFormV6061')?.addEventListener('submit',saveExamV6061);
    hydrateIcons();
  }

  window.toggleExamCreator=function(force){
    const panel=document.getElementById('examCreatorPanel');if(!panel)return;
    panel.hidden=typeof force==='boolean'?!force:!panel.hidden;
    if(!panel.hidden)panel.scrollIntoView({behavior:'smooth',block:'start'});
  };

  async function saveExamV6061(event){
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector('[type="submit"]'),pdf=form.elements.pdfFile.files?.[0]||null;
    const questionText=typeof serializeExamQuestions==='function'?serializeExamQuestions():'';
    const questionCount=document.querySelectorAll('#examQuestionsBuilder [data-exam-question]').length;
    if(questionCount&&(!questionText||questionText.split('\n\n').length!==questionCount))return aToast('كمّل كل سؤال والاختيارات وحدد الإجابة الصحيحة');
    if(!questionText&&!pdf)return aToast('أضف سؤالًا واحدًا على الأقل أو ارفع PDF');
    const values=Object.fromEntries(new FormData(form).entries());delete values.pdfFile;
    if(values.openAt&&values.closeAt&&new Date(values.closeAt)<=new Date(values.openAt))return aToast('موعد الإغلاق يجب أن يكون بعد موعد الفتح');
    button.disabled=true;button.classList.add('is-loading');
    let exam=null;
    try{
      const uploaded=await uploadTeacherFile(pdf,true);
      const parsed=questionText&&typeof parseExamQuestions==='function'?parseExamQuestions(questionText):[];
      exam={...values,id:`ex-${Date.now()}`,text:questionText||'أجب عن أسئلة ملف PDF بالترتيب.',duration:Number(values.duration)||20,allowRetake:values.allowRetake==='true',active:true,published:true,questionCount:parsed.length||1,mcqCount:parsed.filter(row=>row.type==='mcq').length,essayCount:parsed.length?parsed.filter(row=>row.type==='essay').length:1,createdAt:new Date().toISOString()};
      if(uploaded){exam.pdfUrl=uploaded.url;exam.pdfName=uploaded.fileName||pdf.name;exam.pdfPath=uploaded.path||'';}
      adminData.exams.push(exam);await saveAdminDataNow();window.MFCloud?.logActivity?.('تم نشر اختبار',{examId:exam.id,grade:exam.grade}).catch(()=>{});aToast('تم حفظ ونشر الاختبار');renderExamsV6061();
    }catch(error){if(exam)adminData.exams=adminData.exams.filter(row=>row.id!==exam.id);aToast(adminActionErrorMessage(error,error?.message||'تعذر حفظ الاختبار.'));}
    finally{button.disabled=false;button.classList.remove('is-loading');}
  }

  function assignmentTypeFields(){return `<div data-assignment-fields="mcq" class="assignment-type-fields"><div class="field"><label>الاختيارات</label><div class="assignment-choice-inputs">${[0,1,2,3].map(index=>`<input name="choice${index}" maxlength="700" placeholder="الاختيار ${index+1}" ${index<2?'required':''}>`).join('')}</div></div><div class="field"><label>الإجابة الصحيحة</label><select name="correctIndex"><option value="0">الاختيار 1</option><option value="1">الاختيار 2</option><option value="2">الاختيار 3</option><option value="3">الاختيار 4</option></select></div></div><div data-assignment-fields="code" class="assignment-type-fields" hidden><div class="field"><label>لغة البرمجة</label><select name="language"><option value="python">Python</option><option value="javascript">JavaScript</option><option value="cpp">C++</option><option value="java">Java</option><option value="csharp">C#</option></select></div><div class="field"><label>كود البداية الاختياري</label><textarea name="starterCode" dir="ltr" rows="5" maxlength="12000" spellcheck="false" placeholder="# اكتب كود البداية هنا"></textarea></div></div>`;}

  function renderMaterialsV6061(){
    fresh();
    const materials=(adminData.materials||[]).slice().reverse(),questions=(adminData.questions||[]).slice().reverse(),assignments=(adminData.assignments||[]).slice().reverse();
    const submissions=(adminData.students||[]).flatMap(student=>(student.homeworks||[]).filter(row=>row.assignmentId).map(row=>({...row,studentName:row.studentName||student.name||student.studentName,studentCode:row.studentCode||student.studentCode}))).sort((a,b)=>String(b.submittedAt||b.updatedAt||'').localeCompare(String(a.submittedAt||a.updatedAt||'')));
    content(`<div class="section-head compact-admin-head"><div><span class="kicker"><span data-icon="book-open"></span> المحاضرات والواجبات</span><h2 class="section-title">محتوى الطلاب حسب الصف</h2><p class="section-desc">ارفع PDF الشرح أو أضف واجبًا اختياريًا أو برمجيًا؛ لن يظهر إلا لطلاب الصف المحدد بعد كتابة الكود.</p></div></div>
      <div class="admin-content-workflow-grid">
        <form id="materialFormV6061" class="card admin-workflow-form"><span class="iconbox" data-icon="upload"></span><h3>رفع محاضرة أو PDF</h3><div class="field"><label>العنوان</label><input name="title" required maxlength="200" placeholder="مثال: شرح المتغيرات"></div><div class="field"><label>الصف</label><select name="grade">${grades()}</select></div><div class="field"><label>وصف مختصر</label><textarea name="desc" rows="3" maxlength="1200"></textarea></div><label class="admin-file-drop"><span><b>اختر PDF أو صورة</b><small>بحد أقصى 15MB</small></span><input name="file" type="file" accept="application/pdf,.pdf,image/*" required></label><button class="btn primary" type="submit">رفع ونشر</button></form>
        <form id="questionFormV6061" class="card admin-workflow-form"><span class="iconbox" data-icon="help-circle"></span><h3>إضافة سؤال شرح</h3><div class="field"><label>عنوان السؤال</label><input name="title" required maxlength="200"></div><div class="field"><label>الصف</label><select name="grade">${grades()}</select></div><div class="field"><label>نص السؤال</label><textarea name="content" required rows="3" maxlength="4000"></textarea></div><div class="field"><label>الإجابة النموذجية</label><textarea name="answer" rows="3" maxlength="4000"></textarea></div><button class="btn primary" type="submit">حفظ السؤال</button></form>
        <form id="assignmentFormV6061" class="card admin-workflow-form assignment-admin-form"><span class="iconbox" data-icon="file-text"></span><h3>نشر واجب للصف</h3><div class="field"><label>عنوان الواجب</label><input name="title" required maxlength="200" placeholder="مثال: واجب الحصة 3"></div><div class="assignment-admin-meta"><div class="field"><label>الصف</label><select name="grade">${grades()}</select></div><div class="field"><label>نوع الواجب</label><select name="type" onchange="toggleAssignmentTypeFields(this.value)"><option value="mcq">اختياري</option><option value="code">كود برمجي</option><option value="text">إجابة كتابية</option></select></div><div class="field"><label>آخر موعد</label><input name="dueDate" type="date"></div></div><div class="field"><label>السؤال أو المطلوب</label><textarea name="description" required rows="3" maxlength="3000"></textarea></div>${assignmentTypeFields()}<label class="admin-file-drop"><span><b>ملف مساعد اختياري</b><small>PDF أو صورة بحد أقصى 15MB</small></span><input name="file" type="file" accept="application/pdf,.pdf,image/*"></label><button class="btn primary" type="submit">نشر الواجب للطلاب</button></form>
      </div>
      <div class="admin-content-lists"><section class="card"><div class="admin-workflow-title"><h3>المحاضرات والملفات</h3><span class="badge">${materials.length}</span></div>${materials.map(row=>`<div class="admin-content-row"><div><b>${safe(row.title)}</b><small>${safe(row.grade||'')} ${row.fileName?`· ${safe(row.fileName)}`:''}</small></div>${row.fileUrl?`<a class="small-btn" href="${safe(row.fileUrl)}" target="_blank" rel="noopener noreferrer">فتح</a>`:''}<button class="small-btn danger" onclick="deleteItem('materials','${safe(row.id)}')">حذف</button></div>`).join('')||empty('لا توجد محاضرات بعد.')}</section>
      <section class="card"><div class="admin-workflow-title"><h3>الواجبات المنشورة</h3><span class="badge good">${assignments.length}</span></div>${assignments.map(row=>`<div class="admin-content-row"><div><b>${safe(row.title)}</b><small>${safe(row.grade||'')} · ${safe(typeLabel(row.type))}${row.dueDate?` · حتى ${safe(row.dueDate)}`:''}</small></div><span class="badge good">منشور</span><button class="small-btn danger" onclick="deleteItem('assignments','${safe(row.id)}')">حذف</button></div>`).join('')||empty('لا توجد واجبات منشورة.')}</section>
      <section class="card"><div class="admin-workflow-title"><h3>أسئلة الشرح</h3><span class="badge">${questions.length}</span></div>${questions.map(row=>`<div class="admin-content-row"><div><b>${safe(row.title)}</b><small>${safe(row.grade||'')}</small></div><button class="small-btn danger" onclick="deleteItem('questions','${safe(row.id)}')">حذف</button></div>`).join('')||empty('لا توجد أسئلة شرح.')}</section>
      <section class="card admin-content-full"><div class="admin-workflow-title"><div><h3>تسليمات الواجب</h3><p>إجابات الاختياري وأكواد الطلاب.</p></div><span class="badge good">${submissions.length}</span></div><div class="assignment-submission-list">${submissions.map(row=>`<details class="assignment-submission-row"><summary><span><b>${safe(row.studentName||'طالب')}</b><small>${safe(row.studentCode||'')} · ${safe(row.homeworkTitle||row.title||'واجب')}</small></span><span class="badge ${Number(row.score)===100?'good':row.score===0?'warn':''}">${row.answerType==='mcq'?(Number(row.score)===100?'صحيحة':'تحتاج مراجعة'):'تم التسليم'}</span></summary><pre>${safe(String(row.answer||'').slice(0,3000)||'لا توجد إجابة نصية.')}</pre></details>`).join('')||empty('لا توجد تسليمات بعد.')}</div></section></div>`);
    document.getElementById('materialFormV6061')?.addEventListener('submit',saveMaterialV6061);
    document.getElementById('questionFormV6061')?.addEventListener('submit',saveQuestionV6061);
    document.getElementById('assignmentFormV6061')?.addEventListener('submit',saveAssignmentV6061);
    hydrateIcons();
  }

  window.toggleAssignmentTypeFields=function(type){document.querySelectorAll('[data-assignment-fields]').forEach(box=>{box.hidden=box.dataset.assignmentFields!==type;box.querySelectorAll('[required]').forEach(input=>input.disabled=box.hidden);});};

  async function saveMaterialV6061(event){
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]'),file=form.elements.file.files?.[0];
    button.disabled=true;button.classList.add('is-loading');let item=null;
    try{const uploaded=await uploadTeacherFile(file);const values=Object.fromEntries(new FormData(form).entries());delete values.file;item={...values,id:`mat-${Date.now()}`,fileUrl:uploaded.url,fileName:uploaded.fileName||file.name,filePath:uploaded.path||'',fileType:file.type||'',active:true,published:true,createdAt:new Date().toISOString()};adminData.materials.push(item);await saveAdminDataNow();window.MFCloud?.logActivity?.('تم رفع محاضرة',{materialId:item.id,grade:item.grade}).catch(()=>{});aToast('تم رفع المحاضرة وستظهر لطلاب الصف');renderMaterialsV6061();}catch(error){if(item)adminData.materials=adminData.materials.filter(row=>row.id!==item.id);aToast(adminActionErrorMessage(error,error?.message||'تعذر رفع المحاضرة.'));}finally{button.disabled=false;button.classList.remove('is-loading');}
  }

  async function saveQuestionV6061(event){
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]'),values=Object.fromEntries(new FormData(form).entries()),item={...values,id:`q-${Date.now()}`,active:true,published:true,createdAt:new Date().toISOString()};button.disabled=true;
    try{adminData.questions.push(item);await saveAdminDataNow();aToast('تم حفظ السؤال');renderMaterialsV6061();}catch(error){adminData.questions=adminData.questions.filter(row=>row.id!==item.id);aToast(adminActionErrorMessage(error,'تعذر حفظ السؤال.'));}finally{button.disabled=false;}
  }

  async function saveAssignmentV6061(event){
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]'),file=form.elements.file.files?.[0]||null,values=Object.fromEntries(new FormData(form).entries());
    const type=values.type,choices=[values.choice0,values.choice1,values.choice2,values.choice3].map(value=>String(value||'').trim()).filter(Boolean);
    if(type==='mcq'&&choices.length<2)return aToast('اكتب اختيارين على الأقل');
    if(type==='mcq'&&Number(values.correctIndex)>=choices.length)return aToast('اختر إجابة صحيحة موجودة');
    button.disabled=true;button.classList.add('is-loading');let assignment=null;
    try{
      const uploaded=await uploadTeacherFile(file);
      assignment={id:`hw-${Date.now()}`,title:String(values.title||'').trim(),grade:String(values.grade||'').trim(),type,description:String(values.description||'').trim(),dueDate:values.dueDate||'',choices:type==='mcq'?choices:[],correctIndex:type==='mcq'?Number(values.correctIndex):null,language:type==='code'?values.language:'',starterCode:type==='code'?values.starterCode:'',active:true,published:true,createdAt:new Date().toISOString()};
      if(uploaded){assignment.fileUrl=uploaded.url;assignment.fileName=uploaded.fileName||file.name;assignment.filePath=uploaded.path||'';}
      adminData.assignments.push(assignment);await saveAdminDataNow();window.MFCloud?.logActivity?.('تم نشر واجب',{assignmentId:assignment.id,grade:assignment.grade,type:assignment.type}).catch(()=>{});aToast('تم نشر الواجب وسيظهر للطالب بعد كتابة كوده');renderMaterialsV6061();
    }catch(error){if(assignment)adminData.assignments=adminData.assignments.filter(row=>row.id!==assignment.id);aToast(adminActionErrorMessage(error,error?.message||'تعذر نشر الواجب.'));}finally{button.disabled=false;button.classList.remove('is-loading');}
  }

  const install=()=>{window.renderExams=renderExamsV6061;window.renderMaterials=renderMaterialsV6061;};
  install();
  document.addEventListener('DOMContentLoaded',()=>{install();setTimeout(install,0);});
})();
