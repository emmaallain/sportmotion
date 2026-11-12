export type BasicMaterialId = 'wood' | 'stone' | 'water' | 'energy';
export type AdvancedMaterialId = 'brick' | 'glass' | 'steel';
export type MaterialId = BasicMaterialId | AdvancedMaterialId;
export type Materials = Record<MaterialId, number>;
export type BasicMaterials = Record<BasicMaterialId, number>;

export const BASIC_MATERIALS: readonly BasicMaterialId[] = ['wood', 'stone', 'water', 'energy'];
export const ALL_MATERIALS: readonly MaterialId[] = [
  'wood',
  'stone',
  'water',
  'energy',
  'brick',
  'glass',
  'steel',
];

export type ActivityType =
  | 'walk'
  | 'run'
  | 'strength'
  | 'stretch'
  | 'yoga'
  | 'mobility'
  | 'cycling'
  | 'swimming'
  | 'team_sport';

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  'walk',
  'run',
  'strength',
  'stretch',
  'yoga',
  'mobility',
  'cycling',
  'swimming',
  'team_sport',
];

export type ActivitySource = 'mock' | 'manual' | 'healthkit' | 'health_connect' | 'strava';

export interface Activity {
  id: string;
  type: ActivityType;
  source: ActivitySource;
  /** Start time, epoch milliseconds. */
  startMs: number;
  durationMin: number;
  /** Step count, relevant for walk / run. */
  steps?: number;
  /** Distance in km, when the source provides it (used for speed checks). */
  distanceKm?: number;
}

export type RejectionReason =
  'invalid' | 'vehicle_speed' | 'cadence' | 'overlap' | 'manual_limit' | 'duplicate';

export type QuestId = 'walk' | 'sport' | 'stretch';

export interface QuestProgress {
  progress: number;
  goal: number;
  done: boolean;
  reward: number;
}

export interface DayTotals {
  steps: number;
  sportMin: number;
  stretchMin: number;
  strengthMin: number;
  cardioMin: number;
}

export interface AcceptedActivity {
  id: string;
  /** Type after plausibility checks (a too-fast walk becomes a run). */
  type: ActivityType;
  reclassified: boolean;
  /** Minutes actually counted (after the manual 60 min/day limit). */
  countedMin: number;
  /** 1 for sensor data, 0.5 for manual entries. */
  factor: number;
}

export interface DayEvaluation {
  totals: DayTotals;
  quests: Record<QuestId, QuestProgress>;
  fullDay: boolean;
  /** Base Pulses before the daily cap. */
  uncappedBasePulses: number;
  /** Base Pulses after the daily cap, before the streak multiplier. */
  basePulses: number;
  xp: number;
  materials: BasicMaterials;
  accepted: AcceptedActivity[];
  rejected: { id: string; reason: RejectionReason }[];
  capped: { steps: boolean; sport: boolean; pulses: boolean };
}

export interface StreakState {
  /** Consecutive complete days. */
  count: number;
  /** Rest-day jokers in stock (max 2). */
  jokers: number;
  /** Last day (YYYY-MM-DD) that was either completed or settled as missed. */
  lastSettledDay: string | null;
  /** Last day that was completed. */
  lastCompletedDay: string | null;
  bestCount: number;
}
