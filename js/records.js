// ============================================================
// records.js  —  RECORDS sheet (Home → Records) — Fully Localized (FA / EN / ES)
// ============================================================
const RECORDS_TREBLE_BADGE = '<svg class="rec-treble-badge" viewBox="0 0 48 52" aria-hidden="true"><path d="M24 2l19 7v15c0 12-8 21-19 26C13 45 5 36 5 24V9z" fill="#fbbf24" stroke="#b45309" stroke-width="2" stroke-linejoin="round"/><path d="M24 6l15 5.5V24c0 9.6-6 17-15 21.4C15 41 9 33.6 9 24V11.5z" fill="#fde68a"/><path d="M24 6l15 5.5V24c0 9.6-6 17-15 21.4z" fill="#f59e0b" opacity=".55"/><g fill="#92400e"><path d="M24 12l2.2 4.6 5 .6-3.7 3.4 1 5L24 23.2l-4.5 2.4 1-5-3.7-3.4 5-.6z"/><path d="M15.5 27l1.5 3.1 3.4.4-2.5 2.3.7 3.3-3.1-1.7-3.1 1.7.7-3.3-2.5-2.3 3.4-.4z"/><path d="M32.5 27l1.5 3.1 3.4.4-2.5 2.3.7 3.3-3.1-1.7-3.1 1.7.7-3.3-2.5-2.3 3.4-.4z"/></g></svg>';

