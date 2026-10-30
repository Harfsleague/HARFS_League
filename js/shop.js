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
//   🏆 league title · 🏅 CUP title · ⚡ Super Cup title · 🥈 / 🥉 silver / bronze (league + CUP)
const HOF_ICONS = { league:'🏆', cup:'🏅', superCup:'⚡', silver:'🥈', bronze:'🥉' };
function hofMedals(t){
    return [
        { key:'gold',   icon:HOF_ICONS.league,   n:t.leagueGold||0, title:'League titles' },
        { key:'cup',    icon:HOF_ICONS.cup,      n:t.cup||0,        title:'CUP titles' },
        { key:'super',  icon:HOF_ICONS.superCup, n:t.superCup||0,   title:'Super Cup titles' },
        { key:'silver', icon:HOF_ICONS.silver,   n:t.silver||0,     title:'Silver' },
        { key:'bronze', icon:HOF_ICONS.bronze,   n:t.bronze||0,     title:'Bronze' },
    ].filter(m=>m.n>0);
}
// True medal-table ranking: most gold wins outright; silver is the first
// tie-break, bronze the second; total trophy count breaks any further tie,
// then alphabetical for full stability. Expects {name,gold,silver,bronze}.
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
