// ============================================================
// main.js  —  MAIN — app init / DOMContentLoaded entry point
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// INIT
// ============================================================
initializeLeagueData();
initializeMainLeagueData();
applyAppearance();   // apply saved palette/scheme/performance before first paint

function applySnapshotFilesToMemory(files){
    if(!files || typeof files !== 'object') return false;
    let changed = false;
    if(files['main_league_data.json']){
        const m = repairMojibake(JSON.parse(JSON.stringify(files['main_league_data.json'])));
        Object.keys(m).forEach(k=>{ if(mainLeagueData[k]) mainLeagueData[k] = { ...mainLeagueData[k], ...m[k] }; });
        PROFILE_TEAMS.forEach(ensureWalletFields);
        syncTeamDisplayNames();
        changed = true;
    }
    if(Array.isArray(files['seasons_archive.json'])){
        archivedSeasons = JSON.parse(JSON.stringify(files['seasons_archive.json']));
        if(typeof renderArchiveDropdownOptions === 'function') renderArchiveDropdownOptions();
        changed = true;
    }
    if(files['mba_history.json']){
        mbaData = JSON.parse(JSON.stringify(files['mba_history.json']));
        if(typeof normalizeMbaData === 'function') normalizeMbaData();
        changed = true;
    }
    if(files['season_flow.json']){
        flowData = JSON.parse(JSON.stringify(files['season_flow.json']));
        changed = true;
    }
    if(files['league_data.json']){
        const ld = files['league_data.json'];
        Object.keys(ld).forEach(k=>{ if(leagueData[k]) leagueData[k] = { ...leagueData[k], ...ld[k] }; });
        changed = true;
    }
    if(Array.isArray(files['match_history.json'])){
        matchHistory = JSON.parse(JSON.stringify(files['match_history.json']));
        changed = true;
    }
    return changed;
}

document.addEventListener('DOMContentLoaded',()=>{
    // ---- STARTUP SPEED (Snapshot-First) ---------------------------------
    // Boot immediately from IndexedDB (falling back to the single same-origin
    // data/snapshot.json on first visit) with ZERO blocking api.github.com calls.
    // Live GitHub sync runs silently in the background after the first screen is live.
    let cacheReadyResolve;
    const cacheReady = new Promise(r=>{ cacheReadyResolve = r; });

    // Each pre-start helper is isolated: if one throws (e.g. a missing element) the app must still start.
    const safe = fn => { try{ fn(); }catch(e){ console.error('[HARFS] startup step failed:', e); } };
    safe(updateCurrentDateTime);
    setInterval(updateCurrentDateTime,60000);
    safe(setupOverallHold);
    safe(setupSeasonFabScroll);
    startApp(cacheReady);                       // <- logo shows immediately

    const runBackgroundLiveSync = ()=>{
        if(!navigator.onLine) return;
        Promise.all([
            loadMainLeagueDataFromGitHub(),
            loadArchiveDropdown(),
            loadMbaDataFromGitHub().then(()=>loadFlowFromGitHub()),
        ]).then(()=>{
            try{ updateHeaderForLogin(); }catch(e){}
            try{
                if(document.getElementById('main-league-screen')?.classList.contains('active') && typeof renderMainLeagueTable==='function'){
                    renderMainLeagueTable();
                }
            }catch(e){}
        }).catch(()=>{});
    };

    (async()=>{
        let hasLocalData = false;
        try{
            // Phase 1: Parallel local IndexedDB read (first-visit automatically pulls from single data/snapshot.json)
            const [ , mainCached, archCached, mbaCached, flowCached, leagueCached, matchesCached ] = await Promise.all([
                preloadTeamLogosFromCache(),
                idbGet('mainLeagueData','v'),
                idbGet('archivedSeasons','v'),
                idbGet('mbaData','v'),
                idbGet('flowData','v'),
                idbGet('leagueData','v'),
                idbGet('matchHistory','v'),
            ]);
            if(mainCached){
                const m = repairMojibake(mainCached);
                Object.keys(m).forEach(k=>{ if(mainLeagueData[k]) mainLeagueData[k] = { ...mainLeagueData[k], ...m[k] }; });
                PROFILE_TEAMS.forEach(ensureWalletFields);
                syncTeamDisplayNames();
                hasLocalData = true;
            }
            if(Array.isArray(archCached)){
                archivedSeasons = archCached;
                if(typeof renderArchiveDropdownOptions === 'function') renderArchiveDropdownOptions();
                hasLocalData = true;
            }
            if(mbaCached){
                mbaData = mbaCached;
                if(typeof normalizeMbaData === 'function') normalizeMbaData();
            }
            if(flowCached) flowData = flowCached;
            if(leagueCached) Object.keys(leagueCached).forEach(k=>{ if(leagueData[k]) leagueData[k] = { ...leagueData[k], ...leagueCached[k] }; });
            if(Array.isArray(matchesCached)) matchHistory = matchesCached;
        }catch(e){ /* IndexedDB unavailable */ }

        cacheReadyResolve();                    // release intro immediately with local/snapshot data
        try{ updateHeaderForLogin(); }catch(e){}
        if(hasLocalData){
            try{ if(typeof renderMainLeagueTable==='function') renderMainLeagueTable(); }catch(e){}
        }
        ensureTeamLogosCached();                // best-effort background refresh, not awaited

        // Phase 2: One fast same-origin snapshot check (304 if unchanged) to catch updates on returning visits
        if(typeof window.harfsSyncFromSnapshot === 'function'){
            try{
                const res = await window.harfsSyncFromSnapshot(!hasLocalData);
                if(res && res.updated && res.files && applySnapshotFilesToMemory(res.files)){
                    hasLocalData = true;
                    try{ updateHeaderForLogin(); }catch(e){}
                    try{ if(typeof renderMainLeagueTable==='function') renderMainLeagueTable(); }catch(e){}
                }
            }catch(e){}
        }

        // Phase 3: Silent background live GitHub sync (fetches fresh SHAs + any edits newer than the 15-min snapshot)
        if(!hasLocalData){
            runBackgroundLiveSync();
        } else {
            const scheduleLive = ()=>setTimeout(runBackgroundLiveSync, 2500);
            if(document.readyState === 'complete') scheduleLive();
            else window.addEventListener('load', scheduleLive, { once:true });
        }
    })();
});
