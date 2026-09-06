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
                    <img src="${GITHUB_IMAGE_BASE_URL}${t.name}.png" onerror="this.style.opacity='0.3'">
                    <span style="${isFirst?'color:#fef3c7;':''}">${TEAM_DISPLAY_NAMES[t.name]}</span>
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
        c.className='chip';c.textContent=TEAM_DISPLAY_NAMES[t];
        c.onclick=function(){filterSeasonHistory(t,this);};bar.appendChild(c);
    });
}
function filterSeasonHistory(filter,chip){
    haptic([6]);currentFilter=filter;
    document.querySelectorAll('#season-history-filter-bar .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    document.querySelectorAll('#season-history-list .match-card-mini').forEach(card=>{
        const show=filter==='all'||card.dataset.home===filter||card.dataset.away===filter;
        card.classList.toggle('hidden-by-filter',!show);
    });
    updateHistoryLayout(filter);
    updateHistoryDots(filter);
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
                <img src="${GITHUB_IMAGE_BASE_URL}${leftTeam}.png" onerror="this.style.opacity='0.3'">
                <span>${TEAM_DISPLAY_NAMES[leftTeam]||leftTeam}</span>
            </div>
            <div class="mcm-score">${leftScore}-${rightScore}</div>
            <div class="mcm-team mcm-team-away">
                <span>${TEAM_DISPLAY_NAMES[rightTeam]||rightTeam}</span>
                <img src="${GITHUB_IMAGE_BASE_URL}${rightTeam}.png" onerror="this.style.opacity='0.3'">
            </div>`;
    });
}

// Colors each match card's dot based on the RESULT OF THE SELECTED TEAM
// (not home/away — this format has no home/away concept). Hidden entirely
// when no specific team is selected (filter === 'all').
function updateHistoryDots(filter){
    document.querySelectorAll('#season-history-list .match-card-mini').forEach(card=>{
        const dotEl=card.querySelector('.mcm-dot');
        if(!dotEl)return;
        if(filter==='all'){
            dotEl.style.display='none';
            return;
        }
        const home=card.dataset.home,away=card.dataset.away;
        const hs=parseInt(card.dataset.hs),as=parseInt(card.dataset.as);
        let isTeamInMatch=true,teamScore,oppScore;
        if(home===filter){teamScore=hs;oppScore=as;}
        else if(away===filter){teamScore=as;oppScore=hs;}
        else{isTeamInMatch=false;}
        if(!isTeamInMatch){
            dotEl.style.display='none';
            return;
        }
        let color='#818cf8'; // draw
        if(teamScore>oppScore)color='#22c55e'; // win
        else if(teamScore<oppScore)color='#ef4444'; // loss
        dotEl.style.display='';
        dotEl.style.background=color;
    });
}
function renderSeasonHistoryList(history){
    history=history||[];
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
        const delay=Math.min(idx,10)*35;
        // dot starts hidden — it only appears once a specific team filter is
        // active, and then reflects THAT team's result (see updateHistoryDots)
        return`<div class="match-card-mini" data-home="${m.home}" data-away="${m.away}" data-hs="${hs}" data-as="${as}" style="animation-delay:${delay}ms">
            <div class="mcm-date"><span class="mcm-dot" style="display:none;"></span>${dt.date} · ${dt.time}</div>
            <div class="mcm-row">
                <div class="mcm-team">
                    <img src="${GITHUB_IMAGE_BASE_URL}${m.home}.png" onerror="this.style.opacity='0.3'">
                    <span>${TEAM_DISPLAY_NAMES[m.home]||m.home}</span>
                </div>
                <div class="mcm-score">${m.score}</div>
                <div class="mcm-team mcm-team-away">
                    <span>${TEAM_DISPLAY_NAMES[m.away]||m.away}</span>
                    <img src="${GITHUB_IMAGE_BASE_URL}${m.away}.png" onerror="this.style.opacity='0.3'">
                </div>
            </div>
        </div>`;
    }).join('');
}

// ============================================================
// SCORE CONTROLS
// ============================================================
function changeScore(side,delta){
    haptic([6]);
    if(side==='home'){homeScore=Math.max(0,homeScore+delta);document.getElementById('home-score-display').textContent=homeScore;}
    else{awayScore=Math.max(0,awayScore+delta);document.getElementById('away-score-display').textContent=awayScore;}
    updateMatchPreview();
}
function updateMatchPreview(){
    const h=selectedHomeTeam;
    const a=selectedAwayTeam;
    const hl=document.getElementById('preview-home-logo');
    const al=document.getElementById('preview-away-logo');
    if(!h||!a)return;
    hl.src=`${GITHUB_IMAGE_BASE_URL}${h}.png`;hl.style.opacity='1';
    al.src=`${GITHUB_IMAGE_BASE_URL}${a}.png`;al.style.opacity='1';
    document.getElementById('preview-home-name').textContent=TEAM_DISPLAY_NAMES[h]||'Home';
    document.getElementById('preview-away-name').textContent=TEAM_DISPLAY_NAMES[a]||'Away';
    document.getElementById('preview-score-text').textContent=`${homeScore} : ${awayScore}`;
}

// ============================================================
// TEAM PICKER — custom bottom-sheet replacing native <select>
// ============================================================
function setTeamPickerValue(side,teamKey){
    const icon=document.getElementById(`${side}-team-select-icon`);
    const label=document.getElementById(`${side}-team-select-label`);
    if(!teamKey){
        icon.style.display='none';
        label.textContent='Select team';
        return;
    }
    icon.src=`${GITHUB_IMAGE_BASE_URL}${teamKey}.png`;
    icon.style.display='block';
    label.textContent=TEAM_DISPLAY_NAMES[teamKey]||teamKey;
}
function openTeamPicker(side){
    haptic([6]);
    activeTeamPickerSide=side;
    document.getElementById('home-team-select-trigger')?.classList.toggle('open',side==='home');
    document.getElementById('away-team-select-trigger')?.classList.toggle('open',side==='away');
    const titleMap={ home:'Select Home Team', away:'Select Away Team' };
    document.getElementById('team-picker-title').textContent=titleMap[side]||'Select Team';
    const otherSelected = side==='home' ? selectedAwayTeam : side==='away' ? selectedHomeTeam : null;
    const currentSelected = side==='home' ? selectedHomeTeam : selectedAwayTeam;
    const grid=document.getElementById('team-picker-grid');
    grid.innerHTML=TEAM_NAMES.map(t=>{
        const isSelected=t===currentSelected;
        const isDisabled=t===otherSelected;
        return `<div class="team-picker-option ${isSelected?'selected':''} ${isDisabled?'disabled':''}" onclick="selectTeamInPicker('${t}')">
            <img src="${GITHUB_IMAGE_BASE_URL}${t}.png">
            <span>${TEAM_DISPLAY_NAMES[t]||t}</span>
        </div>`;
    }).join('');
    document.getElementById('team-picker-sheet').classList.add('open');
}
function closeTeamPicker(){
    haptic([6]);
    document.getElementById('team-picker-sheet').classList.remove('open');
    document.getElementById('home-team-select-trigger')?.classList.remove('open');
    document.getElementById('away-team-select-trigger')?.classList.remove('open');
    activeTeamPickerSide=null;
}
function selectTeamInPicker(teamKey){
    if(!activeTeamPickerSide)return;
    haptic([8,30,8]);
    if(activeTeamPickerSide==='home'){
        selectedHomeTeam=teamKey;
        setTeamPickerValue('home',teamKey);
        updateMatchPreview();
        document.getElementById('admin-match-error').style.display='none';
    } else if(activeTeamPickerSide==='away'){
        selectedAwayTeam=teamKey;
        setTeamPickerValue('away',teamKey);
        updateMatchPreview();
        document.getElementById('admin-match-error').style.display='none';
    }
    closeTeamPicker();
}

// ============================================================
// TEAM PROFILE
// ============================================================
function showTeamProfile(key){
    haptic([8]);
    const t=leagueData[key];if(!t)return;
    document.getElementById('profile-team-logo').src=`${GITHUB_IMAGE_BASE_URL}${key}.png`;
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
                <span style="font-size:0.75rem;font-weight:700;color:#d1d5db;">${TEAM_DISPLAY_NAMES[m.home]}
                    <span style="color:#fbbf24;margin:0 6px;padding:2px 6px;background:rgba(0,0,0,0.3);border-radius:6px;">${m.score}</span>
                ${TEAM_DISPLAY_NAMES[m.away]}</span>
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
    // Build a quick picker overlay
    const existing=document.getElementById('season-picker-overlay');
    if(existing){existing.remove();return;}
    const overlay=document.createElement('div');
    overlay.id='season-picker-overlay';
    overlay.style.cssText=`
        position:fixed;inset:0;z-index:450;
        display:flex;align-items:flex-end;justify-content:center;
        background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);
    `;
    const sheet=document.createElement('div');
    sheet.style.cssText=`
        width:100%;max-width:420px;background:rgba(10,18,30,0.98);
        border-radius:28px 28px 0 0;padding:20px;
        border-top:1px solid rgba(255,255,255,0.1);
        max-height:60vh;overflow-y:auto;
        animation:sheetUp 0.3s cubic-bezier(0.34,1.56,0.64,1);
    `;
    sheet.innerHTML=`
        <div style="text-align:center;margin-bottom:16px;">
            <div style="width:36px;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 auto 12px;"></div>
            <div style="font-size:0.7rem;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;">Select Season</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
            ${seasonOptions.map((opt,idx)=>`
                <div onclick="selectSeasonFromPicker(${idx})" style="
                    padding:14px 16px;border-radius:16px;cursor:pointer;
                    background:${idx===currentSeasonIdx?'rgba(96,165,250,0.14)':'rgba(255,255,255,0.04)'};
                    border:1px solid ${idx===currentSeasonIdx?'var(--primary)':'rgba(255,255,255,0.07)'};
                    display:flex;justify-content:space-between;align-items:center;
                    transition:all 0.2s;
                ">
                    <span style="font-size:0.82rem;font-weight:700;color:${idx===currentSeasonIdx?'var(--primary)':'#d1d5db'};">${opt.label}</span>
                    ${idx===currentSeasonIdx?'<i class="fas fa-check" style="color:var(--primary);font-size:0.75rem;"></i>':''}
                </div>
            `).join('')}
        </div>
    `;
    overlay.appendChild(sheet);
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
    document.body.appendChild(overlay);
}

function selectSeasonFromPicker(idx){
    haptic([8]);
    currentSeasonIdx=idx;
    syncSeasonPill();
    const opt=seasonOptions[idx];
    const sel=document.getElementById('season-selector');
    if(sel)sel.value=opt.value;
    loadSelectedSeason(opt.value);
    const ov=document.getElementById('season-picker-overlay');
    if(ov)ov.remove();
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
        }
    }
}
async function loadMainLeagueDataFromGitHub(){
    if(!Object.keys(mainLeagueData).length)initializeMainLeagueData();
    const cached=await idbGet('mainLeagueData','v');
    if(cached) Object.keys(cached).forEach(k=>{if(mainLeagueData[k])mainLeagueData[k]={...mainLeagueData[k],...cached[k]};});
    if(!navigator.onLine){
        setSyncStatus('offline');
        TEAM_NAMES.forEach(ensureWalletFields);
        return mainLeagueData;
    }
    setSyncStatus('syncing');
    try{
        const r=await fetch(`${BASE_API}${GITHUB_MAIN_LEAGUE_FILE}?ref=${GITHUB_LEAGUE_BRANCH}`);
        if(r.ok){
            const d=await r.json();mainSha=d.sha;
            const c=await(await fetch(d.download_url)).json();
            Object.keys(c).forEach(k=>{if(mainLeagueData[k])mainLeagueData[k]={...mainLeagueData[k],...c[k]};});
            await idbSet('mainLeagueData','v',c);
        }
        setSyncStatus('synced');
    }catch(e){ setSyncStatus(cached?'offline':'error'); }
    TEAM_NAMES.forEach(ensureWalletFields); // backfills the wallet shape for any team the file predates
    return mainLeagueData;
}

