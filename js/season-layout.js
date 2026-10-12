// ============================================================
// season-layout.js  —  SEASON PANEL LAYOUT (per-device preference)
// ------------------------------------------------------------
// The Season screen has three sections: League table, CUP, Schedule.
//
//   mode 'single' (default) — everything on ONE page, stacked in the chosen order.
//                             Match history is merged into the Schedule section:
//                             played fixtures show their score + date, and the old
//                             history list only keeps matches that are NOT part of
//                             the schedule (played before it existed / archived seasons).
//   mode 'tabs'             — the classic League | CUP | Schedule switch, with the
//                             match history list under the League table.
//
// Both the mode and the section order are chosen in Settings → "Season Panel Layout"
// and stored in localStorage ('seasonLayout', 'seasonOrder'). The same DOM elements
// are used in both modes — this file only moves them around and toggles a body class.
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================

const SEASON_SECTIONS = {
    league:   { label:'League table',        tab:'League',   icon:'fa-table' },
    mba:      { label:'CUP',                 tab:'CUP',      icon:'fa-trophy' },
    schedule: { label:'Schedule & results',  tab:'Schedule', icon:'fa-calendar-days' }
};
const SEASON_DEFAULT_ORDER = ['league','mba','schedule'];   // = the classic tab order
const SEASON_LAYOUT_DEFAULT = 'single';

let seasonLayoutMode = (()=>{ try{ return localStorage.getItem('seasonLayout')==='tabs' ? 'tabs' : SEASON_LAYOUT_DEFAULT; }catch(e){ return SEASON_LAYOUT_DEFAULT; } })();
let seasonSectionOrder = (()=>{
    try{
        const v = JSON.parse(localStorage.getItem('seasonOrder'));
        if(Array.isArray(v) && v.length===3 && SEASON_DEFAULT_ORDER.every(k=>v.includes(k))) return v;
    }catch(e){}
    return [...SEASON_DEFAULT_ORDER];
})();

function seasonIsSingle(){ return document.body.classList.contains('season-single'); }
function seasonSave(){
    try{
        localStorage.setItem('seasonLayout', seasonLayoutMode);
        localStorage.setItem('seasonOrder', JSON.stringify(seasonSectionOrder));
    }catch(e){}
}

// ------------------------------------------------------------
// Apply the layout (moves the shared elements, sets the order)
// ------------------------------------------------------------
function applySeasonLayout(opts){
    opts = opts || {};
    const single = seasonLayoutMode==='single';
    const $ = id => document.getElementById(id);
    document.body.classList.toggle('season-single', single);

    // order: sections (one page) + segmented buttons (tabs) follow the same list
    seasonSectionOrder.forEach((key,i)=>{
        const sec = document.querySelector(`#season-sections > section[data-sec="${key}"]`);
        if(sec) sec.style.order = i;
        const btn = document.querySelector(`#season-view-switch .segmented-btn[data-value="${key}"]`);
        if(btn) btn.style.order = i;
    });

    const header = document.querySelector('#league-table-screen .league-header');
    const sel = $('season-selector');
    const leagueNav = $('season-nav-wrapper'), mbaNav = $('mba-nav-wrapper');
    const histSec = $('season-history-section'), bar = $('season-history-filter-bar');

    if(single){
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
        document.body.classList.remove('season-single');
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

// What the history list should contain. In one-page mode, matches that are already
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
    const modeBtn = (val,icon,label)=>`<button class="segmented-btn${seasonLayoutMode===val?' active':''}" onclick="setSeasonLayoutMode('${val}')"><i class="fas ${icon}"></i> ${label}</button>`;
    const rows = seasonSectionOrder.map((key,i)=>{
        const s = SEASON_SECTIONS[key];
        const name = seasonLayoutMode==='tabs' ? s.tab : s.label;
        return `<div class="sl-row">
            <div class="sl-row-icon"><i class="fas ${s.icon}"></i></div>
            <div class="sl-row-name">${name}</div>
            <button class="sl-move" ${i===0?'disabled':''} onclick="moveSeasonSection(${i},-1)" aria-label="Move up"><i class="fas fa-chevron-up"></i></button>
            <button class="sl-move" ${i===seasonSectionOrder.length-1?'disabled':''} onclick="moveSeasonSection(${i},1)" aria-label="Move down"><i class="fas fa-chevron-down"></i></button>
        </div>`;
    }).join('');
    const isDefault = seasonSectionOrder.every((k,i)=>k===SEASON_DEFAULT_ORDER[i]);
    el.innerHTML = `
        <div class="sl-label">Layout</div>
        <div class="segmented-control">${modeBtn('single','fa-layer-group','One page')}${modeBtn('tabs','fa-table-columns','Separate tabs')}</div>
        <p class="sl-hint">${seasonLayoutMode==='single'
            ? 'League table, CUP and the schedule are on one page. Match history is merged into the schedule: every played game shows its score and date.'
            : 'The classic view: League, CUP and Schedule are separate tabs, and the match history sits under the League table.'}</p>
        <div class="sl-label">${seasonLayoutMode==='single' ? 'Order on the page' : 'Order of the tabs'}</div>
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
    if(mode!=='single' && mode!=='tabs') return;
    seasonLayoutMode = mode; seasonSave();
    applySeasonLayout();
    renderSeasonLayoutSheet();
    showToast(mode==='single' ? 'Season: one page' : 'Season: separate tabs','info',1600);
}
function moveSeasonSection(i, dir){
    haptic([6]);
    const j = i + dir;
    if(j<0 || j>=seasonSectionOrder.length) return;
    [seasonSectionOrder[i], seasonSectionOrder[j]] = [seasonSectionOrder[j], seasonSectionOrder[i]];
    seasonSave();
    applySeasonLayout();
    renderSeasonLayoutSheet();
}
function resetSeasonOrder(){
    haptic([8]);
    seasonSectionOrder = [...SEASON_DEFAULT_ORDER]; seasonSave();
    applySeasonLayout();
    renderSeasonLayoutSheet();
}

applySeasonLayout({ initial:true });   // apply the saved choice on startup
