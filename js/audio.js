// ============================================================
// audio.js  —  AUDIO — playlist system
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// AUDIO — PLAYLIST SYSTEM (auto-loaded from GitHub music folder)
// ============================================================

// Just drop mp3/m4a/wav files into this repository folder,
//    the app auto-reads the list and plays them — no need to type file names.
const MUSIC_FOLDER = "music"; // path of the music folder inside the repository
const MUSIC_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/${MUSIC_FOLDER}?ref=${GITHUB_LEAGUE_BRANCH}`;
const MUSIC_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_LEAGUE_BRANCH}/${MUSIC_FOLDER}/`;
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.ogg', '.aac'];

// Fallback track used only if the music folder can't be reached (e.g. empty/offline)
const FALLBACK_TRACK = { title: "HARFS Theme", src: "https://raw.githubusercontent.com/Harfsleague/HARFS_Data/main/HARFS_background.mp3" };

let PLAYLIST = [];
let playlistLoadPromise = null;

// Turns a filename like "01 - Night Drive (Remix).mp3" into a clean display title
function filenameToTitle(filename) {
    let name = filename.replace(/\.[^/.]+$/, '');      // strip extension
    name = name.replace(/^\d+[\s._\-]*/, '');           // strip leading track numbers like "01 - "
    name = name.replace(/[_]+/g, ' ');                  // underscores → spaces
    name = name.replace(/\s+/g, ' ').trim();             // collapse spaces
    return name || filename;
}

// Offline-first: shows the last-known playlist immediately from
// IndexedDB, tries to refresh it from GitHub, and — once online — makes
// sure exactly one track (the current first track) is fully cached as a
// Blob so at least something can play with zero connection. Only one
// track is ever kept cached at a time, by design (see ensureOfflineTrackCached).
async function loadPlaylistFromGitHub() {
    if (playlistLoadPromise) return playlistLoadPromise;
    playlistLoadPromise = (async () => {
        const cachedList = await idbGet('playlist','v');
        if (cachedList && cachedList.length) PLAYLIST = cachedList;
        if (!navigator.onLine) {
            setSyncStatus('offline');
            if (!PLAYLIST.length) PLAYLIST = [FALLBACK_TRACK];
            return PLAYLIST;
        }
        try {
            const res = await fetch(MUSIC_API_URL);
            if (!res.ok) throw new Error('music folder not found');
            const items = await res.json();
            const tracks = (Array.isArray(items) ? items : [])
                .filter(it => it.type === 'file' && AUDIO_EXTENSIONS.some(ext => it.name.toLowerCase().endsWith(ext)))
                .map(it => ({ title: filenameToTitle(it.name), src: MUSIC_RAW_BASE + encodeURIComponent(it.name) }));
            PLAYLIST = tracks.length ? tracks : [FALLBACK_TRACK];
            await idbSet('playlist','v', PLAYLIST);
        } catch (e) {
            PLAYLIST = (cachedList && cachedList.length) ? cachedList : [FALLBACK_TRACK];
        }
        if (PLAYLIST.length) ensureOfflineTrackCached();
        return PLAYLIST;
    })();
    return playlistLoadPromise;
}

