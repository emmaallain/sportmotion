import type { Activity, ActivitySource, ActivityType } from '../types';

let seq = 0;
const HOUR = 3_600_000;
export const DAY_START = Date.parse('2026-03-10T00:00:00Z');

/** Builds an activity; `hour` is the start hour within the test day. */
export function act(
  type: ActivityType,
  hour: number,
  durationMin: number,
  extra: Partial<Activity> & { source?: ActivitySource } = {},
): Activity {
  seq += 1;
  return {
    id: `a${seq}`,
    type,
    source: 'mock',
    startMs: DAY_START + hour * HOUR,
    durationMin,
    ...extra,
  };
}
