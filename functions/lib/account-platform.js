'use strict';
const crypto=require('node:crypto');
const domain=require('./account-domain');
const {monthlyRankNotices,personalMonthlyRank}=require('./monthly-rank');
function createAccountPlatform({db,FieldValue,Timestamp,documentId,HttpsError,canonicalAcademicLabel,ACADEMIC_GRADES,studentIsApproved,academicAudienceKeysForStudent=()=>[],canReadNotice=async n=>!n.contentRef}){
  const failure=(code,message)=>{throw new HttpsError(code,message);};
  const valid=fn=>{try{return fn();}catch(e){failure('invalid-argument',e.message);}};
  const digest=value=>crypto.createHash('sha256').update(value).digest('hex').slice(0,48);
  const notificationRef=id=>{if(!/^[a-f0-9]{48}$/.test(String(id)))failure('invalid-argument','معرّف الإشعار غير صحيح.');return db.collection('account_notifications').doc(id);};
  const ms=value=>typeof value?.toMillis==='function'?value.toMillis():Number(value)||0;
  const projection=(snap,read={},student=null)=>{const n=snap.data(),personal=student&&personalMonthlyRank(n,student);return {id:snap.id,type:n.type,title:personal?.title||n.title,body:personal?.body||n.body,actionTab:n.actionTab,priority:n.priority,createdAt:ms(n.createdAt),expiresAt:n.expiresAt||null,readAt:read[snap.id]||null,source:n.source||'admin',contentRef:n.contentRef||null};};
  async function targetFor(input){
    const target=input&&typeof input==='object'?input:{};
    if(target.scope==='all')return {scope:'all'};
    if(target.scope==='grade'){
      const grade=canonicalAcademicLabel(target.grade);
      if(!ACADEMIC_GRADES.includes(grade))failure('invalid-argument','اختر المسار الدراسي الصحيح.');
      return {scope:'grade',grade};
    }
    if(target.scope==='group'){
      const scheduleId=String(target.scheduleId||'');
      if(!/^[A-Za-z0-9_-]{1,100}$/.test(scheduleId))failure('invalid-argument','اختر مجموعة صحيحة.');
      const snap=await db.collection('groups').doc(scheduleId).get();
      if(!snap.exists||snap.data().active===false)failure('not-found','المجموعة غير متاحة.');
      return {scope:'group',scheduleId};
    }
    if(target.scope==='students'){
      if(!Array.isArray(target.studentCodes)||!target.studentCodes.length||target.studentCodes.length>50)failure('invalid-argument','اختر من طالب إلى 50 طالبًا.');
      const studentCodes=[...new Set(target.studentCodes.map(code=>String(code).trim().toUpperCase()))];
      if(studentCodes.some(code=>!/^[A-Z0-9_-]{6,40}$/.test(code)))failure('invalid-argument','يوجد كود طالب غير صحيح.');
      // Server resolves each exact account once; no notification fan-out.
      for(const code of studentCodes){
        let snap=await db.collection('students').doc(code).get();
        if(!snap.exists){const rows=await db.collection('students').where('studentCode','==',code).limit(1).get();snap=rows.docs[0];}
        if(!snap?.exists||!studentIsApproved(snap.data()))failure('failed-precondition','كل الطلاب المحددين يجب أن تكون حساباتهم نشطة ومقبولة.');
      }
      return {scope:'students',studentCodes};
    }
    failure('invalid-argument','نطاق الإشعار غير صحيح.');
  }
  function keysFor(target){
    if(target.scope==='all')return ['all'];
    if(target.scope==='students')return target.studentCodes.map(code=>'student:'+code);
    if(target.scope==='group')return ['schedule:'+target.scheduleId];
    return ['grade:'+target.grade];
  }
  function page(query,cursor){
    if(!cursor)return query;
    if(!/^[a-f0-9]{48}$/.test(String(cursor.id))||!Number.isFinite(cursor.createdAt)||cursor.createdAt<=0)failure('invalid-argument','مؤشر الصفحة غير صحيح.');
    return query.startAfter(Timestamp.fromMillis(cursor.createdAt),cursor.id);
  }
  function cursorFor(snap){return snap?{id:snap.id,createdAt:ms(snap.data().createdAt)}:null;}
  async function manageLearningTrackAdmin(request,profile){
    const body=request.data||{},action=body.action;
    if(!['upsert','remove'].includes(action))failure('invalid-argument','إجراء المسار غير صحيح.');
    const track=action==='upsert'?valid(()=>domain.normalizeTrack(body.track)):null;
    const id=track?.id||String(body.id||'');
    if(!/^[a-z0-9][a-z0-9-]{1,59}$/.test(id))failure('invalid-argument','معرّف مسار غير صحيح.');
    return db.runTransaction(async tx=>{
      const ref=db.collection('settings').doc('platform'),snap=await tx.get(ref),settings=snap.exists?snap.data():{},version=Number(settings.learningTracksVersion)||0;
      if(!Number.isInteger(body.expectedVersion)||body.expectedVersion!==version)failure('aborted','تغيرت المسارات؛ حدّث الصفحة قبل الحفظ.');
      const rows=domain.tracks(settings).map(t=>({...t})),index=rows.findIndex(t=>t.id===id);
      if(action==='remove'){if(index<0)failure('not-found','المسار غير موجود.');rows.splice(index,1);}
      else if(index>=0)rows[index]=track;else rows.push(track);
      if(rows.length>24)failure('resource-exhausted','الحد الأقصى 24 مسارًا.');
      tx.set(ref,{learningTracks:rows,learningTracksVersion:version+1,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      return {learningTracks:rows,learningTracksVersion:version+1};
    });
  }
  async function publishAccountNotificationAdmin(request,profile){
    const body=request.data||{};
    if(body.action==='archive'){
      const ref=notificationRef(body.id);
      await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)failure('not-found','الإشعار غير موجود.');tx.update(ref,{active:false,archivedAt:FieldValue.serverTimestamp(),archivedBy:profile.uid});});
      return {id:body.id,active:false};
    }
    const payload=valid(()=>domain.normalizeNotification(body)),target=await targetFor(body.target);
    if(payload.expiresAt!==null&&(payload.expiresAt<=Date.now()||payload.expiresAt>Date.now()+366*86400000))failure('invalid-argument','تاريخ الانتهاء يجب أن يكون خلال عام.');
    if(!/^[A-Za-z0-9_-]{12,80}$/.test(String(body.requestId||'')))failure('invalid-argument','مفتاح نشر غير صحيح.');
    const id=digest(profile.uid+'|'+body.requestId),ref=notificationRef(id),fingerprint=digest(JSON.stringify({...payload,target}));
    return db.runTransaction(async tx=>{
      const existing=await tx.get(ref);
      if(existing.exists){if(existing.data().fingerprint!==fingerprint)failure('already-exists','مفتاح النشر مستخدم لرسالة أخرى.');return {id,duplicate:true,active:existing.data().active!==false};}
      const createdAt=Timestamp.fromMillis(Date.now());
      tx.create(ref,{...payload,target,audienceKeys:keysFor(target),fingerprint,active:true,createdAt,createdBy:profile.uid});
      return {id,...payload,createdAt:createdAt.toMillis(),active:true,target};
    });
  }
  async function publishMonthlyRankingNotifications(period,rankings){
    const notices=monthlyRankNotices(period,rankings);let created=0;
    for(let offset=0;offset<notices.length;offset+=200){
      const part=notices.slice(offset,offset+200),refs=part.map(n=>notificationRef(n.id));
      created+=await db.runTransaction(async tx=>{
        const snapshots=await tx.getAll(...refs);let count=0;
        snapshots.forEach((snap,index)=>{if(snap.exists)return;const {id,createdAt,...payload}=part[index];tx.create(refs[index],{...payload,createdAt:Timestamp.fromMillis(createdAt)});count++;});
        return count;
      });
    }
    return {created,noticeCount:notices.length};
  }
  async function listAccountNotificationsAdmin(request){
    const query=db.collection('account_notifications').orderBy('createdAt','desc').orderBy(documentId,'desc');
    const snap=await page(query,request.data?.cursor).limit(21).get(),docs=snap.docs.slice(0,20);
    return {rows:docs.map(d=>({...projection(d),target:d.data().target,active:d.data().active!==false})),hasMore:snap.docs.length>20,nextCursor:cursorFor(docs.at(-1))};
  }
  async function getStudentAccountNotifications(request,session){
    const student={...session.student,studentCode:session.studentCode,grade:canonicalAcademicLabel(session.student.grade)};
    const query=db.collection('account_notifications').where('audienceKeys','array-contains-any',[...new Set([...domain.audienceKeys(student),...academicAudienceKeysForStudent(student)])]).where('createdAt','<=',Timestamp.fromMillis(Date.now())).orderBy('createdAt','desc').orderBy(documentId,'desc');
    let [snap,state]=await Promise.all([page(query,request.data?.cursor).limit(21).get(),db.collection('account_notification_reads').doc(session.studentCode).get()]);
    const reads=state.exists?state.data().read||{}:{},rows=[];
    let cursor=request.data?.cursor||null,hasMore=false;
    // Fill one visible page even when revoked or archived notices occupy query slots.
    // Bound scanning to 60 rows; further inaccessible history remains paginated.
    for(let batch=0;batch<3;batch++){
      const docs=snap.docs.slice(0,20);
      const permitted=await Promise.all(docs.map(async d=>domain.visibleTo(d.data(),student)&&await canReadNotice(d.data(),student)));
      for(let i=0;i<docs.length;i++){
        cursor=cursorFor(docs[i]);
        if(permitted[i])rows.push(projection(docs[i],reads,student));
        if(rows.length===20)return {rows,hasMore:i+1<snap.docs.length,nextCursor:cursor};
      }
      hasMore=snap.docs.length>20;
      if(!hasMore||batch===2)break;
      snap=await page(query,cursor).limit(21).get();
    }
    return {rows,hasMore,nextCursor:cursor};
  }
  async function setStudentAccountNotificationRead(request,session){
    const id=String(request.data?.id||''),ref=notificationRef(id),snap=await ref.get();
    const student={...session.student,studentCode:session.studentCode,grade:canonicalAcademicLabel(session.student.grade)};
    if(!snap.exists||!domain.visibleTo(snap.data(),student)||!await canReadNotice(snap.data(),student))failure('permission-denied','الإشعار غير متاح لهذا الحساب.');
    if(typeof request.data?.read!=='boolean')failure('invalid-argument','حالة القراءة غير صحيحة.');
    const state=db.collection('account_notification_reads').doc(session.studentCode),now=Date.now();
    return db.runTransaction(async tx=>{
      const old=await tx.get(state),entries=Object.entries(old.exists?old.data().read||{}:{}).filter(([key,value])=>/^[a-f0-9]{48}$/.test(key)&&Number.isFinite(Number(value))&&Number(value)>0);
      const read=Object.fromEntries(entries);
      // Never silently resurrect a still-visible notice as unread. Keep the map
      // below Firestore's document limit and fail explicitly at capacity.
      if(request.data.read&&!read[id]&&entries.length>=6000)failure('resource-exhausted','سجل قراءة الحساب ممتلئ؛ تواصل مع إدارة المنصة.');
      if(request.data.read)read[id]=now;else delete read[id];
      tx.set(state,{studentCode:session.studentCode,read,updatedAt:FieldValue.serverTimestamp()});
      return {id,readAt:read[id]||null};
    });
  }
  return {manageLearningTrackAdmin,publishAccountNotificationAdmin,publishMonthlyRankingNotifications,listAccountNotificationsAdmin,getStudentAccountNotifications,setStudentAccountNotificationRead};
}
module.exports={createAccountPlatform};