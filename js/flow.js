// ============================================================
// flow.js — SEASON FLOW: one schedule that drives League, CUP and Super Cup
// ------------------------------------------------------------
// A season is a fixed timetable of five stages, played strictly in order:
//
//   1. LEAGUE    matchweeks 1–6      (12 league games)
//   2. CUP       semifinals          (draw + two series — js/mba.js)
//   3. LEAGUE    matchweeks 7–12     (12 league games)
//   4. CUP       final + third-place (js/mba.js)
//   5. SUPER CUP league champion vs CUP champion (single match)
//
// Every team plays exactly 12 league games: 4 meetings with each of the
// other 3 teams. With 4 teams a matchweek is 2 games, so 12 matchweeks =
// 24 games. All 24 fixtures are generated up-front when the season starts.
//
// NOTHING about "which stage are we in" is stored. The phase is DERIVED on
// every render from the real data (match history, CUP edition, Super Cup
// result) by flowPhase(), so deleting/editing a result can never leave the
// app believing something that is not true.
//
// Stored (season_flow.json):
//   { v:1, current: null | {
//       seasonId, createdAt,
//       fixtures:[{id:'r3m1', round:3, home, away}],   // the timetable
//       cupEdition: null | n,                          // the CUP edition drawn for this season
//       superCup:   null | {teams:[a,b], scores:{a:n,b:n}, winner, ts, editedAt?}
//   } }
// A league result is linked to its fixture by `fx` (+ `round`) on the match
// object in match_history.json. Archived seasons keep `superCup` so Super Cup
// titles are tallied straight from the archive (see computeSuperCupCounts()).
// ============================================================

const FLOW_FILE_VERSION   = 1;
const FLOW_LEAGUE_ROUNDS  = 12;  // matchweeks per season (12 games per team)
const FLOW_FIRST_HALF     = 6;   // CUP semifinals start after this many matchweeks
// If one team wins BOTH league and CUP, the Super Cup is played against the league runner-up.

const FLOW_STAGES = [
    { id:'league_a',   icon:'fa-futbol',      title:'League',            sub:'Matchweeks 1–6'  },
    { id:'cup_semis',  icon:'fa-trophy',      title:'CUP Semifinals',    sub:'Draw + 2 series' },
    { id:'league_b',   icon:'fa-futbol',      title:'League',            sub:'Matchweeks 7–12' },
    { id:'cup_finals', icon:'fa-trophy',      title:'CUP Final & 3rd',   sub:'Medal matches'   },
    { id:'supercup',   icon:'fa-bolt',        title:'Super Cup',         sub:'League vs CUP champion' },
];
// phase -> index of the active stage in FLOW_STAGES (idle = -1, complete = 5)
const FLOW_PHASE_STAGE = { idle:-1, league_a:0, cup_draw:1, cup_semis:1, league_b:2, cup_finals:3, supercup:4, complete:5 };
const FLOW_PHASE_LABEL = {
    idle:'No season running', league_a:'League — first half', cup_draw:'CUP draw', cup_semis:'CUP semifinals',
    league_b:'League — second half', cup_finals:'CUP final & third place', supercup:'Super Cup', complete:'Season complete'
};

let flowData  = { v:FLOW_FILE_VERSION, current:null };
let flowSha   = null;
let flowBusy  = false;
const flowDraft = {};              // fixtureId -> {h,a} (score being typed in the admin panel)
let flowSuperDraft = { a:0, b:0 }; // Super Cup score being typed
let flowSuperEditing = false;

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------
function flowCur(){ return (flowData && flowData.current) ? flowData.current : null; }
function flowName(t){ return (TEAM_DISPLAY_NAMES && TEAM_DISPLAY_NAMES[t]) || t || '—'; }
function flowShuffle(arr){
    const a = [...arr];
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
}
function flowSortedTable(){
    return Object.values(leagueData).filter(t=>TEAM_NAMES.includes(t.name))
        .sort((a,b)=>(b.Pts-a.Pts)||((b.GF-b.GA)-(a.GF-a.GA)));
}
function flowParseScore(s){ const p=String(s||'').split('-'); return [parseInt(p[0])||0, parseInt(p[1])||0]; }

// ------------------------------------------------------------
// Load / save
// ------------------------------------------------------------
async function loadFlowFromGitHub(){
    if(flowBusy) return flowData;
    const cached = await idbGet('flowData','v');
    if(cached) flowData = cached;
    if(navigator.onLine){
        try{
            const r = await fetch(`${BASE_API}${GITHUB_FLOW_FILE}?ref=${GITHUB_LEAGUE_BRANCH}`);
            if(r.ok){
                const d = await r.json();
                flowSha = d.sha;
                flowData = await (await fetch(d.download_url+'?t='+Date.now())).json();
                await idbSet('flowData','v',flowData);
            } else if(r.status===404){
                flowSha = null; // expected before the first scheduled season
            }
        }catch(e){}
    }
    if(!flowData || typeof flowData!=='object') flowData = { v:FLOW_FILE_VERSION, current:null };
    renderFlowViews();
    return flowData;
}
async function saveFlowToGitHub(message){
    await idbSet('flowData','v',flowData);
    const ok = await saveFile(GITHUB_FLOW_FILE, flowData, message, flowSha);
    if(!ok) showToast('Saved locally — check your connection','info',3000);
    return ok;
}

