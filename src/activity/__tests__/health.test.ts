import { Platform } from 'react-native';

import { evaluateDay } from '@/game/economy';

import {
  HealthConnectProvider,
  HealthKitProvider,
  MockActivityProvider,
  mapWorkoutType,
  stepBucketsToActivities,
  syncProvider,
  workoutToActivity,
} from '../index';
import type {
  HealthConnectBridge,
  HealthKitBridge,
  HealthStepBucket,
  HealthWorkout,
} from '../index';

const T0 = Date.parse('2026-05-04T06:00:00Z');
const HOUR = 3_600_000;
const workout = (over: Partial<HealthWorkout> = {}): HealthWorkout => ({
  uuid: 'abc',
  kind: 'running',
  startMs: T0,
  endMs: T0 + HOUR / 2,
  steps: 4800,
  distanceMeters: 5000,
  ...over,
});
const bucket = (hour: number, steps: number): HealthStepBucket => ({
  startMs: T0 + hour * HOUR,
  endMs: T0 + (hour + 1) * HOUR,
  steps,
});
const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { get: () => os });

describe('health mapping', () => {
  it('maps HealthKit and Health Connect workout names', () => {
    expect(mapWorkoutType('running')).toBe('run');
    expect(mapWorkoutType('traditionalStrengthTraining')).toBe('strength');
    expect(mapWorkoutType('EXERCISE_TYPE_YOGA')).toBe('yoga');
    expect(mapWorkoutType('EXERCISE_TYPE_SOCCER')).toBe('team_sport');
    expect(mapWorkoutType('archery')).toBeNull();
  });

  it('converts a workout with a stable id, steps and distance', () => {
    expect(workoutToActivity(workout(), 'healthkit')).toEqual({
      id: 'healthkit-abc',
      type: 'run',
      source: 'healthkit',
      startMs: T0,
      durationMin: 30,
      steps: 4800,
      distanceKm: 5,
    });
    expect(workoutToActivity(workout({ kind: 'archery' }), 'healthkit')).toBeNull();
    expect(workoutToActivity(workout({ endMs: T0 }), 'healthkit')).toBeNull();
    const yoga = workoutToActivity(
      workout({ kind: 'yoga', steps: undefined, distanceMeters: undefined }),
      'health_connect',
    );
    expect(yoga).not.toHaveProperty('steps');
  });

  it('turns hourly step buckets into walks, skipping those inside a workout', () => {
    const walks = stepBucketsToActivities(
      [bucket(0, 900), bucket(1, 0), bucket(3, 2500)],
      [workout()],
      'healthkit',
    );
    expect(walks.map((w) => [w.id, w.steps])).toEqual([[`healthkit-steps-${T0 + 3 * HOUR}`, 2500]]);
  });

  it('produces activities the engine accepts at full value', () => {
    const run = workoutToActivity(workout(), 'healthkit')!;
    const walks = stepBucketsToActivities(
      [bucket(3, 2500), bucket(4, 3000)],
      [workout()],
      'healthkit',
    );
    const day = evaluateDay([run, ...walks]);
    expect(day.rejected).toEqual([]);
    expect(day.accepted.every((a) => a.factor === 1)).toBe(true);
    expect(day.totals.steps).toBe(4800 + 5500);
  });
});

