import { getCityItem } from '../catalog/index';
import type { HarvestTrigger } from '../catalog/types';
import type { PlacedItem } from '../city/placement';
import { evaluateDay } from '../economy/day';
import type { DayEvaluation, MaterialId } from '../economy/types';
import { ALL_MATERIALS } from '../economy/types';
import type { GameState } from './state';

/** At most this many buildings of the same kind yield a harvest each day. */
export const HARVEST_MAX_PER_TYPE = 2;

export function isTriggerDone(evaluation: DayEvaluation, trigger: HarvestTrigger): boolean {
  return trigger === 'full_day' ? evaluation.fullDay : evaluation.quests[trigger].done;
}

/**
 * Buildings that can be harvested right now: their quest is validated today, they have not
 * been harvested yet, and fewer than `HARVEST_MAX_PER_TYPE` of their kind were harvested today.
 * Movement is the only thing that ripens a harvest; what is not collected today is not kept.
 */
export function readyHarvests(state: GameState, today: string): PlacedItem[] {
  const day = state.days[today];
  if (!day || day.activities.length === 0) return [];
  const evaluation = evaluateDay(day.activities);
  const harvested = day.harvested ?? [];
  const done = new Set(harvested.map((h) => h.id));
  const perType: Record<string, number> = {};
  for (const h of harvested) perType[h.itemId] = (perType[h.itemId] ?? 0) + 1;

  const ready: PlacedItem[] = [];
  for (const placed of state.city.items) {
    const harvest = getCityItem(placed.itemId)?.harvest;
    if (!harvest || done.has(placed.id)) continue;
    if (!isTriggerDone(evaluation, harvest.trigger)) continue;
    if ((perType[placed.itemId] ?? 0) >= HARVEST_MAX_PER_TYPE) continue;
    perType[placed.itemId] = (perType[placed.itemId] ?? 0) + 1;
    ready.push(placed);
  }
  return ready;
}

/** Sum of what a list of buildings yields. */
export function harvestYield(items: readonly PlacedItem[]): Partial<Record<MaterialId, number>> {
  const total: Partial<Record<MaterialId, number>> = {};
  for (const placed of items) {
    const harvest = getCityItem(placed.itemId)?.harvest;
    if (!harvest) continue;
    for (const m of ALL_MATERIALS) {
      const amount = harvest.yield[m] ?? 0;
      if (amount > 0) total[m] = (total[m] ?? 0) + amount;
    }
  }
  return total;
}
