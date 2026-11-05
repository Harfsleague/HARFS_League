// ============================================================
// magazine.js  —  Weekly HARFS Magazine viewer
// Reads weekly_magazine_archive.json (an array of every issue ever
// published, newest first — see scripts/generate-magazine.mjs and
// .github/workflows/weekly-magazine.yml) and renders one issue at a
// time, with next/previous navigation through the archive so past
// weeks are never lost. Admins (Bayern, Edit Mode on) can edit or
// delete the issue currently being viewed.
// ============================================================

const GITHUB_MAGAZINE_FILE = "weekly_magazine_archive.json";
// Same default cover the generator (scripts/generate-magazine.mjs) falls
// back to when the AI image call fails — kept here too as a client-side
// safety net, so an older issue that shipped with coverImage:null (or a
// cover file that 404s for any reason) still shows something instead of a
// blank hero.
const DEFAULT_MAGAZINE_COVER = "mag1.png";

let magazineArchive = [];
let magazineLoaded = false;
let magazineIssueIdx = 0; // index into magazineArchive; 0 = newest

function openMagazinePanel() {
    haptic([8]);
    navigate('magazine');
    if (!magazineLoaded) {
        loadMagazine();
    } else {
        // Re-render even on a repeat visit: Edit Mode (and the Bayern login
        // itself) can change while the magazine screen isn't the active one
        // (e.g. toggled from Settings), and the issue/nav markup was only
        // ever refreshed while this screen was already open — so reopening
        // it could still show stale edit/delete buttons (or miss showing
        // them) until the admin flipped Edit Mode a second time.
        renderCurrentIssue();
    }
}

async function loadMagazine() {
    const body = document.getElementById('magazine-body');
    const loading = document.getElementById('magazine-loading');
    const cached = await idbGet('magazineArchive', 'v');
    if (cached && Array.isArray(cached) && cached.length && !magazineLoaded) {
        magazineArchive = cached;
        magazineLoaded = true;
        magazineIssueIdx = 0;
        renderCurrentIssue();
    } else {
        if (loading) loading.style.display = 'flex';
        if (body) body.innerHTML = '';
    }
    if (!navigator.onLine) {
        if (loading) loading.style.display = 'none';
        if (!magazineArchive.length) renderMagazineEmpty();
        return;
    }
    try {
        const res = await fetch(`${GITHUB_IMAGE_BASE_URL}${GITHUB_MAGAZINE_FILE}?cachebust=${Date.now()}`);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        magazineArchive = Array.isArray(data) ? data : (data ? [data] : []); // tolerate an old single-issue file
        magazineArchive.sort((a, b) => (b.issueNumber || 0) - (a.issueNumber || 0));
        magazineLoaded = true;
        if (magazineIssueIdx >= magazineArchive.length) magazineIssueIdx = 0;
        idbSet('magazineArchive', 'v', magazineArchive);
        renderCurrentIssue();
    } catch (e) {
        if (!magazineArchive.length) {
            magazineArchive = [];
            renderMagazineEmpty();
        }
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function renderMagazineEmpty() {
    const body = document.getElementById('magazine-body');
    if (!body) return;
    body.innerHTML = `
        <div class="magazine-empty">
            <i class="fas fa-newspaper"></i>
            <p>هنوز شمارهٔ این هفته آماده نشده.</p>
            <p class="magazine-empty-sub">مجله توسط ادمین، روزهای جمعه، از پنل ادمین منتشر می‌شود.</p>
        </div>`;
    renderMagazineIssueNav();
}

function jFormatDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return iso; }
}

function teamLabel(name) {
    return escapeHtml(TEAM_DISPLAY_NAMES[name] || name || '—');
}

// ---- archive navigation (older = higher index, newer = lower index) ----
function magazineGoNewer() {
    if (magazineIssueIdx <= 0) return;
    haptic([6]);
    magazineIssueIdx--;
    renderCurrentIssue('newer');
}
function magazineGoOlder() {
    if (magazineIssueIdx >= magazineArchive.length - 1) return;
    haptic([6]);
    magazineIssueIdx++;
    renderCurrentIssue('older');
}
function magazineJumpTo(idx) {
    haptic([6]);
    const dir = idx > magazineIssueIdx ? 'older' : idx < magazineIssueIdx ? 'newer' : null;
    magazineIssueIdx = idx;
    renderCurrentIssue(dir);
    closeMagazineIssuePicker();
}
function toggleMagazineIssuePicker() {
    const menu = document.getElementById('magazine-issue-picker');
    if (!menu) return;
    const opening = !menu.classList.contains('open');
    if (opening) {
        menu.innerHTML = magazineArchive.map((iss, idx) => `
            <div class="magazine-issue-picker-row${idx === magazineIssueIdx ? ' active' : ''}" onclick="magazineJumpTo(${idx})">
                <span>شمارهٔ ${iss.issueNumber ?? (magazineArchive.length - idx)}</span>
                <span class="magazine-issue-picker-date">${jFormatDate(iss.issueDate)}</span>
            </div>`).join('') || '<div class="magazine-issue-picker-row">آرشیوی وجود ندارد</div>';
    }
    menu.classList.toggle('open', opening);
}
function closeMagazineIssuePicker() {
    const menu = document.getElementById('magazine-issue-picker');
    if (menu) menu.classList.remove('open');
}

function renderMagazineIssueNav() {
    const nav = document.getElementById('magazine-issue-nav');
    if (!nav) return;
    if (!magazineArchive.length) { nav.innerHTML = ''; return; }
    const issue = magazineArchive[magazineIssueIdx];
    const atNewest = magazineIssueIdx <= 0;
    const atOldest = magazineIssueIdx >= magazineArchive.length - 1;
    const isAdmin = typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked && loggedInTeam === 'Bayern';
    nav.innerHTML = `
        <div class="magazine-issue-picker-wrap">
            <button class="magazine-issue-pill" onclick="toggleMagazineIssuePicker()">
                شمارهٔ ${issue.issueNumber ?? (magazineArchive.length - magazineIssueIdx)} <i class="fas fa-caret-down"></i>
            </button>
            <div class="magazine-issue-picker" id="magazine-issue-picker"></div>
        </div>
        ${isAdmin ? `
        <button class="weird-admin-btn" onclick="editMagazineIssue(${magazineIssueIdx})"><i class="fas fa-pen"></i> ادیت</button>
        <button class="weird-admin-btn weird-admin-btn-danger" onclick="deleteMagazineIssue(${magazineIssueIdx})"><i class="fas fa-trash"></i> حذف</button>` : ''}
    `;
}

// dir = 'older' | 'newer' when the reader moved between issues: the page slides out to the side the arrow points to and the other
// issue slides in from the opposite side (the issue pill / arrows update in the middle of it).
function renderCurrentIssue(dir) {
    if (!magazineArchive.length) { renderMagazineEmpty(); return; }
    if (magazineIssueIdx < 0) magazineIssueIdx = 0;
    if (magazineIssueIdx >= magazineArchive.length) magazineIssueIdx = magazineArchive.length - 1;
    const draw = () => { renderMagazine(magazineArchive[magazineIssueIdx]); renderMagazineIssueNav(); };
    const body = document.getElementById('magazine-body');
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (!dir || !body || !body.animate || reduce || !body.childElementCount) { draw(); return; }
    // simple: the page fades out, the other issue fades in
    body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-out', fill: 'forwards' }).finished.then(() => {
        draw();
        const sc = document.getElementById('magazine-screen'); if (sc) sc.scrollTop = 0;
        body.getAnimations().forEach(a => a.cancel());
        body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-in' });
    }).catch(draw);
}

// ---- CUP section (issue.cup comes from scripts/generate-magazine.mjs) ----
// CUP numbers are shown ONLY here — they are never merged into the league
// table, form guide or all-time league stats.
function cupScoreLine(teams, score) {
    if (!score || !teams || teams.length !== 2) return '';
    const [x, y] = String(score).split('-');
    return `${teamLabel(teams[0])} <b>${escapeHtml(x)}</b> - <b>${escapeHtml(y)}</b> ${teamLabel(teams[1])}`;
}

