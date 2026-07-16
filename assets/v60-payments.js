(function(){
  'use strict';

  const state={summaries:[],transactions:[],summaryUnsubscribe:null,transactionUnsubscribe:null,pending:new Set(),listenersStarted:false};
  const number=value=>{const normalized=String(value??'').replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776));const parsed=Number(normalized.replace(/[^0-9.-]/g,''));return Number.isFinite(parsed)&&parsed>=0?Math.round((parsed+Number.EPSILON)*100)/100:0;};
  const money=value=>`${new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(number(value))} ج.م`;
  const cairoNowParts=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),get=type=>Number(parts.find(item=>item.type===type)?.value||0);return {year:get('year'),month:get('month'),day:get('day')};};
  const currentMonth=()=>{const now=cairoNowParts();return Array.isArray(MONTHS)?MONTHS[Math.max(0,now.month-1)]:'';};
  const schoolYear=()=>{const now=cairoNowParts(),start=now.month>=7?now.year:now.year-1;return `${start}/${start+1}`;};
  const cairoDate=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=type=>parts.find(item=>item.type===type)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`;};
  const statusOf=(expected,paid)=>number(paid)<=0?'unpaid':number(expected)>number(paid)?'partial':'paid';
  const statusLabel=status=>status==='paid'?'مدفوع بالكامل':status==='partial'?'دفع جزئي':'لم يدفع';
  const statusClass=status=>status==='paid'?'good':status==='partial'?'warn':'danger';
  const coursePrices=()=>adminData?.settings?.coursePrices&&typeof adminData.settings.coursePrices==='object'?adminData.settings.coursePrices:{};
  const coursePrice=student=>number(coursePrices()[String(student?.grade||'')]);
  const transactionDate=row=>String(row?.paymentDate||'');
  const safeId=value=>String(value||'').replace(/[^A-Za-z0-9_-]/g,'');
  const spreadsheetSafe=value=>{const text=String(value??'');return /^[=+\-@]/.test(text)?`'${text}`:text;};

  function filters(){
    return {
      query:normalizeText(document.getElementById('paymentSearch')?.value||''),
      grade:document.getElementById('paymentGrade')?.value||'all',
      month:document.getElementById('paymentMonth')?.value||currentMonth(),
      academicYear:document.getElementById('paymentAcademicYear')?.value||schoolYear(),
      status:document.getElementById('paymentStatus')?.value||'all'
    };
  }

  function findSummary(student,month,academicYear){
    const code=stCode(student);
    return state.summaries.find(row=>String(row.studentCode||'')===String(code)&&String(row.month||'')===String(month)&&String(row.academicYear||'')===String(academicYear)&&String(row.course||student.grade||'')===String(student.grade||''));
  }

  function periodRows(){
    const selected=filters();
    const students=(adminData.students||[]).map(normalizeStudent).filter(student=>student.active!==false&&(selected.grade==='all'||student.grade===selected.grade)&&(!selected.query||normalizeText(`${student.name} ${student.studentCode} ${student.parentPhone||''}`).includes(selected.query)));
    let rows=[];
    if(selected.month==='all'){
      const map=new Map(students.map(student=>[stCode(student),student]));
      rows=state.summaries.filter(summary=>map.has(String(summary.studentCode||''))&&(selected.academicYear==='all'||summary.academicYear===selected.academicYear)).map(summary=>{
        const student=map.get(String(summary.studentCode||''));
        const expected=number(summary.expectedAmount||coursePrice(student));
        const paid=number(summary.paidAmount);
        return {student,summary,month:summary.month,academicYear:summary.academicYear,expected,paid,remaining:Math.max(0,expected-paid),status:summary.status||statusOf(expected,paid)};
      });
    }else{
      rows=students.map(student=>{
        const academicYear=selected.academicYear==='all'?(student.academicYear||schoolYear()):selected.academicYear;
        const summary=findSummary(student,selected.month,academicYear),expected=number(summary?.expectedAmount||coursePrice(student)),paid=number(summary?.paidAmount);
        return {student,summary,month:selected.month,academicYear,expected,paid,remaining:Math.max(0,expected-paid),status:summary?.status||statusOf(expected,paid)};
      });
    }
    return rows.filter(row=>selected.status==='all'||row.status===selected.status);
  }

  function matchingTransactions(activeOnly=false){
    const selected=filters();
    const allowedStudents=new Set((adminData.students||[]).map(normalizeStudent).filter(student=>student.active!==false&&(selected.grade==='all'||student.grade===selected.grade)).map(stCode));
    return state.transactions.filter(row=>allowedStudents.has(String(row.studentCode||''))&&(selected.month==='all'||row.month===selected.month)&&(selected.academicYear==='all'||row.academicYear===selected.academicYear)&&(!activeOnly||row.status!=='cancelled'));
  }

  function transactionHistory(row){
    const rowCourse=String(row.summary?.course||row.student.grade||'');
    const items=state.transactions.filter(item=>String(item.studentCode||'')===String(stCode(row.student))&&String(item.month||'')===String(row.month)&&String(item.academicYear||'')===String(row.academicYear)&&String(item.course||'')===rowCourse).sort((a,b)=>String(b.paymentDate||'').localeCompare(String(a.paymentDate||'')));
    if(!items.length)return '<p class="section-desc">لا توجد عمليات مسجلة لهذا الشهر.</p>';
    const adminRole=typeof currentStaff!=='undefined'&&currentStaff?.role==='admin';
    return `<div class="payment-history-list">${items.map(item=>`<article class="payment-history-item ${item.status==='cancelled'?'is-cancelled':''}"><div><b>${safe(money(item.amount))}</b><small>${safe(item.paymentDate||'-')} · ${safe(paymentMethodLabel(item.paymentMethod))} · ${safe(item.recordedByEmail||item.recordedByRole||'-')}</small>${item.notes?`<p>${safe(item.notes)}</p>`:''}</div><span class="badge ${item.status==='cancelled'?'danger':'good'}">${item.status==='cancelled'?'ملغاة':'نشطة'}</span>${adminRole&&item.status!=='cancelled'?`<div class="payment-history-actions"><button type="button" class="small-btn" onclick="openPaymentTransactionEditor('${safeId(item.id)}')">تعديل</button><button type="button" class="small-btn danger" onclick="cancelMonthlyPayment('${safeId(item.id)}')">إلغاء</button></div>`:''}</article>`).join('')}</div>`;
  }

  function paymentMethodLabel(value){return ({cash:'نقدي',transfer:'تحويل بنكي',wallet:'محفظة إلكترونية',card:'بطاقة',legacy:'بيانات قديمة',other:'أخرى'})[value]||value||'نقدي';}

  function paymentCard(row){
    const code=stCode(row.student),pending=state.pending.has(code),rowCourse=row.summary?.course||row.student.grade||'-';
    const buttonLabel=pending?'جارٍ الحفظ…':row.remaining<=0?'تم الدفع':'تم الدفع';
    return `<article class="monthly-payment-card quick-payment-card ${pending?'is-saving':''}"><div class="monthly-payment-main"><span class="student-avatar">${safe(String(row.student.name||'ط').charAt(0))}</span><div><b>${safe(row.student.name)}</b><small>${safe(code)} · ${safe(rowCourse)}</small><span>السعر <strong>${safe(money(row.expected))}</strong>${row.paid>0?` · المحصل <strong>${safe(money(row.paid))}</strong>`:''}</span></div><span class="badge ${statusClass(row.status)}">${statusLabel(row.status)}</span></div><button class="btn primary quick-paid-button" type="button" ${pending||row.remaining<=0||row.expected<=0?'disabled':''} onclick="markStudentPaid('${safe(code)}','${safe(row.month)}','${safe(row.academicYear)}')">${buttonLabel}</button>${row.expected<=0?'<small class="payment-price-warning">أضف سعر الصف أولًا</small>':''}</article>`;
  }

  function updateDashboard(){
    const rows=periodRows(),transactions=matchingTransactions(true),today=cairoDate();
    const expected=rows.reduce((sum,row)=>sum+row.expected,0),collected=rows.reduce((sum,row)=>sum+row.paid,0),todayCollected=transactions.filter(row=>transactionDate(row)===today).reduce((sum,row)=>sum+number(row.amount),0);
    const totals={paymentToday:money(todayCollected),paymentCollected:money(collected),paymentExpected:money(expected),paymentRemaining:money(Math.max(0,expected-collected)),paymentPaidCount:rows.filter(row=>row.status==='paid').length,paymentPartialCount:rows.filter(row=>row.status==='partial').length,paymentUnpaidCount:rows.filter(row=>row.status==='unpaid').length};
    Object.entries(totals).forEach(([id,value])=>{const element=document.getElementById(id);if(element)element.textContent=String(value);});
    const courseMap=new Map();rows.forEach(row=>{const course=String(row.summary?.course||row.student.grade||'بدون مسار'),current=courseMap.get(course)||{expected:0,paid:0,students:0};current.expected+=row.expected;current.paid+=row.paid;current.students+=1;courseMap.set(course,current);});
    const courseBox=document.getElementById('paymentCourseTotals');if(courseBox)courseBox.innerHTML=[...courseMap.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ar')).map(([course,total])=>`<article><span>${safe(course)}</span><b>${safe(money(total.paid))}</b><small>من ${safe(money(total.expected))} · ${total.students} طالب</small></article>`).join('')||'<span class="section-desc">لا توجد مسارات مطابقة.</span>';
    const box=document.getElementById('paymentRows');if(box)box.innerHTML=rows.map(paymentCard).join('')||'<div class="empty-state"><h3>لا توجد نتائج مطابقة</h3><p>غيّر الفلاتر أو أضف سعر الكورس أولًا.</p></div>';
  }

  function startListeners(){
    if(state.listenersStarted||!window.MFCloud?.subscribeMonthlyPayments)return;
    state.listenersStarted=true;
    state.summaryUnsubscribe=window.MFCloud.subscribeMonthlyPayments((rows,_changes,error)=>{if(error){aToast('تعذر تحديث ملخصات المدفوعات');return;}state.summaries=Array.isArray(rows)?rows:[];updateDashboard();});
    state.transactionUnsubscribe=window.MFCloud.subscribePaymentTransactions((rows,_changes,error)=>{if(error){aToast('تعذر تحديث سجل عمليات الدفع');return;}state.transactions=Array.isArray(rows)?rows:[];updateDashboard();});
  }

  window.stopMonthlyPaymentListeners=function(){state.summaryUnsubscribe?.();state.transactionUnsubscribe?.();state.summaryUnsubscribe=null;state.transactionUnsubscribe=null;state.listenersStarted=false;};
  window.refreshPaymentRows=updateDashboard;
  window.refreshPaymentDashboard=updateDashboard;
  window.togglePaymentHistory=function(button){const shell=button.closest('.monthly-payment-card')?.querySelector('.payment-history-shell');if(!shell)return;shell.hidden=!shell.hidden;button.textContent=shell.hidden?'سجل الدفعات':'إخفاء السجل';};

  window.markStudentPaid=async function(code,month=currentMonth(),academicYear=schoolYear()){
    const student=(adminData.students||[]).map(normalizeStudent).find(item=>stCode(item)===String(code));
    if(!student)return aToast('الطالب غير موجود');
    if(state.pending.has(code))return;
    const summary=findSummary(student,month,academicYear),expected=number(summary?.expectedAmount||coursePrice(student)),remaining=Math.max(0,expected-number(summary?.paidAmount));
    if(expected<=0)return aToast('حدد سعر هذا الصف من قسم أسعار الصفوف أولًا');
    if(remaining<=0)return aToast('الطالب مسجل مدفوعًا بالكامل لهذا الشهر');
    const monthIndex=Math.max(0,MONTHS.indexOf(month)+1),requestId=`quick-${String(code).replace(/[^A-Za-z0-9_-]/g,'')}-${String(academicYear).replace(/[^0-9]/g,'')}-${monthIndex}-${Math.round(remaining*100)}`;
    state.pending.add(code);updateDashboard();
    try{
      const result=await window.MFCloud.createPaymentTransaction({studentCode:code,month,academicYear,course:student.grade,expectedAmount:expected,amount:remaining,paymentDate:cairoDate(),paymentMethod:'cash',notes:'تم الدفع من كارت الطالب',requestId});
      aToast(result?.duplicate?'الدفعة مسجلة من قبل':'تم الدفع وإضافة سعر الطالب للمحصل');
    }catch(error){aToast(adminActionErrorMessage(error,'تعذر تسجيل الدفع. لم يتم تغيير الإجمالي.'));}
    finally{state.pending.delete(code);updateDashboard();}
  };

  window.openMonthlyPaymentForm=function(code,month=currentMonth(),academicYear=schoolYear(),transactionId=''){
    const student=(adminData.students||[]).map(normalizeStudent).find(item=>stCode(item)===String(code));if(!student)return aToast('الطالب غير موجود');
    const transaction=transactionId?state.transactions.find(item=>String(item.id)===String(transactionId)):null;
    const summary=findSummary(student,month,academicYear),expected=number(summary?.expectedAmount||coursePrice(student)),remaining=Math.max(0,expected-number(summary?.paidAmount));
    if(!transaction&&expected<=0)return aToast('حدد سعر هذا الكورس من قسم أسعار الكورسات أولًا');
    let modal=document.getElementById('monthlyPaymentModal');if(!modal){modal=document.createElement('div');modal.id='monthlyPaymentModal';modal.className='admin-action-modal';document.body.appendChild(modal);}
    modal.innerHTML=`<div class="admin-action-dialog payment-dialog" role="dialog" aria-modal="true" aria-labelledby="paymentDialogTitle"><button class="modal-close" type="button" onclick="closeMonthlyPaymentForm()" aria-label="إغلاق">×</button><span class="kicker">${transaction?'تعديل عملية':'دفعة شهرية جديدة'}</span><h3 id="paymentDialogTitle">${safe(student.name)}</h3><form id="monthlyPaymentForm" class="grid"><input type="hidden" name="studentCode" value="${safe(code)}"><input type="hidden" name="transactionId" value="${safeId(transactionId)}"><div class="grid grid-2"><label class="field"><span>الشهر</span><select name="month" ${transaction?'disabled':''}>${MONTHS.map(item=>`<option ${item===month?'selected':''}>${safe(item)}</option>`).join('')}</select></label><label class="field"><span>السنة الدراسية</span><input name="academicYear" maxlength="30" value="${safe(academicYear)}" ${transaction?'readonly':''} required></label></div><label class="field"><span>المسار أو الكورس</span><input name="course" value="${safe(transaction?.course||student.grade||'')}" readonly></label><div class="grid grid-2"><label class="field"><span>السعر المطلوب</span><input name="expectedAmount" inputmode="decimal" data-digits-only value="${safe(transaction?.expectedAmount||expected)}" readonly></label><label class="field"><span>المبلغ ${transaction?'بعد التعديل':`(المتبقي ${money(remaining)})`}</span><input name="amount" type="text" inputmode="decimal" data-digits-only value="${safe(transaction?.amount||remaining||'')}" required></label></div><div class="grid grid-2"><label class="field"><span>تاريخ الدفع</span><input name="paymentDate" type="date" value="${safe(transaction?.paymentDate||cairoDate())}" required></label><label class="field"><span>طريقة الدفع</span><select name="paymentMethod"><option value="cash">نقدي</option><option value="transfer">تحويل بنكي</option><option value="wallet">محفظة إلكترونية</option><option value="card">بطاقة</option><option value="other">أخرى</option></select></label></div><label class="field"><span>ملاحظات</span><textarea name="notes" maxlength="1000" placeholder="ملاحظات اختيارية">${safe(transaction?.notes||'')}</textarea></label><div id="paymentFormState" class="form-state" aria-live="polite"></div><div class="booking-step-actions"><button class="btn ghost" type="button" onclick="closeMonthlyPaymentForm()">إلغاء</button><button class="btn primary" type="submit">${transaction?'حفظ التعديل':'تسجيل الدفعة'}</button></div></form></div>`;
    const form=modal.querySelector('form');form.elements.paymentMethod.value=transaction?.paymentMethod||'cash';form.addEventListener('submit',submitPaymentForm);modal.classList.add('show');form.elements.amount.focus();
  };
  window.closeMonthlyPaymentForm=function(){document.getElementById('monthlyPaymentModal')?.classList.remove('show');};
  window.openPaymentTransactionEditor=function(id){const transaction=state.transactions.find(item=>String(item.id)===String(id));if(!transaction)return aToast('عملية الدفع غير موجودة');openMonthlyPaymentForm(transaction.studentCode,transaction.month,transaction.academicYear,transaction.id);};

  async function submitPaymentForm(event){
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]'),data=Object.fromEntries(new FormData(form).entries()),code=String(data.studentCode||''),transactionId=String(data.transactionId||''),stateBox=document.getElementById('paymentFormState');
    data.amount=number(data.amount);data.expectedAmount=number(data.expectedAmount);data.month=form.elements.month.value;data.requestId=crypto.randomUUID?crypto.randomUUID():`pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if(data.amount<=0)return aToast('اكتب مبلغًا صحيحًا أكبر من صفر');if(state.pending.has(transactionId||code))return;
    state.pending.add(transactionId||code);button.disabled=true;button.classList.add('is-loading');if(stateBox){stateBox.className='form-state loading';stateBox.textContent='جارٍ حفظ العملية بأمان…';}
    try{if(transactionId)await window.MFCloud.editPaymentTransaction({...data,transactionId});else await window.MFCloud.createPaymentTransaction(data);if(stateBox){stateBox.className='form-state success';stateBox.textContent='تم حفظ العملية بنجاح.';}aToast(transactionId?'تم تعديل الدفعة':'تم تسجيل الدفعة الشهرية');setTimeout(closeMonthlyPaymentForm,500);}
    catch(error){const message=adminActionErrorMessage(error,'تعذر حفظ عملية الدفع.');if(stateBox){stateBox.className='form-state error';stateBox.textContent=message;}aToast(message);}
    finally{state.pending.delete(transactionId||code);button.disabled=false;button.classList.remove('is-loading');updateDashboard();}
  }

  window.cancelMonthlyPayment=async function(id){
    if(state.pending.has(id))return;const reason=prompt('سبب إلغاء الدفعة (سيظهر في سجل العمليات):','خطأ في التسجيل');if(reason===null)return;
    state.pending.add(id);try{await window.MFCloud.cancelPaymentTransaction(id,reason);aToast('تم إلغاء الدفعة مع الاحتفاظ بها في السجل');}catch(error){aToast(adminActionErrorMessage(error,'تعذر إلغاء الدفعة.'));}finally{state.pending.delete(id);updateDashboard();}
  };

  function exportRows(){return periodRows().map(row=>[row.student.studentCode,row.student.name,row.student.grade,row.student.group||'',row.month,row.academicYear,row.expected,row.paid,row.remaining,statusLabel(row.status),row.summary?.lastPaymentDate||'']);}
  window.exportCenterSubscriptionsCSV=function(){const headers=['كود الطالب','اسم الطالب','المسار','المجموعة','الشهر','العام الدراسي','المطلوب','المدفوع','المتبقي','الحالة','آخر دفعة'],cell=value=>`"${spreadsheetSafe(value).replace(/"/g,'""')}"`,csv='\ufeff'+[headers,...exportRows()].map(row=>row.map(cell).join(',')).join('\n'),link=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.href=url;link.download=`techno-minds-monthly-payments-${cairoDate()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1200);};
  window.exportMonthlyPaymentsExcel=async function(){try{await window.MFAssets?.loadSpreadsheet?.();if(typeof XLSX==='undefined')throw new Error('XLSX unavailable');const data=[['كود الطالب','اسم الطالب','المسار','المجموعة','الشهر','العام الدراسي','المطلوب','المدفوع','المتبقي','الحالة','آخر دفعة'],...exportRows()].map(row=>row.map(spreadsheetSafe)),book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(data);XLSX.utils.book_append_sheet(book,sheet,'المدفوعات');XLSX.writeFile(book,`techno-minds-monthly-payments-${cairoDate()}.xlsx`);}catch(error){aToast('تعذر تجهيز ملف Excel، استخدم CSV');}};

  window.runLegacyPaymentMigration=async function(){if(typeof currentStaff!=='undefined'&&currentStaff?.role!=='admin')return aToast('ترحيل البيانات القديمة متاح للمدير فقط');if(!confirm('سيتم إنشاء نسخة احتياطية سحابية أولًا ثم نسخ paid/paymentAmount إلى السجل الشهري دون حذف البيانات القديمة. متابعة؟'))return;const button=document.getElementById('legacyPaymentMigrationButton');if(button)button.disabled=true;try{const result=await window.MFCloud.migrateLegacyPayments();aToast(`تم ترحيل ${result.migrated||0} سجل، وتخطي ${result.skipped||0} مكرر`);}catch(error){aToast(adminActionErrorMessage(error,'تعذر ترحيل المدفوعات القديمة.'));}finally{if(button)button.disabled=false;}};

  window.saveCoursePrices=async function(){const button=document.getElementById('saveCoursePricesButton');if(button?.disabled)return;const previous={...(adminData.settings?.coursePrices||{})},next={};document.querySelectorAll('[data-course-price]').forEach(input=>{next[input.dataset.coursePrice]=number(input.value);});adminData.settings={...(adminData.settings||{}),coursePrices:next};try{button.disabled=true;await window.MFCloud.saveSettings(adminData.settings);saveData(adminData);aToast('تم حفظ أسعار الكورسات');updateDashboard();}catch(error){adminData.settings={...(adminData.settings||{}),coursePrices:previous};aToast(adminActionErrorMessage(error,'تعذر حفظ الأسعار.'));}finally{button.disabled=false;}};

  function academicYears(){return [...new Set([schoolYear(),...(adminData.students||[]).map(row=>row.academicYear).filter(Boolean),...state.summaries.map(row=>row.academicYear).filter(Boolean)])];}
  const renderPaymentsV606=function(){
    fresh();const prices=coursePrices(),defaultYear=adminData.settings?.academicYear||schoolYear();
    content(`<div class="section-head compact-admin-head"><div><span class="kicker"><span data-icon="database"></span> المدفوعات</span><h2 class="section-title">الدفع والخزنة</h2><p class="section-desc">اضغط «تم الدفع» في كارت الطالب؛ سيُضاف سعر صفه تلقائيًا للمحصل في الأعلى.</p></div><div class="payment-export-actions"><button class="btn ghost" type="button" onclick="exportCenterSubscriptionsCSV()">CSV</button><button class="btn ghost" type="button" onclick="exportMonthlyPaymentsExcel()">Excel</button></div></div><div class="payment-financial-kpis payment-kpis-v606"><article class="collected"><small>مقبوضات اليوم</small><b id="paymentToday">0 ج.م</b><span>عمليات نشطة اليوم</span></article><article class="collected"><small>إجمالي المحصل</small><b id="paymentCollected">0 ج.م</b><span><b id="paymentPaidCount">0</b> طالب تم الدفع لهم</span></article><article><small>المتوقع تحصيله</small><b id="paymentExpected">0 ج.م</b><span>للطلاب النشطين فقط</span></article><article class="remaining"><small>المتبقي</small><b id="paymentRemaining">0 ج.م</b><span><b id="paymentPartialCount">0</b> جزئي · <b id="paymentUnpaidCount">0</b> لم يدفعوا</span></article></div><div id="paymentCourseTotals" class="payment-course-totals" aria-label="إجماليات المسارات"></div><details class="card course-price-editor"><summary><span><b>أسعار الصفوف والكورسات</b><small>السعر هو المبلغ الذي سيُضاف عند الضغط على «تم الدفع»</small></span><span data-icon="settings"></span></summary><div class="course-price-grid">${GRADES.map(grade=>`<label><span>${safe(grade)}</span><div><input type="text" inputmode="decimal" data-digits-only data-course-price="${safe(grade)}" value="${safe(number(prices[grade]))}" aria-label="سعر ${safe(grade)}"><small>جنيه</small></div></label>`).join('')}</div><div class="payment-settings-actions"><button class="btn primary" id="saveCoursePricesButton" type="button" onclick="saveCoursePrices()">حفظ الأسعار</button><button class="btn ghost" id="legacyPaymentMigrationButton" type="button" onclick="runLegacyPaymentMigration()">ترحيل الدفعات القديمة</button></div></details><div class="card payment-panel"><div class="payment-toolbar payment-toolbar-v606"><input id="paymentSearch" type="search" placeholder="بحث بالاسم أو الكود" oninput="refreshPaymentRows()"><select id="paymentGrade" onchange="refreshPaymentRows()"><option value="all">كل المسارات</option>${GRADES.map(grade=>`<option>${safe(grade)}</option>`).join('')}</select><select id="paymentMonth" onchange="refreshPaymentRows()"><option value="all">كل الشهور المسجلة</option>${MONTHS.map(month=>`<option ${month===currentMonth()?'selected':''}>${safe(month)}</option>`).join('')}</select><select id="paymentAcademicYear" onchange="refreshPaymentRows()"><option value="all">كل الأعوام</option>${academicYears().map(year=>`<option ${year===defaultYear?'selected':''}>${safe(year)}</option>`).join('')}</select><select id="paymentStatus" onchange="refreshPaymentRows()"><option value="all">كل الحالات</option><option value="paid">تم الدفع</option><option value="partial">دفع جزئي قديم</option><option value="unpaid">لم يدفع</option></select></div><p class="payment-filter-note">الأرقام والكروت تتحدث مباشرة بعد الدفع، ولا يتم احتساب الطلاب غير النشطين.</p><div id="paymentRows" class="monthly-payment-list quick-payment-grid"><div class="loading-state">جارٍ تحميل الطلاب…</div></div></div>`);
    startListeners();updateDashboard();hydrateIcons();
  };

  // V53/V55 contain compatibility renderers used by older deployments and
  // attach them during DOMContentLoaded. Re-install the V60.6 ledger after
  // those hooks so timing can never restore the destructive paid/unpaid UI.
  const installV606PaymentHandlers=()=>{
    window.renderPayments=renderPaymentsV606;
    window.setPaid=(code,value)=>value?window.markStudentPaid(code):aToast('إلغاء الدفع متاح للمدير من سجل العمليات');
  };
  installV606PaymentHandlers();
  document.addEventListener('DOMContentLoaded',()=>{installV606PaymentHandlers();setTimeout(installV606PaymentHandlers,0);});

})();
