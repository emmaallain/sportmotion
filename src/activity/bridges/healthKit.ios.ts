import type { HealthKitBridge } from '../HealthKitProvider';
import type { HealthStepBucket, HealthWorkout } from '../healthMapping';

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');

const STEPS = 'HKQuantityTypeIdentifierStepCount';
const DISTANCE = 'HKQuantityTypeIdentifierDistanceWalkingRunning';
const WORKOUT = 'HKWorkoutTypeIdentifier';
const HOUR = 3_600_000;

/** Distance quantities come back in the user's preferred unit: normalise to metres. */
export function toMeters(
  quantity: { unit: string; quantity: number } | undefined,
): number | undefined {
  if (!quantity) return undefined;
  const factor: Record<string, number> = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, yd: 0.9144 };
  const k = factor[quantity.unit];
  return k === undefined ? undefined : quantity.quantity * k;
}

function loadModule(): HealthKitModule | null {
  try {
    // The native module only exists in a development / production build (not in Expo Go).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('@kingstinct/react-native-healthkit') as HealthKitModule;
    module.isHealthDataAvailable();
    return module;
  } catch {
    return null;
  }
}

/**
 * Apple Health bridge, read-only: steps, walking / running distance and workouts.
 * Returns null when the native module is missing (Expo Go), so the provider reports
 * "coming soon" instead of crashing.
 */
export function createHealthKitBridge(): HealthKitBridge | null {
  const hk = loadModule();
  if (!hk) return null;

  return {
    isAvailable: async () => hk.isHealthDataAvailable(),

    requestAuthorization: async () => {
      // iOS shows its sheet only the first time; afterwards this resolves immediately.
      // It never tells whether READ access was granted: a refusal just yields no data.
      return hk.requestAuthorization({ toRead: [STEPS, DISTANCE, WORKOUT] });
    },

    queryWorkouts: async (fromMs, toMs): Promise<HealthWorkout[]> => {
      const workouts = await hk.queryWorkoutSamples({
        limit: 0,
        filter: { date: { startDate: new Date(fromMs), endDate: new Date(toMs) } },
      });
      return Promise.all(
        workouts.map(async (workout) => {
          const steps = await workout
            .getStatistic(STEPS, 'count')
            .then((s) => s?.sumQuantity?.quantity)
            .catch(() => undefined);
          return {
            uuid: workout.uuid,
            kind: hk.WorkoutActivityType[workout.workoutActivityType] ?? 'other',
            startMs: workout.startDate.getTime(),
            endMs: workout.endDate.getTime(),
            steps,
            distanceMeters: toMeters(workout.totalDistance),
          };
        }),
      );
    },

    queryStepBuckets: async (fromMs, toMs): Promise<HealthStepBucket[]> => {
      const filter = { date: { startDate: new Date(fromMs), endDate: new Date(toMs) } };
      const anchor = new Date(fromMs - (fromMs % HOUR));
      const [steps, distances] = await Promise.all([
        hk.queryStatisticsCollectionForQuantity(
          STEPS,
          ['cumulativeSum'],
          anchor,
          { hour: 1 },
          {
            filter,
            unit: 'count',
          },
        ),
        hk
          .queryStatisticsCollectionForQuantity(
            DISTANCE,
            ['cumulativeSum'],
            anchor,
            { hour: 1 },
            {
              filter,
              unit: 'm',
            },
          )
          .catch(() => []),
      ]);
      const distanceByStart = new Map(
        distances.map((d) => [d.startDate?.getTime(), d.sumQuantity?.quantity]),
      );
      const buckets: HealthStepBucket[] = [];
      for (const bucket of steps) {
        const count = bucket.sumQuantity?.quantity ?? 0;
        if (!bucket.startDate || !bucket.endDate || count <= 0) continue;
        buckets.push({
          startMs: bucket.startDate.getTime(),
          endMs: bucket.endDate.getTime(),
          steps: count,
          distanceMeters: distanceByStart.get(bucket.startDate.getTime()),
        });
      }
      return buckets;
    },
  };
}