// The magazine is right-to-left: the FIRST team of a pair is drawn on the RIGHT. A number block that reads
// left-to-right must therefore list the second team's figure first, or every score looks swapped.
function cupLegOnScreen(score) {
    const p = String(score).split('-');
    return p.length === 2 ? `${p[1].trim()}-${p[0].trim()}` : String(score);
}

function renderCupSection(issue) {
    const cup = issue.cup;
    if (!cup || !cup.hasActivity) return '';
    const statusText = {
        finished: 'پایان‌یافته',
        in_progress: 'در جریان',
        all_games_played_awaiting_admin_finish: 'همهٔ بازی‌ها انجام شد'
    }[cup.status] || '';

    const semis = (cup.bracket?.semis || []).map(s => {
        const [a, b] = s.teams || [];
        const legs = (s.legs || []).map(l => `
            <span class="magazine-cup-leg ${l.playedThisWeek ? 'is-new' : ''}">${l.score ? escapeHtml(cupLegOnScreen(l.score)) : '—'}</span>`).join('');
        return `
        <div class="magazine-cup-card">
            <div class="magazine-cup-card-title">نیمه‌نهایی ${s.semi}</div>
            <div class="magazine-cup-series">
                <span class="${s.winner === a ? 'is-winner' : ''}">${teamLabel(a)}</span>
                <b dir="ltr">${s.wins?.[b] ?? 0} - ${s.wins?.[a] ?? 0}</b>
                <span class="${s.winner === b ? 'is-winner' : ''}">${teamLabel(b)}</span>
            </div>
            <div class="magazine-cup-legs" dir="ltr">${legs || '<span class="magazine-form-streak">—</span>'}</div>
        </div>`;
    }).join('');

    const stage = (title, st) => {
        if (!st || !st.played) {
            return `<div class="magazine-cup-card is-pending">
                <div class="magazine-cup-card-title">${title}</div>
                <div class="magazine-cup-pending">هنوز برگزار نشده</div>
            </div>`;
        }
        return `<div class="magazine-cup-card">
            <div class="magazine-cup-card-title">${title}</div>
            <div class="magazine-cup-series">${cupScoreLine(st.teams, st.score) || `${teamLabel(st.winner)} برنده شد`}</div>
            <div class="magazine-cup-winner">🏆 ${teamLabel(st.winner)}</div>
        </div>`;
    };

    const m = cup.medals || {};
    const medals = (m.gold || m.silver || m.bronze) ? `
        <div class="magazine-cup-medals">
            ${m.gold ? `<div>🥇 ${teamLabel(m.gold)}</div>` : ''}
            ${m.silver ? `<div>🥈 ${teamLabel(m.silver)}</div>` : ''}
            ${m.bronze ? `<div>🥉 ${teamLabel(m.bronze)}</div>` : ''}
        </div>` : '';

    const rec = cup.recordsThisWeek || cup.recordsWholeEdition;
    const recCards = rec ? `
        <div class="magazine-stat-grid">
            ${rec.highestScoring ? `<div class="magazine-stat-card">
                <div class="magazine-stat-card-label">پرگل‌ترین بازی CUP</div>
                <div class="magazine-stat-card-value">${escapeHtml(rec.highestScoring.score || '')}</div>
                <div class="magazine-stat-card-sub">${teamLabel(rec.highestScoring.teams?.[0])} - ${teamLabel(rec.highestScoring.teams?.[1])}</div>
            </div>` : ''}
            ${rec.biggestMargin ? `<div class="magazine-stat-card">
                <div class="magazine-stat-card-label">بزرگ‌ترین اختلاف CUP</div>
                <div class="magazine-stat-card-value">${escapeHtml(rec.biggestMargin.score || '')}</div>
                <div class="magazine-stat-card-sub">${teamLabel(rec.biggestMargin.teams?.[0])} - ${teamLabel(rec.biggestMargin.teams?.[1])}</div>
            </div>` : ''}
        </div>` : '';

    const stats = (cup.teamCupStats || []).slice().sort((a, b) => (b.W - a.W) || (b.GD - a.GD)).map(r => `
        <tr><td>${teamLabel(r.team)}</td><td>${r.played}</td><td>${r.W}</td><td>${r.L}</td><td>${r.GF}</td><td>${r.GA}</td></tr>`).join('');

    return `
        <div class="magazine-page magazine-cup">
            <h2 class="magazine-section-title"><i class="fas fa-trophy"></i> CUP — دورهٔ ${cup.edition ?? ''} <span class="magazine-cup-badge">${statusText}</span></h2>
            ${medals}
            <div class="magazine-cup-bracket">
                ${semis}
                ${stage('فینال', cup.bracket?.final)}
                ${stage('رده‌بندی (مقام سوم)', cup.bracket?.thirdPlace)}
            </div>
            ${issue.cupReport ? `<p class="magazine-text">${escapeHtml(issue.cupReport).replace(/\n/g, '<br>')}</p>` : ''}
            ${recCards}
            ${stats ? `
            <table class="magazine-table magazine-cup-table">
                <thead><tr><th>تیم</th><th>بازی</th><th>برد</th><th>باخت</th><th>گل‌زده</th><th>گل‌خورده</th></tr></thead>
                <tbody>${stats}</tbody>
            </table>
            <div class="magazine-cup-note">آمار CUP جدا از آمار لیگ است و در جدول رده‌بندی حساب نمی‌شود.</div>` : ''}
        </div>`;
}

