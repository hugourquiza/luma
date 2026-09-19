// Tracing heuristic (§5.5). Heuristic only — NOT a validated pedagogical
// metric. Never implies mastery or writing competence.

export interface Point {
  x: number;
  y: number;
}

export interface TraceResult {
  pass: boolean;
  coverage: number; // 0..1
  within: number; // fraction of samples inside tolerance corridor
  ordered: boolean;
  startOk: boolean;
  tooLong: boolean;
  reason: string;
}

export interface TraceParams {
  startTolerance: number; // in units of area size (spec: 0.12)
  coverageMin: number; // 0.70
  withinMin: number; // 0.65
  corridor: number; // 0.10
  allowStartTolerance?: number;
  minStrokePoints?: number;
  maxLengthRatio?: number;
}

export const DEFAULT_PARAMS: TraceParams = {
  startTolerance: 0.12,
  coverageMin: 0.7,
  withinMin: 0.65,
  corridor: 0.1,
  minStrokePoints: 10,
  maxLengthRatio: 3.0,
};

/** Euclidean distance. */
export function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Downsample by arc length so event frequency doesn't matter (§5.5). */
export function resampleByDistance(pts: Point[], step = 0.05): Point[] {
  if (pts.length < 2) return pts;
  const out: Point[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    acc += d;
    if (acc >= step) {
      out.push(pts[i]);
      acc = 0;
    }
  }
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

/** Distance from point p to segment ab. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + abx * t, y: a.y + aby * t });
}

/** Distance from p to the closest point of a polyline (segments, not just vertices). */
export function distToPolyline(p: Point, poly: Point[]): number {
  if (poly.length === 0) return Infinity;
  if (poly.length === 1) return dist(p, poly[0]);
  let bd = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const d = distToSegment(p, poly[i - 1], poly[i]);
    if (d < bd) bd = d;
  }
  return bd;
}

/** Interpolate a polyline so consecutive samples are at most `step` apart. */
export function densify(pts: Point[], step = 0.05): Point[] {
  if (pts.length < 2) return pts.slice();
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  return out;
}

/** Accept a single polyline or a list of strokes; always work with strokes. */
export type StrokeInput = Point[] | Point[][];
function toStrokes(input: StrokeInput): Point[][] {
  if (input.length === 0) return [];
  return Array.isArray(input[0]) ? (input as Point[][]) : [input as Point[]];
}

/**
 * Ordering check: walk the user samples and greedily advance a cursor along
 * the densified ideal path. Large backwards jumps mean the letter was drawn
 * out of order.
 */
function isOrdered(user: Point[], idealDense: Point[], corridor: number): boolean {
  if (idealDense.length === 0) return true;
  let cur = 0;
  const window = Math.max(20, Math.ceil(idealDense.length * 0.6));
  const backSlack = Math.max(3, Math.ceil(idealDense.length * 0.15));
  for (const u of user) {
    let best = cur;
    let bestD = dist(u, idealDense[cur]);
    const from = Math.max(0, cur - backSlack);
    for (let k = from; k < idealDense.length && k < cur + window; k++) {
      const d = dist(u, idealDense[k]);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (bestD > corridor) continue; // off-path samples don't count for order
    if (best < cur - backSlack) return false;
    cur = Math.max(cur, best);
  }
  return true;
}

function sizeOf(stroke: Point[]): number {
  if (stroke.length < 2) return 1;
  const xs = stroke.map((p) => p.x);
  const ys = stroke.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return Math.max(w, h, 0.0001);
}

/**
 * Evaluate a trace against the ideal letter at scale 0..1. Both arguments may
 * be a single polyline or a list of strokes (one per pen-down gesture).
 * Distances are measured to segments, so a straight leg drawn between two far
 * apart vertices counts as "inside the corridor" along its whole length.
 */
export function evaluateTrace(userRaw: StrokeInput, idealIn: StrokeInput, params: Partial<TraceParams> = {}): TraceResult {
  const p = { ...DEFAULT_PARAMS, ...params };
  const rawStrokes = toStrokes(userRaw ?? []);
  const rawCount = rawStrokes.reduce((n, s) => n + s.length, 0);
  if (rawCount < (p.minStrokePoints ?? 1)) {
    return { pass: false, coverage: 0, within: 0, ordered: false, startOk: false, tooLong: false, reason: 'too-few-points' };
  }

  const userStrokes = rawStrokes.map((s) => resampleByDistance(s, 0.05)).filter((s) => s.length > 0);
  const idealStrokes = toStrokes(idealIn).filter((s) => s.length > 0);
  const user = userStrokes.flat();
  const ideal = idealStrokes.flat();
  if (user.length === 0 || ideal.length === 0) {
    return { pass: false, coverage: 0, within: 0, ordered: false, startOk: false, tooLong: false, reason: 'too-few-points' };
  }
  const sz = sizeOf(ideal);

  // start checkpoint (§5.5): within 9-15% of the area size.
  const startOk = dist(user[0], ideal[0]) <= startToleranceFor(p, sz);

  // within: fraction of user samples close to some ideal stroke.
  let withinCount = 0;
  for (const u of user) {
    const d = Math.min(...idealStrokes.map((s) => distToPolyline(u, s)));
    if (d <= p.corridor) withinCount++;
  }
  const within = withinCount / user.length;

  // coverage: fraction of the (densified) ideal path that has user ink nearby,
  // taken per ideal stroke and reported as the weakest one, so a short stroke
  // (the crossbar of "A") cannot be skipped just because the legs are long.
  const idealDenseStrokes = idealStrokes.map((s) => densify(s, 0.05));
  const idealDense = idealDenseStrokes.flat();
  let coverage = 1;
  for (const ds of idealDenseStrokes) {
    let covCount = 0;
    for (const s of ds) {
      const d = Math.min(...userStrokes.map((u) => distToPolyline(s, u)));
      if (d <= p.corridor) covCount++;
    }
    coverage = Math.min(coverage, ds.length ? covCount / ds.length : 0);
  }

  // path length vs ideal length (per stroke, so pen lifts don't count)
  const idealLen = idealStrokes.reduce((l, s) => l + pathLength(s), 0);
  const userLen = userStrokes.reduce((l, s) => l + pathLength(s), 0);
  const tooLong = userLen > idealLen * (p.maxLengthRatio ?? 3);

  const ordered = isOrdered(user, idealDense, p.corridor);

  const pass =
    startOk && coverage >= p.coverageMin && within >= p.withinMin && ordered && !tooLong;

  return {
    pass,
    coverage,
    within,
    ordered,
    startOk,
    tooLong,
    reason: pass ? 'ok' : failReason({ startOk, coverage, withinMin: p.withinMin, ordered, tooLong, coverageMin: p.coverageMin }),
  };
}

function startToleranceFor(p: TraceParams, sz: number): number {
  return p.startTolerance * sz;
}
function pathLength(pts: Point[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}
function failReason(r: { startOk: boolean; coverage: number; withinMin: number; ordered: boolean; tooLong: boolean; coverageMin: number }): string {
  if (!r.startOk) return 'wrong-start';
  if (r.coverage < r.coverageMin) return 'low-coverage';
  if (!r.ordered) return 'out-of-order';
  if (r.tooLong) return 'too-long';
  return 'low-tolerance';
}