// Finds the most RECENTLY UPLOADED track in the music folder (not just
// whatever GitHub's directory listing happens to return first — that
// listing is alphabetical, not chronological, so PLAYLIST[0] was often an
// old track rather than the newest one). Uses the repo's commit history for
// the music folder: the latest commit that touched it, and whichever audio
// file that commit actually added. Falls back to null on any failure so the
// caller can fall back to a reasonable default instead.
async function getLastUploadedTrack(){
    try{
        const commitsRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?path=${MUSIC_FOLDER}&per_page=1&sha=${GITHUB_LEAGUE_BRANCH}`);
        if(!commitsRes.ok) return null;
        const commits = await commitsRes.json();
        if(!Array.isArray(commits) || !commits.length || !commits[0].url) return null;
        const commitRes = await fetch(commits[0].url);
        if(!commitRes.ok) return null;
        const commitData = await commitRes.json();
        const addedFile = (commitData.files||[]).find(f=>
            f.filename.startsWith(MUSIC_FOLDER+'/') &&
            (f.status==='added'||f.status==='modified') &&
            AUDIO_EXTENSIONS.some(ext=>f.filename.toLowerCase().endsWith(ext))
        );
        if(!addedFile) return null;
        const name = addedFile.filename.slice(MUSIC_FOLDER.length+1);
        const src = MUSIC_RAW_BASE + encodeURIComponent(name);
        return PLAYLIST.find(t=>t.src===src) || { title: filenameToTitle(name), src };
    }catch(e){ return null; }
}

// Keeps exactly ONE track fully downloaded (as a Blob in IndexedDB) for
// offline playback — the most recently uploaded track, so the offline
// fallback stays current as new songs are added. If that lookup fails for
// any reason, falls back to the last item in the playlist rather than the
// first, since folder listings are alphabetical and track files are
// typically numbered, so the last one is usually the newest addition.
// The offline song is "EURO 2008" whenever it is in the playlist (matched by title or file name); only if it is missing does the old rule
// (newest upload) apply.
const OFFLINE_DEFAULT_RE = /euro[\s._-]*2008/i;
function findOfflineDefaultTrack(){
    return PLAYLIST.find(t => OFFLINE_DEFAULT_RE.test(t.title || '') || OFFLINE_DEFAULT_RE.test(decodeURIComponent(String(t.src || '').split('/').pop()))) || null;
}
async function ensureOfflineTrackCached(){
    if (!PLAYLIST.length || !navigator.onLine) return;
    try{
        const existing = await idbGet('offlineTrack','v');
        const pref = findOfflineDefaultTrack();
        // Fast path: EURO 2008 is already the cached one; or (no EURO 2008 in the playlist) the cached track is still in the playlist and we already checked commits this session, so skip the 2 unauthenticated GitHub /commits API calls.
        if (existing && existing.blob && existing.blob.size > 0 && PLAYLIST.some(t => t.src === existing.src)) {
            if (pref) { if (existing.src === pref.src) return; }
            else if (sessionStorage.getItem('harfs_offline_track_checked') === '1') return;
        }
        const target = pref || (await getLastUploadedTrack()) || PLAYLIST[PLAYLIST.length-1] || PLAYLIST[0];
        sessionStorage.setItem('harfs_offline_track_checked', '1');
        if (!target) return;
        if (existing && existing.src === target.src && existing.blob && existing.blob.size > 0) return; // already cached
        const res = await fetch(target.src);
        if (!res.ok) return;
        const blob = await res.blob();
        if (!blob || !blob.size) return; // guard against caching an empty/broken response as if it were valid
        await idbSet('offlineTrack','v', { title: target.title, src: target.src, blob });
    }catch(e){ /* best-effort — a failed cache attempt just means no offline track this session */ }
}

let currentTrackIndex = 0;
let backgroundMusicStarted = false;

const bgMusic = document.getElementById('background-music');

function showSongNotification(title) {
    showToast(title, 'music', 3000);
}

// ---- music memory --------------------------------------------------------
// The last track that started playing is remembered on this device (by its URL, so
// adding/removing songs never points at the wrong one). Combined with the saved
// playback mode ('playbackMode' in appearance.js):
//   shuffle    → every visit starts on a random track
//   single     → (Repeat One) the same song as last time keeps playing
//   sequential → continues with the song you left on
const LAST_TRACK_KEY = 'lastTrackSrc';
function saveLastTrack(track){
    try{ if(track && track.src) localStorage.setItem(LAST_TRACK_KEY, track.src); }catch(e){}
}
function pickStartTrackIndex(){
    const random = () => Math.floor(Math.random() * PLAYLIST.length);
    let mode = 'shuffle';
    try{ mode = localStorage.getItem('playbackMode') || ((typeof playbackMode!=='undefined') ? playbackMode : 'shuffle'); }catch(e){}
    if (mode === 'shuffle') return random();
    let saved = null;
    try{ saved = localStorage.getItem(LAST_TRACK_KEY); }catch(e){}
    const idx = saved ? PLAYLIST.findIndex(t => t.src === saved) : -1;
    return idx >= 0 ? idx : random();
}

function playTrack(index) {
    if (!bgMusic || PLAYLIST.length === 0) return;
    currentTrackIndex = ((index % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
    const track = PLAYLIST[currentTrackIndex];
    saveLastTrack(track);
    playTrackWithFallback(track.src, track.title);
}
// Plays the requested track's normal (raw GitHub) URL when online; when
// offline — or if that fetch fails mid-way — falls back to whatever
// single track is cached as a Blob in IndexedDB (see
// ensureOfflineTrackCached), so music never just goes silent offline.
async function playTrackWithFallback(src, title){
    if (!bgMusic) return;
    bgMusic.volume = (typeof getMusicVolume === 'function') ? getMusicVolume() : 0.15;
    window.nowPlayingTitle = title; // read by the Settings music player
    document.dispatchEvent(new Event('harfs-track'));
    const playOffline = async () => {
        const offline = await idbGet('offlineTrack','v');
        if (offline && offline.blob) {
            bgMusic.src = URL.createObjectURL(offline.blob);
            window.nowPlayingTitle = offline.title + ' (offline)';
            document.dispatchEvent(new Event('harfs-track'));
            bgMusic.play().then(() => showSongNotification(offline.title + ' (offline)')).catch(() => {});
            return true;
        }
        return false;
    };
    if (!navigator.onLine) { await playOffline(); return; }
    bgMusic.src = src;
    bgMusic.play()
        .then(() => {
            showSongNotification(title);
            if(document.getElementById('playlist-sheet')?.classList.contains('open'))renderPlaylistSheet();
        })
        .catch(async () => { await playOffline(); });
}

function playNextTrack() {
    playTrack(currentTrackIndex + 1);
}

function playPrevTrack() {
    playTrack(currentTrackIndex - 1);
}

// When a song ends, decide what plays next based on the chosen playback mode
if (bgMusic) {
    bgMusic.addEventListener('ended', () => {
        if (PLAYLIST.length <= 1) {
            playTrack(0);
            return;
        }
        if (playbackMode === 'single') {
            playTrack(currentTrackIndex);
        } else if (playbackMode === 'sequential') {
            playNextTrack();
        } else {
            // shuffle — pick a new random track (not the same one)
            let next;
            do { next = Math.floor(Math.random() * PLAYLIST.length); }
            while (next === currentTrackIndex);
            playTrack(next);
        }
    });
}

async function initAudio() {
    if (!backgroundMusicStarted && bgMusic) {
        backgroundMusicStarted = true;
        removeAudioListeners();
        // Load (and cache an offline track from) the playlist on first
        // interaction regardless of mute state — previously this only ran
        // when unmuted, so anyone who had music muted never got an offline
        // track cached at all, and offline playback had nothing to fall
        // back to later even after unmuting.
        await loadPlaylistFromGitHub();
        if (!musicMuted) {
            // Starting track follows the saved playback mode (random for Shuffle, the remembered song otherwise)
            playTrack(pickStartTrackIndex());
        }
    }
}
function removeAudioListeners() {
    document.removeEventListener('click', initAudio);
    document.removeEventListener('touchstart', initAudio);
}
document.addEventListener('click', initAudio);
document.addEventListener('touchstart', initAudio, {passive: true});

// (swipe handling is merged into setupLogoInteractions above)


// ============================================================
// HARFS MUSIC PLAYER — Benyamin Bahadori & Community Library
// ============================================================
const MUSIC_META_FILE = 'music_meta.json';
const MUSIC_META_LS_KEY = 'harfs_music_meta_v1';

const BENYAMIN_ALBUMS = [
    { id:'benyamin-85',      year:'1385 · 2006', fa:'آلبوم ۸۵',       en:'Album 85',         es:'Álbum 85',       subFa:'خاطره‌ها، عشق احساسه، آدم آهنی',  subEn:'Khatereha, Eshgh Ehsaseh',     grad:'linear-gradient(135deg,#f59e0b,#b45309)' },
    { id:'benyamin-88',      year:'1388 · 2009', fa:'آلبوم ۸۸',       en:'Album 88',         es:'Álbum 88',       subFa:'کجای دنیایی، شناسنامه، لیلی در پاییز', subEn:'Kojaye Donyayi, Shenasnameh', grad:'linear-gradient(135deg,#ef4444,#991b1b)' },
    { id:'benyamin-93',      year:'1392 · 2014', fa:'آلبوم ۹۳',       en:'Album 93',         es:'Álbum 93',       subFa:'قهوه، هفته عشق، مدار',            subEn:'Ghahveh, Hafteye Eshgh',       grad:'linear-gradient(135deg,#3b82f6,#1d4ed8)' },
    { id:'benyamin-94',      year:'1394 · 2015', fa:'آلبوم ۹۴',       en:'Album 94',         es:'Álbum 94',       subFa:'عشق داغ من، تظاهر، حوای من',      subEn:'Eshghe Daghe Man, Tazahor',    grad:'linear-gradient(135deg,#10b981,#047857)' },
    { id:'benyamin-tl',      year:'1398 · 2019', fa:'آلبوم تی‌ال',     en:'Album TL',         es:'Álbum TL',       subFa:'تنظیم‌های مدرن و قطعات ویژه',     subEn:'TL Studio Collection',         grad:'linear-gradient(135deg,#8b5cf6,#5b21b6)' },
    { id:'benyamin-mah',     year:'ویژه محرم',    fa:'ماه مهربون',     en:'Mahe Mehraboon',   es:'Mahe Mehraboon', subFa:'آلبوم عاشورایی و ماندگار',         subEn:'Special Spiritual Album',      grad:'linear-gradient(135deg,#64748b,#1e293b)' },
    { id:'benyamin-singles', year:'2006 – 2025', fa:'تک‌آهنگ‌ها',      en:'Singles',          es:'Sencillos',      subFa:'جهنم، پیرهن، رفیق، لالایی‌هامون', subEn:'Jahannam, Pirhan, Rafigh',     grad:'linear-gradient(135deg,#ec4899,#9d174d)' },
];

const MP_STRINGS = {
    en: {
        title:'HARFS Music', upload:'Upload', selectSong:'Select a song to play', homeSub:'Benyamin Bahadori & Community',
        tabBenyamin:'Benyamin Bahadori', tabCommunity:'Community', tabAll:'All',
        search:'Search song or artist...', benyaminHeroTitle:'Benyamin Bahadori', benyaminHeroSub:'Mr. Love · Official Albums & Singles',
        playAll:'Play All', addBenyamin:'Add Track', addToAlbum:'Add song to this album', tracks:'tracks', track:'track',
        allAlbums:'All Albums', emptyAlbum:'No songs uploaded in this album yet. Be the first to add one!',
        emptyCommunity:'No community songs yet. Upload your favorite track!', emptySearch:'No matching songs found.',
        allUsers:'All Users', uploadedBy:'Uploaded by', upHeading:'Upload Song', upFile:'Tap to choose an audio file (MP3, M4A, WAV, OGG)',
        upTitle:'Song Title', upSection:'Section', upAlbum:'Benyamin Album', upArtist:'Artist', upSubmit:'Upload to Music Library',
        secBenyamin:'Benyamin Bahadori', secCommunity:'Community (User Picks)', uploading:'Uploading...',
        delConfirm:'Delete this song from the music library?'
    },
    fa: {
        title:'موزیک هرفس', upload:'آپلود', selectSong:'یک آهنگ برای پخش انتخاب کن', homeSub:'بنیامین بهادری و انتخاب کاربران',
        tabBenyamin:'بنیامین بهادری', tabCommunity:'کاربران', tabAll:'همه',
        search:'جستجوی آهنگ یا خواننده...', benyaminHeroTitle:'بنیامین بهادری', benyaminHeroSub:'آقای عشق · آلبوم‌ها و تک‌آهنگ‌های رسمی',
        playAll:'پخش همه', addBenyamin:'افزودن آهنگ', addToAlbum:'افزودن آهنگ به این آلبوم', tracks:'آهنگ', track:'آهنگ',
        allAlbums:'همه آلبوم‌ها', emptyAlbum:'هنوز آهنگی در این آلبوم آپلود نشده؛ اولین نفر باش!',
        emptyCommunity:'هنوز آهنگی توسط کاربران آپلود نشده. آهنگ مورد علاقه‌ات را آپلود کن!', emptySearch:'آهنگی با این نام پیدا نشد.',
        allUsers:'همه کاربران', uploadedBy:'آپلود توسط', upHeading:'آپلود آهنگ جدید', upFile:'برای انتخاب فایل صوتی لمس کن (MP3, M4A, WAV, OGG)',
        upTitle:'نام آهنگ', upSection:'بخش', upAlbum:'آلبوم بنیامین', upArtist:'خواننده', upSubmit:'آپلود در کتابخانه موزیک',
        secBenyamin:'بنیامین بهادری', secCommunity:'انتخاب کاربران (عمومی)', uploading:'در حال آپلود...',
        delConfirm:'این آهنگ از کتابخانه موزیک حذف شود؟'
    },
    es: {
        title:'HARFS Música', upload:'Subir', selectSong:'Elige una canción', homeSub:'Benyamin Bahadori y Comunidad',
        tabBenyamin:'Benyamin Bahadori', tabCommunity:'Comunidad', tabAll:'Todas',
        search:'Buscar canción o artista...', benyaminHeroTitle:'Benyamin Bahadori', benyaminHeroSub:'Álbumes oficiales y sencillos',
        playAll:'Reproducir todo', addBenyamin:'Añadir canción', addToAlbum:'Añadir canción a este álbum', tracks:'canciones', track:'canción',
        allAlbums:'Todos los álbumes', emptyAlbum:'Aún no hay canciones en este álbum. ¡Sé el primero en subir una!',
        emptyCommunity:'Aún no hay canciones de la comunidad. ¡Sube tu favorita!', emptySearch:'No se encontraron canciones.',
        allUsers:'Todos', uploadedBy:'Subido por', upHeading:'Subir canción', upFile:'Toca para elegir un archivo de audio (MP3, M4A, WAV, OGG)',
        upTitle:'Título', upSection:'Sección', upAlbum:'Álbum de Benyamin', upArtist:'Artista', upSubmit:'Subir a la biblioteca',
        secBenyamin:'Benyamin Bahadori', secCommunity:'Comunidad', uploading:'Subiendo...',
        delConfirm:'¿Eliminar esta canción de la biblioteca?'
    }
};

function mpLang(){
    const l = (typeof getAppLanguage === 'function') ? getAppLanguage() : 'en';
    return MP_STRINGS[l] ? l : 'en';
}
function mpT(k){ return (MP_STRINGS[mpLang()] || MP_STRINGS.en)[k] || MP_STRINGS.en[k] || k; }

let musicMeta = { v:1, tracks:{} }; // tracks[filename] = { title, artist, section:'benyamin'|'community', albumId, uploader, ts }
let musicMetaSha = null;
let mpTab = 'benyamin';
let mpSelectedAlbum = 'all';
let mpSelectedUploader = 'all';
let mpSearchQuery = '';
let mpUploadPickedFile = null;
let mpQueue = [];

function mpTrackReactId(filename){
    // Deterministic safe string key compatible with reactions.js & Worker /reactions
    let h = 5381;
    const s = String(filename || '');
    for(let i=0;i<s.length;i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'mus_' + h.toString(36);
}

function mpGuessBenyaminInfo(filename, title){
    const raw = (String(filename||'') + ' ' + String(title||'')).toLowerCase();
    const isBen = /benyamin|بنیامین|بنيامين/.test(raw);
    if(!isBen) return null;
    if(/(^|[^0-9])85([^0-9]|$)|۸۵/.test(raw)) return 'benyamin-85';
    if(/(^|[^0-9])88([^0-9]|$)|۸۸/.test(raw)) return 'benyamin-88';
    if(/(^|[^0-9])93([^0-9]|$)|۹۳/.test(raw)) return 'benyamin-93';
    if(/(^|[^0-9])94([^0-9]|$)|۹۴/.test(raw)) return 'benyamin-94';
    if(/(^|[^a-z])tl([^a-z]|$)|تی‌ال|تی ال/.test(raw)) return 'benyamin-tl';
    if(/mah|mehrab|ماه\s*مهرب|محرم/.test(raw)) return 'benyamin-mah';
    return 'benyamin-singles';
}

function mpExtractFilename(src){
    try{ return decodeURIComponent(String(src || '').split('/').pop().split('?')[0]); }
    catch(e){ return String(src || '').split('/').pop(); }
}

function mpGetEnrichedTracks(){
    const metaMap = (musicMeta && musicMeta.tracks) || {};
    const list = (PLAYLIST || []).filter(t => t && t.src && t.src !== FALLBACK_TRACK.src).map(t => {
        const file = mpExtractFilename(t.src);
        const m = metaMap[file] || {};
        const guessedAlbum = !m.section ? mpGuessBenyaminInfo(file, m.title || t.title) : null;
        const section = m.section || (guessedAlbum ? 'benyamin' : 'community');
        const albumId = section === 'benyamin' ? (m.albumId || guessedAlbum || 'benyamin-singles') : null;
        return {
            file,
            src: t.src,
            title: (m.title && m.title.trim()) || t.title || filenameToTitle(file),
            artist: (m.artist && m.artist.trim()) || (section === 'benyamin' ? (mpLang()==='fa' ? 'بنیامین بهادری' : 'Benyamin Bahadori') : ''),
            section,
            albumId,
            uploader: m.uploader || null,
            ts: m.ts || 0,
            reactId: mpTrackReactId(file)
        };
    });
    // Sort newest uploads first, keeping alphabetical tie-break
    return list.sort((a,b) => (b.ts - a.ts) || a.title.localeCompare(b.title));
}

function mpLoadMetaCache(){
    try{
        const raw = localStorage.getItem(MUSIC_META_LS_KEY);
        if(raw){
            const parsed = JSON.parse(raw);
            if(parsed && typeof parsed === 'object' && parsed.tracks) musicMeta = parsed;
        }
    }catch(e){}
}
mpLoadMetaCache();

async function loadMusicMetaFromGitHub(){
    mpLoadMetaCache();
    if(!navigator.onLine) return musicMeta;
    try{
        const j = await ghFetchJson(MUSIC_META_FILE, { maxAgeMs: 25000 });
        if(j.ok && j.data && typeof j.data === 'object'){
            musicMetaSha = j.sha;
            musicMeta = j.data.tracks ? j.data : { v:1, tracks:{} };
            try{ localStorage.setItem(MUSIC_META_LS_KEY, JSON.stringify(musicMeta)); }catch(e){}
        }
    }catch(e){}
    return musicMeta;
}

async function saveMusicMetaToGitHub(msg){
    try{ localStorage.setItem(MUSIC_META_LS_KEY, JSON.stringify(musicMeta)); }catch(e){}
    if(typeof saveFile === 'function'){
        const ok = await saveFile(MUSIC_META_FILE, musicMeta, msg || 'Update music metadata', musicMetaSha);
        if(ok){
            const fresh = await ghFetchJson(MUSIC_META_FILE, { bust:true }).catch(()=>null);
            if(fresh && fresh.ok) musicMetaSha = fresh.sha;
        }
        return ok;
    }
    return false;
}

function openMusicPage(){
    if(typeof musicPanelEnabled !== 'undefined' && !musicPanelEnabled) return;
    navigate('music');
}

async function onMusicPageEntered(){
    mpApplyStaticLabels();
    renderMusicPage();
    mpSyncPlayerUI();
    if(typeof loadMomentReactions === 'function') loadMomentReactions().then(()=>{ if(document.getElementById('music-screen')?.classList.contains('active')) renderMusicPage(); });
    await Promise.all([
        loadPlaylistFromGitHub(),
        loadMusicMetaFromGitHub(),
    ]);
    renderMusicPage();
    mpSyncPlayerUI();
}

function mpApplyStaticLabels(){
    const set = (id, k)=>{ const el=document.getElementById(id); if(el) el.textContent = mpT(k); };
    set('mp-header-title','title');
    set('mp-upload-btn-lbl','upload');
    set('mp-tab-benyamin','tabBenyamin');
    set('mp-tab-community','tabCommunity');
    set('mp-tab-all','tabAll');
    const srch = document.getElementById('mp-search'); if(srch) srch.placeholder = mpT('search');
    set('mp-up-title-lbl','upTitle');
    set('mp-up-section-lbl','upSection');
    set('mp-up-album-lbl','upAlbum');
    set('mp-up-artist-lbl','upArtist');
    set('mp-up-submit-lbl','upSubmit');
    const secSel = document.getElementById('mp-up-section');
    if(secSel && secSel.options.length >= 2){
        secSel.options[0].textContent = mpT('secBenyamin');
        secSel.options[1].textContent = mpT('secCommunity');
    }
    const h = document.getElementById('mp-up-heading');
    if(h) h.innerHTML = `<i class="fas fa-cloud-arrow-up"></i> ${escapeHtml(mpT('upHeading'))}`;
}

function mpSetTab(tab){
    mpTab = tab;
    document.querySelectorAll('#mp-tabs .mp-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    renderMusicPage();
}

function mpSelectAlbum(albumId){
    mpSelectedAlbum = (mpSelectedAlbum === albumId && albumId !== 'all') ? 'all' : albumId;
    renderMusicPage();
}

function mpSelectUploader(team){
    mpSelectedUploader = team;
    renderMusicPage();
}

function mpOnSearch(q){
    mpSearchQuery = String(q || '').trim().toLowerCase();
    renderMusicPage();
}

function mpAlbumLabel(albumId){
    const a = BENYAMIN_ALBUMS.find(x => x.id === albumId);
    if(!a) return '';
    const l = mpLang();
    return l === 'fa' ? a.fa : (l === 'es' ? a.es : a.en);
}

function mpRenderTrackCard(t, idxInQueue){
    const activeSrc = bgMusic && bgMusic.src ? decodeURIComponent(bgMusic.src) : '';
    const isCurrent = activeSrc && (activeSrc === decodeURIComponent(t.src) || activeSrc.endsWith('/' + t.file));
    const isPlaying = isCurrent && bgMusic && !bgMusic.paused;
    const uploaderName = t.uploader ? (TEAM_DISPLAY_NAMES[t.uploader] || t.uploader) : '';
    const uploaderHtml = t.uploader
        ? `<span class="mp-uploader-chip"><img src="${teamLogoUrl(t.uploader)}" alt="" onerror="this.style.opacity='0.3'"><span>${escapeHtml(uploaderName)}</span></span>`
        : '';
    const albumChip = t.albumId ? `<span class="mp-album-tag">${escapeHtml(mpAlbumLabel(t.albumId))}</span>` : '';
    const canDel = loggedInTeam && (harfsIsAdmin || loggedInTeam === 'Bayern' || (t.uploader && t.uploader === loggedInTeam));
    const delBtn = canDel ? `<button type="button" class="mp-track-del" onclick="event.stopPropagation();mpDeleteTrack(${JSON.stringify(t.file).replace(/"/g,'&quot;')})" title="Delete"><i class="fas fa-trash-can"></i></button>` : '';
    const reactHtml = (typeof reactionRowHtml === 'function')
        ? `<div class="react-row mp-react-row" id="react-row-${escapeHtml(t.reactId)}">${reactionRowHtml(t.reactId)}</div>`
        : '';

    return `
        <div class="mp-track-card${isCurrent?' is-current':''}${isPlaying?' is-playing':''}">
            <div class="mp-track-main" onclick="mpPlayFromQueue(${idxInQueue})">
                <div class="mp-track-play-ic">
                    ${isPlaying
                        ? '<div class="mp-eq-mini"><i></i><i></i><i></i></div>'
                        : `<i class="fas fa-${isCurrent?'pause':'play'}"></i>`}
                </div>
                <div class="mp-track-info">
                    <div class="mp-track-title" dir="auto">${escapeHtml(t.title)}</div>
                    <div class="mp-track-meta">
                        ${t.artist ? `<span class="mp-track-artist" dir="auto">${escapeHtml(t.artist)}</span>` : ''}
                        ${albumChip}
                        ${uploaderHtml}
                    </div>
                </div>
                ${delBtn}
            </div>
            ${reactHtml}
        </div>`;
}

