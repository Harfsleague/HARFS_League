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
    updateCurrentDateTime();
    setInterval(updateCurrentDateTime,60000);
    loadArchiveDropdown();
    setupOverallHold();
    setupSeasonFabScroll();
    startApp();
});
