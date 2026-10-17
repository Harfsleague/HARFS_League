// ============================================================
// mba.js — CUP TOURNAMENT MODE
// ------------------------------------------------------------
// A knockout mode separate from the regular league: the app's 4 teams
// are randomly split into two semifinal pairs. Each semifinal is a
// series — first team to MBA_SEMI_WINS_NEEDED game wins advances.
// The two semifinal winners then play a single-match Final (gold vs.
// silver); the two semifinal losers play a single-match Third-Place
// match (bronze — the loser gets no medal, like 4th in a league table).
//
// v2 changes:
//  - every game now stores its SCORE (not just who won) and is listed
//    as match history inside its own bracket block;
//  - any result can be edited (or deleted, while the tournament is
//    still running) — see the result sheet (#mba-result-sheet);
//  - the bracket is drawn as a real tree: semifinals → final, with the
//    third-place match underneath;
//  - the edition picker on the Season → CUP tab is fully independent
//    from the League season picker;
//  - auditMbaData() (used by "Verify Table" in js/verify.js) re-derives
//    everything from the stored games and repairs medals / champion logs.
//
// Data shape (mbaData.current / each mbaData.completed[i]):
//   semis[i]    = { teams:[a,b], legs:[{winner,scores:{a:n,b:n},ts,editedAt?}], wins:{a:n,b:n}, winner }
//   final       = { winner, scores, teams:[a,b], ts, editedAt? }   (or {winner:null})
//   thirdPlace  = same as final
// Older saves stored legs as plain team-name strings and had no scores —
// normalizeMbaData() upgrades them in memory (a leg without a score just
// shows "—" until an admin edits it).
//
// SCHEDULE: since the season-flow system (js/flow.js) a CUP edition is no longer
// started by hand — it is drawn automatically at the right point of the season
// (after league matchweek 6), the semifinals can only be played in that stage,
// and the Final + Third-Place match only after the league has finished.
// An edition drawn by the schedule carries `seasonId`.
//
// Medals plug into computeTrophyCounts() in shop.js, which reads
// mbaData.completed. The champion of each tournament also gets one entry
// in mainLeagueData[team].mbaChampionLog (Edition #N badge in the team panel).
// ============================================================

const MBA_SEMI_WINS_NEEDED = 3;   // change to 2 for a true "best of 3"

let mbaViewValue = null;  // edition shown on Season → CUP: 'current' | 'ed:<n>' | null (= newest)
let mbaEditCtx   = null;  // state of the result-editor sheet
let mbaBusy      = false; // blocks double-taps / overlapping saves

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------
function mbaClone(o){ return JSON.parse(JSON.stringify(o)); }
function mbaName(team){ return (TEAM_DISPLAY_NAMES && TEAM_DISPLAY_NAMES[team]) || team || '—'; }
function mbaCanEdit(){
    return !!isAdminUnlocked || !!document.getElementById('admin-screen')?.classList.contains('active');
}
function mbaSameTeams(a,b){
    return Array.isArray(a) && Array.isArray(b) && a.length===b.length && a.every(x=>b.includes(x));
}

// ------------------------------------------------------------
// Load / save / normalize
// ------------------------------------------------------------
function normalizeMbaTournament(t){
    if(!t) return;
    (t.semis||[]).forEach(semi=>{
        if(!semi || !Array.isArray(semi.teams)) return;
        semi.legs = (Array.isArray(semi.legs) ? semi.legs : []).map(l => (typeof l==='string') ? { winner:l, scores:null } : l);
        if(!semi.wins) semi.wins = {};
        semi.teams.forEach(x=>{ if(semi.wins[x]==null) semi.wins[x] = 0; });
    });
    if(!t.final) t.final = { winner:null };
    if(!t.thirdPlace) t.thirdPlace = { winner:null };
}
function normalizeMbaData(){
    if(!mbaData || typeof mbaData!=='object') mbaData = { current:null, completed:[] };
    if(!Array.isArray(mbaData.completed)) mbaData.completed = [];
    if(mbaData.current) normalizeMbaTournament(mbaData.current);
    mbaData.completed.forEach(normalizeMbaTournament);
}
async function loadMbaDataFromGitHub(){
    if(mbaBusy) return; // never overwrite a save that's still in flight
    const cached = await idbGet('mbaData','v');
    if(cached) mbaData = cached;
    try{
        const r = await fetch(`${BASE_API}${GITHUB_MBA_FILE}?ref=${GITHUB_LEAGUE_BRANCH}`);
        if(r.ok){
            const d = await r.json();
            mbaSha = d.sha;
            mbaData = await (await fetch(d.download_url+'?t='+Date.now())).json();
            await idbSet('mbaData','v',mbaData);
        }
        // A 404 here is expected before the very first tournament — mbaData stays {current:null,completed:[]}.
    }catch(e){}
    normalizeMbaData();
    renderMbaSeasonView();
    if(document.getElementById('admin-screen')?.classList.contains('active')) renderMbaAdminSection();
}
async function saveMbaDataToGitHub(message){
    await idbSet('mbaData','v',mbaData); // keep the offline copy in step even if the GitHub write fails
    return saveFile(GITHUB_MBA_FILE, mbaData, message, mbaSha);
}
async function mbaPersist(message){
    const ok = await saveMbaDataToGitHub(message);
    if(!ok) showToast('Saved locally — check your connection','info',3000);
    return ok;
}

