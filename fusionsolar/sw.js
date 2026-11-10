/* Original offline-capable PWA service worker. No telemetry or hardware traffic cached. */
'use strict';
const CACHE = 'energy-studio-study4-static-v1';
const FILES = [
  'index.html','styles.css','live-styles.css','nova-design.css?v=2',
  'study-skin.css?v=3','motion.css?v=4',
  'logic.js','bms-client.js','icon-inline.js','app.js','pwa.js',
  'manifest.json','icon.svg','icon-192.png','icon-512.png','icon-180.png'
];
const ALLOWED = new Set(FILES.map(name => name.split('?')[0]).concat(['','sw.js']));
function baseUrl(name='') { return new URL(name, self.registration.scope).href; }
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(baseUrl));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(x=>x.startsWith('energy-studio-')&&x!==CACHE).map(x=>caches.delete(x)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope)) return;
  const relative = decodeURIComponent(url.pathname.slice(scope.length));
  // Never intercept or cache BMS API calls, reader tokens or non-static paths.
  if (!ALLOWED.has(relative)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && response.type==='basic' && relative!=='sw.js')
        await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return await cache.match(request, {ignoreSearch:true})
        || (request.mode==='navigate' ? await cache.match(baseUrl('index.html')) : undefined)
        || Response.error();
    }
  })());
});
