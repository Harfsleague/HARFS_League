// ============================================================
// live-scores.js  —  LIVE SCORES — every league, right now (API-Football,
// proxied+cached through a separate Worker; see config.js LIVE_SCORES_API
// and worker/live-scores-worker.js + LIVE_SCORES_DEPLOY.md).
// Loaded as a classic (non-module) script — shares the global scope with
// every other file, same as the rest of the app.
// ============================================================

let liveScoresRefreshTimer = null;
let liveScoresLastFixtures = [];

// ============================================================
// NETWORK HELPER — a plain fetch() with no timeout will just hang
// indefinitely on a slow/flaky connection (some mobile carriers and
// public wifi never send a proper error, they just stall), which is
// what was showing up as "could not reach the live scores server" even
// though the server itself was fine. This wraps fetch with an explicit
// timeout and a couple of quick retries before giving up, so a single
// slow round-trip doesn't fail the whole request.
// ============================================================
async function fetchWithRetry(url, {timeoutMs=9000, retries=2, retryDelayMs=1000} = {}){
    let lastErr;
    for(let attempt=0; attempt<=retries; attempt++){
        const controller = new AbortController();
        const timer = setTimeout(()=>controller.abort(), timeoutMs);
        try{
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            return res;
        }catch(e){
            clearTimeout(timer);
            lastErr = e;
            if(attempt<retries) await new Promise(r=>setTimeout(r, retryDelayMs*(attempt+1)));
        }
    }
    throw lastErr;
}

// ============================================================
// FAVORITES — stored per-device (localStorage), not per-team-account,
// since this is about what this person wants to see, not the team's
// ============================================================
function getFavLeagues(){ try{ return JSON.parse(localStorage.getItem('liveScoresFavLeagues'))||[]; }catch(e){ return []; } }
function getFavTeams(){ try{ return JSON.parse(localStorage.getItem('liveScoresFavTeams'))||[]; }catch(e){ return []; } }
function saveFavLeagues(list){ localStorage.setItem('liveScoresFavLeagues', JSON.stringify(list)); pushLiveScorePrefsToAccount(); }
function saveFavTeams(list){ localStorage.setItem('liveScoresFavTeams', JSON.stringify(list)); pushLiveScorePrefsToAccount(); }
function isFavoritesOnly(){ return localStorage.getItem('liveScoresFavoritesOnly') !== 'off'; } // default ON once the user has favorites

// ============================================================
// ACCOUNT SYNC — favorites are read/written to localStorage for
// instant, offline-safe access (as before), but are also mirrored
// into mainLeagueData[loggedInTeam] and pushed to GitHub through the
// existing wallet-save pipeline. That's what makes them survive an
// app reset/reinstall: logging back in pulls mainLeagueData from
// GitHub, and syncLiveScorePrefsForAccount() restores the favorites
// from there onto the fresh device.
// ============================================================
let liveScorePrefsSaveTimer = null;
function pushLiveScorePrefsToAccount(){
    if(!loggedInTeam || !mainLeagueData[loggedInTeam]) return; // not logged in / account not loaded yet — localStorage still works, just won't sync until then
    const acct = mainLeagueData[loggedInTeam];
    acct.liveScoreFavLeagues = getFavLeagues();
    acct.liveScoreFavTeams = getFavTeams();
    acct.liveScoreFavoritesOnly = isFavoritesOnly();
    acct.liveScorePrefsSynced = true;
    // Debounced — toggling a few leagues/teams in a row shouldn't fire one
    // GitHub commit per tap.
    clearTimeout(liveScorePrefsSaveTimer);
    liveScorePrefsSaveTimer = setTimeout(()=>{
        saveMainLeagueDataToGitHub(mainLeagueData, `Live Scores preferences updated: ${loggedInTeam}`).catch(()=>{});
    }, 1500);
}
// Called after login and whenever the Live Scores screen/preferences are
// opened (once mainLeagueData has been (re)loaded from GitHub). If the
// account already has synced prefs, they win (that's the "restore after
// reset" case) — otherwise this is the first time this feature has run for
// this account, so whatever's already on this device becomes the account's
// starting point instead of being silently wiped by an empty account record.
function syncLiveScorePrefsForAccount(){
    if(!loggedInTeam || !mainLeagueData[loggedInTeam]) return;
    const acct = mainLeagueData[loggedInTeam];
    if(acct.liveScorePrefsSynced){
        localStorage.setItem('liveScoresFavLeagues', JSON.stringify(acct.liveScoreFavLeagues||[]));
        localStorage.setItem('liveScoresFavTeams', JSON.stringify(acct.liveScoreFavTeams||[]));
        localStorage.setItem('liveScoresFavoritesOnly', acct.liveScoreFavoritesOnly===false ? 'off' : 'on');
        renderFavLeagueChips(); renderFavTeamChips(); syncFavoritesOnlyToggle(); renderLiveScoresFromCache();
        if(lspLeagueGroups) renderLspLeagueGroups();
        renderLspLeagueSelectRow();
    } else {
        pushLiveScorePrefsToAccount();
    }
}