// ------------------------------------------------------------
// Bracket logic (pure functions — no DOM)
// ------------------------------------------------------------
// Walks a semifinal's games in order; the series ends the moment a team
// reaches MBA_SEMI_WINS_NEEDED. decidedAt = index of the deciding game (-1 = undecided).
function mbaSemiTally(semi){
    const wins = {}; semi.teams.forEach(x=>wins[x]=0);
    let winner = null, decidedAt = -1;
    semi.legs.forEach((l,i)=>{
        if(decidedAt>=0) return;
        if(!(l.winner in wins)) return;
        wins[l.winner]++;
        if(wins[l.winner] >= MBA_SEMI_WINS_NEEDED){ winner = l.winner; decidedAt = i; }
    });
    return { wins, winner, decidedAt };
}
function mbaFinalists(t){ return [t.semis[0].winner||null, t.semis[1].winner||null]; }
function mbaThirdTeams(t){
    return t.semis.map(s => s.winner ? (s.teams.find(x=>x!==s.winner)||null) : null);
}
// A stored Final/Third result is only meaningful while it still matches the
// two teams the semifinals currently say should be playing it.
function mbaResultValid(res, teams){
    if(!res || !res.winner) return false;
    if(teams.some(x=>!x)) return false;
    if(!teams.includes(res.winner)) return false;
    if(res.teams && !mbaSameTeams(res.teams, teams)) return false;
    return true;
}
function mbaIsFullyDecided(t){
    if(!t || !t.semis || t.semis.some(s=>!s.winner)) return false;
    return mbaResultValid(t.final, mbaFinalists(t)) && mbaResultValid(t.thirdPlace, mbaThirdTeams(t));
}
function mbaComputeMedals(t){
    const gold   = t.final.winner || null;
    const silver = mbaFinalists(t).find(x=>x && x!==gold) || null;
    const bronze = t.thirdPlace.winner || null;
    const fourth = mbaThirdTeams(t).find(x=>x && x!==bronze) || null;
    return { gold, silver, bronze, fourth };
}
// Re-derives every semifinal from its games and drops any Final/Third result
// that no longer matches. Mutates `t`, returns human-readable notes about
// anything that had to be removed (empty array = nothing side-effect-y happened).
function mbaReconcile(t){
    const notes = [];
    t.semis.forEach((semi,i)=>{
        const { wins, winner, decidedAt } = mbaSemiTally(semi);
        if(decidedAt>=0 && decidedAt < semi.legs.length-1){
            const extra = semi.legs.length-1-decidedAt;
            semi.legs.length = decidedAt+1;
            notes.push(`Semifinal ${i+1}: ${extra} game${extra===1?'':'s'} after the series was decided will be removed.`);
        }
        semi.wins = wins; semi.winner = winner;
    });
    if(t.final.winner && !mbaResultValid(t.final, mbaFinalists(t))){
        t.final = { winner:null };
        notes.push('The Final result no longer matches its finalists and will be cleared.');
    }
    if(t.thirdPlace.winner && !mbaResultValid(t.thirdPlace, mbaThirdTeams(t))){
        t.thirdPlace = { winner:null };
        notes.push('The Third-Place result no longer matches its teams and will be cleared.');
    }
    return notes;
}

// ------------------------------------------------------------
// Start / cancel / complete / reopen
// ------------------------------------------------------------
// Called by the season schedule (flowStartCup in js/flow.js) — there is no
// stand-alone "Start Tournament" button any more. Returns the new edition number.
async function startNewMbaTournament(opts){
    opts = opts || {};
    if(mbaBusy) return null;
    if(mbaData.current){ showToast('A tournament is already in progress','info',2200); return null; }
    const shuffled = [...TEAM_NAMES];
    for(let i=shuffled.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [shuffled[i],shuffled[j]] = [shuffled[j],shuffled[i]];
    }
    const edition = mbaData.completed.reduce((m,r)=>Math.max(m,r.edition||0),0) + 1;
    mbaBusy = true;
    mbaData.current = {
        edition,
        createdAt: Date.now(),
        seasonId: opts.seasonId ?? null,
        semis: [
            { teams:[shuffled[0],shuffled[1]], wins:{[shuffled[0]]:0,[shuffled[1]]:0}, legs:[], winner:null },
            { teams:[shuffled[2],shuffled[3]], wins:{[shuffled[2]]:0,[shuffled[3]]:0}, legs:[], winner:null },
        ],
        final: { winner:null },
        thirdPlace: { winner:null },
    };
    mbaViewValue = 'current';
    haptic([10]);
    renderMbaAdminSection(); renderMbaSeasonView();
    await mbaPersist(`Started CUP Edition ${edition}`);
    mbaBusy = false;
    showToast(`CUP Edition ${edition} drawn 🏆`,'success',2400);
    return edition;
}
async function cancelMbaTournament(){
    if(!mbaData.current || mbaBusy) return;
    const ok = await showConfirm({icon:'🗑️',title:'Cancel this tournament?',message:'Every game and result recorded so far will be discarded. This edition will not count toward any medals.',okLabel:'Cancel Tournament',okColor:'red'});
    if(!ok) return;
    mbaBusy = true;
    mbaData.current = null;
    mbaViewValue = null;
    await mbaPersist('CUP tournament cancelled');
    mbaBusy = false;
    renderMbaAdminSection(); renderMbaSeasonView();
    showToast('Tournament cancelled','info',2000);
}
async function completeMbaTournament(){
    const t = mbaData.current;
    if(!t || !mbaIsFullyDecided(t)){ showToast('Some results are still missing','error',2400); return; }
    const wasBusy = mbaBusy; mbaBusy = true;
    const m = mbaComputeMedals(t);
    mbaData.completed.push({
        edition: t.edition, createdAt: t.createdAt, finishedAt: Date.now(),
        gold:m.gold, silver:m.silver, bronze:m.bronze, fourth:m.fourth,
        semis: t.semis, final: t.final, thirdPlace: t.thirdPlace,
    });
    mbaData.current = null;
    mbaViewValue = 'ed:'+t.edition;

    ensureWalletFields(m.gold);
    mainLeagueData[m.gold].mbaChampionLog = (mainLeagueData[m.gold].mbaChampionLog||[]).filter(e=>e.edition!==t.edition);
    mainLeagueData[m.gold].mbaChampionLog.push({ edition: t.edition, ts: Date.now() });

    await saveMbaDataToGitHub(`CUP Edition ${t.edition} complete — ${m.gold} champion`);
    await saveMainLeagueDataToGitHub(mainLeagueData, `CUP Edition ${t.edition} champion logged`);
    mbaBusy = wasBusy;

    showToast(`🏆 ${mbaName(m.gold)} wins CUP Edition ${t.edition}!`,'success',4200);
    renderMbaAdminSection(); renderMbaSeasonView();
    if(document.getElementById('main-league-screen')?.classList.contains('active') && typeof renderMainLeagueTable==='function') renderMainLeagueTable();
}
// Escape hatch for fixing a mistake on a FINISHED edition: moves the most
// recent completed edition back to "in progress" (its medals and champion
// entry are withdrawn until it's finished again).
async function reopenLastMbaEdition(){
    if(mbaBusy) return;
    if(mbaData.current){ showToast('Finish or cancel the running tournament first','info',2600); return; }
    const rec = mbaData.completed[mbaData.completed.length-1];
    if(!rec) return;
    const ok = await showConfirm({icon:'♻️',title:`Reopen Edition ${rec.edition}?`,message:'Its medals and champion entry are withdrawn until you finish it again. You can then fix any result from the Admin Panel.',okLabel:'Reopen',okColor:'purple'});
    if(!ok) return;
    mbaBusy = true;
    mbaData.completed.pop();
    mbaData.current = { edition:rec.edition, createdAt:rec.createdAt||rec.finishedAt, semis:rec.semis, final:rec.final, thirdPlace:rec.thirdPlace };
    TEAM_NAMES.forEach(team=>{
        ensureWalletFields(team);
        mainLeagueData[team].mbaChampionLog = (mainLeagueData[team].mbaChampionLog||[]).filter(e=>e.edition!==rec.edition);
    });
    mbaViewValue = 'current';
    await saveMbaDataToGitHub(`CUP Edition ${rec.edition} reopened`);
    await saveMainLeagueDataToGitHub(mainLeagueData, `CUP Edition ${rec.edition} reopened — champion entry withdrawn`);
    mbaBusy = false;
    renderMbaAdminSection(); renderMbaSeasonView();
    if(typeof renderMainLeagueTable==='function') renderMainLeagueTable();
    showToast(`Edition ${rec.edition} reopened — fix it in the Admin Panel`,'info',3200);
}

