'use strict';

const VERSION = 'technominds-v58';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const APP_SHELL = [
  './', './index.html', './offline.html', './assets/site.css?v=58',
  './assets/future-theme.css?v=58', './assets/app.js?v=58',
  './assets/technominds-logo.png?v=58', './site.webmanifest?v=58'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => ![STATIC_CACHE, PAGE_CACHE].includes(key)).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

function isApplicationApi(url) {
  return url.hostname.includes('cloudfunctions.net') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.pathname.includes('/__/auth/');
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isApplicationApi(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(PAGE_CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || caches.match('./offline.html')));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});
