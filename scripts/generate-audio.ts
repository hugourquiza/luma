#!/usr/bin/env node
// Generate all local audio with edge-tts (Microsoft neural voices, local,
// libre-to-use for offline asset creation). Reads the real content JSON so
// every referenced audioId gets a file. Spanish neutral (es-MX Dalia).
// This is a build-time script — the shipped app uses only bundled MP3s (§8).

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const VOICE = 'es-MX-DaliaNeural';
const RATE = '+0%'; // neutral pace for kids
const OUT = resolve(process.cwd(), 'public/audio');
mkdirSync(OUT, { recursive: true });

const contentDir = resolve(process.cwd(), 'public/content');
const regions = readdirSync(contentDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => JSON.parse(readFileSync(join(contentDir, f), 'utf8')));

// Collect every audioId referenced anywhere + its desired script.
const needed = new Map(); // audioId -> spoken text

// instruction texts (neutral Spanish)
const instructions = {
  'instruction-listen': 'Escucha la palabra y elige la tarjeta.',
  'instruction-build': 'Ordena las fichas para formar la palabra.',
  'instruction-read': 'Elige la imagen que corresponde a la palabra.',
  'instruction-trace': 'Dibuja la letra sobre la guía.',
  'instruction-dictate': 'Escribe la palabra que escuchas.',
  'instruction-write-copy': 'Copia la palabra.',
  'instruction-story': 'Escucha la historia y responde.',
};
for (const [id, t] of Object.entries(instructions)) needed.set(id, t);

// story
const storyText = 'Sale la luna. La luna ilumina el patio. Mira el sol de la mañana.';
needed.set('story-luna', storyText);

// collect words
const words = new Set();
for (const r of regions) {
  for (const l of r.lessons) {
    for (const a of l.activities) {
      if (a.word) words.add(a.word.toLowerCase());
      if (a.targetText) words.add(a.targetText.toLowerCase());
      if (a.choices) a.choices.forEach((c) => { if (c.text) words.add(c.text.toLowerCase()); });
      if (a.wordToWrite) words.add(a.wordToWrite.toLowerCase());
      if (a.acceptedAnswers) a.acceptedAnswers.forEach((w) => words.add(w.toLowerCase()));
    }
  }
}

// clean words: drop punctuation, keep letters/accents
const clean = (w) => w.replace(/[.,¿?¡!]/g, '').trim().toLowerCase();

for (const w of words) {
  const key = clean(w);
  if (!key) continue;
  needed.set(`word-${key}`, key);
  if (key !== 'la' && key.length > 0) {
    // hint: "La palabra es X."
    needed.set(`hint-${key}`, `La palabra es ${key}.`);
  }
}

// letter hints
for (const L of ['A', 'E', 'I', 'O', 'U', 'a', 'e', 'i', 'o', 'u', 'm', 'p', 'l', 's', 't', 'n', 'd', 'f', 'b', 'v', 'ñ', 'ch', 'c', 'q', 'r']) {
  needed.set(`hint-letter-${L}`, `Esta es la letra ${L}.`);
}

// --- generate missing files ---
let generated = 0, skipped = 0, failed = 0;
for (const [id, text] of needed) {
  const out = join(OUT, `${id}.mp3`);
  if (existsSync(out) && statSync(out).size > 0) {
    skipped++;
    continue;
  }
  try {
    execSync(
      `python3 -m edge_tts --voice ${VOICE} --rate ${RATE} --text ${JSON.stringify(text)} --write-media ${out} 2>/dev/null`,
      { stdio: ['ignore', 'ignore', 'ignore'] },
    );
    generated++;
  } catch {
    console.error(`FAILED: ${id}`);
    failed++;
  }
}

// Write a resource manifest (§8): id, path, spoken text, lang, license, review state.
const manifest = [...needed].map(([id, text]) => ({
  id,
  path: `audio/${id}.mp3`,
  text,
  lang: 'es-LA',
  voice: VOICE,
  license: 'Microsoft neural voice — generated offline at build; human listener review pending',
  review: 'pending-human',
}));
writeFileSync(resolve(process.cwd(), 'public/audio/manifest.json'), JSON.stringify({ version: 2, generatedAt: Date.now(), total: manifest.length, audios: manifest }, null, 2));

console.log(`audio: ${generated} generated, ${skipped} already present, ${failed} failed`);
console.log(`total unique audio ids: ${needed.size}`);
if (failed) process.exitCode = 1;
