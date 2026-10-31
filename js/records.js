// ============================================================
// records.js  —  RECORDS sheet (Home → Records; takes the Federation tile's place when that tile is switched off in Profile)
// Team records worked out from what the app already has: career totals (archived seasons + the live season), the match logs
// that exist (archived seasons keep a log from season 6 on; the current season has its own), the champions list and the trophy counts.
// Nothing is stored. Loaded as a classic script.
// ============================================================
function recordsParseScore(m){
    const p = String(m && m.score || '').split('-').map(x=>parseInt(x,10));
    return (p.length===2 && p.every(n=>Number.isFinite(n))) ? { a:p[0], b:p[1] } : null;
}
function recordsLeaders(list){          // list: [{team,value}] → every team sharing the best (positive) value
    const best = Math.max(0, ...list.map(x=>x.value));
    return { best, teams: best>0 ? list.filter(x=>x.value===best).map(x=>x.team) : [] };
}
function recordsCompute(){
    const stats = computeAllTimeStats();
    const trophies = computeTrophyCounts();
    const logs = [];
    (archivedSeasons||[]).forEach(s=>(s.history||[]).forEach(m=>logs.push(m)));
    (matchHistory||[]).forEach(m=>logs.push(m));
    const clean = {}; TEAM_NAMES.forEach(t=>clean[t]=0);
    let biggest = null, highest = null;
    logs.forEach(m=>{
        const sc = recordsParseScore(m); if(!sc || !TEAM_NAMES.includes(m.home) || !TEAM_NAMES.includes(m.away)) return;
        if(sc.b===0) clean[m.home]++;
        if(sc.a===0) clean[m.away]++;
        const margin = Math.abs(sc.a-sc.b), total = sc.a+sc.b;
        if(margin>0 && (!biggest || margin>biggest.margin || (margin===biggest.margin && total>biggest.total))) biggest = { m, sc, margin, total };
        if(!highest || total>highest.total) highest = { m, sc, margin, total };
    });
    // Longest reign at the top = most league titles in a row (consecutive seasons as champion)
    const champs = [...(archivedSeasons||[])].filter(s=>s&&s.table&&s.table[0]).sort((a,b)=>(a.seasonId||0)-(b.seasonId||0));
    const reign = {}; TEAM_NAMES.forEach(t=>reign[t]={ len:0, from:null, to:null });
    let run = null;
    champs.forEach(s=>{
        const t = s.table[0].name;
        if(run && run.team===t){ run.len++; run.to=s.seasonId; } else run = { team:t, len:1, from:s.seasonId, to:s.seasonId };
        if(reign[t] && run.len>reign[t].len) reign[t] = { len:run.len, from:run.from, to:run.to };
    });
    const bars = (fn)=>TEAM_NAMES.map(t=>({ team:t, value:fn(t) })).sort((x,y)=>y.value-x.value);
    const cards = [
        { id:'goals',   icon:'⚽', title:'Most Goals Scored',     note:'All-time, every season',            list:bars(t=>stats[t].GF), unit:'goals' },
        { id:'conc',    icon:'🧱', title:'Most Goals Conceded',   note:'All-time — the leakiest defence',   list:bars(t=>stats[t].GA), unit:'goals' },
        { id:'clean',   icon:'🧤', title:'Most Clean Sheets',     note:`From the ${logs.length} games on record`, list:bars(t=>clean[t]), unit:'clean sheets' },
        { id:'reign',   icon:'👑', title:'Longest Reign at the Top', note:'League titles won in a row',     list:bars(t=>reign[t].len), unit:'in a row',
          extra:t=> reign[t].len>1 ? `Seasons ${reign[t].from}–${reign[t].to}` : '' },
        { id:'decor',   icon:'🏆', title:'Most Decorated',        note:'League + CUP + Super Cup titles',   list:bars(t=>(trophies[t].leagueGold||0)+(trophies[t].cup||0)+(trophies[t].superCup||0)), unit:'titles',
          extra:t=>{ const x=trophies[t]; return [x.leagueGold&&`${x.leagueGold} league`, x.cup&&`${x.cup} CUP`, x.superCup&&`${x.superCup} Super Cup`].filter(Boolean).join(' · '); } },
    ];
    return { cards, biggest, highest };
}
function recordsTeamLabel(t){ return (typeof TEAM_DISPLAY_NAMES!=='undefined' && TEAM_DISPLAY_NAMES[t]) || t; }
function recordsLogo(t, cls){ return `<img class="${cls||''}" src="${teamLogoUrl(t)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`; }

