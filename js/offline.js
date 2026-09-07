// ============================================================
// offline.js  —  OFFLINE — IndexedDB cache layer + sync status dot
// Loaded as a classic (non-module) script, right after config.js —
// every other file can call idbGet/idbSet/setSyncStatus freely.
// ============================================================
const OFFLINE_DB_NAME = 'harfs-offline';
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORES = ['leagueData','mainLeagueData','matchHistory','archivedSeasons','weirdEvents','playlist','offlineTrack'];

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
