// Keeps the two release numbers in step: APP_VERSION (js/config.js) and CACHE_VERSION (sw.js).
//   node scripts/bump-version.mjs          -> +1 on both
//   node scripts/bump-version.mjs 60       -> set both to v60
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfgPath = path.join(root, "js", "config.js");
const swPath = path.join(root, "sw.js");
const cfg = readFileSync(cfgPath, "utf8");
const sw = readFileSync(swPath, "utf8");

const mCfg = cfg.match(/APP_VERSION\s*=\s*"v(\d+)"/);
const mSw = sw.match(/CACHE_VERSION\s*=\s*'harfs-shell-v(\d+)'/);
if (!mCfg || !mSw) { console.error("Could not find APP_VERSION / CACHE_VERSION — has the format changed?"); process.exit(1); }
if (mCfg[1] !== mSw[1]) console.warn(`Warning: they were out of step (config v${mCfg[1]}, sw v${mSw[1]}).`);

const next = process.argv[2] ? parseInt(process.argv[2], 10) : Math.max(+mCfg[1], +mSw[1]) + 1;
if (!Number.isInteger(next) || next < 1) { console.error("Give a positive whole number, or nothing to add 1."); process.exit(1); }

writeFileSync(cfgPath, cfg.replace(/APP_VERSION\s*=\s*"v\d+"/, `APP_VERSION="v${next}"`));
writeFileSync(swPath, sw.replace(/CACHE_VERSION\s*=\s*'harfs-shell-v\d+'/, `CACHE_VERSION = 'harfs-shell-v${next}'`));
console.log(`APP_VERSION and CACHE_VERSION are now v${next}`);
