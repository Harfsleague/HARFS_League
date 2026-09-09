// ============================================================
// offline.js  —  OFFLINE — IndexedDB cache layer + sync status dot
// Loaded as a classic (non-module) script, right after config.js —
// every other file can call idbGet/idbSet/setSyncStatus freely.
// ============================================================
const OFFLINE_DB_NAME = 'harfs-offline';
// v2 added 'liveScoresCache' (last-known fixtures so Live Scores can show
// something instead of a hard error offline). v3 adds 'teamLogos' (see
// below) — onupgradeneeded only adds missing stores, so existing data in
// the other stores is untouched by either bump.
const OFFLINE_DB_VERSION = 3;
const OFFLINE_STORES = ['leagueData','mainLeagueData','matchHistory','archivedSeasons','weirdEvents','playlist','offlineTrack','liveScoresCache','teamLogos'];

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
// SYNC STATUS DOT — small indicator pinned to the top-left of the
// screen. States: offline (grey), syncing (pulsing blue), synced
// (green, auto-fades), error (red, stays until next sync attempt).
// ============================================================
let _syncFadeTimer = null;
function setSyncStatus(state){
    const dot = document.getElementById('sync-status-dot');
    if(!dot) return;
    clearTimeout(_syncFadeTimer);
    dot.className = 'sync-status-dot sync-' + state;
    dot.style.opacity = '1';
    const titles = { offline:'Offline — showing cached data', syncing:'Syncing…', synced:'Up to date', error:'Sync failed — showing cached data' };
    dot.title = titles[state] || '';
    if(state === 'synced'){
        _syncFadeTimer = setTimeout(()=>{ dot.style.opacity = '0'; }, 2200);
    }
}
window.addEventListener('online', ()=>setSyncStatus('syncing'));
window.addEventListener('offline', ()=>setSyncStatus('offline'));
document.addEventListener('DOMContentLoaded', ()=>{
    setSyncStatus(navigator.onLine ? 'syncing' : 'offline');
});
