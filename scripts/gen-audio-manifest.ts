#!/usr/bin/env node
// Regenerate audio manifest from the ACTUAL referenced audio ids used by the
// content, so it only lists real, on-disk files (§8 resource manifest).
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const contentDir = resolve(process.cwd(), 'public/content');
const audioDir = resolve(process.cwd(), 'public/audio');

// collect all audioIds referenced by the content
const refs = new Set();
for (const f of readdirSync(contentDir).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const r = JSON.parse(readFileSync(join(contentDir, f), 'utf8'));
  for (const l of r.lessons) {
    for (const a of l.activities) {
      for (const k of ['instructionAudioId', 'hintAudioId', 'stimulusAudioId', 'storyAudioId']) {
        if (a[k]) refs.add(a[k]);
      }
      if (a.choices) a.choices.forEach((c) => { if (c.audioId) refs.add(c.audioId); });
    }
  }
  // also all word-* files that exist on disk (for repeat/pronunciation)
}
for (const f of readdirSync(audioDir).filter((x) => x.endsWith('.mp3'))) {
  refs.add(f.replace(/\.mp3$/, ''));
}

const missing = [];
const manifest = [];
for (const id of [...refs].sort()) {
  const path = `audio/${id}.mp3`;
  const full = join(audioDir, `${id}.mp3`);
  const has = existsSync(full) && statSync(full).size > 0;
  if (!has) missing.push(id);
  manifest.push({
    id, path,
    sizeBytes: has ? statSync(full).size : 0,
    review: 'pending-human', // every pronunciation needs a human listen (§8)
  });
}
writeFileSync(resolve(audioDir, 'manifest.json'), JSON.stringify({ version: 2, generatedAt: Date.now(), total: manifest.length, audios: manifest }, null, 2));
console.log(`manifest: ${manifest.length} audios, ${missing.length} missing on disk`);
if (missing.length) {
  console.log('MISSING RESOURCES:'); missing.forEach((m) => console.log('  ', m));
  process.exitCode = 1;
}
