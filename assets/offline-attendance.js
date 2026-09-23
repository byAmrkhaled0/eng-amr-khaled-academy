(function(){
  'use strict';
  const DB_NAME='technominds-offline-attendance-v1',DB_VERSION=2,ROSTER='roster',QUEUE='queue',META='preparations';
  let openPromise,syncing=false;
  const normalize=value=>String(value||'').trim().toUpperCase();
  function open(){
    if(openPromise)return openPromise;
    openPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(ROSTER))db.createObjectStore(ROSTER,{keyPath:'studentCode'});
        if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:'sessionId'});
        const queue=db.objectStoreNames.contains(QUEUE)?request.transaction.objectStore(QUEUE):db.createObjectStore(QUEUE,{keyPath:'requestId'});
        if(!queue.indexNames.contains('studentSession'))queue.createIndex('studentSession','studentSession',{unique:true});
      };
      request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
      request.onerror=()=>{openPromise=null;reject(request.error);};
    });return openPromise;
  }
  const read=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const completed=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('تعذر حفظ الحضور محليًا'));});
  async function all(store,retry=true){
    try{const db=await open();return await read(db.transaction(store).objectStore(store).getAll());}
    catch(error){
      if(retry&&/AbortError|InvalidStateError/i.test(`${error?.name||''} ${error?.message||''}`)){openPromise=null;return all(store,false);}
      throw error;
    }
  }
  const getRoster=()=>all(ROSTER),getQueue=()=>all(QUEUE),getPreparations=()=>all(META);
  async function cachePreparation(preparation){
    if(!preparation?.preparationId||!preparation.ownerUid||!preparation.sessionId||!Array.isArray(preparation.roster))throw new Error('التجهيز يحتاج إقرارًا من الخادم');
    const db=await open(),tx=db.transaction([ROSTER,META],'readwrite'),done=completed(tx);
    tx.objectStore(META).put({...preparation,studentCodes:preparation.roster.map(row=>normalize(row.studentCode)),roster:undefined});
    for(const row of preparation.roster)if(row.attendanceCode)tx.objectStore(ROSTER).put({...row,ownerUid:preparation.ownerUid,cachedAt:preparation.preparedAt});
    await done;return preparation.roster.length;
  }
  async function cacheRoster(){throw new Error('استخدم تجهيز حصة أوفلاين من الخادم. لا تكفي قائمة الطلاب الجزئية.');}
  async function enqueue(event){
    const db=await open(),prep=await read(db.transaction(META).objectStore(META).get(event.classSessionId));
    if(!prep||prep.preparationId!==event.preparationId||prep.ownerUid!==event.ownerUid||prep.date!==event.date||Date.parse(prep.expiresAt)<Date.now())throw new Error('هذه الحصة لم تُجهز على الجهاز أو انتهى تجهيزها.');
    const roster=await read(db.transaction(ROSTER).objectStore(ROSTER).get(normalize(event.studentCode)));
    if(!prep.studentCodes?.includes(normalize(event.studentCode))||!roster||roster.scheduleId!==prep.scheduleId||normalize(roster.attendanceCode)!==normalize(event.attendanceCode)||roster.ownerUid!==event.ownerUid)throw new Error('رمز الحضور غير موجود في القائمة المجهزة.');
    const tx=db.transaction(QUEUE,'readwrite'),done=completed(tx),store=tx.objectStore(QUEUE),studentSession=`${normalize(event.studentCode)}|${event.classSessionId}`;
    const existing=await read(store.index('studentSession').get(studentSession));
    if(existing){await done;return existing;}
    const row={...event,studentCode:normalize(event.studentCode),attendanceCode:normalize(event.attendanceCode),requestId:event.requestId||(crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')),studentSession,status:'pending',attendanceStatus:event.attendanceStatus==='absent'?'absent':'present',attempts:0,lastError:'',queuedAt:new Date().toISOString()};
    store.add(row);await done;return row;
  }
  async function setRows(rows){const db=await open(),tx=db.transaction(QUEUE,'readwrite'),done=completed(tx);rows.forEach(row=>tx.objectStore(QUEUE).put(row));await done;}
  async function applyResults(results){
    const db=await open(),tx=db.transaction(QUEUE,'readwrite'),done=completed(tx),store=tx.objectStore(QUEUE);
    await Promise.all(results.map(async result=>{const row=await read(store.get(result.requestId));if(!row)return;store.put({...row,status:result.ok?'synced':result.retryable===false?'failed':'pending',serverId:result.id||'',syncedAt:result.ok?new Date().toISOString():'',lastError:result.error||'',nextAttemptAt:Date.now()+Math.min(60000,1000*2**Math.min(6,row.attempts||0))});}));await done;
  }
  async function counts(){const [queue,roster,preparations]=await Promise.all([getQueue(),getRoster(),getPreparations()]);return {pending:queue.filter(r=>r.status==='pending').length,syncing:queue.filter(r=>r.status==='syncing').length,synced:queue.filter(r=>r.status==='synced').length,failed:queue.filter(r=>r.status==='failed').length,total:queue.filter(r=>r.status!=='synced').length,roster:roster.length,prepared:preparations.length};}
  async function sync(syncFunction,ownerUid){
    if(syncing||navigator.onLine===false||typeof syncFunction!=='function'||!ownerUid)return {skipped:true,...await counts()};syncing=true;let synced=0;
    try{
      // Bounded batches, no background promise is claimed to survive app closure.
      for(let batch=0;batch<10;batch++){
        const rows=(await getQueue()).filter(row=>row.ownerUid===ownerUid&&((row.status==='pending'&&Number(row.nextAttemptAt||0)<=Date.now())||(row.status==='syncing'&&Number(row.lastAttemptAt||0)<Date.now()-30000))).slice(0,60);
        if(!rows.length)break;
        const working=rows.map(row=>({...row,status:'syncing',attempts:Number(row.attempts||0)+1,lastAttemptAt:Date.now()}));await setRows(working);
        try{
          const response=await syncFunction(working),results=response?.results;
          if(!Array.isArray(results))throw new Error('لم يصل إقرار مزامنة من الخادم');
          await applyResults(rows.map(row=>results.find(result=>result.requestId===row.requestId)||{requestId:row.requestId,ok:false,retryable:true,error:'لم يصل إقرار لهذا السجل'}));
          synced+=results.filter(result=>result.ok).length;
        }catch(error){await applyResults(rows.map(row=>({requestId:row.requestId,ok:false,retryable:true,error:String(error.message||error)})));throw error;}
      }
      return {ok:true,synced,...await counts()};
    }finally{syncing=false;}
  }
  async function finalizeSession(sessionId,ownerUid){
    const preparations=await getPreparations(),prep=preparations.find(row=>row.sessionId===sessionId&&row.ownerUid===ownerUid);
    if(!prep)throw new Error('جهّز الحصة أوفلاين أولًا قبل تسجيل الغياب.');
    if(Date.parse(prep.expiresAt)<Date.now())throw new Error('انتهت صلاحية تجهيز الحصة؛ اتصل بالإنترنت وجهّزها مرة أخرى.');
    const [roster,queue]=await Promise.all([getRoster(),getQueue()]),recorded=new Set(queue.filter(row=>row.classSessionId===sessionId).map(row=>normalize(row.studentCode)));
    const missing=roster.filter(row=>row.ownerUid===ownerUid&&row.scheduleId===prep.scheduleId&&prep.studentCodes?.includes(normalize(row.studentCode))&&!recorded.has(normalize(row.studentCode)));
    for(const student of missing)await enqueue({studentCode:student.studentCode,attendanceCode:student.attendanceCode,preparationId:prep.preparationId,ownerUid,classSessionId:prep.sessionId,date:prep.date,attendanceStatus:'absent',scannedAt:`${prep.date}T12:00:00Z`,finalizedOffline:true});
    const db=await open(),tx=db.transaction(META,'readwrite'),done=completed(tx);tx.objectStore(META).put({...prep,finalizedAt:new Date().toISOString(),absentQueued:missing.length});await done;
    return {ok:true,absentQueued:missing.length,alreadyRecorded:prep.studentCodes.length-missing.length,total:prep.studentCodes.length};
  }
  async function clearRoster(){const db=await open(),tx=db.transaction([ROSTER,META],'readwrite'),done=completed(tx);tx.objectStore(ROSTER).clear();tx.objectStore(META).clear();await done;}
  window.OfflineAttendance={cacheRoster,cachePreparation,getPreparations,getRoster,getQueue,enqueue,counts,sync,applyResults,finalizeSession,clearRoster};
})();