// ------------------------------------------------------------
// Fixture generation — 4 round-robin cycles (4 meetings per pair)
// ------------------------------------------------------------
// Each cycle is 3 matchweeks (every team meets every other team once). Weeks
// inside a cycle are shuffled, home/away flips every cycle, and the same
// pairing never repeats in back-to-back matchweeks. After matchweek 6 every
// pair has met exactly twice, so the CUP draw happens on a level playing field.
function flowGenerateFixtures(){
    if(TEAM_NAMES.length!==4) throw new Error('The schedule is built for exactly 4 teams');
    const [a,b,c,d] = flowShuffle(TEAM_NAMES);
    const tpl = [ [[a,b],[c,d]], [[a,c],[b,d]], [[a,d],[b,c]] ];
    const weeks = [];
    let prevLast = -1;
    for(let cycle=0; cycle<4; cycle++){
        let order;
        do{ order = flowShuffle([0,1,2]); }while(order[0]===prevLast);
        order.forEach(k=>weeks.push({ k, flip:cycle%2===1 }));
        prevLast = order[2];
    }
    const fixtures = [];
    weeks.forEach((w,i)=>{
        tpl[w.k].forEach((pair,j)=>{
            const [home,away] = w.flip ? [pair[1],pair[0]] : pair;
            fixtures.push({ id:`r${i+1}m${j+1}`, round:i+1, home, away });
        });
    });
    return fixtures;
}

// ------------------------------------------------------------
// Derived state (pure — no DOM, no writes)
// ------------------------------------------------------------
function flowMatchOf(fx){ return (matchHistory||[]).find(m=>m.fx===fx.id) || null; }
function flowRoundFixtures(f, r){ return f.fixtures.filter(x=>x.round===r); }
function flowRoundDone(f, r){ const fs=flowRoundFixtures(f,r); return fs.length>0 && fs.every(x=>!!flowMatchOf(x)); }
function flowRangeDone(f, from, to){ for(let r=from;r<=to;r++){ if(!flowRoundDone(f,r)) return false; } return true; }
// first matchweek that still has an unplayed fixture (null = all 12 played)
function flowCurrentRound(f){
    for(let r=1;r<=FLOW_LEAGUE_ROUNDS;r++){ if(!flowRoundDone(f,r)) return r; }
    return null;
}
function flowPlayedCount(f){ return f.fixtures.filter(x=>!!flowMatchOf(x)).length; }

function flowCupOf(f){
    if(!f || f.cupEdition==null) return null;
    if(mbaData && mbaData.current && mbaData.current.edition===f.cupEdition) return { t:mbaData.current, done:false };
    const rec = (mbaData && mbaData.completed || []).find(r=>r.edition===f.cupEdition);
    return rec ? { t:rec, done:true } : null;
}
function flowSemisDone(cup){ return !!cup && cup.t.semis.length===2 && cup.t.semis.every(s=>!!s.winner); }

// Who plays the Super Cup. null until the league (12 matchweeks) AND the CUP are both decided.
function flowSuperCupTeams(f){
    f = f || flowCur();
    if(!f || !flowRangeDone(f,1,FLOW_LEAGUE_ROUNDS)) return null;
    const cup = flowCupOf(f);
    if(!cup || !cup.done || !cup.t.gold) return null;
    const table = flowSortedTable();
    const leagueChamp = table[0] && table[0].name;
    if(!leagueChamp) return null;
    const cupChamp = cup.t.gold;
    const opponent = (leagueChamp===cupChamp) ? (table[1] && table[1].name) : cupChamp;
    if(!opponent) return null;
    return { teams:[leagueChamp, opponent], leagueChamp, cupChamp, double:(leagueChamp===cupChamp) };
}
function flowSuperCupValid(f){
    f = f || flowCur();
    const sc = f && f.superCup;
    if(!sc || !sc.winner) return false;
    const want = flowSuperCupTeams(f);
    if(!want) return false;
    return Array.isArray(sc.teams) && sc.teams.length===2 && want.teams.every(t=>sc.teams.includes(t)) && sc.teams.includes(sc.winner);
}

function flowPhase(){
    const f = flowCur();
    if(!f) return 'idle';
    if(!flowRangeDone(f,1,FLOW_FIRST_HALF)) return 'league_a';
    const cup = flowCupOf(f);
    if(!cup) return 'cup_draw';
    if(!flowSemisDone(cup)) return 'cup_semis';
    if(!flowRangeDone(f,FLOW_FIRST_HALF+1,FLOW_LEAGUE_ROUNDS)) return 'league_b';
    if(!cup.done) return 'cup_finals';
    if(!flowSuperCupValid(f)) return 'supercup';
    return 'complete';
}
function flowStageIndex(){ const p=flowPhase(); return FLOW_PHASE_STAGE[p]; }

// What the CUP screens are allowed to record right now (used by js/mba.js).
// With no schedule running (legacy / between seasons) nothing is restricted.
function flowAllowsCup(kind){
    if(!flowCur()) return true;
    const p = flowPhase();
    return kind==='semi' ? p==='cup_semis' : p==='cup_finals';
}

// Plain-English description of what has to happen next (admin panel + magazine).
function flowNextStepText(){
    const f = flowCur(); const p = flowPhase();
    if(!f) return 'Start the season to generate the full 12-matchweek schedule.';
    const r = flowCurrentRound(f);
    switch(p){
        case 'league_a': return `Play matchweek ${r} of 12. After matchweek ${FLOW_FIRST_HALF} the CUP semifinals begin.`;
        case 'cup_draw': return 'Matchweek 6 is done — draw the CUP semifinals.';
        case 'cup_semis': return 'Play the CUP semifinal series. When both finalists are known the league resumes.';
        case 'league_b': return `Back to the league: play matchweek ${r} of 12. The CUP final and third-place match come after matchweek 12.`;
        case 'cup_finals': return 'League finished — play the CUP final and the third-place match.';
        case 'supercup': return 'Play the Super Cup: league champion vs CUP champion.';
        default: return 'Everything is played. End the season to archive it and start the next one.';
    }
}

