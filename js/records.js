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
        high_match:'Highest-Scoring Match', worst_defeat:'Worst Defeat', no_games:'No results yet',
        u_trebles:'trebles', u_goals:'goals', u_clean:'clean sheets', u_row:'in a row', u_wins:'wins',
        u_wrate:'of games won', u_gd:'goal diff', u_games:'games', u_points:'points', u_defeats:'defeats',
        u_silvers:'silvers', u_titles:'titles', u_weeks:'weeks', u_draws:'draws',
        t_draws:'Most Draws', n_draws:'All-time, every season',
        t_fewest:'Fewest Goals Conceded', n_fewest:'The tightest defence of all time', n_fewest_s:l=>`${l} — the tightest defence`, games_n:n=>`${n} games`,
        t_achv:'Most Achievements', n_achv:'The team holding the most league records', u_records:'records', of_records:n=>`of ${n} records`,
        t_treble:'The Treble', n_treble:'League + CUP + Super Cup in the same season',
        t_goals:'Most Goals Scored', n_goals:'All-time, every season',
        t_conc:'Most Goals Conceded', n_conc:'All-time — the leakiest defence', n_conc_s:s=>`${s} — the leakiest defence`,
        t_clean:'Most Clean Sheets', n_clean_s:(s,n)=>`${s} · ${n} games on record`,
        t_reign:'Longest Reign at the Top', n_reign:'League titles won in a row',
        t_wins:'Most Wins', n_wins:'All-time, every season',
        t_pts:'Most Points',
        t_reign_s:'Longest Stay on Top', n_reign_s:s=>`${s} — most matchweeks in a row in first place`, n_treble_s:s=>`${s} — League + CUP + Super Cup`, n_medals_s:s=>`${s} — league + CUP`,
        champ_title:'Champion Seasons', champ_sub:'Team honours history', champ_silver:'Silver', champ_bronze:'Bronze', champ_none_all:'No honours yet', champ_league:'League', champ_cup:'CUP', champ_super:'Super Cup', champ_none:'No title yet', cup_n:n=>`CUP ${n}`,
        show_all_recs:'Show all records', hide_all_recs:'Hide records',
        t_top:'Most Weeks on Top', n_top:'Matchweeks spent in first place, all seasons', n_top_s:s=>`${s} — matchweeks in first place`,
        t_wrate:'Best Win Rate', n_wrate:'Share of games won (5+ games played)', n_wrate_s:s=>`${s} (3+ games played)`,
        t_gd:'Best Goal Difference', n_gd:'Goals scored minus goals conceded, all-time',
        t_wstreak:'Longest Winning Streak', n_wstreak:n=>`Wins in a row, from the ${n} games on record`, n_wstreak_s:s=>`${s} — wins in a row`,
        t_unb:'Longest Unbeaten Run', n_unb:'Games without a defeat, from the games on record', n_unb_s:s=>`${s} — games without a defeat`,
        t_bpts:'Best Season — Points', n_bpts:'Most league points in one season',
        t_bgf:'Best Season — Goals', n_bgf:'Most goals scored in one season',
        t_defeats:'Most Defeats', n_defeats:'All-time — the hard-luck record', n_defeats_s:s=>`${s} — the hard-luck record`,
        t_silver:'Most Silver Medals', n_silver:'Always the bridesmaid (league + CUP)',
        t_bronze:'Most Bronze Medals', n_bronze:'Third place finishes (league + CUP)', u_bronzes:'bronzes',
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
        high_match:'پرگل‌ترین مسابقه', worst_defeat:'بدترین شکست', no_games:'هنوز نتیجه‌ای ثبت نشده است',
        u_trebles:'سه‌گانه', u_goals:'گل', u_clean:'کلین‌شیت', u_row:'پیاپی', u_wins:'برد',
        u_wrate:'درصد برد', u_gd:'تفاضل گل', u_games:'بازی', u_points:'امتیاز', u_defeats:'شکست',
        u_silvers:'نقره', u_titles:'قهرمانی', u_weeks:'هفته', u_draws:'مساوی',
        t_draws:'بیشترین مساوی', n_draws:'در کل تاریخ تمام فصول',
        t_fewest:'کمترین گل خورده', n_fewest:'محکم‌ترین دفاع تاریخ لیگ', n_fewest_s:l=>`${l} — محکم‌ترین دفاع`, games_n:n=>`${n} بازی`,
        t_achv:'بیشترین دستاورد', n_achv:'تیمی که بیشترین رکوردهای لیگ را در اختیار دارد', u_records:'رکورد', of_records:n=>`از ${n} رکورد`,
        t_treble:'سه‌گانه قهرمانی (Treble)', n_treble:'قهرمانی هم‌زمان لیگ + جام حذفی + سوپرجام در یک فصل',
        t_goals:'بیشترین گل زده', n_goals:'در کل تاریخ تمام فصول',
        t_conc:'بیشترین گل خورده', n_conc:'در کل تاریخ — آسیب‌پذیرترین خط دفاع', n_conc_s:s=>`${s} — بیشترین گل دریافتی`,
        t_clean:'بیشترین کلین‌شیت (دروازه بسته)', n_clean_s:(s,n)=>`${s} · از ${n} بازی ثبت‌شده`,
        t_reign:'طولانی‌ترین دوران صدرنشینی', n_reign:'قهرمانی‌های متوالی در لیگ',
        t_wins:'بیشترین برد', n_wins:'در کل تاریخ تمام فصول',
        t_pts:'بیشترین امتیاز',
        t_reign_s:'طولانی‌ترین ماندن در صدر', n_reign_s:s=>`${s} — بیشترین هفته‌های پشت‌سرهم در رتبه اول`, n_treble_s:s=>`${s} — لیگ + جام + سوپرجام`, n_medals_s:s=>`${s} — لیگ + جام`,
        champ_title:'فصل‌های قهرمانی', champ_sub:'تاریخچه افتخارات تیم', champ_silver:'نقره', champ_bronze:'برنز', champ_none_all:'هنوز افتخاری ثبت نشده', champ_league:'لیگ', champ_cup:'جام', champ_super:'سوپرجام', champ_none:'هنوز قهرمانی‌ای ندارد', cup_n:n=>`جام ${n}`,
        show_all_recs:'نمایش کامل رکوردها', hide_all_recs:'پنهان کردن رکوردها',
        t_top:'بیشترین هفته صدرنشینی', n_top:'هفته‌های حضور در صدر جدول در تمام فصل‌ها', n_top_s:s=>`${s} — هفته‌های حضور در رتبه اول`,
        t_wrate:'بهترین درصد برد', n_wrate:'نسبت بردها (حداقل ۵ بازی)', n_wrate_s:s=>`${s} (حداقل ۳ بازی)`,
        t_gd:'بهترین تفاضل گل', n_gd:'گل زده منهای گل خورده در کل تاریخ',
        t_wstreak:'طولانی‌ترین نوار برد متوالی', n_wstreak:n=>`بردهای پیاپی از ${n} بازی ثبت‌شده`, n_wstreak_s:s=>`${s} — بردهای پیاپی`,
        t_unb:'طولانی‌ترین نوار شکست‌ناپذیری', n_unb:'بازی‌های متوالی بدون باخت', n_unb_s:s=>`${s} — بازی‌های پیاپی بدون شکست`,
        t_bpts:'بهترین فصل — امتیاز', n_bpts:'بیشترین امتیاز کسب‌شده در یک فصل',
        t_bgf:'بهترین فصل — گل زده', n_bgf:'بیشترین گل زده در یک فصل',
        t_defeats:'بیشترین شکست', n_defeats:'در کل تاریخ — بدشانس‌ترین رکورد', n_defeats_s:s=>`${s} — بیشترین باخت`,
        t_silver:'بیشترین مدال نقره (نایب‌قهرمانی)', n_silver:'مجموع نایب‌قهرمانی‌های لیگ و جام حذفی',
        t_bronze:'بیشترین مدال برنز', n_bronze:'مجموع سوم‌شدن‌های لیگ و جام حذفی', u_bronzes:'برنز',
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
        high_match:'Partido con Más Goles', worst_defeat:'Peor Derrota', no_games:'Aún no hay resultados',
        u_trebles:'tripletes', u_goals:'goles', u_clean:'porterías imbatidas', u_row:'seguidos', u_wins:'victorias',
        u_wrate:'de victorias', u_gd:'dif. goles', u_games:'partidos', u_points:'puntos', u_defeats:'derrotas',
        u_silvers:'platas', u_titles:'títulos', u_weeks:'semanas', u_draws:'empates',
        t_draws:'Más Empates', n_draws:'Histórico, todas las temporadas',
        t_fewest:'Menos Goles Encajados', n_fewest:'La defensa más sólida de la historia', n_fewest_s:l=>`${l} — la defensa más sólida`, games_n:n=>`${n} partidos`,
        t_achv:'Más Logros', n_achv:'El equipo que posee más récords de la liga', u_records:'récords', of_records:n=>`de ${n} récords`,
        t_treble:'El Triplete', n_treble:'Liga + Copa + Supercopa en la misma temporada',
        t_goals:'Más Goles Anotados', n_goals:'Histórico, todas las temporadas',
        t_conc:'Más Goles Recibidos', n_conc:'Histórico — la defensa más goleada', n_conc_s:s=>`${s} — la defensa más goleada`,
        t_clean:'Más Porterías a Cero', n_clean_s:(s,n)=>`${s} · de ${n} partidos`,
        t_reign:'Reinado Más Largo en la Cima', n_reign:'Títulos de liga ganados consecutivamente',
        t_wins:'Más Victorias', n_wins:'Histórico, todas las temporadas',
        t_pts:'Más Puntos',
        t_reign_s:'Racha más larga en el liderato', n_reign_s:s=>`${s} — más jornadas seguidas en primer lugar`, n_treble_s:s=>`${s} — Liga + Copa + Supercopa`, n_medals_s:s=>`${s} — liga + copa`,
        champ_title:'Temporadas campeón', champ_sub:'Historial de honores del equipo', champ_silver:'Plata', champ_bronze:'Bronce', champ_none_all:'Aún sin honores', champ_league:'Liga', champ_cup:'Copa', champ_super:'Supercopa', champ_none:'Aún sin títulos', cup_n:n=>`Copa ${n}`,
        show_all_recs:'Mostrar todos los récords', hide_all_recs:'Ocultar récords',
        t_top:'Más Semanas como Líder', n_top:'Jornadas en primer lugar, todas las temporadas', n_top_s:s=>`${s} — jornadas en primer lugar`,
        t_wrate:'Mejor % de Victorias', n_wrate:'Porcentaje de victorias (mín. 5 partidos)', n_wrate_s:s=>`${s} (mín. 3 partidos)`,
        t_gd:'Mejor Diferencia de Goles', n_gd:'Goles a favor menos goles en contra',
        t_wstreak:'Mayor Racha de Victorias', n_wstreak:n=>`Victorias seguidas en ${n} partidos`, n_wstreak_s:s=>`${s} — victorias seguidas`,
        t_unb:'Mayor Racha Invicto', n_unb:'Partidos seguidos sin perder', n_unb_s:s=>`${s} — partidos sin perder`,
        t_bpts:'Mejor Temporada — Puntos', n_bpts:'Más puntos de liga en una temporada',
        t_bgf:'Mejor Temporada — Goles', n_bgf:'Más goles anotados en una temporada',
        t_defeats:'Más Derrotas', n_defeats:'Histórico — récord de mala fortuna', n_defeats_s:s=>`${s} — más derrotas`,
        t_silver:'Más Medallas de Plata', n_silver:'Subcampeonatos (Liga + Copa)',
        t_bronze:'Más Medallas de Bronce', n_bronze:'Terceros puestos (Liga + Copa)', u_bronzes:'bronces',
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
function recordsLeaders(list, low){
    if(low){   // records where the SMALLEST value wins (fewest goals conceded)
        if(!list.length) return { best:0, teams:[] };
        const lo = Math.min(...list.map(x=>x.value));
        return { best:lo, teams:list.filter(x=>x.value===lo).map(x=>x.team) };
    }
    const best = Math.max(0, ...list.map(x=>x.value));
    return { best, teams: best>0 ? list.filter(x=>x.value===best).map(x=>x.team) : [] };
}
// width (%) of a bar: normal records — relative to the leader; "low" records — the smallest value gets the full bar
function recordsBarPct(c, v, best){
    if(!c.low){ return Math.round(Math.max(0, v) / Math.max(1, best) * 100); }
    const vals = c.list.map(x=>x.value), mx = Math.max(...vals), mn = Math.min(...vals);
    return mx === mn ? 100 : Math.round(Math.max(8, 100 * (mx - v) / (mx - mn)));
}
// the achievements record: the team that holds the most of the OTHER records
function recordsAchievementsCard(cards, L, bars, note){
    const held = {}; TEAM_NAMES.forEach(t=>held[t]=[]);
    cards.forEach(c=>{ recordsLeaders(c.list, c.low).teams.forEach(t=>{ held[t].push(c); }); });
    return { id:'achv', feat:true, icon:'🏅', title:L.t_achv, note, list:bars(t=>held[t].length), unit:L.u_records,
        extra:t=> held[t].length ? held[t].map(c=>c.icon).join(' ') : '',
        extraFull:t=> held[t].length ? held[t].map(c=>`${c.icon} ${c.title}`).join(' · ') + ` (${L.of_records(cards.length)})` : '' };
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
    const lowBars = (fn, ok)=>TEAM_NAMES.filter(ok).map(t=>({ team:t, value:fn(t) })).sort((x,y)=>x.value-y.value);
    // every matchweek a team sat first in the table, over all archived seasons + the current one
    let topAll = null;
    if(typeof magComputeRankHistory==='function'){
        const ok = lg=>(lg||[]).filter(m=>recordsParseScore(m) && TEAM_NAMES.includes(m.home) && TEAM_NAMES.includes(m.away));
        const add = lg=>{ let h = null; try{ h = magComputeRankHistory(recordsWithRounds(ok(lg))); }catch(e){} if(!h) return; topAll = topAll || {}; TEAM_NAMES.forEach(t=>{ topAll[t] = (topAll[t]||0) + h.ranks[t].filter(r=>r===1).length; }); };
        (archivedSeasons||[]).forEach(se=>add(se.history));
        add(matchHistory);
    }
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
        ...(topAll ? [{ id:'top', icon:'🔝', title:L.t_top, note:L.n_top, list:bars(t=>topAll[t]||0), unit:L.u_weeks }] : []),
        { id:'fewest',  icon:'🧤', title:L.t_fewest,  note:L.n_fewest,                    list:lowBars(t=>stats[t].GA, t=>stats[t].P>0), low:true, unit:L.u_goals,
          extra:t=> L.games_n(stats[t].P) },
        { id:'draws',   icon:'🤝', title:L.t_draws,   note:L.n_draws,                     list:bars(t=>stats[t].D), unit:L.u_draws },
        { id:'silver',  icon:'🥈', title:L.t_silver,  note:L.n_silver,                    list:bars(t=>trophies[t].silver||0), unit:L.u_silvers },
        { id:'bronze',  icon:'🥉', title:L.t_bronze,  note:L.n_bronze,                    list:bars(t=>trophies[t].bronze||0), unit:L.u_bronzes },
        { id:'decor',   icon:'🏆', title:L.t_decor,   note:L.n_decor,                     list:bars(t=>(trophies[t].leagueGold||0)+(trophies[t].cup||0)+(trophies[t].superCup||0)), unit:L.u_titles,
          extra:t=>{ const x=trophies[t]; return L.decor_parts(x.leagueGold, x.cup, x.superCup); } },
    ];
    cards.unshift(recordsAchievementsCard(cards.slice(), L, bars, L.n_achv));
    return { cards, biggest, highest };
}
// Older archived seasons were saved without a matchweek number on each game, so "weeks on top" could not be worked out for them
// (and the record vanished whenever the latest season was an archived one). When the numbers are missing the games are grouped
// into matchweeks in the order they were played: every week = one game per team.
function recordsWithRounds(list){
    const arr = list || [];
    if(arr.every(m=>Number.isFinite(+m.round) && +m.round>0)) return arr;
    const per = Math.max(1, Math.floor(TEAM_NAMES.length/2));
    return [...arr].sort((x,y)=>String(x.timestamp||'').localeCompare(String(y.timestamp||'')))
        .map((m,i)=>({ ...m, round:Math.floor(i/per)+1 }));
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
    return { label:L.season_n(last.seasonId), rows, logs:last.history || [], season:last };
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
        const h = magComputeRankHistory(recordsWithRounds(logs));
        if(h){ top = {}; TEAM_NAMES.forEach(t=>{ top[t] = h.ranks[t].filter(r=>r===1).length; }); }
    }
    const bars = fn=>TEAM_NAMES.map(t=>({ team:t, value:fn(t) })).sort((x,y)=>y.value-x.value);
    const lowBars = (fn, ok)=>TEAM_NAMES.filter(ok).map(t=>({ team:t, value:fn(t) })).sort((x,y)=>x.value-y.value);
    const n = logs.length;
    // Same record list as All-time (so both tabs always show the same number of records). Honours are only known once a season has ended:
    // for the running season they stay at 0 until it is archived.
    const med = {}; TEAM_NAMES.forEach(t=>med[t]={ gold:0, silver:0, bronze:0, league:0, cup:0, sup:0, treble:0 });
    const se = src.season;
    if(se && se.table){
        [['gold',0],['silver',1],['bronze',2]].forEach(([k,i])=>{ const r = se.table[i]; if(r && med[r.name]) med[r.name][k]++; });
        const lg = se.table[0] && se.table[0].name;
        if(lg && med[lg]) med[lg].league++;
        if(se.superCup && se.superCup.winner && med[se.superCup.winner]){ med[se.superCup.winner].sup++; }
        const ed = (typeof mbaEditionForSeason==='function') ? mbaEditionForSeason(se) : null;
        const rec = ed!=null ? ((mbaData && mbaData.completed) || []).find(r=>r.edition===ed) : null;
        if(rec){
            [['gold',rec.gold],['silver',rec.silver],['bronze',rec.bronze]].forEach(([k,t])=>{ if(t && med[t]) med[t][k]++; });
            if(rec.gold && med[rec.gold]) med[rec.gold].cup++;
        }
        if(lg && med[lg] && se.superCup && se.superCup.winner===lg && rec && rec.gold===lg) med[lg].treble = 1;
    }
    // longest unbroken stay in first place (matchweeks in a row)
    let stay = null;
    if(typeof magComputeRankHistory==='function'){
        const h = magComputeRankHistory(recordsWithRounds(logs));
        if(h){ stay = {}; TEAM_NAMES.forEach(t=>{ let cur = 0, best = 0; h.ranks[t].forEach(r=>{ cur = r===1 ? cur+1 : 0; if(cur>best) best = cur; }); stay[t] = best; }); }
    }
    const cards = [
        { id:'treble', special:true, icon:'\ud83c\udfc6', badge:RECORDS_TREBLE_BADGE, title:L.t_treble, note:L.n_treble_s(src.label), list:bars(t=>med[t].treble), unit:L.u_trebles },
        { id:'reign', icon:'👑', title:L.t_reign_s, note:L.n_reign_s(src.label), list:bars(t=>stay ? stay[t] : 0), unit:L.u_row },
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
        { id:'fewest',  icon:'🧤', title:L.t_fewest,  note:L.n_fewest_s(src.label),          list:lowBars(t=>g(t,'GA'), t=>g(t,'P')>0), low:true, unit:L.u_goals,
          extra:t=> L.games_n(g(t,'P')) },
        { id:'draws',   icon:'🤝', title:L.t_draws,   note:src.label,                        list:bars(t=>g(t,'D')), unit:L.u_draws },
        { id:'played',  icon:'🏟️', title:L.t_played,  note:src.label,                        list:bars(t=>g(t,'P')), unit:L.u_games },
    ];
    cards.unshift(recordsAchievementsCard(cards.slice(), L, bars, L.n_achv));
    return { cards, biggest, highest, label:src.label };
}
let recordsScope = 'all';
function recordsCompute(){ return recordsScope==='season' ? recordsComputeSeason() : recordsComputeAll(); }
function setRecordsScope(sc){
    const next = sc==='season' ? 'season' : 'all';
    if(next===recordsScope){ recordsSyncScopeUI(); return; }
    // all-time sits on the left, latest season on the right: the list slides in from the side it is on
    const dir = next==='season' ? 1 : -1;
    recordsScope = next;
    haptic([6]);
    recordsSyncScopeUI();
    const box = document.getElementById('records-list');
    recordsRender();
    if(box && box.animate) box.animate([{opacity:0,transform:`translateX(${dir*46}px)`},{opacity:1,transform:'none'}],{duration:520,easing:'cubic-bezier(.16,1,.3,1)'});
}
// swipe the records page sideways (or scroll it sideways with a trackpad) to flip between All-time and Latest season
let recordsSwipeBound = false;
function recordsBindSwipe(){
    if(recordsSwipeBound) return;
    const pn = document.querySelector('#records-sheet .records-modal'); if(!pn) return;
    recordsSwipeBound = true;
    const flip = dx=>{
        if(document.getElementById('rec-detail-ov')) return;
        if(dx<0 && recordsScope==='all' && recordsSeasonSource()) setRecordsScope('season');
        else if(dx>0 && recordsScope==='season') setRecordsScope('all');
    };
    let sx = 0, sy = 0, live = false;
    pn.addEventListener('touchstart', e=>{
        live = e.touches.length===1; if(!live) return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive:true });
    pn.addEventListener('touchend', e=>{
        if(!live) return; live = false;
        const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if(Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)*1.4) flip(dx);
    }, { passive:true });
    pn.addEventListener('touchcancel', ()=>{ live = false; }, { passive:true });
    let wheelLock = 0;
    pn.addEventListener('wheel', e=>{
        if(Math.abs(e.deltaX) < 24 || Math.abs(e.deltaX) < Math.abs(e.deltaY)*1.4) return;
        const now = Date.now(); if(now < wheelLock) return;
        wheelLock = now + 700;
        flip(e.deltaX > 0 ? -1 : 1);
    }, { passive:true });
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
}
function recordsTeamLabel(t){ return (typeof TEAM_DISPLAY_NAMES!=='undefined' && TEAM_DISPLAY_NAMES[t]) || t; }
function recordsLogo(t, cls){ return `<img class="${cls||''}" src="${teamLogoUrl(t)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`; }

