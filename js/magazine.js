// ============================================================
// magazine.js  —  Weekly HARFS Magazine viewer
// Replaces the old ai-chat.js panel. Reads the JSON + cover image that
// scripts/generate-magazine.mjs commits to HARFS_Data every Friday
// morning (see .github/workflows/weekly-magazine.yml) and renders it
// as a simple multi-section magazine page.
// ============================================================

const GITHUB_MAGAZINE_FILE = "weekly_magazine.json";
const GITHUB_MAGAZINE_COVER_FILE = "weekly_magazine_cover.png";

let magazineIssue = null;
let magazineLoaded = false;

function openMagazinePanel() {
    haptic([8]);
    navigate('magazine');
    if (!magazineLoaded) loadMagazine();
}

function closeMagazinePanel() {
    navigate('main-league');
}

async function loadMagazine() {
    const body = document.getElementById('magazine-body');
    const loading = document.getElementById('magazine-loading');
    if (loading) loading.style.display = 'flex';
    if (body) body.innerHTML = '';

    try {
        const res = await fetch(`${GITHUB_IMAGE_BASE_URL}${GITHUB_MAGAZINE_FILE}?cachebust=${Date.now()}`);
        if (!res.ok) throw new Error('not found');
        magazineIssue = await res.json();
        magazineLoaded = true;
        renderMagazine(magazineIssue);
    } catch (e) {
        renderMagazineEmpty();
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
            <p class="magazine-empty-sub">مجله هر جمعه ساعت ۹ صبح به‌صورت خودکار منتشر می‌شود.</p>
        </div>`;
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

function renderMagazine(issue) {
    const body = document.getElementById('magazine-body');
    if (!body) return;

    const coverUrl = issue.coverImage ? `${GITHUB_IMAGE_BASE_URL}${GITHUB_MAGAZINE_COVER_FILE}?v=${issue.issueDate}` : null;

    // ---- standings ----
    const standingsRows = (issue.standingsTable || [])
        .slice()
        .sort((a, b) => (b.Pts || 0) - (a.Pts || 0))
        .map((t, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${teamLabel(t.name)}</td>
                <td>${t.P ?? '—'}</td>
                <td>${t.W ?? '—'}</td>
                <td>${t.D ?? '—'}</td>
                <td>${t.L ?? '—'}</td>
                <td>${t.Pts ?? '—'}</td>
            </tr>`).join('');

    // ---- title race ----
    const gaps = issue.titleRace?.gaps || [];
    const maxGap = Math.max(1, ...gaps.map(g => g.gapToLeader || 0));
    const raceRows = gaps.map(g => `
        <div class="magazine-race-row">
            <div class="magazine-race-team">${teamLabel(g.team)}</div>
            <div class="magazine-race-bar-track"><div class="magazine-race-bar-fill" style="width:${100 - Math.round((g.gapToLeader || 0) / maxGap * 90)}%"></div></div>
            <div class="magazine-race-pts">${g.pts ?? '—'}</div>
        </div>`).join('');

    // ---- form guide ----
    const formRows = (issue.formGuide || []).map(f => `
        <div class="magazine-form-row">
            <div class="magazine-form-team">${teamLabel(f.team)}</div>
            <div class="magazine-form-chips">${(f.form || []).slice().reverse().map(r => `<span class="magazine-form-chip ${r}">${r}</span>`).join('') || '<span class="magazine-form-streak">—</span>'}</div>
            <div class="magazine-form-streak">${f.streakCount > 1 ? `${f.streakCount} ${f.streakType === 'W' ? 'برد' : f.streakType === 'L' ? 'باخت' : 'تساوی'} پیاپی` : ''}</div>
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

    // ---- all-time cross-season stats ----
    const allTimeRows = (issue.allTimeStats || [])
        .slice()
        .sort((a, b) => (b.leagueTitles - a.leagueTitles) || (b.Pts - a.Pts) || (b.GF - a.GF))
        .map(s => `
            <tr>
                <td>${teamLabel(s.team)}</td>
                <td>${s.leagueTitles ?? 0} 🏆</td>
                <td>${s.mbaMedals ?? 0} 🥇</td>
                <td>${s.seasonsPlayed ?? '—'}</td>
                <td>${s.P ?? '—'}</td>
                <td>${s.W ?? '—'}</td>
                <td>${s.D ?? '—'}</td>
                <td>${s.L ?? '—'}</td>
                <td>${s.GF ?? '—'}</td>
                <td>${s.GA ?? '—'}</td>
                <td>${s.GD ?? '—'}</td>
                <td>${s.winRate ?? 0}%</td>
            </tr>`).join('');

    const spotlights = (issue.playerSpotlights || []).map(s => `
        <div class="magazine-spotlight-card">
            <div class="magazine-spotlight-team">${teamLabel(s.team)}</div>
            <div class="magazine-spotlight-headline">${escapeHtml(s.headline)}</div>
            <div class="magazine-spotlight-note">${escapeHtml(s.note)}</div>
        </div>`).join('');

    const recommendations = (issue.recommendations || []).map(r => `<li>${escapeHtml(r)}</li>`).join('');

    body.innerHTML = `
        <div class="magazine-hero">
            ${coverUrl ? `<img src="${coverUrl}" class="magazine-hero-img" alt="cover" onerror="this.style.display='none'">` : ''}
            <div class="magazine-hero-scrim"></div>
            <div class="magazine-hero-content">
                <div class="magazine-masthead">HARFS WEEKLY</div>
                <div class="magazine-issue-date">شمارهٔ ${jFormatDate(issue.issueDate)}</div>
                <h1 class="magazine-title">${escapeHtml(issue.issueTitle)}</h1>
                <div class="magazine-subtitle">${escapeHtml(issue.coverSubtitle)}</div>
            </div>
        </div>

        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-table"></i> جدول رده‌بندی</h2>
            <table class="magazine-table">
                <thead><tr><th>#</th><th>تیم</th><th>ب</th><th>برد</th><th>مساوی</th><th>باخت</th><th>امتیاز</th></tr></thead>
                <tbody>${standingsRows}</tbody>
            </table>
            <p class="magazine-commentary">${escapeHtml(issue.standingsCommentary)}</p>
        </div>

        ${gaps.length ? `
        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-crown"></i> جدال قهرمانی</h2>
            ${raceRows}
            <p class="magazine-commentary">${escapeHtml(issue.titleRaceCommentary)}</p>
        </div>` : ''}

        ${formRows ? `
        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-chart-line"></i> فرم این هفته</h2>
            <div class="magazine-form-grid">${formRows}</div>
        </div>` : ''}

        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-newspaper"></i> گزارش هفته</h2>
            <p class="magazine-text">${escapeHtml(issue.matchReport).replace(/\n/g, '<br>')}</p>
        </div>

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

        ${allTimeRows ? `
        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-trophy"></i> آمار کلی تمام فصل‌ها</h2>
            <div class="magazine-table-scroll">
                <table class="magazine-table">
                    <thead><tr><th>تیم</th><th>قهرمانی</th><th>مدال</th><th>فصل</th><th>ب</th><th>برد</th><th>مساوی</th><th>باخت</th><th>گل زده</th><th>گل خورده</th><th>تفاضل</th><th>٪ برد</th></tr></thead>
                    <tbody>${allTimeRows}</tbody>
                </table>
            </div>
        </div>` : ''}

        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-lightbulb"></i> توصیه‌های این هفته</h2>
            <ul class="magazine-recommendations">${recommendations}</ul>
        </div>

        <div class="magazine-page magazine-closing">
            <p>${escapeHtml(issue.funnyClosing)}</p>
        </div>
    `;
}
