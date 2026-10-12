// ============================================================
// season.js  —  SEASON — table, match history, score controls, team picker, team profile modal, admin history, season pill nav, form dots, shared GitHub loaders
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// RENDER — SEASON TABLE  (uses <table> now — no grid bug)
// ============================================================
function renderLeagueTable(dataToRender){
    const loadingEl=document.getElementById('loading-message');
    if(loadingEl)loadingEl.style.display='none';
    const table=Object.values(dataToRender).sort((a,b)=>(b.Pts-a.Pts)||((b.GF-b.GA)-(a.GF-a.GA)));
    const tbody=document.getElementById('league-table-body');
    tbody.innerHTML=table.map((t,i)=>{
        const isFirst=i===0;
        const delay=i*55;
        return`<tr class="${isFirst?'rank-1-row':''}" style="animation-delay:${delay}ms" onclick="showTeamProfile('${t.name}')">
            <td class="td-rank" style="${isFirst?'color:#fbbf24;':''}">${i+1}</td>
            <td class="td-team">
                <div class="td-team-inner">
                    <img src="${teamLogoUrl(t.name)}" onerror="this.style.opacity='0.3'" onload="this.style.opacity='1'">
                    <span style="${isFirst?'color:#fef3c7;':''}">${teamShort(t.name)}</span>
                </div>
            </td>
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

// ============================================================
// RENDER — MATCH HISTORY  (merged into the Season screen; the
// same minimal cards + team-filter chips work for both the live
// current-season feed and any archived season's history)
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
    const prevHidden=window.GlassFX?GlassFX.historyFiltering():new Set();
    document.querySelectorAll('#season-history-filter-bar .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    document.querySelectorAll('#season-history-list .match-card-mini').forEach(card=>{
        const show=filter==='all'||card.dataset.home===filter||card.dataset.away===filter;
        card.classList.toggle('hidden-by-filter',!show);
    });
    updateHistoryLayout(filter);
    updateHistoryDots(filter);
    if(typeof seasonApplyScheduleFilter==='function')seasonApplyScheduleFilter(filter);
    // dynamic background: aurora + summary follow the selected team (js/glass-fx.js)
    if(window.GlassFX)GlassFX.historyFiltered(prevHidden,filter);
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
    history=(typeof seasonPrepareHistory==='function')?seasonPrepareHistory(history):(history||[]);
    const loadingEl=document.getElementById('season-history-loading');
    if(loadingEl)loadingEl.style.display='none';
    buildSeasonHistoryChips();
    currentFilter='all';
    if(typeof seasonApplyScheduleFilter==='function')seasonApplyScheduleFilter('all');
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
        </div>`;
    }).join('');
    if(window.GlassFX)GlassFX.historyRendered();
}

