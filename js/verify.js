// ============================================================
// verify.js — VERIFY TABLE (league + CUP), one button
// ------------------------------------------------------------
// Loaded AFTER league-ops.js and mba.js. It re-declares
// recalculateLeagueTable(), so this version replaces the old
// league-only one (you can delete the old function from
// league-ops.js — this file wins either way).
//
// One tap now:
//   1) rebuilds the season table from match history (as before),
//   2) re-derives every CUP series from its saved games, repairs
//      winners / medals / champion logs, and reports what it can't fix,
//   3) sanity-checks archived league seasons' podium (report only),
//   4) shows a report sheet with the final medal tally per team.
// ============================================================

function verifyReportRow(level, text){
    const meta = { ok:['✅','#4ade80'], fixed:['🛠️','#fbbf24'], warn:['⚠️','#fbbf24'], error:['❌','#f87171'] }[level] || ['•','#cbd5e1'];
    return `<div class="report-row"><span style="color:${meta[1]};flex-shrink:0;">${meta[0]}</span><span class="label" style="flex:1;color:#cbd5e1;">${escapeHtml(text)}</span></div>`;
}
function verifyReportSection(title, items){
    return `<div style="font-size:0.62rem;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7280;margin:14px 0 4px;">${escapeHtml(title)}</div>`
        + items.map(i=>verifyReportRow(i.level, i.text)).join('');
}

// Archived league seasons: medals come from table[0..2], so the saved order
// must match the points order. Report-only — archives are never auto-edited.
function auditArchivedSeasons(){
    const items = [];
    (archivedSeasons||[]).forEach(s=>{
        const tag = `League Season ${s.seasonId}`;
        const table = s.table || [];
        if(table.length<3){ items.push({ level:'warn', text:`${tag}: fewer than 3 teams in the saved table — medals may be incomplete.` }); return; }
        const sorted = [...table].sort((a,b)=>(b.Pts-a.Pts)||((b.GF-b.GA)-(a.GF-a.GA)));
        const podiumStored = table.slice(0,3).map(r=>r.name).join(' > ');
        const podiumSorted = sorted.slice(0,3).map(r=>r.name).join(' > ');
        if(podiumStored!==podiumSorted){
            items.push({ level:'warn', text:`${tag}: saved podium (${podiumStored}) differs from the points order (${podiumSorted}) — check the medals.` });
        }
        if(Array.isArray(s.history) && s.history.length){
            const tmp = {}; TEAM_NAMES.forEach(t=>tmp[t]={ P:0,W:0,D:0,L:0,GF:0,GA:0,Pts:0 });
            s.history.forEach(m=>{
                const p = String(m.score).split('-');
                const hs = parseInt(p[0])||0, as = parseInt(p[1])||0;
                if(tmp[m.home]) updateTeamStats(tmp[m.home], hs, as);
                if(tmp[m.away]) updateTeamStats(tmp[m.away], as, hs);
            });
            table.forEach(r=>{
                const x = tmp[r.name]; if(!x) return;
                const diffs = ['P','W','D','L','GF','GA','Pts'].filter(k=>(r[k]||0)!==x[k]);
                if(diffs.length) items.push({ level:'warn', text:`${tag}: ${TEAM_DISPLAY_NAMES[r.name]||r.name} — saved ${diffs.join('/')} differ from that season’s match history.` });
            });
        }
    });
    if(!items.length) items.push({ level:'ok', text: (archivedSeasons||[]).length ? `All ${archivedSeasons.length} archived season${archivedSeasons.length===1?'':'s'} have a consistent podium.` : 'No archived league seasons yet.' });
    return items;
}

// Medal tally per team, computed independently for League and CUP and
// cross-checked against computeTrophyCounts() (what the Overall screen shows).
function buildMedalReport(){
    const lg = {}, mb = {};
    TEAM_NAMES.forEach(t=>{ lg[t]={gold:0,silver:0,bronze:0}; mb[t]={gold:0,silver:0,bronze:0}; });
    (archivedSeasons||[]).forEach(s=>{
        const tb = s.table || [];
        ['gold','silver','bronze'].forEach((k,i)=>{ if(tb[i] && lg[tb[i].name]) lg[tb[i].name][k]++; });
    });
    ((mbaData&&mbaData.completed)||[]).forEach(r=>{
        ['gold','silver','bronze'].forEach(k=>{ if(r[k] && mb[r[k]]) mb[r[k]][k]++; });
    });
    const shown = computeTrophyCounts();
    let mismatch = false;
    const rows = TEAM_NAMES.map(t=>{
        const tot = { gold:lg[t].gold+mb[t].gold, silver:lg[t].silver+mb[t].silver, bronze:lg[t].bronze+mb[t].bronze };
        const ok = tot.gold===shown[t].gold && tot.silver===shown[t].silver && tot.bronze===shown[t].bronze;
        if(!ok) mismatch = true;
        return `<div class="report-row"><span class="label" style="flex:1;">${escapeHtml(TEAM_DISPLAY_NAMES[t]||t)}<br><span style="font-size:0.58rem;color:#6b7280;">League ${lg[t].gold}/${lg[t].silver}/${lg[t].bronze} · CUP ${mb[t].gold}/${mb[t].silver}/${mb[t].bronze}</span></span><span class="value">🥇 ${tot.gold} 🥈 ${tot.silver} 🥉 ${tot.bronze}${ok?'':' ❌'}</span></div>`;
    }).join('');
    return { html: rows, mismatch };
}

