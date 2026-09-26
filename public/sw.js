// The production build supplies the version and all hashed build assets.
const CACHE = 'vk-shell-__VK_BUILD__';
const ASSETS = /* __VK_ASSETS__ */ [];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  // Wait until current tabs close to avoid replacing the app during an edit.
});
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('vk-shell-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then((cache) => cache.match('/index.html')).then((cached) => cached || fetch(event.request)));
    return;
  }

  if (ASSETS.includes(url.pathname)) event.respondWith(caches.open(CACHE).then((cache) => cache.match(event.request)).then((cached) => cached || fetch(event.request)));
  // API data and unknown paths are never cached as application assets.
});
