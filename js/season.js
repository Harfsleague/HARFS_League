// ============================================================
// season.js  —  SEASON — table, match history, score controls, team picker, team profile modal, admin history, season pill nav, form dots, shared GitHub loaders
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// RENDER — SEASON TABLE  (uses <table> now — no grid bug)
// ============================================================
function renderLeagueTable(dataToRender, historyForForm){
    const loadingEl=document.getElementById('loading-message');
    if(loadingEl)loadingEl.style.display='none';
    // last-5 form comes from the history of the season being shown (current by default, the archived one when browsing the archive)
    const formSource=historyForForm||matchHistory||[];
    const table=Object.values(dataToRender).sort((a,b)=>(b.Pts-a.Pts)||((b.GF-b.GA)-(a.GF-a.GA)));
    const tbody=document.getElementById('league-table-body');
    tbody.innerHTML=table.map((t,i)=>{
        const isFirst=i===0;
        const delay=i*55;
        return`<tr class="${isFirst?'rank-1-row':''}" style="animation-delay:${delay}ms">
            <td class="td-rank" style="${isFirst?'color:#fbbf24;':''}">${i+1}</td>
            <td class="td-team">
                <div class="td-team-inner">
                    <img src="${teamLogoUrl(t.name)}" onerror="this.style.opacity='0.3'" onload="this.style.opacity='1'">
                    <span style="${isFirst?'color:#fef3c7;':''}">${teamShort(t.name)}</span>
                </div>
            </td>
            <td class="td-form">${formStripHtml(t.name,formSource)}</td>
            <td>${t.P}</td>
            <td class="td-w">${t.W}</td>
            <td>${t.D}</td>
            <td class="td-l">${t.L}</td>
            <td class="td-gf">${t.GF}</td>
            <td class="td-ga">${t.GA}</td>
            <td class="td-gd">${t.GF-t.GA}</td>
            <td class="td-pts">${t.Pts}</td>
        </tr>`;
    }).join('');
}

// Last 5 results of a team as tiny dots stacked vertically (newest on top).
// Sits between the team name and P in the league table. history is newest-first.
function formStripHtml(teamKey,history){
    const games=(history||[]).filter(m=>m.home===teamKey||m.away===teamKey).slice(0,5);
    if(!games.length)return'';
    return`<div class="form-strip">${games.map(m=>{
        const isHome=m.home===teamKey;
        const p=String(m.score).split('-');
        const myS=isHome?parseInt(p[0]):parseInt(p[1]);
        const opS=isHome?parseInt(p[1]):parseInt(p[0]);
        const res=myS>opS?'w':(myS<opS?'l':'d');
        return`<i class="fd fd-${res}" title="${res==='w'?'Win':(res==='l'?'Loss':'Draw')}"></i>`;
    }).join('')}</div>`;
}

// ============================================================
// RENDER — MATCH HISTORY  (Season → Results; the same minimal cards +
// team-filter chips work for both the live current-season feed and any
// archived season's history)
// ============================================================
function buildSeasonHistoryChips(){
    const bar=document.getElementById('season-history-filter-bar');
    if(!bar)return;
    bar.innerHTML=`<div class="chip active" onclick="filterSeasonHistory('all',this)">All</div>`;
    TEAM_NAMES.forEach(t=>{
        const c=document.createElement('div');
        c.className='chip';c.textContent=teamShort(t);
        c.onclick=function(){filterSeasonHistory(t,this);};bar.appendChild(c);
    });
}
function filterSeasonHistory(filter,chip){
    haptic([6]);currentFilter=filter;
    const prevHidden=window.HistoryFX?HistoryFX.historyFiltering():new Set();
    document.querySelectorAll('#season-history-filter-bar .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    document.querySelectorAll('#season-history-list .match-card-mini').forEach(card=>{
        const show=filter==='all'||card.dataset.home===filter||card.dataset.away===filter;
        card.classList.toggle('hidden-by-filter',!show);
    });
    updateHistoryLayout(filter);
    updateHistoryDots(filter);
    // dynamic background: aurora + summary follow the selected team (js/match-history-fx.js)
    if(window.HistoryFX)HistoryFX.historyFiltered(prevHidden,filter);
}

