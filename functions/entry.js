'use strict';

const zlib = require('zlib');
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const base = require('./index');

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;
const CALLABLE = { region:'europe-west1', timeoutSeconds:30, invoker:'public' };
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
const { createBackupService } = require('./lib/backup');
const { createPlatformBackup:createSafetyBackup } = createBackupService({db,admin,project:process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'eng-amr-khaled-academy'});

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

module.exports={...base,restoreContentItem,repairLegacyExamFormats};
