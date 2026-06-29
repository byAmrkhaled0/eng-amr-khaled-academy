(function(){
  const STORAGE_KEY = 'technominds_academy_v1_data';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const empty = {students:[],bookings:[],payments:[],attendance:[],materials:[],questions:[],exams:[],examAttempts:[],grades:[],reviews:[],groups:[],assignments:[],services:[],onlineLectures:[],onlineLectureAttendance:[],files:[],settings:{siteUrl:'https://technominds-academy.vercel.app',teacherPhone:'201008454029',portfolio:'https://amrkhaledabozeid.vercel.app/'}};
  const load = () => { try { return {...empty, ...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}; } catch { return {...empty}; } };
  let cloudTimer = null;
  const save = d => {
    const data = {...empty, ...d};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if(window.MFCloud?.ready && window.MFCloud.saveSiteData){
      clearTimeout(cloudTimer);
      cloudTimer = setTimeout(()=>window.MFCloud.saveSiteData(data).catch(err=>console.warn('cloud save failed', err)), 250);
    }
  };
  async function loadCloudIntoLocal(){
    if(!window.MFCloud?.ready || !window.MFCloud.loadSiteData) return;
    try{
      const cloudData = await window.MFCloud.loadSiteData();
      if(cloudData){
        const merged = {...empty, ...cloudData};
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
    }catch(err){ console.warn('cloud load failed', err); }
  }
  const toast = msg => { const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2400); };
  const now = () => new Date().toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'});
  const todayKey = () => new Date().toISOString().slice(0,10);
  const normCode = v => {
    const raw=String(v||'').trim();
    if(!raw) return '';
    try{ const u=new URL(raw, location.origin); const c=u.searchParams.get('code')||u.searchParams.get('studentCode')||u.searchParams.get('student'); if(c) return String(c).trim().toUpperCase(); }catch(e){}
    const m=raw.match(/(?:code|studentCode|student)=([^&\s]+)/i);
    return (m?decodeURIComponent(m[1]):raw).trim().toUpperCase();
  };
  const badge = (s='') => { const good=['تم الدفع','متاحة','منشور','مقبول','حاضر']; const danger=['لم يدفع','مرفوض','مغلقة مؤقتًا','غائب']; const cls=good.includes(s)?'good':danger.includes(s)?'danger':'warn'; return `<span class="badge ${cls}">${esc(s||'-')}</span>`; };
  let modalType = null;
  let editIndex = null;

  function persist(d,msg){ save(d); render(); toast(msg || 'تم الحفظ'); }
  function actions(type,i,extra='') { return `<div class="admin-table-actions">${extra}<button class="small-btn" data-edit="${type}:${i}">تعديل</button><button class="small-btn danger" data-del="${type}:${i}">حذف</button></div>`; }
  function emptyRow(cols,msg='لا توجد بيانات بعد') { return `<tr><td colspan="${cols}" class="muted-cell">${msg}</td></tr>`; }
  function short(v,n=70){ v=String(v||''); return v.length>n?v.slice(0,n)+'...':v; }
  function groupKey(g){ return String(g?.id||g?.code||g?.name||'').trim(); }
  function groupCount(d,g){ const id=groupKey(g), name=String(g?.name||'').trim(); return (d.students||[]).filter(s=>String(s.groupId||'')===id || String(s.group||'')===name).length; }
  function groupPendingCount(d,g){ const id=groupKey(g), name=String(g?.name||'').trim(); return (d.bookings||[]).filter(b=>String(b.status||'')!=='مقبول' && (String(b.groupId||'')===id || String(b.group||b.groupName||'')===name)).length; }
  function groupIsFull(d,g){ const cap=Number(g?.capacity||0); return cap>0 && groupCount(d,g)>=cap; }
  function studentsInGroup(d,g){
    const id=groupKey(g);
    const name=String(g?.name||'').trim();
    return (d.students||[]).filter(s=>String(s.groupId||'')===id || String(s.group||s.groupName||'').trim()===name);
  }
  function groupPaymentStatus(d,st){
    const code=normCode(st.code||st.studentCode||st.id);
    const last=[...(d.payments||[])].reverse().find(p=>normCode(p.studentCode||p.code)===code || String(p.student||p.studentName||'')===String(st.name||st.studentName||''));
    return (st.paid || last?.status==='تم الدفع') ? 'تم الدفع' : 'لم يدفع';
  }
  function groupAttendanceSummary(d,st){
    const code=normCode(st.code||st.studentCode||st.id);
    const records=(d.attendance||[]).filter(a=>normCode(a.studentCode)===code);
    return records.length ? `${records.length} حضور` : 'لا يوجد حضور';
  }
  function groupOptions(){ const d=load(); const names=(d.groups||[]).map(g=>g.name).filter(Boolean); return ['كل المجموعات', ...names]; }
  function fmtSize(bytes){ const n=Number(bytes||0); if(!n) return ''; if(n<1024) return n+' B'; if(n<1024*1024) return (n/1024).toFixed(1)+' KB'; return (n/1024/1024).toFixed(1)+' MB'; }
  function fmtDate(v){ if(!v) return ''; try{return new Date(v).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'});}catch{return String(v||'');} }

  function submissionStatus(a){
    if(String(a.status||'')==='corrected') return 'تم التصحيح';
    if(a.needsManualReview || String(a.status||'').includes('pending')) return 'بانتظار التصحيح';
    if(a.score!==null && a.score!==undefined && a.score!=='') return 'تم التصحيح';
    return 'تم التسليم';
  }
  function ensureExamSubmissionsPanel(){
    const tab=$('#tab-exams');
    if(!tab || $('#examSubmissionRows')) return;
    tab.insertAdjacentHTML('beforeend', `<div class="admin-pro-card" style="margin-top:18px"><div class="admin-table-head"><div><span class="kicker"><span data-icon="user-check"></span> إجابات الطلاب</span><h2>تصحيح الاختبارات وإظهار النتيجة</h2><p>أي إجابة يرسلها الطالب تظهر هنا، وتقدر تعرضها وتكتب الدرجة والملاحظات.</p></div></div><div class="table-wrap"><table><thead><tr><th>الطالب</th><th>الاختبار</th><th>تاريخ التسليم</th><th>الحالة</th><th>الدرجة</th><th>إجراء</th></tr></thead><tbody id="examSubmissionRows"></tbody></table></div></div>`);
  }
  function findAttemptById(d,id){ return (d.examAttempts||[]).find(a=>String(a.id)===String(id)); }
  function answersHtml(a){
    const rows=(a.answers||[]).map((ans,i)=>`<div class="mobile-row"><b>س${i+1}: ${esc(ans.question||'')}</b><small>إجابة الطالب: ${esc(ans.answer||'-')}</small>${ans.correctAnswer?`<small>الإجابة الصحيحة/الملاحظات: ${esc(ans.correctAnswer)}</small>`:''}</div>`).join('');
    const code=a.codeAnswer?`<div class="card"><h3>إجابة الكود</h3><pre class="tm-output" dir="ltr">${esc(a.codeAnswer)}</pre></div>`:'';
    return rows || code ? rows+code : '<p class="section-desc">لا توجد إجابات مسجلة.</p>';
  }
  function openAttemptCorrection(id){
    const d=load(); const a=findAttemptById(d,id); if(!a) return toast('لم يتم العثور على إجابة الطالب');
    $('#adminModalContent').innerHTML=`<h2>تصحيح اختبار الطالب</h2><div class="card"><h3>${esc(a.studentName||'-')} — ${esc(a.examTitle||'اختبار')}</h3><p class="section-desc">كود الطالب: <b>${esc(a.studentCode||'-')}</b> · التسليم: ${esc(a.submittedAt||'-')}</p>${answersHtml(a)}</div><form id="correctAttemptForm" class="admin-form admin-modal-form"><label>الدرجة من 100<input name="score" type="number" min="0" max="100" value="${esc(a.score??a.autoScore??'')}"></label><label class="wide">ملاحظات تظهر للطالب<textarea name="feedback">${esc(a.feedback||'')}</textarea></label><button class="btn primary wide" type="submit">حفظ التصحيح وإظهار النتيجة</button></form>`;
    $('#adminModal').classList.add('show'); $('#adminModal').setAttribute('aria-hidden','false');
    $('#correctAttemptForm').addEventListener('submit', async e=>{
      e.preventDefault(); const f=Object.fromEntries(new FormData(e.target).entries()); const score=Number(f.score);
      if(Number.isNaN(score) || score<0 || score>100) return toast('اكتب درجة صحيحة من 0 إلى 100');
      a.score=score; a.feedback=f.feedback||''; a.needsManualReview=false; a.status='corrected'; a.correctedAt=new Date().toISOString();
      const st=(d.students||[]).find(s=>normCode(s.code||s.studentCode||s.id)===normCode(a.studentCode));
      const grade={id:'GR-'+(a.id||Date.now()),studentCode:a.studentCode,studentName:a.studentName,exam:a.examTitle,examId:a.examId,score,feedback:a.feedback,date:new Date().toISOString().slice(0,10)};
      d.grades=Array.isArray(d.grades)?d.grades:[];
      const gi=d.grades.findIndex(g=>String(g.id)===String(grade.id)); if(gi>=0) d.grades[gi]=grade; else d.grades.unshift(grade);
      if(st){ st.grades=Array.isArray(st.grades)?st.grades:[]; const si=st.grades.findIndex(g=>String(g.id)===String(grade.id)); if(si>=0) st.grades[si]=grade; else st.grades.push(grade); }
      save(d);
      try{ await window.MFCloud?.updateExamSubmission?.(a); if(st) await window.MFCloud?.saveStudent?.(st); }catch(err){ console.warn(err); }
      closeModal(); render(); toast('تم حفظ التصحيح وظهور النتيجة للطالب');
    });
  }


  function render(){
    const d=load();
    $('#stBookings') && ($('#stBookings').textContent=(d.bookings||[]).filter(b=>String(b.status||'')!=='مقبول').length);
    $('#stStudents') && ($('#stStudents').textContent=(d.students||[]).length);
    $('#stGroups') && ($('#stGroups').textContent=(d.groups||[]).length);
    $('#stPaid') && ($('#stPaid').textContent=(d.payments||[]).filter(p=>p.status==='تم الدفع').length);
    $('#stTodayAttendance') && ($('#stTodayAttendance').textContent=(d.attendance||[]).filter(a=>a.date===todayKey()).length);
    $('#stPdfs') && ($('#stPdfs').textContent=(d.materials||[]).length);
    $('#stExams') && ($('#stExams').textContent=(d.exams||[]).length);
    $('#stReviews') && ($('#stReviews').textContent=(d.reviews||[]).filter(r=>r.approved!==false && String(r.approved)!=='false').length);
    $('#stOnlineLectures') && ($('#stOnlineLectures').textContent=(d.onlineLectures||[]).length);
    const bookingRows=$('#bookingRows'); if(bookingRows){ const arr=(d.bookings||[]).filter(b=>String(b.status||'')!=='مقبول'); bookingRows.innerHTML=arr.length?arr.map((b,i)=>`<tr><td><b>${esc(b.name||b.studentName)}</b><small>${esc(b.code||b.id||'')}</small></td><td>${esc(b.studentPhone||b.phone||'-')}</td><td>${esc(b.grade||'-')}</td><td>${esc(b.group||'-')}</td><td>${badge(b.status||'بانتظار الموافقة')}</td><td>${actions('bookings',i, `<button class="small-btn primary" data-accept-booking="${i}">قبول</button>`)}</td></tr>`).join(''):emptyRow(6,'لا توجد طلبات حجز بعد.'); }
    const studentRows=$('#studentRows'); if(studentRows){ const arr=d.students||[]; studentRows.innerHTML=arr.length?arr.map((s,i)=>{ const code=s.code||s.studentCode||''; return `<tr><td><b>${esc(s.name||s.studentName)}</b><small>${esc(code)}</small></td><td>${esc(s.phone||s.studentPhone||'-')}</td><td>${esc(s.parentPhone||'-')}</td><td>${esc(s.grade||'-')}</td><td>${esc(s.mode||s.attendanceMode||'-')}</td><td>${actions('students',i, `<button class="small-btn primary" data-mark-present="${esc(code)}">حضور</button><button class="small-btn" data-show-qr="${esc(code)}">باركود</button>`)}</td></tr>`}).join(''):emptyRow(6); }
    const groupRows=$('#groupRows'); if(groupRows){ const arr=d.groups||[]; groupRows.innerHTML=arr.length?arr.map((g,i)=>{ const c=groupCount(d,g), p=groupPendingCount(d,g), cap=Number(g.capacity||0); const isClosed=g.status==='closed'; const isFull=cap>0 && c>=cap; const status=isClosed?'مغلقة':isFull?'مكتملة':'متاحة'; const extra=`<button class="small-btn primary" data-view-group-students="${i}">عرض الطلاب</button>`; return `<tr><td><b>${esc(g.name)}</b><small>${esc(g.notes||'')}</small></td><td>${esc(g.schedule||'-')}</td><td>${esc(g.mode||'-')}</td><td>${c}${p?` + ${p} حجز`:''} / ${cap||'-'}</td><td>${badge(status)}</td><td>${actions('groups',i,extra)}</td></tr>`}).join(''):emptyRow(6,'لا توجد مجموعات بعد. اضغط إضافة مجموعة.'); }
    
    const onlineLectureRows=$('#onlineLectureRows'); if(onlineLectureRows){ const arr=d.onlineLectures||[]; onlineLectureRows.innerHTML=arr.length?arr.map((l,i)=>{ const url=l.meetingUrl||l.link||''; return `<tr><td><b>${esc(l.title||'محاضرة أونلاين')}</b><small>${esc(l.notes||l.desc||'')}</small></td><td>${esc(l.group||l.targetGroup||'كل المجموعات')}</td><td><b>${esc(l.date||'-')}</b><small>${esc(l.time||'')}</small></td><td>${url?`<a class="small-btn primary" href="${esc(url)}" target="_blank" rel="noreferrer">فتح</a>`:'-'}</td><td>${badge(l.status||'متاحة')}</td><td>${actions('onlineLectures',i)}</td></tr>`}).join(''):emptyRow(6,'لا توجد محاضرات أونلاين بعد.'); }
    const attendanceRows=$('#attendanceRows'); if(attendanceRows){ const arr=d.attendance||[]; attendanceRows.innerHTML=arr.length?arr.slice().reverse().map((a,i)=>`<tr><td><b>${esc(a.studentName||'-')}</b></td><td>${esc(a.studentCode||'-')}</td><td>${esc(a.session||'-')}</td><td>${esc(a.time||'-')}</td><td>${badge(a.status||'حاضر')}</td><td><button class="small-btn danger" data-del-attendance="${(d.attendance||[]).length-1-i}">حذف</button></td></tr>`).join(''):emptyRow(6,'لا توجد سجلات حضور بعد.'); }
    const paymentRows=$('#paymentRows'); if(paymentRows){
      const students=(d.students||[]);
      const payments=(d.payments||[]);
      const rows=students.length ? students.map((st,i)=>{
        const code=st.code||st.studentCode||st.id||'';
        const last=[...payments].reverse().find(p=>normCode(p.studentCode||p.code)===normCode(code) || String(p.student||p.studentName||'')===String(st.name||st.studentName||''));
        const paid=!!st.paid || (last && last.status==='تم الدفع');
        return `<tr><td><b>${esc(st.name||st.studentName)}</b><small>${esc(code)}</small></td><td>${esc(last?.month||st.month||'-')}</td><td>${esc(last?.amount||'')}</td><td>${esc(last?.method||'-')}</td><td>${badge(paid?'تم الدفع':'لم يدفع')}</td><td><div class="admin-table-actions"><button class="small-btn primary" data-mark-paid="${esc(code)}">تم الدفع</button><button class="small-btn" data-open-payment-for="${esc(code)}">تفاصيل دفع</button></div></td></tr>`;
      }) : payments.map((p,i)=>`<tr><td>${esc(p.student||p.studentName)}</td><td>${esc(p.month||'-')}</td><td>${esc(p.amount||0)} جنيه</td><td>${esc(p.method||'-')}</td><td>${badge(p.status||'-')}</td><td>${actions('payments',i)}</td></tr>`);
      paymentRows.innerHTML=rows.length?rows.join(''):emptyRow(6,'لا يوجد طلاب في الدفع بعد.');
    }
    const pdfRows=$('#pdfRows'); if(pdfRows){ const arr=d.materials||[]; pdfRows.innerHTML=arr.length?arr.map((p,i)=>{ const openUrl=p.fileUrl||p.link||p.url||''; const details=[p.fileName, fmtSize(p.size), p.uploadedAt?('رفع: '+fmtDate(p.uploadedAt)):p.createdAt?('إنشاء: '+fmtDate(p.createdAt)):''].filter(Boolean).join(' • '); const fileCell=openUrl?`<div class="admin-file-actions"><small>${esc(p.fileName||p.link||'ملف')}</small><a class="small-btn primary" href="${esc(openUrl)}" target="_blank" rel="noreferrer">فتح</a><a class="small-btn" href="${esc(openUrl)}" download target="_blank" rel="noreferrer">تحميل</a></div>`:`<small>${esc(p.fileName||'لا يوجد ملف')}</small>`; return `<tr><td><b>${esc(p.title)}</b><small>${esc(p.desc||'')}</small></td><td><b>${esc(p.type||p.category||'-')}</b><small>${esc(p.week||'-')}</small></td><td>${badge(p.group||p.targetGroup||'كل المجموعات')}</td><td><small>${esc(details||'-')}</small></td><td>${fileCell}</td><td>${actions('materials',i)}</td></tr>` }).join(''):emptyRow(6); }
    const examRows=$('#examRows'); if(examRows){ const arr=d.exams||[]; examRows.innerHTML=arr.length?arr.map((e,i)=>{const target=e.targetType==='student'?('طالب: '+(e.targetStudentCode||'-')):e.targetType==='group'?('دفعة: '+(e.targetGroup||'-')):(e.grade||'كل الصفوف'); return `<tr><td><b>${esc(e.title)}</b></td><td>${esc(e.duration||e.minutes||20)} دقيقة</td><td>${esc(e.type||'تدريب')}</td><td>${esc(target)}</td><td>${esc(short(e.question || (e.questions&&e.questions[0]?.question)||''))}</td><td>${actions('exams',i)}</td></tr>`}).join(''):emptyRow(6); }
    ensureExamSubmissionsPanel();
    const subRows=$('#examSubmissionRows'); if(subRows){ const arr=(d.examAttempts||[]).slice().reverse(); subRows.innerHTML=arr.length?arr.map(a=>{ const st=submissionStatus(a); const cls=st==='تم التصحيح'?'good':st==='بانتظار التصحيح'?'warn':'good'; return `<tr><td><b>${esc(a.studentName||'-')}</b><small>${esc(a.studentCode||'-')}</small></td><td>${esc(a.examTitle||'-')}</td><td>${esc(a.submittedAt||'-')}</td><td><span class="badge ${cls}">${esc(st)}</span></td><td>${a.score!==null&&a.score!==undefined&&a.score!==''?esc(a.score)+'%':'-'}</td><td><button class="small-btn primary" data-correct-attempt="${esc(a.id)}">عرض وتصحيح</button></td></tr>`}).join(''):emptyRow(6,'لا توجد إجابات مرسلة من الطلاب بعد.'); }
    const serviceRows=$('#serviceRows'); if(serviceRows){ const arr=d.services||[]; serviceRows.innerHTML=arr.length?arr.map((s,i)=>`<tr><td><b>${esc(s.title)}</b></td><td>${esc(short(s.desc,90))}</td><td>${esc(s.price||'-')}</td><td>${badge(s.status||'متاحة')}</td><td>${actions('services',i)}</td></tr>`).join(''):emptyRow(5); }
    const reviewRows=$('#reviewRows'); if(reviewRows){ const arr=d.reviews||[]; reviewRows.innerHTML=arr.length?arr.map((r,i)=>{const isPub=r.approved!==false && String(r.approved)!=='false'; return `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.role||'-')}</td><td><span class="review-stars">${'★'.repeat(Number(r.rating||5))}</span></td><td>${esc(short(r.text,90))}</td><td>${badge(isPub?'منشور':'بانتظار الموافقة')}</td><td>${actions('reviews',i, `<button class="small-btn primary" data-toggle-review="${i}">${isPub?'إخفاء':'نشر'}</button>`)}</td></tr>`}).join(''):emptyRow(6); }
    const setPrev=$('#settingsPreview'); if(setPrev){ const s=d.settings||{}; setPrev.innerHTML=`<div class="admin-list-row rich"><div><b>اسم الموقع</b><small>${esc(s.siteName||'Techno Minds')}</small></div></div><div class="admin-list-row rich"><div><b>واتساب</b><small>${esc(s.teacherPhone||'201008454029')}</small></div></div><div class="admin-list-row rich"><div><b>Portfolio</b><small>${esc(s.portfolio||'https://amrkhaledabozeid.vercel.app/')}</small></div></div>`; }
    if(window.hydrateIcons) window.hydrateIcons();
  }

  function tab(tab){ $$('[data-admin-tab]').forEach(b=>b.classList.toggle('active',b.dataset.adminTab===tab)); $$('.admin-pro-section').forEach(s=>s.classList.toggle('active',s.id==='tab-'+tab)); if(innerWidth<900) scrollTo({top:0,behavior:'smooth'}); }
  function bindTabs(){ $$('[data-admin-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.adminTab))); }

  const fields = {
    booking: {title:'إضافة طلب حجز', coll:'bookings', fields:[['name','اسم الطالب'],['studentPhone','رقم الطالب'],['parentPhone','رقم ولي الأمر'],['grade','الصف / النظام','select',['تانية ثانوي بكالوريا','تانية ثانوي عام','مبتدئين برمجة']],['group','المجموعة','select',['اونلاين Zoom','أوفلاين في الTechno Minds','هحدد لاحقًا']],['notes','ملاحظات','textarea']], map:f=>({id:'BK-'+Date.now(),code:'ST-'+Date.now().toString().slice(-4)+Math.floor(100+Math.random()*900),name:f.name,studentName:f.name,studentPhone:f.studentPhone,parentPhone:f.parentPhone,grade:f.grade,group:f.group,notes:f.notes,status:'بانتظار الموافقة',date:new Date().toISOString().slice(0,10)})},
    group: {title:'إضافة مجموعة', coll:'groups', fields:[['name','اسم المجموعة'],['schedule','المواعيد'],['mode','طريقة الحضور','select',['اونلاين','أوفلاين','اونلاين وأوفلاين']],['capacity','العدد الأقصى','number'],['status','الحالة','select',[['open','متاحة'],['closed','مغلقة']]],['notes','ملاحظات','textarea']], map:f=>({id:'GRP-'+Date.now(),name:f.name,schedule:f.schedule,mode:f.mode,capacity:Number(f.capacity||0),status:f.status||'open',notes:f.notes})},
    student: {title:'إضافة طالب', coll:'students', fields:[['name','اسم الطالب'],['phone','رقم الطالب'],['parentPhone','رقم ولي الأمر'],['grade','الصف / النظام','select',['تانية ثانوي بكالوريا','تانية ثانوي عام','مبتدئين برمجة']],['mode','طريقة الحضور','select',['اونلاين Zoom','أوفلاين','اونلاين + أوفلاين']],['notes','ملاحظات','textarea']], map:f=>({id:'ST-'+Date.now(),code:'ST-'+Math.floor(1000+Math.random()*9000),name:f.name,phone:f.phone,parentPhone:f.parentPhone,grade:f.grade,mode:f.mode,notes:f.notes})},
    payment: {title:'تسجيل دفعة', coll:'payments', fields:[['student','اسم الطالب أو الكود'],['month','الشهر','select',['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']],['amount','المبلغ','number'],['method','طريقة الدفع','select',['كاش','فودافون كاش','إنستا باي','تحويل بنكي']],['status','الحالة','select',['تم الدفع','جزئي','لم يدفع']],['note','ملاحظة','textarea']], map:f=>({id:'PAY-'+Date.now(),...f})},
    pdf: {title:'إضافة محتوى', coll:'materials', fields:[['title','عنوان المحتوى'],['week','الأسبوع / المرحلة','select',['Week 1','Week 2','Week 3','Week 4','مراجعة عامة']],['type','نوع المحتوى','select',['كورس','محاضرة','ملف','شرح','ملخص','تدريب','واجب','فيديو','لينك']],['group','المجموعة المستهدفة','select',groupOptions],['link','لينك خارجي أو فيديو'],['file','ملف ملف / صورة','file'],['status','الحالة','select',['منشور','مجدول','مخفي']],['desc','وصف','textarea']], map:(f,form)=>({id:'MAT-'+Date.now(),title:f.title,week:f.week,type:f.type,category:f.type,group:f.group||'كل المجموعات',targetGroup:f.group||'كل المجموعات',link:f.link,fileName:form.file?.files?.[0]?.name||'',desc:f.desc,status:f.status||'منشور',fileUrl:''})},
    exam: {title:'إنشاء امتحان', coll:'exams', fields:[['title','عنوان الامتحان'],['duration','المدة بالدقائق','number'],['type','نوع السؤال','select',['كتابة كود','اختيار من متعدد','سؤال قصير']],['targetType','إرسال الامتحان إلى','select',[['all','كل الطلاب'],['group','دفعة / مجموعة معينة'],['student','طالب معين']]],['targetGroup','اسم الدفعة أو المجموعة'],['targetStudentCode','كود الطالب لو الامتحان لطالب محدد'],['grade','الصف','select',['كل الصفوف','تانية ثانوي بكالوريا','تانية ثانوي عام','مبتدئين برمجة','أساسيات Python','تطبيقات ومراجعة']],['question','نص السؤال','textarea'],['starter','كود البداية','code'],['answer','الإجابة / ملاحظات التصحيح','textarea']], map:f=>{ const q=String(f.question||'').trim(); return {id:'EX-'+Date.now(),title:f.title,duration:f.duration||20,type:f.type,targetType:f.targetType||'all',targetGroup:f.targetGroup||'',targetStudentCode:normCode(f.targetStudentCode||''),grade:f.grade||'كل الصفوف',question:q,text:q,questionsText:q,starter:f.starter,answer:f.answer,status:'منشور'} }},
    online: {title:'إضافة محاضرة أونلاين', coll:'onlineLectures', fields:[['title','عنوان المحاضرة'],['group','المجموعة المستهدفة','select',groupOptions],['meetingUrl','رابط Zoom / Google Meet'],['date','التاريخ','date'],['time','الوقت'],['status','الحالة','select',['متاحة','لم تبدأ','انتهت','مخفي']],['notes','ملاحظات للطالب','textarea']], map:f=>({id:'OL-'+Date.now(),title:f.title,group:f.group||'كل المجموعات',targetGroup:f.group||'كل المجموعات',meetingUrl:f.meetingUrl,link:f.meetingUrl,date:f.date,time:f.time,status:f.status||'متاحة',notes:f.notes,createdAt:new Date().toISOString()})},
    service: {title:'إضافة خدمة', coll:'services', fields:[['title','اسم الخدمة'],['desc','الوصف','textarea'],['price','السعر / الملاحظة'],['status','الحالة','select',['متاحة','قريبًا','مغلقة مؤقتًا']]], map:f=>({id:'SV-'+Date.now(),...f})},
    review: {title:'إضافة ريفيو', coll:'reviews', fields:[['name','الاسم'],['role','الصفة','select',['طالب','ولي أمر']],['rating','التقييم','select',['5','4','3']],['approved','الحالة','select',[['true','منشور'],['false','بانتظار الموافقة']]],['text','نص الريفيو','textarea']], map:f=>({id:'REV-'+Date.now(),name:f.name,role:f.role,rating:f.rating,approved:f.approved==='true',text:f.text,date:new Date().toISOString().slice(0,10)})},
    settings: {title:'تعديل إعدادات الموقع', coll:'settings', fields:[['siteName','اسم الموقع'],['teacherPhone','رقم واتساب'],['portfolio','رابط البورتفوليو'],['location','مكان التدريب'],['heroText','رسالة قصيرة','textarea']], map:f=>({...f})}
  };

  function fieldHtml([name,label,type='text',opts=[]], val=''){
    if(typeof opts==='function') opts=opts();
    if(type==='select') return `<label>${label}<select name="${name}">${opts.map(o=>Array.isArray(o)?`<option value="${esc(o[0])}" ${String(val)===String(o[0])?'selected':''}>${esc(o[1])}</option>`:`<option ${String(val)===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
    if(type==='textarea') return `<label class="wide">${label}<textarea name="${name}">${esc(val)}</textarea></label>`;
    if(type==='code') return `<label class="wide">${label}<textarea name="${name}" dir="ltr" class="admin-code-area" spellcheck="false">${esc(val)}</textarea></label>`;
    if(type==='file') return `<label>${label}<input name="${name}" type="file" accept="application/pdf,image/*"></label>`;
    return `<label>${label}<input name="${name}" type="${type}" value="${esc(val)}"></label>`;
  }
  function openModal(type, index=null){
    const cfg=fields[type]; if(!cfg)return; modalType=type; editIndex=index;
    const d=load(); const item=index!==null && cfg.coll!=='settings' ? (d[cfg.coll]||[])[index] : (cfg.coll==='settings'?d.settings||{}:{});
    $('#adminModalContent').innerHTML=`<h2>${index!==null?'تعديل':'إضافة'} ${cfg.title.replace('إضافة ','').replace('إنشاء ','')}</h2><form id="modalForm" class="admin-form admin-modal-form">${cfg.fields.map(f=>fieldHtml(f, item?.[f[0]] || '')).join('')}<button class="btn primary wide" type="submit"><span data-icon="settings"></span> حفظ</button></form>`;
    $('#adminModal').classList.add('show'); $('#adminModal').setAttribute('aria-hidden','false');
    $('#modalForm').addEventListener('submit',submitModal); if(window.hydrateIcons) window.hydrateIcons();
  }
  function closeModal(){ $('#adminModal').classList.remove('show'); $('#adminModal').setAttribute('aria-hidden','true'); modalType=null; editIndex=null; }
  async function submitModal(e){ e.preventDefault(); const cfg=fields[modalType]; const d=load(); const form=e.target; const f=Object.fromEntries(new FormData(form).entries()); if(cfg.coll==='settings'){ d.settings={...(d.settings||{}),...cfg.map(f,form)}; } else { const item=cfg.map(f,form);
      const uploadInput=form.querySelector('input[type="file"]');
      const uploadFile=uploadInput && uploadInput.files && uploadInput.files[0];
      const oldItem = editIndex!==null ? (d[cfg.coll]||[])[editIndex] : null;
      if(uploadFile && window.MFCloud?.uploadAttachment){
        try{ const folder = 'teacher-uploads/materials'; const up=await window.MFCloud.uploadAttachment(uploadFile, folder); item.fileUrl=up.url; item.fileName=up.fileName; item.filePath=up.path; item.contentType=up.contentType; item.size=up.size; item.uploadedAt=new Date().toISOString(); }
        catch(err){ toast('تعذر رفع الملف، سيتم حفظ البيانات بدون رابط الملف'); }
      }
      d[cfg.coll]=Array.isArray(d[cfg.coll])?d[cfg.coll]:[];
      if(modalType==='pdf'){
        const chosen=(d.groups||[]).find(g=>String(g.name||'')===String(item.group||''));
        item.group=item.group||'كل المجموعات'; item.targetGroup=item.group; item.groupId=chosen?.id||''; item.groupName=item.group;
        item.createdAt=oldItem?.createdAt||new Date().toISOString(); item.updatedAt=new Date().toISOString();
        if(!uploadFile && oldItem){ item.fileUrl=oldItem.fileUrl||item.fileUrl; item.fileName=oldItem.fileName||item.fileName; item.filePath=oldItem.filePath; item.contentType=oldItem.contentType; item.size=oldItem.size; item.uploadedAt=oldItem.uploadedAt; }
      }
      if(modalType==='online'){ const chosen=(d.groups||[]).find(g=>String(g.name||'')===String(item.group||'')); item.group=item.group||'كل المجموعات'; item.targetGroup=item.group; item.groupId=chosen?.id||''; item.groupName=item.group; item.updatedAt=new Date().toISOString(); }
      if(modalType==='payment'){ const q=normCode(item.student); const st=(d.students||[]).find(s=>normCode(s.code||s.studentCode||s.id)===q || String(s.name||s.studentName||'')===String(item.student||'')); if(st){ item.studentCode=st.code||st.studentCode||st.id; item.studentName=st.name||st.studentName; st.paid=item.status==='تم الدفع'; st.paymentDate=item.status==='تم الدفع'?todayKey():(st.paymentDate||''); } }
      if(editIndex!==null) d[cfg.coll][editIndex]={...d[cfg.coll][editIndex],...item,id:d[cfg.coll][editIndex].id||item.id}; else d[cfg.coll].unshift(item); } save(d); closeModal(); render(); toast('تم الحفظ'); }


  function studentPortalUrl(code){ return `${location.origin}${location.pathname.replace(/admin\.html.*$/,'student.html')}?code=${encodeURIComponent(normCode(code))}`; }
  function makeQrUrl(code){ return `https://quickchart.io/qr?text=${encodeURIComponent(studentPortalUrl(code))}&size=240&margin=2`; }
  function extractStudentCode(value){ const raw=String(value||'').trim(); try{ const u=new URL(raw, location.href); return normCode(u.searchParams.get('code')||raw); }catch(e){ const m=raw.match(/code=([^&]+)/i); return normCode(m?decodeURIComponent(m[1]):raw); } }
  function findStudentByCode(d, code){ const c=normCode(code); return (d.students||[]).find(s=>normCode(s.code||s.studentCode||s.id)===c); }
  function recordAttendance(code, session){
    const d=load(); const clean=extractStudentCode(code); if(!clean){ toast('اكتب أو امسح كود الطالب'); return; }
    const st=findStudentByCode(d, clean); if(!st){ toast('لم يتم العثور على طالب بهذا الكود'); return; }
    d.attendance=Array.isArray(d.attendance)?d.attendance:[];
    const date=todayKey(); const finalSession=session||$('#attendanceSession')?.value||'حصة اليوم';
    const exists=d.attendance.some(a=>normCode(a.studentCode)===clean && a.date===date && a.session===finalSession);
    if(exists){ toast('الطالب مسجل حضور بالفعل في نفس الحصة اليوم'); return; }
    const rec={id:'ATT-'+Date.now(),studentCode:st.code||st.studentCode||clean,studentName:st.name||st.studentName,session:finalSession,date,time:now(),status:'حاضر'};
    d.attendance.push(rec);
    st.attendance=Array.isArray(st.attendance)?st.attendance:[]; st.attendance.push(rec);
    save(d); render(); toast(`تم تسجيل حضور ${st.name||st.studentName}`);
  }
  let attendanceStream=null, attendanceLoopStop=false;
  async function startAttendanceScanner(){
    if(!('mediaDevices' in navigator)){ toast('الكاميرا غير مدعومة على هذا الجهاز'); return; }
    $('#adminModalContent').innerHTML=`<h2>مسح باركود الطالب</h2><div class="admin-scan-modal"><video id="adminScanVideo" playsinline autoplay></video><p>وجّه الكاميرا على باركود الطالب الموجود في بوابة الطالب.</p><div class="admin-scan-actions"><button class="btn ghost" id="stopAdminScan" type="button">إيقاف</button></div></div>`;
    $('#adminModal').classList.add('show'); $('#adminModal').setAttribute('aria-hidden','false');
    const video=$('#adminScanVideo');
    try{
      attendanceStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); video.srcObject=attendanceStream; await video.play(); attendanceLoopStop=false;
      $('#stopAdminScan')?.addEventListener('click',stopAttendanceScanner);
      if(!('BarcodeDetector' in window)){ toast('المتصفح لا يدعم المسح التلقائي، اكتب الكود يدويًا'); return; }
      const detector=new BarcodeDetector({formats:['qr_code','code_128','ean_13']});
      const loop=async()=>{ if(attendanceLoopStop) return; try{ const codes=await detector.detect(video); if(codes.length){ const val=codes[0].rawValue; $('#attendanceCode') && ($('#attendanceCode').value=val); stopAttendanceScanner(); closeModal(); recordAttendance(val,$('#attendanceSession')?.value||'حصة اليوم'); return; } }catch(e){} requestAnimationFrame(loop); };
      loop();
    }catch(e){ toast('تعذر فتح الكاميرا. تأكد من السماح للكاميرا.'); }
  }
  function stopAttendanceScanner(){ attendanceLoopStop=true; if(attendanceStream){ attendanceStream.getTracks().forEach(t=>t.stop()); attendanceStream=null; } closeModal(); }
  function showStudentQr(code){
    const safe=normCode(code); if(!safe){ toast('لا يوجد كود لهذا الطالب'); return; }
    $('#adminModalContent').innerHTML=`<h2>باركود الطالب</h2><div class="admin-qr-preview"><img src="${makeQrUrl(safe)}" alt="باركود ${esc(safe)}"><b>${esc(safe)}</b><p>الـ باركود يفتح بوابة الطالب مباشرة، ولو مسحته من قسم الحضور يتسجل حاضر.</p><button class="btn primary" data-mark-present="${esc(safe)}" type="button"><span data-icon="user-check"></span> تسجيل حضور الآن</button></div>`;
    $('#adminModal').classList.add('show'); $('#adminModal').setAttribute('aria-hidden','false'); if(window.hydrateIcons) window.hydrateIcons();
  }

  function showGroupStudents(index){
    const d=load();
    const g=(d.groups||[])[Number(index)];
    if(!g) return toast('لم يتم العثور على المجموعة');
    const students=studentsInGroup(d,g);
    const pending=(d.bookings||[]).filter(b=>String(b.status||'')!=='مقبول' && (String(b.groupId||'')===groupKey(g) || String(b.group||b.groupName||'')===String(g.name||'')));
    const cap=Number(g.capacity||0);
    const rows=students.length ? students.map(st=>{
      const code=st.code||st.studentCode||st.id||'';
      return `<tr><td><b>${esc(st.name||st.studentName||'-')}</b><small>${esc(code)}</small></td><td>${esc(st.phone||st.studentPhone||'-')}</td><td>${esc(st.parentPhone||'-')}</td><td>${badge(groupPaymentStatus(d,st))}</td><td>${esc(groupAttendanceSummary(d,st))}</td><td>${esc(fmtDate(st.acceptedAt||st.createdAt)||'-')}</td><td><button class="small-btn primary" data-show-qr="${esc(code)}">باركود</button><button class="small-btn" data-open-payment-for="${esc(code)}">دفع</button></td></tr>`;
    }).join('') : `<tr><td colspan="7" class="muted-cell">لا يوجد طلاب مقبولين داخل هذه المجموعة حتى الآن.</td></tr>`;
    const pendingRows=pending.length ? `<div class="card" style="margin-top:14px"><h3>طلبات حجز منتظرة (${pending.length})</h3>${pending.map(b=>`<div class="mobile-row"><b>${esc(b.name||b.studentName||'-')}</b><small>${esc(b.studentPhone||b.phone||'-')} · ${esc(b.code||b.studentCode||b.id||'')}</small></div>`).join('')}</div>` : '';
    $('#adminModalContent').innerHTML=`<h2>طلاب مجموعة: ${esc(g.name||'-')}</h2><div class="card"><h3>تفاصيل المجموعة</h3><p class="section-desc">المواعيد: <b>${esc(g.schedule||'-')}</b> · الحضور: <b>${esc(g.mode||'-')}</b> · العدد: <b>${students.length} / ${cap||'-'}</b>${pending.length?` · طلبات منتظرة: <b>${pending.length}</b>`:''}</p></div><div class="table-wrap"><table><thead><tr><th>الطالب</th><th>الهاتف</th><th>ولي الأمر</th><th>الدفع</th><th>الحضور</th><th>تاريخ القبول</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table></div>${pendingRows}`;
    $('#adminModal').classList.add('show'); $('#adminModal').setAttribute('aria-hidden','false'); if(window.hydrateIcons) window.hydrateIcons();
  }

  function bindActions(){
    document.addEventListener('click',e=>{
      const open=e.target.closest('[data-open-modal]'); if(open) return openModal(open.dataset.openModal);
      const jump=e.target.closest('[data-jump-attendance]'); if(jump) return tab('attendance');
      const scan=e.target.closest('#startAttendanceScan'); if(scan) return startAttendanceScanner();
      const showQr=e.target.closest('[data-show-qr]'); if(showQr) return showStudentQr(showQr.dataset.showQr);
      const viewGroupStudents=e.target.closest('[data-view-group-students]'); if(viewGroupStudents) return showGroupStudents(viewGroupStudents.dataset.viewGroupStudents);
      const present=e.target.closest('[data-mark-present]'); if(present) return recordAttendance(present.dataset.markPresent,$('#attendanceSession')?.value||'حصة اليوم');
      const openPay=e.target.closest('[data-open-payment-for]'); if(openPay){ openModal('payment'); setTimeout(()=>{const inp=document.querySelector('#modalForm [name="student"]'); if(inp) inp.value=openPay.dataset.openPaymentFor;},0); return; }
      const markPaid=e.target.closest('[data-mark-paid]'); if(markPaid){ const d=load(); const code=normCode(markPaid.dataset.markPaid); const st=(d.students||[]).find(s=>normCode(s.code||s.studentCode||s.id)===code); if(!st) return toast('لم يتم العثور على الطالب'); st.paid=true; st.paymentDate=todayKey(); d.payments=Array.isArray(d.payments)?d.payments:[]; d.payments.unshift({id:'PAY-'+Date.now(),studentCode:st.code||st.studentCode,studentName:st.name||st.studentName,student:st.name||st.studentName,month:st.month||'',amount:'',method:'يدوي من الأدمن',status:'تم الدفع',date:todayKey()}); save(d); render(); toast('تم تسجيل الدفع للطالب'); return; }

      const correctAttempt=e.target.closest('[data-correct-attempt]'); if(correctAttempt){ return openAttemptCorrection(correctAttempt.dataset.correctAttempt); }

      const edit=e.target.closest('[data-edit]'); if(edit){ const [c,i]=edit.dataset.edit.split(':'); const type={bookings:'booking',students:'student',payments:'payment',materials:'pdf',exams:'exam',services:'service',reviews:'review',groups:'group',onlineLectures:'online'}[c]; return openModal(type, +i); }
      const delAtt=e.target.closest('[data-del-attendance]'); if(delAtt){ const d=load(); if(confirm('حذف سجل الحضور؟')){ d.attendance.splice(+delAtt.dataset.delAttendance,1); persist(d,'تم حذف سجل الحضور'); } }
      const del=e.target.closest('[data-del]'); if(del){ const [c,i]=del.dataset.del.split(':'); const d=load(); if(confirm('تأكيد الحذف؟')){ const arr=d[c]||[]; const removed=arr[+i]; arr.splice(+i,1); d[c]=arr; persist(d,'تم الحذف'); if(window.MFCloud?.ready && removed){ window.MFCloud.deleteDocument?.(c, removed.id||removed.code||removed.studentCode).catch(()=>{}); if(c==='materials' && removed.filePath){ window.MFCloud.deleteAttachment?.(removed.filePath).catch(()=>{}); } } } }
      const accept=e.target.closest('[data-accept-booking]'); if(accept){ const d=load(); const visible=(d.bookings||[]).filter(b=>String(b.status||'')!=='مقبول'); const b=visible[+accept.dataset.acceptBooking]; if(b){ const chosenGroup=(d.groups||[]).find(g=>String(g.id||'')===String(b.groupId||'') || String(g.name||'')===String(b.group||b.groupName||'')); if(chosenGroup && (chosenGroup.status==='closed' || groupIsFull(d, chosenGroup))){ toast('المجموعة مكتملة أو مغلقة، لا يمكن قبول الطالب عليها'); return; } b.status='مقبول'; b.approved=true; b.acceptedAt=new Date().toISOString(); d.students=d.students||[]; const finalCode=b.code||b.studentCode||('ST-'+Math.floor(1000+Math.random()*9000)); b.code=finalCode; b.studentCode=finalCode; let st=d.students.find(s=>normCode(s.code||s.studentCode||s.id)===normCode(finalCode)); if(!st){ st={id:finalCode,code:finalCode,studentCode:finalCode,name:b.name||b.studentName,studentName:b.name||b.studentName,phone:b.studentPhone||b.phone,studentPhone:b.studentPhone||b.phone,parentPhone:b.parentPhone,grade:b.grade,mode:b.group,group:b.groupName||b.group||(chosenGroup&&chosenGroup.name)||'',groupName:b.groupName||b.group||(chosenGroup&&chosenGroup.name)||'',groupId:b.groupId||(chosenGroup&&chosenGroup.id)||'',month:b.month,notes:b.notes,status:'active',paid:false,paymentStatus:'لم يدفع',createdFromBooking:true,acceptedAt:new Date().toISOString(),createdAt:new Date().toISOString()}; d.students.unshift(st); } else { Object.assign(st,{status:'active',grade:b.grade||st.grade,group:b.groupName||b.group||(chosenGroup&&chosenGroup.name)||st.group,groupName:b.groupName||b.group||(chosenGroup&&chosenGroup.name)||st.groupName,groupId:b.groupId||(chosenGroup&&chosenGroup.id)||st.groupId,month:b.month||st.month,acceptedAt:st.acceptedAt||new Date().toISOString()}); } d.bookings=(d.bookings||[]).filter(x=>normCode(x.code||x.studentCode||x.id)!==normCode(finalCode)); save(d); render(); toast('تم قبول الطالب ونقله إلى الطلاب'); if(window.MFCloud?.ready){ window.MFCloud.saveStudent?.(st).catch(()=>{}); window.MFCloud.deleteDocument?.('bookings', finalCode).catch(()=>{}); window.MFCloud.saveSiteData?.(d).catch(()=>{}); } } }
      const toggle=e.target.closest('[data-toggle-review]'); if(toggle){ const d=load(); const r=d.reviews[+toggle.dataset.toggleReview]; if(r){ r.approved=!(r.approved!==false && String(r.approved)!=='false'); persist(d,'تم تحديث حالة الريفيو'); } }
    });
    $('#adminModalClose')?.addEventListener('click',closeModal);
    $('#adminModal')?.addEventListener('click',e=>{ if(e.target.id==='adminModal') closeModal(); });
    $('#adminLogoutBtn')?.addEventListener('click',()=>{ sessionStorage.removeItem('eng_amr_admin_ok'); location.href='teacher-login.html'; });
    $('#attendanceForm')?.addEventListener('submit',e=>{ e.preventDefault(); recordAttendance($('#attendanceCode')?.value,$('#attendanceSession')?.value); if($('#attendanceCode')) $('#attendanceCode').value=''; });
    $('#adminExportBtn')?.addEventListener('click',()=>{ const d=load(); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'})); a.download='eng-amr-khaled-admin-data.json'; a.click(); });
  }
  function seed(){ const d=load(); let changed=false; if(!Array.isArray(d.files)) d.files=[];
    if(!Array.isArray(d.services)||!d.services.length){ d.services=[{id:'SV-1',title:'كورس برمجة تانية ثانوي',desc:'شرح عملي من الصفر مع تدريبات وامتحانات.',price:'350 جنيه',status:'متاحة'}]; changed=true; } if(changed) save(d); }
  document.addEventListener('DOMContentLoaded',async()=>{
    await loadCloudIntoLocal();
    seed(); bindTabs(); bindActions(); render(); if(window.hydrateIcons) window.hydrateIcons();
  });
})();
