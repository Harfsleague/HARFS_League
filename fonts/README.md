# Custom fonts

Drop your `.ttf` font files in this folder. The app already ships with 4
ready-to-use slots wired up in Settings → Appearance → Font:

- `harfs-font-1.ttf`
- `harfs-font-2.ttf`
- `harfs-font-3.ttf`
- `harfs-font-4.ttf`

Just save your TTF files here using those exact names and they'll show up
as selectable fonts immediately — no other changes needed.

## Using different names, or adding more than 4

1. Put your `.ttf` file here, e.g. `fonts/my-font.ttf`.
2. In `css/styles.css`, find the `CUSTOM FONTS` section and add:
   ```css
   @font-face{ font-family:'my-font'; src:url('../fonts/my-font.ttf') format('truetype'); font-display:swap; }
   ```
3. In `js/appearance.js`, find the `APP_FONTS` array and add an entry:
   ```js
   { id:'my-font', label:'My Font', stack:"'my-font', 'Segoe UI', Tahoma, sans-serif" }
   ```

That's it — it'll appear as a new swatch in Settings → Appearance → Font.