// Puts the SELECTED team on the left of every match card (this format has no
// home/away concept, so when a team is filtered it should always lead) and
// flips the score to match — their score first. On "all" it falls back to
// the original stored home/away order.
function updateHistoryLayout(filter){
    document.querySelectorAll('#season-history-list .match-card-mini').forEach(card=>{
        const row=card.querySelector('.mcm-row');
        if(!row)return;
        const home=card.dataset.home,away=card.dataset.away;
        const hs=parseInt(card.dataset.hs),as=parseInt(card.dataset.as);
        let leftTeam=home,leftScore=hs,rightTeam=away,rightScore=as;
        if(filter!=='all'&&away===filter&&home!==filter){
            leftTeam=away;leftScore=as;rightTeam=home;rightScore=hs;
        }
        row.innerHTML=`
            <div class="mcm-team">
                <img src="${teamLogoUrl(leftTeam)}" onerror="this.style.opacity='0.3'" onload="this.style.opacity='1'">
                <span>${teamShort(leftTeam)}</span>
            </div>
            <div class="mcm-score">${leftScore}-${rightScore}</div>
            <div class="mcm-team mcm-team-away">
                <span>${teamShort(rightTeam)}</span>
                <img src="${teamLogoUrl(rightTeam)}" onerror="this.style.opacity='0.3'" onload="this.style.opacity='1'">
            </div>`;
    });
}

// Colors each match card's dot based on the RESULT OF THE SELECTED TEAM
// (not home/away — this format has no home/away concept). Hidden entirely
// when no specific team is selected (filter === 'all').
function updateHistoryDots(filter){
    // No dots/stripes any more: with a team filter active, the whole match block
    // takes that team's result colour (data-res, styled in css/styles.css).
    document.querySelectorAll('#season-history-list .match-card-mini').forEach(card=>{
        if(filter==='all'){delete card.dataset.res;return;}
        const home=card.dataset.home,away=card.dataset.away;
        const hs=parseInt(card.dataset.hs),as=parseInt(card.dataset.as);
        let t,o;
        if(home===filter){t=hs;o=as;}
        else if(away===filter){t=as;o=hs;}
        else{delete card.dataset.res;return;}
        card.dataset.res=t>o?'win':(t<o?'loss':'draw');
    });
}

function renderSeasonHistoryList(history){
    history=history||[];
    // Same data as what is already drawn → keep the DOM (rebuilding it + HistoryFX re-sampling is what made page switches stutter)
    const sigList=document.getElementById('season-history-list');
    const sig=history.map(m=>`${m.timestamp}|${m.score}|${m.home}|${m.away}|${m.cards?JSON.stringify(m.cards):''}`).join(';')+'#'+TEAM_NAMES.map(t=>teamShort(t)).join(',');
    if(sigList && sigList.__sig===sig && sigList.children.length) return;
    if(sigList) sigList.__sig=sig;
    const loadingEl=document.getElementById('season-history-loading');
    if(loadingEl)loadingEl.style.display='none';
    buildSeasonHistoryChips();
    currentFilter='all';
    const list=document.getElementById('season-history-list');
    if(!list)return;
    if(!history.length){
        list.innerHTML='<div style="text-align:center;padding:26px 0;color:#374151;"><i class="fas fa-futbol" style="font-size:1.6rem;display:block;margin-bottom:6px;opacity:0.3;"></i><p style="font-size:0.8rem;">No matches yet</p></div>';
        return;
    }
    list.innerHTML=history.map((m,idx)=>{
        const dt=formatShamsiDateTime(m.timestamp);
        const parts=m.score.split('-');
        const hs=parseInt(parts[0]),as=parseInt(parts[1]);
        return`<div class="match-card-mini" data-home="${m.home}" data-away="${m.away}" data-hs="${hs}" data-as="${as}">
            <div class="mcm-date">${dt.date} · ${dt.time}${m.round?` · MW${m.round}`:''}</div>
            <div class="mcm-row">
                <div class="mcm-team">
                    <img src="${teamLogoUrl(m.home)}" onerror="this.style.opacity='0.3'" onload="this.style.opacity='1'">
                    <span>${teamShort(m.home)}</span>
                </div>
                <div class="mcm-score">${m.score}</div>
                <div class="mcm-team mcm-team-away">
                    <span>${teamShort(m.away)}</span>
                    <img src="${teamLogoUrl(m.away)}" onerror="this.style.opacity='0.3'" onload="this.style.opacity='1'">
                </div>
            </div>
            ${typeof cardsGameHtml==='function' ? cardsGameHtml(m.cards) : ''}
        </div>`;
    }).join('');
    // card pictures need the deck: load it once, then draw the list again
    if(history.some(m=>m && m.cards) && typeof cardsEnsureLoaded==='function') cardsEnsureLoaded(()=>renderSeasonHistoryList(history));
    if(window.HistoryFX)HistoryFX.historyRendered();
}

