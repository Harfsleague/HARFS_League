// ============================================================
// FIRST-VISIT SPEED-UP — start from data/snapshot.json
// ============================================================
// Every loader (league, matches, main league, archive, MBA, flow) first reads its local IndexedDB copy and shows it at once,
// then fetches the live file. On a device's FIRST visit there is no local copy, so the first screen had to wait for the live
// requests (each one a chain of slow calls to api.github.com / raw.githubusercontent.com / the Worker).
// data/snapshot.json is ONE same-origin file with all of those files (built every ~15 min by
// .github/workflows/data-snapshot.yml). This script starts downloading it immediately, and when a loader asks IndexedDB for
// something that is not there yet, it hands out the snapshot's copy instead — exactly as if a previous visit had stored it.
// Nothing else changes: the loaders still fetch the live file right afterwards, replace this copy with it and take the
// version number (sha) from it, so saving always works from the live data. Returning visits (local copy exists) are untouched.
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
        flowData:        'season_flow.json'
    };
    const WAIT_MS = 3000;       // never hold the first screen longer than this for the snapshot

    let snapPromise = null;
    function loadSnapshot(){
        if(snapPromise) return snapPromise;
        snapPromise = (async ()=>{
            try{
                const ctl = typeof AbortController === 'function' ? new AbortController() : null;
                const timer = ctl ? setTimeout(()=>ctl.abort(), 10000) : null;
                // 'no-cache' = always revalidate (a tiny 304 when unchanged). sw.js lets this file bypass its own cache.
                const r = await fetch('data/snapshot.json', { cache:'no-cache', signal: ctl ? ctl.signal : undefined });
                if(timer) clearTimeout(timer);
                if(!r.ok) return null;
                const j = await r.json();
                return (j && j.v === 1 && j.files && typeof j.files === 'object') ? j.files : null;
            }catch(e){ return null; }
        })();
        return snapPromise;
    }
    loadSnapshot();     // start now, in parallel with the remaining scripts

    const realGet = window.idbGet;
    window.idbGet = async function(store, key){
        const v = await realGet(store, key);
        if(v !== undefined || key !== 'v' || !Object.prototype.hasOwnProperty.call(MAP, store)) return v;
        // Nothing stored yet for this file = first visit on this device.
        if(!navigator.onLine) return v;
        try{
            const files = await Promise.race([ loadSnapshot(), new Promise(res=>setTimeout(()=>res(null), WAIT_MS)) ]);
            const data = files ? files[MAP[store]] : undefined;
            if(data === undefined || data === null) return v;
            // Store one copy as the local cache and hand a separate one to the caller (loaders modify what they receive).
            try{ await window.idbSet(store, 'v', JSON.parse(JSON.stringify(data))); }catch(e){}
            return JSON.parse(JSON.stringify(data));
        }catch(e){ return v; }
    };
})();