describe('HealthKitProvider', () => {
  afterEach(() => setOS('ios'));

  it('is "coming soon" without a native bridge and never invents data', async () => {
    setOS('ios');
    const provider = new HealthKitProvider();
    expect(await provider.getStatus()).toBe('coming_soon');
    expect(await provider.requestPermissions()).toBe(false);
    expect(await provider.fetchActivities(T0, T0 + 24 * HOUR)).toEqual([]);
  });

  it('is unavailable outside iOS', async () => {
    setOS('android');
    expect(await new HealthKitProvider().getStatus()).toBe('unavailable');
  });

  it('reads workouts and steps through the bridge once authorised', async () => {
    setOS('ios');
    const bridge: HealthKitBridge = {
      isAvailable: async () => true,
      requestAuthorization: async () => true,
      queryWorkouts: async () => [workout()],
      queryStepBuckets: async () => [bucket(0, 500), bucket(5, 4000)],
    };
    const provider = new HealthKitProvider(bridge);
    expect(await provider.getStatus()).toBe('needs_permission');
    expect(await provider.fetchActivities(T0, T0 + 24 * HOUR)).toEqual([]);
    expect(await provider.requestPermissions()).toBe(true);
    expect(await provider.getStatus()).toBe('available');
    const activities = await provider.fetchActivities(T0, T0 + 24 * HOUR);
    expect(activities.map((a) => a.type)).toEqual(['run', 'walk']);
    expect(activities.every((a) => a.source === 'healthkit')).toBe(true);
  });

  it('reports unavailable when Health data does not exist on the device', async () => {
    setOS('ios');
    const bridge = { isAvailable: async () => false } as unknown as HealthKitBridge;
    expect(await new HealthKitProvider(bridge).getStatus()).toBe('unavailable');
  });
});

describe('HealthConnectProvider', () => {
  afterEach(() => setOS('ios'));

  it('is "coming soon" on Android without a bridge, unavailable elsewhere', async () => {
    setOS('android');
    expect(await new HealthConnectProvider().getStatus()).toBe('coming_soon');
    expect(await new HealthConnectProvider().requestPermissions()).toBe(false);
    setOS('ios');
    expect(await new HealthConnectProvider().getStatus()).toBe('unavailable');
  });

  it('reads sessions and steps through the bridge once granted', async () => {
    setOS('android');
    const bridge: HealthConnectBridge = {
      isAvailable: async () => true,
      requestPermissions: async () => true,
      readExerciseSessions: async () => [workout({ kind: 'EXERCISE_TYPE_STRENGTH_TRAINING' })],
      aggregateSteps: async () => [bucket(6, 3000)],
    };
    const provider = new HealthConnectProvider(bridge);
    expect(await provider.getStatus()).toBe('needs_permission');
    expect(await provider.fetchActivities(T0, T0 + 24 * HOUR)).toEqual([]);
    await provider.requestPermissions();
    expect(await provider.getStatus()).toBe('available');
    const activities = await provider.fetchActivities(T0, T0 + 24 * HOUR);
    expect(activities.map((a) => [a.type, a.source])).toEqual([
      ['strength', 'health_connect'],
      ['walk', 'health_connect'],
    ]);
    const missing = { isAvailable: async () => false } as unknown as HealthConnectBridge;
    expect(await new HealthConnectProvider(missing).getStatus()).toBe('unavailable');
  });
});

describe('syncProvider', () => {
  it('dispatches new activities once and skips known ones', async () => {
    const mock = new MockActivityProvider();
    const a = mock.simulateSteps(3000, T0);
    const b = mock.simulateSession('yoga', 20, T0 + 2 * HOUR);
    const sent: string[] = [];
    const dispatch = (command: { type: string; activity?: { id: string } }) => {
      sent.push(command.activity?.id ?? '');
      return { ok: command.activity?.id !== b.id };
    };
    const result = await syncProvider(mock, T0 - 6 * HOUR, new Set(), dispatch as never);
    expect(result).toEqual({ added: 1, rejected: 1 });
    expect(sent).toEqual([a.id, b.id]);
    const again = await syncProvider(mock, T0 - 6 * HOUR, new Set([a.id, b.id]), dispatch as never);
    expect(again).toEqual({ added: 0, rejected: 0 });
  });

  it('does nothing for a provider that is not available', async () => {
    const result = await syncProvider(new HealthKitProvider(), T0, new Set(), () => ({ ok: true }));
    expect(result).toEqual({ added: 0, rejected: 0 });
  });
});
