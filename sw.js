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
// IMPORTANT — bump this (e.g. v3 -> v4) on every deploy that changes ANY
// app-shell file (index.html or anything in js/ or css/). Browsers only
// re-fetch and re-install this service worker when sw.js's own bytes
// change; if this constant stays the same, the old cache keeps being
// served (this is a "serve cached immediately, refresh in the background"
// strategy — see the fetch handler below), which can leave a user's
// browser running a MIX of old-cached JS files alongside a freshly loaded
// index.html (or vice versa) for a while after a patch — exactly the kind
// of inconsistency that looks like "random things broke" after an update.
const CACHE_VERSION = 'harfs-shell-v3';
// Runtime cache for static images pulled from other origins: HARFS team
// logos + Golden Moment media (raw.githubusercontent.com) and live-score
// league/team badges (media.api-sports.io). None of this was cached before,
// which is exactly why team logos and moment photos could vanish once
// offline even after being viewed successfully while online — the previous
// service worker explicitly left every cross-origin request untouched.
// These are effectively immutable once uploaded, so cache-first (with a
// silent background refresh) is safe and avoids ever re-downloading them.
const IMAGE_CACHE_VERSION = 'harfs-images-v1';
const IMAGE_CACHE_HOSTS = ['raw.githubusercontent.com', 'media.api-sports.io'];
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
  const keep = [CACHE_VERSION, IMAGE_CACHE_VERSION];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Static images (team logos, Golden Moment photos/videos, live-score
  // badges) from the known image hosts: cache-first, with a background
  // refetch to pick up rare changes (e.g. a team's logo file being
  // replaced) — never left to fail purely because we're offline.
  if (IMAGE_CACHE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(IMAGE_CACHE_VERSION).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Everything else cross-origin (GitHub API JSON, the two Cloudflare
  // Workers, CDN libraries) is left to the network as before — js/offline.js
  // is what supplies the offline fallback for the app's actual data.
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
