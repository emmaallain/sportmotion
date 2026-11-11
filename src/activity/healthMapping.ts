import type { Activity, ActivitySource, ActivityType } from '@/game/economy';

/**
 * Platform-neutral shapes the health adapters convert into game activities. Keeping the
 * mapping here (pure, tested) leaves the native modules as thin as possible.
 */
export interface HealthWorkout {
  /** Stable identifier from the health store (used to never count a workout twice). */
  uuid: string;
  /** HealthKit `HKWorkoutActivityType` name or Health Connect exercise type name. */
  kind: string;
  startMs: number;
  endMs: number;
  steps?: number;
  distanceMeters?: number;
}

export interface HealthStepBucket {
  /** Start of the interval, epoch ms. */
  startMs: number;
  endMs: number;
  steps: number;
  distanceMeters?: number;
}

/** Workout names of both platforms → game activity types. Unknown names are ignored. */
const WORKOUT_TYPES: Record<string, ActivityType> = {
  // Apple HealthKit (HKWorkoutActivityType)
  walking: 'walk',
  hiking: 'walk',
  running: 'run',
  cycling: 'cycling',
  swimming: 'swimming',
  traditionalStrengthTraining: 'strength',
  functionalStrengthTraining: 'strength',
  coreTraining: 'strength',
  highIntensityIntervalTraining: 'strength',
  yoga: 'yoga',
  pilates: 'mobility',
  flexibility: 'stretch',
  cooldown: 'stretch',
  mindAndBody: 'mobility',
  soccer: 'team_sport',
  basketball: 'team_sport',
  volleyball: 'team_sport',
  handball: 'team_sport',
  rugby: 'team_sport',
  hockey: 'team_sport',
  // Google Health Connect (ExerciseSessionRecord.EXERCISE_TYPE_*)
  EXERCISE_TYPE_WALKING: 'walk',
  EXERCISE_TYPE_HIKING: 'walk',
  EXERCISE_TYPE_RUNNING: 'run',
  EXERCISE_TYPE_RUNNING_TREADMILL: 'run',
  EXERCISE_TYPE_BIKING: 'cycling',
  EXERCISE_TYPE_BIKING_STATIONARY: 'cycling',
  EXERCISE_TYPE_SWIMMING_POOL: 'swimming',
  EXERCISE_TYPE_SWIMMING_OPEN_WATER: 'swimming',
  EXERCISE_TYPE_STRENGTH_TRAINING: 'strength',
  EXERCISE_TYPE_WEIGHTLIFTING: 'strength',
  EXERCISE_TYPE_CALISTHENICS: 'strength',
  EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING: 'strength',
  EXERCISE_TYPE_YOGA: 'yoga',
  EXERCISE_TYPE_PILATES: 'mobility',
  EXERCISE_TYPE_STRETCHING: 'stretch',
  EXERCISE_TYPE_FOOTBALL_AUSTRALIAN: 'team_sport',
  EXERCISE_TYPE_SOCCER: 'team_sport',
  EXERCISE_TYPE_BASKETBALL: 'team_sport',
  EXERCISE_TYPE_VOLLEYBALL: 'team_sport',
  EXERCISE_TYPE_HANDBALL: 'team_sport',
  EXERCISE_TYPE_RUGBY: 'team_sport',
};

export function mapWorkoutType(kind: string): ActivityType | null {
  return WORKOUT_TYPES[kind] ?? null;
}

const minutes = (startMs: number, endMs: number) => Math.round((endMs - startMs) / 60_000);

/** A recorded workout → a game activity, or null when the type is not one the game counts. */
export function workoutToActivity(workout: HealthWorkout, source: ActivitySource): Activity | null {
  const type = mapWorkoutType(workout.kind);
  const durationMin = minutes(workout.startMs, workout.endMs);
  if (!type || durationMin <= 0) return null;
  const activity: Activity = {
    id: `${source}-${workout.uuid}`,
    type,
    source,
    startMs: workout.startMs,
    durationMin,
  };
  if (workout.steps !== undefined) activity.steps = Math.round(workout.steps);
  if (workout.distanceMeters !== undefined) activity.distanceKm = workout.distanceMeters / 1000;
  return activity;
}

/**
 * Background steps (hourly buckets from the pedometer) → walks. Buckets that overlap a
 * recorded workout are dropped: those steps are already inside the workout, and the engine
 * would only keep the longest of two overlapping activities anyway.
 */
export function stepBucketsToActivities(
  buckets: readonly HealthStepBucket[],
  workouts: readonly HealthWorkout[],
  source: ActivitySource,
): Activity[] {
  const activities: Activity[] = [];
  for (const bucket of buckets) {
    if (bucket.steps <= 0) continue;
    const overlapsWorkout = workouts.some(
      (w) => bucket.startMs < w.endMs && w.startMs < bucket.endMs,
    );
    if (overlapsWorkout) continue;
    const durationMin = Math.max(1, minutes(bucket.startMs, bucket.endMs));
    const activity: Activity = {
      // one id per bucket start: re-syncing the same hour never double counts
      id: `${source}-steps-${bucket.startMs}`,
      type: 'walk',
      source,
      startMs: bucket.startMs,
      durationMin,
      steps: Math.round(bucket.steps),
    };
    if (bucket.distanceMeters !== undefined) activity.distanceKm = bucket.distanceMeters / 1000;
    activities.push(activity);
  }
  return activities;
}