function renderMusicPage(){
    const body = document.getElementById('mp-body');
    if(!body) return;
    mpApplyStaticLabels();
    const allTracks = mpGetEnrichedTracks();
    const l = mpLang();
    const q = mpSearchQuery;
    const matchSearch = t => !q || (t.title||'').toLowerCase().includes(q) || (t.artist||'').toLowerCase().includes(q) || (t.file||'').toLowerCase().includes(q) || (t.uploader && (TEAM_DISPLAY_NAMES[t.uploader]||t.uploader).toLowerCase().includes(q));

    if(mpTab === 'benyamin'){
        const benAll = allTracks.filter(t => t.section === 'benyamin');
        const albumCounts = {};
        BENYAMIN_ALBUMS.forEach(a => { albumCounts[a.id] = benAll.filter(t => t.albumId === a.id).length; });
        const filtered = benAll.filter(t => (mpSelectedAlbum === 'all' || t.albumId === mpSelectedAlbum) && matchSearch(t));
        mpQueue = filtered;

        const albumsHtml = BENYAMIN_ALBUMS.map(a => {
            const name = l === 'fa' ? a.fa : (l === 'es' ? a.es : a.en);
            const sub = l === 'fa' ? a.subFa : a.subEn;
            const cnt = albumCounts[a.id] || 0;
            const active = mpSelectedAlbum === a.id ? ' active' : '';
            return `
                <button type="button" class="mp-album-card${active}" onclick="mpSelectAlbum('${a.id}')">
                    <div class="mp-album-art" style="background:${a.grad};">
                        <span class="mp-album-yr">${escapeHtml(a.year)}</span>
                        <i class="fas fa-compact-disc"></i>
                        <span class="mp-album-cnt">${cnt}</span>
                    </div>
                    <div class="mp-album-name" dir="auto">${escapeHtml(name)}</div>
                    <div class="mp-album-sub" dir="auto">${escapeHtml(sub)}</div>
                </button>`;
        }).join('');

        const activeAlbumObj = BENYAMIN_ALBUMS.find(a => a.id === mpSelectedAlbum);
        const listHeading = activeAlbumObj
            ? `${l==='fa'?activeAlbumObj.fa:(l==='es'?activeAlbumObj.es:activeAlbumObj.en)} (${filtered.length})`
            : `${mpT('allAlbums')} (${filtered.length})`;

        body.innerHTML = `
            <div class="mp-ben-hero">
                <div class="mp-ben-badge"><i class="fas fa-crown"></i> FEATURED ARTIST</div>
                <div class="mp-ben-name" dir="auto">${escapeHtml(mpT('benyaminHeroTitle'))}</div>
                <div class="mp-ben-sub" dir="auto">${escapeHtml(mpT('benyaminHeroSub'))}</div>
                <div class="mp-ben-actions">
                    <button type="button" class="mp-ben-btn primary" onclick="mpPlayBenyaminAll()"><i class="fas fa-play"></i> ${escapeHtml(mpT('playAll'))} (${benAll.length})</button>
                    <button type="button" class="mp-ben-btn" onclick="openMusicUploadModal('benyamin', '${mpSelectedAlbum==='all'?'benyamin-85':mpSelectedAlbum}')"><i class="fas fa-plus"></i> ${escapeHtml(mpT('addBenyamin'))}</button>
                </div>
            </div>
            <div class="mp-albums-grid">${albumsHtml}</div>
            <div class="mp-sec-head">
                <span dir="auto">${escapeHtml(listHeading)}</span>
                ${mpSelectedAlbum !== 'all' ? `<button type="button" class="mp-link-btn" onclick="mpSelectAlbum('all')">${escapeHtml(mpT('allAlbums'))}</button>` : ''}
            </div>
            ${filtered.length
                ? `<div class="mp-track-list">${filtered.map((t,i)=>mpRenderTrackCard(t,i)).join('')}</div>`
                : `<div class="mp-empty">
                    <i class="fas fa-record-vinyl"></i>
                    <p dir="auto">${escapeHtml(q ? mpT('emptySearch') : mpT('emptyAlbum'))}</p>
                    <button type="button" class="mp-ben-btn primary" onclick="openMusicUploadModal('benyamin', '${mpSelectedAlbum==='all'?'benyamin-85':mpSelectedAlbum}')"><i class="fas fa-cloud-arrow-up"></i> ${escapeHtml(mpT('addToAlbum'))}</button>
                   </div>`}`;
        return;
    }

    if(mpTab === 'community'){
        const commAll = allTracks.filter(t => t.section !== 'benyamin');
        const uploaders = [...new Set(commAll.map(t => t.uploader).filter(Boolean))];
        const filtered = commAll.filter(t => (mpSelectedUploader === 'all' || t.uploader === mpSelectedUploader) && matchSearch(t));
        mpQueue = filtered;

        const filterRow = uploaders.length ? `
            <div class="mp-filter-chips">
                <button type="button" class="mp-fchip${mpSelectedUploader==='all'?' active':''}" onclick="mpSelectUploader('all')">${escapeHtml(mpT('allUsers'))}</button>
                ${uploaders.map(u=>`<button type="button" class="mp-fchip${mpSelectedUploader===u?' active':''}" onclick="mpSelectUploader('${u}')"><img src="${teamLogoUrl(u)}" alt=""><span>${escapeHtml(TEAM_DISPLAY_NAMES[u]||u)}</span></button>`).join('')}
            </div>` : '';

        body.innerHTML = `
            ${filterRow}
            ${filtered.length
                ? `<div class="mp-track-list">${filtered.map((t,i)=>mpRenderTrackCard(t,i)).join('')}</div>`
                : `<div class="mp-empty">
                    <i class="fas fa-music"></i>
                    <p dir="auto">${escapeHtml(q ? mpT('emptySearch') : mpT('emptyCommunity'))}</p>
                    <button type="button" class="mp-ben-btn primary" onclick="openMusicUploadModal('community')"><i class="fas fa-cloud-arrow-up"></i> ${escapeHtml(mpT('upload'))}</button>
                   </div>`}`;
        return;
    }

    // Tab: All
    const filtered = allTracks.filter(matchSearch);
    mpQueue = filtered;
    body.innerHTML = filtered.length
        ? `<div class="mp-track-list">${filtered.map((t,i)=>mpRenderTrackCard(t,i)).join('')}</div>`
        : `<div class="mp-empty"><i class="fas fa-music"></i><p dir="auto">${escapeHtml(q ? mpT('emptySearch') : mpT('emptyCommunity'))}</p></div>`;
}