// ------------------------------------------------------------
// Result editor sheet (record a new game / edit / delete)
// ------------------------------------------------------------
// scope: 'current' | 'completed'.  kind: 'semi' | 'final' | 'third'.
// legIndex === null means "record a new game".
function openMbaResultSheet(scope, edition, kind, semiIndex, legIndex){
    if(!mbaCanEdit()) return;
    const t = scope==='current' ? mbaData.current : mbaData.completed.find(r=>r.edition===edition);
    if(!t) return;
    // new results (not corrections) only when the schedule has reached that stage
    if(scope==='current' && legIndex==null && typeof flowAllowsCup==='function' && !flowAllowsCup(kind==='semi'?'semi':'final')){
        showToast(kind==='semi' ? `CUP semifinals are played after league matchweek ${flowHalf()}` : `The final and third-place match come after league matchweek ${flowRounds()}`,'info',3000);
        return;
    }
    let teams, existing = null, title;
    if(kind==='semi'){
        const semi = t.semis[semiIndex];
        teams = semi.teams.slice();
        if(legIndex==null){
            if(semi.winner){ showToast('This semifinal is already decided','info',2000); return; }
            title = `Semifinal ${semiIndex+1} — Game ${semi.legs.length+1}`;
        } else {
            existing = semi.legs[legIndex];
            title = `Semifinal ${semiIndex+1} — Game ${legIndex+1}`;
        }
    } else {
        teams = kind==='final' ? mbaFinalists(t) : mbaThirdTeams(t);
        const res = kind==='final' ? t.final : t.thirdPlace;
        existing = res && res.winner ? res : null;
        title = kind==='final' ? 'Final' : 'Third-Place Match';
    }
    if(!teams || teams.some(x=>!x)) return;
    haptic([8]);

    let a = 0, b = 0;
    if(existing){
        if(existing.scores){ a = existing.scores[teams[0]]||0; b = existing.scores[teams[1]]||0; }
        else { a = existing.winner===teams[0] ? 1 : 0; b = existing.winner===teams[1] ? 1 : 0; } // legacy game with no score
    }
    mbaEditCtx = { scope, edition:t.edition, kind, semiIndex, legIndex:(legIndex==null?null:legIndex), teams, a, b, existing:!!existing };

    document.getElementById('mba-result-title').textContent = title;
    let sub = '';
    if(existing && existing.ts){
        const dt = formatShamsiDateTime(existing.ts);
        sub = `Recorded ${dt.date} · ${dt.time}`;
        if(existing.editedAt){ const e = formatShamsiDateTime(existing.editedAt); sub += ` — edited ${e.date}`; }
    }
    document.getElementById('mba-result-sub').textContent = sub;
    ['a','b'].forEach((k,i)=>{
        const logo = document.getElementById('mba-result-logo-'+k);
        logo.src = teamLogoUrl(teams[i]);
        document.getElementById('mba-result-name-'+k).textContent = mbaName(teams[i]);
        document.getElementById('mba-result-score-'+k).textContent = k==='a' ? a : b;
    });
    document.getElementById('mba-result-error').style.display = 'none';
    // admin: each team's active card above the score (js/cards.js) — only while recording a NEW game
    const cardsBox = document.getElementById('mba-result-cards');
    if(cardsBox){
        cardsBox.innerHTML=''; delete cardsBox.dataset.teams;
        if(!existing && scope==='current' && isFullAdmin()){
            if(kind==='final'){ if(typeof cardsFreeNoteHtml==='function') cardsBox.innerHTML = cardsFreeNoteHtml('the CUP final'); }   // no cards in the final
            else if(typeof cardsPrepMatch==='function') cardsPrepMatch(teams);                                                     // view-only: the cards the teams chose
        }
    }
    const delBtn = document.getElementById('mba-result-delete-btn');
    delBtn.style.display = (existing && scope==='current') ? 'flex' : 'none';
    document.getElementById('mba-result-note').textContent = scope==='completed'
        ? 'This edition is finished — you can correct the score, but not who won. Use “Reopen” below the bracket to change the outcome.'
        : 'No draws in a knockout — one team must score more.';
    document.getElementById('mba-result-sheet').classList.add('open');
}
function closeMbaResultSheet(clear=true){
    document.getElementById('mba-result-sheet').classList.remove('open');
    const cb = document.getElementById('mba-result-cards'); if(cb){ cb.innerHTML=''; delete cb.dataset.teams; }
    if(clear) mbaEditCtx = null;
}
function changeMbaScore(side, delta){
    if(!mbaEditCtx) return;
    haptic([6]);
    const k = side==='a' ? 'a' : 'b';
    mbaEditCtx[k] = Math.max(0, mbaEditCtx[k] + delta);
    document.getElementById('mba-result-score-'+k).textContent = mbaEditCtx[k];
    document.getElementById('mba-result-error').style.display = 'none';
}
function mbaReopenSheetUi(){ document.getElementById('mba-result-sheet').classList.add('open'); }

