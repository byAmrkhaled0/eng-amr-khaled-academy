(function(){
  'use strict';

  const safe=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const isStructuredExam=source=>/(?:^|\n)\s*(?:النوع|type)\s*[:=：-]?/i.test(String(source||''))&&/(?:^|\n)\s*(?:الدرجة|mark|points)\s*[:=：-]?/i.test(String(source||''));
  const call=name=>async payload=>{
    if(typeof firebase==='undefined'||!firebase.apps?.length)throw new Error('Firebase غير متاح');
    const region=window.MF_FIREBASE_CONFIG?.functionsRegion||'europe-west1';
    const result=await firebase.app().functions(region).httpsCallable(name)(payload||{});
    return result?.data??result;
  };
  const restoreCall=call('restoreContentItem');
  const repairCall=call('repairLegacyExamFormats');

  function mergeRows(current,extra){
    const map=new Map((Array.isArray(current)?current:[]).map(row=>[String(row.id||''),row]));
    (Array.isArray(extra)?extra:[]).forEach(row=>map.set(String(row.id||''),{...(map.get(String(row.id||''))||{}),...row}));
    return [...map.values()];
  }
  async function unorderedCollection(name,limit=1000){
    const snap=await firebase.firestore().collection(name).limit(limit).get();
    return snap.docs.map(doc=>({id:doc.id,...doc.data()}));
  }

  function installDataRecovery(){
    if(!window.MFCloud?.loadSiteData||window.MFCloud.__auditRecoveryInstalled)return;
    window.MFCloud.__auditRecoveryInstalled=true;
    const original=window.MFCloud.loadSiteData.bind(window.MFCloud);
    window.MFCloud.loadSiteData=async options=>{
      const data=await original(options||{});
      if(!data)return data;
      try{
        const [exams,assignments]=await Promise.all([unorderedCollection('exams'),unorderedCollection('assignments')]);
        data.exams=mergeRows(data.exams,exams);
        data.assignments=mergeRows(data.assignments,assignments);
        const hasLegacy=(data.exams||[]).some(exam=>String(exam.text||exam.questionsText||'').trim()&&!isStructuredExam(exam.text||exam.questionsText));
        if(hasLegacy&&!sessionStorage.getItem('tm-legacy-exam-repair-v638')){
          try{
            const result=await repairCall({});
            sessionStorage.setItem('tm-legacy-exam-repair-v638','1');
            if(Number(result?.repaired||0)>0){
              const refreshed=await unorderedCollection('exams');
              data.exams=mergeRows(data.exams,refreshed);
            }
          }catch(error){console.warn('legacy-exam-repair-deferred',error);}
        }
      }catch(error){console.warn('admin-legacy-content-load',error);}
      return data;
    };
    window.MFCloud.restoreContentItem=payload=>restoreCall(payload);
    window.MFCloud.repairLegacyExamFormats=payload=>repairCall(payload||{});
  }

  window.restoreArchivedContent=async function(collection,id){
    const label=collection==='exams'?'الامتحان':'الواجب';
    if(!confirm(`استعادة ${label} إلى المنصة وإتاحته للطلاب مرة أخرى؟`))return;
    try{
      const result=await window.MFCloud?.restoreContentItem?.({collection,id});
      if(!result?.ok)throw new Error('الخادم لم يؤكد الاستعادة');
      const records=typeof adminData!=='undefined'&&Array.isArray(adminData[collection])?adminData[collection]:[];
      const row=records.find(item=>String(item.id)===String(id));
      if(row)Object.assign(row,{archived:false,active:true,published:true,lifecycleStatus:'open'});
      if(typeof saveData==='function'&&typeof adminData!=='undefined')saveData(adminData);
      if(typeof aToast==='function')aToast(`تمت استعادة ${label} إلى المنصة`);
      if(collection==='exams')window.renderExams?.();else window.renderAssignments?.();
    }catch(error){if(typeof aToast==='function')aToast(typeof adminActionErrorMessage==='function'?adminActionErrorMessage(error,`تعذر استعادة ${label}.`):`تعذر استعادة ${label}.`);}
  };

  window.repairLegacyExamsAdmin=async function(){
    const button=document.querySelector('[data-repair-legacy-exams]');if(button){button.disabled=true;button.classList.add('is-loading');}
    try{
      const result=await window.MFCloud?.repairLegacyExamFormats?.({});
      sessionStorage.setItem('tm-legacy-exam-repair-v638','1');
      if(typeof reloadFromCloud==='function')await reloadFromCloud();
      if(typeof aToast==='function')aToast(Number(result?.repaired||0)?`تم إصلاح ${Number(result.repaired)} امتحان قديم مع إنشاء نسخة أمان`:'كل الامتحانات بصيغة سليمة');
      window.renderExams?.();
    }catch(error){if(typeof aToast==='function')aToast(typeof adminActionErrorMessage==='function'?adminActionErrorMessage(error,'تعذر فحص الامتحانات القديمة.'):'تعذر فحص الامتحانات القديمة.');}
    finally{if(button){button.disabled=false;button.classList.remove('is-loading');}}
  };

  function relabelArchiveButtons(root,collection,title){
    root.querySelectorAll('button[onclick]').forEach(button=>{
      const handler=button.getAttribute('onclick')||'';
      if(!handler.includes(`deleteItem('${collection}'`))return;
      button.textContent='حذف من المنصة';
      button.title=title;
    });
  }

  function enhanceExams(){
    const root=document.getElementById('adminContent');if(!root)return;
    relabelArchiveButtons(root,'exams','يختفي من الطلاب مع الاحتفاظ بالمحاولات والدرجات وإمكانية الاستعادة');
    const head=root.querySelector('.compact-admin-head');
    if(head&&!head.querySelector('[data-repair-legacy-exams]')){
      const button=document.createElement('button');button.type='button';button.className='btn ghost';button.dataset.repairLegacyExams='true';button.textContent='فحص الامتحانات القديمة';button.onclick=window.repairLegacyExamsAdmin;head.appendChild(button);
    }
    const archived=(typeof adminData!=='undefined'&&Array.isArray(adminData.exams)?adminData.exams:[]).filter(exam=>exam.archived===true);
    root.querySelector('[data-archived-exams-v638]')?.remove();
    const grid=root.querySelector('.admin-exam-grid');if(!grid||!archived.length)return;
    const section=document.createElement('details');section.className='card admin-collapsible';section.dataset.archivedExamsV638='true';
    section.innerHTML=`<summary>المحذوفة من المنصة <span class="badge warn">${archived.length}</span></summary><div class="admin-detail-body">${archived.slice().reverse().map(exam=>`<div class="admin-content-row"><div><b>${safe(exam.title||'اختبار')}</b><small>${safe(exam.grade||'كل المسارات')} · المحاولات والدرجات محفوظة</small></div><button class="small-btn primary" type="button" onclick="restoreArchivedContent('exams','${safe(exam.id)}')">استعادة للمنصة</button></div>`).join('')}</div>`;
    grid.insertAdjacentElement('afterend',section);
  }

  function enhanceHomework(){
    const root=document.getElementById('adminContent');if(!root)return;
    relabelArchiveButtons(root,'assignments','يختفي من الطلاب مع الاحتفاظ بالتسليمات والدرجات وإمكانية الاستعادة');
    const archived=(typeof adminData!=='undefined'&&Array.isArray(adminData.assignments)?adminData.assignments:[]).filter(item=>item.archived===true);
    root.querySelector('[data-archived-homework-v638]')?.remove();
    const lists=root.querySelector('.admin-content-lists,.homework-workspace-list');
    if(lists&&archived.length){
      const section=document.createElement('details');section.className='card admin-content-full admin-collapsible';section.dataset.archivedHomeworkV638='true';
      section.innerHTML=`<summary>الواجبات المحذوفة من المنصة <span class="badge warn">${archived.length}</span></summary><div class="admin-detail-body">${archived.slice().reverse().map(item=>`<div class="admin-content-row"><div><b>${safe(item.title||'واجب')}</b><small>${safe(item.lessonTitle||'')} · التسليمات والدرجات محفوظة</small></div><button class="small-btn primary" type="button" onclick="restoreArchivedContent('assignments','${safe(item.id)}')">استعادة للمنصة</button></div>`).join('')}</div>`;
      lists.appendChild(section);
    }
    const selected=document.getElementById('homeworkAttendanceAssignment')?.value||'';
    const assignment=(typeof adminData!=='undefined'&&Array.isArray(adminData.assignments)?adminData.assignments:[]).find(item=>String(item.id)===String(selected));
    const note=root.querySelector('.homework-archive-note');
    if(note&&assignment?.archived===true&&!note.parentElement?.querySelector('[data-homework-restore-v638]')){
      const button=document.createElement('button');button.type='button';button.className='small-btn primary';button.dataset.homeworkRestoreV638='true';button.textContent='استعادة للمنصة';button.onclick=()=>window.restoreArchivedContent('assignments',assignment.id);note.insertAdjacentElement('afterend',button);
    }
  }

  function installRenderEnhancers(){
    const examBase=window.renderExams;
    if(typeof examBase==='function'&&!examBase.__v638){const wrapped=function(){const result=examBase.apply(this,arguments);queueMicrotask(enhanceExams);return result;};wrapped.__v638=true;window.renderExams=wrapped;}
    const homeworkBase=window.renderAssignments;
    if(typeof homeworkBase==='function'&&!homeworkBase.__v638){const wrapped=function(){const result=homeworkBase.apply(this,arguments);queueMicrotask(enhanceHomework);return result;};wrapped.__v638=true;window.renderAssignments=wrapped;}
    if(document.querySelector('.admin-exam-grid'))enhanceExams();
    if(document.getElementById('homeworkAttendanceAssignment'))enhanceHomework();
  }

  installDataRecovery();
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{installDataRecovery();installRenderEnhancers();},60));
})();
