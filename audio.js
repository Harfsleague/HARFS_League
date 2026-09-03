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

async function loadPlaylistFromGitHub() {
    if (playlistLoadPromise) return playlistLoadPromise;
    playlistLoadPromise = (async () => {
        try {
            const res = await fetch(MUSIC_API_URL);
            if (!res.ok) throw new Error('music folder not found');
            const items = await res.json();
            const tracks = (Array.isArray(items) ? items : [])
                .filter(it => it.type === 'file' && AUDIO_EXTENSIONS.some(ext => it.name.toLowerCase().endsWith(ext)))
                .map(it => ({ title: filenameToTitle(it.name), src: MUSIC_RAW_BASE + encodeURIComponent(it.name) }));
            PLAYLIST = tracks.length ? tracks : [FALLBACK_TRACK];
        } catch (e) {
            PLAYLIST = [FALLBACK_TRACK];
        }
        return PLAYLIST;
    })();
    return playlistLoadPromise;
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
    bgMusic.src = track.src;
    bgMusic.volume = 0.15;
    bgMusic.play()
        .then(() => {
            showSongNotification(track.title);
            if(document.getElementById('playlist-sheet')?.classList.contains('open'))renderPlaylistSheet();
        })
        .catch(() => {});
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

