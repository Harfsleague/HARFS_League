# Custom fonts

Drop a font file in this folder and push. That's it.

- Supported formats: `.woff2`, `.woff`, `.ttf`, `.otf` (any mix — `.woff2` is
  preferred if you have it, since it's smaller; `.ttf`/`.otf` still work fine).
- A GitHub Action (`.github/workflows/fonts-manifest.yml`) scans this folder
  on every push and regenerates `manifest.json` automatically.
- The app reads `manifest.json` at runtime (`loadCustomFonts()` in
  `js/appearance.js`), registers the font, and it shows up as a new swatch
  in **Settings → Appearance → Font** — usually within a minute of pushing.

No CSS or JS edit is needed for a new font.

## Naming

The filename (without extension) becomes both the font's internal id and its
display label, e.g. `vazir-bold.woff2` → label "Vazir Bold". Use letters,
numbers, `-` or `_` and avoid spaces or special characters in the filename.

## Multiple formats of the same font

If you drop more than one file with the same base name — e.g. both
`vazir.woff2` and `vazir.ttf` (a modern format plus an older fallback) —
they're merged into a single selectable font that uses whichever format the
visitor's browser supports, instead of showing up as two separate fonts.

## First-time setup note

This workflow commits back to the repo using the built-in `GITHUB_TOKEN`,
which needs **Settings → Actions → General → Workflow permissions → Read and
write permissions** enabled once for this repository.
