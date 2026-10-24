# HARFS League

Single-page league app (plain HTML/CSS/JS, no build step) with an offline-first "Lite" mode.

| Part | Where |
|---|---|
| App shell | `index.html`, `css/`, `js/` (classic scripts, loaded in the order listed in `index.html`) |
| League data | separate repo `Harfsleague/HARFS_Data` (read from the browser, written through the Cloudflare Worker) |
| Offline / emergency mode | `js/offline*.js`, `js/lite-*.js` — see [docs/LITE.md](docs/LITE.md) |
| Service worker | `sw.js` (precaches the shell, see `APP_SHELL`) |
| Fonts | drop a `.woff2` in `fonts/`; the *Fonts manifest* workflow updates `fonts/manifest.json` |
| Automation | `.github/workflows/`: data snapshot (every 15 min), fonts manifest, weekly magazine |
| Worker notes | [docs/](docs/) (`WORKER_*.md`) |

## Release checklist

Every change to `index.html`, `js/` or `css/` needs the version bumped, otherwise users can get a mix of old and new files. One command keeps both numbers (`APP_VERSION` in `js/config.js`, `CACHE_VERSION` in `sw.js`) in step:

    node scripts/bump-version.mjs        # +1   (or: node scripts/bump-version.mjs 60)

Data files of the data repo are read through `ghFetchJson()` in `js/config.js` — use it instead of writing the contents-API + `download_url` two-step by hand.

If you add or remove a file in `js/` or `css/`, also update the `<script>` / `<link>` list in `index.html` **and** `APP_SHELL` in `sw.js`.

If you start using new Tailwind classes or Font Awesome icons, rebuild `css/lite-vendor.css` (see `docs/LITE.md`).

## Local preview

Any static server works, e.g. `python3 -m http.server 8080` and open `http://localhost:8080`.
