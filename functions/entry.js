'use strict';

const zlib = require('zlib');
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const base = require('./index');

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;
const CALLABLE = { region:'europe-west1', timeoutSeconds:30, invoker:'public' };
const BACKUP_COLLECTIONS = [
  'settings','users','students','student_portal','parent_portal','bookings','booking_status','reviews',
  'materials','questions','groups','assignments','exams','exam_attempts','exam_absences','homework_submissions',
  'attendance','recitations','grades','payments','monthly_payments','payment_transactions','reports','monthly_reports','activityLog','client_errors',
  'student_attempts','exam_locks','homework_submission_locks','homework_attempt_grants','homework_review_history','assessment_versions','class_sessions','student_notes','leaderboard_archives',
  'curriculum','units','lectures','lecture_materials','assignments_v2','assignment_questions','question_banks','bank_questions','monthly_exams','exam_questions_v2','teacher_files','student_progress'
];

function cleanDocId(value){return String(value||'').trim().replace(/[\\/#?\[\]]/g,'-');}
function text(value,max=500){return String(value||'').trim().slice(0,max);}
async function requireAdmin(request){
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','يجب تسجيل دخول الإدارة.');
  if(request.auth.token?.admin!==true||request.auth.token?.email_verified!==true)throw new HttpsError('permission-denied','الحساب غير مصرح له بهذه العملية.');
  const snap=await db.collection('users').doc(request.auth.uid).get();
  const row=snap.exists?snap.data():{};
  if(!snap.exists||row.active===false||row.role!=='admin')throw new HttpsError('permission-denied','حساب الإدارة غير مفعل.');
  return {uid:request.auth.uid,email:request.auth.token?.email||row.email||'',role:'admin'};
}
function encodeBackupValue(value){
  if(value instanceof Timestamp)return {__mfType:'timestamp',iso:value.toDate().toISOString()};
  if(value instanceof admin.firestore.GeoPoint)return {__mfType:'geopoint',latitude:value.latitude,longitude:value.longitude};
  if(Array.isArray(value))return value.map(encodeBackupValue);
  if(value&&typeof value==='object'){const out={};for(const [key,item] of Object.entries(value))out[key]=encodeBackupValue(item);return out;}
  return value;
}
function decodeBackupValue(value){
  if(Array.isArray(value))return value.map(decodeBackupValue);
  if(value&&typeof value==='object'){
    if(value.__mfType==='timestamp'&&value.iso)return Timestamp.fromDate(new Date(value.iso));
    if(value.__mfType==='geopoint')return new admin.firestore.GeoPoint(Number(value.latitude),Number(value.longitude));
    const out={};for(const [key,item] of Object.entries(value))out[key]=decodeBackupValue(item);return out;
  }
  return value;
}
async function exportCollection(name){
  const snap=await db.collection(name).get(),rows=[];
  for(const doc of snap.docs){
    const row={id:doc.id,data:encodeBackupValue(doc.data())};
    if(name==='student_attempts'){
      const children=await doc.ref.collection('attempts').get();
      row.attempts=children.docs.map(child=>({id:child.id,data:encodeBackupValue(child.data())}));
    }
    if(name==='student_progress'){
      const children=await doc.ref.collection('lectures').get();
      row.lectures=children.docs.map(child=>({id:child.id,data:encodeBackupValue(child.data())}));
      const monthlyEvents=await doc.ref.collection('monthly_events').get();
      row.monthlyEvents=monthlyEvents.docs.map(child=>({id:child.id,data:encodeBackupValue(child.data())}));
    }
    rows.push(row);
  }
  return rows;
}
async function createSafetyBackup(reason,actor){
  const collections={};for(const name of BACKUP_COLLECTIONS)collections[name]=await exportCollection(name);
  const payload={schemaVersion:63,backupFormatVersion:2,project:process.env.GCLOUD_PROJECT||'eng-amr-khaled-academy',reason,createdAt:new Date().toISOString(),actor,collections};
  const buffer=zlib.gzipSync(Buffer.from(JSON.stringify(payload),'utf8'),{level:9});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const name=`automatic-backups/${stamp}-${reason}.json.gz`;
  await admin.storage().bucket().file(name).save(buffer,{resumable:false,contentType:'application/gzip',metadata:{cacheControl:'private, max-age=0',metadata:{schemaVersion:'63',reason}}});
  await db.collection('backup_runs').add({name,reason,size:buffer.length,createdAt:FieldValue.serverTimestamp(),actorUid:actor.uid});
  return {name,size:buffer.length};
}
async function deleteRefs(refs){
  const queue=refs.slice();while(queue.length){const batch=db.batch();queue.splice(0,350).forEach(ref=>batch.delete(ref));await batch.commit();}
}
async function deleteRootCollection(name){
  while(true){
    const snap=await db.collection(name).limit(300).get();if(snap.empty)return;
    const refs=[];
    for(const doc of snap.docs){
      if(name==='student_attempts'){const children=await doc.ref.collection('attempts').get().catch(()=>null);if(children)refs.push(...children.docs.map(x=>x.ref));}
      if(name==='student_progress'){
        const children=await doc.ref.collection('lectures').get().catch(()=>null);if(children)refs.push(...children.docs.map(x=>x.ref));
        const monthlyEvents=await doc.ref.collection('monthly_events').get().catch(()=>null);if(monthlyEvents)refs.push(...monthlyEvents.docs.map(x=>x.ref));
      }
      refs.push(doc.ref);
    }
    await deleteRefs(refs);if(snap.size<300)return;
  }
}
async function restoreCollection(name,rows){
  await deleteRootCollection(name);const ops=[];
  for(const row of Array.isArray(rows)?rows:[]){
    if(!row?.id||!row?.data)continue;const ref=db.collection(name).doc(cleanDocId(row.id));
    ops.push(batch=>batch.set(ref,decodeBackupValue(row.data)));
    if(name==='student_attempts')for(const child of Array.isArray(row.attempts)?row.attempts:[])if(child?.id&&child?.data)ops.push(batch=>batch.set(ref.collection('attempts').doc(cleanDocId(child.id)),decodeBackupValue(child.data)));
    if(name==='student_progress')for(const child of Array.isArray(row.lectures)?row.lectures:[])if(child?.id&&child?.data)ops.push(batch=>batch.set(ref.collection('lectures').doc(cleanDocId(child.id)),decodeBackupValue(child.data)));
    if(name==='student_progress')for(const child of Array.isArray(row.monthlyEvents)?row.monthlyEvents:[])if(child?.id&&child?.data)ops.push(batch=>batch.set(ref.collection('monthly_events').doc(cleanDocId(child.id)),decodeBackupValue(child.data)));
  }
  while(ops.length){const batch=db.batch();ops.splice(0,350).forEach(op=>op(batch));await batch.commit();}
}
function optionLine(line){
  const raw=String(line||'').trim();let m=raw.match(/^([A-Da-dأإابجدهـه]|[1-4])\s*[\)\.\-:：]\s*(.+)$/);if(m)return {label:m[1],text:m[2].trim()};
  m=raw.match(/^-\s*(.+)$/);return m?{label:'',text:m[1].trim()}:null;
}
function isStructuredExam(source){return /(?:^|\n)\s*(?:النوع|type)\s*[:=：-]?/i.test(String(source||''))&&/(?:^|\n)\s*(?:الدرجة|mark|points)\s*[:=：-]?/i.test(String(source||''));}
function upgradeLegacyExamText(source){
  const blocks=String(source||'').replace(/\r\n?/g,'\n').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);if(!blocks.length)return '';
  return blocks.map(block=>{
    if(isStructuredExam(block))return block;
    const lines=block.split('\n'),answerIndex=lines.findIndex(line=>/^(answer|correct|الإجابة|الاجابة|الإجابة الصحيحة|الاجابة الصحيحة)\s*[:=：-]?/i.test(line.trim()));
    const answerLine=answerIndex>=0?lines[answerIndex].trim():'';const body=answerIndex>=0?lines.slice(0,answerIndex):lines.slice();
    let firstOption=-1;for(let i=1;i<body.length;i+=1){if(optionLine(body[i])){firstOption=i;break;}}
    if(firstOption>0&&answerLine){const question=body.slice(0,firstOption).join('\n').trim(),options=body.slice(firstOption).join('\n').trim();return `${question}\nالنوع: mcq\nالدرجة: 1\n${options}\n${answerLine}`;}
    return `${body.join('\n').trim()}\nالنوع: essay\nالدرجة: 1`;
  }).join('\n\n');
}

const restoreAutomaticBackup = onCall({region:'europe-west1',timeoutSeconds:540,memory:'1GiB',invoker:'public'},async request=>{
  const staff=await requireAdmin(request),name=text(request.data?.name,500),confirmation=text(request.data?.confirmation,50);
  if(!name.startsWith('automatic-backups/')||!name.endsWith('.json.gz'))throw new HttpsError('invalid-argument','مسار النسخة غير صالح.');
  if(!['RESTORE-V53','RESTORE-V54','RESTORE-V60.6','RESTORE-V63'].includes(confirmation))throw new HttpsError('failed-precondition','تأكيد الاستعادة غير صحيح.');
  const file=admin.storage().bucket().file(name),[exists]=await file.exists();if(!exists)throw new HttpsError('not-found','النسخة الاحتياطية غير موجودة.');
  const [compressed]=await file.download();let payload;try{payload=JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));}catch(_){throw new HttpsError('data-loss','تعذر قراءة النسخة الاحتياطية.');}
  if(!payload||![53,54,60,63].includes(payload.schemaVersion)||payload.backupFormatVersion!==2||!payload.collections)throw new HttpsError('failed-precondition','هذه النسخة ليست بصيغة استعادة مدعومة.');
  const safety=await createSafetyBackup('pre-restore',staff);
  for(const collectionName of BACKUP_COLLECTIONS)await restoreCollection(collectionName,payload.collections[collectionName]||[]);
  await db.collection('activityLog').add({action:'تمت استعادة نسخة احتياطية سحابية',meta:{restoredFrom:name,safetyBackup:safety.name,schemaVersion:payload.schemaVersion},actorUid:staff.uid,actorEmail:staff.email,actorRole:'admin',createdAt:FieldValue.serverTimestamp()});
  return {ok:true,restoredFrom:name,safetyBackup:safety.name,schemaVersion:payload.schemaVersion};
});

