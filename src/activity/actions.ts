import type { ActivityType } from '@/game/economy';
import { dayRecord } from '@/game/engine';
import type { CommandResult } from '@/game/engine';
import { currentDayStartMs } from '@/state/clock';
import { useGame } from '@/state/gameStore';

import { nextFreeSlot } from './ActivityProvider';
import type { ManualEntry } from './ManualActivityProvider';
import { manualProvider, mockProvider } from './index';

function nextSlot(): number {
  const { game, today } = useGame.getState();
  return nextFreeSlot(dayRecord(game, today).activities, currentDayStartMs());
}

/** Simulator: a walk of `steps` steps. */
export function addSimulatedSteps(steps: number): CommandResult {
  const activity = mockProvider.simulateSteps(steps, nextSlot());
  return useGame.getState().dispatch({ type: 'add_activity', activity });
}

/** Simulator: a timed session. */
export function addSimulatedSession(type: ActivityType, durationMin: number): CommandResult {
  const activity = mockProvider.simulateSession(type, durationMin, nextSlot());
  return useGame.getState().dispatch({ type: 'add_activity', activity });
}

/** Simulator: exactly what the three daily quests ask for. */
export function addSimulatedFullDay(): void {
  addSimulatedSteps(5000);
  addSimulatedSession('strength', 30);
  addSimulatedSession('stretch', 15);
}

/** Manual entry (counted at 50 % by the engine). Returns null when the form is invalid. */
export function addManualActivity(entry: ManualEntry): CommandResult | null {
  const activity = manualProvider.createActivity(entry, nextSlot());
  if (!activity) return null;
  return useGame.getState().dispatch({ type: 'add_activity', activity });
}
