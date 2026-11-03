const CACHE_NAME = "technominds-v70-0-11-complete-report-attendance-v12-unified-push-v13-mobile-qr-v14-release-review-v15-service-parity-v16-parent-report-v17-bulk-questions-v18-fill-v19-individual-v20-product-v21";
const ASSET_VERSION = "70.0.11";
// Build fills these hashes; source previews continue to use the release URLs.
const ASSET_REVISIONS = {};
const APP_SHELL = [
  "/", "/index.html", "/student.html", "/parent.html", "/exams.html", "/materials.html", "/theory-lectures.html", "/questions.html", "/practical.html", "/learning-path.html", "/about.html", "/reviews.html", "/privacy.html",
  "/terms.html", "/offline.html", "/assets/site.css", "/assets/v55.css",
  "/assets/v56.css", "/assets/v60-technominds.css", "/assets/v61-design.css", "/assets/v65-redesign.css", "/assets/v67-learning-hub.css", "/assets/v674-admin.css", "/assets/theme-init.js", "/assets/app.js", "/assets/portal-results.js", "/assets/student-grade-records.js", "/assets/practical.js", "/assets/firebase-sync.js",
  "/assets/firebase-config.js", "/assets/v53-upgrades.js", "/assets/v65-enhancements.js", "/assets/offline-attendance.js", "/assets/curriculum-student.js",
  "/assets/technominds-logo.png", "/assets/technominds-logo.webp",
  "/assets/amr-khaled-profile.webp", "/site-manifest.json", "/teacher-manifest.json"
];
const VERSIONED_APP_SHELL=APP_SHELL.map(url=>/\.(?:css|js)$/.test(url)?`${url}?v=${ASSET_VERSION}${ASSET_REVISIONS[url]?`&rev=${ASSET_REVISIONS[url]}`:''}`:url);
const SENSITIVE_NAVIGATION=new Set(['/student.html','/parent.html','/exams.html','/materials.html','/theory-lectures.html','/questions.html','/practical.html','/teacher-login.html']);

// Background FCM uses the browser's standard Push API with no external worker
// imports, so a third-party CDN/CORS failure cannot break the PWA worker.
const STUDENT_PUSH_STATE='tm-student-push-state';
async function studentPushBinding(){try{const cache=await caches.open(STUDENT_PUSH_STATE),value=await cache.match('/__student_push_binding');return value?(await value.json()).studentCode:null;}catch(_){return null;}}
self.addEventListener('message',event=>{
 if(event.data?.type!=='TM_STUDENT_PUSH_ACCOUNT')return;
 const code=event.data.studentCode;if(code!==null&&!/^[A-Z0-9_-]{6,40}$/.test(String(code||'')))return;
 if(event.source?.url&&new URL(event.source.url).origin!==self.location.origin)return;
 event.waitUntil((async()=>{const cache=await caches.open(STUDENT_PUSH_STATE);await cache.put('/__student_push_binding',new Response(JSON.stringify({studentCode:code}),{headers:{'Content-Type':'application/json'}}));if(code===null){const rows=await self.registration.getNotifications();rows.filter(n=>n.data?.audience==='student').forEach(n=>n.close());}})());
});
self.addEventListener('push', event => {
 let payload={};try{payload=event.data?event.data.json():{};}catch(_){payload={data:{body:event.data?.text?.()||''}};}
 const data=payload.data||{},notification=payload.notification||payload.webpush?.notification||{};
 event.waitUntil((async()=>{
  const student=data.audience==='student';if(student&&(await studentPushBinding()!==data.studentCode||Number(data.expiresAt||0)>0&&Number(data.expiresAt)<=Date.now()))return;
  if(student){const windows=await clients.matchAll({type:'window',includeUncontrolled:true});windows.forEach(client=>client.postMessage({type:'TM_STUDENT_CONTENT_NEW',studentCode:data.studentCode,notificationId:data.notificationId}));if(windows.some(client=>new URL(client.url).pathname==='/student.html'&&client.visibilityState==='visible'))return;}
  const title=notification.title||data.title||'Techno Minds';
  const options={body:notification.body||data.body||(student?'يوجد جديد في حسابك الدراسي.':'يوجد تحديث جديد في لوحة الإدارة.'),icon:notification.icon||'/assets/technominds-logo.png',badge:notification.badge||'/assets/technominds-logo.png',tag:student?'technominds-student-'+data.notificationId:notification.tag||`technominds-${data.type||'update'}-${data.bookingCode||''}`,renotify:false,data:{url:student?'/student.html#'+(['overview','lectures','homework','exams','grades','attendance','motivation','recitation','payments','transfer','notifications'].includes(data.actionTab)?data.actionTab:'notifications'):notification.data?.url||data.url||'/teacher-login.html?section=bookings',audience:student?'student':'staff',studentCode:student?data.studentCode:null,notificationId:data.notificationId}};
  await self.registration.showNotification(title,options);
 })());
});
self.addEventListener('notificationclick', event => {
 event.notification.close();const data=event.notification.data||{};let target=new URL(data.url||'/teacher-login.html?section=bookings',self.location.origin);if(target.origin!==self.location.origin)target=new URL('/',self.location.origin);
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
  const existing=windows.find(client=>new URL(client.url).origin===self.location.origin&&new URL(client.url).pathname===target.pathname);
  if(existing){if(data.audience==='student')existing.postMessage({type:'TM_STUDENT_NOTIFICATION_OPEN',studentCode:data.studentCode,notificationId:data.notificationId,actionTab:target.hash.slice(1)});else existing.navigate(target.href);return existing.focus();}
  return clients.openWindow(target.href);
 }));
});

