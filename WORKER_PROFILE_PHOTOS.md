# Worker change needed for multi-photo profiles

The app (`js/profile-photos.js`, `saveTeamEdit()` in `js/appearance.js`) now sends
extra fields to `POST /team-profile`. **The Worker source is not in this repo, so this
part must be added there.** Until it is, everything still works exactly as before
(name / short name / main picture are saved); the app just shows a toast saying the
gallery was not saved.

## Request body (new fields)

```json
{
  "name": "…", "short": "…",
  "logo": "data:image/jpeg;base64,…",   // 240px square copy of photo #1 (as before), or null
  "photos": [                            // only present when the user changed photos
    { "id": "k3f9a2" },                  // existing photo: keep it
    { "data": "data:image/jpeg;base64,…" } // new / rotated photo (≤1280px, ~100-250 KB)
  ]
}
```

`photos: []` means “remove every photo” (back to the default picture).
The order of the array is the display order; element 0 is the main photo.

## What the Worker must do (authenticated team only — same checks as today)

1. Validate: `photos` is an array, length ≤ 8, each item has either `id` or `data`;
   `data` starts with `data:image/jpeg;base64,` and decodes to < 600 KB; every `id`
   matches `/^[a-z0-9]{4,16}$/` **and already belongs to this team**
   (is in the team's current `customPhotos`).
2. For each item with `data`: generate a new `id` (e.g. 8 random base36 chars) and
   commit the bytes to the data repo at `profile_photos/<TEAM>/<id>.jpg`
   (GitHub Contents API, same token the Worker already uses for `main_league_data.json`).
3. Build `customPhotos = [{ id, ts: Date.now() }, …]` in the requested order
   (`ts` of kept photos stays the old one).
4. Delete from the repo the files of old photos that are no longer in the list.
5. Save `customPhotos` in `main_league_data.json[<TEAM>]` together with the other
   profile fields, and return it:

```json
{ "ok": true, "customName": "…", "customShort": "…", "customLogo": "…", "customPhotos": [{ "id": "…", "ts": 1760000000000 }] }
```

The app reads full-quality pictures from
`https://raw.githubusercontent.com/<repo>/<branch>/profile_photos/<TEAM>/<id>.jpg`.

## Sketch (adapt names to your Worker)

```js
async function saveGallery(env, team, photos, oldList) {
  const keep = new Map(oldList.map(p => [p.id, p]));
  const next = [];
  for (const it of photos) {
    if (it.id) {
      if (!keep.has(it.id)) throw new Error('unknown photo id');
      next.push(keep.get(it.id));
    } else {
      if (!/^data:image\/jpeg;base64,/.test(it.data) || it.data.length > 800_000) throw new Error('bad photo');
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      await githubPutFile(env, `profile_photos/${team}/${id}.jpg`, it.data.split(',')[1], `Profile photo ${team}`);
      next.push({ id, ts: Date.now() });
    }
  }
  const kept = new Set(next.map(p => p.id));
  for (const p of oldList) if (!kept.has(p.id)) await githubDeleteFile(env, `profile_photos/${team}/${p.id}.jpg`);
  return next;
}
```
