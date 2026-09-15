import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { VOCABULARY } from '../../scripts/build-content';

// Grapheme set that the curriculum may use (letters + ñ + accented vowels).
// Digraphs (ch, ll, rr, qu) split into their letters here; every used letter
// must be in the taught alphabet for its region.
const REGION_GRAPHEMES: string[][] = [
  ['a', 'e', 'i', 'o', 'u'], // region 1: vowels
  ['a', 'e', 'i', 'o', 'u', 'm', 'p', 'l', 's'], // + m,p,l,s
  ['a', 'e', 'i', 'o', 'u', 'm', 'p', 'l', 's', 't', 'n', 'd', 'f'],
  ['a', 'e', 'i', 'o', 'u', 'm', 'p', 'l', 's', 't', 'n', 'd', 'f', 'b', 'v', 'ñ', 'c', 'h', 'q', 'r', 'g', 'j', 'z', 'y'],
  ['a', 'e', 'i', 'o', 'u', 'm', 'p', 'l', 's', 't', 'n', 'd', 'f', 'b', 'v', 'ñ', 'c', 'h', 'q', 'r', 'g', 'j', 'z', 'y'],
];

describe('content curriculum audit (§4)', () => {
  it('regions 2-5 vocabulary uses only letters declared for that region', () => {
    // Region 1 vowel words (ala, ola, uva…) are ILLUSTRATED and HEARD, not
    // decoded (§4: "Las palabras ilustradas se escuchan, sin exigir
    // decodificarlas"), so this audit applies to regions 2+.
    for (let ri = 1; ri < REGION_GRAPHEMES.length; ri++) {
      const allowed = new Set(REGION_GRAPHEMES[ri]);
      const words = (VOCABULARY[`r${ri + 1}`] as readonly string[]) ?? [];
      for (const w of words) {
        const clean = w.normalize('NFC').toLowerCase().replace(/[^a-zñáéíóúü]/g, '');
        for (const ch of clean) {
          const letter = ch.replace(/[áéíóúü]/g, (m) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' } as Record<string, string>)[m]);
          expect(allowed.has(letter), `letter '${letter}' not declared in region ${ri + 1} (word '${w}')`).toBe(true);
        }
      }
    }
  });

  it('keeps ñ and tildes intact in authored words (no accent stripping)', () => {
    const all = Object.values(VOCABULARY).flat() as string[];
    // ensure normalization does not decompose accents away
    for (const w of all) expect(w).toBe(w.normalize('NFC'));
  });

  it('provides at least 40 distinct base words', () => {
    const all = Object.values(VOCABULARY).flat() as string[];
    const distinct = new Set(all.map((w) => w.normalize('NFC').toLowerCase()));
    expect(distinct.size).toBeGreaterThanOrEqual(40);
  });
});

describe('content structure: unique ids & resolvability', () => {
  it('all region JSON have unique activity ids', () => {
    const files = readdirSync('public/content').filter((f) => f.endsWith('.json') && f !== 'index.json');
    for (const f of files) {
      const region = JSON.parse(readFileSync(`public/content/${f}`, 'utf8')) as {
        lessons: { activities: { id: string }[] }[];
      };
      const ids = region.lessons.flatMap((l) => l.activities.map((a) => a.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('every lesson has exactly 6 activities', () => {
    const files = readdirSync('public/content').filter((f) => f.endsWith('.json') && f !== 'index.json');
    for (const f of files) {
      const region = JSON.parse(readFileSync(`public/content/${f}`, 'utf8')) as {
        lessons: { activities: { id: string }[] }[];
      };
      for (const l of region.lessons) expect(l.activities.length).toBe(6);
    }
  });
});
