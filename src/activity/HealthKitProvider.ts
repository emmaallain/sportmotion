import { Platform } from 'react-native';

import type { Activity } from '@/game/economy';

import type { ActivityProvider, ProviderStatus } from './ActivityProvider';
import { stepBucketsToActivities, workoutToActivity } from './healthMapping';
import type { HealthStepBucket, HealthWorkout } from './healthMapping';

/**
 * What the app needs from Apple Health. Implemented by a native module in a development
 * build (see docs/HEALTH_INTEGRATION.md) — it cannot exist in Expo Go or on the web.
 */
export interface HealthKitBridge {
  isAvailable(): Promise<boolean>;
  /** Asks for READ access to steps, distance and workouts. */
  requestAuthorization(): Promise<boolean>;
  /** Workouts that started in [fromMs, toMs). */
  queryWorkouts(fromMs: number, toMs: number): Promise<HealthWorkout[]>;
  /** Step counts aggregated per hour in [fromMs, toMs). */
  queryStepBuckets(fromMs: number, toMs: number): Promise<HealthStepBucket[]>;
}

/**
 * Apple Health adapter — READY BUT NOT ENABLED in the MVP.
 *
 * Without a bridge (the default) it reports `coming_soon` and returns nothing, so the app
 * keeps using the simulator and manual entry. To enable it, pass a bridge built on a
 * HealthKit native module: `new HealthKitProvider(createHealthKitBridge())`.
 */
export class HealthKitProvider implements ActivityProvider {
  readonly source = 'healthkit' as const;
  private authorized = false;

  constructor(private readonly bridge: HealthKitBridge | null = null) {}

  async getStatus(): Promise<ProviderStatus> {
    if (Platform.OS !== 'ios') return 'unavailable';
    if (!this.bridge) return 'coming_soon';
    if (!(await this.bridge.isAvailable())) return 'unavailable';
    return this.authorized ? 'available' : 'needs_permission';
  }

  async requestPermissions(): Promise<boolean> {
    if (!this.bridge || Platform.OS !== 'ios') return false;
    this.authorized = await this.bridge.requestAuthorization();
    return this.authorized;
  }

  async fetchActivities(fromMs: number, toMs: number): Promise<Activity[]> {
    if (!this.bridge || !this.authorized) return [];
    const [workouts, buckets] = await Promise.all([
      this.bridge.queryWorkouts(fromMs, toMs),
      this.bridge.queryStepBuckets(fromMs, toMs),
    ]);
    const fromWorkouts = workouts
      .map((w) => workoutToActivity(w, this.source))
      .filter((a): a is Activity => a !== null);
    return [...fromWorkouts, ...stepBucketsToActivities(buckets, workouts, this.source)];
  }
}
