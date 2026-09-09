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

document.addEventListener('DOMContentLoaded',async()=>{
    // Load any already-cached team logos into memory BEFORE the first
    // render that needs them — this is a quick local IndexedDB read (a
    // handful of tiny records), so awaiting it here doesn't meaningfully
    // delay startup, and avoids a flash-of-live-URL on every load.
    await preloadTeamLogosFromCache();
    ensureTeamLogosCached(); // best-effort background refresh/first-time cache, not awaited
    updateCurrentDateTime();
    setInterval(updateCurrentDateTime,60000);
    loadArchiveDropdown();
    setupOverallHold();
    setupSeasonFabScroll();
    startApp();
});
