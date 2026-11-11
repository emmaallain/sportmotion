import {
  CADENCE_CHECK_MIN_DURATION,
  MANUAL_MAX_MIN_PER_DAY,
  MAX_CADENCE_STEPS_PER_MIN,
  RUN_MAX_SPEED_KMH,
  WALK_MAX_SPEED_KMH,
} from './constants';
import type { Activity, RejectionReason } from './types';

export type PlausibilityResult =
  { ok: true; activity: Activity; reclassified: boolean } | { ok: false; reason: RejectionReason };

const MAX_DURATION_MIN = 24 * 60;

/** Average speed in km/h, or null when the source gave no distance. */
export function averageSpeedKmh(activity: Activity): number | null {
  if (activity.distanceKm === undefined || activity.durationMin <= 0) return null;
  return activity.distanceKm / (activity.durationMin / 60);
}

/**
 * Checks a single activity. A walk faster than 9 km/h becomes a run; a run faster than
 * 25 km/h is rejected (vehicle); more than 220 steps/min over 10+ minutes is rejected.
 */
export function checkActivity(activity: Activity): PlausibilityResult {
  const { durationMin, steps, distanceKm, startMs } = activity;
  const badNumber = (n: number | undefined) => n !== undefined && (!Number.isFinite(n) || n < 0);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(durationMin) ||
    durationMin <= 0 ||
    durationMin > MAX_DURATION_MIN ||
    badNumber(steps) ||
    badNumber(distanceKm)
  ) {
    return { ok: false, reason: 'invalid' };
  }

  let result = activity;
  let reclassified = false;
  const speed = averageSpeedKmh(activity);
  if (result.type === 'walk' && speed !== null && speed > WALK_MAX_SPEED_KMH) {
    result = { ...result, type: 'run' };
    reclassified = true;
  }
  if (result.type === 'run' && speed !== null && speed > RUN_MAX_SPEED_KMH) {
    return { ok: false, reason: 'vehicle_speed' };
  }
  if (
    steps !== undefined &&
    durationMin > CADENCE_CHECK_MIN_DURATION &&
    steps / durationMin > MAX_CADENCE_STEPS_PER_MIN
  ) {
    return { ok: false, reason: 'cadence' };
  }
  return { ok: true, activity: result, reclassified };
}

const endMs = (a: Activity) => a.startMs + a.durationMin * 60_000;

export function overlaps(a: Activity, b: Activity): boolean {
  return a.startMs < endMs(b) && b.startMs < endMs(a);
}

/**
 * When activities overlap in time only the longest one counts.
 * Deterministic: ties are broken by earliest start, then by id.
 */
export function resolveOverlaps(activities: readonly Activity[]): {
  kept: Activity[];
  dropped: Activity[];
} {
  const byPriority = [...activities].sort(
    (a, b) => b.durationMin - a.durationMin || a.startMs - b.startMs || a.id.localeCompare(b.id),
  );
  const kept: Activity[] = [];
  const dropped: Activity[] = [];
  for (const candidate of byPriority) {
    if (kept.some((k) => overlaps(k, candidate))) dropped.push(candidate);
    else kept.push(candidate);
  }
  const chronological = (a: Activity, b: Activity) =>
    a.startMs - b.startMs || a.id.localeCompare(b.id);
  return { kept: kept.sort(chronological), dropped: dropped.sort(chronological) };
}

/**
 * Manual entries are limited to 60 counted minutes per day, in chronological order.
 * Returns, per activity id, how many minutes are counted (0 = fully over the limit).
 */
export function applyManualLimit(activities: readonly Activity[]): Map<string, number> {
  const counted = new Map<string, number>();
  let remaining = MANUAL_MAX_MIN_PER_DAY;
  const chronological = [...activities].sort(
    (a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id),
  );
  for (const a of chronological) {
    if (a.source !== 'manual') {
      counted.set(a.id, a.durationMin);
      continue;
    }
    const minutes = Math.min(a.durationMin, remaining);
    counted.set(a.id, minutes);
    remaining -= minutes;
  }
  return counted;
}