async function saveMbaResult(){
    const c = mbaEditCtx;
    if(!c || mbaBusy) return;
    const errEl = document.getElementById('mba-result-error');
    const fail = msg => { errEl.textContent = msg; errEl.style.display = 'block'; haptic([60]); };
    errEl.style.display = 'none';
    if(c.a===c.b){ fail('Knockout games can’t end in a draw — one team must score more.'); return; }
    const winner = c.a > c.b ? c.teams[0] : c.teams[1];
    const scores = { [c.teams[0]]:c.a, [c.teams[1]]:c.b };
    const now = Date.now();

    // ---- finished edition: score-only edits, outcome must stay the same ----
    if(c.scope==='completed'){
        const rec = mbaData.completed.find(r=>r.edition===c.edition);
        const target = rec && (c.kind==='semi' ? rec.semis[c.semiIndex].legs[c.legIndex] : (c.kind==='final' ? rec.final : rec.thirdPlace));
        if(!target){ fail('This result no longer exists.'); return; }
        if(target.winner !== winner){ fail('On a finished edition only the score can change, not who won. Use “Reopen” to correct the outcome.'); return; }
        mbaBusy = true;
        target.scores = scores; target.editedAt = now;
        closeMbaResultSheet();
        await mbaPersist(`CUP Edition ${rec.edition} — result edited`);
        mbaBusy = false;
        showToast('Result updated ✏️','success',2000);
        renderMbaSeasonView();
        return;
    }

    // ---- running tournament ----
    const cur = mbaData.current;
    if(!cur || cur.edition!==c.edition){ fail('This tournament is no longer running.'); return; }
    const draft = mbaClone(cur);
    if(c.kind==='semi'){
        const semi = draft.semis[c.semiIndex];
        if(c.legIndex==null) semi.legs.push({ winner, scores, ts:now });
        else semi.legs[c.legIndex] = { ...semi.legs[c.legIndex], winner, scores, editedAt:now };
    } else {
        const key = c.kind==='final' ? 'final' : 'thirdPlace';
        const prev = draft[key];
        draft[key] = { winner, scores, teams:c.teams.slice(), ts:(prev && prev.ts) || now };
        if(prev && prev.winner) draft[key].editedAt = now;
    }
    const notes = mbaReconcile(draft);
    if(notes.length){
        closeMbaResultSheet(false);
        const ok = await showConfirm({icon:'⚠️',title:'This edit affects other results',message:notes.join(' '),okLabel:'Apply',okColor:'purple'});
        if(!ok){ mbaReopenSheetUi(); return; }
    }
    // NEW semifinal game / third-place match: the teams' active cards are used up by the Worker and written on the game.
    // (The final never uses cards.) The admin cannot influence which cards were played.
    if(!c.existing && c.kind!=='final' && typeof cardsRecordGame==='function'){
        const li = c.kind==='semi' ? cur.semis[c.semiIndex].legs.length : null;
        const rec = await cardsRecordGame(c.kind==='semi' ? 'semi' : 'third', c.teams, c.kind==='semi' ? `C:${cur.edition}:s${c.semiIndex}:l${li}` : `C:${cur.edition}:third`);
        if(!rec.ok){ mbaReopenSheetUi(); fail(rec.error || 'Could not record the cards — result not saved'); return; }
        if(rec.cards){
            const tgt = c.kind==='semi' ? draft.semis[c.semiIndex].legs[li] : draft.thirdPlace;
            if(tgt) tgt.cards = rec.cards;
        }
    }
    mbaBusy = true;
    mbaData.current = draft;
    closeMbaResultSheet();
    const existed = c.existing;
    if(c.kind!=='semi' && !existed && mbaIsFullyDecided(draft)){
        await completeMbaTournament(); // last missing result → award medals right away
    } else {
        await mbaPersist(`CUP Edition ${draft.edition} — result ${existed?'edited':'recorded'}`);
        showToast(existed ? 'Result updated ✏️' : 'Result saved ✅','success',1800);
    }
    mbaBusy = false;
    renderMbaAdminSection(); renderMbaSeasonView();
}
async function deleteMbaResult(){
    const c = mbaEditCtx;
    if(!c || mbaBusy || c.scope!=='current' || !c.existing) return;
    const cur = mbaData.current;
    if(!cur || cur.edition!==c.edition) return;
    const draft = mbaClone(cur);
    if(c.kind==='semi') draft.semis[c.semiIndex].legs.splice(c.legIndex,1);
    else draft[c.kind==='final' ? 'final' : 'thirdPlace'] = { winner:null };
    const notes = mbaReconcile(draft);
    closeMbaResultSheet(false);
    const ok = await showConfirm({icon:'🗑️',title:'Delete this result?',message:['It will be removed from the match history.',...notes].join(' '),okLabel:'Delete',okColor:'red'});
    if(!ok){ mbaReopenSheetUi(); return; }
    mbaBusy = true;
    mbaData.current = draft;
    closeMbaResultSheet();
    await mbaPersist(`CUP Edition ${draft.edition} — result deleted`);
    mbaBusy = false;
    showToast('Result deleted','success',1800);
    renderMbaAdminSection(); renderMbaSeasonView();
}