function addFavLeague(league){
    const list = getFavLeagues();
    if(list.some(l=>l.id===league.id)) return;
    if(lspLeagueGroups){ renderLspLeagueGroups(); renderLspLeagueSelectRow(); return; }
    const container = document.getElementById('lsp-league-groups');
    try{
        const res = await fetchWithRetry(`${LIVE_SCORES_API}/leagues/grouped`);
        const data = await res.json();
        if(!res.ok || !data.ok) throw new Error(data.error||'failed');
        lspLeagueGroups = data.groups;
        renderLspLeagueGroups();
        renderLspLeagueSelectRow();
    }catch(e){
        if(container) container.innerHTML = `<div class="fav-search-empty">Could not load the league list${navigator.onLine?' — try again in a moment':' — you\'re offline'}</div>`;
    }
}
function renderLspLeagueGroups(){
    if(!listEl) return;
    listEl.innerHTML = '<div class="fav-search-loading"><span class="spinner"></span></div>';
    try{
        const res = await fetchWithRetry(`${LIVE_SCORES_API}/teams-by-league?leagueId=${leagueId}`);
        const data = await res.json();
        if(!res.ok || !data.ok) throw new Error(data.error||'failed');
        const favIds = new Set(getFavTeams().map(t=>t.id));
            </div>
        `).join('');
    }catch(e){
        listEl.innerHTML = `<div class="fav-search-empty">Could not load teams${navigator.onLine?' — try again in a moment':' — you\'re offline'}</div>`;
    }
}
function lspToggleTeam(index, cellEl){
    lspSetTab('leagues');
    loadLspLeagueGroups();
    document.getElementById('live-scores-prefs-sheet').classList.add('open');
    // Make sure we're showing this account's saved favorites, not whatever
    // happens to be on this device — matters when this sheet is opened
    // straight from Settings, before the Live Scores screen (which also
    // triggers this) has had a chance to load mainLeagueData.
    if(loggedInTeam){
        loadMainLeagueDataFromGitHub().then(syncLiveScorePrefsForAccount).catch(()=>{});
    }
}
function closeLiveScoresPreferences(){
    document.getElementById('live-scores-prefs-sheet').classList.remove('open');
    localStorage.setItem('liveScoresFavoritesOnly', next);
    syncFavoritesOnlyToggle();
    renderLiveScoresFromCache();
    pushLiveScorePrefsToAccount();
}
function syncFavoritesOnlyToggle(){
    const btn = document.getElementById('live-scores-filter-toggle');
    const btn = document.getElementById('live-scores-refresh-btn');
    if(manual && btn) btn.classList.add('spinning');
    try{
        const res = await fetchWithRetry(`${LIVE_SCORES_API}/livescores`);
        const data = await res.json();
        if(!res.ok || !data.ok){
            // A real, well-formed error from our own Worker (bad key, upstream
            // plan/quota issue, etc) — not a connectivity problem, so no point
            // falling back to a stale cache; show the actual reason.
            renderLiveScoresError(data.error || `HTTP ${res.status}`);
            return;
        }
        renderLiveScores(liveScoresLastFixtures);
        const updatedEl = document.getElementById('live-scores-updated-label');
        if(updatedEl) updatedEl.textContent = 'Updated ' + new Date(data.fetchedAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
        // Keep the last good response around in IndexedDB — this is what
        // lets the screen show *something* (clearly marked as stale) instead
        // of a hard error when offline or when the connection is too poor to
        // reach the Worker at all.
        idbSet('liveScoresCache','v',{fixtures:liveScoresLastFixtures, fetchedAt:data.fetchedAt});
    }catch(e){
        const cached = await idbGet('liveScoresCache','v');
        if(cached && cached.fixtures && cached.fixtures.length){
            liveScoresLastFixtures = cached.fixtures;
            renderLiveScores(liveScoresLastFixtures);
            const updatedEl = document.getElementById('live-scores-updated-label');
            const stamp = new Date(cached.fetchedAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
            if(updatedEl) updatedEl.textContent = `Offline — showing scores from ${stamp}`;
        } else {
            renderLiveScoresError(!navigator.onLine
                ? "You're offline and no cached scores are saved yet — connect once to load them."
                : 'Could not reach the live scores server. This can happen on a slow or unstable connection — try again in a moment.');
        }
    }finally{
        if(manual && btn) setTimeout(()=>btn.classList.remove('spinning'), 400);
    }
// data. Empty by default: with no favorites set, Live Scores shows
// everything (unfiltered) so the feature never looks "broken" before
// someone's set anything up.
// ============================================================
function getFavLeagues(){ try{ return JSON.parse(localStorage.getItem('liveScoresFavLeagues'))||[]; }catch(e){ return []; } }
function getFavTeams(){ try{ return JSON.parse(localStorage.getItem('liveScoresFavTeams'))||[]; }catch(e){ return []; } }
function saveFavLeagues(list){ localStorage.setItem('liveScoresFavLeagues', JSON.stringify(list)); }
function saveFavTeams(list){ localStorage.setItem('liveScoresFavTeams', JSON.stringify(list)); }
function isFavoritesOnly(){ return localStorage.getItem('liveScoresFavoritesOnly') !== 'off'; } // default ON once the user has favorites

function addFavLeague(league){
    const list = getFavLeagues();
    if(list.some(l=>l.id===league.id)) return;
    list.push(league); saveFavLeagues(list);
    renderFavLeagueChips(); renderLiveScoresFromCache();
}
function removeFavLeague(id){
    saveFavLeagues(getFavLeagues().filter(l=>l.id!==id));
    renderFavLeagueChips(); renderLiveScoresFromCache();
    if(lspLeagueGroups) renderLspLeagueGroups();
    renderLspLeagueSelectRow();
}
function addFavTeam(team){
    const list = getFavTeams();
    if(list.some(t=>t.id===team.id)) return;
    list.push(team); saveFavTeams(list);
    renderFavTeamChips(); renderLiveScoresFromCache();
}
function removeFavTeam(id){
    saveFavTeams(getFavTeams().filter(t=>t.id!==id));
    renderFavTeamChips(); renderLiveScoresFromCache();
    const grid = document.getElementById('lsp-team-grid');
    if(grid && grid._teams){
        const idx = grid._teams.findIndex(t=>t.id===id);
        if(idx>=0){ const cell = grid.children[idx]; if(cell) cell.classList.remove('selected'); }
    }
}
function renderLiveScoresFromCache(){
    // Re-render with whatever we already have in memory — used right after
    // a favorites change so the Live Scores screen (if open behind the
    // preferences sheet) updates instantly without waiting for a refetch.
    if(liveScoresLastFixtures.length) renderLiveScores(liveScoresLastFixtures);
}

// ============================================================
// CATEGORIZED LEAGUE/TEAM PICKER — replaces free-text search.
// Leagues come pre-grouped from the Worker's /leagues/grouped
// endpoint (a fixed, hand-picked list — no quota-hungry search
// calls needed just to browse). Teams are picked by first
// choosing one of the user's favorite leagues, then tapping teams
// from that league's roster via /teams-by-league.
// ============================================================
let lspLeagueGroups = null;
let lspSelectedLeagueForTeams = null;

function lspSetTab(tab){
    document.querySelectorAll('#lsp-segmented .segmented-btn').forEach(b=>b.classList.toggle('active', b.dataset.value===tab));
    document.getElementById('lsp-view-leagues').style.display = tab==='leagues' ? 'block' : 'none';
    document.getElementById('lsp-view-teams').style.display = tab==='teams' ? 'block' : 'none';
    if(tab==='teams') renderLspLeagueSelectRow();
}
async function loadLspLeagueGroups(){
    if(lspLeagueGroups){ renderLspLeagueGroups(); renderLspLeagueSelectRow(); return; }
    const container = document.getElementById('lsp-league-groups');
    try{
        const res = await fetch(`${LIVE_SCORES_API}/leagues/grouped`);
        const data = await res.json();
        if(!res.ok || !data.ok) throw new Error(data.error||'failed');
        lspLeagueGroups = data.groups;
        renderLspLeagueGroups();
        renderLspLeagueSelectRow();
    }catch(e){
        if(container) container.innerHTML = '<div class="fav-search-empty">Could not load the league list — check your connection</div>';
    }
}
function renderLspLeagueGroups(){
    const container = document.getElementById('lsp-league-groups');
    if(!container || !lspLeagueGroups) return;
    const favIds = new Set(getFavLeagues().map(l=>l.id));
    container.innerHTML = lspLeagueGroups.map(g=>`
        <div class="lsp-group">
            <div class="lsp-group-title">${escapeHtml(g.group)}</div>
            ${g.leagues.map(l=>`
                <div class="perf-option-row">
                    <img src="${l.logo}" onerror="this.style.visibility='hidden'" class="lsp-league-logo">
                    <div class="perf-option-textcol">
                        <span class="perf-option-title">${escapeHtml(l.name)}</span>
                        <span class="perf-option-sub">${escapeHtml(l.country)}</span>
                    </div>
                    <div class="perf-toggle ${favIds.has(l.id)?'on':''}" onclick="lspToggleLeague(${l.id},this)"></div>
                </div>
            `).join('')}
        </div>
    `).join('');
}
function lspToggleLeague(id, toggleEl){
    const isFav = toggleEl.classList.contains('on');
    if(isFav){
        removeFavLeague(id);
        toggleEl.classList.remove('on');
    } else {
        let league = null;
        (lspLeagueGroups||[]).forEach(g=>g.leagues.forEach(l=>{ if(l.id===id) league=l; }));
        if(league){ addFavLeague(league); toggleEl.classList.add('on'); }
    }
    renderLspLeagueSelectRow();
}
function renderLspLeagueSelectRow(){
    const row = document.getElementById('lsp-league-select-row');
    if(!row) return;
    const favs = getFavLeagues();
    if(!favs.length){ row.innerHTML = '<div class="fav-chips-empty">Add a few leagues from the "Leagues" tab first</div>'; return; }
    row.innerHTML = favs.map(l=>{
        const safeName = escapeHtml(l.name).replace(/'/g,'&#39;');
        return `<div class="chip ${lspSelectedLeagueForTeams===l.id?'active':''}" onclick="lspSelectLeagueForTeams(${l.id})">${safeName}</div>`;
    }).join('');
}
async function lspSelectLeagueForTeams(leagueId){
    lspSelectedLeagueForTeams = leagueId;
    renderLspLeagueSelectRow();
    const listEl = document.getElementById('lsp-team-list');
    if(!listEl) return;
    listEl.innerHTML = '<div class="fav-search-loading"><span class="spinner"></span></div>';
    try{
        const res = await fetch(`${LIVE_SCORES_API}/teams-by-league?leagueId=${leagueId}`);
        const data = await res.json();
        if(!res.ok || !data.ok) throw new Error(data.error||'failed');
        const favIds = new Set(getFavTeams().map(t=>t.id));
        if(!data.teams.length){ listEl.innerHTML = '<div class="fav-search-empty">No teams found for this league</div>'; return; }
        // Team data is stashed on the grid element and looked up by index on
        // click, rather than inlined in the onclick attribute — keeps this
        // safe regardless of what characters end up in a team name.
        listEl.innerHTML = `<div class="lsp-team-grid" id="lsp-team-grid"></div>`;
        const gridEl = document.getElementById('lsp-team-grid');
        gridEl._teams = data.teams;
        gridEl.innerHTML = data.teams.map((t,i)=>`
            <div class="lsp-team-cell ${favIds.has(t.id)?'selected':''}" onclick="lspToggleTeam(${i},this)">
                <img src="${t.logo}" onerror="this.style.visibility='hidden'">
                <span>${escapeHtml(t.name)}</span>
            </div>
        `).join('');
    }catch(e){
        listEl.innerHTML = '<div class="fav-search-empty">Could not load teams — check your connection</div>';
    }
}
function lspToggleTeam(index, cellEl){
    const grid = document.getElementById('lsp-team-grid');
    const team = grid && grid._teams && grid._teams[index];
    if(!team) return;
    const isFav = cellEl.classList.contains('selected');
    if(isFav){ removeFavTeam(team.id); cellEl.classList.remove('selected'); }
    else{ addFavTeam(team); cellEl.classList.add('selected'); }
}
function renderFavLeagueChips(){
    const el = document.getElementById('fav-league-chips');
    if(!el) return;
    const list = getFavLeagues();
    el.innerHTML = list.length ? list.map(l=>`
        <div class="fav-chip">
            <img src="${l.logo||''}" onerror="this.style.visibility='hidden'">
            <span>${escapeHtml(l.name)}</span>
            <i class="fas fa-times" onclick="removeFavLeague(${l.id})"></i>
        </div>`).join('') : '<div class="fav-chips-empty">No favorite leagues yet — search above to add some</div>';
}
function renderFavTeamChips(){
    const el = document.getElementById('fav-team-chips');
    if(!el) return;
    const list = getFavTeams();
    el.innerHTML = list.length ? list.map(t=>`
        <div class="fav-chip">
            <img src="${t.logo||''}" onerror="this.style.visibility='hidden'">
            <span>${escapeHtml(t.name)}</span>
            <i class="fas fa-times" onclick="removeFavTeam(${t.id})"></i>
        </div>`).join('') : '<div class="fav-chips-empty">No favorite teams yet — search above to add some</div>';
}
function openLiveScoresPreferences(){
    renderFavLeagueChips();
    renderFavTeamChips();
    lspSetTab('leagues');
    loadLspLeagueGroups();
    document.getElementById('live-scores-prefs-sheet').classList.add('open');
}
function closeLiveScoresPreferences(){
    document.getElementById('live-scores-prefs-sheet').classList.remove('open');
}
function toggleFavoritesOnlyFilter(){
    const next = isFavoritesOnly() ? 'off' : 'on';
    localStorage.setItem('liveScoresFavoritesOnly', next);
    syncFavoritesOnlyToggle();
    renderLiveScoresFromCache();
}
function syncFavoritesOnlyToggle(){
    const btn = document.getElementById('live-scores-filter-toggle');
    if(!btn) return;
    const hasFavs = getFavLeagues().length>0 || getFavTeams().length>0;
    btn.style.display = hasFavs ? 'flex' : 'none';
    btn.classList.toggle('active', isFavoritesOnly());
    btn.innerHTML = isFavoritesOnly()
        ? '<i class="fas fa-star"></i> Favorites'
        : '<i class="far fa-star"></i> All Matches';
}

const LIVE_STATUS_CODES = { live: ['1H','2H','HT','ET','BT','P','LIVE','INT'], finished: ['FT','AET','PEN','PST','CANC','ABD','AWD','WO'] };
function liveScoreStatusBucket(status){
    if(LIVE_STATUS_CODES.live.includes(status)) return 'live';
    if(LIVE_STATUS_CODES.finished.includes(status)) return 'finished';
    return 'upcoming'; // NS and anything else not yet started
}
function liveScoreStatusLabel(f){
    const bucket = liveScoreStatusBucket(f.status);
    if(bucket==='live') return f.status==='HT' ? 'HT' : (f.minute!=null ? `${f.minute}'` : 'LIVE');
    if(bucket==='finished') return f.status==='PST' ? 'Postponed' : f.status==='CANC' ? 'Cancelled' : 'FT';
    const d = new Date(f.kickoff);
    return d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
}

async function fetchLiveScores(manual){
    const btn = document.getElementById('live-scores-refresh-btn');
    if(manual && btn) btn.classList.add('spinning');
    try{
        const res = await fetch(`${LIVE_SCORES_API}/livescores`);
        const data = await res.json();
        if(!res.ok || !data.ok){
            renderLiveScoresError(data.error || `HTTP ${res.status}`);
            return;
        }
        liveScoresLastFixtures = data.fixtures || [];
        renderLiveScores(liveScoresLastFixtures);
        const updatedEl = document.getElementById('live-scores-updated-label');
        if(updatedEl) updatedEl.textContent = 'Updated ' + new Date(data.fetchedAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
    }catch(e){
        renderLiveScoresError('Could not reach the live scores server — check your connection or that LIVE_SCORES_API is set correctly in config.js');
    }finally{
        if(manual && btn) setTimeout(()=>btn.classList.remove('spinning'), 400);
    }
}

function renderLiveScoresError(message){
    const body = document.getElementById('live-scores-body');
    if(!body) return;
    body.innerHTML = `<div class="live-scores-error"><i class="fas fa-triangle-exclamation mb-1"></i><br>${escapeHtml(message)}</div>`;
}

function renderLiveScores(fixtures){
    const body = document.getElementById('live-scores-body');
    if(!body) return;
    syncFavoritesOnlyToggle();

    const favLeagueIds = new Set(getFavLeagues().map(l=>l.id));
    const favTeamIds = new Set(getFavTeams().map(t=>t.id));
    const hasFavorites = favLeagueIds.size>0 || favTeamIds.size>0;
    const filtered = (hasFavorites && isFavoritesOnly())
        ? fixtures.filter(f=>favLeagueIds.has(f.leagueId) || favTeamIds.has(f.homeId) || favTeamIds.has(f.awayId))
        : fixtures;

    if(!filtered.length){
        body.innerHTML = hasFavorites && isFavoritesOnly()
            ? '<div class="live-scores-empty">None of your favorite leagues/teams are playing today.<br><span style="opacity:0.7;">Tap "Favorites" above to see everything instead.</span></div>'
            : '<div class="live-scores-empty">No matches today across any tracked league.</div>';
        return;
    }
    // Live matches first, then upcoming (soonest first), then finished — within
    // each bucket, group by league so it reads like a real scores app.
    const bucketOrder = { live:0, upcoming:1, finished:2 };
    const sorted = [...filtered].sort((a,b)=>{
        const ba=liveScoreStatusBucket(a.status), bb=liveScoreStatusBucket(b.status);
        if(bucketOrder[ba]!==bucketOrder[bb]) return bucketOrder[ba]-bucketOrder[bb];
        return a.kickoff - b.kickoff;
    });
    const groups = [];
    const groupIndex = {};
    sorted.forEach(f=>{
        const key = f.league + '|' + f.country;
        if(!(key in groupIndex)){
            groupIndex[key] = groups.length;
            groups.push({ league:f.league, country:f.country, logo:f.leagueLogo, fixtures:[] });
        }
        groups[groupIndex[key]].fixtures.push(f);
    });
    body.innerHTML = groups.map(g=>`
        <div class="live-league-group">
            <div class="live-league-header">
                ${g.logo?`<img src="${g.logo}" onerror="this.style.visibility='hidden'">`:''}
                <span>${escapeHtml(g.league)}</span>
                <span class="live-league-country">· ${escapeHtml(g.country||'')}</span>
            </div>
            ${g.fixtures.map(f=>{
                const bucket = liveScoreStatusBucket(f.status);
                const showScore = bucket!=='upcoming';
                const isFavMatch = favLeagueIds.has(f.leagueId) || favTeamIds.has(f.homeId) || favTeamIds.has(f.awayId);
                return `<div class="live-match-row${isFavMatch?' is-favorite':''}">
                    <div class="live-match-teams">
                        <div class="live-match-team">
                            <img src="${f.homeLogo||''}" onerror="this.style.visibility='hidden'">
                            <span class="live-match-team-name">${escapeHtml(f.home)}</span>
                        </div>
                        <div class="live-match-team">
                            <img src="${f.awayLogo||''}" onerror="this.style.visibility='hidden'">
                            <span class="live-match-team-name">${escapeHtml(f.away)}</span>
                        </div>
                    </div>
                    <div class="live-match-score">
                        <span class="live-match-score-num">${showScore?(f.goalsHome??'-'):''}</span>
                        <span class="live-match-score-num">${showScore?(f.goalsAway??'-'):''}</span>
                    </div>
                    <div class="live-match-status is-${bucket}">${liveScoreStatusLabel(f)}</div>
                </div>`;
            }).join('')}
        </div>`).join('');
}

// Called from navigate() when entering/leaving the Live Scores screen —
// keeps it auto-refreshing (matching the Worker's own 60s cache window)
// only while the screen is actually visible, never in the background.
function startLiveScoresAutoRefresh(){
    stopLiveScoresAutoRefresh();
    fetchLiveScores(false);
    liveScoresRefreshTimer = setInterval(()=>{
        if(!document.hidden) fetchLiveScores(false); // skip refreshes while the tab/app is backgrounded — no point burning API quota on a screen nobody's looking at
    }, 60000);
}
function stopLiveScoresAutoRefresh(){
    if(liveScoresRefreshTimer){ clearInterval(liveScoresRefreshTimer); liveScoresRefreshTimer=null; }
}
