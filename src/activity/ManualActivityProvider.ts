import type { Activity, ActivityType } from '@/game/economy';

import { estimateSteps, newActivityId } from './ActivityProvider';
import type { ActivityProvider, ProviderStatus } from './ActivityProvider';

export interface ManualEntry {
  type: ActivityType;
  durationMin: number;
  /** Optional for walk / run; estimated from the duration when missing. */
  steps?: number;
}

export const MANUAL_MAX_DURATION_MIN = 240;

export function validateManualEntry(entry: ManualEntry): boolean {
  const { durationMin, steps } = entry;
  if (!Number.isFinite(durationMin) || durationMin < 1 || durationMin > MANUAL_MAX_DURATION_MIN) {
    return false;
  }
  return steps === undefined || (Number.isFinite(steps) && steps >= 0 && steps <= 100_000);
}

/**
 * Manual entry. The engine counts these activities at 50 % and at most 60 min per day
 * (see `evaluateDay`); this provider only builds a well-formed activity.
 */
export class ManualActivityProvider implements ActivityProvider {
  readonly source = 'manual' as const;
  private readonly recorded: Activity[] = [];

  async getStatus(): Promise<ProviderStatus> {
    return 'available';
  }

  async requestPermissions(): Promise<boolean> {
    return true;
  }

  async fetchActivities(fromMs: number, toMs: number): Promise<Activity[]> {
    return this.recorded.filter((a) => a.startMs >= fromMs && a.startMs < toMs);
  }

  /** Builds the activity for a manual entry, or null when the entry is not valid. */
  createActivity(entry: ManualEntry, startMs: number): Activity | null {
    if (!validateManualEntry(entry)) return null;
    const durationMin = Math.round(entry.durationMin);
    const activity: Activity = {
      id: newActivityId('manual'),
      type: entry.type,
      source: 'manual',
      startMs,
      durationMin,
    };
    if (entry.type === 'walk' || entry.type === 'run') {
      activity.steps = Math.round(entry.steps ?? estimateSteps(entry.type, durationMin));
    }
    this.recorded.push(activity);
    return activity;
  }
}
