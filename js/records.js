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
function recordsComputeAll(){
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
    // Streaks (from the games on record, oldest first): wins in a row / games without a defeat
    const winRun = {}, unbRun = {}; TEAM_NAMES.forEach(t=>{ winRun[t]={cur:0,best:0}; unbRun[t]={cur:0,best:0}; });
    [...logs].filter(m=>recordsParseScore(m)).sort((x,y)=>String(x.timestamp||'').localeCompare(String(y.timestamp||''))).forEach(m=>{
        const sc = recordsParseScore(m);
        [[m.home,sc.a,sc.b],[m.away,sc.b,sc.a]].forEach(([t,gf,ga])=>{
            if(!winRun[t]) return;
            winRun[t].cur = gf>ga ? winRun[t].cur+1 : 0;  winRun[t].best = Math.max(winRun[t].best, winRun[t].cur);
            unbRun[t].cur = gf>=ga ? unbRun[t].cur+1 : 0; unbRun[t].best = Math.max(unbRun[t].best, unbRun[t].cur);
        });
    });
    // Best single season (points / goals scored): every archived final table + the season in progress
    const seasonBest = { pts:{}, gf:{} }; TEAM_NAMES.forEach(t=>{ seasonBest.pts[t]={v:0,s:''}; seasonBest.gf[t]={v:0,s:''}; });
    const seasonRow = (t,row,label)=>{
        if(!row) return;
        if((row.Pts||0)>seasonBest.pts[t].v) seasonBest.pts[t]={ v:row.Pts, s:label };
        if((row.GF||0)>seasonBest.gf[t].v)   seasonBest.gf[t]={ v:row.GF, s:label };
    };
    (archivedSeasons||[]).forEach(s=>(s.table||[]).forEach(r=>{ if(r && seasonBest.pts[r.name]) seasonRow(r.name,r,`Season ${s.seasonId}`); }));
    TEAM_NAMES.forEach(t=>{ const r = leagueData && leagueData[t]; if(r) seasonRow(t,r,'This season'); });
    const bars = (fn)=>TEAM_NAMES.map(t=>({ team:t, value:fn(t) })).sort((x,y)=>y.value-x.value);
    const cards = [
        { id:'goals',   icon:'⚽', title:'Most Goals Scored',     note:'All-time, every season',            list:bars(t=>stats[t].GF), unit:'goals' },
        { id:'conc',    icon:'🧱', title:'Most Goals Conceded',   note:'All-time — the leakiest defence',   list:bars(t=>stats[t].GA), unit:'goals' },
        { id:'clean',   icon:'🧤', title:'Most Clean Sheets',     note:`From the ${logs.length} games on record`, list:bars(t=>clean[t]), unit:'clean sheets' },
        { id:'reign',   icon:'👑', title:'Longest Reign at the Top', note:'League titles won in a row',     list:bars(t=>reign[t].len), unit:'in a row',
          extra:t=> reign[t].len>1 ? `Seasons ${reign[t].from}–${reign[t].to}` : '' },
        { id:'wins',    icon:'🔥', title:'Most Wins',             note:'All-time, every season',            list:bars(t=>stats[t].W), unit:'wins' },
        { id:'wrate',   icon:'📈', title:'Best Win Rate',         note:'Share of games won (5+ games played)', list:bars(t=>stats[t].P>=5 ? Math.round(stats[t].W/stats[t].P*100) : 0), unit:'of games won', fmt:v=>v+'%',
          extra:t=>`${stats[t].W} wins from ${stats[t].P} games` },
        { id:'gd',      icon:'⚖️', title:'Best Goal Difference',  note:'Goals scored minus goals conceded, all-time', list:bars(t=>stats[t].GF-stats[t].GA), unit:'goal diff', fmt:v=>(v>0?'+':'')+v,
          extra:t=>`${stats[t].GF} for · ${stats[t].GA} against` },
        { id:'wstreak', icon:'🚀', title:'Longest Winning Streak', note:`Wins in a row, from the ${logs.length} games on record`, list:bars(t=>winRun[t].best), unit:'in a row' },
        { id:'unb',     icon:'🛡️', title:'Longest Unbeaten Run',  note:'Games without a defeat, from the games on record', list:bars(t=>unbRun[t].best), unit:'games' },
        { id:'bpts',    icon:'⭐', title:'Best Season — Points',  note:'Most league points in one season',  list:bars(t=>seasonBest.pts[t].v), unit:'points', extra:t=>seasonBest.pts[t].s },
        { id:'bgf',     icon:'💫', title:'Best Season — Goals',   note:'Most goals scored in one season',   list:bars(t=>seasonBest.gf[t].v), unit:'goals', extra:t=>seasonBest.gf[t].s },
        { id:'defeats', icon:'💔', title:'Most Defeats',          note:'All-time — the hard-luck record',   list:bars(t=>stats[t].L), unit:'defeats' },
        { id:'silver',  icon:'🥈', title:'Most Silver Medals',    note:'Always the bridesmaid (league + CUP)', list:bars(t=>trophies[t].silver||0), unit:'silvers' },
        { id:'played',  icon:'🏟️', title:'Most Games Played',     note:'The league’s veteran',              list:bars(t=>stats[t].P), unit:'games' },
        { id:'decor',   icon:'🏆', title:'Most Decorated',        note:'League + CUP + Super Cup titles',   list:bars(t=>(trophies[t].leagueGold||0)+(trophies[t].cup||0)+(trophies[t].superCup||0)), unit:'titles',
          extra:t=>{ const x=trophies[t]; return [x.leagueGold&&`${x.leagueGold} league`, x.cup&&`${x.cup} CUP`, x.superCup&&`${x.superCup} Super Cup`].filter(Boolean).join(' · '); } },
    ];
    return { cards, biggest, highest };
}
// ---- Latest season only: the live season while it has games, otherwise the most recent archived one ----
function recordsSeasonSource(){
    if((matchHistory||[]).length){
        const rows = {}; TEAM_NAMES.forEach(t=>rows[t] = (leagueData && leagueData[t]) || {});
        return { label:'This season', rows, logs:matchHistory };
    }
    const last = [...(archivedSeasons||[])].filter(x=>x && x.table && x.table.length).sort((a,b)=>(b.seasonId||0)-(a.seasonId||0))[0];
    if(!last) return null;
    const rows = {}; last.table.forEach(r=>{ rows[r.name] = r; });
    return { label:`Season ${last.seasonId}`, rows, logs:last.history || [] };
}
function recordsComputeSeason(){
    const src = recordsSeasonSource(); if(!src) return { cards:[], biggest:null, highest:null, label:'' };
    const g = (t,k)=>Number((src.rows[t] && src.rows[t][k]) || 0);
    const logs = src.logs.filter(m=>recordsParseScore(m) && TEAM_NAMES.includes(m.home) && TEAM_NAMES.includes(m.away));
    const clean = {}, winRun = {}, unbRun = {}; TEAM_NAMES.forEach(t=>{ clean[t]=0; winRun[t]={cur:0,best:0}; unbRun[t]={cur:0,best:0}; });
    let biggest = null, highest = null;
    [...logs].sort((x,y)=>String(x.timestamp||'').localeCompare(String(y.timestamp||''))).forEach(m=>{
        const sc = recordsParseScore(m);
        if(sc.b===0) clean[m.home]++;
        if(sc.a===0) clean[m.away]++;
        [[m.home,sc.a,sc.b],[m.away,sc.b,sc.a]].forEach(([t,gf,ga])=>{
            winRun[t].cur = gf>ga ? winRun[t].cur+1 : 0;  winRun[t].best = Math.max(winRun[t].best, winRun[t].cur);
            unbRun[t].cur = gf>=ga ? unbRun[t].cur+1 : 0; unbRun[t].best = Math.max(unbRun[t].best, unbRun[t].cur);
        });
        const margin = Math.abs(sc.a-sc.b), total = sc.a+sc.b;
        if(margin>0 && (!biggest || margin>biggest.margin || (margin===biggest.margin && total>biggest.total))) biggest = { m, sc, margin, total };
        if(!highest || total>highest.total) highest = { m, sc, margin, total };
    });
    // weeks spent in first place (needs round numbers: the live season has them)
    let top = null;
    if(typeof magComputeRankHistory==='function'){
        const h = magComputeRankHistory(logs);
        if(h){ top = {}; TEAM_NAMES.forEach(t=>{ top[t] = h.ranks[t].filter(r=>r===1).length; }); }
    }
    const bars = fn=>TEAM_NAMES.map(t=>({ team:t, value:fn(t) })).sort((x,y)=>y.value-x.value);
    const n = logs.length;
    const cards = [
        { id:'goals',   icon:'⚽', title:'Most Goals Scored',     note:src.label,                         list:bars(t=>g(t,'GF')), unit:'goals' },
        { id:'conc',    icon:'🧱', title:'Most Goals Conceded',   note:`${src.label} — the leakiest defence`, list:bars(t=>g(t,'GA')), unit:'goals' },
        { id:'clean',   icon:'🧤', title:'Most Clean Sheets',     note:`${src.label} · ${n} games on record`, list:bars(t=>clean[t]), unit:'clean sheets' },
        { id:'wins',    icon:'🔥', title:'Most Wins',             note:src.label,                         list:bars(t=>g(t,'W')), unit:'wins' },
        { id:'pts',     icon:'⭐', title:'Most Points',           note:src.label,                         list:bars(t=>g(t,'Pts')), unit:'points' },
        ...(top ? [{ id:'top', icon:'👑', title:'Most Weeks on Top', note:`${src.label} — matchweeks in first place`, list:bars(t=>top[t]), unit:'weeks' }] : []),
        { id:'wrate',   icon:'📈', title:'Best Win Rate',         note:`${src.label} (3+ games played)`,   list:bars(t=>g(t,'P')>=3 ? Math.round(g(t,'W')/g(t,'P')*100) : 0), unit:'of games won', fmt:v=>v+'%',
          extra:t=>`${g(t,'W')} wins from ${g(t,'P')} games` },
        { id:'gd',      icon:'⚖️', title:'Best Goal Difference',  note:`${src.label}`,                     list:bars(t=>g(t,'GF')-g(t,'GA')), unit:'goal diff', fmt:v=>(v>0?'+':'')+v,
          extra:t=>`${g(t,'GF')} for · ${g(t,'GA')} against` },
        { id:'wstreak', icon:'🚀', title:'Longest Winning Streak', note:`${src.label} — wins in a row`,   list:bars(t=>winRun[t].best), unit:'in a row' },
        { id:'unb',     icon:'🛡️', title:'Longest Unbeaten Run',  note:`${src.label} — games without a defeat`, list:bars(t=>unbRun[t].best), unit:'games' },
        { id:'defeats', icon:'💔', title:'Most Defeats',          note:`${src.label} — the hard-luck record`, list:bars(t=>g(t,'L')), unit:'defeats' },
        { id:'played',  icon:'🏟️', title:'Most Games Played',     note:src.label,                         list:bars(t=>g(t,'P')), unit:'games' },
    ];
    return { cards, biggest, highest, label:src.label };
}
let recordsScope = 'all';
function recordsCompute(){ return recordsScope==='season' ? recordsComputeSeason() : recordsComputeAll(); }
function setRecordsScope(sc){
    recordsScope = sc==='season' ? 'season' : 'all';
    haptic([6]);
    recordsSyncScopeUI();
    const box = document.getElementById('records-list');
    if(box && box.animate) box.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:260,easing:'ease-out'});
    recordsRender();
}
function recordsSyncScopeUI(){
    const wrap = document.getElementById('rec-scope'); if(!wrap) return;
    const btns = [...wrap.querySelectorAll('button')];
    btns.forEach(b=>b.classList.toggle('on', b.dataset.scope===recordsScope));
    const on = btns.find(b=>b.classList.contains('on')), pill = document.getElementById('rec-scope-pill');
    if(on && pill){ pill.style.width = on.offsetWidth+'px'; pill.style.transform = `translateX(${on.offsetLeft}px)`; }
    const sub = document.getElementById('records-sub');
    if(sub){ const lab = recordsScope==='season' ? (recordsSeasonSource()||{}).label : ''; sub.textContent = recordsScope==='season' ? (lab ? `${lab} — only this season's games` : 'No season data yet') : 'The best (and worst) of every team'; }
}
function recordsTeamLabel(t){ return (typeof TEAM_DISPLAY_NAMES!=='undefined' && TEAM_DISPLAY_NAMES[t]) || t; }
function recordsLogo(t, cls){ return `<img class="${cls||''}" src="${teamLogoUrl(t)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`; }

