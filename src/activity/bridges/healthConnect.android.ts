import type { HealthConnectBridge } from '../HealthConnectProvider';
import type { HealthStepBucket, HealthWorkout } from '../healthMapping';

type HealthConnectModule = typeof import('react-native-health-connect');

const READ = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ExerciseSession' },
] as const;

function loadModule(): HealthConnectModule | null {
  try {
    // The native module only exists in a development / production build (not in Expo Go).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-health-connect') as HealthConnectModule;
  } catch {
    return null;
  }
}

/**
 * Health Connect bridge, read-only: steps, distance and exercise sessions.
 * Returns null when the native module is missing (Expo Go).
 */
export function createHealthConnectBridge(): HealthConnectBridge | null {
  const hc = loadModule();
  if (!hc) return null;

  // exerciseType is a number: turn it back into the constant name the mapping understands.
  const typeNames = new Map<number, string>(
    Object.entries(hc.ExerciseType).map(([name, value]) => [value, `EXERCISE_TYPE_${name}`]),
  );
  let initialized = false;
  const ready = async () => {
    if (!initialized) initialized = await hc.initialize();
    return initialized;
  };
  const between = (fromMs: number, toMs: number) => ({
    operator: 'between' as const,
    startTime: new Date(fromMs).toISOString(),
    endTime: new Date(toMs).toISOString(),
  });

  return {
    isAvailable: async () => {
      try {
        return (await hc.getSdkStatus()) === hc.SdkAvailabilityStatus.SDK_AVAILABLE;
      } catch {
        return false;
      }
    },

    requestPermissions: async () => {
      if (!(await ready())) return false;
      const has = (granted: { accessType: string; recordType: string }[]) =>
        READ.every((p) =>
          granted.some((g) => g.accessType === 'read' && g.recordType === p.recordType),
        );
      // already granted: no dialog
      if (has(await hc.getGrantedPermissions())) return true;
      return has(await hc.requestPermission([...READ]));
    },

    readExerciseSessions: async (fromMs, toMs): Promise<HealthWorkout[]> => {
      if (!(await ready())) return [];
      const { records } = await hc.readRecords('ExerciseSession', {
        timeRangeFilter: between(fromMs, toMs),
      });
      return records.map((record) => ({
        uuid: record.metadata?.id ?? `${record.startTime}-${record.exerciseType}`,
        kind: typeNames.get(record.exerciseType) ?? 'EXERCISE_TYPE_OTHER_WORKOUT',
        startMs: Date.parse(record.startTime),
        endMs: Date.parse(record.endTime),
      }));
    },

    aggregateSteps: async (fromMs, toMs): Promise<HealthStepBucket[]> => {
      if (!(await ready())) return [];
      const groups = await hc.aggregateGroupByDuration({
        recordType: 'Steps',
        timeRangeFilter: between(fromMs, toMs),
        timeRangeSlicer: { duration: 'HOURS', length: 1 },
      });
      return groups
        .map((group) => ({
          startMs: Date.parse(group.startTime),
          endMs: Date.parse(group.endTime),
          steps: group.result.COUNT_TOTAL ?? 0,
        }))
        .filter((bucket) => bucket.steps > 0);
    },
  };
}
