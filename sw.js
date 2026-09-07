// ============================================================
// sw.js — HARFS Service Worker
// ------------------------------------------------------------
// Caches the app shell (HTML/CSS/JS) so the app boots even fully
// offline. Data (league tables, match history, Golden Moments,
// music) is handled separately by js/offline.js via IndexedDB —
// this worker intentionally leaves api.github.com and the Worker
// APIs alone (network-only for those), since offline.js already
// knows how to fall back to cached data for them.
//
// Paths below are relative ('./...'), so this works correctly
// whether the site is served from the domain root or from a
// GitHub Pages subpath (username.github.io/repo-name/).
// ============================================================
const CACHE_VERSION = 'harfs-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/offline.js',
  './js/auth.js',
  './js/appearance.js',
  './js/ui-common.js',
  './js/memories.js',
  './js/admin.js',
  './js/overall.js',
  './js/season.js',
  './js/shop.js',
  './js/league-ops.js',
  './js/audio.js',
  './js/ai-chat.js',
  './js/admin-music.js',
  './js/live-scores.js',
  './js/main.js',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {}) // never block install on a single missing/renamed asset
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only ever intercept same-origin requests (the app's own files).
  // Everything else (GitHub API/raw, the two Cloudflare Workers, CDN
  // libraries) is left to the network — js/offline.js is what supplies
  // the offline fallback for the app's actual data.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