const REC_I18N = {
    en: {
        header:'League Records',
        sub_all:'The best (and worst) of every team',
        sub_season:s=>s ? `${s} — only this season's games` : 'No season data yet',
        tab_all:'All-time',
        tab_season:'Latest season',
        this_season:'This season',
        season_n:n=>`Season ${n}`,
        seasons_range:(a,b)=>`Seasons ${a}–${b}`,
        seasons_list:arr=>`Season ${arr.join(', ')}`,
        from_n_games:n=>`From the ${n} games on record`,
        wins_from_games:(w,p)=>`${w} wins from ${p} games`,
        for_against:(gf,ga)=>`${gf} for · ${ga} against`,
        decor_parts:(lg,cup,sc)=>[lg&&`${lg} league`, cup&&`${cup} CUP`, sc&&`${sc} Super Cup`].filter(Boolean).join(' · '),
        shared:'shared',
        no_record_yet:'No one has set this record yet',
        no_season_games:'No games on record for this season yet',
        no_team_records:'No records yet',
        no_held_now:'No league record held right now',
        big_win:'Biggest Win',
        high_match:'Highest-Scoring Match',
        u_trebles:'trebles', u_goals:'goals', u_clean:'clean sheets', u_row:'in a row', u_wins:'wins',
        u_wrate:'of games won', u_gd:'goal diff', u_games:'games', u_points:'points', u_defeats:'defeats',
        u_silvers:'silvers', u_titles:'titles', u_weeks:'weeks',
        t_treble:'The Treble', n_treble:'League + CUP + Super Cup in the same season',
        t_goals:'Most Goals Scored', n_goals:'All-time, every season',
        t_conc:'Most Goals Conceded', n_conc:'All-time — the leakiest defence', n_conc_s:s=>`${s} — the leakiest defence`,
        t_clean:'Most Clean Sheets', n_clean_s:(s,n)=>`${s} · ${n} games on record`,
        t_reign:'Longest Reign at the Top', n_reign:'League titles won in a row',
        t_wins:'Most Wins', n_wins:'All-time, every season',
        t_pts:'Most Points',
        t_top:'Most Weeks on Top', n_top_s:s=>`${s} — matchweeks in first place`,
        t_wrate:'Best Win Rate', n_wrate:'Share of games won (5+ games played)', n_wrate_s:s=>`${s} (3+ games played)`,
        t_gd:'Best Goal Difference', n_gd:'Goals scored minus goals conceded, all-time',
        t_wstreak:'Longest Winning Streak', n_wstreak:n=>`Wins in a row, from the ${n} games on record`, n_wstreak_s:s=>`${s} — wins in a row`,
        t_unb:'Longest Unbeaten Run', n_unb:'Games without a defeat, from the games on record', n_unb_s:s=>`${s} — games without a defeat`,
        t_bpts:'Best Season — Points', n_bpts:'Most league points in one season',
        t_bgf:'Best Season — Goals', n_bgf:'Most goals scored in one season',
        t_defeats:'Most Defeats', n_defeats:'All-time — the hard-luck record', n_defeats_s:s=>`${s} — the hard-luck record`,
        t_silver:'Most Silver Medals', n_silver:'Always the bridesmaid (league + CUP)',
        t_played:'Most Games Played', n_played:'The league’s veteran',
        t_decor:'Most Decorated', n_decor:'League + CUP + Super Cup titles'
    },
    fa: {
        header:'رکوردهای لیگ',
        sub_all:'بهترین (و بدترین) آمار تاریخ هر تیم',
        sub_season:s=>s ? `${s} — فقط بازی‌های این فصل` : 'هنوز داده‌ای برای این فصل ثبت نشده',
        tab_all:'کل تاریخ',
        tab_season:'فصل اخیر',
        this_season:'فصل جاری',
        season_n:n=>`فصل ${n}`,
        seasons_range:(a,b)=>`فصل‌های ${a} تا ${b}`,
        seasons_list:arr=>`فصل ${arr.join('، ')}`,
        from_n_games:n=>`از مجموع ${n} بازی ثبت‌شده`,
        wins_from_games:(w,p)=>`${w} برد از ${p} بازی`,
        for_against:(gf,ga)=>`${gf} گل زده · ${ga} گل خورده`,
        decor_parts:(lg,cup,sc)=>[lg&&`${lg} لیگ`, cup&&`${cup} جام حذفی`, sc&&`${sc} سوپرجام`].filter(Boolean).join(' · '),
        shared:'مشترک',
        no_record_yet:'هنوز هیچ تیمی این رکورد را ثبت نکرده است',
        no_season_games:'هنوز مسابقه‌ای در این فصل ثبت نشده است',
        no_team_records:'هنوز رکوردی ثبت نشده است',
        no_held_now:'در حال حاضر رکورددار انفرادی لیگ نیست',
        big_win:'بهترین برد (بیشترین اختلاف گل)',
        high_match:'پرگل‌ترین مسابقه',
        u_trebles:'سه‌گانه', u_goals:'گل', u_clean:'کلین‌شیت', u_row:'پیاپی', u_wins:'برد',
        u_wrate:'درصد برد', u_gd:'تفاضل گل', u_games:'بازی', u_points:'امتیاز', u_defeats:'شکست',
        u_silvers:'نقره', u_titles:'قهرمانی', u_weeks:'هفته',
        t_treble:'سه‌گانه قهرمانی (Treble)', n_treble:'قهرمانی هم‌زمان لیگ + جام حذفی + سوپرجام در یک فصل',
        t_goals:'بیشترین گل زده', n_goals:'در کل تاریخ تمام فصول',
        t_conc:'بیشترین گل خورده', n_conc:'در کل تاریخ — آسیب‌پذیرترین خط دفاع', n_conc_s:s=>`${s} — بیشترین گل دریافتی`,
        t_clean:'بیشترین کلین‌شیت (دروازه بسته)', n_clean_s:(s,n)=>`${s} · از ${n} بازی ثبت‌شده`,
        t_reign:'طولانی‌ترین دوران صدرنشینی', n_reign:'قهرمانی‌های متوالی در لیگ',
        t_wins:'بیشترین برد', n_wins:'در کل تاریخ تمام فصول',
        t_pts:'بیشترین امتیاز',
        t_top:'بیشترین هفته صدرنشینی', n_top_s:s=>`${s} — هفته‌های حضور در رتبه اول`,
        t_wrate:'بهترین درصد برد', n_wrate:'نسبت بردها (حداقل ۵ بازی)', n_wrate_s:s=>`${s} (حداقل ۳ بازی)`,
        t_gd:'بهترین تفاضل گل', n_gd:'گل زده منهای گل خورده در کل تاریخ',
        t_wstreak:'طولانی‌ترین نوار برد متوالی', n_wstreak:n=>`بردهای پیاپی از ${n} بازی ثبت‌شده`, n_wstreak_s:s=>`${s} — بردهای پیاپی`,
        t_unb:'طولانی‌ترین نوار شکست‌ناپذیری', n_unb:'بازی‌های متوالی بدون باخت', n_unb_s:s=>`${s} — بازی‌های پیاپی بدون شکست`,
        t_bpts:'بهترین فصل — امتیاز', n_bpts:'بیشترین امتیاز کسب‌شده در یک فصل',
        t_bgf:'بهترین فصل — گل زده', n_bgf:'بیشترین گل زده در یک فصل',
        t_defeats:'بیشترین شکست', n_defeats:'در کل تاریخ — بدشانس‌ترین رکورد', n_defeats_s:s=>`${s} — بیشترین باخت`,
        t_silver:'بیشترین مدال نقره (نایب‌قهرمانی)', n_silver:'مجموع نایب‌قهرمانی‌های لیگ و جام حذفی',
        t_played:'بیشترین بازی انجام‌شده', n_played:'باتجربه‌ترین تیم لیگ',
        t_decor:'پرافتخارترین تیم', n_decor:'مجموع قهرمانی‌های لیگ + جام حذفی + سوپرجام'
    },
    es: {
        header:'Récords de la Liga',
        sub_all:'Lo mejor (y peor) de cada equipo',
        sub_season:s=>s ? `${s} — solo partidos de esta temporada` : 'Aún no hay datos de la temporada',
        tab_all:'Histórico',
        tab_season:'Última temporada',
        this_season:'Esta temporada',
        season_n:n=>`Temporada ${n}`,
        seasons_range:(a,b)=>`Temporadas ${a}–${b}`,
        seasons_list:arr=>`Temporada ${arr.join(', ')}`,
        from_n_games:n=>`De los ${n} partidos registrados`,
        wins_from_games:(w,p)=>`${w} victorias en ${p} partidos`,
        for_against:(gf,ga)=>`${gf} a favor · ${ga} en contra`,
        decor_parts:(lg,cup,sc)=>[lg&&`${lg} Liga`, cup&&`${cup} Copa`, sc&&`${sc} Supercopa`].filter(Boolean).join(' · '),
        shared:'compartido',
        no_record_yet:'Nadie ha establecido este récord aún',
        no_season_games:'Aún no hay partidos registrados en esta temporada',
        no_team_records:'Sin récords aún',
        no_held_now:'Actualmente no posee ningún récord de liga',
        big_win:'Mayor Goleada',
        high_match:'Partido con Más Goles',
        u_trebles:'tripletes', u_goals:'goles', u_clean:'porterías imbatidas', u_row:'seguidos', u_wins:'victorias',
        u_wrate:'de victorias', u_gd:'dif. goles', u_games:'partidos', u_points:'puntos', u_defeats:'derrotas',
        u_silvers:'platas', u_titles:'títulos', u_weeks:'semanas',
        t_treble:'El Triplete', n_treble:'Liga + Copa + Supercopa en la misma temporada',
        t_goals:'Más Goles Anotados', n_goals:'Histórico, todas las temporadas',
        t_conc:'Más Goles Recibidos', n_conc:'Histórico — la defensa más goleada', n_conc_s:s=>`${s} — la defensa más goleada`,
        t_clean:'Más Porterías a Cero', n_clean_s:(s,n)=>`${s} · de ${n} partidos`,
        t_reign:'Reinado Más Largo en la Cima', n_reign:'Títulos de liga ganados consecutivamente',
        t_wins:'Más Victorias', n_wins:'Histórico, todas las temporadas',
        t_pts:'Más Puntos',
        t_top:'Más Semanas como Líder', n_top_s:s=>`${s} — jornadas en primer lugar`,
        t_wrate:'Mejor % de Victorias', n_wrate:'Porcentaje de victorias (mín. 5 partidos)', n_wrate_s:s=>`${s} (mín. 3 partidos)`,
        t_gd:'Mejor Diferencia de Goles', n_gd:'Goles a favor menos goles en contra',
        t_wstreak:'Mayor Racha de Victorias', n_wstreak:n=>`Victorias seguidas en ${n} partidos`, n_wstreak_s:s=>`${s} — victorias seguidas`,
        t_unb:'Mayor Racha Invicto', n_unb:'Partidos seguidos sin perder', n_unb_s:s=>`${s} — partidos sin perder`,
        t_bpts:'Mejor Temporada — Puntos', n_bpts:'Más puntos de liga en una temporada',
        t_bgf:'Mejor Temporada — Goles', n_bgf:'Más goles anotados en una temporada',
        t_defeats:'Más Derrotas', n_defeats:'Histórico — récord de mala fortuna', n_defeats_s:s=>`${s} — más derrotas`,
        t_silver:'Más Medallas de Plata', n_silver:'Subcampeonatos (Liga + Copa)',
        t_played:'Más Partidos Jugados', n_played:'El veterano de la liga',
        t_decor:'Más Laureado', n_decor:'Títulos de Liga + Copa + Supercopa'
    }
};
function recL(){
    const code = (typeof getAppLanguage==='function') ? getAppLanguage() : (localStorage.getItem('harfs_lang')||'en');
    return REC_I18N[code] || REC_I18N.en;
}

