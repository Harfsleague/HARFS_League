// ============================================================
// mba.js — MBA TOURNAMENT MODE
// ------------------------------------------------------------
// A knockout mode separate from the regular league: the app's 4 teams
// are randomly split into two semifinal pairs, each a best-of-3 (first
// to 3 leg wins advances — no scores, just who won each leg). The two
// semifinal winners then play a single-match Final (gold vs. silver);
// the two semifinal losers play a single-match Third-Place match
// (bronze — the other side gets nothing, same as 4th in a league table
// gets no medal).
//
// Medals awarded here plug directly into the existing trophy system —
// see computeTrophyCounts() in shop.js, which now reads mbaData.completed
// the same way it already reads archivedSeasons. The champion of each
// tournament additionally gets one entry in their own
// mainLeagueData[team].mbaChampionLog (see completeMbaTournament below) —
// this is the "which edition did we win" log the Overall/team panel
// shows; regular league titles intentionally get no such log.
//
// UI split: starting a tournament and recording every leg/match result
// happens in the Admin Panel (renderMbaAdminSection, admin-only); anyone
// can view the current bracket and full history from the Season tab's
// League/MBA switch (renderMbaSeasonView).
// ============================================================

// ---- GitHub load/save (same shape as loadArchiveDropdown/saveFile elsewhere) ----
async function loadMbaDataFromGitHub(){
    const cached = await idbGet('mbaData','v');
    if(cached) mbaData = cached;
    try{
        const r = await fetch(`${BASE_API}${GITHUB_MBA_FILE}?ref=${GITHUB_LEAGUE_BRANCH}`);
        if(r.ok){
            const d = await r.json();
            mbaSha = d.sha;
            mbaData = await (await fetch(d.download_url)).json();
            await idbSet('mbaData','v',mbaData);
        }
        // A 404 here is expected before the very first MBA tournament is ever
        // started — mbaData just stays at its default {current:null,completed:[]}.
    }catch(e){}
    renderMbaSeasonView();
    if(document.getElementById('admin-screen')?.classList.contains('active')) renderMbaAdminSection();
}
async function saveMbaDataToGitHub(message){
    await idbSet('mbaData','v',mbaData); // keep the offline copy in step even if the GitHub write below fails
    return saveFile(GITHUB_MBA_FILE, mbaData, message, mbaSha);
}

// ---- Starting / cancelling a tournament ----
function startNewMbaTournament(){
    if(mbaData.current){ showToast('A tournament is already in progress','info',2200); return; }
    const shuffled = [...TEAM_NAMES];
    for(let i=shuffled.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [shuffled[i],shuffled[j]] = [shuffled[j],shuffled[i]];
    }
    const edition = mbaData.completed.length + 1;
    mbaData.current = {
        edition,
        createdAt: Date.now(),
        semis: [
            { teams:[shuffled[0],shuffled[1]], wins:{[shuffled[0]]:0,[shuffled[1]]:0}, legs:[], winner:null },
            { teams:[shuffled[2],shuffled[3]], wins:{[shuffled[2]]:0,[shuffled[3]]:0}, legs:[], winner:null },
        ],
        final: { winner:null },
        thirdPlace: { winner:null },
    };
    haptic([10]);
    saveMbaDataToGitHub(`Started MBA Edition ${edition}`);
    renderMbaAdminSection();
    renderMbaSeasonView();
    showToast(`MBA Edition ${edition} started 🏆`,'success',2400);
}
async function cancelMbaTournament(){
    if(!mbaData.current) return;
    const ok = await showConfirm({icon:'🗑️',title:'Cancel this tournament?',message:'Every leg and result recorded so far will be discarded. This edition will not count toward any medals.',okLabel:'Cancel Tournament',okColor:'red'});
    if(!ok) return;
    mbaData.current = null;
    await saveMbaDataToGitHub('MBA tournament cancelled');
    renderMbaAdminSection();
    renderMbaSeasonView();
    showToast('Tournament cancelled','info',2000);
}