// ------------------------------------------------------------
// Rendering — bracket tree
// ------------------------------------------------------------
function mbaTeamLabel(team){
    return `<img class="mba-logo" src="${teamLogoUrl(team)}" alt=""><span class="nm">${escapeHtml(mbaName(team))}</span>`;
}
function mbaMiniLogo(team){
    return `<img class="mba-mini-logo" src="${teamLogoUrl(team)}" alt="">`;
}
function mbaMakeCtx(mode, scope, edition){
    const canEdit = (mode==='admin') || !!isAdminUnlocked;
    // The schedule decides WHEN games may be recorded (semis → after league MW6, final/third → after MW12)
    const allow = k => (typeof flowAllowsCup==='function') ? flowAllowsCup(k) : true;
    return { scope, edition, canEdit, canRecord: canEdit && scope==='current', allowSemi: allow('semi'), allowFinal: allow('final') };
}
function mbaEditBtn(ctx, kind, semiIdx, legIdx){
    if(!ctx.canEdit) return '';
    const s = semiIdx==null ? 'null' : semiIdx;
    const l = legIdx==null ? 'null' : legIdx;
    return `<button class="mba-hist-edit" onclick="openMbaResultSheet('${ctx.scope}',${ctx.edition},'${kind}',${s},${l})" aria-label="Edit result"><i class="fas fa-pen"></i></button>`;
}
function mbaScoreHtml(teams, res){
    const [a,b] = teams;
    if(!res || !res.scores) return `<span class="mba-hist-score"><span class="mba-noscore">score not recorded</span></span>`;
    const sa = res.scores[a], sb = res.scores[b];
    return `<span class="mba-hist-score">${mbaMiniLogo(a)}<b class="${res.winner===a?'w':''}">${sa==null?'–':sa}</b><i>:</i><b class="${res.winner===b?'w':''}">${sb==null?'–':sb}</b>${mbaMiniLogo(b)}</span>`;
}
function mbaSemiBlock(t, i, ctx){
    const semi = t.semis[i];
    const tally = mbaSemiTally(semi);
    const done = !!semi.winner;
    const rows = semi.teams.map(team=>{
        const isW = semi.winner===team;
        return `<div class="mba-team-row${isW?' winner':''}${done&&!isW?' loser':''}">
            <span class="mba-team-label">${mbaTeamLabel(team)}</span>
            <span class="mba-wins">${tally.wins[team]}</span>
        </div>`;
    }).join('');
    const hist = semi.legs.length
        ? semi.legs.map((leg,li)=>`<div class="mba-hist-row"><span class="mba-hist-tag">G${li+1}</span>${mbaScoreHtml(semi.teams, leg)}${mbaEditBtn(ctx,'semi',i,li)}</div>${typeof cardsGameHtml==='function'?cardsGameHtml(leg.cards):''}`).join('')
        : `<div class="mba-hist-empty">No games played yet</div>`;
    const add = (ctx.canRecord && ctx.allowSemi && !done)
        ? `<button class="mba-add-btn" onclick="openMbaResultSheet('current',${ctx.edition},'semi',${i},null)"><i class="fas fa-plus"></i> Add game result</button>` : '';
    return `<div class="mba-block mba-semi${done?' decided':''}">
        <div class="mba-block-head"><span>Semifinal ${i+1}</span><span class="mba-block-tag">${done?'Decided':`First to ${MBA_SEMI_WINS_NEEDED}`}</span></div>
        ${rows}
        <div class="mba-hist"><div class="mba-hist-title">Match history</div>${hist}</div>
        ${add}
    </div>`;
}
function mbaSingleBlock(t, kind, ctx){
    const isFinal = kind==='final';
    const label = isFinal ? '🏆 Final' : '🥉 Third place';
    const teams = isFinal ? mbaFinalists(t) : mbaThirdTeams(t);
    const res = isFinal ? t.final : t.thirdPlace;
    const cls = isFinal ? 'mba-final' : 'mba-third';
    if(teams.some(x=>!x)){
        const tbd = `<div class="mba-team-row tbd"><span class="mba-team-label"><span class="mba-logo mba-logo-tbd">?</span><span class="nm">To be decided</span></span><span class="mba-wins">–</span></div>`;
        return `<div class="mba-block ${cls} mba-pending">
            <div class="mba-block-head"><span>${label}</span><span class="mba-block-tag">Upcoming</span></div>
            ${tbd}${tbd}
            <div class="mba-pending-note">Waiting for the semifinals</div>
        </div>`;
    }
    const decided = !!res.winner;
    const lockedNote = (!decided && ctx.scope==='current' && ctx.allowFinal===false)
        ? `<div class="mba-pending-note">Played after league matchweek ${typeof flowRounds==='function'?flowRounds():8}</div>` : '';
    const rows = teams.map(team=>{
        const isW = res.winner===team;
        const sc = res.scores ? res.scores[team] : null;
        const crown = (isW && isFinal) ? '<i class="fas fa-crown mba-crown"></i>' : '';
        return `<div class="mba-team-row${isW?' winner':''}${decided&&!isW?' loser':''}">
            <span class="mba-team-label">${mbaTeamLabel(team)}${crown}</span>
            <span class="mba-wins">${decided ? (sc!=null ? sc : (isW?'✓':'')) : '–'}</span>
        </div>`;
    }).join('');
    const hist = decided
        ? `<div class="mba-hist-row"><span class="mba-hist-tag">FT</span>${mbaScoreHtml(teams,res)}${mbaEditBtn(ctx,kind,null,null)}</div>${typeof cardsGameHtml==='function'?cardsGameHtml(res.cards):''}`
        : `<div class="mba-hist-empty">Not played yet</div>`;
    const add = (ctx.canRecord && ctx.allowFinal && !decided)
        ? `<button class="mba-add-btn" onclick="openMbaResultSheet('current',${ctx.edition},'${kind}',null,null)"><i class="fas fa-plus"></i> Add result</button>` : '';
    return `<div class="mba-block ${cls}${decided?' decided':''}">
        <div class="mba-block-head"><span>${label}</span><span class="mba-block-tag">${decided?'Played':'To play'}</span></div>
        ${rows}
        <div class="mba-hist"><div class="mba-hist-title">Match history</div>${hist}</div>
        ${add}${lockedNote}
    </div>`;
}
// ---- Super Cup of the season this CUP edition belongs to (league champion vs CUP champion) ----
// The result is entered in Admin → Season Control (js/flow.js); it is shown here, read-only, under the third-place game.
function mbaSuperSeason(edition){
    const f = (typeof flowCur==='function') ? flowCur() : null;
    if(f && f.cupEdition===edition) return { f, archived:false };
    if(f && f.cupEdition==null && !mbaData.current && edition===mbaNextEdition()) return { f, archived:false };   // draw still pending
    const s = (typeof archivedSeasons!=='undefined' ? archivedSeasons : []).find(x=>x.cupEdition===edition);
    return s ? { f:s, archived:true } : null;
}
function mbaSuperHtml(edition){
    const ss = mbaSuperSeason(edition);
    const divider = `<div class="mba-super-divider" aria-hidden="true"></div>`;
    if(!ss) return divider + `<div class="mba-third-wrap mba-super-wrap"><div class="mba-block mba-super mba-pending"><div class="mba-block-head"><span>⚡ Super Cup</span><span class="mba-block-tag">—</span></div><div class="mba-pending-note">No Super Cup recorded</div></div></div>`;
    const f = ss.f;
    const sc = f.superCup && f.superCup.winner && f.superCup.teams ? f.superCup : null;
    let teams = sc ? sc.teams : null;
    if(!teams && !ss.archived && typeof flowSuperCupTeams==='function'){ const w = flowSuperCupTeams(f); if(w) teams = w.teams; }
    const tbd = `<div class="mba-team-row tbd"><span class="mba-team-label"><span class="mba-logo mba-logo-tbd">?</span><span class="nm">${ss.archived?'—':'To be decided'}</span></span><span class="mba-wins">–</span></div>`;
    let rows, hist = '', note = '';
    if(teams){
        rows = teams.map(team=>{
            const isW = sc && sc.winner===team;
            const score = sc && sc.scores ? sc.scores[team] : null;
            return `<div class="mba-team-row${isW?' winner':''}${sc&&!isW?' loser':''}"><span class="mba-team-label">${mbaTeamLabel(team)}${isW?'<i class="fas fa-bolt mba-crown"></i>':''}</span><span class="mba-wins">${sc ? (score!=null?score:(isW?'✓':'')) : '–'}</span></div>`;
        }).join('');
        hist = sc ? `<div class="mba-hist"><div class="mba-hist-title">Match history</div><div class="mba-hist-row"><span class="mba-hist-tag">FT</span>${mbaScoreHtml(teams, sc)}</div></div>` : '';
        if(!sc) note = `<div class="mba-pending-note">${ss.archived?'Not played':'To be played after the CUP final'}</div>`;
    } else {
        rows = tbd + tbd;
        note = `<div class="mba-pending-note">${ss.archived?'No Super Cup recorded':'League champion vs CUP champion'}</div>`;
    }
    return divider + `<div class="mba-third-wrap mba-super-wrap"><div class="mba-block mba-super${sc?' decided':''}${teams?'':' mba-pending'}">
        <div class="mba-block-head"><span>⚡ Super Cup</span><span class="mba-block-tag">${sc?'Played':(teams?'To play':'Upcoming')}</span></div>
        ${rows}${hist}${note}
    </div></div>`;
}
// Semifinals on the left, Final on the right, joined by connector lines;
// the Third-Place match sits underneath. Connector geometry lives in css/mba.css
// (both link cells are exactly half the tree's height, so lines meet at the Final's centre).
function mbaTreeHtml(t, ctx){
    const d0 = !!t.semis[0].winner, d1 = !!t.semis[1].winner;
    return `<div class="mba-tree-scroll">
        <div class="mba-tree">
            <div class="mba-cell mba-c-semi1">${mbaSemiBlock(t,0,ctx)}</div>
            <div class="mba-c-link mba-c-link1${d0?' done':''}"><div class="mba-link-out${(d0&&d1)?' done':''}"></div></div>
            <div class="mba-cell mba-c-semi2">${mbaSemiBlock(t,1,ctx)}</div>
            <div class="mba-c-link mba-c-link2${d1?' done':''}"></div>
            <div class="mba-cell mba-c-final">${mbaSingleBlock(t,'final',ctx)}</div>
        </div>
        <div class="mba-third-wrap">${mbaSingleBlock(t,'third',ctx)}</div>
        ${mbaSuperHtml(t.edition)}
    </div>`;
}
function mbaCompletedSummaryHtml(rec){
    const d = new Date(rec.finishedAt);
    const when = isNaN(d) ? '' : d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    return `<div class="mba-history-card">
        <div class="mba-history-header"><span>Edition ${rec.edition} — final standings</span><span style="color:#6b7280;font-weight:600;">${when}</span></div>
        <div class="mba-history-podium">
            <div class="mba-podium-row">🥇 ${mbaTeamLabel(rec.gold)}</div>
            <div class="mba-podium-row">🥈 ${mbaTeamLabel(rec.silver)}</div>
            <div class="mba-podium-row">🥉 ${mbaTeamLabel(rec.bronze)}</div>
        </div>
    </div>`;
}

