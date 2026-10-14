# Worker change needed for team-side card actions (optional)

The Cards system (`js/cards.js`) works fully WITHOUT any Worker change for the **admin**
(Bayern): everything the admin does goes through the normal `/gh/...` proxy and writes
`cards_data.json` and `cards/<id>.jpg` into the data repo, exactly like `league_data.json`
and the magazine covers.

> If your Worker only allows `/gh/` writes to a fixed list of file names, add
> `cards_data.json` and the folder `cards/` to that list for the admin account.

A **team** (non-admin) can look at its own hand without any change (the data file is read
like every other json file). To let a team **activate / deactivate / discard its own card**
itself, the Worker needs one new endpoint. Until it exists the app shows
“Cards are not enabled on the server yet — ask the admin”, and the admin can do the same
thing from Admin → Cards.

## `POST /cards`

Headers: `Authorization: Bearer <session>` (same session as `/team-profile`).
Body:

```json
{ "action": "activate" | "deactivate" | "discard", "uid": "k3f9a2x1" }
```

The team is the logged-in team (never taken from the body). Only the 4 real teams
(`HOSI`, `Sezar`, `Bayern`, `Yellow`) may call it.

### What the Worker must do

1. Read `cards_data.json` from the data repo (GitHub Contents API, same token as for
   `main_league_data.json`). If it does not exist → `404 { ok:false, error:"No cards yet" }`.
2. `hand = data.hands[team]`; find the item with `uid` → else `{ ok:false, error:"That card is not in your hand" }`.
3. Apply the action:
   - `discard`: remove the item.
   - `deactivate`: `item.active = false`.
   - `activate`: refuse if `hand.length > 3`
     (`error: "Discard N card(s) first — a team can keep at most 3."`), otherwise set
     `active = false` on every item of the hand and `active = true` on this one
     (only ONE active card per game).
4. Commit the file back (use the sha you read; on a 409/422 conflict re-read and retry once).
5. Return `{ "ok": true, "hand": [ …the team's new hand… ] }`.

Do not touch anything except `hands[team]`.

## Sketch

```js
async function handleCards(req, env, team) {
  const { action, uid } = await req.json();
  if (!['activate', 'deactivate', 'discard'].includes(action) || !/^[a-z0-9]{4,16}$/.test(uid || ''))
    return json({ ok: false, error: 'Bad request' }, 400);
  const file = await githubGetJson(env, 'cards_data.json');          // { data, sha } or null
  if (!file) return json({ ok: false, error: 'No cards yet' }, 404);
  const hand = (file.data.hands && file.data.hands[team]) || [];
  const i = hand.findIndex(h => h.uid === uid);
  if (i < 0) return json({ ok: false, error: 'That card is not in your hand' }, 400);
  if (action === 'discard') hand.splice(i, 1);
  else if (action === 'deactivate') hand[i].active = false;
  else {
    if (hand.length > 3) return json({ ok: false, error: `Discard ${hand.length - 3} card(s) first — a team can keep at most 3.` }, 400);
    hand.forEach(h => { h.active = false; });
    hand[i].active = true;
  }
  file.data.hands[team] = hand;
  await githubPutJson(env, 'cards_data.json', file.data, file.sha, `Cards: ${team} ${action}`);
  return json({ ok: true, hand });
}
```
