(function(){
  'use strict';

  const state={summaries:[],transactions:[],rows:[],totals:null,courses:{},pending:new Set(),intents:new Map(),loading:false,error:'',nextCursor:null,generation:0};
  let refreshTimer,modalReturnFocus;
  const newRequestId=()=>(crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''));
  const number=value=>{const normalized=String(value??'').replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776));const parsed=Number(normalized.replace(/[^0-9.-]/g,''));return Number.isFinite(parsed)&&parsed>=0?Math.round((parsed+Number.EPSILON)*100)/100:0;};
  const money=value=>`${new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(number(value))} ج.م`;
  const cairoNowParts=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),get=type=>Number(parts.find(item=>item.type===type)?.value||0);return {year:get('year'),month:get('month'),day:get('day')};};
  const currentMonth=()=>{const selected=window.adminWorkspaceContext?.().month;if(selected)return selected;const now=cairoNowParts();return Array.isArray(MONTHS)?MONTHS[Math.max(0,now.month-1)]:'';};
  const schoolYear=()=>{const selected=window.adminWorkspaceContext?.().academicYear;if(selected)return selected;const now=cairoNowParts(),start=now.month>=7?now.year:now.year-1;return `${start}/${start+1}`;};
  const cairoDate=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=type=>parts.find(item=>item.type===type)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`;};
  const statusOf=(expected,paid)=>number(paid)<=0?'unpaid':number(expected)>number(paid)?'partial':'paid';
  const statusLabel=status=>status==='paid'?'مدفوع بالكامل':status==='partial'?'دفع جزئي':'لم يدفع';
  const statusClass=status=>status==='paid'?'good':status==='partial'?'warn':'danger';
  const coursePrices=()=>adminData?.settings?.coursePrices&&typeof adminData.settings.coursePrices==='object'?adminData.settings.coursePrices:{};
  const coursePrice=student=>{const prices=coursePrices(),key=Object.keys(prices).find(name=>adminSameAcademic(name,student?.grade));return number(prices[key??String(student?.grade||'')]);};
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
    return state.summaries.find(row=>String(row.studentCode||'')===String(code)&&String(row.month||'')===String(month)&&String(row.academicYear||'')===String(academicYear)&&adminSameAcademic(row.course||student.grade,student.grade));
  }

  function periodRows(){return state.rows;}

  function transactionHistory(row){
    const rowCourse=String(row.summary?.course||row.student.grade||'');
    const items=state.transactions.filter(item=>String(item.studentCode||'')===String(stCode(row.student))&&String(item.month||'')===String(row.month)&&String(item.academicYear||'')===String(row.academicYear)&&adminSameAcademic(item.course,rowCourse)).sort((a,b)=>String(b.paymentDate||'').localeCompare(String(a.paymentDate||'')));
    if(!items.length)return '<p class="section-desc">لا توجد عمليات مسجلة لهذا الشهر.</p>';
    const adminRole=typeof currentStaff!=='undefined'&&currentStaff?.role==='admin';
    return `<div class="payment-history-list">${items.map(item=>`<article class="payment-history-item ${item.status==='cancelled'?'is-cancelled':''}"><div><b>${safe(money(item.amount))}</b><small>${safe(item.paymentDate||'-')} · ${safe(paymentMethodLabel(item.paymentMethod))} · ${safe(item.recordedByEmail||item.recordedByRole||'-')}</small>${item.notes?`<p>${safe(item.notes)}</p>`:''}</div><span class="badge ${item.status==='cancelled'?'danger':'good'}">${item.status==='cancelled'?'ملغاة':'نشطة'}</span>${adminRole&&item.status!=='cancelled'?`<div class="payment-history-actions"><button type="button" class="small-btn" onclick="openPaymentTransactionEditor('${safeId(item.id)}')">تعديل</button><button type="button" class="small-btn danger" onclick="cancelMonthlyPayment('${safeId(item.id)}')">إلغاء</button></div>`:''}</article>`).join('')}</div>`;
  }

  function paymentMethodLabel(value){return ({cash:'نقدي',transfer:'تحويل بنكي',wallet:'محفظة إلكترونية',card:'بطاقة',legacy:'بيانات قديمة',other:'أخرى'})[value]||value||'نقدي';}

  function paymentCard(row){
    const code=stCode(row.student),pending=state.pending.has(code),rowCourse=row.summary?.course||row.student.grade||'-';
    const buttonLabel=pending?'جارٍ الحفظ…':row.remaining<=0?'تم الدفع':'تم الدفع';
    return `<article data-payment-key="${safe(row.key)}" class="monthly-payment-card quick-payment-card ${pending?'is-saving':''}"><div class="monthly-payment-main"><span class="student-avatar">${safe(String(row.student.name||'ط').charAt(0))}</span><div><b>${safe(row.student.name)}</b><small>${safe(code)} · ${safe(rowCourse)}</small><span>السعر <strong>${safe(money(row.expected))}</strong>${row.paid>0?` · المحصل <strong>${safe(money(row.paid))}</strong>`:''}</span></div><span class="badge ${statusClass(row.status)}">${statusLabel(row.status)}</span></div><button class="btn primary quick-paid-button" type="button" ${pending||row.remaining<=0||row.expected<=0?'disabled':''} onclick="markStudentPaid('${safe(code)}','${safe(row.month)}','${safe(row.academicYear)}','${safe(rowCourse)}')">${buttonLabel}</button><div class="payment-history-actions"><button class="small-btn" type="button" onclick="openMonthlyPaymentForm('${safe(code)}','${safe(row.month)}','${safe(row.academicYear)}','','${safe(rowCourse)}')" ${pending||row.remaining<=0?'disabled':''}>دفع جزئي</button><button class="small-btn" type="button" onclick="togglePaymentHistory(this)">سجل الدفعات</button></div><div class="payment-history-shell" hidden></div>${row.expected<=0?'<small class="payment-price-warning">أضف سعر الصف أولًا</small>':''}</article>`;
  }

  function updateDashboard(){
    const t=state.totals,unknown=state.loading&&!t?'جارٍ التحميل…':state.error?'تعذر التحميل':'—';
    const values={paymentToday:t?money(t.today):unknown,paymentCollected:t?money(t.collected):unknown,paymentExpected:t?money(t.expected):unknown,paymentRemaining:t?money(t.remaining):unknown,paymentPaidCount:t?.paid??'—',paymentPartialCount:t?.partial??'—',paymentUnpaidCount:t?.unpaid??'—'};
    Object.entries(values).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value;});
    const courses=document.getElementById('paymentCourseTotals');if(courses)courses.innerHTML=Object.entries(state.courses).map(([name,t])=>`<article><span>${safe(name)}</span><b>${safe(money(t.paid))}</b><small>من ${safe(money(t.expected))}</small></article>`).join('');
    const box=document.getElementById('paymentRows');if(box)box.innerHTML=state.error?`<p role="alert">${safe(state.error)}</p><button type="button" class="btn" onclick="refreshPaymentDashboard()">إعادة المحاولة</button>`:state.rows.map(paymentCard).join('')+(state.loading?'<p role="status">جارٍ تحميل المدفوعات…</p>':state.nextCursor?'<button type="button" class="btn ghost" onclick="loadMorePayments()">المزيد من الطلاب</button>':state.rows.length?'':'<p>لا توجد نتائج مطابقة.</p>');
    const note=document.querySelector('.payment-filter-note');if(note)note.textContent=state.generatedAt?`الإجماليات لكل النتائج المطابقة، والقائمة على صفحات. آخر تحديث ${new Date(state.generatedAt).toLocaleTimeString('ar-EG')}؛ قد يتأخر تحديث جهاز آخر حتى 15 ثانية.`:'جارٍ تحميل ملخص الفترة من الخادم؛ لم تُحدد حالة الدفع بعد.';
  }
  function applyPaymentResult(row,result,paymentDate){
    if(!row||!result)return;
    const before={expected:number(row.expected),paid:number(row.paid),remaining:number(row.remaining),status:row.status};
    row.expected=number(result.expectedAmount??row.expected);row.paid=number(result.paidAmount??row.paid);row.remaining=number(result.remainingAmount??Math.max(0,row.expected-row.paid));row.status=result.status||statusOf(row.expected,row.paid);
    row.summary={...(row.summary||{}),studentCode:row.student.studentCode,course:row.summary?.course||row.student.grade,month:row.month,academicYear:row.academicYear,expectedAmount:row.expected,paidAmount:row.paid,remainingAmount:row.remaining,status:row.status,lastPaymentDate:paymentDate||row.summary?.lastPaymentDate||''};
    const summaryIndex=state.summaries.findIndex(item=>item&&item.studentCode===row.student.studentCode&&item.month===row.month&&item.academicYear===row.academicYear&&adminSameAcademic(item.course,row.summary.course));if(summaryIndex>=0)state.summaries[summaryIndex]=row.summary;else state.summaries.push(row.summary);
    if(state.totals){state.totals.expected=number(state.totals.expected)+row.expected-before.expected;state.totals.collected=number(state.totals.collected)+row.paid-before.paid;state.totals.remaining=number(state.totals.remaining)+row.remaining-before.remaining;if(before.status!==row.status){state.totals[before.status]=Math.max(0,Number(state.totals[before.status]||0)-1);state.totals[row.status]=Number(state.totals[row.status]||0)+1;}if(paymentDate===cairoDate())state.totals.today=number(state.totals.today)+row.paid-before.paid;}
    const courseName=row.summary.course,courseKey=Object.keys(state.courses).find(name=>adminSameAcademic(name,courseName))||courseName,courseTotals=state.courses[courseKey];if(courseTotals){courseTotals.expected=number(courseTotals.expected)+row.expected-before.expected;courseTotals.paid=number(courseTotals.paid)+row.paid-before.paid;}
    state.generatedAt=new Date().toISOString();
  }
  function scheduleDashboardRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>loadDashboard({background:true}),15000);}
  async function loadDashboard({append=false,force=false,background=false}={}){
    if(append&&state.loading)return;
    const generation=++state.generation;state.loading=true;state.error='';
    if(!append&&!background){state.rows=[];state.totals=null;state.courses={};state.summaries=[];}updateDashboard();
    try{const result=await window.MFCloud.getPaymentDashboard({...filters(),cursor:append?state.nextCursor:null,force});if(generation!==state.generation)return;
      state.rows=append?[...state.rows,...result.rows]:result.rows;state.summaries=state.rows.map(row=>row.summary).filter(Boolean);state.totals=result.totals;state.courses=result.courses;state.nextCursor=result.nextCursor;state.generatedAt=result.generatedAt;
    }catch(error){if(generation===state.generation)state.error=adminActionErrorMessage(error,'تعذر تحميل المدفوعات؛ الحالة غير معروفة.');}
    finally{if(generation===state.generation){state.loading=false;updateDashboard();}}
  }
  function startListeners(){loadDashboard();}
  window.stopMonthlyPaymentListeners=function(){clearTimeout(refreshTimer);state.generation++;state.rows=[];state.totals=null;state.transactions=[];};
  window.refreshPaymentRows=function(){clearTimeout(refreshTimer);state.loading=true;state.rows=[];state.totals=null;updateDashboard();refreshTimer=setTimeout(()=>loadDashboard(),180);};
  window.refreshPaymentDashboard=()=>loadDashboard({force:true});
  window.loadMorePayments=()=>loadDashboard({append:true});
  window.togglePaymentHistory=async function(button){
    const card=button.closest('.monthly-payment-card'),shell=card.querySelector('.payment-history-shell'),row=state.rows.find(r=>r.key===card.dataset.paymentKey);if(!row)return;
    if(!shell.hidden&&!button.dataset.cursor){shell.hidden=true;button.textContent='سجل الدفعات';return;}
    shell.hidden=false;shell.innerHTML='<p role="status">جارٍ تحميل سجل الدفعات…</p>';button.disabled=true;
    try{const result=await window.MFCloud.getPaymentHistory({studentCode:row.student.studentCode,month:row.month,academicYear:row.academicYear,course:row.summary?.course||row.student.grade,cursor:button.dataset.cursor||null});state.transactions=[...state.transactions.filter(t=>!result.rows.some(x=>x.id===t.id)),...result.rows];shell.innerHTML=transactionHistory(row);button.dataset.cursor=result.nextCursor||'';button.textContent=result.nextCursor?'تحميل المزيد من السجل':'إخفاء السجل';}
    catch(error){shell.textContent=adminActionErrorMessage(error,'تعذر تحميل السجل.');}finally{button.disabled=false;}
  };

  window.markStudentPaid=async function(code,month=currentMonth(),academicYear=schoolYear(),course=''){
    const row=state.rows.find(r=>r.student.studentCode===code&&r.month===month&&r.academicYear===academicYear&&(!course||(r.summary?.course||r.student.grade)===course));
    if(!row||state.loading)return aToast('انتظر تأكيد تحميل ملخص الفترة.');if(state.pending.has(code))return;
    if(row.expected<=0||row.remaining<=0)return;
    const key=JSON.stringify([code,month,academicYear,course||row.student.grade]);
    const payload=state.intents.get(key)||{studentCode:code,month,academicYear,course:course||row.student.grade,expectedAmount:row.expected,amount:row.remaining,paymentDate:cairoDate(),paymentMethod:'cash',notes:'تم الدفع من كارت الطالب',requestId:newRequestId()};
    state.intents.set(key,payload);state.pending.add(code);updateDashboard();
    try{const result=await window.MFCloud.createPaymentTransaction(payload);if(result?.transactionStatus!=='active')throw new Error('لم يؤكد الخادم دفعة نشطة');state.intents.delete(key);applyPaymentResult(row,result,payload.paymentDate);state.pending.delete(code);updateDashboard();scheduleDashboardRefresh();aToast(result.duplicate?'تم تأكيد الدفعة المسجلة سابقًا':'تم تأكيد الدفعة');}
    catch(error){if(!/unavailable|deadline|network|internal|timeout/i.test(`${error.code} ${error.message}`))state.intents.delete(key);aToast(adminActionErrorMessage(error,'تعذر تأكيد الدفع؛ إعادة المحاولة تحتفظ بمعرّف العملية.'));}
    finally{state.pending.delete(code);updateDashboard();}
  };

  window.openMonthlyPaymentForm=function(code,month=currentMonth(),academicYear=schoolYear(),transactionId='',course=''){
    const student=state.rows.find(row=>row.student.studentCode===String(code))?.student;if(!student)return aToast('انتظر تحميل الطالب.');
    const transaction=transactionId?state.transactions.find(item=>String(item.id)===String(transactionId)):null;
    const summary=state.summaries.find(row=>row.studentCode===String(code)&&row.month===month&&row.academicYear===academicYear&&row.course===(course||student.grade)),expected=number(summary?.expectedAmount||coursePrice(student)),remaining=Math.max(0,expected-number(summary?.paidAmount));
    if(!transaction&&expected<=0)return aToast('حدد سعر هذا الكورس من قسم أسعار الكورسات أولًا');
    let modal=document.getElementById('monthlyPaymentModal');if(!modal){modal=document.createElement('div');modal.id='monthlyPaymentModal';modal.className='admin-action-modal';document.body.appendChild(modal);}
    modal.innerHTML=`<div class="admin-action-dialog payment-dialog" role="dialog" aria-modal="true" aria-labelledby="paymentDialogTitle"><button class="modal-close" type="button" onclick="closeMonthlyPaymentForm()" aria-label="إغلاق">×</button><span class="kicker">${transaction?'تعديل عملية':'دفعة شهرية جديدة'}</span><h3 id="paymentDialogTitle">${safe(student.name)}</h3><form id="monthlyPaymentForm" class="grid"><input type="hidden" name="studentCode" value="${safe(code)}"><input type="hidden" name="transactionId" value="${safeId(transactionId)}"><div class="grid grid-2"><label class="field"><span>الشهر</span><select name="month" ${transaction?'disabled':''}>${MONTHS.map(item=>`<option ${item===month?'selected':''}>${safe(item)}</option>`).join('')}</select></label><label class="field"><span>السنة الدراسية</span><input name="academicYear" maxlength="30" value="${safe(academicYear)}" ${transaction?'readonly':''} required></label></div><label class="field"><span>المسار أو الكورس</span><input name="course" value="${safe(transaction?.course||course||student.grade||'')}" readonly></label><div class="grid grid-2"><label class="field"><span>السعر المطلوب</span><input name="expectedAmount" inputmode="decimal" data-digits-only value="${safe(transaction?.expectedAmount||expected)}" readonly></label><label class="field"><span>المبلغ ${transaction?'بعد التعديل':`(المتبقي ${money(remaining)})`}</span><input name="amount" type="text" inputmode="decimal" data-digits-only value="${safe(transaction?.amount||remaining||'')}" required></label></div><div class="grid grid-2"><label class="field"><span>تاريخ الدفع</span><input name="paymentDate" type="date" value="${safe(transaction?.paymentDate||cairoDate())}" required></label><label class="field"><span>طريقة الدفع</span><select name="paymentMethod"><option value="cash">نقدي</option><option value="transfer">تحويل بنكي</option><option value="wallet">محفظة إلكترونية</option><option value="card">بطاقة</option><option value="other">أخرى</option></select></label></div><label class="field"><span>ملاحظات</span><textarea name="notes" maxlength="1000" placeholder="ملاحظات اختيارية">${safe(transaction?.notes||'')}</textarea></label><div id="paymentFormState" class="form-state" aria-live="polite"></div><div class="booking-step-actions"><button class="btn ghost" type="button" onclick="closeMonthlyPaymentForm()">إلغاء</button><button class="btn primary" type="submit">${transaction?'حفظ التعديل':'تسجيل الدفعة'}</button></div></form></div>`;
    modalReturnFocus=document.activeElement;const form=modal.querySelector('form');form.elements.paymentMethod.value=transaction?.paymentMethod||'cash';form.addEventListener('submit',submitPaymentForm);modal.classList.add('show');document.documentElement.classList.add('payment-dialog-open');document.body.classList.add('payment-dialog-open');modal.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();closeMonthlyPaymentForm();}if(event.key==='Tab'){const items=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea')];const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};form.elements.amount.focus();
  };
  window.closeMonthlyPaymentForm=function(){const modal=document.getElementById('monthlyPaymentModal');if(modal?.querySelector('[type=submit]')?.disabled)return aToast('انتظر تأكيد العملية قبل الإغلاق.');modal?.classList.remove('show');document.documentElement.classList.remove('payment-dialog-open');document.body.classList.remove('payment-dialog-open');if(modalReturnFocus?.isConnected)modalReturnFocus.focus();};
  window.openPaymentTransactionEditor=function(id){const transaction=state.transactions.find(item=>String(item.id)===String(id));if(!transaction)return aToast('عملية الدفع غير موجودة');openMonthlyPaymentForm(transaction.studentCode,transaction.month,transaction.academicYear,transaction.id);};

  async function submitPaymentForm(event){
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]'),data=Object.fromEntries(new FormData(form).entries()),code=String(data.studentCode||''),transactionId=String(data.transactionId||''),stateBox=document.getElementById('paymentFormState');
    data.amount=number(data.amount);data.expectedAmount=number(data.expectedAmount);data.month=form.elements.month.value;const fingerprint=JSON.stringify(data);if(form.dataset.fingerprint!==fingerprint){form.dataset.requestId=newRequestId();form.dataset.fingerprint=fingerprint;}data.requestId=form.dataset.requestId;
    if(data.amount<=0)return aToast('اكتب مبلغًا صحيحًا أكبر من صفر');if(state.pending.has(transactionId||code))return;
    state.pending.add(transactionId||code);button.disabled=true;button.classList.add('is-loading');if(stateBox){stateBox.className='form-state loading';stateBox.textContent='جارٍ حفظ العملية بأمان…';}
    try{let result;if(transactionId)result=await window.MFCloud.editPaymentTransaction({...data,transactionId});else {result=await window.MFCloud.createPaymentTransaction(data);if(result?.transactionStatus!=='active')throw new Error('لم يؤكد الخادم دفعة نشطة');}delete form.dataset.requestId;delete form.dataset.fingerprint;const row=state.rows.find(item=>item.student.studentCode===code&&item.month===data.month&&item.academicYear===data.academicYear&&adminSameAcademic(item.summary?.course||item.student.grade,data.course));applyPaymentResult(row,result,data.paymentDate);if(stateBox){stateBox.className='form-state success';stateBox.textContent='تم حفظ العملية بنجاح.';}aToast(transactionId?'تم تعديل الدفعة':'تم تسجيل الدفعة الشهرية');button.disabled=false;closeMonthlyPaymentForm();updateDashboard();scheduleDashboardRefresh();}
    catch(error){const message=adminActionErrorMessage(error,'تعذر حفظ عملية الدفع.');if(stateBox){stateBox.className='form-state error';stateBox.textContent=message;}aToast(message);}
    finally{state.pending.delete(transactionId||code);button.disabled=false;button.classList.remove('is-loading');updateDashboard();}
  }

  window.cancelMonthlyPayment=async function(id){
    if(state.pending.has(id))return;const reason=prompt('سبب إلغاء الدفعة (سيظهر في سجل العمليات):','خطأ في التسجيل');if(reason===null)return;
    state.pending.add(id);try{const transaction=state.transactions.find(item=>String(item.id)===String(id)),result=await window.MFCloud.cancelPaymentTransaction(id,reason),row=transaction&&state.rows.find(item=>item.student.studentCode===transaction.studentCode&&item.month===transaction.month&&item.academicYear===transaction.academicYear&&adminSameAcademic(item.summary?.course||item.student.grade,transaction.course));if(transaction)transaction.status='cancelled';applyPaymentResult(row,result,transaction?.paymentDate);aToast('تم إلغاء الدفعة مع الاحتفاظ بها في السجل');scheduleDashboardRefresh();}catch(error){aToast(adminActionErrorMessage(error,'تعذر إلغاء الدفعة.'));}finally{state.pending.delete(id);updateDashboard();}
  };

  async function exportRows(){const all=[],selected=filters();let cursor=null;do{const result=await window.MFCloud.getPaymentDashboard({...selected,cursor});all.push(...result.rows);cursor=result.nextCursor;}while(cursor);return all.map(row=>[row.student.studentCode,row.student.name,row.student.grade,row.student.group||'',row.month,row.academicYear,row.expected,row.paid,row.remaining,statusLabel(row.status),row.summary?.lastPaymentDate||'']);}
  window.exportCenterSubscriptionsCSV=async function(button){if(button?.disabled)return;if(button){button.disabled=true;button.textContent='جارٍ التصدير…';}try{const headers=['كود الطالب','اسم الطالب','المسار','المجموعة','الشهر','العام الدراسي','المطلوب','المدفوع','المتبقي','الحالة','آخر دفعة'],cell=value=>`"${spreadsheetSafe(value).replace(/"/g,'""')}"`,csv='\ufeff'+[headers,...await exportRows()].map(row=>row.map(cell).join(',')).join('\n'),link=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.href=url;link.download=`techno-minds-monthly-payments-${cairoDate()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1200);}catch(error){aToast(adminActionErrorMessage(error,'تعذر تصدير البيانات الكاملة.'));}finally{if(button){button.disabled=false;button.textContent='CSV';}}};
  window.exportMonthlyPaymentsExcel=async function(button){if(button?.disabled)return;if(button){button.disabled=true;button.textContent='جارٍ التصدير…';}try{await window.MFAssets?.loadSpreadsheet?.();if(typeof XLSX==='undefined')throw new Error('XLSX unavailable');const data=[['كود الطالب','اسم الطالب','المسار','المجموعة','الشهر','العام الدراسي','المطلوب','المدفوع','المتبقي','الحالة','آخر دفعة'],...await exportRows()].map(row=>row.map(spreadsheetSafe)),book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(data);XLSX.utils.book_append_sheet(book,sheet,'المدفوعات');XLSX.writeFile(book,`techno-minds-monthly-payments-${cairoDate()}.xlsx`);}catch(error){aToast('تعذر تجهيز ملف Excel، استخدم CSV');}finally{if(button){button.disabled=false;button.textContent='Excel';}}};

  window.runLegacyPaymentMigration=async function(){if(typeof currentStaff!=='undefined'&&currentStaff?.role!=='admin')return aToast('ترحيل البيانات القديمة متاح للمدير فقط');if(!confirm('سيتم إنشاء نسخة احتياطية سحابية أولًا ثم نسخ paid/paymentAmount إلى السجل الشهري دون حذف البيانات القديمة. متابعة؟'))return;const button=document.getElementById('legacyPaymentMigrationButton');if(button)button.disabled=true;try{const result=await window.MFCloud.migrateLegacyPayments();aToast(`تم ترحيل ${result.migrated||0} سجل، وتخطي ${result.skipped||0} مكرر`);}catch(error){aToast(adminActionErrorMessage(error,'تعذر ترحيل المدفوعات القديمة.'));}finally{if(button)button.disabled=false;}};

  window.saveCoursePrices=async function(){const button=document.getElementById('saveCoursePricesButton');if(button?.disabled)return;const previous={...(adminData.settings?.coursePrices||{})},next={};document.querySelectorAll('[data-course-price]').forEach(input=>{next[input.dataset.coursePrice]=number(input.value);});adminData.settings={...(adminData.settings||{}),coursePrices:next};try{button.disabled=true;await window.MFCloud.saveSettings(adminData.settings);saveData(adminData);aToast('تم حفظ أسعار الكورسات');updateDashboard();}catch(error){adminData.settings={...(adminData.settings||{}),coursePrices:previous};aToast(adminActionErrorMessage(error,'تعذر حفظ الأسعار.'));}finally{button.disabled=false;}};

  function academicYears(){return [...new Set([schoolYear(),...(adminData.students||[]).map(row=>row.academicYear).filter(Boolean),...state.summaries.map(row=>row.academicYear).filter(Boolean)])];}
  const renderPaymentsV606=function(){
    fresh();const prices=coursePrices(),defaultYear=adminData.settings?.academicYear||schoolYear();
    content(`<div class="section-head compact-admin-head"><div><span class="kicker"><span data-icon="database"></span> المدفوعات</span><h2 class="section-title">الدفع والخزنة</h2><p class="section-desc">اضغط «تم الدفع» في كارت الطالب؛ سيُضاف سعر صفه تلقائيًا للمحصل في الأعلى.</p></div><div class="payment-export-actions"><button class="btn ghost" type="button" onclick="exportCenterSubscriptionsCSV(this)">CSV</button><button class="btn ghost" type="button" onclick="exportMonthlyPaymentsExcel(this)">Excel</button></div></div><div class="payment-financial-kpis payment-kpis-v606"><article class="collected"><small>مقبوضات اليوم</small><b id="paymentToday">0 ج.م</b><span>عمليات نشطة اليوم</span></article><article class="collected"><small>إجمالي المحصل</small><b id="paymentCollected">0 ج.م</b><span><b id="paymentPaidCount">0</b> طالب تم الدفع لهم</span></article><article><small>المتوقع تحصيله</small><b id="paymentExpected">0 ج.م</b><span>للطلاب النشطين فقط</span></article><article class="remaining"><small>المتبقي</small><b id="paymentRemaining">0 ج.م</b><span><b id="paymentPartialCount">0</b> جزئي · <b id="paymentUnpaidCount">0</b> لم يدفعوا</span></article></div><div id="paymentCourseTotals" class="payment-course-totals" aria-label="إجماليات المسارات"></div><details class="card course-price-editor"><summary><span><b>أسعار الصفوف والكورسات</b><small>السعر هو المبلغ الذي سيُضاف عند الضغط على «تم الدفع»</small></span><span data-icon="settings"></span></summary><div class="course-price-grid">${GRADES.map(grade=>`<label><span>${safe(grade)}</span><div><input type="text" inputmode="decimal" data-digits-only data-course-price="${safe(grade)}" value="${safe(number(prices[grade]))}" aria-label="سعر ${safe(grade)}"><small>جنيه</small></div></label>`).join('')}</div><div class="payment-settings-actions"><button class="btn primary" id="saveCoursePricesButton" type="button" onclick="saveCoursePrices()">حفظ الأسعار</button><button class="btn ghost" id="legacyPaymentMigrationButton" type="button" onclick="runLegacyPaymentMigration()">ترحيل الدفعات القديمة</button></div></details><div class="card payment-panel"><div class="payment-toolbar payment-toolbar-v606"><input id="paymentSearch" type="search" placeholder="بحث بالاسم أو الكود" oninput="refreshPaymentRows()"><select id="paymentGrade" aria-label="المسار" onchange="refreshPaymentRows()"><option value="all">كل المسارات</option>${GRADES.map(grade=>`<option>${safe(grade)}</option>`).join('')}</select><select id="paymentMonth" aria-label="شهر الدفع" onchange="refreshPaymentRows()"><option value="all">كل الشهور المسجلة</option>${MONTHS.map(month=>`<option ${month===currentMonth()?'selected':''}>${safe(month)}</option>`).join('')}</select><select id="paymentAcademicYear" aria-label="العام الدراسي" onchange="refreshPaymentRows()"><option value="all">كل الأعوام</option>${academicYears().map(year=>`<option ${year===defaultYear?'selected':''}>${safe(year)}</option>`).join('')}</select><select id="paymentStatus" aria-label="حالة الدفع" onchange="refreshPaymentRows()"><option value="all">كل الحالات</option><option value="paid">تم الدفع</option><option value="partial">دفع جزئي</option><option value="unpaid">لم يدفع</option></select></div><p class="payment-filter-note">الأرقام والكروت تتحدث مباشرة بعد الدفع، ولا يتم احتساب الطلاب غير النشطين.</p><div id="paymentRows" class="monthly-payment-list quick-payment-grid"><div class="loading-state">جارٍ تحميل الطلاب…</div></div></div>`);
    startListeners();hydrateIcons();
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
