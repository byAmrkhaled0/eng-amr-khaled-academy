(function(){
  'use strict';
  function applyV55Admin(){
  if(typeof adminSections==='undefined')return;

  const paymentActionPending=new Set();
  const paymentPrices=()=>adminData.settings?.coursePrices&&typeof adminData.settings.coursePrices==='object'?adminData.settings.coursePrices:{};
  const paymentNumber=value=>{const number=Number(value);return Number.isFinite(number)&&number>=0?number:0;};
  const paymentMoney=value=>`${new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(paymentNumber(value))} ج.م`;
  const downloadPaymentCSV=(filename,headers,rows)=>{const cell=value=>`"${String(value??'').replace(/"/g,'""')}"`,csv='\ufeff'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const coursePriceFor=student=>paymentNumber(paymentPrices()[String(student?.grade||'')]);
  const paidAmountFor=student=>{
    const saved=paymentNumber(student?.paymentAmount);
    return saved>0?saved:coursePriceFor(student);
  };
  const paymentFilters=()=>({
    query:normalizeText(document.getElementById('paymentSearch')?.value||''),
    grade:document.getElementById('paymentGrade')?.value||'all',
    month:document.getElementById('paymentMonth')?.value||'all'
  });
  const paymentRows=(includeSearch=true)=>{
    const {query,grade,month}=paymentFilters();
    return (adminData.students||[]).map(normalizeStudent).filter(st=>st.active!==false&&(grade==='all'||st.grade===grade)&&(month==='all'||st.month===month)&&(!includeSearch||!query||normalizeText(`${st.name} ${st.studentCode} ${st.parentPhone}`).includes(query)));
  };
  const paymentSummary=()=>{
    const rows=paymentRows(false),paidRows=rows.filter(student=>student.paid),expected=rows.reduce((total,student)=>total+coursePriceFor(student),0),collected=paidRows.reduce((total,student)=>total+paidAmountFor(student),0);
    return {students:rows.length,paid:paidRows.length,unpaid:rows.length-paidRows.length,expected,collected,remaining:Math.max(0,expected-collected)};
  };
  window.refreshPaymentDashboard=function(){
    const summary=paymentSummary();
    const values={paymentStudentCount:summary.students,paymentPaidCount:summary.paid,paymentUnpaidCount:summary.unpaid,paymentCollected:paymentMoney(summary.collected),paymentExpected:paymentMoney(summary.expected),paymentRemaining:paymentMoney(summary.remaining)};
    Object.entries(values).forEach(([id,value])=>{const element=document.getElementById(id);if(element)element.textContent=String(value);});
  };
  window.refreshPaymentRows=function(){
    const box=document.getElementById('paymentRows');if(!box)return;const rows=paymentRows();
    box.innerHTML=rows.map(st=>{const pending=paymentActionPending.has(st.studentCode),price=coursePriceFor(st),amount=st.paid?paidAmountFor(st):0;return `<article class="payment-student-row ${st.paid?'is-paid':'is-unpaid'} ${pending?'is-saving':''}"><span class="student-avatar">${safe(String(st.name||'ط').charAt(0))}</span><div class="payment-student-info"><b>${safe(st.name)}</b><small>${safe(st.studentCode)} · ${safe(st.grade||'-')} · ${safe(st.group||'-')} · ${safe(st.month||'-')}</small><span>سعر الكورس: <strong>${safe(paymentMoney(price))}</strong>${st.paid?` · المحصّل: <strong>${safe(paymentMoney(amount))}</strong>`:''}</span></div><span class="badge ${st.paid?'good':'warn'}">${pending?'جارٍ الحفظ':st.paid?'تم الدفع':'لم يدفع'}</span><div class="payment-actions"><button class="small-btn primary" type="button" ${pending||st.paid?'disabled':''} onclick="setPaid('${safe(st.studentCode)}',true)">تسجيل الدفع</button><button class="small-btn danger" type="button" ${pending||!st.paid?'disabled':''} onclick="setPaid('${safe(st.studentCode)}',false)">إلغاء الدفع</button></div></article>`;}).join('')||'<div class="empty-state"><h3>لا يوجد طلاب مطابقون</h3><p>غيّر البحث أو الفلاتر ثم حاول مرة أخرى.</p></div>';
    refreshPaymentDashboard();
  };
  window.saveCoursePrices=async function(){
    const button=document.getElementById('saveCoursePricesButton');if(button?.disabled)return;
    const previous={...(adminData.settings?.coursePrices||{})},next={};
    document.querySelectorAll('[data-course-price]').forEach(input=>{next[input.dataset.coursePrice]=paymentNumber(String(input.value||'').replace(/[^0-9.]/g,''));});
    adminData.settings={...(adminData.settings||{}),coursePrices:next};saveData(adminData);
    try{if(button)button.disabled=true;if(window.MFCloud?.saveSettings)await window.MFCloud.saveSettings(adminData.settings);else await saveAdminDataNow();aToast('تم حفظ أسعار الصفوف والكورسات');refreshPaymentRows();}
    catch(error){adminData.settings={...(adminData.settings||{}),coursePrices:previous};saveData(adminData);aToast(adminActionErrorMessage(error,'تعذر حفظ أسعار الكورسات.'));refreshPaymentRows();}
    finally{if(button)button.disabled=false;}
  };
  window.setPaid=async function(code,value){
    const student=adminData.students.find(item=>stCode(item)===code);if(!student)return aToast('الطالب غير موجود');if(paymentActionPending.has(code))return;
    const hadAmount=Object.prototype.hasOwnProperty.call(student,'paymentAmount'),previous={paid:student.paid,paymentDate:student.paymentDate,paymentAmount:student.paymentAmount,paymentCourse:student.paymentCourse};
    student.paid=value;student.paymentDate=value?isoDateAdmin():'';student.paymentAmount=value?coursePriceFor(student):0;student.paymentCourse=value?student.grade:'';paymentActionPending.add(code);saveData(adminData);refreshPaymentRows();
    try{if(!window.MFCloud?.saveStudent)throw new Error('Student service unavailable');await window.MFCloud.saveStudent(student);aToast(value?`تم تسجيل ${paymentMoney(student.paymentAmount)} للطالب`:'تم إلغاء حالة الدفع');}
    catch(error){student.paid=previous.paid;student.paymentDate=previous.paymentDate;student.paymentCourse=previous.paymentCourse;if(hadAmount)student.paymentAmount=previous.paymentAmount;else delete student.paymentAmount;saveData(adminData);aToast(adminActionErrorMessage(error,'تعذر تحديث حالة الدفع.'));}
    finally{paymentActionPending.delete(code);refreshPaymentRows();}
  };
  window.exportCenterSubscriptionsCSV=function(){const rows=(adminData.students||[]).map(normalizeStudent).map(student=>[student.studentCode,student.name,student.grade,student.group,student.month,coursePriceFor(student),student.paid?'تم الدفع':'لم يدفع',student.paid?paidAmountFor(student):0,student.paymentDate||'']);downloadPaymentCSV('techno-minds-payments.csv',['كود الطالب','الاسم','المسار','المجموعة','الشهر','سعر الكورس','الحالة','المبلغ المحصل','تاريخ الدفع'],rows);};
  renderPayments=function(){
    fresh();const prices=paymentPrices();
    content(`<div class="section-head compact-admin-head"><div><span class="kicker"><span data-icon="database"></span> المدفوعات</span><h2 class="section-title">الخزنة ومتابعة دفع الطلاب</h2><p class="section-desc">حدد سعر كل صف مرة واحدة، وكل طالب تسجله «دفع» يُضاف سعر كورسه تلقائيًا للإجمالي.</p></div><button class="btn ghost" type="button" onclick="exportCenterSubscriptionsCSV()"><span data-icon="download"></span> تصدير CSV</button></div><div class="payment-financial-kpis"><article class="collected"><small>المبلغ الموجود معك</small><b id="paymentCollected">0 ج.م</b><span id="paymentPaidCount">0</span> طالب دفع</article><article><small>الإجمالي المتوقع</small><b id="paymentExpected">0 ج.م</b><span id="paymentStudentCount">0</span> طالب</article><article class="remaining"><small>المبلغ المتبقي</small><b id="paymentRemaining">0 ج.م</b><span id="paymentUnpaidCount">0</span> طالب لم يدفع</article></div><details class="card course-price-editor"><summary><span><b>أسعار الصفوف والكورسات</b><small>اضغط لتحديد أو تعديل سعر كل مسار</small></span><span data-icon="settings"></span></summary><div class="course-price-grid">${GRADES.map(grade=>`<label><span>${safe(grade)}</span><div><input type="number" min="0" step="1" inputmode="numeric" data-digits-only data-course-price="${safe(grade)}" value="${safe(paymentNumber(prices[grade]))}" aria-label="سعر ${safe(grade)}"><small>جنيه</small></div></label>`).join('')}</div><button class="btn primary" id="saveCoursePricesButton" type="button" onclick="saveCoursePrices()"><span data-icon="save"></span> حفظ الأسعار</button></details><div class="card payment-panel"><div class="payment-toolbar"><input id="paymentSearch" type="search" placeholder="بحث بالاسم أو الكود" oninput="refreshPaymentRows()"><select id="paymentGrade" onchange="refreshPaymentRows()"><option value="all">كل المسارات</option>${GRADES.map(grade=>`<option>${safe(grade)}</option>`).join('')}</select><select id="paymentMonth" onchange="refreshPaymentRows()"><option value="all">كل الشهور</option>${MONTHS.map(month=>`<option>${safe(month)}</option>`).join('')}</select></div><p class="payment-filter-note">الأرقام بالأعلى تتحدث فورًا حسب المسار والشهر المحددين.</p><div id="paymentRows" class="payment-student-list"></div></div>`);refreshPaymentRows();hydrateIcons();
  };

  renderReviewsAdmin=function(){fresh();const rows=(adminData.reviews||[]).slice().reverse(),pending=rows.filter(row=>row.approved===false).length;content(`<div class="section-head compact-admin-head"><div><span class="kicker"><span data-icon="star"></span> التقييمات</span><h2 class="section-title">تقييمات الطلاب</h2><p class="section-desc">راجع التقييم وانشره أو احذفه بسرعة.</p></div><span class="badge ${pending?'warn':'good'}">${pending} بانتظار المراجعة</span></div><div class="review-admin-list">${rows.map(row=>`<article class="card review-admin-item"><div class="review-admin-top"><div><b>${safe(row.name)}</b><small>${safe(row.role||'طالب')}</small></div><div class="review-stars">${'★'.repeat(Math.max(1,Math.min(5,Number(row.rating||5))))}</div></div><p>${safe(row.text||'')}</p><div class="review-admin-actions"><span class="badge ${row.approved!==false?'good':'warn'}">${row.approved!==false?'منشور':'ينتظر النشر'}</span>${row.approved===false?`<button class="small-btn primary" onclick="approveReview('${safe(row.id)}')">نشر</button>`:''}<button class="small-btn danger" onclick="deleteItem('reviews','${safe(row.id)}')">حذف</button></div></article>`).join('')||'<div class="card"><p class="section-desc">لا توجد تقييمات بعد.</p></div>'}</div>`);};

  function scheduleItem(item){const active=item.active!==false;return `<article class="schedule-row card"><div><span class="badge ${active?'good':'warn'}">${active?'متاح':'متوقف'}</span><h3>${safe(item.name||'مجموعة')}</h3><small>${safe(item.grade||'كل المسارات')} · ${safe(item.days||'-')}</small></div><strong>${safe(typeof formatTime12==='function'?formatTime12(item.startTime):(item.startTime||'--:--'))}</strong><div class="mobile-actions"><button class="small-btn primary" onclick="editSchedule('${safe(item.id)}')">تعديل</button><button class="small-btn" onclick="toggleSchedule('${safe(item.id)}')">${active?'إيقاف':'تفعيل'}</button><button class="small-btn danger teacher-only" onclick="deleteSchedule('${safe(item.id)}')">حذف</button></div></article>`;}
  renderSchedules=function(){fresh();content(`<div class="section-head compact-admin-head"><div><span class="kicker"><span data-icon="calendar"></span> المواعيد</span><h2 class="section-title">مواعيد الحصص</h2><p class="section-desc">حدد المجموعة والمسار والأيام وميعاد الحصة فقط.</p></div></div><div class="schedule-simple-layout"><form id="scheduleForm" class="card schedule-simple-form"><input type="hidden" name="id"><div class="field"><label>اسم المجموعة</label><input name="name" required placeholder="اسم المجموعة"></div><div class="field"><label>المسار</label><select name="grade" required>${GRADES.map(g=>`<option>${safe(g)}</option>`).join('')}</select></div><div class="field"><label>الأيام</label><input name="days" required placeholder="السبت والثلاثاء" list="commonScheduleDays"><datalist id="commonScheduleDays"><option value="السبت والثلاثاء"><option value="الأحد والأربعاء"><option value="الإثنين والخميس"><option value="الجمعة"></datalist></div><div class="field"><label>ميعاد الحصة</label><input name="startTime" type="time" required></div><label class="option-card"><input name="active" type="checkbox" checked> يظهر في صفحة الحجز</label><div class="mobile-actions"><button class="btn primary" type="submit">حفظ الموعد</button><button class="btn ghost" type="reset" onclick="resetScheduleForm()">موعد جديد</button></div></form><div class="schedule-simple-list">${(adminData.groups||[]).map(scheduleItem).join('')||'<div class="card"><p class="section-desc">لا توجد مواعيد بعد.</p></div>'}</div></div>`);const form=document.getElementById('scheduleForm');form.onsubmit=async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form).entries());values.id=values.id||`grp-${Date.now()}`;values.endTime='';values.active=form.active.checked;const button=form.querySelector('[type=submit]');button.disabled=true;try{if(!window.MFCloud?.saveGroup)throw new Error('Schedule service unavailable');const saved=await window.MFCloud.saveGroup(values);if(!saved?.id)throw new Error('save failed');const index=adminData.groups.findIndex(item=>String(item.id)===String(saved.id));if(index>=0)adminData.groups[index]={...adminData.groups[index],...saved};else adminData.groups.push(saved);saveData(adminData);aToast('تم حفظ موعد الحصة');renderSchedules();}catch(error){aToast(adminActionErrorMessage(error,'تعذر حفظ الموعد.'));}finally{button.disabled=false;}};hydrateIcons();};

  /* Keep the full tools, but open large creation forms only when requested. */
  studentMobileCards=function(rows){return `<div class="student-mobile-cards compact-student-list">${rows.map(st=>{const s=normalizeStudent(st),c=calcStudentAdmin(s);return `<article class="mobile-admin-card compact-student-card"><div class="mobile-admin-card-head"><span class="student-avatar">${safe(String(s.name||'ط').charAt(0))}</span><div><b>${safe(s.name)}</b><small>${safe(s.studentCode)} · ${safe(s.grade)} · ${safe(s.group||'-')}</small></div><span class="badge ${badgeStatus(s.paid)}">${s.paid?'مشترك':'غير مشترك'}</span></div><div class="compact-student-stats"><span>حضور <b>${c.attendancePct||0}%</b></span><span>درجات <b>${c.avg||0}%</b></span></div><div class="compact-student-actions"><button class="small-btn primary" onclick="editStudent('${safe(s.studentCode)}')">تعديل</button><button class="small-btn" onclick="printStudentReport('${safe(s.studentCode)}')">الملف</button><details><summary class="small-btn" aria-label="المزيد">•••</summary><div class="student-action-menu"><button onclick="quickPresent('${safe(s.studentCode)}')">تسجيل حضور</button><button onclick="sendParentMonthlyReport('${safe(s.studentCode)}')">إرسال واتساب</button><button onclick="copyStudentCodes('${safe(s.studentCode)}')">نسخ الأكواد</button><button class="danger" onclick="deleteStudent('${safe(s.studentCode)}')">حذف الطالب</button></div></details></div></article>`;}).join('')||'<p class="section-desc">لا يوجد طلاب.</p>'}</div>`;};
  studentRow=function(st){const s=normalizeStudent(st),c=calcStudentAdmin(s);return `<tr><td><b>${safe(s.name)}</b><small>${safe(s.studentCode)}</small></td><td>${safe(s.grade)}<small>${safe(s.group||'-')}</small></td><td><span class="badge ${badgeStatus(s.paid)}">${s.paid?'مشترك':'غير مشترك'}</span></td><td>${c.attendancePct||0}%</td><td>${c.avg||0}%</td><td><div class="compact-table-actions"><button class="small-btn primary" onclick="editStudent('${safe(s.studentCode)}')">تعديل</button><button class="small-btn" onclick="printStudentReport('${safe(s.studentCode)}')">الملف</button><details><summary class="small-btn">•••</summary><div class="student-action-menu"><button onclick="quickPresent('${safe(s.studentCode)}')">حضور</button><button onclick="sendParentMonthlyReport('${safe(s.studentCode)}')">واتساب</button><button onclick="copyStudentCodes('${safe(s.studentCode)}')">نسخ الأكواد</button><button class="danger" onclick="deleteStudent('${safe(s.studentCode)}')">حذف</button></div></details></div></td></tr>`;};
  studentsTable=function(rows){return `<div class="student-row-list">${rows.map(st=>{const s=normalizeStudent(st),c=calcStudentAdmin(s);return `<div class="student-flat-row"><div class="student-flat-name"><span class="student-avatar">${safe(String(s.name||'ط').charAt(0))}</span><div><b>${safe(s.name)}</b><small>${safe(s.studentCode)} · ${safe(s.grade)} · ${safe(s.group||'-')}</small></div></div><span class="badge ${badgeStatus(s.paid)}">${s.paid?'مشترك':'غير مشترك'}</span><span><small>الحضور</small><b>${c.attendancePct||0}%</b></span><span><small>الدرجات</small><b>${c.avg||0}%</b></span><div class="compact-student-actions"><button class="small-btn primary" onclick="editStudent('${safe(s.studentCode)}')">تعديل</button><button class="small-btn" onclick="printStudentReport('${safe(s.studentCode)}')">الملف</button><details><summary class="small-btn">•••</summary><div class="student-action-menu"><button onclick="quickPresent('${safe(s.studentCode)}')">تسجيل حضور</button><button onclick="sendParentMonthlyReport('${safe(s.studentCode)}')">واتساب</button><button onclick="copyStudentCodes('${safe(s.studentCode)}')">نسخ الأكواد</button><button class="danger" onclick="deleteStudent('${safe(s.studentCode)}')">حذف</button></div></details></div></div>`;}).join('')||'<p class="section-desc">لا يوجد طلاب.</p>'}</div>`;};

  const renderSchedulesFull=renderSchedules;
  renderSchedules=function(){renderSchedulesFull();const form=document.getElementById('scheduleForm');if(!form)return;form.classList.add('admin-create-panel');form.hidden=true;const head=document.querySelector('.admin-section>.section-head');head?.insertAdjacentHTML('beforeend','<button class="btn primary" type="button" onclick="toggleAdminCreatePanel(this,\'scheduleForm\')"><span data-icon="calendar"></span> إضافة ميعاد</button>');hydrateIcons();};
  const renderStudentsFull=renderStudents;
  renderStudents=function(){
    renderStudentsFull();
    const form=document.getElementById('addStudentForm');
    if(!form)return;
    const panel=form.parentElement;
    panel.classList.add('admin-create-panel');
    panel.hidden=true;
    const head=document.querySelector('.admin-section>.section-head');
    head?.insertAdjacentHTML('beforeend','<button class="btn primary" type="button" onclick="toggleAdminCreatePanel(this,\'addStudentForm\')"><span data-icon="user"></span> إضافة طالب</button>');
    document.querySelector('.monthly-report-help-v38')?.classList.add('admin-tip-compact');
    hydrateIcons();
  };

  const renderExamsFull=renderExams;
  renderExams=function(){
    renderExamsFull();
    const form=document.getElementById('examForm');
    if(!form)return;
    form.classList.add('admin-create-panel','exam-create-panel');
    form.hidden=true;
    const layout=form.closest('.exam-admin-layout');
    layout?.classList.add('exam-list-first');
    const head=document.querySelector('.admin-section>.section-head');
    head?.insertAdjacentHTML('beforeend','<button class="btn primary" type="button" onclick="toggleAdminCreatePanel(this,\'examForm\')"><span data-icon="clipboard"></span> إضافة امتحان</button>');
    hydrateIcons();
  };

  window.toggleAdminCreatePanel=function(button,formId){
    const form=document.getElementById(formId);if(!form)return;
    form.hidden=!form.hidden;
    button.classList.toggle('ghost',!form.hidden);
    button.classList.toggle('primary',form.hidden);
    button.lastChild.textContent=form.hidden?(formId==='examForm'?' إضافة امتحان':formId==='scheduleForm'?' إضافة ميعاد':' إضافة طالب'):' إغلاق النموذج';
    if(!form.hidden)form.scrollIntoView({behavior:'smooth',block:'start'});
  };
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(applyV55Admin,0));
})();