// ---- Recording results ----
function recordMbaSemiLeg(semiIndex, team){
    const semi = mbaData.current && mbaData.current.semis[semiIndex];
    if(!semi || semi.winner) return; // already decided or no tournament running — ignore a stray click
    semi.wins[team] = (semi.wins[team]||0) + 1;
    semi.legs.push(team);
    if(semi.wins[team] >= 3){
        semi.winner = team;
        haptic([10]);
    }
    saveMbaDataToGitHub(`MBA Edition ${mbaData.current.edition} — leg recorded`);
    renderMbaAdminSection();
    renderMbaSeasonView();
}
function undoMbaSemiLeg(semiIndex){
    const semi = mbaData.current && mbaData.current.semis[semiIndex];
    if(!semi || !semi.legs.length) return;
    const last = semi.legs.pop();
    semi.wins[last] = Math.max(0, (semi.wins[last]||0) - 1);
    semi.winner = null; // undoing a leg can only ever un-decide a semifinal, never re-decide it differently
    saveMbaDataToGitHub(`MBA Edition ${mbaData.current.edition} — leg undone`);
    renderMbaAdminSection();
    renderMbaSeasonView();
}
function recordMbaFinalWinner(team){
    if(!mbaData.current || mbaData.current.final.winner) return;
    mbaData.current.final.winner = team;
    haptic([10]);
    maybeCompleteMbaTournament();
}
function recordMbaThirdPlaceWinner(team){
    if(!mbaData.current || mbaData.current.thirdPlace.winner) return;
    mbaData.current.thirdPlace.winner = team;
    haptic([10]);
    maybeCompleteMbaTournament();
}
function maybeCompleteMbaTournament(){
    const t = mbaData.current;
    if(!t) return;
    if(t.final.winner && t.thirdPlace.winner){
        completeMbaTournament();
    } else {
        saveMbaDataToGitHub(`MBA Edition ${t.edition} — result recorded`);
        renderMbaAdminSection();
        renderMbaSeasonView();
    }
}
async function completeMbaTournament(){
    const t = mbaData.current;
    const gold = t.final.winner;
    const finalTeams = [t.semis[0].winner, t.semis[1].winner];
    const silver = finalTeams.find(x=>x!==gold);
    const bronze = t.thirdPlace.winner;
    const semiLosers = [
        t.semis[0].teams.find(x=>x!==t.semis[0].winner),
        t.semis[1].teams.find(x=>x!==t.semis[1].winner),
    ];
    const fourth = semiLosers.find(x=>x!==bronze);

    mbaData.completed.push({
        edition: t.edition,
        finishedAt: Date.now(),
        gold, silver, bronze, fourth,
        semis: t.semis, final: t.final, thirdPlace: t.thirdPlace,
    });
    mbaData.current = null;

    ensureWalletFields(gold);
    mainLeagueData[gold].mbaChampionLog.push({ edition: t.edition, ts: Date.now() });

    await saveMbaDataToGitHub(`MBA Edition ${t.edition} complete — ${gold} champion`);
    await saveMainLeagueDataToGitHub(mainLeagueData, `MBA Edition ${t.edition} champion logged`);

    showToast(`🏆 ${TEAM_DISPLAY_NAMES[gold]||gold} wins MBA Edition ${t.edition}!`,'success',4200);
    renderMbaAdminSection();
    renderMbaSeasonView();
    // Trophy counts just changed — refresh whatever's already on screen.
    if(document.getElementById('main-league-screen')?.classList.contains('active') && typeof renderMainLeagueTable==='function') renderMainLeagueTable();
}