// ------------------------------------------------------------
// Start season / start CUP / Super Cup / end season
// ------------------------------------------------------------
async function flowStartSeason(opts){
    opts = opts || {};
    if(flowBusy || flowCur()) return;
    if(!isFullAdmin()){ showToast('Admin only','error',2000); return; }
    if(mbaData && mbaData.current){
        showToast('A CUP edition from before the schedule system is still running — finish or cancel it first (Danger zone).','error',4200);
        return;
    }
    const sid = (archivedSeasons||[]).length + 1;
    const legacyCount = (matchHistory||[]).length;
    if(!opts.silent){
        const ok = await showConfirm({
            icon:'📅', title:`Start Season ${sid}?`,
            message: `Generates the full timetable: 12 matchweeks × 2 games (every team plays 12 league games), CUP semifinals after matchweek 6, the CUP final after the league, then the Super Cup.`
                + (legacyCount ? ` The ${legacyCount} match${legacyCount===1?'':'es'} already in this season will be matched to the new schedule.` : ''),
            okLabel:'Start Season', okColor:'green'
        });
        if(!ok) return;
    }
    flowBusy = true;
    try{
        const fixtures = flowGenerateFixtures();
        let adopted = 0, orphan = 0;
        if(legacyCount){
            // oldest result first; each one fills the earliest still-open fixture between the same two teams
            [...matchHistory].reverse().forEach(m=>{
                if(m.fx) return;
                const fx = fixtures.find(x=>!x.taken && ((x.home===m.home&&x.away===m.away)||(x.home===m.away&&x.away===m.home)));
                if(fx){ fx.taken = true; m.fx = fx.id; m.round = fx.round; adopted++; } else orphan++;
            });
            fixtures.forEach(x=>{ delete x.taken; });
        }
        flowData = { v:FLOW_FILE_VERSION, current:{ seasonId:sid, createdAt:Date.now(), fixtures, cupEdition:null, superCup:null } };
        if(adopted) await saveMatchHistoryToGitHub(matchHistory, `Season ${sid}: ${adopted} existing match(es) linked to the schedule`);
        await saveFlowToGitHub(`Season ${sid} schedule created`);
        showToast(`Season ${sid} schedule is ready 📅` + (orphan?` (${orphan} old match${orphan===1?'':'es'} could not be linked)`:''),'success',3200);
    } finally { flowBusy = false; }
    await refreshAllLeagueViews();
}

async function flowStartCup(){
    const f = flowCur();
    if(flowBusy || !f || flowPhase()!=='cup_draw') return;
    if(typeof startNewMbaTournament!=='function') return;
    const ed = await startNewMbaTournament({ seasonId:f.seasonId });
    if(ed==null) return;
    f.cupEdition = ed;
    await saveFlowToGitHub(`Season ${f.seasonId}: CUP Edition ${ed} drawn`);
    renderFlowViews();
}

// ---- league fixtures ----
function flowChangeDraft(id, side, delta){
    haptic([6]);
    const d = flowDraft[id] || (flowDraft[id]={h:0,a:0});
    d[side] = Math.max(0, d[side]+delta);
    const el = document.getElementById(`flow-sc-${id}-${side}`);
    if(el) el.textContent = d[side];
}
async function flowSaveFixture(id){
    const f = flowCur(); if(!f || flowBusy) return;
    const fx = f.fixtures.find(x=>x.id===id); if(!fx) return;
    const phaseBefore = flowPhase();
    if(phaseBefore!=='league_a' && phaseBefore!=='league_b'){ showToast('League games are not open at this stage','error',2400); return; }
    if(fx.round!==flowCurrentRound(f)){ showToast(`Finish matchweek ${flowCurrentRound(f)} first`,'error',2400); return; }
    if(flowMatchOf(fx)){ showToast('This fixture already has a result','info',2000); return; }
    const d = flowDraft[id] || {h:0,a:0};
    const ok = await showConfirm({icon:'⚽',title:`Matchweek ${fx.round} — save result?`,message:`${flowName(fx.home)} ${d.h} – ${d.a} ${flowName(fx.away)}`,okLabel:'Save',okColor:'green'});
    if(!ok) return;
    flowBusy = true;
    try{
        updateTeamStats(leagueData[fx.home], d.h, d.a);
        updateTeamStats(leagueData[fx.away], d.a, d.h);
        const m = { home:fx.home, away:fx.away, score:`${d.h}-${d.a}`, timestamp:new Date().toISOString(), fx:fx.id, round:fx.round };
        matchHistory.unshift(m);
        const s1 = await saveLeagueDataToGitHub(leagueData, `MW${fx.round}: ${m.score}`);
        const s2 = await saveMatchHistoryToGitHub(matchHistory, `MW${fx.round} history ${m.score}`);
        delete flowDraft[id];
        showToast(s1&&s2 ? `Saved: ${fx.home} ${m.score} ${fx.away}` : 'Saved locally — check network', s1&&s2?'success':'info');
    } finally { flowBusy = false; }
    await refreshAllLeagueViews();
    const phaseAfter = flowPhase();
    if(phaseAfter!==phaseBefore) showToast(`Next: ${FLOW_PHASE_LABEL[phaseAfter]} ✅`,'success',3400);
}

