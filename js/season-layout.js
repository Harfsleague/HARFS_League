// ============================================================
// season-layout.js  —  SEASON SCREEN VIEWS + LEAGUE | CUP BAR
// ------------------------------------------------------------
// Views (body[data-season-view], CSS in css/flow.css):
//
//   main      Season = league table + match history (results) of ANY season (season picker on top),
//             or the CUP of any edition (edition picker on top). The old separate "Results" view
//             was merged into this one. One icon button in the header (calendar) opens the Schedule.
//   schedule  The timetable of the CURRENT season (js/flow.js → renderFlowSchedule).
//
// Tabs (body[data-season-tab]) — in main the League | Cup bar
// (#season-subnav, docked above the bottom nav) switches between the two.
// The bar slides out from behind the bottom nav when the Season screen opens and
// slides back in when you leave it or open the Schedule.
//
// Leaving the Season screen snaps back to the current season.
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================

const SEASON_VIEW_TITLES = { main:'Season', schedule:'Schedule' };
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
    // League is the default tab: make sure it is the marked one, and re-measure the glass lens once the bar is out
    if(on){
        if(!bar.querySelector('.nav-item.active')){ const t = bar.querySelector(`.nav-item[data-tab="${seasonTab}"]`); if(t) t.classList.add('active'); }
    }
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
function seasonApplyView(view, prev, keepTitle){
    const $ = id => document.getElementById(id);
    document.body.dataset.seasonView = view;
    if(!keepTitle){ const title = $('season-screen-title'); if(title) title.textContent = SEASON_VIEW_TITLES[view]; }
    const back = $('season-back-btn');
    if(back){ back.style.display = view==='main' ? 'none' : 'flex'; if(view!=='main' && seasonMotionOk()) seasonPlay(back,'sv-fade',320); }
    const actions = $('season-header-actions');
    if(actions){ actions.style.display = view==='main' ? 'flex' : 'none'; if(view==='main' && seasonMotionOk()) seasonPlay(actions,'sv-fade',320); }
    const dt = $('current-datetime'); if(dt) dt.style.display = view==='schedule' ? 'none' : '';

    if(view==='main'){
        // Season = table + results of whichever season is selected in the picker (current by default).
        if(typeof syncSeasonPill==='function') syncSeasonPill();
        if(typeof renderMbaSeasonView==='function') renderMbaSeasonView();
        if(typeof renderSeasonHistoryList==='function' && typeof isViewingArchive!=='undefined' && !isViewingArchive) renderSeasonHistoryList(matchHistory);
        if(typeof updateCurrentDateTime==='function') updateCurrentDateTime();
    } else if(view==='schedule'){
        if(typeof renderFlowSchedule==='function') renderFlowSchedule();
    }
    try{ window.scrollTo({ top:0 }); const sc=$('league-table-screen'); if(sc) sc.scrollTop = 0; }catch(e){}
}

// Title swap: the old word lifts away, the new one rises in (text changes mid-way).
function seasonAnimateTitle(text, delay){
    const t = document.getElementById('season-screen-title');
    if(!t) return;
    t.classList.remove('t-in'); void t.offsetWidth;
    t.classList.add('t-out');
    setTimeout(()=>{
        t.textContent = text;
        t.classList.remove('t-out'); void t.offsetWidth;
        t.classList.add('t-in');
        setTimeout(()=>t.classList.remove('t-in'), 340);
    }, delay);
}
// Header box: tween its height from what it was to what the new content needs.
function seasonMorphHeader(change){
    const hdr = document.querySelector('#league-table-screen .league-header');
    if(!hdr){ change(); return; }
    const h0 = hdr.offsetHeight;
    change();
    hdr.style.height = '';                      // natural height of the new content
    const h1 = hdr.offsetHeight;
    if(Math.abs(h1-h0) < 2) return;
    hdr.classList.add('hdr-anim');
    hdr.style.height = h0+'px';
    void hdr.offsetHeight;
    hdr.style.height = h1+'px';
    clearTimeout(hdr.__morphT);
    hdr.__morphT = setTimeout(()=>{ hdr.style.height=''; hdr.classList.remove('hdr-anim'); }, 460);
}

// Same height tween as seasonMorphHeader, but the new content is already in place: the header is first put back at
// its previous height (hdr.__h0, recorded just before the swap) and then glides to the natural height.
function seasonMorphHeaderTo(view){
    const hdr = document.querySelector('#league-table-screen .league-header');
    if(!hdr || hdr.__h0==null) return;
    const h0 = hdr.__h0; hdr.__h0 = null;
    hdr.style.height = '';
    const h1 = hdr.offsetHeight;
    if(Math.abs(h1-h0) < 2) return;
    hdr.classList.add('hdr-anim');
    hdr.style.height = h0+'px';
    void hdr.offsetHeight;
    hdr.style.height = h1+'px';
    clearTimeout(hdr.__morphT);
    hdr.__morphT = setTimeout(()=>{ hdr.style.height=''; hdr.classList.remove('hdr-anim'); }, 460);
}

function seasonShowView(view, opts){
    opts = opts || {};
    if(!SEASON_VIEW_TITLES[view]) view = 'main';
    if(!opts.silent) haptic([6]);
    const prev = seasonView;
    seasonView = view;
    // the League | Cup bar tucks away for the Schedule and returns with the Season page
    seasonSyncSubnav(typeof ROUTES!=='undefined' && typeof currentRouteIndex!=='undefined' ? ROUTES[currentRouteIndex] : 'league');

    const box = document.getElementById('season-sections');
    if(opts.silent || prev===view || !box || !seasonMotionOk()){
        clearTimeout(seasonSwapTimer);
        if(box) box.classList.remove('sv-out','sv-in','sv-tab');
        seasonApplyView(view, prev);
        return;
    }
    // slide the old view out, swap, slide the new one in (forward = into the Schedule, back = to Season)
    const dir = view==='main' ? -1 : 1;
    box.style.setProperty('--sx', (dir*30)+'px');
    clearTimeout(seasonSwapTimer);
    seasonPlay(box, 'sv-out');
    seasonAnimateTitle(SEASON_VIEW_TITLES[view], 150);
    seasonSwapTimer = setTimeout(()=>{
        // The heavy part (rendering the timetable / history) runs while the box is still invisible (sv-out keeps it
        // at opacity 0). The slide-in and the header morph only start AFTER the new content has been laid out and
        // painted — before, a season with a real timetable made the header appear half-sized and the motion stutter.
        seasonApplyView(view, prev, true);
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
            seasonPlay(box, 'sv-in', 360);
        }));
    }, 160);
}

document.body.dataset.seasonTab = 'league';
seasonSetTab('league', { silent:true });   // League is selected by default
seasonShowView('main', { silent:true });
