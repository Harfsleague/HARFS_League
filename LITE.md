# HARFS Lite — emergency / offline mode

For the days the international internet is cut. Everything lives in **Settings → Emergency & Offline**.

## What it does
* **Local copy** — every league file (`league_data`, `main_league_data`, `match_history`, `seasons_archive`, `mba_history`,
  `season_flow`, `cards_data`) is copied into this device's IndexedDB whenever the app reads it from GitHub, and refreshed
  by "Update local copy now" (also automatically every ~6 h). Each file has a SHA-256 fingerprint and the last 3 versions
  are kept; a damaged copy is restored from a backup on start-up.
* **Works offline** — if GitHub is unreachable, or **Emergency mode** is on, the app reads from the local copy and saves results
  there (they are written to a journal). Nothing in the normal screens had to change: `js/offline-gh.js` answers the
  `fetch`/`XMLHttpRequest` calls the app already makes to GitHub.
* **Sync to GitHub** — when you are online and logged in as the admin, *Sync to GitHub* shows what will be written and pushes it.
  If somebody changed GitHub in the meantime, both sets of changes are merged (3-way merge; lists by id, the league table is
  recomputed from the merged match list). Then the app reloads.
* **Share over Wi-Fi** — devices on the same Wi-Fi / hotspot exchange edits and chat directly (WebRTC), no server and no internet:
  the host shows a QR code, the other device scans it and shows an answer QR, the host scans that. The host relays everything.
* **Lite app file** — *Make the lite app file* packs the whole app + the current data + team logos into ONE `.html` file
  (no external links). Send it by Telegram/Bluetooth; open it in Chrome from the file manager. Optional **Emergency PIN**
  protects the admin identity inside it. (Android Chrome; on iPhone use Emergency mode in the installed app.)
* **Edits file** — *Export / Import edits file* moves the offline edits as a small `.json` (e.g. from a lite file to the
  normal app on a device that is online, where you then press Sync).

## Notes
* Result entry (which saves `league_data` + `match_history`) works offline. Things that need the server — logging in,
  cards purchases, combo bonuses, magazine, Moments, media in the chat — do not.
* The local chat is text only and stays on the devices.
* The Emergency PIN only gates the UI of the lite file; real write access to GitHub is still decided by the Worker when you sync.

## Rebuilding `css/lite-vendor.css`
It is Tailwind + Font Awesome reduced to the classes/icons the app uses, with the icon fonts embedded. Re-run it whenever you
start using new Tailwind classes or icons:

    npm i --no-save purgecss tailwindcss@2.2.19 @fortawesome/fontawesome-free@6.0.0-beta3
    node scripts/build-lite-vendor.mjs
