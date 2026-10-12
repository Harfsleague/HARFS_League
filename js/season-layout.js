// ============================================================
// season-layout.js  —  SEASON PANEL LAYOUT (per-device preference)
// ------------------------------------------------------------
// The Season screen has these sections: League table, CUP, Schedule
// (+ the match history, which is merged into the schedule).
//
//   mode 'pages' (default) — TWO pages with a switch at the top:
//        • "League & CUP"        = league table + CUP bracket together
//        • "Schedule & Results"  = schedule + match history together.
//                                  Played fixtures show their score + date, and
//                                  the history list only keeps matches that are
//                                  NOT part of the schedule (played before it
//                                  existed / archived seasons).
//   mode 'tabs'            — the classic League | CUP | Schedule switch, with the
//                            match history list under the League table.
//
// The mode, the order of the tabs and the order of the two pages are chosen in
// Settings → "Season Panel Layout" and stored in localStorage
// ('seasonLayout', 'seasonOrder', 'seasonPages'). The same DOM elements are used
// in both modes — this file only moves them around and toggles body classes.
// (An old saved value 'single' = the former one-page mode now opens as 'pages'.)
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================

const SEASON_SECTIONS = {
    league:   { label:'League table',        tab:'League',   icon:'fa-table' },
    mba:      { label:'CUP',                 tab:'CUP',      icon:'fa-trophy' },
    schedule: { label:'Schedule & results',  tab:'Schedule', icon:'fa-calendar-days' }
};
const SEASON_PAGES = {
    standings: { label:'League & CUP',         icon:'fa-table' },
    matches:   { label:'Schedule & Results',   icon:'fa-calendar-days' }
};
const SEASON_DEFAULT_ORDER = ['league','mba','schedule'];   // = the classic tab order
const SEASON_DEFAULT_PAGES = ['standings','matches'];
const SEASON_LAYOUT_DEFAULT = 'pages';

let seasonLayoutMode = (()=>{ try{ return localStorage.getItem('seasonLayout')==='tabs' ? 'tabs' : SEASON_LAYOUT_DEFAULT; }catch(e){ return SEASON_LAYOUT_DEFAULT; } })();
let seasonSectionOrder = (()=>{
    try{
        const v = JSON.parse(localStorage.getItem('seasonOrder'));
        if(Array.isArray(v) && v.length===3 && SEASON_DEFAULT_ORDER.every(k=>v.includes(k))) return v;
    }catch(e){}
    return [...SEASON_DEFAULT_ORDER];
})();
let seasonPageOrder = (()=>{
    try{
        const v = JSON.parse(localStorage.getItem('seasonPages'));
        if(Array.isArray(v) && v.length===2 && SEASON_DEFAULT_PAGES.every(k=>v.includes(k))) return v;
    }catch(e){}
    return [...SEASON_DEFAULT_PAGES];
})();
let seasonPage = seasonPageOrder[0];   // page shown right now (pages mode) — opens on the first page of the chosen order

// "merged" layout = pages mode. (name kept for the callers in js/flow.js, js/mba.js, js/season.js)
function seasonIsSingle(){ return document.body.classList.contains('season-pages'); }
function seasonSave(){
    try{
        localStorage.setItem('seasonLayout', seasonLayoutMode);
        localStorage.setItem('seasonOrder', JSON.stringify(seasonSectionOrder));
        localStorage.setItem('seasonPages', JSON.stringify(seasonPageOrder));
    }catch(e){}
}

