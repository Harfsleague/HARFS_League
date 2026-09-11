// ============================================================
// league-ops.js  —  LEAGUE-OPS — badges, team panel (Overall), report sheet, GitHub savers, edit match result, table verification, refresh
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// RECORD-BASED BADGES (non-purchasable, dynamic)
// ------------------------------------------------------------
// These aren't owned like shop items — they're automatically held by
// whichever team currently leads a career stat, recomputed on every
// render (nothing stored), and change hands the moment someone else
// takes the lead. "Career" here means every archived season's final
// table plus the current season's live stats — archived seasons only
// keep their final per-team row (P/W/D/L/GF/GA), not a full match
// log, so summing those rows is what "all-time" actually means here.
// ============================================================
function computeAllTimeStats(){
    const stats = {}; TEAM_NAMES.forEach(t=>stats[t]={GF:0,GA:0,W:0,D:0,L:0,P:0});
    (archivedSeasons||[]).forEach(season=>{
        (season.table||[]).forEach(row=>{
            if(!(row.name in stats)) return;
            stats[row.name].GF+=row.GF||0; stats[row.name].GA+=row.GA||0;
            stats[row.name].W+=row.W||0; stats[row.name].D+=row.D||0; stats[row.name].L+=row.L||0;
            stats[row.name].P+=row.P||0;
        });
    });
    TEAM_NAMES.forEach(t=>{
        const row = leagueData[t];
        if(!row) return;
        stats[t].GF+=row.GF||0; stats[t].GA+=row.GA||0;
        stats[t].W+=row.W||0; stats[t].D+=row.D||0; stats[t].L+=row.L||0;
        stats[t].P+=row.P||0;
    });
    return stats;
}
function computeRecordBadges(){
    const stats = computeAllTimeStats();
    const trophies = computeTrophyCounts();
    const pickLeader = (valueFn) => {
        let best=null, bestVal=-Infinity;
        TEAM_NAMES.slice().sort().forEach(t=>{ // alphabetical order gives a stable, deterministic tie-break
            const v = valueFn(stats[t], trophies[t]);
            if(v>bestVal){ bestVal=v; best=t; }
        });
        return { team:best, value:bestVal };
    };
    return {
        topScorer:    { ...pickLeader(s=>s.GF), icon:'⚽', label:'Top Scorer (all-time)' },
        bestDefense:  { ...pickLeader(s=>-s.GA), icon:'🛡️', label:'Best Defense (all-time)' },
        mostWins:     { ...pickLeader(s=>s.W), icon:'🔥', label:'Most Wins (all-time)' },
        mostDecorated:{ ...pickLeader((s,tr)=>tr.gold+tr.silver+tr.bronze), icon:'👑', label:'Most Decorated' },
    };
}
function renderRecordBadgesFor(team){
    const badges = computeRecordBadges();
    const held = Object.values(badges).filter(b=>b.team===team && b.value>0);
    if(!held.length) return '<div class="team-panel-empty">No league records held right now</div>';
    return held.map(b=>`<div class="coin-log-row"><span>${b.icon} ${escapeHtml(b.label)}</span><span style="color:#6b7280;font-weight:600;">On loan</span></div>`).join('');
}

// Record-based badges above are the only "held items" now — the boutique
// rental system (owned items with a per-season coin cost) was removed
// along with the rest of the coin economy.

// ============================================================
// TEAM PANEL — tap a team on Overall to see its trophies and records.
// ============================================================
function openTeamPanel(team){
    if(!mainLeagueData[team]) return;
    haptic([8]);
    ensureWalletFields(team);
    const w = mainLeagueData[team];
    const trophies = computeTrophyCounts()[team] || {gold:0,silver:0,bronze:0};

    const teamPanelLogo = document.getElementById('team-panel-logo');
    // Reset opacity to full every time we open this panel — the onerror
    // handler on this <img> dims it to 0.3 on a failed load, but nothing
    // was ever setting it back to 1 on a later successful load, so once it
    // failed once it stayed dim forever even after the image loaded fine.
    teamPanelLogo.style.opacity = '1';
    teamPanelLogo.src = teamLogoUrl(team);
    document.getElementById('team-panel-name').textContent = TEAM_DISPLAY_NAMES[team] || team;

    const pinnedEl = document.getElementById('team-panel-pinned');
    if(w.pinned && w.pinned.expiresAt && new Date(w.pinned.expiresAt) > new Date()){
        pinnedEl.innerHTML = `<i class="fas fa-thumbtack"></i> ${escapeHtml(w.pinned.text)}`;
    } else {
        pinnedEl.innerHTML = '';
    }

    document.getElementById('team-panel-trophies').innerHTML = `
        <div class="trophy-cabinet-item"><span class="trophy-emoji">🥇</span><div class="trophy-count">${trophies.gold}</div></div>
        <div class="trophy-cabinet-item"><span class="trophy-emoji">🥈</span><div class="trophy-count">${trophies.silver}</div></div>
        <div class="trophy-cabinet-item"><span class="trophy-emoji">🥉</span><div class="trophy-count">${trophies.bronze}</div></div>`;

    document.getElementById('team-panel-records').innerHTML = renderRecordBadgesFor(team);

    const arenaEl = document.getElementById('team-panel-arena');
    arenaEl.innerHTML = w.arenaHistory.length ? w.arenaHistory.slice(0,10).map(a=>{
        const d = new Date(a.ts);
        const when = isNaN(d) ? '' : d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
        return `<div class="coin-log-row"><span>${escapeHtml(a.name||a.id)}${when?` · ${when}`:''}</span></div>`;
    }).join('') : '<div class="team-panel-empty">No Mystery Box wins yet</div>';

    document.getElementById('team-panel-overlay').classList.add('open');
}
function closeTeamPanel(){
    document.getElementById('team-panel-overlay').classList.remove('open');
}