// ============================================================
// ADMIN HISTORY
// ============================================================
function renderAdminHistory(h){
    document.getElementById('admin-history-list').innerHTML=h.length
        ?h.map((m,i)=>`
            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);padding:10px 12px;border-radius:12px;gap:8px;">
                <span style="font-size:0.75rem;font-weight:700;color:#d1d5db;">${m.round?`<span style="font-size:0.6rem;color:#6b7280;margin-right:6px;">MW${m.round}</span>`:''}${teamShort(m.home)}
                    <span style="color:#fbbf24;margin:0 6px;padding:2px 6px;background:rgba(0,0,0,0.3);border-radius:6px;">${m.score}</span>
                ${teamShort(m.away)}</span>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <button style="background:rgba(96,165,250,0.12);color:#93c5fd;border:none;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:0.7rem;" onclick="editMatch(${i})">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button style="background:rgba(239,68,68,0.12);color:#f87171;border:none;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:0.7rem;" onclick="deleteMatch(${i})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`).join('')
        :'<div style="text-align:center;color:#374151;font-size:0.75rem;padding:16px 0;">No matches yet</div>';
}

// ============================================================
// SEASON PILL NAVIGATION
// ============================================================
let seasonOptions=[{value:'current',label:'Current Season'}]; // built from archive
let currentSeasonIdx=0; // index into seasonOptions

function syncSeasonPill(){
    const opt=seasonOptions[currentSeasonIdx];
    const lbl=document.getElementById('season-pill-label');
    if(lbl)lbl.textContent=opt?opt.label:'Current Season';
    const prevBtn=document.getElementById('season-prev-btn');
    const nextBtn=document.getElementById('season-next-btn');
    if(prevBtn)prevBtn.style.opacity=currentSeasonIdx===0?'0.3':'1';
    if(nextBtn)nextBtn.style.opacity=currentSeasonIdx===seasonOptions.length-1?'0.3':'1';
}

function navigateSeason(dir){
    haptic([6]);
    const newIdx=currentSeasonIdx+dir;
    if(newIdx<0||newIdx>=seasonOptions.length)return;
    currentSeasonIdx=newIdx;
    syncSeasonPill();
    const opt=seasonOptions[currentSeasonIdx];
    // sync hidden select
    const sel=document.getElementById('season-selector');
    if(sel)sel.value=opt.value;
    loadSelectedSeason(opt.value);
}

function openSeasonPicker(){
    haptic([6]);
    if(seasonOptions.length<=1){showToast('No archived seasons yet','info');return;}
    // Same list style as the CUP edition picker (js/mba.js): a centered modal with playlist-style rows.
    document.getElementById('season-picker-list').innerHTML=seasonOptions.map((opt,idx)=>`
        <div class="playlist-track-item ${idx===currentSeasonIdx?'playing':''}" onclick="selectSeasonFromPicker(${idx})">
            <div class="playlist-track-icon"><i class="fas fa-calendar-alt"></i></div>
            <div class="playlist-track-title">${escapeHtml(opt.label)}</div>
        </div>`).join('');
    document.getElementById('season-picker-sheet').classList.add('open');
}
function closeSeasonPicker(){
    const sh=document.getElementById('season-picker-sheet');
    if(sh)sh.classList.remove('open');
}

function selectSeasonFromPicker(idx){
    haptic([8]);
    currentSeasonIdx=idx;
    syncSeasonPill();
    const opt=seasonOptions[idx];
    const sel=document.getElementById('season-selector');
    if(sel)sel.value=opt.value;
    loadSelectedSeason(opt.value);
    closeSeasonPicker();
}