self.addEventListener("install", event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.allSettled(VERSIONED_APP_SHELL.map(url=>cache.add(new Request(url,{cache:"reload"}))));
    // A waiting release activates when existing tabs close, or after explicit update.
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('technominds-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if(event.data && event.data.type==="SKIP_WAITING") self.skipWaiting();
  if(event.data && event.data.type==="CLEAR_OLD_CACHES") event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('technominds-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))));
});

self.addEventListener('sync',event=>{
  if(event.tag!=='technominds-attendance-sync')return;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{windows.forEach(client=>client.postMessage({type:'SYNC_OFFLINE_ATTENDANCE'}));}));
});

self.addEventListener("fetch", event => {
  const request=event.request;
  if(request.method!=="GET") return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;

  if(request.mode==="navigate"){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        // Never cache a URL carrying a student/parent access code.
        if(response.ok && !url.search && url.pathname==='/teacher-login.html'){
          // The teacher shell contains no credentials, so keep the last opened
          // copy for offline attendance without putting the heavy admin bundle
          // in the first-install cache.
          const cache=await caches.open(CACHE_NAME);cache.put('/teacher-login.html',response.clone());
        }else if(response.ok && !url.search && !SENSITIVE_NAVIGATION.has(url.pathname)){
          const cache=await caches.open(CACHE_NAME);cache.put(url.pathname,response.clone());
        }
        return response;
      }catch(_){
        // Query strings such as ?code=12345678 must fall back to the cached
        // HTML page, not to offline.html.
        if(SENSITIVE_NAVIGATION.has(url.pathname)) return (await caches.match(url.pathname,{ignoreSearch:true})) || (await caches.match('/offline.html'));
        return (await caches.match(url.pathname,{ignoreSearch:true})) ||
          (await caches.match(request,{ignoreSearch:true})) ||
          (await caches.match("/offline.html"));
      }
    })());
    return;
  }

  if(url.pathname==="/assets/firebase-config.js"){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:"no-store"});
        if(response.ok){const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone());}
        return response;
      }catch(_){return caches.match(request,{ignoreSearch:true});}
    })());
    return;
  }

  if(url.pathname.endsWith("-manifest.json")){
    // A stale manifest can keep old asset URLs alive after deployment.
    event.respondWith(fetch(request,{cache:"no-store"}).catch(()=>caches.match(request)));
    return;
  }

  if(url.pathname.startsWith("/assets/")){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME),cached=await cache.match(request);
      if(cached&&url.searchParams.get('v')===ASSET_VERSION)return cached;
      try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}
      catch(error){if(cached)return cached;throw error;}
    })());
  }
});