const restoreContentItem = onCall(CALLABLE,async request=>{
  const staff=await requireAdmin(request),collection=text(request.data?.collection,40),id=cleanDocId(text(request.data?.id,120));
  if(!['assignments','exams'].includes(collection)||!id)throw new HttpsError('invalid-argument','بيانات الاستعادة غير مكتملة.');
  const ref=db.collection(collection).doc(id),snap=await ref.get();if(!snap.exists)throw new HttpsError('not-found','العنصر غير موجود.');
  const row=snap.data()||{};if(row.archived!==true&&row.lifecycleStatus!=='archived')return {ok:true,restored:false,id,collection};
  await ref.set({archived:false,active:true,published:true,lifecycleStatus:'open',archiveReason:FieldValue.delete(),archivedBy:FieldValue.delete(),archivedAt:FieldValue.delete(),storageCleanupEligibleAt:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp(),updatedBy:staff.email||staff.uid},{merge:true});
  await db.collection('activityLog').add({action:'استعادة محتوى مؤرشف',meta:{collection,id},actorUid:staff.uid,actorEmail:staff.email,actorRole:'admin',createdAt:FieldValue.serverTimestamp()});
  return {ok:true,restored:true,id,collection};
});

const repairLegacyExamFormats = onCall({region:'europe-west1',timeoutSeconds:540,memory:'512MiB',invoker:'public'},async request=>{
  const staff=await requireAdmin(request),snap=await db.collection('exams').limit(1000).get();let repaired=0,scanned=0;const writes=[];
  for(const doc of snap.docs){
    scanned+=1;const row=doc.data()||{},source=String(row.text||row.questionsText||'');
    if(!source||isStructuredExam(source))continue;
    const upgraded=upgradeLegacyExamText(source);if(!upgraded||upgraded===source)continue;
    writes.push({ref:doc.ref,data:{text:upgraded,questionsText:upgraded,legacyFormatRepairedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()}});
  }
  if(!writes.length)return {ok:true,scanned,repaired:0,safetyBackup:''};
  const safety=await createSafetyBackup('pre-exam-format-repair',staff);
  while(writes.length){
    const chunk=writes.splice(0,350),batch=db.batch();
    chunk.forEach(item=>batch.set(item.ref,item.data,{merge:true}));
    await batch.commit();repaired+=chunk.length;
  }
  await db.collection('activityLog').add({action:'إصلاح صيغة الاختبارات القديمة',meta:{scanned,repaired,safetyBackup:safety.name},actorUid:staff.uid,actorEmail:staff.email,actorRole:'admin',createdAt:FieldValue.serverTimestamp()});
  return {ok:true,scanned,repaired,safetyBackup:safety.name};
});

module.exports={...base,restoreAutomaticBackup,restoreContentItem,repairLegacyExamFormats};
