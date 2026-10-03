// The production build supplies the version and all hashed build assets.
const CACHE = 'vk-shell-__VK_BUILD__';
const ASSETS = /* __VK_ASSETS__ */ [];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('vk-shell-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
          await caches.open(CACHE).then((cache) => cache.put('/index.html', response.clone())).catch(() => {});
        }
        return response;
      } catch {
        const cached = await (await caches.open(CACHE)).match('/index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  if (ASSETS.includes(url.pathname)) event.respondWith(caches.open(CACHE).then((cache) => cache.match(event.request)).then((cached) => cached || fetch(event.request)));
  // API data and unknown paths are never cached as application assets.
});
