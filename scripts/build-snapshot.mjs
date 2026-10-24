// Builds data/snapshot.json — ONE same-origin file holding the league data files that the app needs at start-up.
// js/snapshot.js uses it to fill the app's local cache on a device's FIRST visit, so the first screen no longer has to wait for
// a chain of slow requests to api.github.com / raw.githubusercontent.com / the Worker. It is only a *starting copy*: the app
// still loads the live files right afterwards and replaces it, and every save keeps going through the live path.
//
// Run by .github/workflows/data-snapshot.yml (every 15 minutes + manually). Safe to run locally:
//   node scripts/build-snapshot.mjs            (reads the public repo; set HARFS_DATA_TOKEN to use the API with a token)
import fs from 'node:fs';
import path from 'node:path';

const REPO   = process.env.DATA_REPO   || 'Harfsleague/HARFS_Data';
const BRANCH = process.env.DATA_BRANCH || 'main';
const TOKEN  = process.env.HARFS_DATA_TOKEN || '';
const OUT    = path.join('data', 'snapshot.json');

// Keep in step with js/snapshot.js (MAP) — these are the files whose parsed JSON the loaders cache in IndexedDB.
const FILES = [
  'league_data.json',
  'main_league_data.json',
  'match_history.json',
  'seasons_archive.json',
  'mba_history.json',
  'season_flow.json',
];

async function getText(file){
  const useApi = !!TOKEN;
  const url = useApi
    ? `https://api.github.com/repos/${REPO}/contents/${file}?ref=${BRANCH}`
    : `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${file}`;
  const headers = { 'User-Agent': 'harfs-snapshot' };
  if(useApi){ headers.Authorization = `Bearer ${TOKEN}`; headers.Accept = 'application/vnd.github.raw+json'; }
  let lastErr;
  for(let attempt = 0; attempt < 3; attempt++){
    try{
      const res = await fetch(url, { headers });
      if(res.status === 404) return null;                       // file does not exist (yet) — simply not part of the snapshot
      if(!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
      return await res.text();
    }catch(e){ lastErr = e; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); }
  }
  throw lastErr;
}

const files = {};
for(const f of FILES){
  const text = await getText(f);
  if(text === null){ console.log(`- ${f}: not found, skipped`); continue; }
  // A broken / half-written file must never reach the snapshot: fail the run and keep the previous snapshot.
  try{ files[f] = JSON.parse(text); }
  catch(e){ throw new Error(`${f} is not valid JSON — snapshot NOT updated (${e.message})`); }
  console.log(`- ${f}: ${text.length} bytes`);
}
if(!Object.keys(files).length) throw new Error('No data files could be read — snapshot NOT updated');

// Don't rewrite (and so don't commit / redeploy the site) when only the timestamp would change.
let previous = null;
try{ previous = JSON.parse(fs.readFileSync(OUT, 'utf8')).files; }catch(e){}
if(previous && JSON.stringify(previous) === JSON.stringify(files)){ console.log('Snapshot unchanged.'); process.exit(0); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ v: 1, built: new Date().toISOString(), files }));
console.log(`Wrote ${OUT} (${fs.statSync(OUT).size} bytes)`);
