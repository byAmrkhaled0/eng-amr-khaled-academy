/* Shared, dependency-free contracts used by the existing website and trusted backend. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.TMAccountDomain=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DEFAULT_TRACKS=[
    {id:'programming-web',title:'البرمجة وتطوير الويب',description:'Python وJavaScript وتطبيقات ومواقع عملية',icon:'code',active:true,order:1,destination:'practical.html',audienceLabel:'من البداية إلى المشاريع'},
    {id:'artificial-intelligence',title:'الذكاء الاصطناعي',description:'تعلّم المفاهيم وتطبيق الأنظمة الذكية',icon:'brain',active:true,order:2,destination:'learning-path.html',audienceLabel:'تعلّم وتطبيق'},
    {id:'robotics-arduino',title:'الروبوتكس وArduino',description:'حساسات ومحركات وبرمجة وتحكم عملي',icon:'cpu',active:true,order:3,destination:'materials.html',audienceLabel:'مشاريع عملية'},
    {id:'electronics-pcb',title:'الإلكترونيات وتصميم PCB',description:'تصميم الدوائر والتجميع واللحام والاختبار',icon:'settings',active:true,order:4,destination:'about.html',audienceLabel:'من الدائرة إلى التنفيذ'}
  ];
  const TYPES=['HOMEWORK','EXAM','LECTURE','ATTENDANCE','PAYMENT','GENERAL'];
  const TABS=['overview','lectures','homework','exams','grades','attendance','motivation','recitation','payments','transfer'];
  const ICONS=['code','brain','cpu','settings','book-open','star','shield','briefcase'];
  const ROUTES=['index.html','learning-path.html','about.html','practical.html','materials.html','theory-lectures.html','questions.html','exams.html','student.html','parent.html','reviews.html','privacy.html','terms.html'];
  const string=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
  const code=v=>String(v||'').trim().toUpperCase();
  function demand(ok,message){if(!ok)throw new Error(message);}
  function destination(value){
    const s=string(value,220);
    demand(!s||ROUTES.some(route=>s===route||s.startsWith(route+'#')),'اختر رابطًا داخليًا صحيحًا.');
    demand(!s||/^[a-z-]+\.html(?:#[A-Za-z0-9_-]+)?$/.test(s),'الرابط غير آمن.');
    return s||'learning-path.html';
  }
  function normalizeTrack(value){
    demand(value&&typeof value==='object','بيانات المسار غير صحيحة.');
    const id=string(value.id,60),title=string(value.title,100),description=string(value.description,240);
    demand(/^[a-z0-9][a-z0-9-]{1,59}$/.test(id)&&title.length>=2,'اكتب معرّفًا وعنوانًا صحيحين.');
    const icon=ICONS.includes(value.icon)?value.icon:'book-open';
    const image=string(value.image,180);
    demand(!image||/^assets\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpe?g)$/.test(image),'اختر صورة محلية من ملفات الموقع.');
    const order=Number(value.order);
    demand(Number.isInteger(order)&&order>=0&&order<=999,'ترتيب المسار غير صحيح.');
    return {id,title,description,icon,image,active:value.active!==false,order,destination:destination(value.destination),audienceLabel:string(value.audienceLabel,80)};
  }
  function tracks(settings){return Array.isArray(settings?.learningTracks)?settings.learningTracks:DEFAULT_TRACKS;}
  function activeTracks(settings){return tracks(settings).filter(t=>t.active!==false).slice().sort((a,b)=>Number(a.order)-Number(b.order)||String(a.id).localeCompare(String(b.id)));}
  function normalizeNotification(value){
    demand(value&&typeof value==='object'&&TYPES.includes(value.type),'نوع الإشعار غير صحيح.');
    const title=string(value.title,100),body=string(value.body,1200);
    demand(title.length>=2&&body.length>=2,'اكتب عنوانًا ورسالة واضحة.');
    const actionTab=value.actionTab||({HOMEWORK:'homework',EXAM:'exams',LECTURE:'lectures',ATTENDANCE:'attendance',PAYMENT:'payments',GENERAL:'overview'}[value.type]);
    demand(TABS.includes(actionTab),'وجهة الإشعار غير صحيحة.');
    const priority=['normal','important'].includes(value.priority)?value.priority:'normal';
    const expiresAt=value.expiresAt?Number(value.expiresAt):null;
    demand(expiresAt===null||Number.isFinite(expiresAt),'تاريخ انتهاء غير صحيح.');
    return {type:value.type,title,body,actionTab,priority,expiresAt};
  }
  function audienceKeys(student){
    return ['all','student:'+code(student.studentCode||student.code||student.id),'grade:'+String(student.grade||'').trim(),student.scheduleId||student.groupId?'schedule:'+String(student.scheduleId||student.groupId):''].filter(Boolean);
  }
  function visibleTo(notification,student,now=Date.now()){
    if(Number(notification.availableAt||0)>now)return false;
    if(notification.active===false||notification.expiresAt&&Number(notification.expiresAt)<=now)return false;
    const t=notification.target||{},c=code(student.studentCode||student.code||student.id);
    if(t.scope==='all')return true;
    if(t.scope==='students')return Array.isArray(t.studentCodes)&&t.studentCodes.includes(c);
    if(t.scope==='group')return String(t.scheduleId||'')===String(student.scheduleId||student.groupId||'')&&!!t.scheduleId;
    if(t.scope==='grade')return !!t.grade&&t.grade===String(student.grade||'').trim();
    return false;
  }
  function paymentAlert(student,report,now=new Date()){
    const payment=student?.paymentAccountState||report?.payment;
    if(!payment||['exempt','exempted','waived','free','paid'].includes(payment.status))return null;
    const expected=Number(payment.expectedAmount),paid=Number(payment.paidAmount);
    if(!Number.isFinite(expected)||expected<=0||!Number.isFinite(paid)||paid>=expected)return null;
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const part=k=>parts.find(p=>p.type===k)?.value||'';
    const monthKey=part('year')+'-'+part('month');
    if((student?.paymentAccountState?.monthKey||report?.monthKey)!==monthKey)return null;
    const overdue=Number(part('day'))>10,stage=overdue?'overdue':'due',studentCode=code(student.studentCode);
    return {id:'payment-account-alert:'+studentCode+':'+monthKey+':'+stage,type:'PAYMENT',title:overdue?'تنبيه دفع الاشتراك':'مستحق حتى يوم 10',body:(overdue?'متأخر في الدفع':'مستحق حتى يوم 10')+' · '+monthKey+' · المتبقي '+Math.max(0,expected-paid)+' ج.م',actionTab:'payments',priority:overdue?'important':'normal',createdAt:Date.parse(monthKey+'-01T00:00:00+02:00'),source:'payment-state',virtual:true,monthKey};
  }

  // Inputs must be the server-filtered account payload, never an Admin/public store.
  function academicAlerts(student,options={}){
    if(!student||student.active===false||student.accessStatus==='pending')return [];
    const now=Number(options.now??Date.now()),c=code(student.studentCode),rows=[];
    const millis=value=>{if(typeof value==='number')return value;if(typeof value?.toMillis==='function')return value.toMillis();if(value?.seconds!==undefined||value?._seconds!==undefined)return Number(value.seconds??value._seconds)*1000;const n=Date.parse(value||'');return Number.isFinite(n)?n:0;};
    const visible=row=>row&&row.active!==false&&row.published!==false&&!row.archived&&!row.cancelled&&!['draft','مسودة','archived','cancelled'].includes(row.status)&&(!millis(row.publishAt)||millis(row.publishAt)<=now);
    const add=(stage,id,type,title,body,actionTab,date,priority='normal',contentRef=null)=>{if(id)rows.push({id:stage+':'+c+':'+id,type,title,body:String(body||title),actionTab,createdAt:millis(date)||null,priority,virtual:true,source:'authorized-account-data',contentRef});};
    const submitted=new Set((student.homeworks||[]).filter(h=>h.assignmentId).map(h=>String(h.assignmentId)));
    for(const a of student.assignments||[])if(visible(a)&&!a.submissionClosed&&(!submitted.has(String(a.id))||a.extraAttemptAvailable)&&(!millis(a.dueDate)||millis(a.dueDate)>now))add('homework',a.id,'HOMEWORK','واجب جديد',a.title,'homework',a.publishAt||a.createdAt||a.dueDate,'normal',{collection:'assignments',id:String(a.id)});
    const lectures=[...(student.materials||[]).map(a=>({...a,_source:'materials'})),...(options.curriculum?.lectures||[]).map(a=>({...a,_source:'lectures'}))];
    for(const a of lectures)if(visible(a)&&Number(a.progress||0)<100&&(!millis(a.openAt)||millis(a.openAt)<=now)&&(!millis(a.closeAt)||millis(a.closeAt)>now))add('lecture',a._source+':'+a.id,'LECTURE','محاضرة جديدة',a.title,'lectures',a.openAt||a.publishedAt||a.createdAt,'normal',{collection:a._source,id:String(a.id)});
    const exams=Array.isArray(options.exams)?options.exams:(student.monthlyReport?.results?.rows||[]).filter(e=>['upcoming','available'].includes(e.status)).map(e=>({...e,id:e.examId,openAt:e.date}));
    for(const e of exams){if(!visible(e)||e.submitted||e.attempt||['submitted','graded','pending_review','absent','closed','completed'].includes(e.status))continue;
      const open=millis(e.openAt||e.startAt||e.date),close=millis(e.closeAt||e.endAt);
      if(close&&close<=now)continue;
      if(open>now&&open-now<=86400000)add('exam-upcoming',e.id||e.examId,'EXAM','الاختبار سيفتح قريبًا',e.title||e.activityName,'exams',open,'important',{collection:'exams',id:String(e.id||e.examId)});
      else if(open&&open<=now||e.status==='available')add('exam-open',e.id||e.examId,'EXAM','الاختبار متاح الآن',e.title||e.activityName,'exams',open,'important',{collection:'exams',id:String(e.id||e.examId)});
    }
    const attendance=student.monthlyReport?.attendance;
    if(attendance?.consecutiveAbsenceWarning)add('attendance',student.monthlyReport.monthKey,'ATTENDANCE','تنبيه متابعة الحضور','يوجد غياب متكرر يحتاج متابعة. افتح سجل الحضور.','attendance',attendance.latestDate,'important');
    return [...new Map(rows.map(row=>[row.id,row])).values()];
  }
  return {DEFAULT_TRACKS,TYPES,TABS,ICONS,ROUTES,normalizeTrack,normalizeNotification,tracks,activeTracks,audienceKeys,visibleTo,paymentAlert,academicAlerts};
});