// Service worker de Routecast: shell offline (DESIGN/SPEC F15). Sin dependencias.
// - Navegación: red primero; sin red, el index.html guardado.
// - /assets/* (con hash en el nombre): caché primero, inmutables.
// - Todo lo demás (APIs de terceros, teselas) pasa sin tocar: la previsión se cachea en IndexedDB desde la app.
const VERSION = 'routecast-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    const scope = new URL('./', self.location).pathname;
    const isShell = url.pathname === scope || url.pathname === `${scope}index.html`;
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Solo la portada de la app se guarda como shell: ni la galería ni un 404 ni una redirección.
          if (isShell && res.ok && res.type === 'basic') {
            const copy = res.clone();
            event.waitUntil(caches.open(VERSION).then((c) => c.put('./index.html', copy)));
          }
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(caches.open(VERSION).then((c) => c.put(req, copy)));
            }
            return res;
          }),
      ),
    );
  }
});