function mpPlayFromQueue(idx){
    const t = mpQueue[idx];
    if(!t) return;
    // Toggle pause if tapping the currently playing track
    const activeSrc = bgMusic && bgMusic.src ? decodeURIComponent(bgMusic.src) : '';
    if(activeSrc && (activeSrc === decodeURIComponent(t.src) || activeSrc.endsWith('/' + t.file))){
        mpTogglePlay();
        return;
    }
    const pIdx = PLAYLIST.findIndex(x => x.src === t.src);
    if(pIdx >= 0) currentTrackIndex = pIdx;
    backgroundMusicStarted = true;
    musicMuted = false;
    saveLastTrack(t);
    window.mpActiveTrack = t;
    playTrackWithFallback(t.src, t.title);
    mpSyncPlayerUI();
    renderMusicPage();
}

function mpPlayBenyaminAll(){
    const benAll = mpGetEnrichedTracks().filter(t => t.section === 'benyamin');
    if(!benAll.length){ openMusicUploadModal('benyamin', 'benyamin-85'); return; }
    mpQueue = benAll;
    mpPlayFromQueue(0);
}

function mpTogglePlay(){
    if(!bgMusic) return;
    if(!bgMusic.src || bgMusic.src === location.href){
        if(mpQueue.length) { mpPlayFromQueue(0); return; }
        if(PLAYLIST.length) { playTrack(currentTrackIndex || 0); return; }
        return;
    }
    if(bgMusic.paused){
        musicMuted = false;
        bgMusic.play().catch(()=>{});
    } else {
        bgMusic.pause();
    }
    mpSyncPlayerUI();
}

