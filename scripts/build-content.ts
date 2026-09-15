// Content builder: constructs the 5 regions' lessons programmatically from
// curriculum word lists, per §4/§5. Emits JSON to public/content/.
// This keeps 120+ activities consistent, de-duplicated and validatable.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------- curriculum vocabulary (per §4 tables + cumulative audit) ----------

// Each word lists the graphèmes it introduces beyond the region's base.
// AUDIT: only use graphèmes declared for this region or earlier.

export const VOCABULARY: Record<string, readonly string[]> = {
  r1: ['ala', 'ele', 'ola', 'oso', 'una', 'uva', 'ojo', 'uva', 'ala', 'oso', 'uno'],
  r2: ['mapa', 'pala', 'mesa', 'lupa', 'sopa', 'suma', 'sala', 'sapo', 'loma', 'piso', 'mula', 'mila', 'miso'],
  r3: ['tela', 'pato', 'luna', 'dado', 'foto', 'sol', 'pan', 'nata', 'fila', 'tina', 'duna', 'sal', 'don'],
  r4: ['vaca', 'boca', 'baño', 'leche', 'queso', 'rama', 'pera', 'perro', 'vela', 'bote', 'rosa', 'chivo', 'remo'],
  r5: ['la', 'luna', 'ilumina', 'el', 'patio', 'mira', 'el', 'sol'],
} as const;

export const SENTENCES = {
  r5: [
    { sentence: 'La luna ilumina el patio.', words: ['La', 'luna', 'ilumina', 'el', 'patio'] },
  ],
};

export const MICRO_STORIES = {
  r5: [
    {
      title: 'La luna',
      text: 'Sale la luna. La luna ilumina el patio. Mira el sol de la mañana.',
      question: '¿Qué ilumina la luna?',
      options: ['el patio', 'la mesa', 'el oso'],
      answer: 'el patio',
    },
  ],
};

// ---------- lesson composition ----------
// 5 regions, 4 lessons each. Each lesson = 4 new-content activities + 2 review.

const REGIONS = [
  {
    id: 'playa-vocales',
    name: 'Playa de las vocales',
    color: 'sand',
    skills: ['a', 'e', 'i', 'o', 'u'],
    letters: ['A', 'E', 'I', 'O', 'U'],
  },
  {
    id: 'bosque-sonidos',
    name: 'Bosque de los sonidos',
    color: 'forest',
    skills: ['m', 'p', 'l', 's'],
    letters: ['m', 'p', 'l', 's'],
  },
  {
    id: 'rio-palabras',
    name: 'Río de las palabras',
    color: 'river',
    skills: ['t', 'n', 'd', 'f'],
    letters: ['t', 'n', 'd', 'f'],
  },
  {
    id: 'taller-letras',
    name: 'Taller de las letras',
    color: 'workshop',
    skills: ['b', 'v', 'ñ', 'ch', 'c', 'qu', 'r'],
    letters: ['b', 'v', 'ñ', 'ch', 'c', 'q', 'r'],
  },
  {
    id: 'biblioteca-historias',
    name: 'Biblioteca de historias',
    color: 'library',
    skills: ['leer', 'comprender'],
    letters: [],
  },
] as const;

// ---- word-level helpers ----
export function syllables(word: string): string[] {
  const v = 'aeiouáéíóúü';
  const out: string[] = [];
  let i = 0;
  const n = word.length;
  while (i < n) {
    if (v.includes(word[i])) {
      let end = i + 1;
      if (end < n && !v.includes(word[end])) {
        end++; // CV
      }
      out.push(word.slice(i, end));
      i = end;
    } else {
      out.push(word[i]);
      i++;
    }
  }
  return out;
}

export function letters(word: string): string[] {
  return word.normalize('NFC').split('');
}

export function uppercase(w: string): string {
  return w.normalize('NFC').toUpperCase();
}

// ---- activity builders ----

export function listenChoose(
  lessonId: string,
  idx: number,
  word: string,
  distractors: string[],
  difficulty = 1,
  opts: Record<string, unknown> = {},
): unknown {
  const choices = buildChoices(word, distractors);
  return {
    id: `${lessonId}-a${idx}-listen`,
    type: 'listen-choose',
    skillIds: [lessonId.split('-')[0] === 'playa' ? 'vowels' : `sound-${word[0]}`],
    prerequisiteSkillIds: [],
    instructionAudioId: 'instruction-listen',
    difficulty,
    hint: opts.hint ?? `Escuchá la palabra ${word}.`,
    hintAudioId: `hint-${slug(word)}`,
    stimulusAudioId: `word-${slug(word)}`,
    stimulusText: word,
    choices,
    correctChoiceIds: choices.filter((c: any) => c.correct).map((c: any) => c.id),
  };
}

