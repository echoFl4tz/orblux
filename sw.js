/* =========================================================
   Service Worker — funciona offline após o 1º carregamento
   Estratégia: cache primeiro, atualiza em segundo plano.
   Atualize CACHE_VERSION a cada deploy.
   ========================================================= */

const CACHE_VERSION = 'pulso-neon-v1';

const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './favicon.svg',
  './privacy.html',
  './js/main.js',
  './js/core/loop.js',
  './js/core/storage.js',
  './js/core/state.js',
  './js/core/input.js',
  './js/core/audio.js',
  './js/core/events.js',
  './js/game/game.js',
  './js/game/entities.js',
  './js/game/spawner.js',
  './js/game/particles.js',
  './js/game/tutorial.js',
  './js/ui/screens.js',
  './js/ui/hud.js',
  './js/ui/toasts.js',
  './js/ui/achievements.js',
  './js/ui/missions.js',
  './js/ui/ranking.js',
  './js/ui/share.js',
  './js/monetization/ads.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // navegação: cache primeiro, rede como fallback, cache atualizado em paralelo
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              caches.open(CACHE_VERSION).then((c) => c.put('./index.html', res.clone()));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // estáticos: cache primeiro (stale-while-revalidate)
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && new URL(req.url).origin === location.origin) {
            caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
