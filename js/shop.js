// ============================================================
// shop.js  —  TROPHIES
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
//
// NOTE: the coin economy, the Arena Shop and the Mystery Box that used to
// live in this file have been removed. What's left: trophies (tallied live
// from archived seasons, never stored) and the wallet-record backfill.
// ============================================================

// Gold/silver/bronze tally, read straight from the archive — never stored separately.
// gold / silver / bronze = what the RANKING uses (league + CUP medals together, exactly as before).
// For DISPLAY the same totals are also split: leagueGold (league titles only), cup (CUP titles),
// superCup (Super Cup titles). Super Cup never feeds the ranking.
function computeTrophyCounts(){
    const counts = {}; TEAM_NAMES.forEach(t=>counts[t]={gold:0,silver:0,bronze:0,leagueGold:0,cup:0,superCup:0});
    (archivedSeasons||[]).forEach(season=>{
        const table = season.table || [];
        if(table[0] && counts[table[0].name]) counts[table[0].name].leagueGold++;
        if(season.superCup && season.superCup.winner && counts[season.superCup.winner]) counts[season.superCup.winner].superCup++;
        if(table[0] && counts[table[0].name]) counts[table[0].name].gold++;
        if(table[1] && counts[table[1].name]) counts[table[1].name].silver++;
        if(table[2] && counts[table[2].name]) counts[table[2].name].bronze++;
    });
    // CUP tournaments (js/mba.js) award medals the exact same way a league
    // season does — gold/silver/bronze from each completed run just add
    // into the same totals here, so the Overall table, a team's trophy
    // cabinet, and the "Most Decorated" record badge all reflect CUP wins
    // automatically without any of them needing their own CUP-aware logic.
    ((mbaData&&mbaData.completed)||[]).forEach(t=>{
        if(t.gold && counts[t.gold]){ counts[t.gold].gold++; counts[t.gold].cup++; }
        if(t.silver && counts[t.silver]) counts[t.silver].silver++;
        if(t.bronze && counts[t.bronze]) counts[t.bronze].bronze++;
    });
    return counts;
}
// The honours a team has actually won, for display — anything it has not won is simply left out
// (no "🏆 0"). Icons live here so they can be changed in one place:
//   🏆 league title · (drawn cup) CUP title · ⚡ Super Cup title · 🥈 / 🥉 silver / bronze (league + CUP)
// The CUP icon is drawn here (an emoji would be a medal, and a CUP is a cup): a silver cup with gold
// rim, big gold handles, a blue emblem and a bronze base — different from the league 🏆 at a glance.
const CUP_ICON_SVG = '<svg class="hof-cup-svg" viewBox="0 0 32 32" aria-hidden="true">'
    + '<path d="M9.6 11.2C3.6 10 2.6 18.2 8.6 19.4" fill="none" stroke="#f59e0b" stroke-width="1.9" stroke-linecap="round"/>'
    + '<path d="M22.4 11.2C28.4 10 29.4 18.2 23.4 19.4" fill="none" stroke="#f59e0b" stroke-width="1.9" stroke-linecap="round"/>'
    + '<rect x="14.4" y="21.6" width="3.2" height="5.2" fill="#d97706"/>'
    + '<rect x="10.4" y="26.6" width="11.2" height="3.4" rx="1.1" fill="#b45309"/>'
    + '<path d="M8.8 9.6h14.4v4.6c0 4.6-3.1 7.8-7.2 8.2-4.1-.4-7.2-3.6-7.2-8.2z" fill="#e2e8f0"/>'
    + '<path d="M16 9.6h7.2v4.6c0 4.6-3.1 7.8-7.2 8.2z" fill="#b6c2d2"/>'
    + '<path d="M10.2 9.6C10.2 6.4 12.6 4.4 16 4.4s5.8 2 5.8 5.2z" fill="#f8fafc"/>'
    + '<rect x="8" y="8.8" width="16" height="1.8" rx=".9" fill="#fbbf24"/>'
    + '<circle cx="16" cy="3.4" r="1.5" fill="#fbbf24"/>'
    + '<circle cx="16" cy="15.2" r="2.7" fill="#3b82f6"/>'
    + '<path d="M16 13.3l.62 1.28 1.4.2-1.02.98.25 1.4L16 16.5l-1.25.66.25-1.4-1.02-.98 1.4-.2z" fill="#fef3c7"/>'
    + '</svg>';
const HOF_ICONS = { league:'🏆', cup:CUP_ICON_SVG, superCup:'⚡', silver:'🥈', bronze:'🥉' };
function hofMedals(t){
    return [
        { key:'gold',   icon:HOF_ICONS.league,   n:t.leagueGold||0, title:'League titles', isTitle:true },
        { key:'cup',    icon:HOF_ICONS.cup,      n:t.cup||0,        title:'CUP titles', isTitle:true },
        { key:'super',  icon:HOF_ICONS.superCup, n:t.superCup||0,   title:'Super Cup titles' },
        { key:'silver', icon:HOF_ICONS.silver,   n:t.silver||0,     title:'Silver' },
        { key:'bronze', icon:HOF_ICONS.bronze,   n:t.bronze||0,     title:'Bronze' },
    ].filter(m=>m.n>0);
}
// RANKING (Hall of Fame): by the number of titles = league titles + CUP titles (that is `gold`).
// Super Cup, silver and bronze never change a team's rank — teams with the same number of titles
// SHARE the rank (see renderMainLeagueTable). Silver → bronze → total → name below only decide the
// order the tied teams are listed in. Expects {name,gold,silver,bronze}.
function compareTrophies(a,b){
    if(b.gold!==a.gold) return b.gold-a.gold;
    if(b.silver!==a.silver) return b.silver-a.silver;
    if(b.bronze!==a.bronze) return b.bronze-a.bronze;
    const totalA=a.gold+a.silver+a.bronze, totalB=b.gold+b.silver+b.bronze;
    if(totalB!==totalA) return totalB-totalA;
    return a.name.localeCompare(b.name);
}

function ensureWalletFields(team){
    const w = mainLeagueData[team];
    if(!w) return;
    if(w.pinned === undefined) w.pinned = null;
    if(w.customName === undefined) w.customName = null; // backfills teams saved before the team-profile feature existed
    if(w.customLogo === undefined) w.customLogo = null;
    if(!Array.isArray(w.customPhotos)) w.customPhotos = []; // gallery: [{id,ts}] — files live in profile_photos/<team>/ (see js/profile-photos.js)
    if(!Array.isArray(w.mbaChampionLog)) w.mbaChampionLog = []; // backfills teams saved before the CUP mode existed
    // Retired fields (old coin economy + the removed Mystery Box) — dropped if an old
    // wallet record still has them, so nothing stale lingers in what gets saved.
    delete w.coins; delete w.coinLog; delete w.ownedItems; delete w.arenaUsage; delete w.totalPoints; delete w.arenaHistory;
}