// ---- Super Cup ----
function flowChangeSuper(side, delta){
    haptic([6]);
    flowSuperDraft[side] = Math.max(0, flowSuperDraft[side]+delta);
    const el = document.getElementById('flow-super-sc-'+side);
    if(el) el.textContent = flowSuperDraft[side];
}
function flowEditSuperCup(){
    const f = flowCur(); if(!f || !f.superCup) return;
    const t = f.superCup.teams;
    flowSuperDraft = { a:f.superCup.scores?.[t[0]]||0, b:f.superCup.scores?.[t[1]]||0 };
    flowSuperEditing = true;
    renderFlowAdmin();
}
function flowCancelSuperEdit(){ flowSuperEditing = false; renderFlowAdmin(); }
async function flowSaveSuperCup(){
    const f = flowCur(); if(!f || flowBusy) return;
    const p = flowPhase();
    if(p!=='supercup' && !(p==='complete' && flowSuperEditing)){ showToast('The Super Cup is not open yet','error',2400); return; }
    const want = flowSuperCupTeams(f); if(!want) return;
    const { a, b } = flowSuperDraft;
    const err = document.getElementById('flow-super-error');
    if(a===b){ if(err){ err.style.display='block'; } haptic([60]); return; }
    if(err) err.style.display='none';
    const [t0,t1] = want.teams;
    const winner = a>b ? t0 : t1;
    const ok = await showConfirm({icon:'⚡',title:'Save Super Cup result?',message:`${flowName(t0)} ${a} – ${b} ${flowName(t1)}`,okLabel:'Save',okColor:'green'});
    if(!ok) return;
    flowBusy = true;
    try{
        const prev = f.superCup;
        f.superCup = { teams:[t0,t1], scores:{[t0]:a,[t1]:b}, winner, ts:(prev&&prev.ts)||Date.now() };
        if(prev && prev.winner) f.superCup.editedAt = Date.now();
        flowSuperEditing = false;
        await saveFlowToGitHub(`Season ${f.seasonId}: Super Cup — ${winner} wins ${a}-${b}`);
        showToast(`⚡ ${flowName(winner)} wins the Super Cup!`,'success',3800);
    } finally { flowBusy = false; }
    renderFlowViews();
}

// ---- end season ----
// One button for both "finish" and "start the next one". A complete season is
// archived and (by default) the next season's timetable is generated straight away.
async function flowEndSeason(early){
    const f = flowCur(); if(!f || flowBusy) return;
    if(!isFullAdmin()){ showToast('Admin only','error',2000); return; }
    const phase = flowPhase();
    const complete = phase==='complete';
    const sorted = flowSortedTable();
    const sc = flowSuperCupValid(f) ? f.superCup : null;
    const cup = flowCupOf(f);
    let message, title, okLabel;
    if(complete){
        title = `End Season ${f.seasonId}?`;
        message = `League champion: ${flowName(sorted[0]?.name)}. CUP champion: ${flowName(cup?.t.gold)}. Super Cup: ${flowName(sc?.winner)}.\n`
            + `The season (table, match history, Super Cup) is archived and Season ${f.seasonId+1}'s timetable is generated.`;
        okLabel = `End & Start Season ${f.seasonId+1}`;
    } else {
        title = 'End the season early?';
        message = `The season is not finished (${FLOW_PHASE_LABEL[phase]}, ${flowPlayedCount(f)}/${f.fixtures.length} league games played). It will be archived as it is`
            + ((mbaData.current) ? ', the running CUP edition is cancelled' : '')
            + ', and unplayed fixtures are dropped. Medals follow the current table.';
        okLabel = 'End Season Early';
    }
    const ok = await showConfirm({icon:'🏆',title,message,okLabel,okColor:complete?'purple':'red'});
    if(!ok) return;
    flowBusy = true;
    try{
        // an unfinished CUP of this season must not leak into the next one
        if(mbaData.current && mbaData.current.edition===f.cupEdition){
            mbaData.current = null; mbaViewValue = null;
            await saveMbaDataToGitHub(`Season ${f.seasonId} ended early — CUP edition cancelled`);
        }
        await archiveCurrentSeason(sorted, matchHistory, {
            superCup: sc || null, cupEdition: f.cupEdition ?? null, complete,
            schedule: f.fixtures.map(x=>{ const m=flowMatchOf(x); return { round:x.round, home:x.home, away:x.away, score:m?m.score:null }; })
        });
        initializeLeagueData();
        matchHistory = [];
        await saveLeagueDataToGitHub(leagueData, 'Reset Season Table');
        await saveMatchHistoryToGitHub(matchHistory, 'Season archived - match history cleared for new season');
        flowData = { v:FLOW_FILE_VERSION, current:null };
        Object.keys(flowDraft).forEach(k=>delete flowDraft[k]);
        flowSuperEditing = false;
    } finally { flowBusy = false; }
    if(complete){
        await flowStartSeason({ silent:true });   // saves the new timetable
        showToast(`Season ${f.seasonId} archived — Season ${f.seasonId+1} is ready 🏆`,'success',4200);
    } else {
        await saveFlowToGitHub(`Season ${f.seasonId} ended early`);
        showToast('Season archived 🏆','success',3200);
        await refreshAllLeagueViews();
    }
    navigate('main-league');
}

// Wipes the season WITHOUT archiving (replaces the old "Full Reset").
async function flowFullReset(){
    if(flowBusy) return;
    const ok = await showConfirm({icon:'💀',title:'Full reset?',message:'This season\'s table, match history, schedule and CUP edition are deleted permanently. Nothing is archived.',okLabel:'Reset',okColor:'red'});
    if(!ok) return;
    flowBusy = true;
    try{
        matchHistory = []; initializeLeagueData();
        if(mbaData.current){ mbaData.current = null; mbaViewValue = null; await saveMbaDataToGitHub('Full reset — CUP edition removed'); }
        flowData = { v:FLOW_FILE_VERSION, current:null };
        await saveMatchHistoryToGitHub(matchHistory,'Reset'); await saveLeagueDataToGitHub(leagueData,'Reset');
        await saveFlowToGitHub('Reset schedule');
    } finally { flowBusy = false; }
    showToast('Season has been reset','info');
    await refreshAllLeagueViews();
}

