(function(){
  'use strict';
  const DB_NAME='technominds-offline-attendance-v1',DB_VERSION=1,ROSTER='roster',QUEUE='queue';
  let openPromise=null,syncing=false;
  const open=()=>{
    if(openPromise)return openPromise;
    openPromise=new Promise((resolve,reject)=>{
      if(!globalThis.indexedDB)return reject(new Error('IndexedDB unavailable'));
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(ROSTER))db.createObjectStore(ROSTER,{keyPath:'studentCode'});if(!db.objectStoreNames.contains(QUEUE)){const store=db.createObjectStore(QUEUE,{keyPath:'requestId'});store.createIndex('studentDate',['studentCode','date'],{unique:false});store.createIndex('status','status',{unique:false});}};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Offline attendance database failed'));
    });return openPromise;
  };
  const transaction=async(storeNames,mode,work)=>{const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(storeNames,mode),stores=Object.fromEntries(storeNames.map(name=>[name,tx.objectStore(name)]));let value;try{value=work(stores,tx);}catch(error){tx.abort();reject(error);return;}tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||new Error('Offline attendance transaction failed'));tx.onabort=()=>reject(tx.error||new Error('Offline attendance transaction aborted'));});};
  const requestValue=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const normalize=value=>String(value||'').trim().toUpperCase();
  const requestId=()=>globalThis.crypto?.randomUUID?.()||`att-${Date.now()}-${Math.random().toString(36).slice(2,12)}`;

  async function cacheRoster(students=[]){
    const rows=(students||[]).filter(student=>student&&student.active!==false).map(student=>({studentCode:normalize(student.studentCode||student.code||student.id),attendanceCode:normalize(student.attendanceCode||student.studentCode||student.code||student.id),name:String(student.studentName||student.name||'').slice(0,100),studentName:String(student.studentName||student.name||'').slice(0,100),grade:String(student.grade||'').slice(0,80),group:String(student.group||'').slice(0,100),scheduleId:String(student.scheduleId||student.groupId||'').slice(0,100),active:true,cachedAt:new Date().toISOString()})).filter(row=>row.studentCode&&row.attendanceCode);
    await transaction([ROSTER],'readwrite',stores=>{stores[ROSTER].clear();rows.forEach(row=>stores[ROSTER].put(row));});return rows.length;
  }
  async function getRoster(){const db=await open();return requestValue(db.transaction(ROSTER,'readonly').objectStore(ROSTER).getAll());}
  async function getQueue(){const db=await open();return requestValue(db.transaction(QUEUE,'readonly').objectStore(QUEUE).getAll());}
  async function enqueue(event={}){
    const studentCode=normalize(event.studentCode),date=String(event.date||'').slice(0,10),all=await getQueue(),duplicate=all.find(row=>row.studentCode===studentCode&&row.date===date&&row.status!=='failed');
    if(duplicate)return duplicate;
    const row={requestId:String(event.requestId||requestId()),studentCode,attendanceCode:normalize(event.attendanceCode),studentName:String(event.studentName||'').slice(0,100),grade:String(event.grade||'').slice(0,80),group:String(event.group||'').slice(0,100),scheduleId:String(event.scheduleId||'').slice(0,100),date,status:'pending',attendanceStatus:event.attendanceStatus==='absent'?'absent':'present',scannedAt:String(event.scannedAt||new Date().toISOString()),attempts:0,lastError:'',queuedAt:new Date().toISOString()};
    await transaction([QUEUE],'readwrite',stores=>stores[QUEUE].put(row));
    try{const registration=await navigator.serviceWorker?.ready;await registration?.sync?.register?.('technominds-attendance-sync');}catch(_){}
    return row;
  }
  async function applyResults(results=[]){
    const db=await open(),tx=db.transaction(QUEUE,'readwrite'),store=tx.objectStore(QUEUE);
    await Promise.all((results||[]).map(async result=>{const row=await requestValue(store.get(String(result.requestId||'')));if(!row)return;if(result.ok)store.delete(row.requestId);else store.put({...row,status:result.retryable===false?'failed':'pending',attempts:Number(row.attempts||0)+1,lastError:String(result.error||'تعذر المزامنة').slice(0,300),lastAttemptAt:new Date().toISOString()});}));
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  }
  async function counts(){const rows=await getQueue();return {pending:rows.filter(row=>row.status==='pending').length,failed:rows.filter(row=>row.status==='failed').length,total:rows.length};}
  async function sync(syncFunction){
    if(syncing||navigator.onLine===false||typeof syncFunction!=='function')return {skipped:true,...await counts()};syncing=true;
    try{const rows=(await getQueue()).filter(row=>row.status==='pending').slice(0,60);if(!rows.length)return {ok:true,...await counts()};const response=await syncFunction(rows);await applyResults(response?.results||[]);return {ok:true,synced:(response?.results||[]).filter(row=>row.ok).length,...await counts()};}finally{syncing=false;}
  }
  window.OfflineAttendance={cacheRoster,getRoster,getQueue,enqueue,counts,sync,applyResults};
})();
