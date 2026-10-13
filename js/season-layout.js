// ============================================================
// season-layout.js  —  SEASON SCREEN VIEWS
// ------------------------------------------------------------
// The Season screen has three views (body[data-season-view], CSS in css/flow.css):
//
//   main      League table + CUP of the CURRENT season only. No season pickers.
//             Two icon buttons in the header (calendar / bar chart) lead to the other views.
//   schedule  The timetable of the CURRENT season (js/flow.js → renderFlowSchedule).
//             Earlier seasons never appear here.
//   results   Like the main page, but for ANY season: season picker above the
//             league table, CUP edition picker above the CUP, and the full
//             match history (with the team filter chips) underneath.
//
// Going back to main (or leaving the Season screen) always snaps to the current season.
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================

const SEASON_VIEW_TITLES = { main:'Season', schedule:'Schedule', results:'Results' };
let seasonView = 'main';

function seasonShowView(view, opts){
    opts = opts || {};
    if(!SEASON_VIEW_TITLES[view]) view = 'main';
    if(!opts.silent) haptic([6]);
    const prev = seasonView;
    seasonView = view;
    document.body.dataset.seasonView = view;

    const $ = id => document.getElementById(id);
    const title = $('season-screen-title'); if(title) title.textContent = SEASON_VIEW_TITLES[view];
    const back = $('season-back-btn'); if(back) back.style.display = view==='main' ? 'none' : 'flex';
    const actions = $('season-header-actions'); if(actions) actions.style.display = view==='main' ? 'flex' : 'none';
    const dt = $('current-datetime'); if(dt) dt.style.display = view==='schedule' ? 'none' : '';

    if(view==='main'){
        // the main page is always the running season (and its CUP), whatever was browsed in Results
        const needReset = (typeof currentSeasonIdx!=='undefined' && currentSeasonIdx!==0) || (typeof isViewingArchive!=='undefined' && isViewingArchive);
        if(typeof currentSeasonIdx!=='undefined') currentSeasonIdx = 0;
        if(typeof syncSeasonPill==='function') syncSeasonPill();
        const sel = $('season-selector'); if(sel) sel.value = 'current';
        if(needReset || prev!=='main'){
            if(typeof loadSelectedSeason==='function') loadSelectedSeason('current');
        }
        if(typeof updateCurrentDateTime==='function' && !needReset) updateCurrentDateTime();
    } else if(view==='results'){
        if(typeof syncSeasonPill==='function') syncSeasonPill();
        if(typeof renderMbaSeasonView==='function') renderMbaSeasonView();
        if(typeof renderSeasonHistoryList==='function' && typeof isViewingArchive!=='undefined' && !isViewingArchive) renderSeasonHistoryList(matchHistory);
    } else if(view==='schedule'){
        if(typeof renderFlowSchedule==='function') renderFlowSchedule();
    }
    try{ window.scrollTo({ top:0 }); const sc=$('league-table-screen'); if(sc) sc.scrollTop = 0; }catch(e){}
}

seasonShowView('main', { silent:true });