// Super Cup titles, tallied from the archive (never stored separately)
function computeSuperCupCounts(){
    const out = {}; TEAM_NAMES.forEach(t=>out[t]=[]);
    (archivedSeasons||[]).forEach(s=>{ if(s.superCup && s.superCup.winner && out[s.superCup.winner]) out[s.superCup.winner].push(s.seasonId); });
    return out;
}

// ------------------------------------------------------------
// Rendering — shared pieces
// ------------------------------------------------------------
function flowTeamChip(team, cls){
    return `<span class="flow-team ${cls||''}"><img src="${teamLogoUrl(team)}" alt="" onerror="this.style.opacity='0.3'"><span>${escapeHtml(teamShort(team))}</span></span>`;
}
function flowStepperHtml(){
    const idx = flowStageIndex();
    return `<div class="flow-stepper">` + FLOW_STAGES.map((s,i)=>{
        const st = idx>i ? 'done' : (idx===i ? 'active' : 'todo');
        return `<div class="flow-step ${st}"><div class="flow-step-dot">${st==='done'?'<i class="fas fa-check"></i>':`<i class="fas ${s.icon}"></i>`}</div><div class="flow-step-label">${escapeHtml(s.title)}</div><div class="flow-step-sub">${escapeHtml(s.sub)}</div></div>`;
    }).join('') + `</div>`;
}
function flowFixtureRow(fx, opts){
    opts = opts || {};
    const m = flowMatchOf(fx);
    let mid;
    if(m){
        const [h,a] = flowParseScore(m.score);
        mid = `<span class="flow-score${h>a?' hw':(a>h?' aw':'')}">${h}<i>:</i>${a}</span>`;
    } else mid = `<span class="flow-vs">vs</span>`;
    return `<div class="flow-fixture${m?' played':''}">${flowTeamChip(fx.home)}${mid}${flowTeamChip(fx.away,'away')}</div>`;
}

// ------------------------------------------------------------
// Admin panel — "Season Control"
// ------------------------------------------------------------
function flowScorerRow(id, home, away){
    const d = flowDraft[id] || (flowDraft[id]={h:0,a:0});
    const col = (side,val)=>`
        <div class="flow-scorer-col">
            <button class="score-btn score-btn-plus" onclick="flowChangeDraft('${id}','${side}',1)"><i class="fas fa-plus"></i></button>
            <div class="flow-scorer-num" id="flow-sc-${id}-${side}">${val}</div>
            <button class="score-btn score-btn-minus" onclick="flowChangeDraft('${id}','${side}',-1)"><i class="fas fa-minus"></i></button>
        </div>`;
    return `<div class="flow-scorer">
        <div class="flow-scorer-teams">${flowTeamChip(home)}<span class="flow-vs">vs</span>${flowTeamChip(away,'away')}</div>
        <div class="flow-scorer-row">${col('h',d.h)}<div class="flow-colon">:</div>${col('a',d.a)}</div>
        <button class="glass-button w-full font-bold text-sm py-3" style="border-color:rgba(34,197,94,0.3);background:rgba(34,197,94,0.08);color:#86efac;" onclick="flowSaveFixture('${id}')"><i class="fas fa-check-circle mr-2"></i>Save result</button>
    </div>`;
}
function flowSuperScorerHtml(teams){
    const [t0,t1] = teams;
    const col = (side,val)=>`
        <div class="flow-scorer-col">
            <button class="score-btn score-btn-plus" onclick="flowChangeSuper('${side}',1)"><i class="fas fa-plus"></i></button>
            <div class="flow-scorer-num" id="flow-super-sc-${side}">${val}</div>
            <button class="score-btn score-btn-minus" onclick="flowChangeSuper('${side}',-1)"><i class="fas fa-minus"></i></button>
        </div>`;
    return `<div class="flow-scorer">
        <div class="flow-scorer-teams">${flowTeamChip(t0)}<span class="flow-vs">vs</span>${flowTeamChip(t1,'away')}</div>
        <div class="flow-scorer-row">${col('a',flowSuperDraft.a)}<div class="flow-colon">:</div>${col('b',flowSuperDraft.b)}</div>
        <p class="text-xs text-red-400 text-center font-semibold" id="flow-super-error" style="display:none;margin:0 0 8px;">One team must score more — no draws.</p>
        <div class="flex gap-2">
            ${flowSuperEditing?`<button class="glass-button flex-1 text-sm py-3" onclick="flowCancelSuperEdit()">Cancel</button>`:''}
            <button class="glass-button flex-1 font-bold text-sm py-3" style="border-color:rgba(251,191,36,0.35);background:rgba(251,191,36,0.08);color:#fbbf24;" onclick="flowSaveSuperCup()"><i class="fas fa-bolt mr-2"></i>Save Super Cup result</button>
        </div>
    </div>`;
}
function flowSuperSummaryHtml(f){
    const sc = f.superCup; if(!sc) return '';
    const [t0,t1] = sc.teams;
    return `<div class="flow-summary-row"><span>⚡ Super Cup</span><span>${flowTeamChip(t0)} <b>${sc.scores[t0]}–${sc.scores[t1]}</b> ${flowTeamChip(t1,'away')}</span></div>`;
}