// ============================================================
// GENERIC REPORT SHEET — reused by anything that needs to show the
// admin a read-only report before/after an action.
// ============================================================
function openReportSheet(title, bodyHtml){
    document.getElementById('report-sheet-title').textContent = title;
    document.getElementById('report-sheet-body').innerHTML = bodyHtml;
    document.getElementById('report-sheet-overlay').classList.add('open');
}
function closeReportSheet(){
    document.getElementById('report-sheet-overlay').classList.remove('open');
}

// Offline-first: show whatever's cached in IndexedDB immediately, then try
// to fetch fresh data over the network and update both the in-memory state
// and the cache. If the network fails (or there's no connection at all),
// the cached copy — if any — is what stays on screen; see setSyncStatus().
async function loadLeagueDataFromGitHub(){
    if(!Object.keys(leagueData).length)initializeLeagueData();
    const cached = await idbGet('leagueData','v');
    if(cached) Object.keys(cached).forEach(k=>{if(leagueData[k])leagueData[k]={...leagueData[k],...cached[k]};});
    if(!navigator.onLine){ setSyncStatus('offline'); return leagueData; }
    setSyncStatus('syncing');
    try{
        const r=await fetch(`${BASE_API}${GITHUB_LEAGUE_FILE}?ref=${GITHUB_LEAGUE_BRANCH}`);
        if(r.ok){
            const d=await r.json();sha=d.sha;
            const c=await(await fetch(d.download_url)).json();
            Object.keys(c).forEach(k=>{if(leagueData[k])leagueData[k]={...leagueData[k],...c[k]};});
            await idbSet('leagueData','v',c);
        }
        setSyncStatus('synced');
    }catch(e){ setSyncStatus(cached?'offline':'error'); }
    return leagueData;
}
async function loadMatchHistoryFromGitHub(){
    const cached = await idbGet('matchHistory','v');
    if(cached) matchHistory = cached;
    if(!navigator.onLine){ setSyncStatus('offline'); return matchHistory; }
    try{
        const r=await fetch(`${BASE_API}${GITHUB_MATCHES_FILE}?ref=${GITHUB_LEAGUE_BRANCH}`);
        if(r.ok){
            const d=await r.json();matchesSha=d.sha;
            matchHistory=await(await fetch(d.download_url)).json();
            await idbSet('matchHistory','v',matchHistory);
        }
    }catch(e){ matchHistory=cached||[]; setSyncStatus(cached?'offline':'error'); return matchHistory; }
    return matchHistory;
}

// ============================================================
// GITHUB SAVERS
// ============================================================
async function saveMainLeagueDataToGitHub(d,m){const ts={};Object.keys(d).forEach(k=>{const{name,...r}=d[k];ts[k]=r;});return saveFile(GITHUB_MAIN_LEAGUE_FILE,ts,m,mainSha);}
async function saveLeagueDataToGitHub(d,m){const ts={};Object.keys(d).forEach(k=>{const{name,...r}=d[k];ts[k]=r;});return saveFile(GITHUB_LEAGUE_FILE,ts,m,sha);}
async function saveMatchHistoryToGitHub(d,m){return saveFile(GITHUB_MATCHES_FILE,d,m,matchesSha);}

function updateTeamStats(t,gf,ga){t.P++;t.GF+=gf;t.GA+=ga;if(gf>ga){t.W++;t.Pts+=3;}else if(gf===ga){t.D++;t.Pts++;}else t.L++;}
function revertTeamStats(t,gf,ga){t.P--;t.GF-=gf;t.GA-=ga;if(gf>ga){t.W--;t.Pts-=3;}else if(gf===ga){t.D--;t.Pts--;}else t.L--;}