// ------------------------------------------------------------
// Admin Panel: start / cancel / finish + interactive bracket
// ------------------------------------------------------------
// The CUP no longer has its own admin card: the single "Season Control" card
// (js/flow.js) shows the bracket in the right stage. Kept as a thin alias so every
// existing caller (saves, verify, load) keeps working.
function renderMbaAdminSection(){
    if(typeof renderFlowViews==='function') renderFlowViews();
}

// ------------------------------------------------------------
// Season tab → CUP view. Has its OWN edition picker (pill + arrows +
// sheet) that never touches the League season picker, and vice versa.
// Index 0 = newest (the running tournament if any, else the latest finished).
// ------------------------------------------------------------
// The edition number the NEXT draw will get (same rule as startNewMbaTournament).
function mbaNextEdition(){ return mbaData.completed.reduce((m,r)=>Math.max(m,r.edition||0),0) + 1; }
// A season is running but its CUP has not been drawn yet → the CUP page already shows
// the new (empty) edition instead of last season's finished one.
function mbaPendingInfo(){
    const f = (typeof flowCur==='function') ? flowCur() : null;
    if(!f || f.cupEdition!=null || mbaData.current) return null;
    return { edition: mbaNextEdition(), seasonId: f.seasonId, afterRound: (typeof flowHalf==='function') ? flowHalf(f) : 4 };
}
function mbaBuildOptions(){
    const opts = [];
    const pend = mbaPendingInfo();
    if(pend) opts.push({ value:'pending', label:`Edition ${pend.edition} — Draw pending`, scope:'pending', edition:pend.edition, pend });
    if(mbaData.current) opts.push({ value:'current', label:`Edition ${mbaData.current.edition} — In progress`, scope:'current', edition:mbaData.current.edition });
    [...mbaData.completed].reverse().forEach(r=>opts.push({ value:'ed:'+r.edition, label:`Edition ${r.edition}`, scope:'completed', edition:r.edition }));
    return opts;
}
function mbaSelected(){
    const opts = mbaBuildOptions();
    if(mbaViewValue==='none') return { opts, idx:-1, opt:{ value:'none', label:'No CUP this season', scope:'none' } };
    let idx = opts.findIndex(o=>o.value===mbaViewValue);
    if(idx<0) idx = 0;
    return { opts, idx, opt: opts[idx] || null };
}
function syncMbaPill(){
    const { opts, idx, opt } = mbaSelected();
    const lbl = document.getElementById('mba-pill-label');
    if(lbl) lbl.textContent = opt ? opt.label : 'No tournaments yet';
    const prev = document.getElementById('mba-prev-btn'), next = document.getElementById('mba-next-btn');
    if(prev) prev.style.opacity = (idx<=0) ? '0.3' : '1';
    if(next) next.style.opacity = (idx>=opts.length-1) ? '0.3' : '1';
}
function navigateMbaEdition(dir){
    haptic([6]);
    const { opts, idx } = mbaSelected();
    const ni = idx + dir;
    if(ni<0 || ni>=opts.length) return;
    mbaViewValue = opts[ni].value;
    renderMbaSeasonView();
}
function openMbaPicker(){
    haptic([6]);
    const { opts, idx } = mbaSelected();
    if(!opts.length){ showToast('No CUP tournaments yet','info'); return; }
    document.getElementById('mba-picker-list').innerHTML = opts.map((o,i)=>`
        <div class="playlist-track-item ${i===idx?'playing':''}" onclick="selectMbaEdition('${o.value}')">
            <div class="playlist-track-icon"><i class="fas fa-trophy"></i></div>
            <div class="playlist-track-title">${escapeHtml(o.label)}</div>
        </div>`).join('');
    document.getElementById('mba-picker-sheet').classList.add('open');
}
function closeMbaPicker(){ document.getElementById('mba-picker-sheet').classList.remove('open'); }
function selectMbaEdition(value){
    haptic([8]);
    mbaViewValue = value;
    closeMbaPicker();
    renderMbaSeasonView();
}
function resetMbaView(){ mbaViewValue = null; }

