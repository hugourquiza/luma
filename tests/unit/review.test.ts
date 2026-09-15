import { describe, it, expect } from 'vitest';
import { mulberry32, hashCode } from '../../src/engine/random';
import { scheduleFor, type AttemptRecord } from '../../src/engine/review';

describe('mulberry32 & hashing (determinism)', () => {
  it('is repeatable for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('differs for a different seed', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('hashCode is stable', () => {
    expect(hashCode('act-1')).toBe(hashCode('act-1'));
    expect(hashCode('act-1')).not.toBe(hashCode('act-2'));
  });
});

describe('scheduleFor (§6.3 spaced review)', () => {
  const now = 1_000_000_000_000;
  const record = (outcome: AttemptRecord['outcome'], offsetDays: number): AttemptRecord => ({
    activityId: 'a1', outcome, sessionId: 's', timestamp: now - offsetDays * 86_400_000,
  });

  it('independent → scheduled at 1,3,7 days (by streak)', () => {
    // just practiced (< 1 day): not due yet
    const justDone = scheduleFor([record('independent', 0.1)], now);
    expect(justDone.streak).toBe(1);
    expect(justDone.dueNow).toBe(false);
    // 1+ day elapsed since last independent: due now
    const dayPassed = scheduleFor([record('independent', 1)], now);
    expect(dayPassed.dueNow).toBe(true);
  });

  it('error/assisted → pending for next session (dueNow true)', () => {
    const plan = scheduleFor([record('error', 0)], now);
    expect(plan.dueNow).toBe(true);
    const plan2 = scheduleFor([record('assisted', 0)], now);
    expect(plan2.dueNow).toBe(true);
  });

  it('long streak keeps 7-day interval', () => {
    const records = [
      record('independent', 6), record('independent', 4), record('independent', 3),
      record('independent', 1), record('independent', 0),
    ];
    const plan = scheduleFor(records, now);
    expect(plan.streak).toBe(5);
    expect(plan.intervalsDays).toEqual([1, 3, 7]);
  });
});
