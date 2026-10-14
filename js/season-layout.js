// ============================================================
// season-layout.js  —  SEASON SCREEN VIEWS + LEAGUE | CUP BAR
// ------------------------------------------------------------
// Views (body[data-season-view], CSS in css/flow.css):
//
//   main      League table / CUP of the CURRENT season only. No season pickers.
//             Two icon buttons in the header (calendar / bar chart) lead to the other views.
//   schedule  The timetable of the CURRENT season (js/flow.js → renderFlowSchedule).
//   results   Laid out exactly like main, but for ANY season: season picker above the
//             league table, CUP edition picker above the CUP, match history under the league.
//
// Tabs (body[data-season-tab]) — in main and results the League | Cup bar
// (#season-subnav, docked above the bottom nav) switches between the two.
// The bar slides out from behind the bottom nav when the Season screen opens and
// slides back in when you leave it or open the Schedule.
//
// Going back to main (or leaving the Season screen) snaps to the current season.
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================

const SEASON_VIEW_TITLES = { main:'Season', schedule:'Schedule', results:'Results' };
let seasonView = 'main';
let seasonTab = 'league';
let seasonSwapTimer = null;

function seasonMotionOk(){
    return !document.body.classList.contains('perf-no-anim') && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
// restart a CSS animation class on an element
function seasonPlay(el, cls, ms){
    if(!el) return;
    el.classList.remove('sv-out','sv-in','sv-tab','sv-fade');
    void el.offsetWidth;
    el.classList.add(cls);
    if(ms) setTimeout(()=>el.classList.remove(cls), ms);
}

// ---------------- League | Cup bar ----------------
function seasonSyncSubnav(route){
    const bar = document.getElementById('season-subnav'); if(!bar) return;
    const on = route==='league' && seasonView!=='schedule';
    bar.classList.toggle('show', on);
    document.body.classList.toggle('season-subnav-on', on);
}
function seasonSetTab(tab, opts){
    opts = opts || {};
    if(tab!=='league' && tab!=='cup') return;
    if(!opts.silent) haptic([6]);
    const changed = tab!==seasonTab;
    seasonTab = tab;
    document.body.dataset.seasonTab = tab;
    document.querySelectorAll('#season-subnav .nav-item').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
    if(tab==='cup' && typeof renderMbaSeasonView==='function') renderMbaSeasonView();
    if(changed && !opts.silent){
        if(seasonMotionOk()) seasonPlay(document.getElementById('season-sections'), 'sv-tab', 320);
        try{ window.scrollTo({ top:0 }); const sc=document.getElementById('league-table-screen'); if(sc) sc.scrollTop = 0; }catch(e){}
    }
}

// ---------------- views ----------------
function seasonApplyView(view, prev){
    const $ = id => document.getElementById(id);
    document.body.dataset.seasonView = view;
    const title = $('season-screen-title'); if(title) title.textContent = SEASON_VIEW_TITLES[view];
    const back = $('season-back-btn');
    if(back){ back.style.display = view==='main' ? 'none' : 'flex'; if(view!=='main' && seasonMotionOk()) seasonPlay(back,'sv-fade',320); }
    const actions = $('season-header-actions');
    if(actions){ actions.style.display = view==='main' ? 'flex' : 'none'; if(view==='main' && seasonMotionOk()) seasonPlay(actions,'sv-fade',320); }
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

function seasonShowView(view, opts){
    opts = opts || {};
    if(!SEASON_VIEW_TITLES[view]) view = 'main';
    if(!opts.silent) haptic([6]);
    const prev = seasonView;
    seasonView = view;
    // the League | Cup bar tucks away for the Schedule and returns with Main / Results
    seasonSyncSubnav(typeof ROUTES!=='undefined' && typeof currentRouteIndex!=='undefined' ? ROUTES[currentRouteIndex] : 'league');

    const box = document.getElementById('season-sections');
    if(opts.silent || prev===view || !box || !seasonMotionOk()){
        clearTimeout(seasonSwapTimer);
        if(box) box.classList.remove('sv-out','sv-in','sv-tab');
        seasonApplyView(view, prev);
        return;
    }
    // slide the old view out, swap, slide the new one in (forward = into Schedule/Results, back = to Main)
    const dir = view==='main' ? -1 : 1;
    box.style.setProperty('--sx', (dir*30)+'px');
    clearTimeout(seasonSwapTimer);
    seasonPlay(box, 'sv-out');
    seasonSwapTimer = setTimeout(()=>{
        seasonApplyView(view, prev);
        seasonPlay(box, 'sv-in', 360);
    }, 160);
}

document.body.dataset.seasonTab = 'league';
seasonShowView('main', { silent:true });
