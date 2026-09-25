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
        <button class="magazine-nav-arrow" onclick="magazineGoOlder()" ${atOldest ? 'disabled' : ''} title="شمارهٔ قدیمی‌تر"><i class="fas fa-chevron-right"></i></button>
        <div class="magazine-issue-picker-wrap">
            <button class="magazine-issue-pill" onclick="toggleMagazineIssuePicker()">
                شمارهٔ ${issue.issueNumber ?? (magazineArchive.length - magazineIssueIdx)} <i class="fas fa-caret-down"></i>
            </button>
            <div class="magazine-issue-picker" id="magazine-issue-picker"></div>
        </div>
        <button class="magazine-nav-arrow" onclick="magazineGoNewer()" ${atNewest ? 'disabled' : ''} title="شمارهٔ جدیدتر"><i class="fas fa-chevron-left"></i></button>
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

    const coverFile = issue.coverImage || DEFAULT_MAGAZINE_COVER;
    const coverUrl = `${GITHUB_IMAGE_BASE_URL}${coverFile}?v=${issue.issueDate}`;
    const defaultCoverUrl = `${GITHUB_IMAGE_BASE_URL}${DEFAULT_MAGAZINE_COVER}?v=${issue.issueDate}`;

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
                    <div class="magazine-alltime-stat"><span class="magazine-alltime-stat-label">مدال CUP</span><span class="magazine-alltime-stat-value">${s.mbaMedals ?? 0} 🥇</span></div>
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

    // ---- interview (fictional, one team per issue — see interview.team) ----
    const iv = issue.interview;
    const interviewSection = iv ? `
        <div class="magazine-page magazine-interview">
            <h2 class="magazine-section-title"><i class="fas fa-microphone"></i> مصاحبهٔ این هفته</h2>
            <div class="magazine-interview-head">
                <span class="magazine-interview-team">${teamLabel(iv.team)}</span>
                <span class="magazine-interview-role">${escapeHtml(iv.intervieweeRole || '')} · ${escapeHtml(iv.intervieweeName || '')}</span>
            </div>
            ${iv.headline ? `<div class="magazine-interview-headline">${escapeHtml(iv.headline)}</div>` : ''}
            <div class="magazine-interview-qa">
                ${(iv.qAndA || []).map(qa => `
                <div class="magazine-interview-q">${escapeHtml(qa.question)}</div>
                <div class="magazine-interview-a">${escapeHtml(qa.answer)}</div>`).join('')}
            </div>
            <div class="magazine-interview-disclaimer">این مصاحبه کاملاً خیالی و طنزآمیز است.</div>
        </div>` : '';

    body.innerHTML = `
        <div class="magazine-hero">
            <img src="${coverUrl}" class="magazine-hero-img" alt="cover" onerror="if(this.src!=='${defaultCoverUrl}'){this.src='${defaultCoverUrl}';}else{this.style.display='none';}">
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

        ${interviewSection}

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

// ============================================================
// ADMIN — on-demand generation (Admin Panel → Weekly Magazine)
// ------------------------------------------------------------
// Replaces the old cron-based auto-publish (see .github/workflows/
// weekly-magazine.yml, now workflow_dispatch-only): the admin taps a
// button here, this fires the workflow via GitHub's REST API, then
// polls the run so the admin can watch it build in real time.
//
// IMPORTANT — this needs more than the usual GitHub PAT scope. The
// same device PAT used everywhere else in this app (localStorage
// 'github_pat') only ever needs Contents: Read & write on
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
    return { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };
}

async function dispatchMagazineWorkflow(token) {
    const res = await fetch(`${MAGAZINE_WORKFLOW_API}/dispatches`, {
        method: 'POST',
        headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: MAGAZINE_WORKFLOW_BRANCH }),
    });
    if (res.status === 204) return;
    let detail = '';
    try { const d = await res.json(); detail = d.message || ''; } catch (e) {}
    if (res.status === 404) throw new Error('404: workflow not found — PAT needs access to Harfsleague/HARFS_League');
    if (res.status === 403) throw new Error('403: PAT is missing Actions: Read & write on Harfsleague/HARFS_League');
    throw new Error(`${res.status}${detail ? ': ' + detail : ''}`);
}

// Finds the run our own dispatch just created (the dispatch call itself
// doesn't return a run id) by taking the newest workflow_dispatch run that
// showed up after we asked for one, with a little slack for clock skew.
async function findMagazineRun(token, sinceIso) {
    const res = await fetch(`${MAGAZINE_WORKFLOW_API}/runs?event=workflow_dispatch&per_page=5`, { headers: ghHeaders(token) });
    if (!res.ok) return null;
    const d = await res.json();
    const cutoff = new Date(sinceIso).getTime() - 15000;
    const runs = (d.workflow_runs || []).filter(r => new Date(r.created_at).getTime() >= cutoff);
    return runs[0] || null;
}
async function fetchMagazineRun(token, runId) {
    const res = await fetch(`${MAGAZINE_RUNS_API}/${runId}`, { headers: ghHeaders(token) });
    return res.ok ? res.json() : null;
}
async function fetchMagazineRunJobs(token, runId) {
    const res = await fetch(`${MAGAZINE_RUNS_API}/${runId}/jobs`, { headers: ghHeaders(token) });
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
    const token = localStorage.getItem('github_pat');
    if (!token) { showToast('ابتدا یک GitHub PAT روی این دستگاه تنظیم کن', 'error', 2800); return; }
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
    const token = localStorage.getItem('github_pat');
    if (!token) { lastSaveFileError = 'No GitHub token configured'; return false; }
    let existingSha = null;
    try {
        const shaRes = await fetch(`${BASE_API}${encodeURIComponent(path)}?ref=${GITHUB_LEAGUE_BRANCH}`, { headers: { Authorization: `token ${token}` } });
        if (shaRes.ok) { const d = await shaRes.json(); existingSha = d.sha; }
    } catch (e) {}
    try {
        const res = await fetch(`${BASE_API}${encodeURIComponent(path)}`, {
            method: 'PUT',
            headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
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
        // Widescreen, matches the 16:9 cover the generator asks Gemini for.
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
