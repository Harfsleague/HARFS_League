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
let teamPanelCurrent = null; // team whose panel is open — the avatar opens its photo slider
function openTeamPanel(team){
    if(!mainLeagueData[team]) return;
    teamPanelCurrent = team;
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
    const photoBadge = document.getElementById('team-panel-photo-badge');
    const photoN = teamPhotoCount(team);
    photoBadge.style.display = photoN > 1 ? '' : 'none';
    photoBadge.innerHTML = `<i class="fas fa-images"></i> ${photoN}`;

    const pinnedEl = document.getElementById('team-panel-pinned');
    if(w.pinned && w.pinned.expiresAt && new Date(w.pinned.expiresAt) > new Date()){
        pinnedEl.innerHTML = `<i class="fas fa-thumbtack"></i> ${escapeHtml(w.pinned.text)}`;
    } else {
        pinnedEl.innerHTML = '';
    }

    document.getElementById('team-panel-trophies').innerHTML = isSymbolicTeam(team)
        ? `<div class="trophy-cabinet-item"><span class="trophy-emoji ps-medal-big">${PURPLE_MEDAL_SVG}</span></div>`
        : `
        <div class="trophy-cabinet-item"><span class="trophy-emoji">🏆</span><div class="trophy-count">${trophies.gold}</div></div>
        <div class="trophy-cabinet-item"><span class="trophy-emoji">🥈</span><div class="trophy-count">${trophies.silver}</div></div>
        <div class="trophy-cabinet-item"><span class="trophy-emoji">🥉</span><div class="trophy-count">${trophies.bronze}</div></div>`;

    document.getElementById('team-panel-records').innerHTML = renderRecordBadgesFor(team);

    const mbaLogEl = document.getElementById('team-panel-mba');
    const mbaLog = w.mbaChampionLog||[];
    mbaLogEl.innerHTML = mbaLog.length ? mbaLog.slice().reverse().map(entry=>{
        const d = new Date(entry.ts);
        const when = isNaN(d) ? '' : d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
        return `<div class="coin-log-row"><span>🏆 CUP Champion — Edition #${entry.edition}</span>${when?`<span style="color:#6b7280;font-weight:600;">${when}</span>`:''}</div>`;
    }).join('') : '<div class="team-panel-empty">No CUP titles yet</div>';
    // Super Cup titles (league champion vs CUP champion) are tallied from the archive
    const superTitles = (typeof computeSuperCupCounts==='function' && computeSuperCupCounts()[team]) || [];
    if(superTitles.length) mbaLogEl.innerHTML += superTitles.slice().reverse().map(sid=>`<div class="coin-log-row"><span>⚡ Super Cup Winner — Season ${sid}</span></div>`).join('');

    // A symbolic team plays no league/CUP, so those sections stay hidden for it.
    ['team-panel-records','team-panel-mba'].forEach(id=>{
        const sec = document.getElementById(id) && document.getElementById(id).closest('.team-panel-section');
        if(sec) sec.style.display = isSymbolicTeam(team) ? 'none' : '';
    });
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
        const j=await ghFetchJson(GITHUB_LEAGUE_FILE,{maxAgeMs:25000});
        if(j.ok){
            sha=j.sha;
            const c=j.data;
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
        const j=await ghFetchJson(GITHUB_MATCHES_FILE,{maxAgeMs:25000});
        if(j.ok){
            matchesSha=j.sha;
            matchHistory=j.data;
            await idbSet('matchHistory','v',matchHistory);
        }
    }catch(e){ matchHistory=cached||[]; setSyncStatus(cached?'offline':'error'); return matchHistory; }
    return matchHistory;
}