// ---- Season schedule + Super Cup (issue.schedule / issue.superCup come from scripts/generate-magazine.mjs) ----
// The stage list is the same five-stage timetable the app runs (js/flow.js); the phase in
// the issue was derived from real data at generation time, so nothing here is guessed.
// ============================================================
// Rank over the season (arrows in the table + the rank-vs-week chart)
// Newer issues carry `rankHistory` / `rankChanges` (computed by scripts/generate-magazine.mjs). The newest issue of an older
// archive does not, so for that one we work it out from the live match list (same maths: points, then goal difference).
// ============================================================
const MAG_TEAM_COLORS = { Bayern:'#ef4444', HOSI:'#3b82f6', Yellow:'#facc15', Sezar:'#22c55e' };   // Azar red · Mess blue · Nifa yellow · FC Gilas green
const MAG_LINE_HALO = {};
function magFaNum(n) { return String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }
function magComputeRankHistory(matches) {
    const played = (matches || []).filter(m => Number.isFinite(+m.round) && +m.round > 0 && /^\d+-\d+$/.test(String(m.score || '')));
    if (!played.length) return null;
    const rounds = [...new Set(played.map(m => +m.round))].sort((a, b) => a - b);
    const tbl = {}, ranks = {};
    TEAM_NAMES.forEach(t => { tbl[t] = { Pts: 0, GF: 0, GA: 0 }; ranks[t] = []; });
    rounds.forEach(r => {
        played.filter(x => +x.round === r).forEach(m => {
            const [h, a] = String(m.score).split('-').map(Number);
            if (!tbl[m.home] || !tbl[m.away]) return;
            tbl[m.home].GF += h; tbl[m.home].GA += a; tbl[m.away].GF += a; tbl[m.away].GA += h;
            if (h > a) tbl[m.home].Pts += 3; else if (h < a) tbl[m.away].Pts += 3; else { tbl[m.home].Pts += 1; tbl[m.away].Pts += 1; }
        });
        [...TEAM_NAMES].sort((a, b) => tbl[b].Pts - tbl[a].Pts || (tbl[b].GF - tbl[b].GA) - (tbl[a].GF - tbl[a].GA) || tbl[b].GF - tbl[a].GF || TEAM_NAMES.indexOf(a) - TEAM_NAMES.indexOf(b))
            .forEach((t, i) => ranks[t].push(i + 1));
    });
    return { weeks: rounds, ranks };
}
// The newest issue of an older archive has no rank data of its own, so it is worked out from the live match list. That list can still be
// loading the first time the magazine opens — then the chart shows a short "preparing" box (never the old bars) and the page redraws
// itself the moment the matches are in.
let magMatchHistoryPending = false;
function magNeedsMatches(issue) {
    if (issue.rankHistory && issue.rankHistory.weeks && issue.rankHistory.weeks.length) return false;
    const endedFinal = issue.seasonContext && issue.seasonContext.tableRepresents === 'ended_season_final';
    return !endedFinal && magazineArchive[0] === issue && !(typeof matchHistory !== 'undefined' && matchHistory.length);
}
function magEnsureMatchHistory() {
    if (magMatchHistoryPending || typeof loadMatchHistoryFromGitHub !== 'function') return;
    magMatchHistoryPending = true;
    Promise.resolve().then(() => loadMatchHistoryFromGitHub()).catch(() => {}).then(() => {
        magMatchHistoryPending = false;
        const live = document.getElementById('magazine-screen')?.classList.contains('active');
        if (live && typeof matchHistory !== 'undefined' && matchHistory.length) renderCurrentIssue();
    });
}
function magRankHistory(issue) {
    if (issue.rankHistory && issue.rankHistory.weeks && issue.rankHistory.weeks.length) return issue.rankHistory;
    const endedFinal = issue.seasonContext && issue.seasonContext.tableRepresents === 'ended_season_final';
    if (!endedFinal && magazineArchive[0] === issue && typeof matchHistory !== 'undefined' && matchHistory.length) return magComputeRankHistory(matchHistory);
    return null;
}
// → { team: delta } (+ = moved up, − = dropped, 0 = same place) or null when there is no week-to-week data
function magRankDeltas(issue, hist) {
    if (Array.isArray(issue.rankChanges) && issue.rankChanges.length) {
        const o = {}; issue.rankChanges.forEach(r => { if (r.delta != null) o[r.team] = r.delta; });
        return Object.keys(o).length ? o : null;
    }
    if (!hist || hist.weeks.length < 2) return null;
    const last = hist.weeks.length - 1, o = {};
    TEAM_NAMES.forEach(t => { o[t] = hist.ranks[t][last - 1] - hist.ranks[t][last]; });
    return o;
}
function magRankArrow(delta) {
    if (delta == null) return '';
    if (delta > 0) return `<span class="mrk up" title="${magFaNum(delta)} پله صعود"><i></i><b>${magFaNum(delta)}</b></span>`;
    if (delta < 0) return `<span class="mrk down" title="${magFaNum(-delta)} پله سقوط"><i></i><b>${magFaNum(-delta)}</b></span>`;
    return `<span class="mrk same" title="بدون تغییر"><i></i></span>`;
}
function magRankChart(hist) {
    if (!hist || !hist.weeks.length) return '';
    const W = 340, H = 214, L = 30, R = 18, T = 18, B = 34;
    const n = hist.weeks.length;
    const x = i => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1));
    const y = r => T + (r - 1) * (H - T - B) / 3;
    const grid = [1, 2, 3, 4].map(r => `<line class="mrc-grid" x1="${L}" x2="${W - R}" y1="${y(r)}" y2="${y(r)}"/><text class="mrc-ylab" x="${L - 10}" y="${y(r) + 4}">${r}</text>`).join('');
    const xlab = hist.weeks.map((w, i) => `<text class="mrc-xlab" x="${x(i)}" y="${H - 12}">${magFaNum(w)}</text>`).join('');
    const order = [...TEAM_NAMES].sort((a, b) => hist.ranks[b][n - 1] - hist.ranks[a][n - 1]);          // leader drawn last (on top)
    const lines = order.map((t, k) => {
        const col = MAG_TEAM_COLORS[t] || '#64748b', rs = hist.ranks[t];
        const pts = rs.map((r, i) => `${x(i).toFixed(1)},${y(r).toFixed(1)}`);
        const d = 'M' + pts.join(' L');
        const dots = rs.map((r, i) => `<circle class="mrc-dot" cx="${x(i).toFixed(1)}" cy="${y(r).toFixed(1)}" r="${i === n - 1 ? 5.5 : 4}" fill="${col}" style="animation-delay:${400 + k * 120 + i * 90}ms"/>`).join('');
        const halo = MAG_LINE_HALO[t];        // black / dark-green lines get a light outline so they read on the navy panel
        return `<g>${n > 1 ? `${halo ? `<path class="mrc-line mrc-halo" d="${d}" stroke="${halo}" pathLength="1" style="animation-delay:${k * 120}ms"/>` : ''}<path class="mrc-line" d="${d}" stroke="${col}" pathLength="1" style="animation-delay:${k * 120}ms"/>` : ''}${dots}</g>`;
    }).join('');
    const legend = [...TEAM_NAMES].sort((a, b) => hist.ranks[a][n - 1] - hist.ranks[b][n - 1]).map(t => `
        <span class="mrc-leg"><i style="background:${MAG_TEAM_COLORS[t] || '#64748b'}"></i>${teamLabel(t)} <b>${magFaNum(hist.ranks[t][n - 1])}</b></span>`).join('');
    return `
        <div class="mrc-card">
            <div class="mrc-cap"><span>رتبه</span><span>هفته ←</span></div>
            <svg class="mrc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="نمودار رتبهٔ تیم‌ها در طول فصل">${grid}${xlab}${lines}</svg>
            <div class="mrc-legend">${legend}</div>
        </div>`;
}

// ---- interview: no emoji in the text; the reporter has a fixed on-page profile ----
const MAG_REPORTER = { name: 'آرش بهرامی', role: 'خبرنگار ارشد HARFS' };
function magNoEmoji(t) { return String(t == null ? '' : t).replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, '').replace(/\s{2,}/g, ' ').trim(); }

// ---- lineup suggestion per team: the AI's own (issue.lineupSuggestions) when the issue has them, otherwise worked out from the table + form ----
function magLineupSuggestions(issue) {
    if (Array.isArray(issue.lineupSuggestions) && issue.lineupSuggestions.length) return issue.lineupSuggestions;
    const rows = (issue.standingsTable || []).map(t => {
        const p = Math.max(1, t.P || 0);
        const f = (issue.formGuide || []).find(x => x.team === t.name) || {};
        return { team: t.name, P: t.P || 0, GF: t.GF || 0, GA: t.GA || 0, gfp: (t.GF || 0) / p, gap: (t.GA || 0) / p, f };
    });
    const fa = magFaNum, avg = n => fa((Math.round(n * 10) / 10).toString().replace('.', '٫'));
    const left = new Set(rows.map(r => r.team)), out = {};
    const take = (r, formation, idea) => { out[r.team] = { team: r.team, formation, idea }; left.delete(r.team); };
    const pool = () => rows.filter(r => left.has(r.team));
    // 1) best attack keeps attacking, 2) leakiest defence gets a back five, 3) weakest attack gets a creator, 4) the rest stay balanced
    let r = pool().sort((a, b) => b.gfp - a.gfp)[0];
    if (r) take(r, '4-3-3', `بهترین خط حمله (${fa(r.GF)} گل در ${fa(r.P)} بازی)؛ همین فشار بالا و سه‌نفرهٔ جلو را ادامه بدهید.`);
    r = pool().sort((a, b) => b.gap - a.gap)[0];
    if (r) take(r, '5-3-2', `${fa(r.GA)} گل خورده در ${fa(r.P)} بازی (میانگین ${avg(r.gap)})؛ با دفاع پنج‌نفره اول فضاها را ببندید.`);
    r = pool().sort((a, b) => a.gfp - b.gfp)[0];
    if (r) take(r, '4-2-3-1', `فقط ${fa(r.GF)} گل زده‌اید؛ یک هافبک خلاق پشت مهاجم بگذارید تا موقعیت‌ها بیشتر شود.`);
    pool().forEach(x => take(x, '4-4-2', 'ترکیب متعادل: دو خط چهارنفره و دو مهاجم؛ منظم بمانید و از هر فرصت استفاده کنید.'));
    return rows.map(x => out[x.team]);
}

