import { Platform } from 'react-native';

import type { Activity } from '@/game/economy';

import type { ActivityProvider, ProviderStatus } from './ActivityProvider';
import { stepBucketsToActivities, workoutToActivity } from './healthMapping';
import type { HealthStepBucket, HealthWorkout } from './healthMapping';

/**
 * What the app needs from Google Health Connect. Implemented by a native module in a
 * development build (see docs/HEALTH_INTEGRATION.md).
 */
export interface HealthConnectBridge {
  /** False when Health Connect is not installed / not supported on the device. */
  isAvailable(): Promise<boolean>;
  /** Asks for READ access to Steps, Distance and ExerciseSession records. */
  requestPermissions(): Promise<boolean>;
  /** Exercise sessions that started in [fromMs, toMs). */
  readExerciseSessions(fromMs: number, toMs: number): Promise<HealthWorkout[]>;
  /** Steps aggregated per hour in [fromMs, toMs). */
  aggregateSteps(fromMs: number, toMs: number): Promise<HealthStepBucket[]>;
}

/**
 * Google Health Connect adapter — READY BUT NOT ENABLED in the MVP.
 *
 * Without a bridge (the default) it reports `coming_soon` and returns nothing.
 */
export class HealthConnectProvider implements ActivityProvider {
  readonly source = 'health_connect' as const;
  private granted = false;

  constructor(private readonly bridge: HealthConnectBridge | null = null) {}

  async getStatus(): Promise<ProviderStatus> {
    if (Platform.OS !== 'android') return 'unavailable';
    if (!this.bridge) return 'coming_soon';
    if (!(await this.bridge.isAvailable())) return 'unavailable';
    return this.granted ? 'available' : 'needs_permission';
  }

  async requestPermissions(): Promise<boolean> {
    if (!this.bridge || Platform.OS !== 'android') return false;
    this.granted = await this.bridge.requestPermissions();
    return this.granted;
  }

  async fetchActivities(fromMs: number, toMs: number): Promise<Activity[]> {
    if (!this.bridge || !this.granted) return [];
    const [sessions, buckets] = await Promise.all([
      this.bridge.readExerciseSessions(fromMs, toMs),
      this.bridge.aggregateSteps(fromMs, toMs),
    ]);
    const fromSessions = sessions
      .map((s) => workoutToActivity(s, this.source))
      .filter((a): a is Activity => a !== null);
    return [...fromSessions, ...stepBucketsToActivities(buckets, sessions, this.source)];
  }
}
