import type { Activity, ActivitySource } from '@/game/economy';

export type ProviderStatus = 'available' | 'needs_permission' | 'unavailable' | 'coming_soon';

/**
 * Common interface of every activity source (simulator, manual entry, Apple Health,
 * Google Health Connect). A provider only *produces* activities; the game engine decides
 * what they are worth.
 */
export interface ActivityProvider {
  readonly source: ActivitySource;
  /** Whether the provider can be used on this device / build. */
  getStatus(): Promise<ProviderStatus>;
  /** Asks the user for read access. Resolves to true when granted. */
  requestPermissions(): Promise<boolean>;
  /** Activities that started in [fromMs, toMs). */
  fetchActivities(fromMs: number, toMs: number): Promise<Activity[]>;
}

export const STEPS_PER_MIN: Record<'walk' | 'run', number> = { walk: 100, run: 160 };
const KM_PER_STEP: Record<'walk' | 'run', number> = { walk: 0.00075, run: 0.00105 };

export function estimateSteps(type: 'walk' | 'run', durationMin: number): number {
  return Math.round(STEPS_PER_MIN[type] * durationMin);
}

export function estimateDistanceKm(type: 'walk' | 'run', steps: number): number {
  return Math.round(steps * KM_PER_STEP[type] * 100) / 100;
}

const DAY_START_HOUR = 6;

/**
 * First start time at which a new activity does not overlap the day's existing ones:
 * right after the last one, and not before 6:00.
 */
export function nextFreeSlot(existing: readonly Activity[], dayStartMs: number): number {
  let cursor = dayStartMs + DAY_START_HOUR * 3_600_000;
  for (const a of existing) cursor = Math.max(cursor, a.startMs + a.durationMin * 60_000);
  return cursor;
}

let counter = 0;
/** Unique enough for a single player: time + counter + random suffix. */
export function newActivityId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}
