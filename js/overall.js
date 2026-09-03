// ============================================================
// overall.js  —  OVERALL — main league ranking render
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// RENDER — MAIN LEAGUE (unified ranking cards)
// ============================================================
function renderMainLeagueTable(){
    document.getElementById('main-loading-message').style.display='none';
    const trophies = computeTrophyCounts();
    const table = TEAM_NAMES.map(t=>({name:t,...trophies[t]})).sort(compareTrophies);
    const pod=document.getElementById('podium-container');

    if(!table.length){ pod.style.display='none'; return; }

    pod.style.display='flex';

    const rankClasses=['rank-1','rank-2','rank-3'];

    // Teams tied on gold/silver/bronze share the same rank number (e.g. two
    // teams both on 2 golds are both "#1" — the next distinct team is "#3",
    // not "#2"), mirroring standard sports "equal rank" conventions.
    const ranks=[];
    table.forEach((t,i)=>{
        if(i>0){
            const prev=table[i-1];
            const tied = t.gold===prev.gold && t.silver===prev.silver && t.bronze===prev.bronze;
            ranks.push(tied ? ranks[i-1] : i+1);
        } else {
            ranks.push(1);
        }
    });

    pod.innerHTML=table.map((t,i)=>{
        const rankNum   = ranks[i];
        const rankClass = rankNum <= 3 ? rankClasses[rankNum-1] : 'rank-other';
        const delay     = i * 55;

        // Modern rank badge: icons for top3, number for rest — driven by the
        // tie-aware rankNum, not the array index, so tied teams get matching badges.
        const rankBadgeContent = rankNum === 1 ? '<i class="fas fa-crown" style="font-size:1rem;"></i>'
                                : rankNum === 2 ? '<span style="font-size:1rem;font-weight:900;">2</span>'
                                : rankNum === 3 ? '<span style="font-size:1rem;font-weight:900;">3</span>'
                                : `<span>${rankNum}</span>`;

        return `
            <div class="ranking-card ${rankClass}" style="animation-delay:${delay}ms" onclick="openTeamPanel('${t.name}')">
                <div class="ranking-badge">${rankBadgeContent}</div>
                <img src="${GITHUB_IMAGE_BASE_URL}${t.name}.png" class="ranking-avatar" onerror="this.style.opacity='1'">
                <div class="ranking-info">
                    <div class="ranking-name" style="font-size:1.05rem;font-weight:900;letter-spacing:0.3px;">${TEAM_DISPLAY_NAMES[t.name]}</div>
                </div>
                <div class="ranking-trophy-block">
                    <div class="ranking-trophy-item"><span class="trophy-emoji">🥇</span><b>${t.gold}</b></div>
                    <div class="ranking-trophy-item"><span class="trophy-emoji">🥈</span><b>${t.silver}</b></div>
                    <div class="ranking-trophy-item"><span class="trophy-emoji">🥉</span><b>${t.bronze}</b></div>
                </div>
            </div>`;
    }).join('');

    // clear the old separate body — all cards go inside pod now
    document.getElementById('main-league-body').innerHTML='';
}

