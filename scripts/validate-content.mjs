#!/usr/bin/env node
// Content validator (§10). Fails the build on structural errors.
// Plain .mjs because it runs under `node` without type-stripping concerns.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const contentDir = resolve(process.cwd(), 'public/content');
const audioDir = resolve(process.cwd(), 'public/audio');
const imageDir = resolve(process.cwd(), 'public/images');
const audioMap = loadAudioMap();

function loadAudioMap() {
  const map = {};
  if (!existsSync(audioDir)) return map;
  for (const f of readdirSync(audioDir)) {
    if (f.endsWith('.mp3')) map[f.replace(/\.mp3$/, '').normalize('NFC')] = f;
  }
  return map;
}

const errors = [];
const notes = [];

function err(msg) { errors.push(msg); }
function note(msg) { notes.push(msg); }

function checkAudio(id, where) {
  // Audio is generated/synthesized; if file missing, that's tolerated at
  // validation (delivered as audio-pendiente.md) but MUST be flagged.
  // Normalize both sides a NFC: macOS filenames suelen estar en NFD mientras
  // el JSON de contenido está en NFC (bug de tildes/ñ del validador original).
  if (!id) return;
  if (!audioMap[id.normalize('NFC')]) {
    err(`audio faltante: ${where} refiere audio "${id}" pero no existe public/audio/${id}.mp3`);
  }
}
function checkImage(id, where) {
  // Illustrations are SVGs; tolerate absence (pending images) but flag.
  if (!id) return;
  if (!existsSync(resolve(imageDir, `${id}.svg`)) && !existsSync(resolve(imageDir, `${id}.png`))) {
    err(`imagen faltante: ${where} refiere "${id}" pero no existe en public/images`);
  }
}

// ----- load all regions -----
const regionFiles = readdirSync(contentDir).filter((f) => f.endsWith('.json') && f !== 'index.json');
const allActivities = [];
const allIds = new Set();
const activityByRegion = {};
const regionMap = {};

for (const f of regionFiles) {
  const region = JSON.parse(readFileSync(join(contentDir, f), 'utf8'));
  regionMap[region.id] = region;
  activityByRegion[region.id] = [];
  if (!region.id) err(`región sin id en ${f}`);
  for (const lesson of region.lessons ?? []) {
    if (!lesson.id) err(`lección sin id en ${f}`);
    if (allIds.has(`lesson:${lesson.id}`)) err(`lección duplicada ${lesson.id}`);
    allIds.add(`lesson:${lesson.id}`);
    const actSet = new Set();
    for (const a of lesson.activities ?? []) {
      if (!a.id) err(`actividad sin id en ${lesson.id}`);
      if (allIds.has(a.id)) err(`id de actividad duplicado: ${a.id}`);
      allIds.add(a.id);
      if (actSet.has(a.id)) err(`actividad repetida en la misma lección ${lesson.id}: ${a.id}`);
      actSet.add(a.id);
      allActivities.push({ a, region: region.id, lesson: lesson.id });
      activityByRegion[region.id].push(a);
      validateActivity(a, lesson.id);
    }
    if ((lesson.activities ?? []).length !== 6) {
      note(`lección ${lesson.id} tiene ${(lesson.activities ?? []).length} actividades (esperado 6)`);
    }
  }
}

function validateActivity(a, lessonId) {
  const where = `${lessonId}/${a.id}`;
  if (!a.type) err(`actividad ${where} sin type`);
  if (!Array.isArray(a.skillIds) || a.skillIds.length === 0) err(`actividad ${where} sin skillIds`);

  switch (a.type) {
    case 'listen-choose': {
      checkAudio(a.stimulusAudioId, where);
      checkAudio(a.instructionAudioId, where);
      checkImage(a.choices?.[0]?.imageId, where);
      const correct = (a.choices ?? []).filter((c) => c.correct);
      if (correct.length !== 1) err(`listen-choose ${where} debe tener 1 correcta, tiene ${correct.length}`);
      if (a.choices.length < 2 || a.choices.length > 4) err(`listen-choose ${where} debe tener 2-4 opciones, tiene ${a.choices.length}`);
      break;
    }
    case 'read-relate': {
      checkAudio(a.instructionAudioId, where);
      if (a.choices.length < 2) err(`read-relate ${where} debe tener >=2 opciones`);
      const c = (a.choices ?? []).filter((x) => x.correct);
      if (c.length !== 1) err(`read-relate ${where} debe tener 1 correcta`);
      break;
    }
    case 'build-word': {
      checkAudio(a.stimulusAudioId, where);
      checkAudio(a.instructionAudioId, where);
      checkImage(a.imageId, where);
      const solution = a.solutionTileIds ?? [];
      const tiles = a.tiles ?? [];
      // every solution tile must exist in tiles
      for (const s of solution) if (!tiles.some((t) => t.id === s)) err(`build-word ${where}: solución ${s} no está en fichas`);
      // tile ids unique
      const tid = new Set(tiles.map((t) => t.id));
      if (tid.size !== tiles.length) err(`build-word ${where}: ids de fichas duplicados`);
      if (!a.word) err(`build-word ${where}: sin word`);
      break;
    }
    case 'write-word': {
      checkAudio(a.instructionAudioId, where);
      if (a.mode === 'dictation') checkAudio(a.stimulusAudioId, where);
      if ((a.acceptedAnswers ?? []).length === 0) err(`write-word ${where}: sin acceptedAnswers`);
      if (a.mode === 'copy' && !a.model) err(`write-word ${where}: copia sin model`);
      break;
    }
    case 'trace-letter': {
      checkAudio(a.instructionAudioId, where);
      if (!a.letter) err(`trace-letter ${where}: sin letter`);
      if (!Array.isArray(a.strokes) || a.strokes.length === 0) err(`trace-letter ${where}: sin trazos`);
      break;
    }
    case 'sentence-story': {
      checkAudio(a.instructionAudioId, where);
      if (a.storyAudioId) checkAudio(a.storyAudioId, where);
      if (a.kind === 'comprehension') {
        const c = (a.choices ?? []).filter((x) => x.correct);
        if (c.length !== 1) err(`sentence-story(comprehension) ${where}: debe tener 1 correcta`);
        if (!a.question) err(`sentence-story(comprehension) ${where}: sin question`);
      }
      break;
    }
    default:
      err(`actividad ${where} con type desconocido: ${a.type}`);
  }
}

// ----- inventory / coverage report -----
const typeCount = {};
const wordSet = new Set();
for (const { a } of allActivities) {
  typeCount[a.type] = (typeCount[a.type] ?? 0) + 1;
  if (a.word) wordSet.add(a.word.toLowerCase());
  if (a.targetText) a.targetText.split(/\s+/).forEach((w) => wordSet.add(w.replace(/[.,]/g, '').toLowerCase()));
}

if (errors.length > 0) {
  console.error(`\nCONTENIDO INVÁLIDO — ${errors.length} errores:`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log('\n=== Inventario de cobertura ===');
console.log(`Actividades totales: ${allActivities.length}`);
for (const [k, v] of Object.entries(typeCount)) console.log(`  ${k}: ${v}`);
console.log(`Palabras distintas: ${wordSet.size}`);
console.log(`Regiones: ${Object.keys(regionMap).length}`);
console.log(`Registros de audio referenciados: ${Object.keys(audioMap).length}`);

if (notes.length) {
  console.log('\nNotas:');
  for (const n of notes) console.log(`  · ${n}`);
}

console.log('\nCONTENIDO VÁLIDO ✓');
