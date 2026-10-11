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
    // No GitHub token is needed on this device anymore: every save goes through the
    // Worker (login session) which holds the token and checks what this account may do.
    applyAdminScreenAccess();
    if(!isFullAdmin()){
        // Account with granted tools (music and/or moments): load only what those need.
        if(canAddMoment()){ if(!weirdEventsLoaded) loadWeirdEventsFromGitHub(); weirdMedia=[]; renderWeirdPreview(); }
        if(canManageMusic()) loadMusicManagerList();
        return;
    }
    loadAdminPermsUi();
    // Edit Mode (isAdminUnlocked) is a separate on/off toggle in Profile →
    // Bayern Admin — visiting the dashboard itself doesn't turn it on.
    // keep leagueData in sync with GitHub before any admin edit/delete/verify happens.
    // Golden-Moment shard shas are loaded here too (once per session) — admin
    // can now enter the panel without ever visiting the Moments tab first,
    // so this can no longer be assumed to have happened already. Skipped on
    // repeat dashboard visits (e.g. right after a save) since we already
    // keep the shard shas in sync locally after every successful save.
    Promise.all([loadLeagueDataFromGitHub(),loadMatchHistoryFromGitHub(),weirdEventsLoaded?Promise.resolve():loadWeirdEventsFromGitHub()]).then(([,h])=>{renderAdminHistory(h);renderFlowViews();});
    // reset weird media upload
    weirdMedia=[];renderWeirdPreview();
    // Music library manager — always refetched on open so deletes/renames/
    // uploads made from another session or device are reflected immediately.
    loadMusicManagerList();
    renderFlowViews(); // Season Control card (schedule stage, results, CUP, Super Cup)
    // Weekly Magazine — Friday-gated generate button + cover manager.
    // Reuses the same archive the magazine viewer itself uses, only
    // refetching if this is the first time it's needed this session.
    (magazineLoaded ? Promise.resolve() : loadMagazine()).then(renderMagazineAdminSection);
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

    // CUP edition picker is independent — reset it to "newest" when leaving Season
    if(prevRoute === 'league' && route !== 'league' && typeof resetMbaView === 'function') resetMbaView();

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
        'magazine':'nav-main','ai-chat':'nav-main'
    };
    document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
    document.getElementById(navMap[route])?.classList.add('active');

    const idMap={
        'main-league':'main-league-screen','league':'league-table-screen',
        'shop':'shop-screen','weird':'weird-screen','admin':'admin-screen',
        'settings':'settings-screen','magazine':'magazine-screen',
        'ai-chat':'ai-chat-screen'
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
    if(route==='league' && typeof loadMbaDataFromGitHub === 'function') loadMbaDataFromGitHub().then(()=>{ if(typeof loadFlowFromGitHub==='function') loadFlowFromGitHub(); });
    updateSeasonFabs(route);
    if(route==='shop')loadMainLeagueDataFromGitHub().then(renderMysteryBoxScreen);
    if(route==='weird'){loadWeirdEventsFromGitHub().then(renderWeirdEvents);loadMomentReactions();}
    if(route==='settings')renderSettingsScreen();
    if(route==='admin'){
        // There's no separate PIN gate anymore.
        // Bayern gets everything; any other account only gets in if the admin granted it
        // a tool (music / moments) — the screen then shows just those sections.
        if(!loggedInTeam || (loggedInTeam!=='Bayern' && !hasAnyTool())){ showToast('Admin panel is Bayern-only','error',2400); navigate('settings'); return; }
        showAdminDashboard();
        // schedule + CUP are re-read once when the panel is OPENED (not after every save, so a just-written file is never overwritten by a stale read)
        if(typeof loadMbaDataFromGitHub==='function') loadMbaDataFromGitHub().then(()=>{ if(typeof loadFlowFromGitHub==='function') loadFlowFromGitHub(); });
    }
}

