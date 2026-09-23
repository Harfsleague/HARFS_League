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
        const data = await res.json();
        magazineArchive = Array.isArray(data) ? data : (data ? [data] : []); // tolerate an old single-issue file
        magazineArchive.sort((a, b) => (b.issueNumber || 0) - (a.issueNumber || 0));
        magazineLoaded = true;
        magazineIssueIdx = 0;
        renderCurrentIssue();
    } catch (e) {
        magazineArchive = [];
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
    renderCurrentIssue();
}
function magazineGoOlder() {
    if (magazineIssueIdx >= magazineArchive.length - 1) return;
    haptic([6]);
    magazineIssueIdx++;
    renderCurrentIssue();
}
function magazineJumpTo(idx) {
    haptic([6]);
    magazineIssueIdx = idx;
    renderCurrentIssue();
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
        <button class="magazine-nav-arrow" onclick="magazineGoOlder()" ${atOldest ? 'disabled' : ''} title="شمارهٔ قدیمی‌تر"><i class="fas fa-chevron-left"></i></button>
        <div class="magazine-issue-picker-wrap">
            <button class="magazine-issue-pill" onclick="toggleMagazineIssuePicker()">
                شمارهٔ ${issue.issueNumber ?? (magazineArchive.length - magazineIssueIdx)} <i class="fas fa-caret-down"></i>
            </button>
            <div class="magazine-issue-picker" id="magazine-issue-picker"></div>
        </div>
        <button class="magazine-nav-arrow" onclick="magazineGoNewer()" ${atNewest ? 'disabled' : ''} title="شمارهٔ جدیدتر"><i class="fas fa-chevron-right"></i></button>
        ${isAdmin ? `
        <button class="weird-admin-btn" style="margin-inline-start:auto;" onclick="editMagazineIssue(${magazineIssueIdx})"><i class="fas fa-pen"></i> ادیت</button>
        <button class="weird-admin-btn weird-admin-btn-danger" onclick="deleteMagazineIssue(${magazineIssueIdx})"><i class="fas fa-trash"></i> حذف</button>` : ''}
    `;
}

function renderCurrentIssue() {
    if (!magazineArchive.length) { renderMagazineEmpty(); return; }
    if (magazineIssueIdx < 0) magazineIssueIdx = 0;
    if (magazineIssueIdx >= magazineArchive.length) magazineIssueIdx = magazineArchive.length - 1;
    renderMagazine(magazineArchive[magazineIssueIdx]);
    renderMagazineIssueNav();
}

function renderMagazine(issue) {
    const body = document.getElementById('magazine-body');
    if (!body) return;

    const coverFile = issue.coverImage || null;
    const coverUrl = coverFile ? `${GITHUB_IMAGE_BASE_URL}${coverFile}?v=${issue.issueDate}` : null;

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
    // Rendered as a stacked card per team (not a wide table) so the panel
    // never needs horizontal dragging on a phone — every stat wraps inside
    // its own small block instead of forcing a 12-column row to fit.
    const allTimeCards = (issue.allTimeStats || [])
        .slice()
        .sort((a, b) => (b.leagueTitles - a.leagueTitles) || (b.Pts - a.Pts) || (b.GF - a.GF))
        .map(s => `
            <div class="magazine-alltime-card">
                <div class="magazine-alltime-card-head">${teamLabel(s.team)}</div>
                <div class="magazine-alltime-stats">
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">قهرمانی</span><span class="magazine-alltime-stat-value">${s.leagueTitles ?? 0} 🏆</span></div>
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">مدال MBA</span><span class="magazine-alltime-stat-value">${s.mbaMedals ?? 0} 🥇</span></div>
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">فصل</span><span class="magazine-alltime-stat-value">${s.seasonsPlayed ?? '—'}</span></div>
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">بازی</span><span class="magazine-alltime-stat-value">${s.P ?? '—'}</span></div>
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">برد</span><span class="magazine-alltime-stat-value">${s.W ?? '—'}</span></div>
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">مساوی</span><span class="magazine-alltime-stat-value">${s.D ?? '—'}</span></div>
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">باخت</span><span class="magazine-alltime-stat-value">${s.L ?? '—'}</span></div>
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">گل زده</span><span class="magazine-alltime-stat-value">${s.GF ?? '—'}</span></div>
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">گل خورده</span><span class="magazine-alltime-stat-value">${s.GA ?? '—'}</span></div>
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">تفاضل</span><span class="magazine-alltime-stat-value">${s.GD ?? '—'}</span></div>
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">٪ برد</span><span class="magazine-alltime-stat-value">${s.winRate ?? 0}%</span></div>
                </div>
            </div>`).join('');

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
                <div class="magazine-issue-date">شمارهٔ ${issue.issueNumber ?? ''} · ${jFormatDate(issue.issueDate)}</div>
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

        ${allTimeCards ? `
        <div class="magazine-page">
            <h2 class="magazine-section-title"><i class="fas fa-trophy"></i> آمار کلی تمام فصل‌ها</h2>
            <div class="magazine-alltime-grid">${allTimeCards}</div>
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
    if (!confirm(`شمارهٔ ${issue.issueNumber} حذف شود؟ این کار قابل بازگشت نیست.`)) return;
    await ensureMagazineArchiveSha();
    const prevArchive = magazineArchive.slice();
    const updated = magazineArchive.filter((_, i) => i !== idx);
    const saved = await saveFile(GITHUB_MAGAZINE_ARCHIVE_FILE, updated, `Delete magazine issue #${issue.issueNumber}`, magazineArchiveSha);
    if (saved) {
        magazineArchive = updated;
        magazineIssueIdx = Math.min(idx, magazineArchive.length - 1);
        showToast('شماره حذف شد', 'success', 1800);
        renderCurrentIssue();
    } else {
        magazineArchive = prevArchive;
        showToast('خطا در حذف: ' + (lastSaveFileError || 'نامشخص'), 'error', 3000);
    }
}
