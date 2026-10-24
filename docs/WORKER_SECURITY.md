# Accounts, sessions, magazine comments, encrypted moments — Worker setup

Deploy the new `worker.js` **before** (or together with) this app update.

## 1. Secrets (Cloudflare → Worker → Settings → Variables and Secrets)

| secret | needed for |
|---|---|
| `GITHUB_PAT` | already set |
| `MEDIA_KEY` | **new, required** — any long random text (e.g. 40+ characters). Moment pictures / videos / songs are encrypted with a key derived from it. **Never change or lose it afterwards**, or the existing encrypted files can no longer be opened. |

Without `MEDIA_KEY` the Worker refuses to save moments (it will not store them unencrypted).

## 2. Encrypt the moments that already exist
Admin Panel → **Moments** tab → **Encrypt existing moment files** (once). It re-saves every file under
`moment_media/` and every thumbnail in `weird_events*.json` as `HENC1:…` ciphertext, a few files at a time.

> Old *plain* copies stay in the Git history of `HARFS_Data`. If the repository is public, anyone could still dig them out of
> earlier commits. To remove them for good, purge the history (e.g. `git filter-repo`) or re-create the repository after migrating.

New moments are encrypted automatically by the Worker while the app saves them (`/gh/` proxy). Reading goes through
`GET /media?path=…` and `POST /media/decrypt`, which require a signed-in account.

## 3. Accounts
* No guest mode: the login screen can't be closed without signing in.
* Settings → **Devices & Sessions**: every account sees where it is signed in (device, place, last activity) and can sign a device out, or all others.
* Admin Panel → **Users** tab → *Active Sessions*: the admin sees every account's devices and can sign out one device or all devices of an account.
* A device that was signed out (by its owner or the admin) is kicked back to the login screen the next time it talks to the Worker or the app is reopened.
* `POST /auth/logout` is called on a normal log-out, so the old token stops working.
* Sessions created before this update keep working and are upgraded automatically.

## 4. Magazine comments
`GET|POST /comments`, `POST /comments/delete`, `POST /comments/gif`, `GET /comments/gif/<id>`.
Stored in KV (`comments:<issue>`), max 400 per issue, 600 characters each, one reply level (thread). A user can delete their own
comments; the admin (Bayern) can delete any.
GIFs are **upload only**: a GIF / picture (max 4 MB), or a **video** — the app converts its first 10 seconds to a GIF in the browser
(own encoder `js/gif-encoder.js`, adaptive colours per frame, retries with fewer/smaller frames until the GIF is ≤ ~3.6 MB) and uploads the result.

## 5. Season page
The separate *Results* page was merged into **Season**: season/edition pickers, league table, match history and CUP are all on one page; the header keeps only the Schedule button.

## 6. Push notifications
Nothing to configure for the keys — the Worker creates its own VAPID key pair on first use and keeps it in KV (`vapid_keys`).
Settings → **Notifications** (per device: on/off · per account: which topics):

| topic | when | default |
|---|---|---|
| New magazine issue | the Worker notices a higher `issueNumber` in `weekly_magazine_archive.json` | on |
| New Golden Moment | right after a moment is saved (never for the person who posted it) | on |
| Matchweek reminder | Thursday from 18:00 (Asia/Tehran): the open matchweek's games | on |
| Magazine comments | every new comment (not your own) | **off** |

**Add a Cron Trigger** (Worker → Settings → Triggers → Cron, e.g. `*/10 * * * *`) so the magazine and Thursday notifications go out
even when nobody has the app open. Without it they still go out, but only when somebody opens the app (the check runs at most every 4 minutes).
iPhone / iPad: push works only for the app added to the Home Screen (iOS 16.4+).
Endpoints: `GET /push/key`, `GET|POST /push/prefs`, `POST /push/subscribe`, `POST /push/unsubscribe`, `POST /push/test`.