// Empty bracket for the new season's CUP: every slot says "To be drawn" until the draw happens.
function mbaPendingHtml(pend){
    const tbd = `<div class="mba-team-row tbd"><span class="mba-team-label"><span class="mba-logo mba-logo-tbd">?</span><span class="nm">To be drawn</span></span><span class="mba-wins">–</span></div>`;
    const block = (cls, head, tag, note)=>`<div class="mba-block ${cls} mba-pending">
        <div class="mba-block-head"><span>${head}</span><span class="mba-block-tag">${tag}</span></div>
        ${tbd}${tbd}
        <div class="mba-pending-note">${note}</div>
    </div>`;
    const semiNote = `Draw after league matchweek ${pend.afterRound}`;
    return `<div class="mba-edition-label">CUP ${pend.edition}</div>
    <div class="mba-tree-scroll">
        <div class="mba-tree">
            <div class="mba-cell mba-c-semi1">${block('mba-semi','Semifinal 1',`First to ${MBA_SEMI_WINS_NEEDED}`,semiNote)}</div>
            <div class="mba-c-link mba-c-link1"><div class="mba-link-out"></div></div>
            <div class="mba-cell mba-c-semi2">${block('mba-semi','Semifinal 2',`First to ${MBA_SEMI_WINS_NEEDED}`,semiNote)}</div>
            <div class="mba-c-link mba-c-link2"></div>
            <div class="mba-cell mba-c-final">${block('mba-final','🏆 Final','Upcoming','Waiting for the semifinals')}</div>
        </div>
        <div class="mba-third-wrap">${block('mba-third','🥉 Third place','Upcoming','Waiting for the semifinals')}</div>
        ${mbaSuperHtml(pend.edition)}
    </div>`;
}

// Season picker → CUP follows: an archived season shows its own CUP edition, the running season shows its newest one.
// Which CUP edition belongs to an ARCHIVED season? New archives carry `cupEdition`; older ones (e.g. Season 7 ↔ Edition 1)
// don't, so the edition is found by date: it was created after the previous season ended and not after this one ended.
function mbaEditionForSeason(s){
    if(!s) return null;
    const done = mbaData.completed || [];
    if(s.cupEdition!=null) return done.some(r=>r.edition===s.cupEdition) ? s.cupEdition : null;
    const all = (typeof archivedSeasons!=='undefined' && Array.isArray(archivedSeasons)) ? [...archivedSeasons].sort((a,b)=>a.seasonId-b.seasonId) : [];
    const i = all.findIndex(x=>x.seasonId===s.seasonId);
    const end = Date.parse(s.date);
    const start = i>0 ? Date.parse(all[i-1].date) : -Infinity;
    if(isNaN(end)) return null;
    const hit = done.filter(r=>(r.createdAt||0) > (isNaN(start)?-Infinity:start) && (r.createdAt||0) <= end);
    return hit.length ? hit[hit.length-1].edition : null;
}
// Season picker → CUP follows: an archived season shows its own CUP edition (or says it had none), the running season its newest one.
function mbaFollowSeason(val){
    if(val==='current') mbaViewValue = null;
    else { const ed = mbaEditionForSeason(val); mbaViewValue = ed!=null ? 'ed:'+ed : 'none'; }
    renderMbaSeasonView();
}

function renderMbaSeasonView(){
    syncMbaPill();
    const el = document.getElementById('mba-season-body');
    if(!el) return;
    const { opt } = mbaSelected();
    if(!opt){
        el.innerHTML = '<p style="font-size:0.72rem;color:#6b7280;text-align:center;margin-top:24px;">No CUP tournaments yet.</p>';
        return;
    }
    if(opt.scope==='none'){
        el.innerHTML = '<p style="font-size:0.72rem;color:#6b7280;text-align:center;margin-top:24px;">No CUP tournament is recorded for this season.<br>Use the arrows above to browse the editions.</p>';
        return;
    }
    if(opt.scope==='pending'){
        el.innerHTML = mbaPendingHtml(opt.pend);
        return;
    }
    const isCur = opt.scope==='current';
    const t = isCur ? mbaData.current : mbaData.completed.find(r=>r.edition===opt.edition);
    if(!t){ el.innerHTML = ''; return; }
    const ctx = mbaMakeCtx('view', opt.scope, t.edition);
    let html = '';
    if(!isCur) html += mbaCompletedSummaryHtml(t);
    html += `<div class="mba-edition-label">CUP ${t.edition}</div>`;
    html += mbaTreeHtml(t, ctx);
    const last = mbaData.completed[mbaData.completed.length-1];
    if(!isCur && ctx.canEdit && !mbaData.current && last && last.edition===t.edition){
        html += `<button class="mba-reopen-btn" onclick="reopenLastMbaEdition()"><i class="fas fa-rotate-left mr-1"></i>Reopen this edition to correct the outcome</button>`;
    }
    if(el.__mbaHtml===html && el.children.length) return;   // unchanged → keep the DOM (no flash when switching pages)
    el.__mbaHtml = html;
    el.innerHTML = html;
}

