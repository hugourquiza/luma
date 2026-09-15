import { describe, it, expect } from 'vitest';
import { normalizeInput, compareAnswer } from '../../src/engine/normalize';

describe('compareAnswer (§5.4)', () => {
  it('accepts exact word (case-insensitive)', () => {
    expect(compareAnswer('mapa', ['mapa']).ok).toBe(true);
    expect(compareAnswer('MAPA', ['mapa']).ok).toBe(true);
    expect(compareAnswer('  MAPA  ', ['mapa']).ok).toBe(true);
  });

  it('does NOT confuse n with ñ', () => {
    const r = compareAnswer('bano', ['baño']);
    expect(r.ok).toBe(false);
    expect(r.onlyMissingAccent).toBe(false);
  });

  it('treats a missing tilde as accent-support, not correct', () => {
    const r = compareAnswer('comio', ['comió']);
    expect(r.ok).toBe(false);
    expect(r.onlyMissingAccent).toBe(true);
  });

  it('rejects a different word even if similar', () => {
    const r = compareAnswer('mata', ['mapa']);
    expect(r.ok).toBe(false);
    expect(r.onlyMissingAccent).toBe(false);
  });

  it('normalizes NFC and inner whitespace', () => {
    expect(normalizeInput('ca\u0301mara')).toBe('cámara'); // NFC form
    expect(normalizeInput('  la   luna ')).toBe('la luna');
  });
});
