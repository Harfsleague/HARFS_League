# Chat — editing messages & @mentions

## @mentions (no Worker change)
A mention is stored inside the message text as `@DisplayName` (the 250-character limit still applies). The app turns it into a chip, highlights
messages that mention the signed-in account, and shows a "mentioned you" banner. The unread banner built from `/chat/unread` → `last.p`
also says "mentioned you" when that preview text contains the mention.

## Editing a message — **needs a small Worker update**
The app calls

```
POST /chat/edit      { "id": "<message id>", "text": "<new text, ≤ 250 chars>" }
→ 200 { "ok": true, "ed": <ms timestamp of the edit>, "v": "<new head version>" }
```

Rules the endpoint must enforce (same pattern as `/chat/delete`):
* signed-in account only; only the **sender** may edit their own message (not even the admin);
* text is trimmed, max 250 chars; an empty text is only allowed when the message has a media attachment;
* the message is re-encrypted and saved like `/chat/send` does; keep `id`, `ts`, `t`, `r` (reply), media fields and reactions **unchanged**;
* set `ed` (edit time, ms) on the stored message and return it in `/chat/messages` and `/chat/poll` so every device repaints the bubble
  (the bubble shows an "edited" label when `ed` is present);
* bump the head version (`v`) so other devices notice the change on their next poll.

Until the Worker supports it, the Edit button shows a toast: "Editing needs the updated Worker".