async function recalculateLeagueTable(){
    const ok = await showConfirm({
        icon:'🛡️', title:'Verify & Repair?',
        message:'The season table is rebuilt from match history. CUP results, medals and champion records are checked too, and repaired where possible.',
        okLabel:'Verify', okColor:'purple'
    });
    if(!ok) return;

    // ---- 1) League table ----
    const before = JSON.parse(JSON.stringify(leagueData));
    await loadMatchHistoryFromGitHub();
    initializeLeagueData();
    matchHistory.forEach(m=>{
        const p = m.score.split('-');
        const hs = parseInt(p[0])||0, as = parseInt(p[1])||0;
        if(leagueData[m.home]) updateTeamStats(leagueData[m.home], hs, as);
        if(leagueData[m.away]) updateTeamStats(leagueData[m.away], as, hs);
    });
    const leagueSaved = await saveLeagueDataToGitHub(leagueData, 'Verified & rebuilt table from match history');

    const leagueItems = [];
    TEAM_NAMES.forEach(t=>{
        const b = before[t] || {}, a = leagueData[t];
        const diffs = ['P','W','D','L','GF','GA','Pts'].filter(k=>(b[k]||0)!==a[k]).map(k=>`${k} ${b[k]||0}→${a[k]}`);
        if(diffs.length) leagueItems.push({ level:'fixed', text:`${TEAM_DISPLAY_NAMES[t]||t}: ${diffs.join(', ')}` });
    });
    if(!leagueItems.length) leagueItems.push({ level:'ok', text:`Season table matches all ${matchHistory.length} saved match${matchHistory.length===1?'':'es'}.` });
    if(!leagueSaved) leagueItems.push({ level:'warn', text:'Table rebuilt locally but could not be saved to GitHub — check your connection.' });

    // ---- 2) CUP ----
    await loadMbaDataFromGitHub();
    await loadMainLeagueDataFromGitHub();
    const mba = auditMbaData();
    let mbaSaved = true, mainSaved = true;
    if(mba.changedMba)  mbaSaved  = await saveMbaDataToGitHub('Verified & repaired CUP data');
    if(mba.changedMain) mainSaved = await saveMainLeagueDataToGitHub(mainLeagueData, 'Verified CUP champion records');
    if(!mbaSaved || !mainSaved) mba.items.push({ level:'warn', text:'Repairs were applied locally but could not be saved to GitHub — run Verify again once you’re online.' });
    renderMbaSeasonView();
    renderMbaAdminSection();

    // ---- 3) Archived seasons + medal tally ----
    const archiveItems = auditArchivedSeasons();
    const medals = buildMedalReport();

    const all = [...leagueItems, ...mba.items, ...archiveItems];
    const nFixed = all.filter(i=>i.level==='fixed').length;
    const nErr   = all.filter(i=>i.level==='error').length;
    const nWarn  = all.filter(i=>i.level==='warn').length;

    const summary = nErr
        ? `${nErr} issue${nErr===1?'':'s'} need${nErr===1?'s':''} manual attention`
        : (nFixed ? `${nFixed} thing${nFixed===1?'':'s'} repaired` : (nWarn ? 'Verified — see warnings' : 'Everything is consistent'));
    const html =
        `<div style="text-align:center;font-size:0.8rem;font-weight:800;color:${nErr?'#f87171':'#4ade80'};margin-bottom:2px;">${escapeHtml(summary)}</div>`
        + verifyReportSection('League table', leagueItems)
        + verifyReportSection('CUP tournaments', mba.items)
        + verifyReportSection('Archived league seasons', archiveItems)
        + verifyReportSection('Medal totals (League + CUP)', [])
        + medals.html
        + (medals.mismatch ? verifyReportRow('error','Medal totals don’t match the Overall screen — please report this.') : '');

    showToast(nErr ? 'Verified — issues found ⚠️' : (nFixed ? 'Verified & repaired 🛠️' : 'Everything verified ✅'), nErr?'error':'success', 3200);
    await refreshAllLeagueViews();
    showAdminDashboard();
    openReportSheet('Verification Report', html);
}