export function readRelate(
  lessonId: string,
  idx: number,
  word: string,
  distractorWords: string[],
  difficulty = 1,
): unknown {
  const choices = buildChoices(word, distractorWords, true);
  return {
    id: `${lessonId}-a${idx}-read`,
    type: 'read-relate',
    skillIds: ['read-' + slug(word)],
    prerequisiteSkillIds: [],
    instructionAudioId: 'instruction-read',
    difficulty,
    hint: `¿Cuál dice ${word}?`,
    hintAudioId: `hint-${slug(word)}`,
    targetText: uppercase(word),
    choices,
    correctChoiceIds: choices.filter((c: any) => c.correct).map((c: any) => c.id),
  };
}

export function buildWord(
  lessonId: string,
  idx: number,
  word: string,
  distractorPieces: string[],
  difficulty = 1,
  useLetters = false,
): unknown {
  const solution = useLetters ? letters(word) : syllables(word);
  const tiles = [...solution.map((t, i) => ({ id: `t${i}-${t}`, text: uppercase(t) }))];
  // extra distractor tiles
  const distract = distractorPieces.slice(0, 2).map((t, i) => ({ id: `tx${i}-${t}`, text: uppercase(t) }));
  const all = shuffle([...tiles, ...distract], slug(word));
  return {
    id: `${lessonId}-a${idx}-build`,
    type: 'build-word',
    skillIds: ['write-' + slug(word)],
    prerequisiteSkillIds: [],
    instructionAudioId: 'instruction-build',
    difficulty,
    hint: `La palabra completa es ${word}.`,
    hintAudioId: `hint-${slug(word)}`,
    word: uppercase(word),
    tiles: all,
    solutionTileIds: tiles.map((t) => t.id),
    stimulusAudioId: `word-${slug(word)}`,
    imageId: slug(word),
  };
}

export function writeWord(
  lessonId: string,
  idx: number,
  word: string,
  mode: 'copy' | 'complete' | 'dictation',
  difficulty = 1,
  completionChoices?: string[],
): unknown {
  return {
    id: `${lessonId}-a${idx}-write`,
    type: 'write-word',
    skillIds: ['spell-' + slug(word)],
    prerequisiteSkillIds: [],
    instructionAudioId: mode === 'dictation' ? 'instruction-dictate' : 'instruction-write-copy',
    difficulty,
    hint: `La palabra es ${word}.`,
    hintAudioId: `hint-${slug(word)}`,
    mode,
    word: lowercase(word),
    model: mode === 'copy' ? uppercase(word) : undefined,
    acceptedAnswers: [word, uppercase(word)],
    ...(mode === 'complete' ? { blankPattern: blankOf(word), completionChoices: completionChoices ?? ['a', 'e', 'i', 'o', 'u'] } : {}),
    ...(mode === 'dictation' ? { stimulusAudioId: `word-${slug(word)}` } : {}),
    imageId: slug(word),
  };
}

// trace activity
export function traceLetter(
  lessonId: string,
  idx: number,
  letter: string,
  difficulty = 1,
): unknown {
  return {
    id: `${lessonId}-a${idx}-trace`,
    type: 'trace-letter',
    skillIds: ['trace-' + letter],
    prerequisiteSkillIds: [],
    instructionAudioId: 'instruction-trace',
    difficulty,
    hint: `Dibujá la letra ${uppercase(letter)}.`,
    hintAudioId: `hint-letter-${letter}`,
    letter: uppercase(letter),
    strokes: strokesFor(letter),
    start: startFor(letter),
    assistMode: true,
  };
}

