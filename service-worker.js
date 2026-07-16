const CACHE_NAME = "technominds-v60-5-0-production";
const APP_SHELL = [
  "/", "/index.html", "/student.html", "/exams.html", "/materials.html", "/questions.html",
  "/learning-path.html", "/about.html", "/practical.html", "/parent.html", "/reviews.html", "/privacy.html",
  "/terms.html", "/offline.html", "/assets/site.css", "/assets/v55.css",
  "/assets/v56.css", "/assets/v60-technominds.css", "/assets/app.js", "/assets/practical.js", "/assets/firebase-sync.js",
  "/assets/firebase-config.js", "/assets/v53-upgrades.js",
  "/assets/v56-fixes.js",
  "/assets/technominds-logo.png", "/assets/technominds-logo.webp",
  "/assets/amr-khaled-profile.jpeg", "/site.webmanifest"
];

// Booking updates are delivered through the authenticated Firestore listener
// while the admin workspace is open. Keeping the PWA worker dependency-free
// avoids a blocked third-party import from breaking offline startup on phones.

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/teacher-login.html?section=bookings'));
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