// ---- Rendering: shared bracket markup used by both the admin view (with
// tap-to-record buttons) and the read-only Season-tab view ----
function mbaTeamLabel(team){
    return `<img src="${teamLogoUrl(team)}" style="width:18px;height:18px;border-radius:50%;object-fit:contain;background:rgba(255,255,255,0.9);vertical-align:-4px;margin-right:5px;">${escapeHtml(TEAM_DISPLAY_NAMES[team]||team)}`;
}
function mbaSemiRow(semi, index, interactive){
    const [a,b] = semi.teams;
    const done = !!semi.winner;
    const rows = [a,b].map(team=>{
        const isWinner = semi.winner===team;
        const dots = Array.from({length:3},(_,i)=>`<span class="mba-leg-dot${i<(semi.wins[team]||0)?' filled':''}"></span>`).join('');
        const clickable = interactive && !done;
        return `<div class="mba-team-row${isWinner?' winner':''}"${clickable?` onclick="recordMbaSemiLeg(${index},'${team}')"`:''} style="${clickable?'cursor:pointer;':''}">
            <span class="mba-team-label">${mbaTeamLabel(team)}</span>
            <span class="mba-leg-dots">${dots}</span>
        </div>`;
    }).join('');
    const undoBtn = (interactive && semi.legs.length && !done)
        ? `<button class="mba-undo-btn" onclick="undoMbaSemiLeg(${index})"><i class="fas fa-rotate-left"></i> Undo last leg</button>` : '';
    return `<div class="mba-bracket-match">
        <div class="mba-match-label">Semifinal ${index+1}${done?' — decided':''}</div>
        ${rows}
        ${undoBtn}
    </div>`;
}
function mbaSingleMatchRow(label, teams, winner, onPick, interactive){
    if(teams.some(t=>!t)){
        return `<div class="mba-bracket-match mba-pending"><div class="mba-match-label">${label}</div><div class="mba-pending-note">Waiting for both semifinals to finish</div></div>`;
    }
    const rows = teams.map(team=>{
        const isWinner = winner===team;
        const clickable = interactive && !winner;
        return `<div class="mba-team-row${isWinner?' winner':''}"${clickable?` onclick="${onPick}('${team}')"`:''} style="${clickable?'cursor:pointer;':''}">
            <span class="mba-team-label">${mbaTeamLabel(team)}</span>
            ${isWinner?'<i class="fas fa-crown" style="color:#fbbf24;"></i>':''}
        </div>`;
    }).join('');
    return `<div class="mba-bracket-match">
        <div class="mba-match-label">${label}${winner?' — decided':''}</div>
        ${rows}
    </div>`;
}
function mbaBracketHtml(t, interactive){
    const semisHtml = t.semis.map((s,i)=>mbaSemiRow(s,i,interactive)).join('');
    const finalTeams = [t.semis[0].winner, t.semis[1].winner];
    const thirdTeams = [
        t.semis[0].winner ? t.semis[0].teams.find(x=>x!==t.semis[0].winner) : null,
        t.semis[1].winner ? t.semis[1].teams.find(x=>x!==t.semis[1].winner) : null,
    ];
    const finalHtml = mbaSingleMatchRow('Final', finalTeams, t.final.winner, 'recordMbaFinalWinner', interactive);
    const thirdHtml = mbaSingleMatchRow('Third-Place Match', thirdTeams, t.thirdPlace.winner, 'recordMbaThirdPlaceWinner', interactive);
    return `<div class="mba-edition-label">MBA — Edition ${t.edition}</div>${semisHtml}${finalHtml}${thirdHtml}`;
}
function mbaCompletedSummaryHtml(rec){
    const d = new Date(rec.finishedAt);
    const when = isNaN(d) ? '' : d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    return `<div class="mba-history-card">
        <div class="mba-history-header"><span>Edition ${rec.edition}</span><span style="color:#6b7280;font-weight:600;">${when}</span></div>
        <div class="mba-history-podium">
            <div>🥇 ${mbaTeamLabel(rec.gold)}</div>
            <div>🥈 ${mbaTeamLabel(rec.silver)}</div>
            <div>🥉 ${mbaTeamLabel(rec.bronze)}</div>
        </div>
    </div>`;
}

// ---- Admin Panel: start/cancel + full interactive bracket ----
function renderMbaAdminSection(){
    const el = document.getElementById('mba-admin-body');
    if(!el) return;
    if(!mbaData.current){
        el.innerHTML = `<p style="font-size:0.68rem;color:#6b7280;text-align:center;margin-bottom:12px;">No tournament in progress. Starting one randomly draws all 4 teams into two semifinal pairs.</p>
        <button class="glass-button w-full text-sm py-3 font-bold" style="border-color:rgba(251,191,36,0.35);background:rgba(251,191,36,0.08);color:#fbbf24;" onclick="startNewMbaTournament()">
            <i class="fas fa-shuffle mr-2"></i>Start New Tournament
        </button>`;
        return;
    }
    el.innerHTML = mbaBracketHtml(mbaData.current, true)
        + `<button class="mba-cancel-btn" onclick="cancelMbaTournament()"><i class="fas fa-xmark mr-1"></i>Cancel Tournament</button>`;
}

// ---- Season tab: read-only bracket (if one's running) + full history ----
function renderMbaSeasonView(){
    const el = document.getElementById('mba-season-body');
    if(!el) return;
    let html = '';
    if(mbaData.current){
        html += mbaBracketHtml(mbaData.current, false);
    }
    if(mbaData.completed.length){
        html += `<div class="appearance-section-label" style="margin-top:${mbaData.current?'16px':'0'};">History</div>`
            + [...mbaData.completed].reverse().map(mbaCompletedSummaryHtml).join('');
    }
    if(!html){
        html = '<p style="font-size:0.72rem;color:#6b7280;text-align:center;margin-top:24px;">No MBA tournaments yet.</p>';
    }
    el.innerHTML = html;
}

// ---- Season tab: League ⇄ MBA switch ----
function switchSeasonView(view){
    haptic([6]);
    document.getElementById('season-league-body').style.display = view==='league' ? 'block' : 'none';
    document.getElementById('mba-season-body').style.display = view==='mba' ? 'block' : 'none';
    document.querySelectorAll('#season-view-switch .segmented-btn').forEach(b=>{
        b.classList.toggle('active', b.dataset.value===view);
    });
    if(view==='mba') renderMbaSeasonView();
}
