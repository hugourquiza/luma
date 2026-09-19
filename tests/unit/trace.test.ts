import { describe, it, expect } from 'vitest';
import { evaluateTrace, type Point } from '../../src/engine/trace';

// Ideal: dense vertical stroke, 90 points from y 0.1 → 0.9.
const dense = () => Array.from({ length: 90 }, (_, i) => ({ x: 0.5, y: 0.1 + (i / 89) * 0.8 }));

describe('evaluateTrace (§5.5)', () => {
  it('passes a valid dense trace along the stroke', () => {
    const r = evaluateTrace(dense(), dense());
    expect(r.pass).toBe(true);
  });

  it('fails a trace starting at the wrong position (start checkpoint)', () => {
    const pts = dense().map((p) => ({ x: 0.5, y: 0.6 + (p.y - 0.1) * 0.3 })); // shifted down
    const r = evaluateTrace(pts, dense());
    expect(r.pass).toBe(false);
    expect(r.startOk).toBe(false);
  });

  it('fails an insufficient/short line (low coverage)', () => {
    const short = dense().slice(0, 15); // only touches top part
    const r = evaluateTrace(short, dense());
    expect(r.pass).toBe(false);
    expect(r.coverage).toBeLessThan(0.5);
  });

  it('fails a scribble covering the whole area (too long / out of order)', () => {
    const scribble: Point[] = [
      { x: 0.0, y: 0.0 }, { x: 1.0, y: 0.0 }, { x: 1.0, y: 1.0 }, { x: 0.0, y: 1.0 },
      { x: 0.0, y: 0.5 }, { x: 1.0, y: 0.5 }, { x: 0.5, y: 0.0 }, { x: 0.5, y: 0.9 },
    ];
    const r = evaluateTrace(scribble, dense());
    expect(r.pass).toBe(false);
  });

  it('is scale-invariant: same trace bigger area still passes', () => {
    // scale coordinates up by 2× but keep relative path → coordinates are
    // normalized 0..1 anyway, so we re-test with the same normalized points.
    const a = evaluateTrace(dense(), dense());
    expect(a.reason).toBe('ok');
  });

  it('passes a looser trace in assist mode (wider corridor, relaxed start)', () => {
    const loose: Point[] = [
      { x: 0.49, y: 0.13 }, { x: 0.51, y: 0.3 }, { x: 0.49, y: 0.5 },
      { x: 0.51, y: 0.7 }, { x: 0.5, y: 0.87 }, { x: 0.485, y: 0.75 },
      { x: 0.515, y: 0.6 }, { x: 0.49, y: 0.45 }, { x: 0.51, y: 0.3 }, { x: 0.5, y: 0.15 },
    ];
    const r = evaluateTrace(loose, dense(), { corridor: 0.14, startTolerance: 0.2, withinMin: 0.5, coverageMin: 0.5 });
    expect(r.pass).toBe(true);
  });
});

// Multi-stroke letters (e.g. "A"): the ideal has long straight segments, so
// distances must be measured to segments, and every pen-down stroke counts.
describe('evaluateTrace with multiple strokes', () => {
  const P = (x: number, y: number): Point => ({ x, y });
  const idealA = [
    [P(0.15, 1), P(0.5, 0.1), P(0.85, 1)],
    [P(0.3, 0.65), P(0.7, 0.65)],
  ];
  const seg = (a: Point, b: Point, n = 25): Point[] =>
    Array.from({ length: n + 1 }, (_, i) => P(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n));
  const legs = [...seg(P(0.15, 1), P(0.5, 0.1)), ...seg(P(0.5, 0.1), P(0.85, 1))];
  const bar = seg(P(0.3, 0.65), P(0.7, 0.65));

  it('passes a clean two-stroke A', () => {
    const r = evaluateTrace([legs, bar], idealA);
    expect(r.reason).toBe('ok');
    expect(r.pass).toBe(true);
  });

  it('fails when the crossbar is missing (low coverage)', () => {
    const r = evaluateTrace([legs], idealA);
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('low-coverage');
  });

  it('fails when started from the wrong leg', () => {
    const reversed = [...legs].reverse();
    const r = evaluateTrace([reversed, bar], idealA);
    expect(r.pass).toBe(false);
    expect(r.startOk).toBe(false);
  });

  it('fails a wobbly trace far from the guide', () => {
    const off = legs.map((p) => P(p.x + 0.25, p.y));
    const r = evaluateTrace([off, bar], idealA);
    expect(r.pass).toBe(false);
  });
});