// ---- Next week (end of the magazine): the upcoming league games + a short preview of each ----
function renderNextWeekSection(issue, ranksNow) {
    const s = issue.schedule;
    const hasOutlook = !!(issue.scheduleOutlook && String(issue.scheduleOutlook).trim());
    if (!s || s.status !== 'active') return hasOutlook ? `<div class="magazine-page"><h2 class="magazine-section-title"><i class="fas fa-calendar-days"></i> هفتهٔ آینده</h2><p class="magazine-text">${escapeHtml(issue.scheduleOutlook).replace(/\n/g, '<br>')}</p></div>` : '';
    const mw = s.leagueMatchweek || {};
    const fixtures = s.nextLeagueFixtures || [];
    const previews = issue.fixturePreviews || [];
    const formOf = t => ((issue.formGuide || []).find(f => f.team === t) || {}).form || [];
    const side = t => `
        <div class="mnw-side">
            <img src="${teamLogoUrl(t)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">
            <b>${teamLabel(t)}</b>
            <span class="mnw-rank">${ranksNow[t] ? 'رتبهٔ ' + magFaNum(ranksNow[t]) : ''}</span>
            <span class="mnw-form">${formOf(t).slice(0, 5).reverse().map(r => `<i class="${r}"></i>`).join('')}</span>
        </div>`;
    const cards = fixtures.map((x, i) => {
        const pv = previews.find(p => p.home === x.home && p.away === x.away) || previews[i];
        return `
        <div class="mnw-card" style="--i:${i}">
            <div class="mnw-vs">${side(x.home)}<div class="mnw-vs-mid"><span>VS</span></div>${side(x.away)}</div>
            ${pv && pv.take ? `<p class="mnw-take">${escapeHtml(pv.take)}</p>` : ''}
        </div>`;
    }).join('');
    return `
        <div class="magazine-page magazine-nextweek">
            <h2 class="magazine-section-title"><i class="fas fa-calendar-days"></i> بازی‌های هفتهٔ آینده <span class="magazine-cup-badge">${mw.current ? `هفتهٔ ${magFaNum(mw.current)} از ${magFaNum(mw.total)}` : escapeHtml(s.phaseLabelFa || '')}</span></h2>
            ${cards || `<div class="magazine-cup-note">${escapeHtml(s.nextStepFa || 'این هفته بازی لیگ در برنامه نیست.')}</div>`}
            ${hasOutlook ? `<p class="magazine-text">${escapeHtml(issue.scheduleOutlook).replace(/\n/g, '<br>')}</p>` : ''}
        </div>`;
}

function renderSuperCupSection(issue) {
    const sc = issue.superCup;
    if (!sc || !sc.hasActivity || !sc.result) return '';
    const [a, b] = sc.result.teams || [];
    const [x, y] = String(sc.result.score || '').split('-');
    return `
        <div class="magazine-page magazine-cup">
            <h2 class="magazine-section-title"><i class="fas fa-bolt"></i> سوپرکاپ <span class="magazine-cup-badge">پایان‌یافته</span></h2>
            <div class="magazine-cup-card">
                <div class="magazine-cup-card-title">قهرمان لیگ و قهرمان CUP</div>
                <div class="magazine-cup-series">${teamLabel(a)} <b>${escapeHtml(x)}</b> - <b>${escapeHtml(y)}</b> ${teamLabel(b)}</div>
                <div class="magazine-cup-winner">🏆 ${teamLabel(sc.result.winner)}</div>
            </div>
            ${issue.superCupReport ? `<p class="magazine-text">${escapeHtml(issue.superCupReport).replace(/\n/g, '<br>')}</p>` : ''}
            <div class="magazine-cup-note">سوپرکاپ در جدول لیگ و مدال‌های CUP حساب نمی‌شود.</div>
        </div>`;
}

