import {
  INITIAL_STREAK,
  completeDay,
  daysToNextMultiplier,
  multiplierForStreak,
  settleMissedDays,
} from '../streak';
import { addDays } from '../dates';
import type { StreakState } from '../types';

const D0 = '2026-03-01';

function runDays(n: number, from = INITIAL_STREAK, start = D0): StreakState {
  let s = from;
  for (let i = 0; i < n; i++) s = completeDay(s, addDays(start, i));
  return s;
}

describe('multiplierForStreak', () => {
  it.each([
    [0, 1],
    [2, 1],
    [3, 1.5],
    [6, 1.5],
    [7, 2],
    [13, 2],
    [14, 2.5],
    [29, 2.5],
    [30, 3],
    [365, 3],
  ])('streak %i → ×%f', (streak, expected) => {
    expect(multiplierForStreak(streak)).toBe(expected);
  });

  it('tells how far the next tier is', () => {
    expect(daysToNextMultiplier(0)).toEqual({ days: 3, multiplier: 1.5 });
    expect(daysToNextMultiplier(10)).toEqual({ days: 4, multiplier: 2.5 });
    expect(daysToNextMultiplier(30)).toBeNull();
  });
});

describe('completeDay', () => {
  it('increments on consecutive days', () => {
    const s = runDays(3);
    expect(s.count).toBe(3);
    expect(s.bestCount).toBe(3);
    expect(s.lastCompletedDay).toBe('2026-03-03');
  });

  it('is idempotent for the same day', () => {
    const once = completeDay(INITIAL_STREAK, D0);
    expect(completeDay(once, D0)).toBe(once);
  });

  it('earns one joker per week of streak, max 2 in stock', () => {
    expect(runDays(6).jokers).toBe(0);
    expect(runDays(7).jokers).toBe(1);
    expect(runDays(14).jokers).toBe(2);
    expect(runDays(21).jokers).toBe(2);
  });
});

describe('settleMissedDays', () => {
  it('does nothing before the first completed day', () => {
    expect(settleMissedDays(INITIAL_STREAK, D0)).toEqual({
      streak: INITIAL_STREAK,
      jokersUsed: 0,
      broken: false,
    });
  });

  it('does nothing the day after a completed day', () => {
    const s = runDays(3);
    expect(settleMissedDays(s, addDays(D0, 3)).streak).toBe(s);
  });

  it('breaks the streak after a missed day without joker', () => {
    const s = runDays(3);
    const result = settleMissedDays(s, addDays(D0, 4));
    expect(result.broken).toBe(true);
    expect(result.streak.count).toBe(0);
    expect(result.streak.bestCount).toBe(3);
  });

  it('uses a joker instead of breaking the streak', () => {
    const s = runDays(7);
    const result = settleMissedDays(s, addDays(D0, 8));
    expect(result).toMatchObject({ jokersUsed: 1, broken: false });
    expect(result.streak.count).toBe(7);
    expect(result.streak.jokers).toBe(0);
  });

  it('settles each missed day once', () => {
    const s = runDays(14);
    const first = settleMissedDays(s, addDays(D0, 15));
    const again = settleMissedDays(first.streak, addDays(D0, 15));
    expect(again.jokersUsed).toBe(0);
    expect(again.streak).toBe(first.streak);
  });

  it('breaks when missed days outnumber jokers, and stops spending jokers at 0', () => {
    const s = runDays(14);
    const result = settleMissedDays(s, addDays(D0, 14 + 3));
    expect(result.streak.count).toBe(0);
    expect(result.jokersUsed).toBe(2);
    expect(result.broken).toBe(true);
  });

  it('never spends jokers when the streak is already 0', () => {
    const s: StreakState = { ...INITIAL_STREAK, jokers: 2, lastSettledDay: D0 };
    const result = settleMissedDays(s, addDays(D0, 5));
    expect(result.streak.jokers).toBe(2);
    expect(result.broken).toBe(false);
  });

  it('resumes the streak after a rest day covered by a joker', () => {
    const s = runDays(7);
    const resumed = completeDay(s, addDays(D0, 8));
    expect(resumed.count).toBe(8);
    expect(resumed.jokers).toBe(0);
  });

  it('restarts at 1 after a break', () => {
    const s = runDays(3);
    expect(completeDay(s, addDays(D0, 10)).count).toBe(1);
  });
});