export function sentenceStory(
  lessonId: string,
  idx: number,
  kind: 'order' | 'comprehension' | 'write',
  difficulty = 1,
): unknown {
  const story = MICRO_STORIES.r5[0];
  const words = story.text.split(' ');
  const solution = words.map((_, i) => `w${i}`);
  const shuffled = shuffle(words.map((w, i) => ({ id: `w${i}`, text: w })), 'story');
  return {
    id: `${lessonId}-a${idx}-story`,
    type: 'sentence-story',
    skillIds: [kind === 'comprehension' ? 'comprender' : 'leer-frase'],
    prerequisiteSkillIds: [],
    instructionAudioId: 'instruction-story',
    difficulty,
    kind,
    sentence: story.text,
    storyText: story.text,
    storyAudioId: 'story-luna',
    ...(kind === 'order' ? { wordTiles: shuffled, solutionWordIds: solution } : {}),
    ...(kind === 'comprehension' ? { question: story.question, choices: story.options.map((o, i) => ({ id: `o${i}`, text: o, correct: o === story.answer })), correctChoiceIds: story.options.map((o, i) => (o === story.answer ? `o${i}` : '')).filter(Boolean) } : {}),
    ...(kind === 'write' ? { wordToWrite: 'patio', acceptedAnswers: ['patio'] } : {}),
  };
}

// ---------- lesson assembly ----------
// 4 lessons per region. Lesson = new-content activities (4) + defined
// consolidation (2). We vary mechanics across lessons as required (§5).

function buildRegion(region: (typeof REGIONS)[number], rIndex: number): unknown {
  const lessons = [];
  const wordPool = VOCABULARY[`r${rIndex + 1}`] as readonly string[];
  // unique words
  const words = [...new Set(wordPool)];

  for (let li = 0; li < 4; li++) {
    // pick base words for this lesson
    const lessonWords = words.slice(li * 2, li * 2 + 3);
    const w1 = lessonWords[0] ?? 'ala';
    const w2 = lessonWords[1] ?? 'oso';

    // 4 new-content activities + rotate mechanics per lesson.
    // Lesson 0: listen + read + trace + build
    // Lesson 1: listen + build(letters) + write + trace
    // Lesson 2: read + build + write(copy) + listen
    // Lesson 3: build + write(dictation) + read + listen
    // Region 1 (r-index 0) has no syllable words, so use trace/build on letters.

    // Distractor pool = other words in region.
    const distractors = words.filter((w) => w !== w1).slice(0, 3);

    const lessonId = `${region.id}-l${li + 1}`;

    let seq: unknown[] = [];
    if (rIndex === 0) {
      seq = [
        listenChoose(lessonId, 0, w1, distractors),
        readRelate(lessonId, 1, w1, [w2, ...distractors]),
        traceLetter(lessonId, 2, region.letters[li] ?? 'a'),
        buildWord(lessonId, 3, w1, ['A'], 1, true),
      ];
    } else if (rIndex === 4) {
      // library: sentence activities
      seq = [
        sentenceStory(lessonId, 0, 'order'),
        sentenceStory(lessonId, 1, 'comprehension'),
        sentenceStory(lessonId, 2, 'write'),
        listenChoose(lessonId, 3, 'sol', ['mesa', 'pan']),
      ];
    } else {
      seq = [
        listenChoose(lessonId, 0, w1, distractors),
        rIndex % 2 === 0 ? buildWord(lessonId, 1, w1, ['la'], 1, li % 2 === 0) : readRelate(lessonId, 1, w1, [w2, ...distractors.slice(0, 1)]),
        rIndex % 2 === 0 ? readRelate(lessonId, 2, w2, [w1, ...distractors.slice(0, 1)]) : buildWord(lessonId, 2, w2, ['su'], 1, li % 2 === 1),
        rIndex % 2 === 0 ? writeWord(lessonId, 3, w1, li % 2 === 0 ? 'copy' : 'complete', 1) : writeWord(lessonId, 3, w1, 'dictation', 1),
      ];
    }
    const consolidation: unknown[] = rIndex === 0
      ? [traceLetter(lessonId, 8, region.letters[(li + 1) % 4] ?? 'a'), readRelate(lessonId, 9, w2, [w1])]
      : rIndex === 4
        ? [sentenceStory(lessonId, 8, 'comprehension'), sentenceStory(lessonId, 9, 'write')]
        : [listenChoose(lessonId, 8, w2, [w1]), buildWord(lessonId, 9, w2, ['pa'], 1)];

    lessons.push({
      id: lessonId,
      regionId: region.id,
      title: `Lección ${li + 1}`,
      activities: [...seq, ...consolidation],
      newActivityIds: seq.map((a: any) => a.id),
      consolidationActivityIds: consolidation.map((a: any) => a.id),
    });
  }
  return {
    id: region.id,
    name: region.name,
    color: region.color,
    skills: region.skills,
    lessons,
  };
}