// ------------------------------------------------------------
// Apply the layout (moves the shared elements, sets the order)
// ------------------------------------------------------------
function applySeasonLayout(opts){
    opts = opts || {};
    const pages = seasonLayoutMode==='pages';
    const $ = id => document.getElementById(id);
    document.body.classList.toggle('season-pages', pages);
    if(!seasonPageOrder.includes(seasonPage)) seasonPage = seasonPageOrder[0];
    document.body.dataset.seasonPage = seasonPage;

    // order: in pages mode the CUP always sits right under the league table; in tabs mode the chosen order is used
    const secOrder = pages ? ['league','mba','schedule'] : seasonSectionOrder;
    secOrder.forEach((key,i)=>{
        const sec = document.querySelector(`#season-sections > section[data-sec="${key}"]`);
        if(sec) sec.style.order = i;
        const btn = document.querySelector(`#season-view-switch .segmented-btn[data-value="${key}"]`);
        if(btn) btn.style.order = i;
    });
    seasonPageOrder.forEach((key,i)=>{
        const btn = document.querySelector(`#season-page-switch .segmented-btn[data-page="${key}"]`);
        if(btn) btn.style.order = i;
    });
    document.querySelectorAll('#season-page-switch .segmented-btn').forEach(b=>b.classList.toggle('active', b.dataset.page===seasonPage));

    const header = document.querySelector('#league-table-screen .league-header');
    const sel = $('season-selector');
    const leagueNav = $('season-nav-wrapper'), mbaNav = $('mba-nav-wrapper');
    const histSec = $('season-history-section'), bar = $('season-history-filter-bar');

    if(pages){
        if(leagueNav && $('ssec-league-nav')) $('ssec-league-nav').appendChild(leagueNav);
        if(mbaNav && $('ssec-mba-nav')) $('ssec-mba-nav').appendChild(mbaNav);
        if(bar && $('ssec-schedule-filter')) $('ssec-schedule-filter').appendChild(bar);
        if(histSec && $('ssec-history-slot')) $('ssec-history-slot').appendChild(histSec);
        if(leagueNav) leagueNav.style.display = 'flex';
        if(mbaNav) mbaNav.style.display = 'flex';
        ['season-league-body','mba-season-body'].forEach(id=>{ const e=$(id); if(e) e.style.display='block'; });
        const t = $('season-screen-title'); if(t) t.textContent = 'Season';
        const dt = $('current-datetime'); if(dt) dt.style.display = '';
    } else {
        // back to the classic arrangement
        if(header && sel){
            if(leagueNav) header.insertBefore(leagueNav, sel);
            if(mbaNav) header.insertBefore(mbaNav, sel);
        }
        const card = histSec && histSec.querySelector('.season-history-card');
        const list = $('season-history-list');
        if(card && list && bar) card.insertBefore(bar, list);
        const lb = $('season-league-body');
        if(lb && histSec) lb.appendChild(histSec);
        const sb = $('schedule-season-body'); if(sb) sb.style.display = 'none';
        // open on the first tab in the chosen order
        document.body.classList.remove('season-pages');
        try{ if(typeof switchSeasonView==='function') switchSeasonView(seasonSectionOrder[0]); }catch(e){ console.warn('season tab init',e); }
    }

    if(!opts.initial){
        if(typeof renderMbaSeasonView==='function') renderMbaSeasonView();
        if(typeof renderFlowSchedule==='function') renderFlowSchedule();
        if(typeof loadSelectedSeason==='function' && typeof seasonOptions!=='undefined' && seasonOptions[currentSeasonIdx]){
            loadSelectedSeason(seasonOptions[currentSeasonIdx].value);
        }
    }
    seasonLayoutSync();
}

// Two-page mode: flip between "League & CUP" and "Schedule & Results".
function switchSeasonPage(page){
    if(!SEASON_PAGES[page]) return;
    haptic([6]);
    seasonPage = page;
    document.body.dataset.seasonPage = page;
    document.querySelectorAll('#season-page-switch .segmented-btn').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
    try{ window.scrollTo({ top:0 }); const sc=document.getElementById('league-table-screen'); if(sc) sc.scrollTop = 0; }catch(e){}
}

// ------------------------------------------------------------
// Keep the merged "Schedule & results" section consistent.
// rerenderHistory: also rebuild the history list (flow data changed).
// ------------------------------------------------------------
function seasonLayoutSync(rerenderHistory){
    if(!seasonIsSingle()){ seasonApplyScheduleFilter('all'); return; }
    const sb = document.getElementById('schedule-season-body');
    // the schedule belongs to the CURRENT season; an archived season only has its history list
    if(sb) sb.style.display = (typeof isViewingArchive!=='undefined' && isViewingArchive) ? 'none' : 'block';
    if(rerenderHistory===true && !(typeof isViewingArchive!=='undefined' && isViewingArchive) && typeof renderSeasonHistoryList==='function'){
        renderSeasonHistoryList(matchHistory);
    }
    seasonApplyScheduleFilter();
}

// What the history list should contain. On the merged page, matches that are already
// shown as scored fixtures in the schedule are not listed a second time.
function seasonPrepareHistory(history){
    history = history || [];
    const sec = document.getElementById('season-history-section');
    const title = document.getElementById('season-history-title');
    const archived = (typeof isViewingArchive!=='undefined') && isViewingArchive;
    const merged = seasonIsSingle() && !archived && typeof flowCur==='function' && !!flowCur();
    const out = merged ? history.filter(m=>!m.fx) : history;
    if(sec) sec.style.display = (merged && !out.length) ? 'none' : '';
    if(title) title.innerHTML = '<i class="fas fa-history"></i> ' + (merged ? 'Earlier matches' : 'Match History');
    return out;
}

