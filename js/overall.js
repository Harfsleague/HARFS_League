// ============================================================
// overall.js  —  OVERALL — main league ranking render
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// RENDER — MAIN LEAGUE (unified ranking cards)
// ============================================================
// Purple-team artwork (symbolic team): a purple flower in place of the rank
// number and a purple medal in place of the gold/silver/bronze trio.
const PURPLE_FLOWER_SVG='<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><g fill="#c084fc"><circle cx="16" cy="9" r="5.2"/><circle cx="23.1" cy="14.2" r="5.2"/><circle cx="20.4" cy="22.6" r="5.2"/><circle cx="11.6" cy="22.6" r="5.2"/><circle cx="8.9" cy="14.2" r="5.2"/></g><circle cx="16" cy="16.5" r="3.6" fill="#fde68a"/></svg>';
const PURPLE_MEDAL_SVG='<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M10 2h5l3 9h-5z" fill="#7e22ce"/><path d="M22 2h-5l-3 9h5z" fill="#a855f7"/><circle cx="16" cy="20" r="9" fill="#a855f7"/><circle cx="16" cy="20" r="9" fill="none" stroke="#e9d5ff" stroke-width="1.5"/><circle cx="16" cy="20" r="5.6" fill="#7e22ce"/><path d="M16 15.8l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="#f3e8ff"/></svg>';

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
                <img src="${teamLogoUrl(t.name)}" class="ranking-avatar" onerror="this.style.opacity='0.3'" onload="this.style.opacity='1'">
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

// ============================================================
// PEOPLE PANEL - symbolic accounts (outside every table/ranking).
// Name + picture come from each account's own profile (they log in from the
// login screen and use Profile -> pencil icon), stored in main_league_data.json
// like any team profile. Keys must match SYMBOLIC_TEAMS in config.js and the Worker.
// ============================================================
const PEOPLE = [
    { key:'President', role:'Federation President', accent:'#fbbf24' },
    { key:'Owner1',    role:'Team Owner', teams:['Sezar','Bayern'], accent:'#60a5fa' },
    { key:'Owner2',    role:'Team Owner', teams:['Yellow','HOSI'],  accent:'#34d399' },
    { key:'Purple',    role:'Fan', accent:'#a855f7' },
];
function personAvatar(p){
    const nm = TEAM_DISPLAY_NAMES[p.key] || p.key;
    const initial = escapeHtml([...String(nm)][0] || '?').replace(/'/g,'');
    const fallback = `this.outerHTML='<div class=&quot;people-avatar people-avatar-ph&quot;>${initial}</div>'`;
    return `<img class="people-avatar" src="${teamLogoUrl(p.key)}" onerror="${fallback}">`;
}
function renderPeopleSheet(){
    const box = document.getElementById('people-list');
    if(!box) return;
    box.innerHTML = PEOPLE.map(p=>{
        const name = TEAM_DISPLAY_NAMES[p.key] || p.key;
        const teams = (p.teams||[]).map(t=>`<img class="people-team-logo" src="${teamLogoUrl(t)}" title="${escapeHtml(TEAM_DISPLAY_NAMES[t]||t)}">`).join('');
        return `<div class="people-row" style="--pa:${p.accent}">
            ${personAvatar(p)}
            <div class="people-info">
                <div class="people-name" dir="auto">${escapeHtml(name)}</div>
                <div class="people-role">${escapeHtml(p.role)}</div>
            </div>
            <div class="people-teams">${teams}</div>
        </div>`;
    }).join('');
}
function openPeopleSheet(){
    haptic([8]);
    renderPeopleSheet();
    document.getElementById('people-sheet').classList.add('open');
}
function closePeopleSheet(){
    document.getElementById('people-sheet').classList.remove('open');
}

