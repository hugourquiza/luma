// Review (repaso) engine: pure, deterministic, seeded (§6).
// It decides which 2 consolidation activities accompany 4 new ones per lesson,
// and drives the "afianzándose" heuristic and spaced review scheduling.

import { hashCode } from './random';

export type Outcome = 'independent' | 'assisted' | 'error';

export interface AttemptRecord {
  activityId: string;
  outcome: Outcome;
  sessionId: string;
  timestamp: number;
}

export interface ReviewSelection {
  /** activity ids to include as the 2 consolidation slots. */
  reviewActivityIds: string[];
}

export interface SchedulePlan {
  activityId: string;
  intervalsDays: number[]; // cumulative e.g. [1,3,7]
  dueNow: boolean;
  streak: number;
}

// ---------- Scheduling (§6.3) ----------

export interface ActivityProgressAggregate {
  activityId: string;
  /** count of independent corrects in last 5 evals. */
  last5Independent: number;
  totalIndependent: number;
  practicedAt: number[]; // unix ms timestamps of evaluations
  lastErrors: number; // recent error/assisted count
}

/**
 * Pure: given a profile's history for an activity, compute the next spaced
 * review schedule. Independent correct → 1,3,7 days by streak; reaching 7
 * keeps 7. Error/assisted → pending for next session.
 */
export function scheduleFor(records: AttemptRecord[], now = Date.now()): SchedulePlan {
  // compute streak of trailing independent
  const recent = [...records].sort((a, b) => b.timestamp - a.timestamp);
  let streak = 0;
  for (const r of recent) {
    if (r.outcome === 'independent') streak++;
    else break;
  }
  const intervals = [1, 3, 7];
  const idx = Math.min(streak, intervals.length) - 1;
  const last = recent[0];
  if (!last) return { activityId: recent.length ? recent[0].activityId : '', intervalsDays: intervals, dueNow: true, streak: 0 };
  const daysSince = (now - last.timestamp) / 86400000;
  const dueNow = last.outcome !== 'independent' || daysSince >= intervals[idx];
  return { activityId: recent[0].activityId, intervalsDays: intervals, dueNow, streak };
}

export interface ConsolidationCandidate {
  activityId: string;
  skillScore: number;
  lastPractice: number;
}

/**
 * Deterministic selection of review activities for a lesson (§6.1, §6.2).
 * Order of preference:
 *   1. skills with recent assistance (pending review)
 *   2. pending review (overdue)
 *   3. least practiced
 * Among equals, tiebreak by activityId hash for determinism.
 */
export function selectReviewActivities(
  newActivityIds: string[], // the 4 new content activities in the lesson
  lessonConsolidationIds: string[], // the 2 defined consolidation activities (§6.1)
  candidates: ConsolidationCandidate[],
  history: SchedulePlan[], // precomputed schedules for candidates
  _seed: number,
): ReviewSelection {
  const used = new Set(newActivityIds);
  const pool = candidates
    .filter((c) => !used.has(c.activityId));

  const scored = pool
    .map((c) => {
      const plan = history.find((h) => h.activityId === c.activityId);
      const priority =
        (c.skillScore > 0.9 ? 0 : 1) + // recent assistance → highest
        (plan && plan.dueNow ? 0 : 2);
      const last = c.lastPractice;
      // least practiced → higher priority (lower total score → chosen first)
      return { c, priority, last, score: priority * 1e9 - last };
    })
    .sort((a, b) => a.score - b.score || hashCode(a.c.activityId).toString().localeCompare(b.c.activityId.toString()));
  // ensure deterministic tiebreak
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const ah = hashCode(a.c.activityId);
    const bh = hashCode(b.c.activityId);
    return ah < bh ? -1 : ah > bh ? 1 : 0;
  });

  // take up to 2, else fall back to lesson-defined consolidation ids.
  const chosen = scored.slice(0, 2).map((s) => s.c.activityId);
  let result = chosen;
  if (result.length < 2) {
    const needed = 2 - result.length;
    const fallback = lessonConsolidationIds.filter((id) => !used.has(id)).slice(0, needed);
    result = [...result, ...fallback];
  }
  return { reviewActivityIds: result };
}
