/* =========================================================
   Service Worker — funciona offline após o 1º carregamento
   Estratégia:
   • navegação (index.html): REDE primeiro, cache só como
     fallback offline — assim atualizações chegam sempre;
   • estáticos: cache primeiro com revalidação CONFIÁVEL
     em segundo plano (waitUntil).
   Atualize CACHE_VERSION quando a lista PRECACHE mudar.
   ========================================================= */

const CACHE_VERSION = 'orblux-v20';

const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './css/fonts.css',
  './assets/fonts/orblux-display.woff2',
  './assets/fonts/orblux-sans.woff2',
  './manifest.webmanifest',
  './favicon.svg',
  './logo.svg',
  './privacy.html',
  './termos.html',
  './js/main.js',
  './js/core/loop.js',
  './js/core/storage.js',
  './js/core/state.js',
  './js/core/maestria.js',
  './js/core/metricas.js',
  './js/core/input.js',
  './js/core/audio.js',
  './js/core/events.js',
  './js/game/game.js',
  './js/game/theme.js',
  './js/game/entities.js',
  './js/game/spawner.js',
  './js/game/drops.js',
  './js/game/eventos.js',
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
  // Parte 2: sem skipWaiting automático — a versão nova espera o jogador
  // clicar "Atualizar" no toast da página (aí envia SKIP_WAITING e assume)
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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
  const mesmoOrigem = new URL(req.url).origin === self.location.origin;

  // navegação: rede primeiro (atualização chega sempre); cache só offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const copia = res.clone();
          await caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copia));
        }
        return res;
      } catch (e) {
        const cached = await caches.match('./index.html');
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }

  // estáticos: cache primeiro com revalidação em segundo plano (waitUntil
  // para a atualização não ser morta junto com o worker ocioso)
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      event.waitUntil(fetch(req).then((res) => {
        if (res && res.ok && mesmoOrigem) {
          return caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
        }
        return undefined;
      }).catch(() => undefined));
      return cached;
    }
    const res = await fetch(req);
    if (res && res.ok && mesmoOrigem) {
      await caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
    }
    return res;
  })());
});
