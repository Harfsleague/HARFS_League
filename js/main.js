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

    updateCurrentDateTime();
    setInterval(updateCurrentDateTime,60000);
    setupOverallHold();
    setupSeasonFabScroll();
    startApp(cacheReady);                       // <- logo shows immediately

    (async()=>{
        try{
            await preloadTeamLogosFromCache();  // quick local IndexedDB read
            ensureTeamLogosCached();            // best-effort background refresh, not awaited
            // cacheReadyResolve fires as soon as the cached copy is merged in (before the network request)
            await loadMainLeagueDataFromGitHub(()=>cacheReadyResolve());
        }catch(e){ /* offline / API hiccup: the cached data (if any) is already in place */ }
        cacheReadyResolve();                    // first-ever launch (no cache): release after the network attempt
        try{ updateHeaderForLogin(); }catch(e){}// custom team logo / names may have just arrived
        loadArchiveDropdown();
        // CUP first, then the schedule: the schedule's phase is derived from the CUP edition + match history
        loadMbaDataFromGitHub().then(()=>loadFlowFromGitHub());
    })();
});
