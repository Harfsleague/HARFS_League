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
// FAVORITES — stored per-device (localStorage), not per-team-account,
// since this is about what this person wants to see, not the team's
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
}
function renderLiveScoresFromCache(){
    // Re-render with whatever we already have in memory — used right after
    // a favorites change so the Live Scores screen (if open behind the
    // preferences sheet) updates instantly without waiting for a refetch.
    if(liveScoresLastFixtures.length) renderLiveScores(liveScoresLastFixtures);
}

// ---- Search (leagues/teams) — used only from the preferences sheet ----
let leagueSearchDebounce = null, teamSearchDebounce = null;
function onLeagueSearchInput(){
    clearTimeout(leagueSearchDebounce);
    const q = document.getElementById('league-search-input').value.trim();
    const resultsEl = document.getElementById('league-search-results');
    if(q.length<2){ resultsEl.innerHTML=''; return; }
    leagueSearchDebounce = setTimeout(()=>runFavoriteSearch('leagues', q, resultsEl, 'addFavLeague'), 400);
}
function onTeamSearchInput(){
    clearTimeout(teamSearchDebounce);
    const q = document.getElementById('team-search-input').value.trim();
    const resultsEl = document.getElementById('team-search-results');
    if(q.length<2){ resultsEl.innerHTML=''; return; }
    teamSearchDebounce = setTimeout(()=>runFavoriteSearch('teams', q, resultsEl, 'addFavTeam'), 400);
}
async function runFavoriteSearch(endpoint, query, resultsEl, onAddFnName){
    resultsEl.innerHTML = '<div class="fav-search-loading"><span class="spinner"></span></div>';
    try{
        const res = await fetch(`${LIVE_SCORES_API}/${endpoint}?search=${encodeURIComponent(query)}`);
        const data = await res.json();
        if(!res.ok || !data.ok){ resultsEl.innerHTML = `<div class="fav-search-empty">${escapeHtml(data.error||'Search failed')}</div>`; return; }
        if(!data.results.length){ resultsEl.innerHTML = '<div class="fav-search-empty">No matches found</div>'; return; }
        // Results are stashed on the element and looked up by index on click,
        // rather than inlined as JSON in the onclick attribute — keeps this
        // safe regardless of what characters end up in a team/league name.
        resultsEl._searchResults = data.results;
        resultsEl.innerHTML = data.results.map((r,i)=>`
            <div class="fav-search-row" onclick="${onAddFnName}(document.getElementById('${resultsEl.id}')._searchResults[${i}])">
                <img src="${r.logo||''}" onerror="this.style.visibility='hidden'">
                <span class="fav-search-name">${escapeHtml(r.name)}</span>
                <span class="fav-search-country">${escapeHtml(r.country||'')}</span>
                <i class="fas fa-plus fav-search-add"></i>
            </div>`).join('');
    }catch(e){
        resultsEl.innerHTML = '<div class="fav-search-empty">Could not reach the search server</div>';
    }
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
    document.getElementById('league-search-input').value='';
    document.getElementById('team-search-input').value='';
    document.getElementById('league-search-results').innerHTML='';
    document.getElementById('team-search-results').innerHTML='';
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
