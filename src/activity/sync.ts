import type { GameCommand } from '@/game/engine';

import type { ActivityProvider } from './ActivityProvider';

/**
 * Pulls today's activities from a provider and feeds them to the game. Activity ids are
 * stable, so syncing twice is harmless: the engine refuses duplicates.
 *
 * Not called in the MVP (the simulator and manual entry push activities directly); it is
 * the single entry point the health providers will use.
 */
export async function syncProvider(
  provider: ActivityProvider,
  dayStartMs: number,
  knownIds: ReadonlySet<string>,
  dispatch: (command: GameCommand) => { ok: boolean },
): Promise<{ added: number; rejected: number }> {
  if ((await provider.getStatus()) !== 'available') return { added: 0, rejected: 0 };
  const activities = await provider.fetchActivities(dayStartMs, dayStartMs + 86_400_000);
  let added = 0;
  let rejected = 0;
  // longest first: when two overlap, the engine keeps the longest one
  for (const activity of [...activities].sort((a, b) => b.durationMin - a.durationMin)) {
    if (knownIds.has(activity.id)) continue;
    if (dispatch({ type: 'add_activity', activity }).ok) added += 1;
    else rejected += 1;
  }
  return { added, rejected };
}
