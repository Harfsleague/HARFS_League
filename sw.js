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
const CACHE_VERSION = 'harfs-shell-v52';
// Runtime cache for static images pulled from other origins: HARFS team
// logos + Golden Moment media (raw.githubusercontent.com) and live-score
// league/team badges (media.api-sports.io). None of this was cached before,
// which is exactly why team logos and moment photos could vanish once
// offline even after being viewed successfully while online — the previous
// service worker explicitly left every cross-origin request untouched.
// These are effectively immutable once uploaded, so cache-first (with a
// silent background refresh) is safe and avoids ever re-downloading them.
const IMAGE_CACHE_VERSION = 'harfs-images-v2';
// Tailwind + Font Awesome (the two big CDN stylesheets) and Font Awesome's web-font files. They were never cached
// before — every cold start re-downloaded ~300 KB of CSS from a CDN (slow start, and no styling at all when opened
// offline). Pinned versions never change, so cache-first is safe.
const CDN_CACHE_VERSION = 'harfs-cdn-v1';
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
const IMAGE_CACHE_HOSTS = ['raw.githubusercontent.com', 'media.api-sports.io'];
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './css/mba.css',
  './css/flow.css',
  './css/liquid-glass.css',
  './css/chat.css',
  './css/lite.css',
  './css/lite-vendor.css',
  './js/config.js',
  './js/glass-fx.js',
  './js/offline.js',
  './js/auth.js',
  './js/sessions.js',
  './js/offline-gh.js',
  './js/notifications.js',
  './js/appearance.js',
  './js/ui-common.js',
  './js/memories.js',
  './js/admin.js',
  './js/overall.js',
  './js/season.js',
  './js/shop.js',
  './js/league-ops.js',
  './js/profile-photos.js',
  './js/access.js',
  './js/reactions.js',
  './js/audio.js',
  './js/magazine.js',
  './js/gif-encoder.js',
  './js/magazine-comments.js',
  './js/ai-chat.js',
  './js/mba.js',
  './js/flow.js',
  './js/cards.js',
  './js/season-layout.js',
  './js/verify.js',
  './js/admin-music.js',
  './js/chat.js',
  './js/lite-net.js',
  './js/vendor/qrcode.min.js',
  './js/vendor/jsqr.min.js',
  './js/lite-ui.js',
  './fonts/manifest.json',
  './fonts/Champions-Bold.ttf',
  './fonts/danstevis.otf',
  './fonts/Far_MashinTahrir.ttf',
  './js/main.js',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // cache:'reload' skips the browser's own HTTP cache (GitHub Pages sends
      // max-age=600). cache.addAll() didn't, so right after a deploy the new
      // worker could precache a STALE copy of some files next to fresh ones
      // (e.g. new index.html + old appearance.js) — a mixed app. Each asset
      // is fetched fresh and independently, so one missing file can't block
      // the rest.
      .then(cache => Promise.all(APP_SHELL.map(url =>
        fetch(new Request(url, { cache:'reload' }))
          .then(res => (res && res.ok) ? cache.put(url, res) : null)
          .catch(() => {})
      )))
      .catch(() => {}) // never block install
  );
});

self.addEventListener('activate', event => {
  const keep = [CACHE_VERSION, IMAGE_CACHE_VERSION, CDN_CACHE_VERSION];
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
  // moment_reactions.json lives on the same host but is LIVE data (reactions change all the time):
  // never cache-first, always straight from the network (js/reactions.js keeps its own offline copy).
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.endsWith('/moment_reactions.json')) return;

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

  // CDN stylesheets / fonts: cache-first (opaque no-cors responses are fine to store and to replay for the same request).
  if(CDN_HOSTS.includes(url.hostname)){
    event.respondWith(
      caches.open(CDN_CACHE_VERSION).then(cache =>
        cache.match(req).then(cached => cached || fetch(req).then(res => {
          if(res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }))
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
      // 'no-cache' = always revalidate with the server (a cheap 304 when
      // nothing changed) instead of trusting the HTTP cache, so the
      // background refresh really picks up a new deploy.
      const network = fetch(req, { cache:'no-cache' }).then(res => {
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


// ---------------------------------------------------------------------------------------------
// PUSH NOTIFICATIONS — the Worker (worker.js → PUSH NOTIFICATIONS) sends an encrypted JSON payload
// { title, body, url, tag }; tapping a notification opens the app on the right page.
// ---------------------------------------------------------------------------------------------
const NOTIF_ICON = 'https://raw.githubusercontent.com/Harfsleague/HARFS_Data/main/icon-192.png';
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'HARFS League', {
    body: d.body || '',
    icon: NOTIF_ICON,
    badge: NOTIF_ICON,
    tag: d.tag || 'harfs',
    renotify: true,
    data: { url: d.url || '' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '';
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if ('focus' in c) { await c.focus(); c.postMessage({ type: 'harfs-open', target }); return; }
    }
    await clients.openWindow('./' + (target ? '?open=' + encodeURIComponent(target) : ''));
  })());
});