function mpNext(){
    if(mpQueue.length){
        const cur = mpFindCurrentInQueue();
        mpPlayFromQueue((cur + 1) % mpQueue.length);
    } else {
        playNextTrack();
    }
}

function mpPrev(){
    if(mpQueue.length){
        const cur = mpFindCurrentInQueue();
        mpPlayFromQueue((cur - 1 + mpQueue.length) % mpQueue.length);
    } else {
        playPrevTrack();
    }
}

function mpFindCurrentInQueue(){
    if(!bgMusic || !bgMusic.src) return -1;
    const cur = decodeURIComponent(bgMusic.src);
    return mpQueue.findIndex(t => cur === decodeURIComponent(t.src) || cur.endsWith('/' + t.file));
}

function mpCycleMode(){
    const order = ['shuffle','sequential','single'];
    const cur = (typeof playbackMode !== 'undefined' && playbackMode) ? playbackMode : 'shuffle';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    if(typeof playbackMode !== 'undefined') playbackMode = next;
    try{ localStorage.setItem('playbackMode', next); }catch(e){}
    mpSyncPlayerUI();
    showToast(next === 'shuffle' ? 'Shuffle' : next === 'single' ? 'Repeat One' : 'Sequential', 'info', 1400);
}

function mpToggleMute(){
    if(!bgMusic) return;
    bgMusic.muted = !bgMusic.muted;
    mpSyncPlayerUI();
}