function renderMagazine(issue) {
    const body = document.getElementById('magazine-body');
    if (!body) return;

    const coverFile = issue.coverImage || DEFAULT_MAGAZINE_COVER;
    const coverUrl = `${GITHUB_IMAGE_BASE_URL}${coverFile}?v=${issue.issueDate}`;
    const defaultCoverUrl = `${GITHUB_IMAGE_BASE_URL}${DEFAULT_MAGAZINE_COVER}?v=${issue.issueDate}`;

    // ---- rank over the season (arrows + chart) ----
    const hist = magRankHistory(issue);
    const deltas = magRankDeltas(issue, hist);
    const ranksNow = {};
    if (hist) TEAM_NAMES.forEach(t => { ranksNow[t] = hist.ranks[t][hist.weeks.length - 1]; });

    // ---- standings (same order as the app's league table: points, then goal difference) ----
    const sortedTable = (issue.standingsTable || []).slice().sort((a, b) => (b.Pts || 0) - (a.Pts || 0) || ((b.GF || 0) - (b.GA || 0)) - ((a.GF || 0) - (a.GA || 0)));
    sortedTable.forEach((t, i) => { if (!ranksNow[t.name]) ranksNow[t.name] = i + 1; });
    const standingsRows = sortedTable.map((t, i) => `
            <tr>
                <td class="mag-rank-cell"><span class="mag-rank-num">${i + 1}</span>${magRankArrow(deltas ? deltas[t.name] : null)}</td>
                <td><span class="mag-team-cell"><img src="${teamLogoUrl(t.name)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">${teamLabel(t.name)}</span></td>
                <td>${t.P ?? '—'}</td>
                <td>${t.W ?? '—'}</td>
                <td>${t.D ?? '—'}</td>
                <td>${t.L ?? '—'}</td>
                <td>${t.Pts ?? '—'}</td>
            </tr>`).join('');

    // ---- title race: rank-vs-week chart (older issues without rank data keep the points bars) ----
    // ---- title race: the rank-vs-week chart ----
    const waitingForMatches = !hist && magNeedsMatches(issue);
    if (waitingForMatches) magEnsureMatchHistory();
    // only the new chart is ever shown; an issue with no rank data (old archive, no live matches) simply has no chart
    const raceVisual = hist ? magRankChart(hist) : (waitingForMatches ? '<div class="mrc-card mrc-wait"><span class="mrc-wait-dot"></span><span class="mrc-wait-dot"></span><span class="mrc-wait-dot"></span></div>' : '');

    // ---- form guide: the streak text sits at the right, so every row's circles line up in one column ----
    const formRows = (issue.formGuide || []).map(f => `
        <div class="magazine-form-row">
            <div class="magazine-form-streak">${f.streakCount > 1 ? `${f.streakCount} ${f.streakType === 'W' ? 'برد' : f.streakType === 'L' ? 'باخت' : 'تساوی'} پیاپی` : ''}</div>
            <div class="magazine-form-team">${teamLabel(f.team)}</div>
            <div class="magazine-form-chips">${(f.form || []).slice().reverse().map(r => `<span class="magazine-form-chip ${r}">${r}</span>`).join('') || '<span class="magazine-form-none">—</span>'}</div>
        </div>`).join('');

    // ---- weekly records ----
    const wr = issue.weeklyRecords;
    const statCards = wr ? `
        <div class="magazine-stat-grid">
            ${wr.highestScoring ? `
            <div class="magazine-stat-card">
                <div class="magazine-stat-card-label">پرگل‌ترین بازی هفته</div>
                <div class="magazine-stat-card-value">${escapeHtml(wr.highestScoring.score)}</div>
                <div class="magazine-stat-card-sub">${teamLabel(wr.highestScoring.home)} - ${teamLabel(wr.highestScoring.away)}</div>
            </div>` : ''}
            ${wr.biggestMargin ? `
            <div class="magazine-stat-card">
                <div class="magazine-stat-card-label">بزرگ‌ترین اختلاف نتیجه</div>
                <div class="magazine-stat-card-value">${escapeHtml(wr.biggestMargin.score)}</div>
                <div class="magazine-stat-card-sub">${teamLabel(wr.biggestMargin.home)} - ${teamLabel(wr.biggestMargin.away)}</div>
            </div>` : ''}
        </div>` : '';

    const spotlights = (issue.playerSpotlights || []).map(s => `
        <div class="magazine-spotlight-card">
            <div class="magazine-spotlight-team">${teamLabel(s.team)}</div>
            <div class="magazine-spotlight-headline">${escapeHtml(s.headline)}</div>
            <div class="magazine-spotlight-note">${escapeHtml(s.note)}</div>
        </div>`).join('');

    const recommendations = (issue.recommendations || []).map(r => `<li>${escapeHtml(r)}</li>`).join('');
    const lineups = magLineupSuggestions(issue).map((l, i) => `
        <div class="mlu-card" style="--i:${i}">
            <div class="mlu-top"><img src="${teamLogoUrl(l.team)}" alt="" draggable="false" onerror="this.style.visibility='hidden'"><b>${teamLabel(l.team)}</b><span class="mlu-form">${escapeHtml(String(l.formation || ''))}</span></div>
            <p>${escapeHtml(l.idea || '')}</p>
        </div>`).join('');

    // ---- interview (fictional, one team per issue): a little scene with bubbles; after a bad week it ends in a walk-out ----
    const iv = issue.interview;
    const qa = (iv && iv.qAndA) || [];
    const interviewSection = iv ? `
        <div class="magazine-page magazine-interview">
            <h2 class="magazine-section-title"><i class="fas fa-microphone"></i> مصاحبهٔ این هفته</h2>
            <div class="mi-people">
                <div class="mi-person">
                    <span class="mi-ava mi-ava-q mi-ava-big"><i class="fas fa-microphone"></i></span>
                    <div><b>${MAG_REPORTER.name}</b><small>${MAG_REPORTER.role}</small></div>
                </div>
                <span class="mi-people-sep">با</span>
                <div class="mi-person">
                    <img class="mi-ava mi-ava-big" src="${teamLogoUrl(iv.team)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">
                    <div><b>${escapeHtml(magNoEmoji(iv.intervieweeName || teamLabel(iv.team)))}</b><small>${escapeHtml(magNoEmoji(iv.intervieweeRole || ''))} · ${teamLabel(iv.team)}</small></div>
                </div>
            </div>
            ${iv.headline ? `<div class="magazine-interview-headline">${escapeHtml(magNoEmoji(iv.headline))}</div>` : ''}
            ${iv.scene ? `<div class="mi-scene">${escapeHtml(magNoEmoji(iv.scene))}</div>` : ''}
            <div class="mi-chat">
                ${qa.map((x, i) => {
                    const last = i === qa.length - 1, angry = !!iv.walkedOut && i >= qa.length - 2;
                    return `
                <div class="mi-row mi-q" style="--i:${i * 2}"><span class="mi-ava mi-ava-q"><i class="fas fa-microphone"></i></span><div class="mi-bubble"><span class="mi-who">${MAG_REPORTER.name}</span>${escapeHtml(magNoEmoji(x.question))}</div></div>
                <div class="mi-row mi-a${angry ? ' angry' : ''}${iv.walkedOut && last ? ' last-angry' : ''}" style="--i:${i * 2 + 1}">
                    <img class="mi-ava" src="${teamLogoUrl(iv.team)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">
                    <div class="mi-bubble">${x.stage ? `<em class="mi-stage">(${escapeHtml(magNoEmoji(String(x.stage).replace(/^\(|\)$/g, '')))})</em>` : ''}${escapeHtml(magNoEmoji(x.answer))}</div>
                </div>`;
                }).join('')}
                ${iv.walkedOut ? `<div class="mi-exit" style="--i:${qa.length * 2}"><span>${escapeHtml(magNoEmoji(iv.exitNote) || 'مصاحبه‌شونده عصبانی شد و جلسه را ترک کرد.')}</span></div>` : ''}
            </div>
        </div>` : '';

    // ---- week type: both | league_only | cup_only | quiet (older issues: undefined = league layout) ----
    const weekType = issue.weekType || 'league_only';
    const cupSection = renderCupSection(issue) + renderSuperCupSection(issue);
    const idleByDesign = !!issue.schedule?.leagueIdleByDesign;
    const leagueIdleNote = (weekType === 'cup_only' || weekType === 'quiet')
        ? (idleByDesign
            ? `<div class="magazine-cup-note">لیگ طبق برنامهٔ فصل (${escapeHtml(issue.schedule.phaseLabelFa || '')}) فعلاً متوقف است؛ جدول زیر وضعیت فعلی لیگ است.</div>`
            : '<div class="magazine-cup-note">این هفته بازی لیگ برگزار نشد؛ جدول زیر وضعیت فعلی لیگ است.</div>') : '';
    const hasCupLayout = !!issue.weekType;

    body.innerHTML = `
        <div class="magazine-hero">
            <img src="${coverUrl}" class="magazine-hero-img" alt="cover" onerror="if(this.src!=='${defaultCoverUrl}'){this.src='${defaultCoverUrl}';}else{this.style.display='none';}">
            <div class="magazine-hero-scrim"></div>
            <div class="magazine-hero-content">
                <h1 class="magazine-title">${escapeHtml(issue.issueTitle)}</h1>
            </div>
        </div>
        <div class="magazine-hero-meta">
            <div class="mhm-top">
                <div class="mhm-id">
                    <div class="magazine-masthead">HARFS WEEKLY</div>
                    <div class="magazine-issue-date">شمارهٔ ${issue.issueNumber ?? ''} · ${jFormatDate(issue.issueDate)}</div>
                </div>
            </div>
            <div class="magazine-subtitle">${escapeHtml(issue.coverSubtitle)}</div>
        </div>

        ${weekType === 'cup_only' ? cupSection : ''}

        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-newspaper"></i> ${hasCupLayout ? 'گزارش لیگ' : 'گزارش هفته'}</h2>
            <p class="magazine-text">${escapeHtml(issue.matchReport).replace(/\n/g, '<br>')}</p>
        </div>

        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-table"></i> ${issue.seasonContext?.tableRepresents === 'ended_season_final' && issue.seasonContext.endedSeasonId ? `جدول نهایی فصل ${issue.seasonContext.endedSeasonId}` : 'جدول رده‌بندی'}</h2>
            <table class="magazine-table">
                <thead><tr><th>#</th><th>تیم</th><th>ب</th><th>برد</th><th>مساوی</th><th>باخت</th><th>امتیاز</th></tr></thead>
                <tbody>${standingsRows}</tbody>
            </table>
            ${leagueIdleNote}
            <p class="magazine-commentary">${escapeHtml(issue.standingsCommentary)}</p>
        </div>

        ${(hist || waitingForMatches || (issue.titleRaceCommentary || '').trim()) ? `
        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-crown"></i> جدال قهرمانی</h2>
            ${raceVisual}
            <p class="magazine-commentary">${escapeHtml(issue.titleRaceCommentary)}</p>
        </div>` : ''}

        ${formRows ? `
        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-chart-line"></i> ${hasCupLayout ? 'فرم لیگ' : 'فرم این هفته'}</h2>
            <div class="magazine-form-grid">${formRows}</div>
        </div>` : ''}

        ${weekType === 'both' ? cupSection : ''}

        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-fire"></i> رکوردها و اتفاق‌های عجیب</h2>
            ${statCards}
            <p class="magazine-text">${escapeHtml(issue.recordsAndOddities).replace(/\n/g, '<br>')}</p>
        </div>

        ${spotlights ? `
        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-star"></i> نکات برجسته</h2>
            <div class="magazine-spotlight-grid">${spotlights}</div>
        </div>` : ''}

        ${interviewSection}

        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-lightbulb"></i> توصیه‌های این هفته</h2>
            <ul class="magazine-recommendations">${recommendations}</ul>
            ${lineups ? `<h3 class="mlu-title"><i class="fas fa-futbol"></i> پیشنهاد ترکیب برای هر تیم</h3><div class="mlu-grid">${lineups}</div>` : ''}
        </div>

        ${renderNextWeekSection(issue, ranksNow)}

        <div class="magazine-page magazine-records-link-wrap">
            <button type="button" class="magazine-records-link" onclick="if(typeof openRecordsSheet==='function')openRecordsSheet()">
                <span class="mrl-ico"><i class="fas fa-medal"></i></span>
                <span class="mrl-txt"><b>رکوردها و آمار کامل لیگ</b><small>بیشترین گل، کلین‌شیت، طولانی‌ترین رشته‌ها و …</small></span>
                <i class="fas fa-chevron-left mrl-arrow"></i>
            </button>
        </div>

        <div class="magazine-page magazine-closing">
            <p>${escapeHtml(issue.funnyClosing)}</p>
        </div>
    `;
    if (typeof magCommentsMount === 'function') magCommentsMount(issue);   // comments section at the very end (js/magazine-comments.js)
}