function recordsRender(){
    const L = recL();
    const box = document.getElementById('records-list'); if(!box) return;
    const { cards, biggest, highest } = recordsCompute();
    let i = 0;
    if(!cards.length){ box.innerHTML = `<div class="rec-empty" style="text-align:center;padding:24px 0;">${L.no_season_games}</div>`; return; }
    recordsShown = cards;
    const holderParts = c=>{
        const ldr = recordsLeaders(c.list, c.low);
        return { ldr,
            logos:ldr.teams.slice(0,2).map(t=>`<span class="rec-logo-wrap">${recordsLogo(t,'rec-logo')}</span>`).join('') + (ldr.teams.length>2 ? `<span class="rt-more">+${ldr.teams.length-2}</span>` : ''),
            names:ldr.teams.map(t=>escapeHtml(recordsTeamLabel(t))).join(' & ') };
    };
    const countHtml = (c, ldr)=>`<span class="rec-count" data-to="${ldr.best}" data-dec="${c.dec||0}" data-pre="${c.id==='gd'?'+':''}" data-suf="${c.id==='wrate'?'%':''}">0</span>`;
    const open = c=>`role="button" tabindex="0" onclick="recordsOpenDetail('${c.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();recordsOpenDetail('${c.id}')}"`;
    // featured tile: bigger, with the details (note, holder, value, extra line); tapping it opens the same detail page as every other record
    const featTile = c=>{
        const h = holderParts(c), ldr = h.ldr, extra = ldr.teams.length===1 && c.extra ? c.extra(ldr.teams[0]) : '';
        return `
        <div class="rec-tile rec-feat${c.special?' rec-special':''}" style="--d:${Math.min(i++,14)*38}ms" ${open(c)}>
            <div class="rf-head"><span class="rf-ico">${c.badge || c.icon}</span><div class="rf-ttl"><b>${c.title}</b><em>${escapeHtml(c.note)}</em></div></div>
            <div class="rf-main">
                <div class="rf-logos">${ldr.teams.length ? h.logos : '<span class="rt-none">—</span>'}</div>
                <div class="rf-txt">
                    <div class="rf-name">${ldr.teams.length ? h.names : '—'}</div>
                    <div class="rf-val">${ldr.teams.length ? `${countHtml(c, ldr)}<small>${c.unit}</small>` : '<span class="rt-dash">—</span>'}</div>
                </div>
            </div>
            <div class="rf-extra">${escapeHtml(extra)}</div>
        </div>`;
    };
    const tile = c=>{
        const h = holderParts(c), ldr = h.ldr;
        return `
        <div class="rec-tile" style="--d:${Math.min(i++,14)*38}ms" ${open(c)}>
            <div class="rt-ico">${c.icon}</div>
            <div class="rt-title"><span>${c.title}</span></div>
            <div class="rt-logos">${ldr.teams.length ? h.logos : '<span class="rt-none">—</span>'}</div>
            <div class="rt-name">${ldr.teams.length ? h.names : '—'}</div>
            <div class="rt-val">${ldr.teams.length ? `${countHtml(c, ldr)}<small>${c.unit}</small>` : '<span class="rt-dash">—</span>'}</div>
        </div>`;
    };
    const REC_ORDER = ['goals','bgf','gd', 'clean','conc','fewest', 'wins','wrate','wstreak', 'unb','draws','defeats', 'reign','bpts','top','pts', 'silver','bronze','decor', 'played'];   // scoring · defending · winning · results · the table · medals
    const ord = c=>{ const k = REC_ORDER.indexOf(c.id); return k<0 ? 99 : k; };
    const feat = cards.filter(c=>c.feat || c.special).sort((a,b)=>(b.special?1:0)-(a.special?1:0)), rest = cards.filter(c=>!(c.feat || c.special)).sort((a,b)=>ord(a)-ord(b));
    const tiles = [ feat.length ? `<div class="rec-grid rec-grid-feat${feat.length===1?' solo':''}">${feat.map(featTile).join('')}</div>` : '', `<div class="rec-grid">${rest.map(tile).join('')}</div>` ];
    const match = (id, icon, title, data)=> data ? `
        <div class="rec-card rec-match" style="--d:${id==='big' ? 40 : 120}ms">
            <div class="rec-head"><span class="rec-ico">${icon}</span><div><div class="rec-title">${title}</div><div class="rec-note">${data.m.timestamp ? new Date(data.m.timestamp).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : ''}</div></div></div>
            <div class="rec-scoreline">
                <div class="rec-side">${recordsLogo(data.m.home,'rec-logo')}<span>${escapeHtml(recordsTeamLabel(data.m.home))}</span></div>
                <div class="rec-score"><span class="rec-count" data-to="${data.sc.a}">0</span><i>–</i><span class="rec-count" data-to="${data.sc.b}">0</span></div>
                <div class="rec-side">${recordsLogo(data.m.away,'rec-logo')}<span>${escapeHtml(recordsTeamLabel(data.m.away))}</span></div>
            </div>
        </div>` : '';
    box.innerHTML = tiles[0] + match('big','💥',L.big_win,biggest) + tiles[1] + match('high','🎯',L.high_match,highest);   // featured row, then the biggest win, then the 3-per-row tiles, highest-scoring match last
    recordsAnimateCounts(box);
    const sh = document.getElementById('records-sheet'), pn = sh && sh.querySelector('.records-modal'); if(pn) pn.scrollTop = 0;
}
// counts the numbers up (used by the tiles and by the detail page)
function recordsAnimateCounts(root){
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
    root.querySelectorAll('.rec-count').forEach((el,k)=>{
        const to = +el.dataset.to, dec = +el.dataset.dec||0, pre = el.dataset.pre||'', suf = el.dataset.suf||''; if(reduce || to<=0){ el.textContent = pre+to.toFixed(dec)+suf; return; }
        const t0 = performance.now() + 300 + Math.min(k,12)*34, dur = 1500;
        const tick = now=>{
            if(now<t0){ requestAnimationFrame(tick); return; }
            const p = Math.min(1,(now-t0)/dur), e = 1-Math.pow(1-p,4);   // ease-out quart: a long, soft landing
            el.textContent = pre+(dec ? (to*e).toFixed(dec) : Math.round(to*e))+suf;
            if(p<1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

// Header picture of the Records page (the supplied "RECORDS & ACHIEVEMENTS" artwork, 1024px WebP, ~21 KB). It is set the first time the page opens;
// the same file is also delivered as records-header.webp if you would rather host it as a normal file.
const REC_HDR_IMG = 'data:image/webp;base64,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';
function recordsApplyHeaderImg(){
    const el = document.getElementById('rec-hdr');
    if(el && !el.dataset.img){ el.style.backgroundImage = `url(${REC_HDR_IMG})`; el.dataset.img = '1'; }
}
let recordsShown = [];
// detail page of one record: the whole old card (title + note, leader(s), value, extra line, a bar for every team)
function recordsFullCardHtml(c){
    const L = recL();
    const ldr = recordsLeaders(c.list, c.low);
    const logos = ldr.teams.map(t=>`<span class="rec-logo-wrap">${recordsLogo(t,'rec-logo')}</span>`).join('');
    const names = ldr.teams.map(t=>escapeHtml(recordsTeamLabel(t))).join(' & ');
    const extra = ldr.teams.length===1 ? ((c.extraFull || c.extra) ? (c.extraFull || c.extra)(ldr.teams[0]) : '') : '';
    const bars = c.list.map(x=>`
        <div class="rec-bar-row${ldr.teams.includes(x.team)?' lead':''}">
            ${recordsLogo(x.team,'rec-mini')}
            <div class="rec-bar"><i style="--w:${recordsBarPct(c, x.value, ldr.best)}%"></i></div>
            <b>${c.fmt ? c.fmt(x.value) : x.value}</b>
        </div>`).join('');
    return `
    <div class="rec-card${c.special?' rec-special':''}" style="--d:0ms">
        <div class="rec-head"><span class="rec-ico">${c.badge || c.icon}</span><div><div class="rec-title">${c.title}</div><div class="rec-note">${escapeHtml(c.note)}</div></div></div>
        ${ldr.teams.length ? `
        <div class="rec-hero">
            <div class="rec-logos">${logos}</div>
            <div class="rec-hero-txt">
                <div class="rec-team">${names}${ldr.teams.length>1?` <em>${L.shared}</em>`:''}</div>
                <div class="rec-val"><span class="rec-count" data-to="${ldr.best}" data-dec="${c.dec||0}" data-pre="${c.id==='gd'?'+':''}" data-suf="${c.id==='wrate'?'%':''}">0</span><small>${c.unit}</small></div>
                ${extra ? `<div class="rec-extra">${escapeHtml(extra)}</div>` : ''}
            </div>
        </div>` : `<div class="rec-empty">${L.no_record_yet}</div>`}
        <div class="rec-bars">${bars}</div>
    </div>`;
}
function recordsOpenDetail(id){
    const c = recordsShown.find(x=>x.id===id); if(!c) return;
    haptic([6]);
    recordsCloseDetail(true);
    const ov = document.createElement('div');
    ov.className = 'rec-detail-ov'; ov.id = 'rec-detail-ov';
    ov.onclick = e=>{ if(e.target===ov) recordsCloseDetail(); };
    ov.innerHTML = `<div class="rec-detail"><button type="button" class="rec-detail-x" onclick="recordsCloseDetail()" aria-label="Close"><i class="fas fa-times"></i></button>${recordsFullCardHtml(c)}</div>`;
    document.body.appendChild(ov);
    void ov.offsetWidth; ov.classList.add('open');
    recordsAnimateCounts(ov);
}
function recordsCloseDetail(now){
    const ov = document.getElementById('rec-detail-ov'); if(!ov) return;
    if(now===true){ ov.remove(); return; }
    ov.classList.remove('open');
    setTimeout(()=>ov.remove(), 450);
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape') recordsCloseDetail(); });
// scope: 'season' opens straight on the latest season (the Magazine's button does that); without it the page opens on all-time.
function openRecordsSheet(scope){
    recordsScope = (scope==='season' && recordsSeasonSource()) ? 'season' : 'all';
    recordsApplyHeaderImg();
    haptic([8]);
    const sh = document.getElementById('records-sheet'); if(!sh) return;
    // the HARFS capsule stays visible: the sheet starts below it (css/effects.css, 1.31)
    recordsSyncScopeUI();
    recordsRender();
    recordsBindScroll();
    recordsBindSwipe();
    sh.classList.remove('open'); void sh.offsetWidth; sh.classList.add('open');
    requestAnimationFrame(recordsSyncScopeUI);
}
function closeRecordsSheet(){ recordsCloseDetail(true); const sh = document.getElementById('records-sheet'); if(sh) sh.classList.remove('open'); }

function recordsForTeam(team){
    const L = recL();
    const { cards } = recordsComputeAll();
    const rows = cards.map(c=>{
        const me = c.list.find(x=>x.team===team); if(!me) return null;
        const ldr = recordsLeaders(c.list, c.low);
        const rank = 1 + c.list.filter(x=>c.low ? x.value<me.value : x.value>me.value).length;
        return { id:c.id, icon:c.badge || c.icon, special:!!c.special, title:c.title, unit:c.unit, value:me.value, shown:c.fmt ? c.fmt(me.value) : String(me.value),
                 rank, of:c.list.length, best:ldr.best, holds: (c.low || ldr.best>0) && ldr.teams.includes(team), shared: ldr.teams.length>1,
                 pct: c.low ? recordsBarPct(c, me.value, ldr.best) : (ldr.best>0 ? Math.round(Math.max(0,me.value)/ldr.best*100) : 0),
                 extra: c.extra ? c.extra(team) : '' };
    }).filter(Boolean);
    return { rows };
}
// The team's three notable results (all seasons): biggest win, highest-scoring match, worst defeat
function recordsTeamGames(team){
    const L = recL();
    const logs = [];
    (archivedSeasons||[]).forEach(se=>(se.history||[]).forEach(m=>logs.push({ m, label:L.season_n(se.seasonId) })));
    (matchHistory||[]).forEach(m=>logs.push({ m, label:L.this_season }));
    let bigWin = null, topGame = null, worst = null;
    logs.forEach(({m,label})=>{
        const sc = recordsParseScore(m); if(!sc || (m.home!==team && m.away!==team)) return;
        const mine = m.home===team ? sc.a : sc.b, theirs = m.home===team ? sc.b : sc.a, total = mine+theirs;
        if(mine>theirs && (!bigWin || (mine-theirs)>bigWin.margin || ((mine-theirs)===bigWin.margin && total>bigWin.total))) bigWin = { m, sc, label, margin:mine-theirs, total };
        if(!topGame || total>topGame.total) topGame = { m, sc, label, total };
        if(mine<theirs && (!worst || (theirs-mine)>worst.margin || ((theirs-mine)===worst.margin && theirs>worst.conceded))) worst = { m, sc, label, margin:theirs-mine, total, conceded:theirs };
    });
    return { bigWin, topGame, worst };
}
function recordsTeamGamesHtml(team){
    const L = recL();
    const { bigWin, topGame, worst } = recordsTeamGames(team);
    if(!bigWin && !topGame && !worst) return `<div class="team-panel-empty">${L.no_games}</div>`;
    const side = t=>`<span class="tp-game-side${t===team?' me':''}">${recordsLogo(t,'tp-game-logo')}<span>${escapeHtml(recordsTeamLabel(t))}</span></span>`;
    const game = (icon,title,g,k)=> g ? `<div class="tp-game" style="--d:${k*60}ms"><div class="tp-game-h"><span>${icon}</span>${title}<em>${escapeHtml(g.label)}</em></div>
        <div class="tp-game-s">${side(g.m.home)}<b>${g.sc.a} – ${g.sc.b}</b>${side(g.m.away)}</div></div>` : '';
    return game('💥',L.big_win,bigWin,0) + game('🎯',L.high_match,topGame,1) + game('💔',L.worst_defeat,worst,2);
}
// When this team won something: league seasons, CUP editions and Super Cups (from the archive + the finished CUPs)
function recordsTeamTitles(team){
    const league = [], sup = [], cup = [];
    [...(archivedSeasons||[])].sort((a,b)=>(a.seasonId||0)-(b.seasonId||0)).forEach(se=>{
        if(se && se.table && se.table[0] && se.table[0].name===team) league.push(se.seasonId);
        if(se && se.superCup && se.superCup.winner===team) sup.push(se.seasonId);
    });
    [...((mbaData && mbaData.completed) || [])].sort((a,b)=>(a.edition||0)-(b.edition||0)).forEach(r=>{ if(r.gold===team) cup.push(r.edition); });
    return { league, sup, cup };
}
// Silver / bronze finishes (league seasons + CUP editions) — shown for teams that have never been champion
function recordsTeamMedals(team){
    const silver = [], bronze = [];
    [...(archivedSeasons||[])].sort((a,b)=>(a.seasonId||0)-(b.seasonId||0)).forEach(se=>{
        const t = (se && se.table) || [];
        if(t[1] && t[1].name===team) silver.push({ kind:'league', n:se.seasonId });
        if(t[2] && t[2].name===team) bronze.push({ kind:'league', n:se.seasonId });
    });
    [...((mbaData && mbaData.completed) || [])].sort((a,b)=>(a.edition||0)-(b.edition||0)).forEach(r=>{
        if(r.silver===team) silver.push({ kind:'cup', n:r.edition });
        if(r.bronze===team) bronze.push({ kind:'cup', n:r.edition });
    });
    return { silver, bronze };
}
// The records list of a team stays folded until the ring in the "League Records" header has been filled by scrolling the panel down
// (or the header is tapped).
const tpReveal = pullRevealMake({
    scroller: ()=>document.querySelector('#team-panel-overlay .team-panel-scroll'),
    head: ()=>document.getElementById('tp-records-title'),
    collapse: ()=>document.querySelector('#team-panel-records .pr-collapse'),
    room: ()=>document.querySelector('#team-panel-records .pr-room'),
    ring: ()=>document.getElementById('tp-ring-fg')
});
function recordsTpTap(){ if(typeof haptic==='function') haptic([6]); tpReveal.set(true, false); }
function recordsTpBind(){
    const sc = tpReveal && document.querySelector('#team-panel-overlay .team-panel-scroll'); if(!sc) return;
    if(!sc.dataset.prBound){ sc.dataset.prBound = '1'; let raf = 0; sc.addEventListener('scroll', ()=>{ if(raf) return; raf = requestAnimationFrame(()=>{ raf = 0; tpReveal.sync(); }); }, { passive:true }); }
    tpReveal.set(tpReveal.S.revealed, true);
    [0, 350].forEach(ms=>setTimeout(()=>{ tpReveal.measure(); tpReveal.sync(); }, ms));
}
function recordsTeamChampHtml(team){
    const L = recL(), T = recordsTeamTitles(team);
    const grp = (icon, label, chips)=> `<div class="tp-champ-row"><div class="tp-champ-lbl"><span>${icon}</span>${escapeHtml(label)}</div><div class="tp-champ-chips">${
        chips.length ? chips.map(c=>`<b class="tp-champ-chip">${escapeHtml(c)}</b>`).join('') : `<em class="tp-champ-none">—</em>`}</div></div>`;
    const any = T.league.length || T.cup.length || T.sup.length;
    let body;
    if(any){
        body = grp('🏆', L.champ_league, T.league.map(L.season_n)) + grp('🥇', L.champ_cup, T.cup.map(L.cup_n)) + grp('⭐', L.champ_super, T.sup.map(L.season_n));
    } else {
        // never been champion: show when (and where) the team finished second or third instead
        const M = recordsTeamMedals(team);
        const chip = m=> m.kind==='cup' ? L.cup_n(m.n) : `${L.season_n(m.n)} · ${L.champ_league}`;
        body = (M.silver.length || M.bronze.length)
            ? (M.silver.length ? grp('🥈', L.champ_silver, M.silver.map(chip)) : '') + (M.bronze.length ? grp('🥉', L.champ_bronze, M.bronze.map(chip)) : '')
            : `<div class="tp-champ-empty">${escapeHtml(L.champ_none_all)}</div>`;
    }
    return `<div class="tp-champ">
        <div class="tp-champ-h"><span class="tp-champ-ic">🏆</span><div><div class="tp-champ-t">${escapeHtml(L.champ_title)}</div><div class="tp-champ-s">${escapeHtml(L.champ_sub)}</div></div></div>
        ${body}
    </div>`;
}
function recordsTeamPanelHtml(team){
    const L = recL();
    const { rows } = recordsForTeam(team);
    const champ = recordsTeamChampHtml(team);
    if(!rows.length) return champ + `<div class="team-panel-empty">${L.no_team_records}</div>`;
    const held = rows.filter(r=>r.holds);
    const heldHtml = held.length
        ? `<div class="tp-held">${held.map(r=>`<span class="tp-held-chip"><span>${r.icon}</span><b>${escapeHtml(r.title)}</b><em>${r.shown}${r.shared?` · ${L.shared}`:''}</em></span>`).join('')}</div>`
        : `<div class="tp-held-none">${L.no_held_now}</div>`;
    const list = rows.map((r,k)=>{
        const pct = r.pct;
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
    setTimeout(recordsTpBind, 0);
    return `<div class="tp-rec-wrap">${champ}
        <div class="pr-collapse${tpReveal.S.revealed ? ' open' : ''}"><div class="pr-inner">${heldHtml}<div class="tp-rec-list">${list}</div></div></div>
        <div class="pr-room"></div>
    </div>`;
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
