'use strict';
const crypto=require('node:crypto');
const domain=require('./account-domain');
const {academicAudienceKeysForItem,academicAudienceKeysForStudent,canonicalAcademicLabel}=require('./academic-targeting');
const KINDS={materials:['LECTURE','lectures'],lectures:['LECTURE','lectures'],assignments:['HOMEWORK','homework'],exams:['EXAM','exams'],lecture_materials:['LECTURE','lectures'],question_banks:['LECTURE','lectures'],bank_questions:['LECTURE','lectures'],assignments_v2:['HOMEWORK','lectures'],monthly_exams:['EXAM','lectures']};
const digest=v=>crypto.createHash('sha256').update(v).digest('hex').slice(0,48);
const millis=v=>typeof v?.toMillis==='function'?v.toMillis():typeof v==='number'?v:Date.parse(v||'')||0;
const published=r=>!!r&&r.active!==false&&r.published!==false&&r.studentVisible!==false&&!r.archived&&!r.cancelled&&!['draft','hidden','archived','cancelled','مسودة','مخفي','مؤرشف'].includes(String(r.status||r.lifecycleStatus||'').toLowerCase());
function contentNotice(collection,id,after,before,now=Date.now()){
 if(!KINDS[collection]||!published(after)||published(before))return null;
 const [type,actionTab]=KINDS[collection],availableAt=Math.max(now,millis(after.publishAt),millis(after.openAt)),expiresAt=millis(after.closeAt)||null;
 if(expiresAt&&expiresAt<=availableAt)return null;
 return {id:digest('learning:'+collection+':'+id),type,actionTab,title:type==='EXAM'?'اختبار جديد':type==='HOMEWORK'?'واجب جديد':'محتوى تعليمي جديد',body:String(after.title||'افتح حسابك للاطلاع على الجديد.').slice(0,220),priority:type==='EXAM'?'important':'normal',active:true,target:{scope:'all'},audienceKeys:academicAudienceKeysForItem(after),availableAt,expiresAt,contentRef:{collection,id,lectureId:String(after.lectureId||''),lectureSource:after.lectureSource==='materials'?'materials':'lectures'},source:'learning-publish'};
}
function studentKeys(student){return [...new Set([...domain.audienceKeys({...student,grade:canonicalAcademicLabel(student.grade)}),...academicAudienceKeysForStudent(student)])];}
function createStudentDelivery({db,Timestamp,FieldValue,documentId,HttpsError,studentIsApproved,canReadContent,enqueue,send,localOnly=false,now=()=>Date.now()}){
 const fail=(code,message)=>{throw new HttpsError(code,message);};
 const validId=id=>/^[a-f0-9]{48}$/.test(String(id||''));
 const tokenId=token=>{if(typeof token!=='string'||!/^[-A-Za-z0-9_:~.]{40,4096}$/.test(token))fail('invalid-argument','رمز إشعارات الموبايل غير صالح.');return digest(token);};
 async function publish(collection,id,after,before){
  const notice=contentNotice(collection,id,after,before,now());if(!notice)return {created:false};
  const {id:noticeId,...body}=notice;try{await db.doc('account_notifications/'+noticeId).create({...body,createdAt:Timestamp.fromMillis(notice.availableAt)});return {created:true,id:noticeId};}catch(e){if(e.code===6||e.code==='already-exists')return {created:false,id:noticeId};throw e;}
 }
 async function allowed(notice,student){
  if(!studentIsApproved(student)||!domain.visibleTo(notice,{...student,grade:canonicalAcademicLabel(student.grade)},now())||Number(notice.availableAt||0)>now())return false;
  return notice.contentRef?canReadContent(notice.contentRef,student):true;
 }
 async function register(session,token){
  const id=tokenId(token),code=session.studentCode,ref=db.doc('student_push_tokens/'+id),state=db.doc('student_push_devices/'+code);
  return db.runTransaction(async tx=>{const [old,devices]=await Promise.all([tx.get(ref),tx.get(state)]);if(old.exists&&old.data().studentCode!==code)fail('permission-denied','الجهاز مربوط بحساب طالب آخر. سجّل الخروج من الحساب السابق أولًا.');const ids=[...new Set([...(devices.exists?devices.data().tokens||[]:[]),id])];if(ids.length>5)fail('resource-exhausted','وصلت للحد الأقصى: خمسة أجهزة. أوقف الإشعارات على جهاز قديم أولًا.');tx.set(ref,{token,studentCode:code,audienceKeys:studentKeys({...session.student,studentCode:code}),active:true,updatedAt:FieldValue.serverTimestamp()});tx.set(state,{tokens:ids,updatedAt:FieldValue.serverTimestamp()});return {registered:true};});
 }
 async function unregister(session,token){
  const id=tokenId(token),ref=db.doc('student_push_tokens/'+id),state=db.doc('student_push_devices/'+session.studentCode);
  return db.runTransaction(async tx=>{const [old,devices]=await Promise.all([tx.get(ref),tx.get(state)]);if(!old.exists)return {unregistered:false};if(old.data().studentCode!==session.studentCode)fail('permission-denied','الجهاز لا يخص حسابك.');tx.delete(ref);tx.set(state,{tokens:(devices.exists?devices.data().tokens||[]:[]).filter(x=>x!==id),updatedAt:FieldValue.serverTimestamp()});return {unregistered:true};});
 }
 async function syncAudience(code,after,before){
  const fields=['grade','group','scheduleId','groupId','active','accessStatus','approvalStatus'];if(before&&after&&fields.every(k=>JSON.stringify(before[k])===JSON.stringify(after[k])))return;
  const docs=await db.collection('student_push_tokens').where('studentCode','==',code).limit(6).get();if(docs.empty)return;const batch=db.batch();for(const doc of docs.docs){if(!after||!studentIsApproved(after))batch.delete(doc.ref);else batch.update(doc.ref,{audienceKeys:studentKeys({...after,studentCode:code}),updatedAt:FieldValue.serverTimestamp()});}if(!after||!studentIsApproved(after))batch.set(db.doc('student_push_devices/'+code),{tokens:[]},{merge:true});await batch.commit();
 }
 async function queue(data,date=now()){
  if(localOnly)return {queued:false,localOnly:true};
  const when=Math.min(Math.max(now(),date),now()+28*86400000);await enqueue(data,new Date(when));return {queued:true};
 }
 async function dispatch(data){
  if(!validId(data?.noticeId)||data.cursor&&!validId(data.cursor)||!Number.isInteger(data.offset??0)||(data.offset??0)<0||(data.offset??0)>500)fail('invalid-argument','مهمة إشعار غير صالحة.');
  if(localOnly)return {sent:0,localOnly:true};
  const snap=await db.doc('account_notifications/'+data.noticeId).get();if(!snap.exists||snap.data().active===false)return {sent:0};const notice=snap.data();
  if(Number(notice.availableAt||0)>now())return queue(data,notice.availableAt);
  if(notice.expiresAt&&Number(notice.expiresAt)<=now())return {sent:0};
  const keys=(notice.audienceKeys||[]).slice(data.offset||0,(data.offset||0)+30);if(!keys.length)return {sent:0};
  const batchId=digest(data.noticeId+':'+(data.offset||0)+':'+(data.cursor||'')),state=db.doc('student_push_deliveries/'+batchId);
  const claimed=await db.runTransaction(async tx=>{const old=await tx.get(state);if(old.exists&&old.data().done)return false;if(old.exists&&Number(old.data().leaseUntil)>now())fail('aborted','دفعة الإشعارات قيد التنفيذ.');tx.set(state,{noticeId:data.noticeId,leaseUntil:now()+120000,updatedAt:FieldValue.serverTimestamp()},{merge:true});return true;});if(!claimed)return {sent:0,duplicate:true};
  try{
   let query=db.collection('student_push_tokens').where('audienceKeys','array-contains-any',keys).orderBy(documentId);if(data.cursor)query=query.startAfter(data.cursor);const found=await query.limit(201).get(),tokens=found.docs.slice(0,200);
   const codes=[...new Set(tokens.map(d=>d.data().studentCode))],profiles=codes.length?await db.getAll(...codes.map(code=>db.doc('students/'+code))):[],students=new Map(profiles.map((d,i)=>d.exists?[codes[i],{...d.data(),studentCode:codes[i]}]:null).filter(Boolean));for(const code of codes)if(!students.has(code)){for(const field of ['studentCode','code','id']){const legacy=await db.collection('students').where(field,'==',code).limit(1).get();if(!legacy.empty){students.set(code,{...legacy.docs[0].data(),studentCode:code});break;}}}const selected=[];
   for(const doc of tokens){const t=doc.data(),student=students.get(t.studentCode);if(t.active!==false&&student&&await allowed(notice,student))selected.push({doc,student,token:t.token});}
   const messages=selected.map(t=>({token:t.token,data:{audience:'student',studentCode:t.student.studentCode,notificationId:data.noticeId,expiresAt:String(notice.expiresAt||0),title:'TECHNO MINDS',body:notice.type==='EXAM'?'في اختبار جديد يخصك. افتح حسابك للتفاصيل.':notice.type==='HOMEWORK'?'في واجب جديد يخصك. افتح حسابك للتفاصيل.':'في تحديث جديد يخصك. افتح حسابك للتفاصيل.',actionTab:notice.actionTab||'overview',url:'/student.html#'+(notice.actionTab||'overview')},webpush:{headers:{TTL:'86400',Urgency:'normal'}}}));
   const result=messages.length?await send(messages):{responses:[]};let transient=false;const cleanup=db.batch();let removals=0;
   result.responses.forEach((r,i)=>{if(r.success)return;if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(r.error?.code)){cleanup.delete(selected[i].doc.ref);cleanup.set(db.doc('student_push_devices/'+selected[i].student.studentCode),{tokens:FieldValue.arrayRemove(selected[i].doc.id)},{merge:true});removals++;}else transient=true;});if(removals)await cleanup.commit();if(transient)throw Error('Transient student push delivery failure');
   // Enqueue continuation before marking complete: retries use deterministic task IDs.
   if(found.docs.length>200)await queue({...data,cursor:tokens.at(-1).id});else if((data.offset||0)+30<(notice.audienceKeys||[]).length)await queue({noticeId:data.noticeId,offset:(data.offset||0)+30});
   await state.set({done:true,leaseUntil:0,sent:messages.length,updatedAt:FieldValue.serverTimestamp()},{merge:true});return {sent:messages.length};
  }catch(e){await state.set({leaseUntil:0,updatedAt:FieldValue.serverTimestamp()},{merge:true});throw e;}
 }
 return {publish,allowed,register,unregister,syncAudience,queue,dispatch};
}
module.exports={KINDS,contentNotice,published,studentKeys,createStudentDelivery};