// ---------- helpers ----------

function slug(w: string): string {
  return w.normalize('NFC').toLowerCase();
}
function lowercase(w: string): string {
  return w.normalize('NFC').toLowerCase();
}
/** Build a choice set: correct word + distractors (with images/audio). */
function buildChoices(word: string, distractors: string[], audioOnly = false): any[] {
  const set = [...new Set([word, ...distractors])].slice(0, 4);
  const shuffled = shuffle(set, word);
  return shuffled.map((t, i) => ({
    id: `c${i}-${slug(t)}`,
    text: uppercase(t),
    imageId: slug(t),
    ...(audioOnly ? {} : { audioId: `word-${slug(t)}` }),
    correct: t === word,
  }));
}

function shuffle<T>(arr: T[], seedStr: string): T[] {
  let s = seedStr.length;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 31 + 7) % 997;
    const j = (s * (i + 1)) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function blankOf(word: string): string {
  // complete the missing letter: blank out the first vowel
  const letters = word.normalize('NFC').split('');
  const idx = letters.findIndex((ch) => 'aeiou'.includes(ch.toLowerCase()));
  return letters.map((ch, i) => (i === idx ? '_' : ch)).join('');
}

// Ideal strokes for tracing (normalized 0..1). Simplified glyph skeletons.
function strokesFor(letter: string): { points: { x: number; y: number }[] }[] {
  const P = (x: number, y: number) => ({ x, y });
  const map: Record<string, { points: { x: number; y: number }[] }[]> = {
    A: [{ points: [P(0.15, 1), P(0.5, 0.1), P(0.85, 1)] }, { points: [P(0.3, 0.65), P(0.7, 0.65)] }],
    E: [{ points: [P(0.3, 0.15), P(0.7, 0.15), P(0.3, 0.15), P(0.3, 0.85), P(0.7, 0.85)] }],
    I: [{ points: [P(0.4, 0.1), P(0.4, 0.9)] }],
    O: [{ points: [P(0.85, 0.5), P(0.5, 0.15), P(0.15, 0.5), P(0.5, 0.85), P(0.85, 0.5)] }],
    U: [{ points: [P(0.2, 0.1), P(0.2, 0.6), P(0.5, 0.85), P(0.8, 0.6), P(0.8, 0.1)] }],
    m: [{ points: [P(0.15, 0.9), P(0.15, 0.3), P(0.35, 0.3), P(0.45, 0.5), P(0.45, 0.3), P(0.65, 0.3), P(0.75, 0.5), P(0.75, 0.3)] }],
    p: [{ points: [P(0.3, 0.1), P(0.3, 0.9)] }, { points: [P(0.3, 0.4), P(0.7, 0.4), P(0.7, 0.65), P(0.3, 0.65)] }],
    l: [{ points: [P(0.4, 0.1), P(0.4, 0.85)] }],
    s: [{ points: [P(0.3, 0.2), P(0.6, 0.2), P(0.65, 0.35), P(0.35, 0.5), P(0.65, 0.7), P(0.6, 0.85), P(0.3, 0.85)] }],
  };
  return map[letter.toUpperCase()] ?? [
    { points: [P(0.25, 0.2), P(0.25, 0.8), P(0.75, 0.8)] },
  ];
}
function startFor(letter: string): { x: number; y: number } {
  const s = strokesFor(letter)[0]?.points[0] ?? { x: 0.5, y: 0.5 };
  return s;
}

// ---------- emit ----------

export function main(): void {
  const regions = REGIONS.map(buildRegion);
  const outDir = resolve(process.cwd(), 'public/content');
  mkdirSync(outDir, { recursive: true });
  for (const r of regions as any[]) {
    writeFileSync(resolve(outDir, `${r.id}.json`), JSON.stringify(r, null, 2));
  }
  writeFileSync(resolve(outDir, 'index.json'), JSON.stringify({
    version: 1, generatedAt: Date.now(),
    regions: (regions as any[]).map((r) => ({ id: r.id, name: r.name, color: r.color, lessonCount: r.lessons.length })),
  }, null, 2));
  console.log('Wrote content:');
  (regions as any[]).forEach((r) => console.log(`  ${r.id}: ${r.lessons.length} lessons`));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
