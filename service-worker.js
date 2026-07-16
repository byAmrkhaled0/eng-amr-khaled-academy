const CACHE_NAME = "technominds-v60-6-2-production";
const APP_SHELL = [
  "/", "/index.html", "/student.html", "/exams.html", "/materials.html", "/questions.html",
  "/learning-path.html", "/about.html", "/practical.html", "/parent.html", "/reviews.html", "/privacy.html",
  "/terms.html", "/offline.html", "/assets/site.css", "/assets/v55.css",
  "/assets/v56.css", "/assets/v60-technominds.css", "/assets/app.js", "/assets/practical.js", "/assets/firebase-sync.js",
  "/assets/firebase-config.js", "/assets/v53-upgrades.js",
  "/assets/v56-fixes.js",
  "/assets/technominds-logo.png", "/assets/technominds-logo.webp",
  "/assets/amr-khaled-profile.webp", "/site.webmanifest"
];

// Background FCM uses the browser's standard Push API with no external worker
// imports, so a third-party CDN/CORS failure cannot break the PWA worker.
self.addEventListener('push', event => {
  let payload={};
  try{payload=event.data?event.data.json():{};}catch(_){payload={data:{body:event.data?.text?.()||''}};}
  const data=payload.data||{},notification=payload.notification||payload.webpush?.notification||{};
  const title=notification.title||data.title||'Techno Minds';
  const options={
    body:notification.body||data.body||'يوجد تحديث جديد في لوحة الإدارة.',
    icon:notification.icon||'/assets/technominds-logo.png',
    badge:notification.badge||'/assets/technominds-logo.png',
    tag:notification.tag||`technominds-${data.type||'update'}-${data.bookingCode||''}`,
    renotify:false,
    data:{url:notification.data?.url||data.url||'/teacher-login.html?section=bookings'}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/teacher-login.html?section=bookings',self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
    const existing=windows.find(client=>client.url.startsWith(self.location.origin));
    if(existing){existing.navigate(target);return existing.focus();}
    return clients.openWindow(target);
  }));
});

self.addEventListener("install", event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map(url=>cache.add(new Request(url,{cache:"reload"}))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if(event.data && event.data.type==="SKIP_WAITING") self.skipWaiting();
  if(event.data && event.data.type==="CLEAR_OLD_CACHES") event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))));
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
        if(response.ok){const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone());}
        return response;
      }catch(_){
        // Query strings such as ?code=12345678 must fall back to the cached
        // HTML page, not to offline.html.
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

  if(url.pathname.startsWith("/assets/") || url.pathname.endsWith(".webmanifest")){
    // Versioned static assets are returned from cache immediately on repeat
    // visits while a background request refreshes them. Large QR and Excel
    // bundles enter this cache only after the user actually opens that tool.
    const network=fetch(request).then(async response=>{
      if(response.ok){const cache=await caches.open(CACHE_NAME);await cache.put(request,response.clone());}
      return response;
    });
    event.respondWith(caches.match(request,{ignoreSearch:true}).then(cached=>{
      if(cached){event.waitUntil(network.catch(()=>null));return cached;}
      return network.catch(()=>caches.match(request,{ignoreSearch:true}));
    }));
  }
});