function renderFlowAdmin(){
    const el = document.getElementById('flow-admin-body');
    if(!el) return;
    const f = flowCur(); const p = flowPhase();
    const sid = f ? f.seasonId : (archivedSeasons||[]).length+1;
    let html = '';

    // ---- header: where are we? ----
    const rnd = f ? flowCurrentRound(f) : null;
    const played = f ? flowPlayedCount(f) : 0;
    html += `<div class="flow-head">
        <div class="flow-head-title">Season ${sid} <span class="flow-chip">${escapeHtml(FLOW_PHASE_LABEL[p])}</span></div>
        ${f?`<div class="flow-head-sub">League games ${played}/${f.fixtures.length}${rnd?` · matchweek ${rnd}/${FLOW_LEAGUE_ROUNDS}`:' · league finished'}</div>`:''}
    </div>`;
    html += flowStepperHtml();
    html += `<p class="flow-next"><i class="fas fa-circle-info"></i> ${escapeHtml(flowNextStepText())}</p>`;

    // ---- the one contextual action ----
    if(p==='idle'){
        html += `<button class="glass-button w-full font-bold text-sm py-3" style="border-color:rgba(34,197,94,0.35);background:rgba(34,197,94,0.09);color:#86efac;" onclick="flowStartSeason()"><i class="fas fa-calendar-plus mr-2"></i>Start Season ${sid}</button>`;
    } else if(p==='league_a' || p==='league_b'){
        const open = flowRoundFixtures(f, rnd).filter(x=>!flowMatchOf(x));
        html += `<div class="flow-section-title">Matchweek ${rnd} — enter results</div>` + open.map(x=>flowScorerRow(x.id,x.home,x.away)).join('');
        const done = flowRoundFixtures(f, rnd).filter(x=>flowMatchOf(x));
        if(done.length) html += done.map(x=>flowFixtureRow(x)).join('');
    } else if(p==='cup_draw'){
        html += `<button class="glass-button w-full font-bold text-sm py-3" style="border-color:rgba(251,191,36,0.35);background:rgba(251,191,36,0.08);color:#fbbf24;" onclick="flowStartCup()"><i class="fas fa-shuffle mr-2"></i>Draw CUP Semifinals</button>`;
    } else if(p==='cup_semis' || p==='cup_finals'){
        const t = mbaData.current;
        if(t){
            html += `<div class="flow-section-title">CUP — Edition ${t.edition}</div>` + mbaTreeHtml(t, mbaMakeCtx('admin','current',t.edition));
            html += `<p class="mba-admin-hint">${p==='cup_semis'?'Add each semifinal game under its block. Tap ✏️ to correct a game.':'Add the Final and Third-Place results under their blocks.'}</p>`;
        }
    } else if(p==='supercup'){
        const want = flowSuperCupTeams(f);
        html += `<div class="flow-section-title">⚡ Super Cup</div>`;
        if(want){
            html += `<p class="flow-note">${want.double?`${escapeHtml(flowName(want.leagueChamp))} won the league <b>and</b> the CUP, so the opponent is the league runner-up.`:`League champion vs CUP champion.`}</p>` + flowSuperScorerHtml(want.teams);
        }
    } else if(p==='complete'){
        const table = flowSortedTable(); const cup = flowCupOf(f);
        html += `<div class="flow-summary">
            <div class="flow-summary-row"><span>🥇 League</span>${flowTeamChip(table[0]?.name)}</div>
            <div class="flow-summary-row"><span>🏆 CUP</span>${flowTeamChip(cup?.t.gold)}</div>
            ${flowSuperSummaryHtml(f)}
        </div>`;
        if(flowSuperEditing){ const want = flowSuperCupTeams(f); if(want) html += flowSuperScorerHtml(want.teams); }
        else html += `<button class="flow-link-btn" onclick="flowEditSuperCup()"><i class="fas fa-pen"></i> Edit Super Cup score</button>`;
        html += `<button class="glass-button w-full font-bold text-sm py-3 mt-3" style="border-color:rgba(139,92,246,0.4);background:rgba(139,92,246,0.1);color:#c4b5fd;" onclick="flowEndSeason()"><i class="fas fa-flag-checkered mr-2"></i>End Season &amp; Start Season ${sid+1}</button>`;
    }

    // ---- upcoming timetable (compact) ----
    if(f && (p==='league_a'||p==='league_b'||p==='cup_draw'||p==='cup_semis')){
        const next = [];
        for(let r=(rnd||FLOW_LEAGUE_ROUNDS+1)+((p==='league_a'||p==='league_b')?1:0); r<=FLOW_LEAGUE_ROUNDS && next.length<2; r++) next.push(r);
        if(next.length){
            html += `<div class="flow-section-title" style="margin-top:14px;">Coming up</div>` + next.map(r=>`<div class="flow-upnext"><span class="flow-mw">MW${r}</span>${flowRoundFixtures(f,r).map(x=>`<span>${escapeHtml(teamShort(x.home))}–${escapeHtml(teamShort(x.away))}</span>`).join('')}</div>`).join('');
        }
    }

    // ---- maintenance ----
    html += `<div class="flow-tools">
        <button class="glass-button flex-1 text-xs py-3 flex flex-col items-center gap-1" style="border-color:rgba(59,130,246,0.3);color:#93c5fd;" onclick="recalculateLeagueTable()"><i class="fas fa-shield-halved text-lg"></i><span>Verify &amp; Repair</span></button>
    </div>
    <p style="font-size:0.6rem;color:#4b5563;text-align:center;margin-top:6px;">Rebuilds the table from match history, checks the schedule, CUP, Super Cup and medals, and repairs what it can.</p>`;
    if(f || mbaData.current){
        html += `<details class="flow-danger"><summary>Danger zone</summary>
            ${mbaData.current?`<button class="mba-cancel-btn" onclick="cancelMbaTournament()"><i class="fas fa-xmark mr-1"></i>Cancel running CUP edition</button>`:''}
            ${f?`<button class="mba-cancel-btn" onclick="flowEndSeason(true)"><i class="fas fa-flag-checkered mr-1"></i>End season now (archive as it is)</button>
            <button class="mba-cancel-btn" onclick="flowFullReset()"><i class="fas fa-skull mr-1"></i>Full reset (no archive)</button>`:''}
        </details>`;
    }
    el.innerHTML = html;
}

