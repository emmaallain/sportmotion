export type EraId = 1 | 2 | 3 | 4;
export type EraKey = 'village' | 'bourg' | 'ville' | 'metropole';

/** Eras 3 and 4 exist as locked data in the MVP ("bientôt"). */
export const MAX_PLAYABLE_ERA: EraId = 2;

export type Requirement =
  | { type: 'level'; level: number }
  /** At least `min` placed items carrying `tag`. */
  | { type: 'tag_count'; tag: string; min: number }
  /** At least `min` different item kinds carrying `tag`. */
  | { type: 'tag_distinct'; tag: string; min: number }
  | { type: 'item'; itemId: string; min: number }
  /** A continuous road links the first two plots. */
  | { type: 'plots_linked' };

export interface EraDef {
  id: EraId;
  key: EraKey;
  minLevel: number;
  maxLevel: number;
  /** Conditions to move on to the next era; null for the last era. */
  advance: Requirement[] | null;
}

export const ERAS: readonly EraDef[] = [
  {
    id: 1,
    key: 'village',
    minLevel: 1,
    maxLevel: 5,
    advance: [
      { type: 'level', level: 6 },
      { type: 'tag_count', tag: 'housing', min: 3 },
      { type: 'tag_distinct', tag: 'farm', min: 5 },
    ],
  },
  {
    id: 2,
    key: 'bourg',
    minLevel: 6,
    maxLevel: 12,
    advance: [
      { type: 'level', level: 13 },
      { type: 'tag_count', tag: 'housing', min: 6 },
      { type: 'item', itemId: 'school', min: 1 },
      { type: 'plots_linked' },
    ],
  },
  {
    id: 3,
    key: 'ville',
    minLevel: 13,
    maxLevel: 20,
    advance: [
      { type: 'level', level: 21 },
      { type: 'tag_count', tag: 'apartment', min: 3 },
      { type: 'item', itemId: 'train_station', min: 1 },
    ],
  },
  { id: 4, key: 'metropole', minLevel: 21, maxLevel: 30, advance: null },
];

export function eraDef(id: EraId): EraDef {
  const def = ERAS.find((e) => e.id === id);
  if (!def) throw new Error(`Unknown era ${id}`);
  return def;
}

/** What progression needs to know about the city; computed by the city module. */
export interface CityFacts {
  tagCounts: Record<string, number>;
  tagDistinct: Record<string, number>;
  itemCounts: Record<string, number>;
  plotsLinked: boolean;
}

export const EMPTY_FACTS: CityFacts = {
  tagCounts: {},
  tagDistinct: {},
  itemCounts: {},
  plotsLinked: false,
};

export interface RequirementStatus {
  requirement: Requirement;
  current: number;
  target: number;
  done: boolean;
}

export function evaluateRequirement(
  requirement: Requirement,
  level: number,
  facts: CityFacts,
): RequirementStatus {
  let current: number;
  let target: number;
  switch (requirement.type) {
    case 'level':
      current = level;
      target = requirement.level;
      break;
    case 'tag_count':
      current = facts.tagCounts[requirement.tag] ?? 0;
      target = requirement.min;
      break;
    case 'tag_distinct':
      current = facts.tagDistinct[requirement.tag] ?? 0;
      target = requirement.min;
      break;
    case 'item':
      current = facts.itemCounts[requirement.itemId] ?? 0;
      target = requirement.min;
      break;
    case 'plots_linked':
      current = facts.plotsLinked ? 1 : 0;
      target = 1;
      break;
  }
  return { requirement, current: Math.min(current, target), target, done: current >= target };
}

/** Status of each condition to leave `era` (empty for the last era). */
export function eraAdvanceStatus(era: EraId, level: number, facts: CityFacts): RequirementStatus[] {
  return (eraDef(era).advance ?? []).map((r) => evaluateRequirement(r, level, facts));
}

export type AdvanceCheck =
  { ok: true; next: EraId } | { ok: false; reason: 'last_era' | 'coming_soon' | 'requirements' };

/** An era unlocks when the level is reached AND the building conditions are met. */
export function checkEraAdvance(era: EraId, level: number, facts: CityFacts): AdvanceCheck {
  if (eraDef(era).advance === null) return { ok: false, reason: 'last_era' };
  if (era >= MAX_PLAYABLE_ERA) return { ok: false, reason: 'coming_soon' };
  if (!eraAdvanceStatus(era, level, facts).every((s) => s.done)) {
    return { ok: false, reason: 'requirements' };
  }
  return { ok: true, next: (era + 1) as EraId };
}

export type LockReason =
  { type: 'coming_soon' } | { type: 'era'; era: EraId } | { type: 'level'; level: number };

/** Why something that needs `requiredEra` / `requiredLevel` is locked, or null if unlocked. */
export function lockReason(
  required: { era: EraId; level: number },
  player: { era: EraId; level: number },
): LockReason | null {
  if (required.era > MAX_PLAYABLE_ERA) return { type: 'coming_soon' };
  if (required.era > player.era) return { type: 'era', era: required.era };
  if (required.level > player.level) return { type: 'level', level: required.level };
  return null;
}
