// ============================================================
// SNAPSHOT-FIRST STARTUP — single-file boot from data/snapshot.json
// ============================================================
// data/snapshot.json is ONE same-origin file holding all core league JSONs (built every ~15 min by
// .github/workflows/data-snapshot.yml). This script:
//   1) Pre-fetches data/snapshot.json immediately on load (with cache:'no-cache' -> tiny 304 if unchanged).
//   2) On a device's FIRST visit (empty IndexedDB), hands out the snapshot's copy directly through idbGet().
//   3) Exposes window.harfsSyncFromSnapshot() so returning visits also update IndexedDB from ONE fast
//      same-origin file whenever snapshot.built is newer, instead of blocking startup on 4+ api.github.com calls.
(function(){
    if(!/^https?:$/.test(location.protocol)) return;          // the standalone lite file (file://) has no snapshot
    if(typeof window.idbGet !== 'function' || typeof window.idbSet !== 'function') return;

    // IndexedDB store -> file in the snapshot (the parsed JSON each loader stores under key 'v')
    const MAP = {
        leagueData:      'league_data.json',
        mainLeagueData:  'main_league_data.json',
        matchHistory:    'match_history.json',
        archivedSeasons: 'seasons_archive.json',
        mbaData:         'mba_history.json',
        flowData:        'season_flow.json',
        cardsData:       'cards_data.json'
    };
    const BUILT_KEY = 'harfs_snapshot_built';
    const WAIT_MS = 2500;       // never hold the first screen longer than this for the snapshot

    let snapPromise = null;
    function loadSnapshot(){
        if(snapPromise) return snapPromise;
        snapPromise = (async ()=>{
            try{
                const ctl = typeof AbortController === 'function' ? new AbortController() : null;
                const timer = ctl ? setTimeout(()=>ctl.abort(), 8000) : null;
                // 'no-cache' = always revalidate (a tiny 304 when unchanged). sw.js lets this file bypass its own cache.
                const r = await fetch('data/snapshot.json', { cache:'no-cache', signal: ctl ? ctl.signal : undefined });
                if(timer) clearTimeout(timer);
                if(!r.ok) return null;
                const j = await r.json();
                return (j && j.v === 1 && j.files && typeof j.files === 'object') ? j : null;
            }catch(e){ return null; }
        })();
        return snapPromise;
    }
    loadSnapshot();     // start now, in parallel with the remaining scripts

    window.harfsSyncFromSnapshot = async function(force){
        if(!navigator.onLine) return { updated:false, files:null };
        try{
            const snap = await Promise.race([ loadSnapshot(), new Promise(res=>setTimeout(()=>res(null), WAIT_MS)) ]);
            if(!snap || !snap.files) return { updated:false, files:null };
            const prevBuilt = localStorage.getItem(BUILT_KEY) || '';
            const isNewer = force || !prevBuilt || (snap.built && snap.built !== prevBuilt);
            if(!isNewer) return { updated:false, files:snap.files, built:snap.built };
            const writes = Object.entries(MAP).map(([store, file])=>{
                const data = snap.files[file];
                if(data === undefined || data === null) return Promise.resolve();
                return window.idbSet(store, 'v', JSON.parse(JSON.stringify(data))).catch(()=>{});
            });
            await Promise.all(writes);
            if(snap.built) try{ localStorage.setItem(BUILT_KEY, snap.built); }catch(e){}
            return { updated:true, files:snap.files, built:snap.built };
        }catch(e){ return { updated:false, files:null }; }
    };

    const realGet = window.idbGet;
    window.idbGet = async function(store, key){
        const v = await realGet(store, key);
        if(v !== undefined || key !== 'v' || !Object.prototype.hasOwnProperty.call(MAP, store)) return v;
        // Nothing stored yet for this file = first visit on this device.
        if(!navigator.onLine) return v;
        try{
            const snap = await Promise.race([ loadSnapshot(), new Promise(res=>setTimeout(()=>res(null), WAIT_MS)) ]);
            const data = (snap && snap.files) ? snap.files[MAP[store]] : undefined;
            if(data === undefined || data === null) return v;
            // Store one copy as the local cache and hand a separate one to the caller (loaders modify what they receive).
            try{ await window.idbSet(store, 'v', JSON.parse(JSON.stringify(data))); }catch(e){}
            return JSON.parse(JSON.stringify(data));
        }catch(e){ return v; }
    };
})();