// ============================================================
// Admin — edit / delete the issue currently being viewed.
// Uses the same GitHub PAT + saveFile() pattern as every other admin
// write in the app (see js/memories.js).
// ============================================================
let magazineEditIdx = null;

// The regular `loadMagazine()` above reads via the fast raw.githubusercontent
// mirror (no sha in the response), so before the first admin write in a
// session we fetch the file's current sha via the GitHub Contents API —
// exactly like every other admin section in this app (see js/memories.js).
async function ensureMagazineArchiveSha() {
    if (magazineArchiveSha) return magazineArchiveSha;
    try {
        const res = await fetch(`${BASE_API}${GITHUB_MAGAZINE_ARCHIVE_FILE}?ref=${GITHUB_LEAGUE_BRANCH}`);
        if (res.ok) { const d = await res.json(); magazineArchiveSha = d.sha; }
    } catch (e) {}
    return magazineArchiveSha;
}

function editMagazineIssue(idx) {
    const issue = magazineArchive[idx];
    if (!issue) return;
    magazineEditIdx = idx;
    document.getElementById('magazine-edit-title').value = issue.issueTitle || '';
    document.getElementById('magazine-edit-subtitle').value = issue.coverSubtitle || '';
    document.getElementById('magazine-edit-standings').value = issue.standingsCommentary || '';
    document.getElementById('magazine-edit-titlerace').value = issue.titleRaceCommentary || '';
    document.getElementById('magazine-edit-report').value = issue.matchReport || '';
    document.getElementById('magazine-edit-records').value = issue.recordsAndOddities || '';
    document.getElementById('magazine-edit-closing').value = issue.funnyClosing || '';
    document.getElementById('magazine-edit-recs').value = (issue.recommendations || []).join('\n');
    document.getElementById('magazine-edit-modal').classList.add('open');
}
function closeMagazineEditModal() {
    document.getElementById('magazine-edit-modal').classList.remove('open');
    magazineEditIdx = null;
}
async function saveMagazineEdit() {
    if (magazineEditIdx === null) return;
    const issue = magazineArchive[magazineEditIdx];
    if (!issue) return;
    await ensureMagazineArchiveSha();
    issue.issueTitle = document.getElementById('magazine-edit-title').value.trim();
    issue.coverSubtitle = document.getElementById('magazine-edit-subtitle').value.trim();
    issue.standingsCommentary = document.getElementById('magazine-edit-standings').value.trim();
    issue.titleRaceCommentary = document.getElementById('magazine-edit-titlerace').value.trim();
    issue.matchReport = document.getElementById('magazine-edit-report').value.trim();
    issue.recordsAndOddities = document.getElementById('magazine-edit-records').value.trim();
    issue.funnyClosing = document.getElementById('magazine-edit-closing').value.trim();
    issue.recommendations = document.getElementById('magazine-edit-recs').value.split('\n').map(s => s.trim()).filter(Boolean);

    const saved = await saveFile(GITHUB_MAGAZINE_ARCHIVE_FILE, magazineArchive, `Edit magazine issue #${issue.issueNumber}`, magazineArchiveSha);
    if (saved) {
        idbSet('magazineArchive', 'v', magazineArchive);
        showToast('مجله ذخیره شد', 'success', 1800);
        closeMagazineEditModal();
        renderCurrentIssue();
    } else {
        showToast('خطا در ذخیره: ' + (lastSaveFileError || 'نامشخص'), 'error', 3000);
    }
}
async function deleteMagazineIssue(idx) {
    const issue = magazineArchive[idx];
    if (!issue) return;
    const ok = await showConfirm({ icon:'🗑️', title:`حذف شمارهٔ ${issue.issueNumber}؟`, message:'این شماره برای همیشه از آرشیو مجله حذف می‌شود و قابل بازگشت نیست.', okLabel:'حذف', okColor:'red' });
    if (!ok) return;
    await ensureMagazineArchiveSha();
    const prevArchive = magazineArchive.slice();
    const updated = magazineArchive.filter((_, i) => i !== idx);
    const saved = await saveFile(GITHUB_MAGAZINE_ARCHIVE_FILE, updated, `Delete magazine issue #${issue.issueNumber}`, magazineArchiveSha);
    if (saved) {
        magazineArchive = updated;
        idbSet('magazineArchive', 'v', magazineArchive);
        magazineIssueIdx = Math.min(idx, magazineArchive.length - 1);
        showToast('شماره حذف شد', 'success', 1800);
        renderCurrentIssue();
    } else {
        magazineArchive = prevArchive;
        showToast('خطا در حذف: ' + (lastSaveFileError || 'نامشخص'), 'error', 3000);
    }
}

// ============================================================
// ADMIN — on-demand generation (Admin Panel → Weekly Magazine)
// ------------------------------------------------------------
// Replaces the old cron-based auto-publish (see .github/workflows/
// weekly-magazine.yml, now workflow_dispatch-only): the admin taps a
// button here, this fires the workflow via GitHub's REST API, then
// polls the run so the admin can watch it build in real time.
//
// IMPORTANT — this needs more than the usual GitHub PAT scope. The
// same GitHub token used everywhere else in this app (the Worker's GITHUB_PAT secret;
// no browser holds a token anymore) only ever needs Contents: Read & write on
// Harfsleague/HARFS_Data. To dispatch and watch a workflow it must
// ALSO have Actions: Read & write (and Contents: Read) on
// Harfsleague/HARFS_League — the code repo the workflow file lives in.
// A fine-grained PAT can cover both repos at once; add HARFS_League to
// it (or make a new one) if the button reports a 403/404 below.
// ============================================================
const MAGAZINE_WORKFLOW_REPO = "Harfsleague/HARFS_League";
const MAGAZINE_WORKFLOW_FILE = "weekly-magazine.yml";
const MAGAZINE_WORKFLOW_BRANCH = "main";
const MAGAZINE_WORKFLOW_API = `https://api.github.com/repos/${MAGAZINE_WORKFLOW_REPO}/actions/workflows/${MAGAZINE_WORKFLOW_FILE}`;
const MAGAZINE_RUNS_API = `https://api.github.com/repos/${MAGAZINE_WORKFLOW_REPO}/actions/runs`;

let magazineGenPolling = false;
let magazineCoverEditIssueIdx = 0;

// Iran no longer observes DST (fixed UTC+3:30 year-round since 2022) — see
// the same note that used to live on the cron in weekly-magazine.yml.
// date.getTime() is already true UTC epoch ms regardless of the visitor's
// own timezone, so no local-offset correction is needed here.
function isFridayInTehran(date = new Date()) {
    const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;
    return new Date(date.getTime() + TEHRAN_OFFSET_MS).getUTCDay() === 5;
}

function ghHeaders(token) {
    return { Authorization: token, Accept: 'application/vnd.github+json' };
}

