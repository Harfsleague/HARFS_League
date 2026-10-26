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

document.addEventListener('DOMContentLoaded',()=>{
    // ---- STARTUP SPEED --------------------------------------------------
    // The HARFS intro animation used to start only AFTER `await`-ing the
    // team-logo cache and the GitHub round-trips (loadMainLeagueDataFromGitHub =
    // 2 sequential network requests), so on a slow / filtered connection the
    // logo could take many seconds to appear. Now the animation starts on the
    // very first tick, and the data loads in parallel with it. The animation
    // only waits (briefly, see startApp) for the LOCAL cache copy of the
    // league data — never for the network.
    let cacheReadyResolve;
    const cacheReady = new Promise(r=>{ cacheReadyResolve = r; });

    // Each pre-start helper is isolated: if one throws (e.g. a missing element) the app must still start.
    const safe = fn => { try{ fn(); }catch(e){ console.error('[HARFS] startup step failed:', e); } };
    safe(updateCurrentDateTime);
    setInterval(updateCurrentDateTime,60000);
    safe(setupOverallHold);
    safe(setupSeasonFabScroll);
    startApp(cacheReady);                       // <- logo shows immediately

    (async()=>{
        try{
            await preloadTeamLogosFromCache();  // quick local IndexedDB read
            ensureTeamLogosCached();            // best-effort background refresh, not awaited
            // Run main league, archive, and CUP loaders in parallel so Overall trophy counts are ready immediately
            await Promise.all([
                loadMainLeagueDataFromGitHub(()=>cacheReadyResolve()),
                loadArchiveDropdown(),
                loadMbaDataFromGitHub().then(()=>loadFlowFromGitHub()),
            ]);
        }catch(e){ /* offline / API hiccup: the cached data (if any) is already in place */ }
        cacheReadyResolve();                    // first-ever launch (no cache): release after the network attempt
        try{ updateHeaderForLogin(); }catch(e){}// custom team logo / names may have just arrived
        try{ if(typeof renderMainLeagueTable==='function') renderMainLeagueTable(); }catch(e){}
    })();
});