// ------------------------------------------------------------
// Public view — Season tab → Schedule
// ------------------------------------------------------------
function renderFlowSchedule(){
    const el = document.getElementById('schedule-season-body');
    if(!el) return;
    const f = flowCur(); const p = flowPhase();
    if(!f){
        el.innerHTML = `<div class="flow-empty"><i class="fas fa-calendar-days"></i><p>No season is running.<br>The full schedule appears here as soon as the next season starts.</p></div>`;
        return;
    }
    const rnd = flowCurrentRound(f);
    let html = `<div class="flow-head"><div class="flow-head-title">Season ${f.seasonId} <span class="flow-chip">${escapeHtml(FLOW_PHASE_LABEL[p])}</span></div>
        <div class="flow-head-sub">League games ${flowPlayedCount(f)}/${f.fixtures.length}${rnd?` · matchweek ${rnd}/${FLOW_LEAGUE_ROUNDS}`:' · league finished'}</div></div>`;
    html += flowStepperHtml();
    html += `<p class="flow-next"><i class="fas fa-circle-info"></i> ${escapeHtml(flowNextStepText())}</p>`;

    const stageBlock = (title, inner, state)=>`<div class="flow-block ${state}"><div class="flow-block-title">${title}</div>${inner}</div>`;
    const stageState = i => { const a=flowStageIndex(); return a>i?'done':(a===i?'active':'todo'); };
    const weeks = (from,to)=>{
        let h=''; for(let r=from;r<=to;r++){
            const done = flowRoundDone(f,r), cur = r===rnd && (p==='league_a'||p==='league_b');
            h += `<div class="flow-week${done?' done':''}${cur?' current':''}"><div class="flow-week-head">Matchweek ${r}${cur?' <span class="flow-chip">now</span>':''}</div>${flowRoundFixtures(f,r).map(x=>flowFixtureRow(x)).join('')}</div>`;
        } return h;
    };
    html += stageBlock('1 · League — Matchweeks 1–6', weeks(1,FLOW_FIRST_HALF), stageState(0));

    const cup = flowCupOf(f);
    let cupInner = `<p class="flow-note">Starts after matchweek ${FLOW_FIRST_HALF}. Two semifinal series decide the finalists; the league then resumes.</p>`;
    if(cup){
        cupInner = cup.t.semis.map((s,i)=>{
            const [a,b] = s.teams; const w = s.wins||{};
            return `<div class="flow-fixture${s.winner?' played':''}">${flowTeamChip(a)}<span class="flow-score">${w[a]||0}<i>:</i>${w[b]||0}</span>${flowTeamChip(b,'away')}</div>`;
        }).join('') + `<p class="flow-note">See the CUP tab for the full bracket.</p>`;
    }
    html += stageBlock('2 · CUP Semifinals', cupInner, stageState(1));
    html += stageBlock('3 · League — Matchweeks 7–12', weeks(FLOW_FIRST_HALF+1,FLOW_LEAGUE_ROUNDS), stageState(2));

    let finalsInner = `<p class="flow-note">After matchweek ${FLOW_LEAGUE_ROUNDS}: the CUP final and the third-place match.</p>`;
    if(cup && cup.t.final && cup.t.final.winner) finalsInner = `<div class="flow-summary-row"><span>🏆 CUP champion</span>${flowTeamChip(cup.t.final.winner)}</div>`;
    html += stageBlock('4 · CUP Final & Third Place', finalsInner, stageState(3));

    const want = flowSuperCupTeams(f);
    let superInner = `<p class="flow-note">League champion vs CUP champion — one match.</p>`;
    if(want && !flowSuperCupValid(f)) superInner = `<div class="flow-fixture">${flowTeamChip(want.teams[0])}<span class="flow-vs">vs</span>${flowTeamChip(want.teams[1],'away')}</div>`;
    if(flowSuperCupValid(f)) superInner = flowSuperSummaryHtml(f) + `<div class="flow-summary-row"><span>🏆 Winner</span>${flowTeamChip(f.superCup.winner)}</div>`;
    html += stageBlock('5 · Super Cup', superInner, stageState(4));

    el.innerHTML = html;
}

function renderFlowViews(){
    renderFlowAdmin();
    renderFlowSchedule();
}

