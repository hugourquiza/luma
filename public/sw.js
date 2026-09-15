// Service Worker: precache shell + offline region downloads (§11).
// Static assets (shell) versioned per build; region downloads stored in
// Cache Storage only after full verification.
// __SHELL_FILES__ and __SHELL_VERSION__ are injected at build time.

self.__SHELL_FILES__ = [];
self.__SHELL_VERSION__ = 'dev';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(`isla-shell-${self.__SHELL_VERSION__}`);
      await cache.addAll(self.__SHELL_FILES__);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // clean up old shell versions
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('isla-shell-') && k !== `isla-shell-${self.__SHELL_VERSION__}`)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

const REGION_PREFIX = 'isla-region';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNav = event.request.mode === 'navigate';
  const isAudio = url.pathname.startsWith('/audio/');
  const isJson = url.pathname.startsWith('/content/');

  if (isAudio || isJson) {
    event.respondWith(serveRegionAsset(event, isAudio));
    return;
  }
  if (isNav) {
    event.respondWith(serveNav(event));
  }
  // other same-origin assets (shell) → cache-first via current shell cache
});

/** Navigation → shell, but only for app routes (never missing audio/json). */
async function serveNav(event) {
  const cache = await caches.open(`isla-shell-${self.__SHELL_VERSION__}`);
  const cached = await cache.match('./index.html');
  if (cached) return cached;
  try {
    return await fetch(event.request);
  } catch {
    return new Response('Sin conexión', { status: 503 });
  }
}

/** Serve audio/content JSON from any downloaded region cache, else network. */
async function serveRegionAsset(event, isAudio) {
  const url = new URL(event.request.url);
  const fileName = url.pathname.split('/').pop();
  const keys = await caches.keys();
  for (const key of keys) {
    if (key.startsWith(REGION_PREFIX)) {
      const cache = await caches.open(key);
      const hit = await cache.match(fileName);
      if (hit) return hit;
    }
  }
  try {
    return await fetch(event.request);
  } catch {
    return new Response(isAudio ? '' : '{}', { status: 404 });
  }
}
