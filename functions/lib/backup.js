'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');

// One schema for scheduled, manual, safety, and restore operations.
const BACKUP_COLLECTIONS = Object.freeze([
  'settings','users','students','student_portal','parent_portal','bookings','booking_status','reviews',
  'materials','questions','groups','assignments','exams','exam_attempts','exam_sessions','exam_absences','homework_submissions',
  'attendance','recitations','grades','payments','monthly_payments','payment_transactions','monthly_reports','reports','activityLog','client_errors',
  'student_attempts','exam_locks','homework_submission_locks','homework_attempt_grants','homework_review_history','exam_review_history',
  'assessment_versions','class_sessions','student_notes','leaderboard_archives','motivation_monthly','motivation_transactions','student_transfer_requests',
  'curriculum','units','lectures','lecture_materials','assignments_v2','assignment_questions','question_banks','bank_questions',
  'monthly_exams','exam_questions_v2','teacher_files','student_progress','theory_lecture_progress','_student_names','deleted_students'
]);
const FINANCIAL_ROOTS=['payments','monthly_payments','payment_transactions'];
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const LEGACY_CHILDREN = {student_attempts:{attempts:'attempts'}, student_progress:{lectures:'lectures',monthlyEvents:'monthly_events'}};
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validId = id => typeof id === 'string' && id.length > 0 && Buffer.byteLength(id) <= 1500 && !id.includes('/') && !['.','..'].includes(id);

function validateRows(rows, path, documents) {
  if (!Array.isArray(rows)) throw new Error(`Invalid collection: ${path}`);
  const seen = new Set();
  for (const row of rows) {
    if (!row || !validId(row.id) || seen.has(row.id) || !row.data || typeof row.data !== 'object' || Array.isArray(row.data)) throw new Error(`Invalid/duplicate document: ${path}`);
    seen.add(row.id);
    if (row.exists !== false) documents.push({path:`${path}/${row.id}`,data:row.data});
    for (const [child, children] of Object.entries(row.subcollections || {})) {
      if (!validId(child)) throw new Error('Invalid subcollection');
      validateRows(children, `${path}/${row.id}/${child}`, documents);
    }
    for (const [key, child] of Object.entries(LEGACY_CHILDREN[path] || {})) {
      if (Object.hasOwn(row,key)) validateRows(row[key], `${path}/${row.id}/${child}`, documents);
    }
  }
}

function planRestore(payload, project) {
  if (!payload || ![2,3].includes(payload.backupFormatVersion) || ![53,54,60,63].includes(payload.schemaVersion) || !payload.collections || Array.isArray(payload.collections)) throw new Error('Unsupported backup format');
  if (payload.project !== project) throw new Error('Backup belongs to a different Firebase project');
  const included = Object.keys(payload.collections), documents = [];
  if (included.some(name => !BACKUP_COLLECTIONS.includes(name))) throw new Error('Unknown root collection');
  if (payload.backupFormatVersion === 3) {
    const manifest = payload.manifest;
    if (!manifest?.complete || digest(payload.collections) !== manifest.sha256 || included.length !== BACKUP_COLLECTIONS.length || BACKUP_COLLECTIONS.some(name => !included.includes(name))) throw new Error('Incomplete or corrupt backup');
  }
  for (const name of included) validateRows(payload.collections[name], name, documents);
  if (new Set(documents.map(row=>row.path)).size !== documents.length) throw new Error('Duplicate document path');
  const plan = {
    mode:'merge', format:payload.backupFormatVersion, included, preserved:BACKUP_COLLECTIONS.filter(name=>!included.includes(name)),
    writes:documents.length, deletes:0, storageBytesIncluded:false,
    warnings:[...(payload.backupFormatVersion === 2 ? ['Legacy completeness cannot be proved; omitted documents and subcollections are preserved.'] : []),
      'Merge restores backed-up fields; documents absent from the backup are retained.',
      'Storage file bytes are not in this JSON backup. Restore object generations separately.',
      'Multi-batch restoration is not atomic. Pause writes, retain the safety backup and review failed runs.',
      'Existing financial records must exactly match the backup. Conflicting financial rollback requires an isolated recovery environment.']
  };
  return {plan:{...plan,planId:digest({plan,collections:payload.collections})},documents};
}

