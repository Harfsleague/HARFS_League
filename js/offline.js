// ============================================================
// offline.js  —  OFFLINE — IndexedDB cache layer + network status glow
// Loaded as a classic (non-module) script, right after config.js —
// every other file can call idbGet/idbSet/setSyncStatus freely.
// ============================================================
const OFFLINE_DB_NAME = 'harfs-offline';
// v3 added 'teamLogos'. v4 adds 'mbaData' (CUP tournament state/history —
// see js/mba.js) — onupgradeneeded only adds missing stores, so existing
// data in every other store is untouched by this bump.
// ('liveScoresCache' was dropped from this list along with the Live
// Scores feature; any leftover store of that name in an existing user's
// browser is simply unused now, not deleted — harmless.)
const OFFLINE_DB_VERSION = 4;
const OFFLINE_STORES = ['leagueData','mainLeagueData','matchHistory','archivedSeasons','weirdEvents','playlist','offlineTrack','teamLogos','mbaData'];

let _offlineDbPromise = null;
function openOfflineDb(){
    if(_offlineDbPromise) return _offlineDbPromise;
    _offlineDbPromise = new Promise((resolve,reject)=>{
        if(!('indexedDB' in window)){ reject(new Error('IndexedDB unsupported')); return; }
        const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
        req.onupgradeneeded = ()=>{
            const db = req.result;
            OFFLINE_STORES.forEach(name=>{ if(!db.objectStoreNames.contains(name)) db.createObjectStore(name); });
        };
        req.onsuccess = ()=>resolve(req.result);
        req.onerror = ()=>reject(req.error);
    });
    return _offlineDbPromise;
}
async function idbGet(store, key){
    try{
        const db = await openOfflineDb();
        return await new Promise((resolve,reject)=>{
            const tx = db.transaction(store,'readonly');
            const r = tx.objectStore(store).get(key);
            r.onsuccess = ()=>resolve(r.result);
            r.onerror = ()=>reject(r.error);
        });
    }catch(e){ return undefined; }
}
async function idbSet(store, key, value){
    try{
        const db = await openOfflineDb();
        return await new Promise((resolve,reject)=>{
            const tx = db.transaction(store,'readwrite');
            tx.objectStore(store).put(value, key);
            tx.oncomplete = ()=>resolve(true);
            tx.onerror = ()=>reject(tx.error);
        });
    }catch(e){ return false; }
}

// ============================================================
// TEAM LOGOS — cached as base64 data URLs, IndexedDB-backed, the same
// approach Golden Moments already uses for its thumbnails. This is more
// durable than relying on the browser's Cache Storage (which the OS/browser
// can evict under storage pressure) for a handful of tiny PNGs that
// essentially never change — once cached, a team's logo stays available
// offline indefinitely with no repeat network cost.
//
// `teamLogoDataUrls` is populated from IndexedDB once at boot (see
// preloadTeamLogosFromCache(), awaited in main.js before first paint) and
// kept in memory for the rest of the session, so teamLogoUrl() below can
// resolve synchronously — no need to touch every render call site with
// async/await, just swap the URL it builds.
let teamLogoDataUrls = {};

function teamLogoUrl(team){
    // A team's own custom logo (set via Profile → Edit Team) always wins —
    // it's stored inline in mainLeagueData, no separate fetch needed.
    const custom = mainLeagueData[team] && mainLeagueData[team].customLogo;
    if(custom) return custom;
    return teamLogoDataUrls[team] || `${GITHUB_IMAGE_BASE_URL}${team}.png`;
}

async function preloadTeamLogosFromCache(){
    try{
        for(const team of TEAM_NAMES){
            const rec = await idbGet('teamLogos', team);
            if(rec && rec.dataUrl) teamLogoDataUrls[team] = rec.dataUrl;
        }
    }catch(e){ /* IndexedDB unavailable — falls back to live URLs, same as before this feature existed */ }
}

async function cacheTeamLogo(team){
    try{
        const res = await fetch(`${GITHUB_IMAGE_BASE_URL}${team}.png`);
        if(!res.ok) return;
        const blob = await res.blob();
        if(!blob || !blob.size) return;
        const dataUrl = await new Promise((resolve,reject)=>{
            const reader = new FileReader();
            reader.onload = ()=>resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        await idbSet('teamLogos', team, { dataUrl, cachedAt: Date.now() });
        teamLogoDataUrls[team] = dataUrl;
    }catch(e){ /* best-effort — a failed cache attempt just means this logo stays on the live URL for now */ }
}

// Called once at boot (fire-and-forget, no need to block startup on it):
// makes sure every team's logo gets cached at least once. Skips teams
// already cached — logos are effectively static, no need to re-download
// every session, only the first time (or after a manual re-sync).
async function ensureTeamLogosCached(){
    if(!navigator.onLine) return;
    for(const team of TEAM_NAMES){
        if(teamLogoDataUrls[team]) continue;
        await cacheTeamLogo(team);
    }
}

// ============================================================
// NETWORK STATUS — only two states: online / offline.
// No notification or glow is shown for "syncing" or "synced" anymore.
// Something is shown ONLY when the connection state actually changes:
//   • going offline → "You are offline" notification + a permanent
//                     grey glow around the capsule until we're back online
//   • going online  → "Back online" notification + a brief green glow,
//                     then nothing
// setSyncStatus() still exists (audio.js / memories.js / season.js /
// league-ops.js call it) but ignores its argument and just compares the
// real navigator.onLine against the last recorded state; if nothing
// changed, nothing happens.
// ============================================================
let _netOnline = null;      // null = not initialised yet
let _netFadeTimer = null;

// The capsule can't show a notification until the startup animation has
// moved it to the header (.in-header). If the app was opened offline,
// wait for that before showing the message.
function _notifyWhenCapsuleReady(msg, type, dur, expectedOnline){
    const capsule = document.getElementById('hero-logo-container');
    if(!capsule) return;
    const fire = ()=>{ if(_netOnline === expectedOnline) showToast(msg, type, dur); };
    if(capsule.classList.contains('in-header')){ fire(); return; }
    const poll = setInterval(()=>{
        if(capsule.classList.contains('in-header')){
            clearInterval(poll);
            setTimeout(fire, 900);
        }
    }, 300);
}

function applyNetworkState(){
    const capsule = document.getElementById('hero-logo-container');
    if(!capsule) return;
    const online = navigator.onLine;
    if(online === _netOnline) return;          // state unchanged → do nothing
    const isFirstCheck = (_netOnline === null);
    _netOnline = online;

    clearTimeout(_netFadeTimer);
    capsule.classList.remove('sync-offline','sync-syncing','sync-synced','sync-error');

    if(!online){
        capsule.classList.add('sync-offline');  // permanent glow while offline
        capsule.title = 'Offline — showing cached data';
        _notifyWhenCapsuleReady('You are offline', 'info', 3200, false);
        return;
    }

    capsule.title = '';
    if(isFirstCheck) return;                    // app opened while online → stay silent
    capsule.classList.add('sync-synced');       // brief green glow
    _notifyWhenCapsuleReady('Back online', 'success', 2600, true);
    _netFadeTimer = setTimeout(()=>capsule.classList.remove('sync-synced'), 2200);
}

// Backwards-compatible shim for the existing calls elsewhere in the app.
function setSyncStatus(){ applyNetworkState(); }

window.addEventListener('online',  applyNetworkState);
window.addEventListener('offline', applyNetworkState);
document.addEventListener('DOMContentLoaded', applyNetworkState);
