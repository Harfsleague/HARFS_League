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

// Keeps exactly ONE track fully downloaded (as a Blob in IndexedDB) for
// offline playback — always the current first track in the playlist. If
// that track changes (reordered library, renamed file, etc), the old
// cached blob is simply overwritten next time this runs while online.
async function ensureOfflineTrackCached(){
    if (!PLAYLIST.length || !navigator.onLine) return;
    const target = PLAYLIST[0];
    try{
        const existing = await idbGet('offlineTrack','v');
        if (existing && existing.src === target.src) return; // already cached
        const res = await fetch(target.src);
        if (!res.ok) return;
        const blob = await res.blob();
        await idbSet('offlineTrack','v', { title: target.title, src: target.src, blob });
    }catch(e){ /* best-effort — a failed cache attempt just means no offline track this session */ }
}

let currentTrackIndex = 0;
let backgroundMusicStarted = false;

const bgMusic = document.getElementById('background-music');

function showSongNotification(title) {
    showToast(title, 'music', 3000);
}

function playTrack(index) {
    if (!bgMusic || PLAYLIST.length === 0) return;
    currentTrackIndex = ((index % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
    const track = PLAYLIST[currentTrackIndex];
    playTrackWithFallback(track.src, track.title);
}
// Plays the requested track's normal (raw GitHub) URL when online; when
// offline — or if that fetch fails mid-way — falls back to whatever
// single track is cached as a Blob in IndexedDB (see
// ensureOfflineTrackCached), so music never just goes silent offline.
async function playTrackWithFallback(src, title){
    if (!bgMusic) return;
    bgMusic.volume = 0.15;
    const playOffline = async () => {
        const offline = await idbGet('offlineTrack','v');
        if (offline && offline.blob) {
            bgMusic.src = URL.createObjectURL(offline.blob);
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
        if (!musicMuted) {
            await loadPlaylistFromGitHub();
            // Pick a random starting track
            const startIndex = Math.floor(Math.random() * PLAYLIST.length);
            playTrack(startIndex);
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