function recordsRender(){
    const box = document.getElementById('records-list'); if(!box) return;
    const { cards, biggest, highest } = recordsCompute();
    let i = 0;
    const rows = cards.map(c=>{
        const L = recordsLeaders(c.list);
        const max = Math.max(1, L.best);
        const logos = L.teams.map(t=>`<span class="rec-logo-wrap">${recordsLogo(t,'rec-logo')}</span>`).join('');
        const names = L.teams.map(t=>escapeHtml(recordsTeamLabel(t))).join(' & ');
        const extra = L.teams.length===1 && c.extra ? c.extra(L.teams[0]) : '';
        const bars = c.list.map(x=>`
            <div class="rec-bar-row${L.teams.includes(x.team)?' lead':''}">
                ${recordsLogo(x.team,'rec-mini')}
                <div class="rec-bar"><i style="--w:${Math.round(x.value/max*100)}%"></i></div>
                <b>${x.value}</b>
            </div>`).join('');
        return `
        <div class="rec-card" style="--d:${(i++)*90}ms">
            <div class="rec-head"><span class="rec-ico">${c.icon}</span><div><div class="rec-title">${c.title}</div><div class="rec-note">${escapeHtml(c.note)}</div></div></div>
            ${L.teams.length ? `
            <div class="rec-hero">
                <div class="rec-logos">${logos}</div>
                <div class="rec-hero-txt">
                    <div class="rec-team">${names}${L.teams.length>1?' <em>shared</em>':''}</div>
                    <div class="rec-val"><span class="rec-count" data-to="${L.best}">0</span><small>${c.unit}</small></div>
                    ${extra ? `<div class="rec-extra">${escapeHtml(extra)}</div>` : ''}
                </div>
            </div>` : `<div class="rec-empty">No one has set this record yet</div>`}
            <div class="rec-bars">${bars}</div>
        </div>`;
    });
    const match = (id, icon, title, data)=> data ? `
        <div class="rec-card rec-match" style="--d:${(i++)*90}ms">
            <div class="rec-head"><span class="rec-ico">${icon}</span><div><div class="rec-title">${title}</div><div class="rec-note">${data.m.timestamp ? new Date(data.m.timestamp).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : ''}</div></div></div>
            <div class="rec-scoreline">
                <div class="rec-side">${recordsLogo(data.m.home,'rec-logo')}<span>${escapeHtml(recordsTeamLabel(data.m.home))}</span></div>
                <div class="rec-score"><span class="rec-count" data-to="${data.sc.a}">0</span><i>–</i><span class="rec-count" data-to="${data.sc.b}">0</span></div>
                <div class="rec-side">${recordsLogo(data.m.away,'rec-logo')}<span>${escapeHtml(recordsTeamLabel(data.m.away))}</span></div>
            </div>
        </div>` : '';
    box.innerHTML = rows.join('') + match('big','💥','Biggest Win',biggest) + match('high','🎯','Highest-Scoring Match',highest);
    // count-up
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
    box.querySelectorAll('.rec-count').forEach((el,k)=>{
        const to = +el.dataset.to; if(reduce || to<=0){ el.textContent = to; return; }
        const t0 = performance.now() + 220 + k*40, dur = 900;
        const tick = now=>{
            if(now<t0){ requestAnimationFrame(tick); return; }
            const p = Math.min(1,(now-t0)/dur), e = 1-Math.pow(1-p,3);
            el.textContent = Math.round(to*e);
            if(p<1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    box.scrollTop = 0;
}
function openRecordsSheet(){
    haptic([8]);
    const sh = document.getElementById('records-sheet'); if(!sh) return;
    recordsRender();
    sh.classList.remove('open'); void sh.offsetWidth; sh.classList.add('open');
}
function closeRecordsSheet(){ const sh = document.getElementById('records-sheet'); if(sh) sh.classList.remove('open'); }