// Team filter chips also dim the other teams' fixtures in the schedule.
function seasonApplyScheduleFilter(filter){
    filter = filter || (typeof currentFilter!=='undefined' ? currentFilter : 'all') || 'all';
    const on = seasonIsSingle() && filter!=='all';
    document.querySelectorAll('#schedule-season-body [data-home]').forEach(el=>{
        const inner = el.classList.contains('flow-fixture-wrap');
        if(!inner && el.closest('.flow-fixture-wrap')) return; // the wrapper carries the dimming
        const show = !on || el.dataset.home===filter || el.dataset.away===filter;
        el.classList.toggle('fx-dim', !show);
    });
}

// ------------------------------------------------------------
// Settings → "Season Panel Layout"
// ------------------------------------------------------------
function renderSeasonLayoutSheet(){
    const el = document.getElementById('season-layout-body'); if(!el) return;
    const pages = seasonLayoutMode==='pages';
    const modeBtn = (val,icon,label)=>`<button class="segmented-btn${seasonLayoutMode===val?' active':''}" onclick="setSeasonLayoutMode('${val}')"><i class="fas ${icon}"></i> ${label}</button>`;
    const list = pages ? seasonPageOrder : seasonSectionOrder;
    const rows = list.map((key,i)=>{
        const s = pages ? SEASON_PAGES[key] : SEASON_SECTIONS[key];
        const name = pages ? s.label : s.tab;
        return `<div class="sl-row">
            <div class="sl-row-icon"><i class="fas ${s.icon}"></i></div>
            <div class="sl-row-name">${name}</div>
            <button class="sl-move" ${i===0?'disabled':''} onclick="moveSeasonSection(${i},-1)" aria-label="Move up"><i class="fas fa-chevron-up"></i></button>
            <button class="sl-move" ${i===list.length-1?'disabled':''} onclick="moveSeasonSection(${i},1)" aria-label="Move down"><i class="fas fa-chevron-down"></i></button>
        </div>`;
    }).join('');
    const isDefault = pages ? seasonPageOrder.every((k,i)=>k===SEASON_DEFAULT_PAGES[i]) : seasonSectionOrder.every((k,i)=>k===SEASON_DEFAULT_ORDER[i]);
    el.innerHTML = `
        <div class="sl-label">Layout</div>
        <div class="segmented-control">${modeBtn('pages','fa-clone','Two pages')}${modeBtn('tabs','fa-table-columns','Separate tabs')}</div>
        <p class="sl-hint">${pages
            ? 'Two pages: League table + CUP together, and the schedule + match history together (every played game shows its score and date).'
            : 'The classic view: League, CUP and Schedule are separate tabs, and the match history sits under the League table.'}</p>
        <div class="sl-label">${pages ? 'Order of the pages' : 'Order of the tabs'}</div>
        <div class="sl-list">${rows}</div>
        <button class="glass-button w-full text-xs font-bold py-3 mt-3" ${isDefault?'disabled':''} onclick="resetSeasonOrder()"><i class="fas fa-rotate-left mr-2"></i>Reset order</button>`;
}
function openSeasonLayoutSheet(){
    haptic([6]);
    renderSeasonLayoutSheet();
    document.getElementById('season-layout-sheet').classList.add('open');
}
function closeSeasonLayoutSheet(){
    const sh = document.getElementById('season-layout-sheet');
    if(sh) sh.classList.remove('open');
}
function setSeasonLayoutMode(mode){
    haptic([8]);
    if(mode!=='pages' && mode!=='tabs') return;
    seasonLayoutMode = mode; seasonSave();
    applySeasonLayout();
    renderSeasonLayoutSheet();
    showToast(mode==='pages' ? 'Season: two pages' : 'Season: separate tabs','info',1600);
}
function moveSeasonSection(i, dir){
    haptic([6]);
    const list = seasonLayoutMode==='pages' ? seasonPageOrder : seasonSectionOrder;
    const j = i + dir;
    if(j<0 || j>=list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    seasonSave();
    applySeasonLayout();
    renderSeasonLayoutSheet();
}
function resetSeasonOrder(){
    haptic([8]);
    if(seasonLayoutMode==='pages') seasonPageOrder = [...SEASON_DEFAULT_PAGES];
    else seasonSectionOrder = [...SEASON_DEFAULT_ORDER];
    seasonSave();
    applySeasonLayout();
    renderSeasonLayoutSheet();
}

applySeasonLayout({ initial:true });   // apply the saved choice on startup