function mpFmtTime(sec){
    if(!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

function mpSyncPlayerUI(){
    const playing = !!(bgMusic && bgMusic.src && !bgMusic.paused);
    const activeFile = bgMusic && bgMusic.src ? mpExtractFilename(bgMusic.src) : '';
    const enriched = mpGetEnrichedTracks().find(t => t.file === activeFile) || window.mpActiveTrack || null;
    const title = (enriched && enriched.title) || window.nowPlayingTitle || mpT('selectSong');
    const artist = (enriched && enriched.artist) || (enriched && enriched.uploader ? (TEAM_DISPLAY_NAMES[enriched.uploader]||enriched.uploader) : mpT('homeSub'));
    const badge = enriched
        ? (enriched.section === 'benyamin' ? (mpAlbumLabel(enriched.albumId) || mpT('tabBenyamin')) : (enriched.uploader ? `${mpT('uploadedBy')} ${TEAM_DISPLAY_NAMES[enriched.uploader]||enriched.uploader}` : mpT('tabCommunity')))
        : 'HARFS MUSIC';

    const tEl = document.getElementById('mp-now-title'); if(tEl) tEl.textContent = title;
    const aEl = document.getElementById('mp-now-artist'); if(aEl) aEl.textContent = artist;
    const bEl = document.getElementById('mp-now-badge'); if(bEl) bEl.textContent = badge;
    const disc = document.getElementById('mp-disc'); if(disc) disc.classList.toggle('spinning', playing);
    const playBtn = document.getElementById('mp-play-btn');
    if(playBtn) playBtn.innerHTML = `<i class="fas fa-${playing?'pause':'play'}"></i>`;
    const muteBtn = document.getElementById('mp-mute-btn');
    if(muteBtn) muteBtn.innerHTML = `<i class="fas fa-volume-${(bgMusic && bgMusic.muted)?'xmark':'high'}"></i>`;
    const modeBtn = document.getElementById('mp-mode-btn');
    if(modeBtn){
        const m = (typeof playbackMode !== 'undefined' && playbackMode) ? playbackMode : 'shuffle';
        modeBtn.innerHTML = m === 'single' ? '<i class="fas fa-repeat"></i><b class="mp-mode-1">1</b>' : (m === 'sequential' ? '<i class="fas fa-repeat"></i>' : '<i class="fas fa-shuffle"></i>');
    }
    const vol = document.getElementById('hmp-vol');
    if(vol && bgMusic) vol.value = Math.round((bgMusic.volume || 0) * 100);
    updateHomeMusicTile();
}

function updateHomeMusicTile(){
    const playing = !!(bgMusic && bgMusic.src && !bgMusic.paused);
    const eq = document.getElementById('ov-music-eq');
    if(eq) eq.classList.toggle('playing', playing);
    const titleEl = document.getElementById('ov-music-title');
    const subEl = document.getElementById('ov-music-sub');
    if(titleEl) titleEl.textContent = (window.nowPlayingTitle && bgMusic && bgMusic.src) ? window.nowPlayingTitle : mpT('title');
    if(subEl) subEl.textContent = mpT('homeSub');
}

// Wire audio progress, seek bar, volume slider & track events
if(bgMusic){
    bgMusic.addEventListener('timeupdate', ()=>{
        const seek = document.getElementById('hmp-seek');
        const cur = document.getElementById('mp-time-cur');
        const dur = document.getElementById('mp-time-dur');
        if(cur) cur.textContent = mpFmtTime(bgMusic.currentTime);
        if(dur) dur.textContent = mpFmtTime(bgMusic.duration);
        if(seek && isFinite(bgMusic.duration) && bgMusic.duration > 0){
            seek.value = (bgMusic.currentTime / bgMusic.duration) * 100;
        }
    });
    ['play','pause','ended','loadedmetadata'].forEach(ev => bgMusic.addEventListener(ev, ()=>{
        mpSyncPlayerUI();
        if(document.getElementById('music-screen')?.classList.contains('active')) renderMusicPage();
    }));
}
document.addEventListener('harfs-track', mpSyncPlayerUI);
document.addEventListener('DOMContentLoaded', ()=>{
    const seek = document.getElementById('hmp-seek');
    if(seek) seek.addEventListener('input', ()=>{
        if(bgMusic && isFinite(bgMusic.duration) && bgMusic.duration > 0){
            bgMusic.currentTime = (Number(seek.value) / 100) * bgMusic.duration;
        }
    });
    const vol = document.getElementById('hmp-vol');
    if(vol) vol.addEventListener('input', ()=>{
        const v = Math.max(0, Math.min(1, Number(vol.value) / 100));
        if(bgMusic){ bgMusic.volume = v; bgMusic.muted = false; }
        try{ localStorage.setItem('musicVolume', String(v)); }catch(e){}
        mpSyncPlayerUI();
    });
    updateHomeMusicTile();
});

// ---- Upload Modal (open for any logged-in user) ----
function openMusicUploadModal(defaultSection, defaultAlbum){
    if(!loggedInTeam || !harfsSessionToken){
        showToast(GH_LOGIN_MSG, 'info', 2400);
        return;
    }
    mpApplyStaticLabels();
    mpUploadPickedFile = null;
    const fIn = document.getElementById('mp-up-file'); if(fIn) fIn.value = '';
    const fLbl = document.getElementById('mp-up-file-label'); if(fLbl) fLbl.textContent = mpT('upFile');
    const tIn = document.getElementById('mp-up-title'); if(tIn) tIn.value = '';
    const sec = document.getElementById('mp-up-section');
    if(sec) sec.value = defaultSection || (mpTab === 'community' ? 'community' : 'benyamin');
    const alb = document.getElementById('mp-up-album');
    if(alb && defaultAlbum) alb.value = defaultAlbum;
    const aIn = document.getElementById('mp-up-artist');
    if(aIn) aIn.value = (sec && sec.value === 'benyamin') ? (mpLang()==='fa' ? 'بنیامین بهادری' : 'Benyamin Bahadori') : '';
    const prog = document.getElementById('mp-up-prog'); if(prog) prog.style.display = 'none';
    mpOnUploadSectionChange();
    const ov = document.getElementById('music-upload-modal');
    if(ov){ ov.hidden = false; ov.classList.add('open'); }
}
function closeMusicUploadModal(){
    const ov = document.getElementById('music-upload-modal');
    if(ov){ ov.classList.remove('open'); ov.hidden = true; }
}
function mpOnUploadSectionChange(){
    const sec = document.getElementById('mp-up-section')?.value || 'benyamin';
    const wrap = document.getElementById('mp-up-album-wrap');
    if(wrap) wrap.style.display = sec === 'benyamin' ? '' : 'none';
    const aIn = document.getElementById('mp-up-artist');
    if(aIn && sec === 'benyamin' && !aIn.value.trim()) aIn.value = mpLang()==='fa' ? 'بنیامین بهادری' : 'Benyamin Bahadori';
}
function mpOnUploadFilePicked(input){
    const f = input.files && input.files[0];
    if(!f) return;
    if(!AUDIO_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext))){
        showToast(f.name + ' is not a supported audio file', 'error', 2600);
        input.value = '';
        return;
    }
    mpUploadPickedFile = f;
    const fLbl = document.getElementById('mp-up-file-label');
    if(fLbl) fLbl.textContent = `${f.name} (${typeof formatBytes==='function' ? formatBytes(f.size) : Math.round(f.size/1024)+' KB'})`;
    const tIn = document.getElementById('mp-up-title');
    if(tIn && !tIn.value.trim()) tIn.value = filenameToTitle(f.name);
}
async function mpSubmitUpload(){
    if(!mpUploadPickedFile){ showToast('Choose an audio file first', 'info', 2200); return; }
    const token = ghAuthHeader();
    if(!token){ showToast(GH_LOGIN_MSG, 'error', 2400); return; }
    const title = (document.getElementById('mp-up-title')?.value || '').trim() || filenameToTitle(mpUploadPickedFile.name);
    const section = document.getElementById('mp-up-section')?.value || 'community';
    const albumId = section === 'benyamin' ? (document.getElementById('mp-up-album')?.value || 'benyamin-singles') : null;
    const artist = (document.getElementById('mp-up-artist')?.value || '').trim() || (section === 'benyamin' ? 'بنیامین بهادری' : '');

    const extMatch = mpUploadPickedFile.name.match(/\.[^/.]+$/);
    const ext = extMatch ? extMatch[0].toLowerCase() : '.mp3';
    const safeBase = title.replace(/[\\/:*?"<>|#%]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) || ('track_' + Date.now());
    const prefix = section === 'benyamin' ? 'Benyamin - ' : '';
    let finalName = (prefix && !/^benyamin|بنیامین/i.test(safeBase) ? prefix : '') + safeBase + ext;
    const existingNames = new Set((PLAYLIST || []).map(t => mpExtractFilename(t.src)));
    if(existingNames.has(finalName)) finalName = finalName.replace(ext, ` (${Date.now().toString().slice(-4)})${ext}`);

    const btn = document.getElementById('mp-up-submit');
    const prog = document.getElementById('mp-up-prog');
    const fill = document.getElementById('mp-up-prog-fill');
    const pctEl = document.getElementById('mp-up-prog-pct');
    const txtEl = document.getElementById('mp-up-prog-txt');
    if(btn) btn.disabled = true;
    if(prog) prog.style.display = 'block';
    if(txtEl) txtEl.textContent = mpT('uploading');
    if(fill) fill.style.width = '0%';
    if(pctEl) pctEl.textContent = '0%';

    try{
        const base64 = await fileToBase64(mpUploadPickedFile);
        const ok = await uploadMusicFile(finalName, base64, frac => {
            const p = Math.round(frac * 100);
            if(fill) fill.style.width = p + '%';
            if(pctEl) pctEl.textContent = p + '%';
        });
        if(!ok){
            const err = lastSaveFileError || 'Upload failed';
            if(/403|forbidden|permission/i.test(err)){
                showToast('Upload blocked by Worker permissions — allow music/ writes for signed-in users', 'error', 4200);
            } else {
                showToast('Upload failed: ' + err, 'error', 3400);
            }
            return;
        }
        if(!musicMeta || !musicMeta.tracks) musicMeta = { v:1, tracks:{} };
        musicMeta.tracks[finalName] = { title, artist, section, albumId, uploader: loggedInTeam, ts: Date.now() };
        await saveMusicMetaToGitHub('Add music metadata: ' + title);
        const newSrc = MUSIC_RAW_BASE + encodeURIComponent(finalName);
        if(!PLAYLIST.some(x => x.src === newSrc)) PLAYLIST.push({ title, src: newSrc });
        await idbSet('playlist', 'v', PLAYLIST);
        showToast(title + ' uploaded!', 'success', 2400);
        closeMusicUploadModal();
        mpTab = section;
        if(albumId) mpSelectedAlbum = albumId;
        mpSetTab(section);
    }catch(e){
        showToast('Upload error: ' + (e.message || 'failed'), 'error', 3200);
    }finally{
        if(btn) btn.disabled = false;
    }
}

async function mpDeleteTrack(filename){
    const okConfirm = await showConfirm({
        icon:'🗑️', title: filenameToTitle(filename),
        message: mpT('delConfirm'), okLabel:'Delete', okColor:'red'
    });
    if(!okConfirm) return;
    try{
        const token = ghAuthHeader();
        const res = await fetch(ghProxyUrl(MUSIC_API_URL + '&_t=' + Date.now()), token ? { headers:{ Authorization: token } } : {});
        const items = res.ok ? await res.json() : [];
        const match = (Array.isArray(items) ? items : []).find(it => it.name === filename);
        if(!match || !match.sha){ showToast('Track file not found on GitHub', 'error', 2400); return; }
        const ok = await deleteMusicFile(filename, match.sha);
        if(!ok){ showToast('Delete failed: ' + (lastSaveFileError || 'error'), 'error', 3000); return; }
        if(musicMeta && musicMeta.tracks && musicMeta.tracks[filename]){
            delete musicMeta.tracks[filename];
            await saveMusicMetaToGitHub('Remove music metadata: ' + filename);
        }
        PLAYLIST = PLAYLIST.filter(t => mpExtractFilename(t.src) !== filename);
        await idbSet('playlist', 'v', PLAYLIST);
        showToast('Song deleted', 'success', 2000);
        renderMusicPage();
    }catch(e){
        showToast('Delete failed', 'error', 2400);
    }
}
