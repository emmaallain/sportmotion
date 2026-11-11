import type { Activity, ActivityType } from '@/game/economy';

import {
  STEPS_PER_MIN,
  estimateDistanceKm,
  estimateSteps,
  newActivityId,
} from './ActivityProvider';
import type { ActivityProvider, ProviderStatus } from './ActivityProvider';

/**
 * Simulator used by default in the MVP: it fabricates the activities a wearable would
 * report (steps with a plausible cadence and distance, timed sessions).
 */
export class MockActivityProvider implements ActivityProvider {
  readonly source = 'mock' as const;
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

  /** A walk of `steps` steps at a normal walking cadence. */
  simulateSteps(steps: number, startMs: number): Activity {
    const durationMin = Math.max(1, Math.round(steps / STEPS_PER_MIN.walk));
    return this.record({
      id: newActivityId('mock'),
      type: 'walk',
      source: 'mock',
      startMs,
      durationMin,
      steps,
      distanceKm: estimateDistanceKm('walk', steps),
    });
  }

  /** A timed session of any type; runs come with steps and a distance. */
  simulateSession(type: ActivityType, durationMin: number, startMs: number): Activity {
    const base = { id: newActivityId('mock'), type, source: 'mock' as const, startMs, durationMin };
    if (type === 'walk' || type === 'run') {
      const steps = estimateSteps(type, durationMin);
      return this.record({ ...base, steps, distanceKm: estimateDistanceKm(type, steps) });
    }
    return this.record(base);
  }

  private record(activity: Activity): Activity {
    this.recorded.push(activity);
    return activity;
  }
}