// ============================================================
// TEAM PROFILE
// ============================================================
function showTeamProfile(key){
    haptic([8]);
    const t=leagueData[key];if(!t)return;
    document.getElementById('profile-team-logo').src=`${teamLogoUrl(key)}`;
    document.getElementById('profile-team-name').textContent=TEAM_DISPLAY_NAMES[key];
    document.getElementById('profile-stat-pts').textContent=t.Pts;
    document.getElementById('profile-stat-p').textContent=t.P;
    document.getElementById('profile-stat-w').textContent=t.W;
    document.getElementById('profile-stat-d').textContent=t.D;
    document.getElementById('profile-stat-l').textContent=t.L;
    const gd=t.GF-t.GA;
    document.getElementById('profile-stat-gf').textContent=gd>0?`+${gd}`:gd;
    const last=matchHistory.find(m=>m.home===key||m.away===key);
    const badge=document.getElementById('last-match-result-badge');
    const detail=document.getElementById('last-match-detail');
    badge.className='match-badge';
    if(last){
        const isH=last.home===key;const opp=isH?last.away:last.home;
        const p=last.score.split('-');const myS=isH?parseInt(p[0]):parseInt(p[1]);const opS=isH?parseInt(p[1]):parseInt(p[0]);
        detail.textContent=`vs ${TEAM_DISPLAY_NAMES[opp]} (${myS}-${opS})`;
        if(myS>opS){badge.textContent='WON';badge.classList.add('badge-win');}
        else if(myS<opS){badge.textContent='LOST';badge.classList.add('badge-loss');}
        else{badge.textContent='DRAW';badge.classList.add('badge-draw');}
    } else {badge.textContent='N/A';badge.classList.add('badge-draw');detail.textContent='No matches yet';}
    // Render last 5 matches form dots
    renderFormDots(key);
    document.getElementById('team-profile-modal').classList.add('open');
}
function hideTeamProfile(){haptic([6]);document.getElementById('team-profile-modal').classList.remove('open');}

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
// TEAM FORM DOTS (last 5 matches)
// ============================================================
function renderFormDots(teamKey){
    const games=matchHistory.filter(m=>m.home===teamKey||m.away===teamKey).slice(0,5);
    const container=document.getElementById('team-form-dots');
    if(!container)return;
    if(!games.length){
        container.innerHTML='<span style="font-size:0.7rem;color:#4b5563;">No matches yet</span>';
        return;
    }
    container.innerHTML=games.map(m=>{
        const isHome=m.home===teamKey;
        const p=m.score.split('-');
        const myS=isHome?parseInt(p[0]):parseInt(p[1]);
        const opS=isHome?parseInt(p[1]):parseInt(p[0]);
        let color,letter,title;
        if(myS>opS){ color='#22c55e'; letter='W'; title='Win'; }
        else if(myS<opS){ color='#ef4444'; letter='L'; title='Loss'; }
        else{ color='#9ca3af'; letter='D'; title='Draw'; }
        return `<div title="${title}" style="
            width:30px;height:30px;border-radius:50%;
            background:${color}22;border:2px solid ${color};
            display:flex;align-items:center;justify-content:center;
            font-size:0.62rem;font-weight:900;color:${color};
            box-shadow:0 0 8px ${color}44;
            flex-shrink:0;
        ">${letter}</div>`;
    }).join('');
}

// ============================================================
// GITHUB LOADERS
// ============================================================
async function loadArchiveDropdown(){
    const cached=await idbGet('archivedSeasons','v');
    if(cached) archivedSeasons=cached;
    try{
        const r=await fetch(`${BASE_API}${GITHUB_ARCHIVE_FILE}?ref=${GITHUB_LEAGUE_BRANCH}`);
        if(r.ok){
            const d=await r.json();archiveSha=d.sha;
            archivedSeasons=await(await fetch(d.download_url)).json();
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
        renderLeagueTable(leagueData);
        renderSeasonHistoryList(matchHistory);
        if(typeof seasonLayoutSync==='function')seasonLayoutSync();
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
            renderLeagueTable(ld);
            // Archived seasons get the exact same minimal, filterable
            // match-history list as the current season.
            renderSeasonHistoryList(s.history||[]);
            if(typeof seasonLayoutSync==='function')seasonLayoutSync();
        }
    }
}
async function loadMainLeagueDataFromGitHub(){
    if(!Object.keys(mainLeagueData).length)initializeMainLeagueData();
    const cached=repairMojibake(await idbGet('mainLeagueData','v'));
    if(cached) Object.keys(cached).forEach(k=>{if(mainLeagueData[k])mainLeagueData[k]={...mainLeagueData[k],...cached[k]};});
    if(!navigator.onLine){
        setSyncStatus('offline');
        PROFILE_TEAMS.forEach(ensureWalletFields);
        syncTeamDisplayNames(); // apply any cached custom team name/logo even offline
        return mainLeagueData;
    }
    setSyncStatus('syncing');
    try{
        const r=await fetch(`${BASE_API}${GITHUB_MAIN_LEAGUE_FILE}?ref=${GITHUB_LEAGUE_BRANCH}`);
        if(r.ok){
            const d=await r.json();mainSha=d.sha;
            const c=repairMojibake(await(await fetch(d.download_url)).json());
            Object.keys(c).forEach(k=>{if(mainLeagueData[k])mainLeagueData[k]={...mainLeagueData[k],...c[k]};});
            await idbSet('mainLeagueData','v',c);
        }
        setSyncStatus('synced');
    }catch(e){ setSyncStatus(cached?'offline':'error'); }
    PROFILE_TEAMS.forEach(ensureWalletFields); // backfills the wallet shape for any team the file predates
    syncTeamDisplayNames(); // reflect any team's custom name/logo everywhere that reads TEAM_DISPLAY_NAMES/teamLogoUrl
    return mainLeagueData;
}