// ------------------------------------------------------------
// Audit / repair — called by "Verify & Repair" (js/verify.js).
// Checks the timetable itself, the link between fixtures and saved
// matches, the stage ordering, and the CUP / Super Cup attachments.
// Returns { items:[{level:'ok'|'fixed'|'warn'|'error', text}], changedFlow }.
// ------------------------------------------------------------
function auditFlow(){
    const items = []; let changedFlow = false;
    const push = (level,text)=>items.push({ level, text });
    const f = flowCur();
    const matches = matchHistory || [];
    if(!f){
        push('ok','No season schedule is running.');
        if(matches.length) push('warn',`${matches.length} league match${matches.length===1?'':'es'} exist but no schedule is running — start the season to link them to a timetable.`);
        return { items, changedFlow };
    }
    const before = items.length;
    const tag = `Season ${f.seasonId}`;

    // 1) the timetable itself
    const fx = f.fixtures || [];
    if(fx.length!==TEAM_NAMES.length/2*FLOW_LEAGUE_ROUNDS) push('error',`${tag}: the schedule has ${fx.length} fixtures instead of ${TEAM_NAMES.length/2*FLOW_LEAGUE_ROUNDS}.`);
    TEAM_NAMES.forEach(t=>{
        const n = fx.filter(x=>x.home===t||x.away===t).length;
        if(n!==FLOW_LEAGUE_ROUNDS) push('error',`${tag}: ${flowName(t)} has ${n} scheduled games instead of ${FLOW_LEAGUE_ROUNDS}.`);
    });
    for(let r=1;r<=FLOW_LEAGUE_ROUNDS;r++){
        const teams = flowRoundFixtures(f,r).flatMap(x=>[x.home,x.away]);
        if(new Set(teams).size!==TEAM_NAMES.length || teams.length!==TEAM_NAMES.length) push('error',`${tag}: matchweek ${r} does not have every team exactly once.`);
    }

    // 2) fixtures <-> saved matches
    const ids = new Set(fx.map(x=>x.id)), count = {};
    let unlinked = 0;
    matches.forEach(m=>{
        if(!m.fx){ unlinked++; return; }
        if(!ids.has(m.fx)){ push('error',`A saved match (${flowName(m.home)} ${m.score} ${flowName(m.away)}) points to a fixture that is not in this schedule — delete it or re-save it.`); return; }
        count[m.fx] = (count[m.fx]||0)+1;
        const x = fx.find(y=>y.id===m.fx);
        const same = (x.home===m.home&&x.away===m.away)||(x.home===m.away&&x.away===m.home);
        if(!same) push('error',`${tag} matchweek ${x.round}: the saved result is between ${flowName(m.home)} and ${flowName(m.away)}, but the fixture is ${flowName(x.home)} vs ${flowName(x.away)}.`);
    });
    Object.keys(count).forEach(id=>{ if(count[id]>1) push('error',`Fixture ${id} has ${count[id]} saved results — delete the extra ones.`); });
    if(unlinked) push('warn',`${unlinked} saved match${unlinked===1?'':'es'} not linked to any fixture (played before the schedule existed). They still count in the table.`);

    // 3) stage ordering
    const cup = flowCupOf(f);
    const secondHalfPlayed = fx.some(x=>x.round>FLOW_FIRST_HALF && flowMatchOf(x));
    if(secondHalfPlayed && !flowRangeDone(f,1,FLOW_FIRST_HALF)) push('warn',`${tag}: second-half games exist while matchweeks 1–${FLOW_FIRST_HALF} are not all played.`);
    if(secondHalfPlayed && !flowSemisDone(cup)) push('warn',`${tag}: second-half games were recorded before the CUP semifinals were decided.`);
    if(cup && cup.t.final && cup.t.final.winner && !flowRangeDone(f,1,FLOW_LEAGUE_ROUNDS)) push('warn',`${tag}: the CUP final was recorded before the league finished.`);

    // 4) CUP + Super Cup attachments
    if(f.cupEdition!=null && !cup){
        f.cupEdition = null; changedFlow = true;
        push('fixed',`${tag}: the CUP edition linked to this season no longer exists — the CUP draw is open again.`);
    }
    if(cup && cup.t.seasonId!=null && cup.t.seasonId!==f.seasonId) push('warn',`${tag}: the linked CUP edition ${f.cupEdition} was drawn for Season ${cup.t.seasonId}.`);
    if(f.superCup){
        if(!flowSuperCupValid(f)){
            f.superCup = null; changedFlow = true;
            push('fixed',`${tag}: the saved Super Cup result no longer matches the league/CUP champions (or those are not decided yet) — it was cleared, please play it again.`);
        } else {
            const sc = f.superCup, a = sc.scores[sc.teams[0]], b = sc.scores[sc.teams[1]];
            const expected = a>b ? sc.teams[0] : sc.teams[1];
            if(a===b) push('error',`${tag}: the Super Cup score is a draw — edit it.`);
            else if(expected!==sc.winner){ sc.winner = expected; changedFlow = true; push('fixed',`${tag}: Super Cup winner corrected to ${flowName(expected)} to match the score ${a}–${b}.`); }
        }
    }
    if(items.length===before) push('ok',`${tag}: schedule, results, CUP and Super Cup are consistent (${flowPlayedCount(f)}/${fx.length} league games played, stage: ${FLOW_PHASE_LABEL[flowPhase()]}).`);
    return { items, changedFlow };
}

// Compact, read-only picture of the schedule for the AI assistant (js/ai-chat.js).
function buildScheduleSnapshot(){
    const f = flowCur();
    if(!f) return { status:'no_schedule_running' };
    const p = flowPhase(), rnd = flowCurrentRound(f);
    const cup = flowCupOf(f), want = flowSuperCupTeams(f);
    return {
        status:'running', season:f.seasonId, stage:FLOW_PHASE_LABEL[p], stageId:p,
        order:'League MW1-6 → CUP semifinals → League MW7-12 → CUP final & 3rd place → Super Cup (league champion vs CUP champion)',
        gamesPerTeam:12, leagueGamesPlayed:flowPlayedCount(f), leagueGamesTotal:f.fixtures.length,
        currentMatchweek: rnd,
        leagueIdleByDesign: ['cup_draw','cup_semis','cup_finals','supercup','complete'].includes(p),
        nextFixtures: (rnd && (p==='league_a'||p==='league_b')) ? flowRoundFixtures(f,rnd).filter(x=>!flowMatchOf(x)).map(x=>({home:x.home,away:x.away})) : [],
        nextStep: flowNextStepText(),
        cupEdition: f.cupEdition ?? null, cupFinished: cup ? cup.done : false,
        superCup: flowSuperCupValid(f) ? { teams:f.superCup.teams, score:`${f.superCup.scores[f.superCup.teams[0]]}-${f.superCup.scores[f.superCup.teams[1]]}`, winner:f.superCup.winner }
                  : (want ? { teams:want.teams, played:false } : { teams:null, note:'decided after the league and the CUP end' })
    };
}