async function dispatchMagazineWorkflow(token) {
    const res = await fetch(ghProxyUrl(`${MAGAZINE_WORKFLOW_API}/dispatches`), {
        method: 'POST',
        headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: MAGAZINE_WORKFLOW_BRANCH }),
    });
    if (res.status === 204) return;
    let detail = '';
    try { const d = await res.json(); detail = d.message || ''; } catch (e) {}
    if (res.status === 404) throw new Error('404: workflow not found — the Worker GITHUB_PAT needs access to Harfsleague/HARFS_League');
    if (res.status === 403) throw new Error('403: the Worker GITHUB_PAT is missing Actions: Read & write on Harfsleague/HARFS_League');
    throw new Error(`${res.status}${detail ? ': ' + detail : ''}`);
}

// Finds the run our own dispatch just created (the dispatch call itself
// doesn't return a run id) by taking the newest workflow_dispatch run that
// showed up after we asked for one, with a little slack for clock skew.
async function findMagazineRun(token, sinceIso) {
    const res = await fetch(ghProxyUrl(`${MAGAZINE_WORKFLOW_API}/runs?event=workflow_dispatch&per_page=5`), { headers: ghHeaders(token) });
    if (!res.ok) return null;
    const d = await res.json();
    const cutoff = new Date(sinceIso).getTime() - 15000;
    const runs = (d.workflow_runs || []).filter(r => new Date(r.created_at).getTime() >= cutoff);
    return runs[0] || null;
}
async function fetchMagazineRun(token, runId) {
    const res = await fetch(ghProxyUrl(`${MAGAZINE_RUNS_API}/${runId}`), { headers: ghHeaders(token) });
    return res.ok ? res.json() : null;
}
async function fetchMagazineRunJobs(token, runId) {
    const res = await fetch(ghProxyUrl(`${MAGAZINE_RUNS_API}/${runId}/jobs`), { headers: ghHeaders(token) });
    if (!res.ok) return [];
    const d = await res.json();
    return d.jobs || [];
}

function renderMagazineGenProgress(run, jobs) {
    const box = document.getElementById('magazine-gen-status');
    if (!box) return;
    box.style.display = 'block';
    const statusLabel = { queued: 'در صف اجرا', in_progress: 'در حال اجرا', completed: 'تمام شد' }[run.status] || run.status;
    const steps = (jobs[0] && jobs[0].steps) || [];
    const stepsHtml = steps.map(step => {
        const icon = step.status === 'completed'
            ? (step.conclusion === 'success' ? '✅' : (step.conclusion === 'skipped' ? '⏭️' : '❌'))
            : (step.status === 'in_progress' ? '🔄' : '⏳');
        return `<div>${icon} ${escapeHtml(step.name)}</div>`;
    }).join('');
    box.innerHTML = `
        <div style="font-weight:800;margin-bottom:4px;">وضعیت: ${statusLabel}${run.status !== 'completed' ? ' <span class="spinner" style="width:11px;height:11px;display:inline-block;vertical-align:middle;"></span>' : ''}</div>
        ${stepsHtml || '<div style="font-size:0.66rem;color:#6b7280;">در انتظار شروع مراحل...</div>'}
        <a href="${run.html_url}" target="_blank" rel="noopener" style="font-size:0.62rem;color:#93c5fd;display:inline-block;margin-top:6px;">مشاهده لاگ کامل در GitHub ↗</a>
    `;
}

async function generateWeeklyMagazineNow() {
    if (magazineGenPolling) return;
    if (!isFridayInTehran()) { showToast('این گزینه فقط روزهای جمعه فعال است', 'error', 2600); return; }
    const token = ghAuthHeader();
    if (!token) { showToast('ابتدا وارد حساب خودت شو', 'error', 2800); return; }
    if (!confirm('ساخت شمارهٔ جدید مجله (با هوش‌مصنوعی) شروع شود؟ چند دقیقه طول می‌کشد.')) return;

    const btn = document.getElementById('magazine-generate-btn');
    const statusBox = document.getElementById('magazine-gen-status');
    if (btn) btn.disabled = true;
    if (statusBox) { statusBox.style.display = 'block'; statusBox.innerHTML = '<span class="spinner" style="width:11px;height:11px;display:inline-block;vertical-align:middle;"></span> در حال ارسال دستور به GitHub Actions...'; }

    const dispatchedAt = new Date().toISOString();
    try {
        await dispatchMagazineWorkflow(token);
    } catch (err) {
        if (statusBox) statusBox.innerHTML = `<span style="color:#f87171;">خطا در شروع: ${escapeHtml(err.message || 'نامشخص')}</span>`;
        if (btn) btn.disabled = !isFridayInTehran();
        return;
    }

    magazineGenPolling = true;
    let run = null;
    for (let i = 0; i < 12 && !run; i++) {
        await new Promise(r => setTimeout(r, 3000));
        run = await findMagazineRun(token, dispatchedAt);
    }
    if (!run) {
        if (statusBox) statusBox.innerHTML = `<span style="color:#fbbf24;">درخواست ارسال شد، اما پیدا کردن اجرای آن طول کشید. برای پیگیری به تب Actions مخزن HARFS_League سر بزن.</span>`;
        magazineGenPolling = false;
        if (btn) btn.disabled = !isFridayInTehran();
        return;
    }

    let finalRun = run;
    while (finalRun.status !== 'completed') {
        const jobs = await fetchMagazineRunJobs(token, run.id);
        renderMagazineGenProgress(finalRun, jobs);
        await new Promise(r => setTimeout(r, 4000));
        const updated = await fetchMagazineRun(token, run.id);
        if (updated) finalRun = updated;
    }
    renderMagazineGenProgress(finalRun, await fetchMagazineRunJobs(token, run.id));

    magazineGenPolling = false;
    if (btn) btn.disabled = !isFridayInTehran();

    if (finalRun.conclusion === 'success') {
        showToast('مجله جدید ساخته شد ✅', 'success', 2600);
        magazineLoaded = false; // force a fresh fetch next time the archive is read
        await loadMagazine();
        renderMagazineAdminSection();
        if (document.getElementById('magazine-screen')?.classList.contains('active')) renderCurrentIssue();
    } else {
        showToast('ساخت مجله با خطا مواجه شد — لاگ را ببین', 'error', 3200);
    }
}

// Populates the "Weekly Magazine" admin section: last-issue info, the
// Generate button's Friday-only enabled state, and the cover picker below.
function renderMagazineAdminSection() {
    const infoEl = document.getElementById('magazine-admin-info');
    const btn = document.getElementById('magazine-generate-btn');
    const hint = document.getElementById('magazine-generate-hint');
    const friday = isFridayInTehran();
    if (btn) btn.disabled = magazineGenPolling || !friday;
    if (hint) hint.style.display = friday ? 'none' : 'block';
    if (infoEl) {
        infoEl.textContent = magazineArchive.length
            ? `آخرین شماره: #${magazineArchive[0].issueNumber ?? '؟'} — ${jFormatDate(magazineArchive[0].issueDate)}`
            : 'هنوز شماره‌ای منتشر نشده.';
    }
    renderMagazineCoverPicker();
}

// ---- Cover image manager: pick any issue, preview its cover, upload a
// replacement (or a first cover for an issue that fell back to default). ----
function renderMagazineCoverPicker() {
    const sel = document.getElementById('magazine-cover-issue-select');
    if (!sel) return;
    if (!magazineArchive.length) {
        sel.innerHTML = '<option value="">— شماره‌ای وجود ندارد —</option>';
        const preview = document.getElementById('magazine-cover-preview');
        if (preview) preview.style.display = 'none';
        return;
    }
    if (magazineCoverEditIssueIdx >= magazineArchive.length) magazineCoverEditIssueIdx = 0;
    sel.innerHTML = magazineArchive.map((iss, idx) =>
        `<option value="${idx}">شمارهٔ ${iss.issueNumber ?? (magazineArchive.length - idx)} — ${jFormatDate(iss.issueDate)}</option>`
    ).join('');
    sel.value = String(magazineCoverEditIssueIdx);
    updateMagazineCoverPreview();
}
function onMagazineCoverIssueChange() {
    const sel = document.getElementById('magazine-cover-issue-select');
    magazineCoverEditIssueIdx = parseInt(sel && sel.value, 10) || 0;
    updateMagazineCoverPreview();
}
function updateMagazineCoverPreview() {
    const preview = document.getElementById('magazine-cover-preview');
    const issue = magazineArchive[magazineCoverEditIssueIdx];
    if (!preview || !issue) return;
    const coverFile = issue.coverImage || DEFAULT_MAGAZINE_COVER;
    preview.src = `${GITHUB_IMAGE_BASE_URL}${coverFile}?v=${Date.now()}`;
    preview.style.display = 'block';
}

