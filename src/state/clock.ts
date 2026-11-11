import { addDays, localDayKey } from '@/game/economy';
import type { DayKey } from '@/game/economy';

import { useSettings } from './settingsStore';

/** The player's current day: the device's local day, plus the demo offset. */
export function currentDayKey(now: Date = new Date()): DayKey {
  return addDays(localDayKey(now), useSettings.getState().dayOffset);
}

/** Epoch ms of local midnight for the current game day. */
export function currentDayStartMs(now: Date = new Date()): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return midnight + useSettings.getState().dayOffset * 86_400_000;
}
