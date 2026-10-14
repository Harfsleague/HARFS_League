# Cards — Worker (required)

Cards are now **fully automatic and handled by the Worker** (`worker.js`, section “CARDS”).
Deploy the new `worker.js` *before* / together with this app update.

## What the admin can and cannot do

| | Admin (Bayern) |
|---|---|
| Create / edit / delete a card, change its picture | ✅ (`POST /cards` `deck_save` / `deck_delete`) |
| Deal, give, take, activate, deactivate, discard anybody's card | ❌ never |
| See the card a team chose while entering a result | ✅ view only |
| Use his **own** cards | ✅ as the *team* Bayern, exactly like the other teams (Overall → Cards) |

The `/gh/` proxy also refuses every admin write to `cards_data.json`, so the file can only be
changed by the Worker's own card rules.

## Rules implemented by the Worker

* **New season** → every team gets 2 “No” cards **+ 2 random cards**.
* **After every 2nd matchweek** (each team has played each other team once) → 2 random cards for
  every team: after MW 2, 4, 6. Nothing after the last matchweek (only the CUP final + Super Cup
  are left and they allow no cards). Dealing is idempotent — it can never be dealt twice.
* **Keep limit: 3 cards. “No” cards do not count** (checked on `activate`).
* One active card per team. “No” cancels the opponent's card.
* Cards can be used in **league games, CUP semifinals and the third-place match**.
  **CUP final and Super Cup: no cards** (`consume` returns `free:true`, active cards stay in the hand).
* When the admin saves a result, the app calls `consume` first; the Worker removes the active cards
  of the two teams and returns what was used. The app writes it on the game:
  `match.cards` / CUP `leg.cards` / `thirdPlace.cards` = `{ "<Team>": { card, name, cancelled } }`,
  shown in the Season history and in the CUP bracket.

## Endpoints

`GET /cards` → `{ ok, data }` (public read, no writes)

`POST /cards` (Bearer session) `{ action, … }`

| action | who | body | notes |
|---|---|---|---|
| `sync` | any logged-in account | – | deals whatever is due (new season / every 2nd matchweek) |
| `activate` / `deactivate` / `discard` | the 4 teams (acting on **their own** hand only) | `uid` | `activate` refused while > 3 non-“No” cards |
| `consume` | admin only (called by the app while saving a result) | `stage` (`league`\|`semi`\|`third`\|`final`\|`super`), `home`, `away`, `gameKey` | validated against `season_flow.json` / `match_history.json` / `mba_history.json`; idempotent per game |
| `deck_save` | admin only | `card:{ id?, name, desc, draw, img? }` | picture itself is uploaded through `/gh/…/contents/cards/<id>.jpg` |
| `deck_delete` | admin only | `id` | also removes the card from every hand |

All of them answer `{ ok:true, data:<fresh cards_data.json>, result }`.

## `cards_data.json` (data repo) — v2

```json
{ "v": 2,
  "deck":  [{ "id":"no", "name":"No", "desc":"…", "img":null, "draw":false, "system":true }],
  "hands": { "Bayern": [{ "uid":"k3f9a2x1", "card":"no", "active":false }] },
  "deals": { "3:1760000000000": ["start","w0","w2"] },
  "used":  { "L:3:1760000000000:r2m1": { "stage":"league", "home":{…}, "away":{…} } },
  "log":   [] }
```

A season that is already running when this update is deployed (file still `v:1`) is **migrated
without touching anybody's hand**; the automatic schedule continues from the matchweeks already played.

## Optional — Cron Trigger

Dealing already happens whenever someone opens Cards or a result is saved. If you also want it to
happen with nobody online, add a cron trigger to the Worker (Dashboard → Worker → Triggers → Cron,
e.g. `*/15 * * * *`). `worker.js` already has the `scheduled()` handler.