// Commits a file's raw base64 content straight to HARFS_Data — same
// Contents API + PAT as saveFile() above, but for a real binary file
// (a magazine cover .png) instead of a JSON blob. Looks up the file's
// current sha first (in case it already exists, e.g. an AI-generated
// cover being replaced) so the PUT overwrites it instead of failing.
async function saveBinaryFile(path, base64Content, message) {
    const token = ghAuthHeader();
    if (!token) { lastSaveFileError = GH_LOGIN_MSG; return false; }
    let existingSha = null;
    try {
        const shaRes = await fetch(ghProxyUrl(`${BASE_API}${encodeURIComponent(path)}?ref=${GITHUB_LEAGUE_BRANCH}`), { headers: { Authorization: token } });
        if (shaRes.ok) { const d = await shaRes.json(); existingSha = d.sha; }
    } catch (e) {}
    try {
        const res = await fetch(ghProxyUrl(`${BASE_API}${encodeURIComponent(path)}`), {
            method: 'PUT',
            headers: { Authorization: token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, content: base64Content, branch: GITHUB_LEAGUE_BRANCH, ...(existingSha ? { sha: existingSha } : {}) }),
        });
        if (res.ok) return true;
        let msg = `GitHub error ${res.status}`;
        try { const d = await res.json(); if (d && d.message) msg = `${res.status}: ${d.message}`; } catch (e) {}
        lastSaveFileError = msg;
        return false;
    } catch (e) {
        lastSaveFileError = 'Network error — connection dropped mid-upload';
        return false;
    }
}

async function handleMagazineCoverSelect(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const issue = magazineArchive[magazineCoverEditIssueIdx];
    if (!issue) { showToast('ابتدا یک شماره انتخاب کن', 'error', 2200); return; }

    const statusEl = document.getElementById('magazine-cover-upload-status');
    if (statusEl) statusEl.textContent = 'در حال آپلود...';
    try {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = ev => resolve(ev.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        // Widescreen 16:9, the shape of the default cover.
        const compressed = await compressImage(dataUrl, 1280, 720, 0.85);
        const base64Only = compressed.split(',')[1];
        const coverFile = (issue.coverImage && issue.coverImage !== DEFAULT_MAGAZINE_COVER)
            ? issue.coverImage
            : `weekly_magazine_cover_${issue.issueNumber}.png`;

        const uploaded = await saveBinaryFile(coverFile, base64Only, `Admin cover update: issue #${issue.issueNumber}`);
        if (!uploaded) throw new Error(lastSaveFileError || 'خطای نامشخص');

        if (issue.coverImage !== coverFile) {
            issue.coverImage = coverFile;
            await ensureMagazineArchiveSha();
            const savedArchive = await saveFile(GITHUB_MAGAZINE_ARCHIVE_FILE, magazineArchive, `Set cover for issue #${issue.issueNumber}`, magazineArchiveSha);
            if (!savedArchive) throw new Error(lastSaveFileError || 'خطا در ذخیرهٔ آرشیو');
        }

        showToast('عکس مجله بروزرسانی شد ✅', 'success', 2200);
        updateMagazineCoverPreview();
        if (document.getElementById('magazine-screen')?.classList.contains('active')) renderCurrentIssue();
    } catch (err) {
        showToast('خطا در آپلود: ' + (err.message || 'نامشخص'), 'error', 3200);
    } finally {
        if (statusEl) statusEl.textContent = 'تغییر یا آپلود عکس جلد';
    }
}


// ---------------- Hall of Fame → Magazine shortcut: this week's poster + title ----------------
// Cheap peek at the newest issue (cached copy first, then the archive file once) — the full magazine still
// loads only when it is opened.
let magTileDone = false;
function magTileShow(issue){
    const img = document.getElementById('ov-mag-img'), ttl = document.getElementById('ov-mag-title');
    if(!img || !ttl || !issue) return;
    const file = issue.coverImage || DEFAULT_MAGAZINE_COVER;
    const url = `${GITHUB_IMAGE_BASE_URL}${file}?v=${issue.issueDate}`;
    const fallback = `${GITHUB_IMAGE_BASE_URL}${DEFAULT_MAGAZINE_COVER}?v=${issue.issueDate}`;
    if(img.dataset.src !== url){
        img.dataset.src = url; img.classList.remove('loaded');
        img.onload = ()=>img.classList.add('loaded');
        img.onerror = ()=>{ if(img.src !== fallback){ img.src = fallback; } else { img.style.display = 'none'; } };
        img.src = url;
    }
    (ttl.querySelector('.ov-intro-txt') || ttl).textContent = issue.coverSubtitle || issue.issueTitle || 'This week’s issue';   // the magazine's intro line (cut with … when it does not fit)
}
async function magTileInit(){
    if(magTileDone) return; magTileDone = true;
    try{
        const cached = await idbGet('magazineArchive','v');
        if(Array.isArray(cached) && cached.length) magTileShow([...cached].sort((a,b)=>(b.issueNumber||0)-(a.issueNumber||0))[0]);
    }catch(e){}
    if(!navigator.onLine) return;
    try{
        const res = await fetch(`${GITHUB_IMAGE_BASE_URL}${GITHUB_MAGAZINE_FILE}?cachebust=${Date.now()}`);
        if(!res.ok) return;
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data ? [data] : []);
        if(!arr.length) return;
        arr.sort((a,b)=>(b.issueNumber||0)-(a.issueNumber||0));
        magTileShow(arr[0]);
    }catch(e){}
}
setTimeout(magTileInit, 700);


// ---- Reading progress: a blue bar in the header fills from the right as you scroll down the issue (no text, no number) ----
(function magazineReadingProgress(){
    const screen = document.getElementById('magazine-screen'), fill = document.getElementById('mag-progress-fill');
    if(!screen || !fill) return;
    function update(){
        const max = screen.scrollHeight - screen.clientHeight;
        const p = max > 8 ? Math.min(1, Math.max(0, screen.scrollTop / max)) : 0;
        fill.style.transform = `scaleX(${p})`;
        fill.parentNode.classList.toggle('on', p > 0.002 && screen.classList.contains('active'));
    }
    screen.addEventListener('scroll', update, { passive:true });
    window.addEventListener('resize', update);
    const inner = screen.querySelector('.magazine-inner');
    if(window.ResizeObserver && inner) new ResizeObserver(update).observe(inner);   // issue loaded / switched → height changes
    new MutationObserver(update).observe(screen, { attributes:true, attributeFilter:['class'] });   // screen opened again
    update();
})();


// ---- Reading progress: a blue bar in the header fills from the right as you scroll down the issue (no text, no number) ----
(function magazineReadingProgress(){
    const screen = document.getElementById('magazine-screen'), fill = document.getElementById('mag-progress-fill');
    if(!screen || !fill) return;
    function update(){
        const max = screen.scrollHeight - screen.clientHeight;
        const p = max > 8 ? Math.min(1, Math.max(0, screen.scrollTop / max)) : 0;
        fill.style.transform = `scaleX(${p})`;
        fill.parentNode.classList.toggle('on', p > 0.002);
    }
    screen.addEventListener('scroll', update, { passive:true });
    window.addEventListener('resize', update);
    const inner = screen.querySelector('.magazine-inner');
    if(window.ResizeObserver && inner) new ResizeObserver(update).observe(inner);   // issue loaded / switched → height changes
    new MutationObserver(update).observe(screen, { attributes:true, attributeFilter:['class'] });   // screen opened again
    update();
})();