// ============================================================
// GITHUB SAVERS
// ============================================================
async function saveMainLeagueDataToGitHub(d,m){const ts={};Object.keys(d).forEach(k=>{const{name,...r}=d[k];ts[k]=r;});return saveFile(GITHUB_MAIN_LEAGUE_FILE,ts,m,mainSha);}
// Combo points are written into league_data.json by the Worker (fields Bonus / BonusSeason, already inside Pts).
// Before every save pull the latest values so this app never overwrites them with a stale copy.
async function leagueSyncComboBonus(){
    try{
        const j=await ghFetchJson(GITHUB_LEAGUE_FILE,{bust:true,rawBust:true});
        if(!j.ok) return;
        sha=j.sha;
        const c=j.data;
        Object.keys(c).forEach(k=>{
            const L=leagueData[k]; if(!L) return;
            const rb=(c[k].BonusSeason!==undefined)?(c[k].Bonus||0):0, lb=L.Bonus||0;
            if(rb!==lb || (c[k].BonusSeason||null)!==(L.BonusSeason||null)){ L.Pts=(L.Pts||0)-lb+rb; L.Bonus=rb; if(c[k].BonusSeason!==undefined) L.BonusSeason=c[k].BonusSeason; }
        });
    }catch(e){}
}
async function saveLeagueDataToGitHub(d,m,syncBonus){
    if(syncBonus && d===leagueData) await leagueSyncComboBonus();
    const ts={};Object.keys(d).forEach(k=>{const{name,...r}=d[k];ts[k]=r;});return saveFile(GITHUB_LEAGUE_FILE,ts,m,sha);}
async function saveMatchHistoryToGitHub(d,m){return saveFile(GITHUB_MATCHES_FILE,d,m,matchesSha);}

function updateTeamStats(t,gf,ga){t.P++;t.GF+=gf;t.GA+=ga;if(gf>ga){t.W++;t.Pts+=3;}else if(gf===ga){t.D++;t.Pts++;}else t.L++;}
function revertTeamStats(t,gf,ga){t.P--;t.GF-=gf;t.GA-=ga;if(gf>ga){t.W--;t.Pts-=3;}else if(gf===ga){t.D--;t.Pts--;}else t.L--;}

// Results are entered per scheduled fixture — see flowSaveFixture() in js/flow.js.
async function deleteMatch(i){
    const m=matchHistory[i];
    const ok=await showConfirm({icon:'🗑️',title:'Delete Match?',message:`${TEAM_DISPLAY_NAMES[m.home]} ${m.score} ${TEAM_DISPLAY_NAMES[m.away]} — Stats will revert.`+(m.fx?` Matchweek ${m.round||''} will be re-opened in the schedule.`:''),okLabel:'Delete',okColor:'red'});
    if(!ok)return;
    const p=m.score.split('-');const hs=parseInt(p[0]),as=parseInt(p[1]);
    revertTeamStats(leagueData[m.home],hs,as);revertTeamStats(leagueData[m.away],as,hs);
    matchHistory.splice(i,1);
    const s1=await saveLeagueDataToGitHub(leagueData,"Reverted stats",true);
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
    const s1=await saveLeagueDataToGitHub(leagueData,`Edited match result: ${m.score}`,true);
    const s2=await saveMatchHistoryToGitHub(matchHistory,'Edited match result');
    showToast(s1&&s2?'Match result updated ✏️':'Saved locally — check network',s1&&s2?'success':'info');
    await refreshAllLeagueViews();
    showAdminDashboard();
}

// Table verification lives in js/verify.js (recalculateLeagueTable — league + schedule + CUP in one pass).

// ============================================================
// REFRESH — keeps every screen (table, history, admin list,
// main leaderboard) in sync right after any admin change.
// ============================================================
async function refreshAllLeagueViews(){
    renderLeagueTable(leagueData,matchHistory);
    if(!isViewingArchive)renderSeasonHistoryList(matchHistory);
    renderAdminHistory(matchHistory);
    await loadMainLeagueDataFromGitHub();
    renderMainLeagueTable();
    if(typeof renderFlowViews==='function')renderFlowViews();
}
async function archiveCurrentSeason(finalTable,finalHistory,extra){
    try{const j=await ghFetchJson(GITHUB_ARCHIVE_FILE);if(j.ok){archiveSha=j.sha;archivedSeasons=j.data;}}catch(e){}
    const n=archivedSeasons.length+1;
    archivedSeasons.push({seasonId:n,date:new Date().toISOString(),table:finalTable,history:finalHistory||[],...(extra||{})});
    await saveFile(GITHUB_ARCHIVE_FILE,archivedSeasons,`Archived Season ${n}`,archiveSha);
    loadArchiveDropdown();
}
// "End Season" / "Start New Season" and "Full Reset" now live in js/flow.js
// (flowEndSeason, flowFullReset) because what they do depends on the schedule stage.
