// ============================================================
// generate-fonts-manifest.mjs
// Scans the /fonts folder and writes fonts/manifest.json, which
// js/appearance.js reads at runtime to register custom fonts without
// any hand-written CSS or JS. Runs from GitHub Actions on every push
// that touches /fonts (see .github/workflows/fonts-manifest.yml), so
// adding a font is just: drop the file in /fonts and push.
//
// Supported formats: .woff2, .woff, .ttf, .otf
// Files sharing the same base name (e.g. vazir.woff2 + vazir.ttf) are
// grouped into a single manifest entry per file — js/appearance.js
// merges same-id entries into one @font-face rule with multiple src
// sources, so the browser picks whichever format it supports first.
// ============================================================

import { readdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "..", "fonts");
const MANIFEST_PATH = path.join(FONTS_DIR, "manifest.json");

const EXT_FORMAT = { ".woff2": "woff2", ".woff": "woff", ".ttf": "ttf", ".otf": "otf" };
// Preferred order when a font ships in more than one format — smallest/
// most modern first, so the browser's format-sniffing picks the best one.
const FORMAT_PRIORITY = { woff2: 0, woff: 1, otf: 2, ttf: 3 };

function slugify(base) {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "font";
}

function labelize(base) {
  const words = base.replace(/[-_]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || base;
}

function buildManifest() {
  let files;
  try {
    files = readdirSync(FONTS_DIR);
  } catch {
    files = [];
  }

  const entries = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const format = EXT_FORMAT[ext];
    if (!format) continue; // skips README.md, manifest.json, anything else

    const base = path.basename(file, ext);
    entries.push({ id: slugify(base), label: labelize(base), file, format });
  }

  // Stable, readable ordering: by id, then best format first.
  entries.sort((a, b) => a.id.localeCompare(b.id) || FORMAT_PRIORITY[a.format] - FORMAT_PRIORITY[b.format]);

  return entries;
}

const manifest = buildManifest();
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${MANIFEST_PATH} with ${manifest.length} font file(s).`);