function recordsRender(){
    const box = document.getElementById('records-list'); if(!box) return;
    const { cards, biggest, highest } = recordsCompute();
    let i = 0;
    if(!cards.length){ box.innerHTML = '<div class="rec-empty" style="text-align:center;padding:24px 0;">No games on record for this season yet</div>'; return; }
    const rows = cards.map(c=>{
        const L = recordsLeaders(c.list);
        const max = Math.max(1, L.best);
        const logos = L.teams.map(t=>`<span class="rec-logo-wrap">${recordsLogo(t,'rec-logo')}</span>`).join('');
        const names = L.teams.map(t=>escapeHtml(recordsTeamLabel(t))).join(' & ');
        const extra = L.teams.length===1 && c.extra ? c.extra(L.teams[0]) : '';
        const bars = c.list.map(x=>`
            <div class="rec-bar-row${L.teams.includes(x.team)?' lead':''}">
                ${recordsLogo(x.team,'rec-mini')}
                <div class="rec-bar"><i style="--w:${Math.round(Math.max(0,x.value)/max*100)}%"></i></div>
                <b>${c.fmt ? c.fmt(x.value) : x.value}</b>
            </div>`).join('');
        return `
        <div class="rec-card" style="--d:${(i++)*90}ms">
            <div class="rec-head"><span class="rec-ico">${c.icon}</span><div><div class="rec-title">${c.title}</div><div class="rec-note">${escapeHtml(c.note)}</div></div></div>
            ${L.teams.length ? `
            <div class="rec-hero">
                <div class="rec-logos">${logos}</div>
                <div class="rec-hero-txt">
                    <div class="rec-team">${names}${L.teams.length>1?' <em>shared</em>':''}</div>
                    <div class="rec-val"><span class="rec-count" data-to="${L.best}" data-pre="${c.id==='gd'?'+':''}" data-suf="${c.id==='wrate'?'%':''}">0</span><small>${c.unit}</small></div>
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
        const to = +el.dataset.to, pre = el.dataset.pre||'', suf = el.dataset.suf||''; if(reduce || to<=0){ el.textContent = pre+to+suf; return; }
        const t0 = performance.now() + 220 + k*40, dur = 900;
        const tick = now=>{
            if(now<t0){ requestAnimationFrame(tick); return; }
            const p = Math.min(1,(now-t0)/dur), e = 1-Math.pow(1-p,3);
            el.textContent = pre+Math.round(to*e)+suf;
            if(p<1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    const sh = document.getElementById('records-sheet'), pn = sh && sh.querySelector('.records-modal'); if(pn) pn.scrollTop = 0;
}
function openRecordsSheet(){
    haptic([8]);
    const sh = document.getElementById('records-sheet'); if(!sh) return;
    document.body.classList.add('cards-open');          // same as Cards: the HARFS capsule fades away while the sheet is open and returns when it closes
    recordsRender();
    recordsBindScroll();
    sh.classList.remove('open'); void sh.offsetWidth; sh.classList.add('open');
    requestAnimationFrame(recordsSyncScopeUI);
}
function closeRecordsSheet(){ const sh = document.getElementById('records-sheet'); if(sh) sh.classList.remove('open'); document.body.classList.remove('cards-open'); }

// ---- One team's slice of the Records page (used by the team panel on Home): the same all-time numbers, plus where the team ranks ----
function recordsForTeam(team){
    const { cards } = recordsComputeAll();
    const rows = cards.map(c=>{
        const me = c.list.find(x=>x.team===team); if(!me) return null;
        const L = recordsLeaders(c.list);
        const rank = 1 + c.list.filter(x=>x.value>me.value).length;
        return { id:c.id, icon:c.icon, title:c.title, unit:c.unit, value:me.value, shown:c.fmt ? c.fmt(me.value) : String(me.value),
                 rank, of:c.list.length, best:L.best, holds: L.best>0 && L.teams.includes(team), shared: L.teams.length>1,
                 extra: c.extra ? c.extra(team) : '' };
    }).filter(Boolean);
    // this team's own best / highest-scoring games from every game on record
    const logs = [];
    (archivedSeasons||[]).forEach(se=>(se.history||[]).forEach(m=>logs.push({ m, label:`Season ${se.seasonId}` })));
    (matchHistory||[]).forEach(m=>logs.push({ m, label:'This season' }));
    let bigWin = null, topGame = null;
    logs.forEach(({m,label})=>{
        const sc = recordsParseScore(m); if(!sc || (m.home!==team && m.away!==team)) return;
        const mine = m.home===team ? sc.a : sc.b, theirs = m.home===team ? sc.b : sc.a, total = mine+theirs;
        if(mine>theirs && (!bigWin || (mine-theirs)>bigWin.margin || ((mine-theirs)===bigWin.margin && total>bigWin.total))) bigWin = { m, sc, label, margin:mine-theirs, total };
        if(!topGame || total>topGame.total) topGame = { m, sc, label, total };
    });
    return { rows, bigWin, topGame };
}
function recordsTeamPanelHtml(team){
    const { rows, bigWin, topGame } = recordsForTeam(team);
    if(!rows.length) return '<div class="team-panel-empty">No records yet</div>';
    const held = rows.filter(r=>r.holds);
    const heldHtml = held.length
        ? `<div class="tp-held">${held.map(r=>`<span class="tp-held-chip"><span>${r.icon}</span><b>${escapeHtml(r.title)}</b><em>${r.shown}${r.shared?' · shared':''}</em></span>`).join('')}</div>`
        : '<div class="tp-held-none">No league record held right now</div>';
    const list = rows.map((r,k)=>{
        const pct = r.best>0 ? Math.round(Math.max(0,r.value)/r.best*100) : 0;
        return `<div class="tp-rec-row${r.holds?' lead':''}" style="--d:${k*35}ms">
            <span class="tp-rec-ico">${r.icon}</span>
            <div class="tp-rec-main">
                <div class="tp-rec-top"><span class="tp-rec-title">${escapeHtml(r.title)}</span><span class="tp-rec-val">${r.shown}<small>${escapeHtml(r.unit)}</small></span></div>
                <div class="tp-rec-bar"><i style="--w:${pct}%"></i></div>
                ${r.extra ? `<div class="tp-rec-extra">${escapeHtml(r.extra)}</div>` : ''}
            </div>
            <span class="tp-rec-rank">${r.holds ? '👑' : '#'+r.rank}</span>
        </div>`;
    }).join('');
    const game = (icon,title,g)=> g ? `<div class="tp-game"><div class="tp-game-h"><span>${icon}</span>${title}<em>${escapeHtml(g.label)}</em></div>
        <div class="tp-game-s"><span>${escapeHtml(recordsTeamLabel(g.m.home))}</span><b>${g.sc.a} – ${g.sc.b}</b><span>${escapeHtml(recordsTeamLabel(g.m.away))}</span></div></div>` : '';
    return heldHtml + `<div class="tp-rec-list">${list}</div>` + game('💥','Biggest win',bigWin) + game('🎯','Highest-scoring game',topGame);
}

// ---- the whole sheet scrolls (banner and title slide away, more room for the cards); an arrow appears once you scroll down ----
let recordsScrollBound = false;
function recordsBindScroll(){
    const pn = document.querySelector('#records-sheet .records-modal'), fab = document.getElementById('rec-top-fab');
    if(!pn || !fab) return;
    fab.classList.remove('show');
    if(recordsScrollBound) return;
    recordsScrollBound = true;
    pn.addEventListener('scroll', ()=>fab.classList.toggle('show', pn.scrollTop > 160), { passive:true });
}
function recordsScrollTop(){
    haptic([6]);
    const pn = document.querySelector('#records-sheet .records-modal');
    if(pn) pn.scrollTo({ top:0, behavior:'smooth' });
}
