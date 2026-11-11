import { DAYS_PER_JOKER, MAX_JOKERS, STREAK_MULTIPLIERS } from './constants';
import { addDays, diffDays } from './dates';
import type { DayKey } from './dates';
import type { StreakState } from './types';

export const INITIAL_STREAK: StreakState = {
  count: 0,
  jokers: 0,
  lastSettledDay: null,
  lastCompletedDay: null,
  bestCount: 0,
};

export function multiplierForStreak(count: number): number {
  for (const tier of STREAK_MULTIPLIERS) if (count >= tier.minDays) return tier.multiplier;
  return 1;
}

/** Days still needed to reach the next multiplier tier, or null at the top tier. */
export function daysToNextMultiplier(count: number): { days: number; multiplier: number } | null {
  const higher = STREAK_MULTIPLIERS.filter((t) => t.minDays > count).sort(
    (a, b) => a.minDays - b.minDays,
  )[0];
  return higher ? { days: higher.minDays - count, multiplier: higher.multiplier } : null;
}

export interface StreakSettlement {
  streak: StreakState;
  jokersUsed: number;
  broken: boolean;
}

/**
 * Settles every day strictly before `today` that was not completed: each missed day uses a
 * rest joker if one is available, otherwise the streak goes back to 0. Nothing else is lost.
 */
export function settleMissedDays(streak: StreakState, today: DayKey): StreakSettlement {
  if (streak.lastSettledDay === null) return { streak, jokersUsed: 0, broken: false };
  const missed = diffDays(streak.lastSettledDay, today) - 1;
  if (missed <= 0) return { streak, jokersUsed: 0, broken: false };

  let { count, jokers } = streak;
  let jokersUsed = 0;
  let broken = false;
  for (let i = 0; i < missed; i++) {
    if (count === 0) break;
    if (jokers > 0) {
      jokers -= 1;
      jokersUsed += 1;
    } else {
      count = 0;
      broken = true;
    }
  }
  return {
    streak: { ...streak, count, jokers, lastSettledDay: addDays(today, -1) },
    jokersUsed,
    broken,
  };
}

/** Marks `day` as a complete day. Idempotent for the same day. */
export function completeDay(streak: StreakState, day: DayKey): StreakState {
  if (streak.lastCompletedDay === day) return streak;
  const settled = settleMissedDays(streak, day).streak;
  const count = settled.count + 1;
  const earnsJoker = count % DAYS_PER_JOKER === 0;
  return {
    count,
    jokers: earnsJoker ? Math.min(MAX_JOKERS, settled.jokers + 1) : settled.jokers,
    lastSettledDay: day,
    lastCompletedDay: day,
    bestCount: Math.max(settled.bestCount, count),
  };
}