function recordsParseScore(m){
    const p = String(m && m.score || '').split('-').map(x=>parseInt(x,10));
    return (p.length===2 && p.every(n=>Number.isFinite(n))) ? { a:p[0], b:p[1] } : null;
}
function recordsLeaders(list){
    const best = Math.max(0, ...list.map(x=>x.value));
    return { best, teams: best>0 ? list.filter(x=>x.value===best).map(x=>x.team) : [] };
}
function recordsComputeAll(){
    const L = recL();
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
    const champs = [...(archivedSeasons||[])].filter(s=>s&&s.table&&s.table[0]).sort((a,b)=>(a.seasonId||0)-(b.seasonId||0));
    const reign = {}; TEAM_NAMES.forEach(t=>reign[t]={ len:0, from:null, to:null });
    let run = null;
    champs.forEach(s=>{
        const t = s.table[0].name;
        if(run && run.team===t){ run.len++; run.to=s.seasonId; } else run = { team:t, len:1, from:s.seasonId, to:s.seasonId };
        if(reign[t] && run.len>reign[t].len) reign[t] = { len:run.len, from:run.from, to:run.to };
    });
    const winRun = {}, unbRun = {}; TEAM_NAMES.forEach(t=>{ winRun[t]={cur:0,best:0}; unbRun[t]={cur:0,best:0}; });
    [...logs].filter(m=>recordsParseScore(m)).sort((x,y)=>String(x.timestamp||'').localeCompare(String(y.timestamp||''))).forEach(m=>{
        const sc = recordsParseScore(m);
        [[m.home,sc.a,sc.b],[m.away,sc.b,sc.a]].forEach(([t,gf,ga])=>{
            if(!winRun[t]) return;
            winRun[t].cur = gf>ga ? winRun[t].cur+1 : 0;  winRun[t].best = Math.max(winRun[t].best, winRun[t].cur);
            unbRun[t].cur = gf>=ga ? unbRun[t].cur+1 : 0; unbRun[t].best = Math.max(unbRun[t].best, unbRun[t].cur);
        });
    });
    const seasonBest = { pts:{}, gf:{} }; TEAM_NAMES.forEach(t=>{ seasonBest.pts[t]={v:0,s:''}; seasonBest.gf[t]={v:0,s:''}; });
    const seasonRow = (t,row,label)=>{
        if(!row) return;
        if((row.Pts||0)>seasonBest.pts[t].v) seasonBest.pts[t]={ v:row.Pts, s:label };
        if((row.GF||0)>seasonBest.gf[t].v)   seasonBest.gf[t]={ v:row.GF, s:label };
    };
    (archivedSeasons||[]).forEach(s=>(s.table||[]).forEach(r=>{ if(r && seasonBest.pts[r.name]) seasonRow(r.name,r,L.season_n(s.seasonId)); }));
    TEAM_NAMES.forEach(t=>{ const r = leagueData && leagueData[t]; if(r) seasonRow(t,r,L.this_season); });
    const treble = {}; TEAM_NAMES.forEach(t=>treble[t]={ n:0, seasons:[] });
    (archivedSeasons||[]).forEach(se=>{
        const lg = se && se.table && se.table[0] && se.table[0].name;
        if(!lg || !treble[lg] || !(se.superCup && se.superCup.winner===lg)) return;
        const ed = (typeof mbaEditionForSeason==='function') ? mbaEditionForSeason(se) : null;
        const rec = ed!=null ? ((mbaData && mbaData.completed) || []).find(r=>r.edition===ed) : null;
        if(rec && rec.gold===lg){ treble[lg].n++; treble[lg].seasons.push(se.seasonId); }
    });
    const bars = (fn)=>TEAM_NAMES.map(t=>({ team:t, value:fn(t) })).sort((x,y)=>y.value-x.value);
    const cards = [
        { id:'treble', special:true, icon:'\ud83c\udfc6', badge:RECORDS_TREBLE_BADGE, title:L.t_treble, note:L.n_treble, list:bars(t=>treble[t].n), unit:L.u_trebles,
          extra:t=> treble[t].seasons.length ? L.seasons_list(treble[t].seasons) : '' },
        { id:'goals',   icon:'⚽', title:L.t_goals,   note:L.n_goals,                     list:bars(t=>stats[t].GF), unit:L.u_goals },
        { id:'conc',    icon:'🧱', title:L.t_conc,    note:L.n_conc,                      list:bars(t=>stats[t].GA), unit:L.u_goals },
        { id:'clean',   icon:'🧤', title:L.t_clean,   note:L.from_n_games(logs.length),   list:bars(t=>clean[t]), unit:L.u_clean },
        { id:'reign',   icon:'👑', title:L.t_reign,   note:L.n_reign,                     list:bars(t=>reign[t].len), unit:L.u_row,
          extra:t=> reign[t].len>1 ? L.seasons_range(reign[t].from, reign[t].to) : '' },
        { id:'wins',    icon:'🔥', title:L.t_wins,    note:L.n_wins,                      list:bars(t=>stats[t].W), unit:L.u_wins },
        { id:'wrate',   icon:'📈', title:L.t_wrate,   note:L.n_wrate,                     list:bars(t=>stats[t].P>=5 ? Math.round(stats[t].W/stats[t].P*100) : 0), unit:L.u_wrate, fmt:v=>v+'%',
          extra:t=>L.wins_from_games(stats[t].W, stats[t].P) },
        { id:'gd',      icon:'⚖️', title:L.t_gd,      note:L.n_gd,                        list:bars(t=>stats[t].GF-stats[t].GA), unit:L.u_gd, fmt:v=>(v>0?'+':'')+v,
          extra:t=>L.for_against(stats[t].GF, stats[t].GA) },
        { id:'wstreak', icon:'🚀', title:L.t_wstreak, note:L.n_wstreak(logs.length),      list:bars(t=>winRun[t].best), unit:L.u_row },
        { id:'unb',     icon:'🛡️', title:L.t_unb,     note:L.n_unb,                       list:bars(t=>unbRun[t].best), unit:L.u_games },
        { id:'bpts',    icon:'⭐', title:L.t_bpts,    note:L.n_bpts,                      list:bars(t=>seasonBest.pts[t].v), unit:L.u_points, extra:t=>seasonBest.pts[t].s },
        { id:'bgf',     icon:'💫', title:L.t_bgf,     note:L.n_bgf,                       list:bars(t=>seasonBest.gf[t].v), unit:L.u_goals, extra:t=>seasonBest.gf[t].s },
        { id:'defeats', icon:'💔', title:L.t_defeats, note:L.n_defeats,                   list:bars(t=>stats[t].L), unit:L.u_defeats },
        { id:'silver',  icon:'🥈', title:L.t_silver,  note:L.n_silver,                    list:bars(t=>trophies[t].silver||0), unit:L.u_silvers },
        { id:'played',  icon:'🏟️', title:L.t_played,  note:L.n_played,                    list:bars(t=>stats[t].P), unit:L.u_games },
        { id:'decor',   icon:'🏆', title:L.t_decor,   note:L.n_decor,                     list:bars(t=>(trophies[t].leagueGold||0)+(trophies[t].cup||0)+(trophies[t].superCup||0)), unit:L.u_titles,
          extra:t=>{ const x=trophies[t]; return L.decor_parts(x.leagueGold, x.cup, x.superCup); } },
    ];
    return { cards, biggest, highest };
}
function recordsSeasonSource(){
    const L = recL();
    if((matchHistory||[]).length){
        const rows = {}; TEAM_NAMES.forEach(t=>rows[t] = (leagueData && leagueData[t]) || {});
        return { label:L.this_season, rows, logs:matchHistory };
    }
    const last = [...(archivedSeasons||[])].filter(x=>x && x.table && x.table.length).sort((a,b)=>(b.seasonId||0)-(a.seasonId||0))[0];
    if(!last) return null;
    const rows = {}; last.table.forEach(r=>{ rows[r.name] = r; });
    return { label:L.season_n(last.seasonId), rows, logs:last.history || [] };
}
function recordsComputeSeason(){
    const L = recL();
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
    let top = null;
    if(typeof magComputeRankHistory==='function'){
        const h = magComputeRankHistory(logs);
        if(h){ top = {}; TEAM_NAMES.forEach(t=>{ top[t] = h.ranks[t].filter(r=>r===1).length; }); }
    }
    const bars = fn=>TEAM_NAMES.map(t=>({ team:t, value:fn(t) })).sort((x,y)=>y.value-x.value);
    const n = logs.length;
    const cards = [
        { id:'goals',   icon:'⚽', title:L.t_goals,   note:src.label,                        list:bars(t=>g(t,'GF')), unit:L.u_goals },
        { id:'conc',    icon:'🧱', title:L.t_conc,    note:L.n_conc_s(src.label),            list:bars(t=>g(t,'GA')), unit:L.u_goals },
        { id:'clean',   icon:'🧤', title:L.t_clean,   note:L.n_clean_s(src.label, n),        list:bars(t=>clean[t]), unit:L.u_clean },
        { id:'wins',    icon:'🔥', title:L.t_wins,    note:src.label,                        list:bars(t=>g(t,'W')), unit:L.u_wins },
        { id:'pts',     icon:'⭐', title:L.t_pts,     note:src.label,                        list:bars(t=>g(t,'Pts')), unit:L.u_points },
        ...(top ? [{ id:'top', icon:'👑', title:L.t_top, note:L.n_top_s(src.label),          list:bars(t=>top[t]), unit:L.u_weeks }] : []),
        { id:'wrate',   icon:'📈', title:L.t_wrate,   note:L.n_wrate_s(src.label),           list:bars(t=>g(t,'P')>=3 ? Math.round(g(t,'W')/g(t,'P')*100) : 0), unit:L.u_wrate, fmt:v=>v+'%',
          extra:t=>L.wins_from_games(g(t,'W'), g(t,'P')) },
        { id:'gd',      icon:'⚖️', title:L.t_gd,      note:src.label,                        list:bars(t=>g(t,'GF')-g(t,'GA')), unit:L.u_gd, fmt:v=>(v>0?'+':'')+v,
          extra:t=>L.for_against(g(t,'GF'), g(t,'GA')) },
        { id:'wstreak', icon:'🚀', title:L.t_wstreak, note:L.n_wstreak_s(src.label),         list:bars(t=>winRun[t].best), unit:L.u_row },
        { id:'unb',     icon:'🛡️', title:L.t_unb,     note:L.n_unb_s(src.label),             list:bars(t=>unbRun[t].best), unit:L.u_games },
        { id:'defeats', icon:'💔', title:L.t_defeats, note:L.n_defeats_s(src.label),         list:bars(t=>g(t,'L')), unit:L.u_defeats },
        { id:'played',  icon:'🏟️', title:L.t_played,  note:src.label,                        list:bars(t=>g(t,'P')), unit:L.u_games },
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
    const L = recL();
    const h4 = document.querySelector('#records-sheet h4');
    if(h4) h4.textContent = L.header;
    const wrap = document.getElementById('rec-scope'); if(!wrap) return;
    const btns = [...wrap.querySelectorAll('button')];
    btns.forEach(b=>{
        if(b.dataset.scope==='all') b.textContent = L.tab_all;
        else if(b.dataset.scope==='season') b.textContent = L.tab_season;
        b.classList.toggle('on', b.dataset.scope===recordsScope);
    });
    const on = btns.find(b=>b.classList.contains('on')), pill = document.getElementById('rec-scope-pill');
    if(on && pill){ pill.style.width = on.offsetWidth+'px'; pill.style.transform = `translateX(${on.offsetLeft}px)`; }
    const sub = document.getElementById('records-sub');
    if(sub){
        const lab = recordsScope==='season' ? (recordsSeasonSource()||{}).label : '';
        sub.textContent = recordsScope==='season' ? L.sub_season(lab) : L.sub_all;
    }
}
function recordsTeamLabel(t){ return (typeof TEAM_DISPLAY_NAMES!=='undefined' && TEAM_DISPLAY_NAMES[t]) || t; }
function recordsLogo(t, cls){ return `<img class="${cls||''}" src="${teamLogoUrl(t)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`; }

function recordsRender(){
    const L = recL();
    const box = document.getElementById('records-list'); if(!box) return;
    const { cards, biggest, highest } = recordsCompute();
    let i = 0;
    if(!cards.length){ box.innerHTML = `<div class="rec-empty" style="text-align:center;padding:24px 0;">${L.no_season_games}</div>`; return; }
    const rows = cards.map(c=>{
        const ldr = recordsLeaders(c.list);
        const max = Math.max(1, ldr.best);
        const logos = ldr.teams.map(t=>`<span class="rec-logo-wrap">${recordsLogo(t,'rec-logo')}</span>`).join('');
        const names = ldr.teams.map(t=>escapeHtml(recordsTeamLabel(t))).join(' & ');
        const extra = ldr.teams.length===1 && c.extra ? c.extra(ldr.teams[0]) : '';
        const bars = c.list.map(x=>`
            <div class="rec-bar-row${ldr.teams.includes(x.team)?' lead':''}">
                ${recordsLogo(x.team,'rec-mini')}
                <div class="rec-bar"><i style="--w:${Math.round(Math.max(0,x.value)/max*100)}%"></i></div>
                <b>${c.fmt ? c.fmt(x.value) : x.value}</b>
            </div>`).join('');
        return `
        <div class="rec-card${c.special?' rec-special':''}" style="--d:${(i++)*90}ms">
            <div class="rec-head"><span class="rec-ico">${c.badge || c.icon}</span><div><div class="rec-title">${c.title}</div><div class="rec-note">${escapeHtml(c.note)}</div></div></div>
            ${ldr.teams.length ? `
            <div class="rec-hero">
                <div class="rec-logos">${logos}</div>
                <div class="rec-hero-txt">
                    <div class="rec-team">${names}${ldr.teams.length>1?` <em>${L.shared}</em>`:''}</div>
                    <div class="rec-val"><span class="rec-count" data-to="${ldr.best}" data-pre="${c.id==='gd'?'+':''}" data-suf="${c.id==='wrate'?'%':''}">0</span><small>${c.unit}</small></div>
                    ${extra ? `<div class="rec-extra">${escapeHtml(extra)}</div>` : ''}
                </div>
            </div>` : `<div class="rec-empty">${L.no_record_yet}</div>`}
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
    box.innerHTML = rows.join('') + match('big','💥',L.big_win,biggest) + match('high','🎯',L.high_match,highest);
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
    document.body.classList.add('cards-open');
    recordsSyncScopeUI();
    recordsRender();
    recordsBindScroll();
    sh.classList.remove('open'); void sh.offsetWidth; sh.classList.add('open');
    requestAnimationFrame(recordsSyncScopeUI);
}
function closeRecordsSheet(){ const sh = document.getElementById('records-sheet'); if(sh) sh.classList.remove('open'); document.body.classList.remove('cards-open'); }

function recordsForTeam(team){
    const L = recL();
    const { cards } = recordsComputeAll();
    const rows = cards.map(c=>{
        const me = c.list.find(x=>x.team===team); if(!me) return null;
        const ldr = recordsLeaders(c.list);
        const rank = 1 + c.list.filter(x=>x.value>me.value).length;
        return { id:c.id, icon:c.badge || c.icon, special:!!c.special, title:c.title, unit:c.unit, value:me.value, shown:c.fmt ? c.fmt(me.value) : String(me.value),
                 rank, of:c.list.length, best:ldr.best, holds: ldr.best>0 && ldr.teams.includes(team), shared: ldr.teams.length>1,
                 extra: c.extra ? c.extra(team) : '' };
    }).filter(Boolean);
    const logs = [];
    (archivedSeasons||[]).forEach(se=>(se.history||[]).forEach(m=>logs.push({ m, label:L.season_n(se.seasonId) })));
    (matchHistory||[]).forEach(m=>logs.push({ m, label:L.this_season }));
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
    const L = recL();
    const { rows, bigWin, topGame } = recordsForTeam(team);
    if(!rows.length) return `<div class="team-panel-empty">${L.no_team_records}</div>`;
    const held = rows.filter(r=>r.holds);
    const heldHtml = held.length
        ? `<div class="tp-held">${held.map(r=>`<span class="tp-held-chip"><span>${r.icon}</span><b>${escapeHtml(r.title)}</b><em>${r.shown}${r.shared?` · ${L.shared}`:''}</em></span>`).join('')}</div>`
        : `<div class="tp-held-none">${L.no_held_now}</div>`;
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
    return heldHtml + `<div class="tp-rec-list">${list}</div>` + game('💥',L.big_win,bigWin) + game('🎯',L.high_match,topGame);
}

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