// ------------------------------------------------------------
// Audit / repair — called by "Verify Table" (js/verify.js).
// Re-derives every series from its stored games, repairs what it safely
// can, and reports what needs a human. Returns { items, changedMba, changedMain }.
// items: [{level:'ok'|'fixed'|'warn'|'error', text}]
// ------------------------------------------------------------
function auditMbaData(){
    const items = [];
    let changedMba = false, changedMain = false;
    const push  = (level,text)=>items.push({ level, text });
    const fixed = text=>{ changedMba = true; push('fixed', text); };
    normalizeMbaData();

    const list = [];
    if(mbaData.current) list.push({ t:mbaData.current, scope:'current' });
    mbaData.completed.forEach(r=>list.push({ t:r, scope:'completed' }));
    if(!list.length) push('ok','No CUP tournaments yet — nothing to check.');

    const seen = new Set();
    mbaData.completed.forEach(r=>{
        if(seen.has(r.edition)) push('error',`Edition ${r.edition} appears more than once in the history — remove the duplicate by hand.`);
        seen.add(r.edition);
    });

    list.forEach(({ t, scope })=>{
        const tag = `CUP Edition ${t.edition}`;
        const before = items.length;
        const malformed = !Array.isArray(t.semis) || t.semis.length!==2 ||
            t.semis.some(s=>!s || !Array.isArray(s.teams) || s.teams.length!==2 || !Array.isArray(s.legs));
        if(malformed){ push('error',`${tag}: bracket data is malformed and can’t be repaired automatically.`); return; }

        // 1) every game: valid winner, score matches winner
        let noScore = 0, gameCount = 0;
        t.semis.forEach((semi,i)=>{
            semi.legs.forEach((leg,li)=>{
                gameCount++;
                const where = `${tag} · Semifinal ${i+1} · Game ${li+1}`;
                if(!semi.teams.includes(leg.winner)){ push('error',`${where}: winner isn’t one of the two teams — edit or delete this game.`); return; }
                if(!leg.scores){ noScore++; return; }
                const sa = leg.scores[semi.teams[0]], sb = leg.scores[semi.teams[1]];
                if(sa==null || sb==null || sa===sb){ push('error',`${where}: the saved score is invalid — edit this game.`); return; }
                const expected = sa>sb ? semi.teams[0] : semi.teams[1];
                if(expected!==leg.winner){
                    leg.winner = expected;
                    fixed(`${where}: winner corrected to ${mbaName(expected)} to match the score ${sa}–${sb}.`);
                }
            });
        });
        if(noScore) push('warn',`${tag}: ${noScore} game${noScore===1?'':'s'} saved before scores existed (winner only). Tap ✏️ to add the score.`);

        // 2) series state re-derived from the games
        t.semis.forEach((semi,i)=>{
            const { wins, winner, decidedAt } = mbaSemiTally(semi);
            if(decidedAt>=0 && decidedAt < semi.legs.length-1){
                const extra = semi.legs.length-1-decidedAt;
                semi.legs.length = decidedAt+1;
                fixed(`${tag} · Semifinal ${i+1}: removed ${extra} game${extra===1?'':'s'} recorded after the series was already decided.`);
            }
            if((semi.winner||null)!==winner){
                fixed(`${tag} · Semifinal ${i+1}: winner corrected (${mbaName(semi.winner)} → ${mbaName(winner)}).`);
            } else if(JSON.stringify(semi.wins)!==JSON.stringify(wins)){
                fixed(`${tag} · Semifinal ${i+1}: series score recalculated.`);
            }
            semi.wins = wins; semi.winner = winner;
        });

        // 3) Final + Third place must match the semifinal outcomes
        [['final','Final',mbaFinalists(t)],['thirdPlace','Third-place match',mbaThirdTeams(t)]].forEach(([key,label,teams])=>{
            const res = t[key];
            if(!res || !res.winner) return;
            if(!mbaResultValid(res, teams)){
                if(scope==='current'){ t[key] = { winner:null }; fixed(`${tag}: ${label} result didn’t match its teams — cleared, please enter it again.`); }
                else push('error',`${tag}: ${label} result doesn’t match the semifinal outcomes — use “Reopen” on the edition to correct it.`);
                return;
            }
            if(res.scores){
                const sa = res.scores[teams[0]], sb = res.scores[teams[1]];
                if(sa==null || sb==null || sa===sb){ push('error',`${tag}: ${label} has an invalid saved score — edit it.`); return; }
                const expected = sa>sb ? teams[0] : teams[1];
                if(expected!==res.winner){
                    res.winner = expected;
                    fixed(`${tag}: ${label} winner corrected to ${mbaName(expected)} to match the score ${sa}–${sb}.`);
                }
            } else {
                push('warn',`${tag}: ${label} has no score saved. Tap ✏️ to add it.`);
            }
        });

        // 4) finished editions: medals must equal what the bracket says
        if(scope==='completed'){
            if(!mbaIsFullyDecided(t)){
                push('error',`${tag}: marked as finished but some results are missing or inconsistent — use “Reopen” to complete it.`);
            } else {
                const m = mbaComputeMedals(t);
                ['gold','silver','bronze','fourth'].forEach(k=>{
                    if(t[k]!==m[k]){ fixed(`${tag}: ${k} corrected (${mbaName(t[k])} → ${mbaName(m[k])}).`); t[k] = m[k]; }
                });
            }
        }
        if(items.length===before) push('ok',`${tag}: ${gameCount} game${gameCount===1?'':'s'}, results and medals are consistent.`);
    });

    // 5) champion log (Edition #N badge) must match the finished editions exactly
    TEAM_NAMES.forEach(ensureWalletFields);
    mbaData.completed.forEach(r=>{
        if(!r.gold || !mainLeagueData[r.gold]) return;
        const log = mainLeagueData[r.gold].mbaChampionLog;
        if(!log.some(e=>e.edition===r.edition)){
            log.push({ edition:r.edition, ts:r.finishedAt || Date.now() });
            changedMain = true;
            push('fixed',`${mbaName(r.gold)}: missing “CUP Champion — Edition ${r.edition}” entry added.`);
        }
    });
    TEAM_NAMES.forEach(team=>{
        const log = mainLeagueData[team].mbaChampionLog;
        const seenEd = new Set();
        const cleaned = log.filter(e=>{
            const rec = mbaData.completed.find(r=>r.edition===e.edition);
            if(!rec || rec.gold!==team || seenEd.has(e.edition)) return false;
            seenEd.add(e.edition);
            return true;
        }).sort((x,y)=>x.edition-y.edition);
        if(cleaned.length!==log.length){
            mainLeagueData[team].mbaChampionLog = cleaned;
            changedMain = true;
            push('fixed',`${mbaName(team)}: removed ${log.length-cleaned.length} invalid CUP champion entr${log.length-cleaned.length===1?'y':'ies'}.`);
        }
    });

    return { items, changedMba, changedMain };
}
