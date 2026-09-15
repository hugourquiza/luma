// Core domain types shared across the app.

/** Identifies a skill (grapheme, syllable pattern, etc). */
export type SkillId = string;

/** Result buckets kept separate per spec §6. */
export type ResultKind = 'completed' | 'independentCorrect' | 'assistedCorrect' | 'needsPractice';

export type ActivityType =
  | 'listen-choose' // §5.1 escuchar y elegir
  | 'build-word' // §5.2 construir palabras
  | 'read-relate' // §5.3 leer y relacionar
  | 'write-word' // §5.4 escribir palabras
  | 'trace-letter' // §5.5 trazar letras
  | 'sentence-story'; // §5.6 frases e historias

/** A single option/tile in an activity. `id` is unique even when text repeats. */
export interface Choice {
  id: string;
  text?: string;
  imageId?: string;
  audioId?: string;
  correct?: boolean;
}

// ---------- Activity variants (discriminated union, §10) ----------

export interface BaseActivity {
  id: string;
  type: ActivityType;
  skillIds: SkillId[];
  prerequisiteSkillIds: SkillId[];
  instructionAudioId?: string;
  difficulty: number;
  hint?: string;
  hintAudioId?: string;
}

export interface ListenChooseActivity extends BaseActivity {
  type: 'listen-choose';
  /** What the stimulus says aloud. Also used for the visual fallback text. */
  stimulusAudioId: string;
  stimulusText: string;
  choices: Choice[];
  /** ids of choices that are correct (usually one). */
  correctChoiceIds: string[];
}

export interface BuildWordActivity extends BaseActivity {
  type: 'build-word';
  word: string;
  /** Tiles to arrange. text is a syllable or letter. */
  tiles: Choice[];
  solutionTileIds: string[];
  stimulusAudioId: string;
  imageId: string;
}

export interface ReadRelateActivity extends BaseActivity {
  type: 'read-relate';
  /** The word or phrase to read. NOT narrated automatically (§5.3). */
  targetText: string;
  choices: Choice[];
  correctChoiceIds: string[];
  /** A scene description for phrase-level items. */
  sceneText?: string;
}

export interface WriteWordActivity extends BaseActivity {
  type: 'write-word';
  mode: 'copy' | 'complete' | 'dictation';
  word: string;
  model?: string; // for copy: the full word shown
  /** For complete: e.g. "PA_A" where _ is the blank; tiles of valid completion letters. */
  blankPattern?: string;
  completionChoices?: string[];
  stimulusAudioId?: string; // dictation: the word is spoken
  acceptedAnswers: string[]; // explicit accepted responses (§5.4)
  imageId?: string;
  /** Show image meaning (visual cue) — for copy mode. */
}

export interface TraceLetterActivity extends BaseActivity {
  type: 'trace-letter';
  letter: string;
  /** Ordered strokes; each stroke is a list of normalized points {x,y} in [0,1]. */
  strokes: { points: { x: number; y: number }[] }[];
  /** Normalized start/end markers for guidance. */
  start: { x: number; y: number };
  /** Whether a wide-guide/assist mode exists. */
  assistMode: boolean;
}

export interface SentenceStoryActivity extends BaseActivity {
  type: 'sentence-story';
  kind: 'order' | 'comprehension' | 'write';
  sentence: string;
  /** order: shuffled word tiles with solution order. */
  wordTiles: Choice[];
  solutionWordIds: string[];
  /** comprehension: a microhistory + literal question with 2-3 options. */
  storyText?: string;
  question?: string;
  choices?: Choice[];
  correctChoiceIds?: string[];
  /** write: which word of the sentence to write. */
  wordToWrite?: string;
  acceptedAnswers?: string[];
  storyAudioId?: string;
}

export type Activity =
  | ListenChooseActivity
  | BuildWordActivity
  | ReadRelateActivity
  | WriteWordActivity
  | TraceLetterActivity
  | SentenceStoryActivity;

export interface Lesson {
  id: string;
  regionId: string;
  title: string;
  activities: Activity[];
  newActivityIds: string[];
  consolidationActivityIds: string[];
}