async function registerMatchResult(){
    const h=selectedHomeTeam;
    const a=selectedAwayTeam;
    if(!h||!a||h===a){document.getElementById('admin-match-error').style.display='block';haptic([60]);return;}
    document.getElementById('admin-match-error').style.display='none';
    const ok=await showConfirm({icon:'⚽',title:'Save Match?',message:`${TEAM_DISPLAY_NAMES[h]} ${homeScore} – ${awayScore} ${TEAM_DISPLAY_NAMES[a]}`,okLabel:'Save',okColor:'green'});
    if(!ok)return;
    updateTeamStats(leagueData[h],homeScore,awayScore);
    updateTeamStats(leagueData[a],awayScore,homeScore);
    const m={home:h,away:a,score:`${homeScore}-${awayScore}`,timestamp:new Date().toISOString()};
    matchHistory.unshift(m);
    const s1=await saveLeagueDataToGitHub(leagueData,`Match ${m.score}`);
    const s2=await saveMatchHistoryToGitHub(matchHistory,`History ${m.score}`);
    homeScore=0;awayScore=0;
    document.getElementById('home-score-display').textContent='0';
    document.getElementById('away-score-display').textContent='0';
    updateMatchPreview();
    showToast(s1&&s2?`Saved: ${h} ${m.score} ${a}`:'Saved locally — check network',s1&&s2?'success':'info');
    await refreshAllLeagueViews();
    showAdminDashboard();
}
async function deleteMatch(i){
    const m=matchHistory[i];
    const ok=await showConfirm({icon:'🗑️',title:'Delete Match?',message:`${TEAM_DISPLAY_NAMES[m.home]} ${m.score} ${TEAM_DISPLAY_NAMES[m.away]} — Stats will revert.`,okLabel:'Delete',okColor:'red'});
    if(!ok)return;
    const p=m.score.split('-');const hs=parseInt(p[0]),as=parseInt(p[1]);
    revertTeamStats(leagueData[m.home],hs,as);revertTeamStats(leagueData[m.away],as,hs);
    matchHistory.splice(i,1);
    const s1=await saveLeagueDataToGitHub(leagueData,"Reverted stats");
    const s2=await saveMatchHistoryToGitHub(matchHistory,"Deleted match");
    if(s1&&s2)showToast('Match deleted, stats reverted','success');
    await refreshAllLeagueViews();
    showAdminDashboard();
}

// ============================================================
// EDIT MATCH RESULT
// ============================================================
let editMatchIndex=null,editHomeScore=0,editAwayScore=0;
function editMatch(i){
    const m=matchHistory[i];
    if(!m)return;
    haptic([8]);
    editMatchIndex=i;
    const p=m.score.split('-');
    editHomeScore=parseInt(p[0])||0;editAwayScore=parseInt(p[1])||0;
    document.getElementById('edit-match-teams').textContent=`${TEAM_DISPLAY_NAMES[m.home]} vs ${TEAM_DISPLAY_NAMES[m.away]}`;
    document.getElementById('edit-home-score-display').textContent=editHomeScore;
    document.getElementById('edit-away-score-display').textContent=editAwayScore;
    document.getElementById('edit-match-modal').classList.add('open');
}
function changeEditScore(side,delta){
    haptic([6]);
    if(side==='home'){editHomeScore=Math.max(0,editHomeScore+delta);document.getElementById('edit-home-score-display').textContent=editHomeScore;}
    else{editAwayScore=Math.max(0,editAwayScore+delta);document.getElementById('edit-away-score-display').textContent=editAwayScore;}
}
function closeEditMatchModal(){
    document.getElementById('edit-match-modal').classList.remove('open');
    editMatchIndex=null;
}
async function saveEditedMatch(){
    if(editMatchIndex===null)return;
    const m=matchHistory[editMatchIndex];
    if(!m){closeEditMatchModal();return;}
    const p=m.score.split('-');
    const oldHs=parseInt(p[0])||0,oldAs=parseInt(p[1])||0;
    if(editHomeScore===oldHs&&editAwayScore===oldAs){closeEditMatchModal();return;}
    // revert the old result then apply the new one, so the table always reflects what's on screen
    if(leagueData[m.home])revertTeamStats(leagueData[m.home],oldHs,oldAs);
    if(leagueData[m.away])revertTeamStats(leagueData[m.away],oldAs,oldHs);
    if(leagueData[m.home])updateTeamStats(leagueData[m.home],editHomeScore,editAwayScore);
    if(leagueData[m.away])updateTeamStats(leagueData[m.away],editAwayScore,editHomeScore);
    m.score=`${editHomeScore}-${editAwayScore}`;
    m.editedAt=new Date().toISOString();
    closeEditMatchModal();
    const s1=await saveLeagueDataToGitHub(leagueData,`Edited match result: ${m.score}`);
    const s2=await saveMatchHistoryToGitHub(matchHistory,'Edited match result');
    showToast(s1&&s2?'Match result updated ✏️':'Saved locally — check network',s1&&s2?'success':'info');
    await refreshAllLeagueViews();
    showAdminDashboard();
}

