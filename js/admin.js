// ============================================================
// admin.js  —  ADMIN — dashboard entry point
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// Admin dashboard — no PIN anymore. Getting to this screen at all
// already required logging in as the Bayern team (see navigate()),
// so entering here goes straight to the dashboard.
// ============================================================
function showAdminDashboard(){
    // First time on this device: still need a GitHub PAT to actually save
    // anything — that's a device credential, separate from the team login.
    let t=localStorage.getItem('github_pat');
    if(!t){t=prompt("Enter GitHub PAT (needed once per device to save changes):");if(t){localStorage.setItem('github_pat',t);}sha=null;mainSha=null;matchesSha=null;archiveSha=null;}
    // Edit Mode (isAdminUnlocked) is a separate on/off toggle in Profile →
    // Bayern Admin — visiting the dashboard itself doesn't turn it on.
    selectedHomeTeam=TEAM_NAMES[0]||null;
    selectedAwayTeam=TEAM_NAMES.length>1?TEAM_NAMES[1]:(TEAM_NAMES[0]||null);
    setTeamPickerValue('home',selectedHomeTeam);
    setTeamPickerValue('away',selectedAwayTeam);
    homeScore=0;awayScore=0;
    document.getElementById('home-score-display').textContent='0';
    document.getElementById('away-score-display').textContent='0';
    updateMatchPreview();
    // keep leagueData in sync with GitHub before any admin edit/delete/verify happens.
    // Golden-Moment shard shas are loaded here too (once per session) — admin
    // can now enter the panel without ever visiting the Moments tab first,
    // so this can no longer be assumed to have happened already. Skipped on
    // repeat dashboard visits (e.g. right after a save) since we already
    // keep the shard shas in sync locally after every successful save.
    Promise.all([loadLeagueDataFromGitHub(),loadMatchHistoryFromGitHub(),weirdEventsLoaded?Promise.resolve():loadWeirdEventsFromGitHub()]).then(([,h])=>renderAdminHistory(h));
    loadPendingPurchases();
    // reset weird media upload
    weirdMedia=[];renderWeirdPreview();
    // Music library manager — always refetched on open so deletes/renames/
    // uploads made from another session or device are reflected immediately.
    loadMusicManagerList();
}

// Called when admin navigates away or finishes — restore nav
function exitAdmin(){
    navigate('settings');
}
function navigate(route){
    haptic([8]);

    // if leaving the league (season) screen, reset back to the current season
    const prevRoute = ROUTES[currentRouteIndex];
    if(prevRoute === 'league' && route !== 'league' && isViewingArchive){
        // Reset to current season silently before leaving
        currentSeasonIdx = 0;
        isViewingArchive = false;
        syncSeasonPill();
        const sel = document.getElementById('season-selector');
        if(sel) sel.value = 'current';
        updateCurrentDateTime();
    }

    // Lock the HARFS capsule while the admin panel is open, so a stray
    // hold can't pull the admin out of it mid-task.
    const capsuleEl=document.getElementById('hero-logo-container');
    if(capsuleEl){
        if(route==='admin'){ capsuleEl.classList.add('capsule-locked'); }
        else{ capsuleEl.classList.remove('capsule-locked'); }
    }

    // Disable every other nav item while the admin panel (PIN screen or
    // dashboard) is open — exiting is only possible via the explicit exit button.
    ['nav-main','nav-season','nav-admin','nav-settings'].forEach(id=>{
        const el=document.getElementById(id);
        if(!el)return;
        el.classList.toggle('nav-disabled', route==='admin');
    });

    currentRouteIndex=ROUTES.indexOf(route);
    const navMap={
        'main-league':'nav-main','league':'nav-season','weird':'nav-admin',
        'shop':'nav-settings','settings':'nav-settings','admin':'nav-settings',
        'ai-chat':'nav-main','live-scores':'nav-main'
    };
    document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
    document.getElementById(navMap[route])?.classList.add('active');

    const idMap={
        'main-league':'main-league-screen','league':'league-table-screen',
        'shop':'shop-screen','weird':'weird-screen','admin':'admin-screen',
        'settings':'settings-screen','ai-chat':'ai-chat-screen','live-scores':'live-scores-screen'
    };
    const targetId=idMap[route];
    document.querySelectorAll('.page-screen').forEach(s=>{
        if(s.id!==targetId){
            s.classList.remove('active');
            setTimeout(()=>{if(!s.classList.contains('active'))s.style.display='none';},370);
        }
    });
    const target=document.getElementById(targetId);
    if(target){target.style.display='flex';setTimeout(()=>target.classList.add('active'),40);}

    if(route==='main-league')loadMainLeagueDataFromGitHub().then(renderMainLeagueTable);
    if(route==='league')Promise.all([loadLeagueDataFromGitHub(),loadMatchHistoryFromGitHub()]).then(([d,h])=>{
        const sel=document.getElementById('season-selector');if(sel)sel.value='current';
        isViewingArchive=false;updateCurrentDateTime();renderLeagueTable(d);
        renderSeasonHistoryList(h);
    });
    updateSeasonFabs(route);
    if(route==='shop')loadMainLeagueDataFromGitHub().then(renderShop);
    if(route==='weird')loadWeirdEventsFromGitHub().then(renderWeirdEvents);
    if(route==='settings')renderSettingsScreen();
    // Live Scores auto-refreshes only while its screen is actually open —
    // stop the timer the moment we navigate anywhere else.
    if(route==='live-scores') startLiveScoresAutoRefresh(); else stopLiveScoresAutoRefresh();
    if(route==='admin'){
        // Getting into the admin route at all already required a Bayern
        // login — there's no separate PIN gate anymore.
        if(!loggedInTeam || loggedInTeam!=='Bayern'){ showToast('Admin panel is Bayern-only','error',2400); navigate('settings'); return; }
        showAdminDashboard();
    }
}

