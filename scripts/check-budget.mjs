#!/usr/bin/env node
// Budget checker (§9): fails the build if internal budgets are exceeded.
// Budgets (more conservative than provider limits):
//   - < 2000 files
//   - no single file > 5 MiB
//   - initial JS compressed < 250 KB
//   - offline per-region package < 15 MB
//   - initial app + first lesson < 3 MB
import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const results = [];

function walk(dir, ctx) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, ctx);
    else if (ctx.predicate(full)) {
      ctx.acc.push(full);
      ctx.size.push(st.size);
    }
  }
}

function list(predicate) {
  const acc = [], size = [];
  const ctx = { predicate, acc, size };
  walk(dist, ctx);
  return { files: acc, sizes: size };
}

function fail(msg) { results.push(`FAIL  ${msg}`); }
function ok(msg) { results.push(`ok    ${msg}`); }

// 1. total file count
const all = list(() => true);
if (all.files.length > 2000) fail(`>2000 archivos: ${all.files.length}`);
else ok(`${all.files.length} archivos totales (< 2000)`);

// 2. no file > 5 MiB
const big = all.files.filter((f, i) => all.sizes[i] > 5 * 1024 * 1024);
if (big.length) fail(`${big.length} archivo(s) > 5 MiB`);
else ok('ningún archivo > 5 MiB');

// 3. initial JS compressed < 250 KB
const js = list((f) => f.match(/assets\/.*\.js$/));
// Note: this measures raw size; compression estimate = ~0.35 ratio
const jsTotalRaw = js.sizes.reduce((a, b) => a + b, 0);
const jsCompressedEst = jsTotalRaw * 0.35;
if (jsCompressedEst / 1024 > 250) fail(`JS inicial comprimido aprox ${(jsCompressedEst / 1024).toFixed(0)} KB > 250 KB`);
else ok(`JS inicial comprimido aprox ${(jsCompressedEst / 1024).toFixed(0)} KB (< 250 KB)`);

// 4. app size (html+css+js) < 3 MB
const app = list((f) => f.match(/\.(html|css|js)$/));
const appSize = app.sizes.reduce((a, b) => a + b, 0);
if (appSize / 1e6 > 3) fail(`app total ${(appSize / 1e6).toFixed(1)} MB > 3 MB`);
else ok(`app html+css+js ${(appSize / 1e6).toFixed(1)} MB (< 3 MB)`);

// 5. offline per-region < 15 MB (audio + content + images)
const audio = list((f) => f.match(/audio\/.*\.mp3$/));
const audioSize = audio.sizes.reduce((a, b) => a + b, 0);
if (audioSize / 1e6 > 15) fail(`audio total ${(audioSize / 1e6).toFixed(1)} MB > 15 MB`);
else ok(`audio total ${(audioSize / 1e6).toFixed(1)} MB (< 15 MB)`);

console.log('\n=== Chequeo de presupuestos ===');
for (const r of results) console.log(`  ${r}`);
const failed = results.some((r) => r.startsWith('FAIL'));
process.exit(failed ? 1 : 0);