// ============================================================
// TABLE VERIFICATION — rebuilds standings straight from match
// history, so admin can fix any drift with a single tap.
// ============================================================
async function recalculateLeagueTable(){
    const ok=await showConfirm({icon:'🛡️',title:'Verify Table?',message:'The season table will be fully rebuilt from match history to catch and fix any inconsistency.',okLabel:'Verify',okColor:'purple'});
    if(!ok)return;
    await loadMatchHistoryFromGitHub();
    initializeLeagueData();
    matchHistory.forEach(m=>{
        const p=m.score.split('-');
        const hs=parseInt(p[0])||0,as=parseInt(p[1])||0;
        if(leagueData[m.home])updateTeamStats(leagueData[m.home],hs,as);
        if(leagueData[m.away])updateTeamStats(leagueData[m.away],as,hs);
    });
    const saved=await saveLeagueDataToGitHub(leagueData,'Verified & rebuilt table from match history');
    showToast(saved?'Table verified & synced ✅':'Verified locally — check network',saved?'success':'info');
    await refreshAllLeagueViews();
    showAdminDashboard();
}

// ============================================================
// REFRESH — keeps every screen (table, history, admin list,
// main leaderboard) in sync right after any admin change.
// ============================================================
async function refreshAllLeagueViews(){
    renderLeagueTable(leagueData);
    if(!isViewingArchive)renderSeasonHistoryList(matchHistory);
    renderAdminHistory(matchHistory);
    await loadMainLeagueDataFromGitHub();
    renderMainLeagueTable();
}
async function archiveCurrentSeason(finalTable,finalHistory){
    try{const r=await fetch(`${BASE_API}${GITHUB_ARCHIVE_FILE}?ref=${GITHUB_LEAGUE_BRANCH}`);if(r.ok){const d=await r.json();archiveSha=d.sha;archivedSeasons=await(await fetch(d.download_url)).json();}}catch(e){}
    const n=archivedSeasons.length+1;
    archivedSeasons.push({seasonId:n,date:new Date().toISOString(),table:finalTable,history:finalHistory||[]});
    await saveFile(GITHUB_ARCHIVE_FILE,archivedSeasons,`Archived Season ${n}`,archiveSha);
    loadArchiveDropdown();
}
async function finishSeason(){
    const ok=await showConfirm({icon:'🏆',title:'End the Season?',message:'Top 3 teams earn a trophy, and the season will be archived, including its match history. The Season tab\'s match history will then start fresh for the new season.',okLabel:'End Season',okColor:'purple'});
    if(!ok)return;
    const sorted=Object.values(leagueData).sort((a,b)=>(b.Pts-a.Pts)||((b.GF-b.GA)-(a.GF-a.GA)));
    // Trophies (gold/silver/bronze) aren't stored — they're tallied live from
    // archivedSeasons' saved tables (see computeTrophyCounts()), so archiving
    // the season below is what actually "awards" the trophy.
    await archiveCurrentSeason(sorted,matchHistory);
    // The season table AND the live match list both reset here. The just-played
    // matches aren't lost — archiveCurrentSeason() just copied them into the
    // archive above — but the "current" match history needs to start empty so
    // the Season tab's history only ever shows matches from the season in
    // progress, instead of accumulating every match ever played across every season.
    initializeLeagueData();
    matchHistory=[];
    await saveLeagueDataToGitHub(leagueData,"Reset Season Table");
    await saveMatchHistoryToGitHub(matchHistory,"Season archived - match history cleared for new season");
    showToast('Season ended & archived! 🏆','success',4000);
    await refreshAllLeagueViews();
    navigate('main-league');
}
async function resetLeagueConfirm(){
    const ok=await showConfirm({icon:'💀',title:'Full Reset?',message:"All season data will be permanently deleted. Won't be archived.",okLabel:'Reset',okColor:'red'});
    if(!ok)return;
    matchHistory=[];initializeLeagueData();
    await saveMatchHistoryToGitHub(matchHistory,"Reset");await saveLeagueDataToGitHub(leagueData,"Reset");
    showToast('League has been reset','info');
    await refreshAllLeagueViews();
    navigate('league');
}