function createBackupService({db,admin,project}) {
  const Timestamp = admin.firestore.Timestamp;
  const encode = value => {
    if (value instanceof Timestamp) return {__mfType:'timestamp',seconds:value.seconds,nanoseconds:value.nanoseconds};
    if (value instanceof admin.firestore.GeoPoint) return {__mfType:'geopoint',latitude:value.latitude,longitude:value.longitude};
    if (Buffer.isBuffer(value)) return {__mfType:'bytes',base64:value.toString('base64')};
    if (admin.firestore.DocumentReference && value instanceof admin.firestore.DocumentReference) return {__mfType:'reference',path:value.path};
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]));
    return value;
  };
  const decode = value => {
    if (Array.isArray(value)) return value.map(decode);
    if (value && typeof value === 'object') {
      if (value.__mfType==='timestamp') return value.iso ? Timestamp.fromDate(new Date(value.iso)) : new Timestamp(value.seconds,value.nanoseconds);
      if (value.__mfType==='geopoint') return new admin.firestore.GeoPoint(value.latitude,value.longitude);
      if (value.__mfType==='bytes') return Buffer.from(value.base64,'base64');
      if (value.__mfType==='reference') return db.doc(value.path);
      return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,decode(item)]));
    }
    return value;
  };
  async function exportCollection(ref) {
    // listDocuments includes missing parents with live subcollections.
    const refs = await ref.listDocuments(), rows = [];
    for (let i=0;i<refs.length;i+=100) {
      const snapshots = await db.getAll(...refs.slice(i,i+100));
      for (const snap of snapshots) {
        const subcollections = {};
        for (const child of await snap.ref.listCollections()) subcollections[child.id] = await exportCollection(child);
        rows.push({id:snap.id,exists:snap.exists,data:encode(snap.data()||{}),subcollections});
      }
    }
    return rows;
  }
  async function createPlatformBackup(reason, actor={}) {
    const collections = {};
    for (const name of BACKUP_COLLECTIONS) collections[name] = await exportCollection(db.collection(name));
    const payload = {schemaVersion:63,backupFormatVersion:3,project,reason,createdAt:new Date().toISOString(),actor,
      collections,manifest:{complete:true,sha256:digest(collections),storageBytesIncluded:false}};
    const buffer = zlib.gzipSync(Buffer.from(JSON.stringify(payload)));
    const name = `automatic-backups/${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID()}-${String(reason).replace(/[^a-zA-Z0-9_-]/g,'-')}.json.gz`;
    await admin.storage().bucket().file(name).save(buffer,{resumable:false,contentType:'application/gzip',metadata:{cacheControl:'private, no-store'}});
    await db.collection('backup_runs').add({name,reason,size:buffer.length,createdAt:admin.firestore.FieldValue.serverTimestamp(),actorUid:actor.uid||''});
    return {name,size:buffer.length,createdAt:payload.createdAt};
  }
  async function readBackup(name) {
    if (!/^automatic-backups\/[^/]+\.json\.gz$/.test(name)) throw new Error('Invalid backup path');
    const [compressed] = await admin.storage().bucket().file(name).download();
    const payload = JSON.parse(zlib.gunzipSync(compressed,{maxOutputLength:100*1024*1024}));
    const result = planRestore(payload,project);
    // Decode every value before the safety backup or the first write.
    result.documents = result.documents.map(row=>({...row,data:decode(row.data)}));
    const stamps=[];
    for(let i=0;i<result.documents.length;i+=100){
      const chunk=result.documents.slice(i,i+100),current=await db.getAll(...chunk.map(row=>db.doc(row.path)));
      current.forEach((snap,j)=>{chunk[j].expectedUpdateTime=snap.updateTime||null;stamps.push([snap.ref.path,snap.updateTime?`${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}`:null]);});
    }
    const financialConflicts=[];
    if(result.plan.included.some(root=>FINANCIAL_ROOTS.includes(root))){
      const backed=new Map(result.documents.map(row=>[row.path,row]));
      for(const root of FINANCIAL_ROOTS){
        const current=await db.collection(root).get();
        for(const snap of current.docs){const row=backed.get(snap.ref.path);
          if(!row||digest(canonical(encode(row.data)))!==digest(canonical(encode(snap.data()))))financialConflicts.push(snap.ref.path);
        }
      }
    }
    result.plan={...result.plan,financialConflicts:financialConflicts.slice(0,20),financialConflictCount:financialConflicts.length,planId:digest({backupPlanId:result.plan.planId,stamps,financialConflicts})};
    return result;
  }
  async function applyRestore(result, actor) {
    if(result.plan.financialConflictCount)throw new Error('رفض الاستعادة: بيانات مالية أحدث أو مختلفة. استعد النسخة في بيئة معزولة وراجع الخزنة قبل النقل.');
    const safety = await createPlatformBackup('pre-restore',actor);
    const run = db.collection('_restore_runs').doc();
    await run.set({plan:result.plan,safetyBackup:safety.name,status:'running',completedWrites:0,createdAt:admin.firestore.FieldValue.serverTimestamp()});
    let completedWrites = 0;
    try {
      for (let i=0;i<result.documents.length;i+=300) {
        const chunk=result.documents.slice(i,i+300);
        await db.runTransaction(async tx=>{
          const current=await tx.getAll(...chunk.map(row=>db.doc(row.path)));
          current.forEach((snap,j)=>{
            const expected=chunk[j].expectedUpdateTime;
            if(expected?!snap.updateTime?.isEqual(expected):snap.exists)throw new Error('تغيرت بيانات منذ معاينة الاستعادة؛ أوقف الكتابة وأعد المعاينة.');
          });
          chunk.forEach(row=>tx.set(db.doc(row.path),row.data));
        }); completedWrites+=chunk.length;
        await run.update({completedWrites});
      }
      await run.update({status:'complete'});
      return {ok:true,safetyBackup:safety.name,runId:run.id,completedWrites,mode:'merge'};
    } catch (error) {
      await run.update({status:'failed',completedWrites,error:String(error.message).slice(0,300)});
      throw error;
    }
  }
  return {createPlatformBackup,readBackup,applyRestore};
}
module.exports = {BACKUP_COLLECTIONS,planRestore,createBackupService,digest};
