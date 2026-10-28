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
const PURPLE_MEDAL_SVG='<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M10 2h5l3 9h-5z" fill="#7e22ce"/><path d="M22 2h-5l-3 9h5z" fill="#a855f7"/><circle cx="16" cy="20" r="9" fill="#a855f7"/><circle cx="16" cy="20" r="9" fill="none" stroke="#e9d5ff" stroke-width="1.5"/><circle cx="16" cy="20" r="5.6" fill="#7e22ce"/><path d="M16 15.8l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="#f3e8ff"/></svg>';

function renderMainLeagueTable(){
    document.getElementById('main-loading-message').style.display='none';
    const trophies = computeTrophyCounts();
    const table = TEAM_NAMES.map(t=>({name:t,...trophies[t]})).sort(compareTrophies);
    const pod=document.getElementById('podium-container');

    if(!table.length){ pod.style.display='none'; return; }

    pod.style.display='flex';

    const rankClasses=['rank-1','rank-2','rank-3'];

    // Tie-aware rank numbers
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

    const top3 = table.slice(0, 3).map((t, i) => ({ ...t, rankNum: ranks[i], slot: i + 1 }));
    const rest = table.slice(3).map((t, i) => ({ ...t, rankNum: ranks[i + 3] }));

    // Podium visual order: 2nd (left), 1st (center elevated), 3rd (right)
    const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;

    const podiumHtml = `<div class="hof-podium-stage">${podiumOrder.map((t, idx) => {
        const rNum = t.rankNum;
        const rClass = rNum <= 3 ? rankClasses[rNum - 1] : 'rank-other';
        const slotClass = 'pod-slot-' + t.slot;
        const badgeIcon = rNum === 1 ? '<i class="fas fa-crown"></i>' : `<span>#${rNum}</span>`;
        const delay = idx * 65;
        return `
            <div class="hof-podium-col ${rClass} ${slotClass}" style="animation-delay:${delay}ms" onclick="openTeamPanel('${t.name}')">
                <div class="pod-avatar-stage">
                    <div class="pod-rank-pill">${badgeIcon}</div>
                    <div class="pod-avatar-ring">
                        <img src="${teamLogoUrl(t.name)}" class="pod-avatar" alt="" onerror="this.style.opacity='0.3'" onload="this.style.opacity='1'">
                    </div>
                </div>
                <div class="pod-team-name">${TEAM_DISPLAY_NAMES[t.name]}</div>
                <div class="pod-pedestal">
                    <div class="pod-medals">
                        <div class="pod-medal gold" title="Gold"><span>🏆</span><b>${t.gold}</b></div>
                        <div class="pod-medal silver" title="Silver"><span>🥈</span><b>${t.silver}</b></div>
                        <div class="pod-medal bronze" title="Bronze"><span>🥉</span><b>${t.bronze}</b></div>
                    </div>
                </div>
            </div>`;
    }).join('')}</div>`;

    const restHtml = rest.map((t, i) => {
        const rankNum = t.rankNum;
        const rankClass = rankNum <= 3 ? rankClasses[rankNum - 1] : 'rank-other';
        const delay = (i + 3) * 60;
        const rankBadgeContent = rankNum === 1 ? '<i class="fas fa-crown" style="font-size:1rem;"></i>'
                                : `<span>#${rankNum}</span>`;
        return `
            <div class="ranking-card ${rankClass}" style="animation-delay:${delay}ms" onclick="openTeamPanel('${t.name}')">
                <div class="ranking-badge">${rankBadgeContent}</div>
                <img src="${teamLogoUrl(t.name)}" class="ranking-avatar" alt="" onerror="this.style.opacity='0.3'" onload="this.style.opacity='1'">
                <div class="ranking-info">
                    <div class="ranking-name">${TEAM_DISPLAY_NAMES[t.name]}</div>
                    <div class="ranking-sub">Tap for Trophy Cabinet &amp; Record</div>
                </div>
                <div class="ranking-trophy-block">
                    <div class="ranking-trophy-item"><span class="trophy-emoji">🏆</span><b>${t.gold}</b></div>
                    <div class="ranking-trophy-item"><span class="trophy-emoji">🥈</span><b>${t.silver}</b></div>
                    <div class="ranking-trophy-item"><span class="trophy-emoji">🥉</span><b>${t.bronze}</b></div>
                </div>
            </div>`;
    }).join('');

    pod.innerHTML = podiumHtml + (restHtml ? `<div class="hof-rest-list">${restHtml}</div>` : '');
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
    const n = teamPhotoCount(p.key);
    return `<span class="people-avatar-wrap pv-trigger" onclick="openPhotoViewer('${p.key}')"><img class="people-avatar" src="${teamLogoUrl(p.key)}" onerror="${fallback}">${n>1?`<span class="pv-count-badge">${n}</span>`:''}</span>`;
}
function renderPeopleSheet(){
    const box = document.getElementById('people-list');
    if(!box) return;
    box.innerHTML = PEOPLE.map((p,i)=>{
        const name = TEAM_DISPLAY_NAMES[p.key] || p.key;
        const chips = (p.teams||[]).map(t=>`<span class="people-team-chip"><img src="${teamLogoUrl(t)}" onerror="this.style.opacity='0.3'">${escapeHtml(TEAM_DISPLAY_NAMES[t]||t)}</span>`).join('');
        return `<div class="people-row${i===0?' people-row-hero':''}" style="--pa:${p.accent};animation-delay:${i*70}ms">
            ${personAvatar(p)}
            <div class="people-info">
                <div class="people-name" dir="auto">${escapeHtml(name)}</div>
                <div class="people-role">${escapeHtml(p.role)}</div>
                ${chips ? `<div class="people-team-chips">${chips}</div>` : ''}
            </div>
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

