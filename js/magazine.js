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

function renderMagazine(issue) {
    const body = document.getElementById('magazine-body');
    if (!body) return;

    const coverUrl = issue.coverImage ? `${GITHUB_IMAGE_BASE_URL}${GITHUB_MAGAZINE_COVER_FILE}?v=${issue.issueDate}` : null;

    const standingsRows = (issue.standingsTable || [])
        .slice()
        .sort((a, b) => (b.Pts || 0) - (a.Pts || 0))
        .map((t, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${TEAM_DISPLAY_NAMES[t.name] || t.name}</td>
                <td>${t.P ?? '—'}</td>
                <td>${t.W ?? '—'}</td>
                <td>${t.D ?? '—'}</td>
                <td>${t.L ?? '—'}</td>
                <td>${t.Pts ?? '—'}</td>
            </tr>`).join('');

    const spotlights = (issue.playerSpotlights || []).map(s => `
        <div class="magazine-spotlight-card">
            <div class="magazine-spotlight-team">${TEAM_DISPLAY_NAMES[s.team] || s.team}</div>
            <div class="magazine-spotlight-headline">${s.headline}</div>
            <div class="magazine-spotlight-note">${s.note}</div>
        </div>`).join('');

    const recommendations = (issue.recommendations || []).map(r => `<li>${r}</li>`).join('');

    body.innerHTML = `
        ${coverUrl ? `<img src="${coverUrl}" class="magazine-cover" alt="cover" onerror="this.style.display='none'">` : ''}
        <div class="magazine-page">
            <div class="magazine-issue-date">شمارهٔ ${jFormatDate(issue.issueDate)}</div>
            <h1 class="magazine-title">${issue.issueTitle || ''}</h1>
            <div class="magazine-subtitle">${issue.coverSubtitle || ''}</div>
        </div>

        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-table"></i> جدول رده‌بندی</h2>
            <table class="magazine-table">
                <thead><tr><th>#</th><th>تیم</th><th>ب</th><th>برد</th><th>مساوی</th><th>باخت</th><th>امتیاز</th></tr></thead>
                <tbody>${standingsRows}</tbody>
            </table>
            <p class="magazine-commentary">${issue.standingsCommentary || ''}</p>
        </div>

        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-newspaper"></i> گزارش هفته</h2>
            <p class="magazine-text">${(issue.matchReport || '').replace(/\n/g, '<br>')}</p>
        </div>

        ${spotlights ? `
        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-star"></i> نکات برجسته</h2>
            <div class="magazine-spotlight-grid">${spotlights}</div>
        </div>` : ''}

        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-lightbulb"></i> توصیه‌های این هفته</h2>
            <ul class="magazine-recommendations">${recommendations}</ul>
        </div>

        <div class="magazine-page magazine-closing">
            <p>${issue.funnyClosing || ''}</p>
        </div>
    `;
}