// ============================================================
// GITHUB LOADERS
// ============================================================
async function loadArchiveDropdown(){
    const cached=await idbGet('archivedSeasons','v');
    if(cached) archivedSeasons=cached;
    try{
        const j=await ghFetchJson(GITHUB_ARCHIVE_FILE);
        if(j.ok){
            archiveSha=j.sha;
            archivedSeasons=j.data;
            await idbSet('archivedSeasons','v',archivedSeasons);
            const sel=document.getElementById('season-selector');
            sel.innerHTML='<option value="current">Current Season</option>';
            // Build seasonOptions for pill nav (current first, then archived newest→oldest)
            seasonOptions=[{value:'current',label:'Current Season'}];
            [...archivedSeasons].reverse().forEach(s=>{
                sel.innerHTML+=`<option value="${s.seasonId}">Season ${s.seasonId}</option>`;
                seasonOptions.push({value:String(s.seasonId),label:`Season ${s.seasonId}`});
            });
            currentSeasonIdx=0;
            syncSeasonPill();
        }
    }catch(e){console.log("No archives yet");}
}
function loadSelectedSeason(val){
    if(val==='current'){
        isViewingArchive=false;
        updateCurrentDateTime();
        renderLeagueTable(leagueData,matchHistory);
        renderSeasonHistoryList(matchHistory);
        if(typeof mbaFollowSeason==='function')mbaFollowSeason('current');
    } else {
        isViewingArchive=true;
        const s=archivedSeasons.find(s=>s.seasonId==val);
        if(s){
            const d=new Date(s.date);
            const fa=d.toLocaleDateString('fa-IR',{year:'numeric',month:'numeric',day:'numeric'});
            const parts=toEnglishDigits(fa).split('/');
            const el=document.getElementById('current-datetime');
            if(el)el.innerHTML=`<i class="far fa-calendar-check mr-1"></i>Ended: ${parts[2]} ${J_MONTHS_EN[parseInt(parts[1],10)-1]} ${parts[0]}`;
            const ld={};s.table.forEach(t=>ld[t.name]=t);
            renderLeagueTable(ld,s.history||[]);
            if(typeof mbaFollowSeason==='function')mbaFollowSeason(s);
            // Archived seasons get the exact same minimal, filterable
            // match-history list as the current season.
            renderSeasonHistoryList(s.history||[]);
            }
    }
}
// onCached (optional): called right after the locally cached copy has been merged in and BEFORE any network
// request — main.js uses it so the startup animation never has to wait for the network.
async function loadMainLeagueDataFromGitHub(onCached){
    if(!Object.keys(mainLeagueData).length)initializeMainLeagueData();
    const cached=repairMojibake(await idbGet('mainLeagueData','v'));
    if(cached) Object.keys(cached).forEach(k=>{if(mainLeagueData[k])mainLeagueData[k]={...mainLeagueData[k],...cached[k]};});
    if(cached && typeof onCached==='function'){ try{ syncTeamDisplayNames(); }catch(e){} try{ onCached(); }catch(e){} }
    if(!navigator.onLine){
        setSyncStatus('offline');
        PROFILE_TEAMS.forEach(ensureWalletFields);
        syncTeamDisplayNames(); // apply any cached custom team name/logo even offline
        return mainLeagueData;
    }
    setSyncStatus('syncing');
    try{
        const j=await ghFetchJson(GITHUB_MAIN_LEAGUE_FILE);
        if(j.ok){
            mainSha=j.sha;
            const c=repairMojibake(j.data);
            Object.keys(c).forEach(k=>{if(mainLeagueData[k])mainLeagueData[k]={...mainLeagueData[k],...c[k]};});
            await idbSet('mainLeagueData','v',c);
        }
        setSyncStatus('synced');
    }catch(e){ setSyncStatus(cached?'offline':'error'); }
    PROFILE_TEAMS.forEach(ensureWalletFields); // backfills the wallet shape for any team the file predates
    syncTeamDisplayNames(); // reflect any team's custom name/logo everywhere that reads TEAM_DISPLAY_NAMES/teamLogoUrl
    return mainLeagueData;
}

