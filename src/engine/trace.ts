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

interface Path {
  strokeIdx: number;
  pointIdx: number;
  p: Point;
  within: boolean;
}

/**
 * Build ordered path of the ideal stroke through resampled user points,
 * greedy nearest-neighbor within stroke order.
 */
function buildPath(user: Point[], stroke: Point[], corridor: number): { path: Path[]; ordered: boolean } {
  const path: Path[] = [];
  let cur = 0; // index into stroke
  for (const u of user) {
    // advance stroke pointer while current stroke point is closer
    let best = cur;
    let bestD = dist(u, stroke[cur]);
    for (let k = cur + 1; k < stroke.length && k < cur + 20; k++) {
      const d = dist(u, stroke[k]);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    const within = bestD <= corridor;
    path.push({ strokeIdx: 0, pointIdx: best, p: u, within });
    cur = best;
  }
  const ordered = path.every((e, i) => i === 0 || e.pointIdx >= path[i - 1].pointIdx - 1);
  const withFlag = path.map((e) => ({ ...e, within: dist(e.p, stroke[e.pointIdx]) <= corridor }));
  return { path: withFlag, ordered };
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
 * Evaluate a trace against the ideal letter stroke at scale 0..1.
 */
export function evaluateTrace(userRaw: Point[], idealStroke: Point[], params: Partial<TraceParams> = {}): TraceResult {
  const p = { ...DEFAULT_PARAMS, ...params };
  if (!userRaw || userRaw.length < (p.minStrokePoints ?? 1)) {
    return { pass: false, coverage: 0, within: 0, ordered: false, startOk: false, tooLong: false, reason: 'too-few-points' };
  }

  const user = resampleByDistance(userRaw, 0.05);
  const stroke = idealStroke;
  const sz = sizeOf(stroke);

  // start checkpoint (§5.5): within 9-15% of the area size.
  const start = user[0];
  const startOk = dist(start, stroke[0]) <= startToleranceFor(p, sz);

  // coverage: fraction of ideal stroke segments covered.
  let withinCount = 0;
  for (const u of user) {
    const d = dist(u, nearest(stroke, u));
    if (d <= p.corridor) withinCount++;
  }
  const within = user.length ? withinCount / user.length : 0;

  // path length vs ideal length
  const idealLen = pathLength(stroke);
  const userLen = pathLength(user);
  const tooLong = userLen > idealLen * (p.maxLengthRatio ?? 3);

  const { ordered } = buildPath(user, stroke, p.corridor);

  // coverage = proportion of ideal stroke that has a user sample within corridor via resample
  let covCount = 0;
  for (const s of stroke) {
    if (minDist(s, user) <= p.corridor) covCount++;
  }
  const coverage = stroke.length ? covCount / stroke.length : 0;

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
function nearest(stroke: Point[], u: Point): Point {
  let b = stroke[0];
  let bd = Infinity;
  for (const s of stroke) {
    const d = dist(u, s);
    if (d < bd) { bd = d; b = s; }
  }
  return b;
}
function minDist(target: Point, pts: Point[]): number {
  let bd = Infinity;
  for (const s of pts) { const d = dist(target, s); if (d < bd) bd = d; }
  return bd;
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
