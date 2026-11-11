import { useEffect } from 'react';

import { playSfx } from '@/audio';
import type { GameError, GameEvent } from '@/game/engine';
import { ALL_MATERIALS } from '@/game/economy';
import { ERAS } from '@/game/progression';
import { t } from '@/i18n';
import { onGameError, onGameEvents } from '@/state/gameStore';
import { useUi } from '@/state/uiStore';

import { icons } from './theme';

export function errorMessage(error: GameError | { code: 'network' }): string {
  switch (error.code) {
    case 'placement':
      return t.errors.placement[error.reason] ?? t.errors.invalid;
    case 'activity_rejected':
      return t.errors.activity[error.reason] ?? t.errors.invalid;
    case 'network':
      return t.errors.network;
    default:
      return t.errors[error.code];
  }
}

function handleEvent(event: GameEvent): void {
  const ui = useUi.getState();
  switch (event.type) {
    case 'activity_counted':
      if (event.pulses > 0) ui.flyPulses(event.pulses);
      ui.pushToast(
        event.pulses > 0 ? t.activities.counted(event.pulses) : t.activities.countedNothing,
        'success',
      );
      if (event.reclassified) ui.pushToast(t.activities.reclassified, 'info');
      if (event.truncated) ui.pushToast(t.activities.truncated, 'warning');
      break;
    case 'quest_completed':
      playSfx('quest');
      ui.pushToast(t.celebrations.questDone(t.quests[event.quest]), 'success');
      break;
    case 'full_day':
      ui.celebrate({
        kind: 'full_day',
        title: t.celebrations.fullDay,
        body: t.celebrations.fullDayBody(event.streak),
      });
      break;
    case 'level_up':
      playSfx('level_up');
      ui.celebrate({
        kind: 'level',
        title: t.celebrations.levelUp(event.level),
        body: t.celebrations.levelUpBody,
      });
      break;
    case 'joker_used':
      ui.pushToast(t.celebrations.jokerUsed(event.count), 'info');
      break;
    case 'streak_broken':
      ui.pushToast(t.celebrations.streakReset, 'info');
      break;
    case 'chest_opened':
      playSfx('chest');
      ui.celebrate({
        kind: 'chest',
        title: t.quests.chestOpened,
        body: t.quests.chestLoot,
        lines: ALL_MATERIALS.filter((m) => (event.loot[m] ?? 0) > 0).map(
          (m) => `${icons.materials[m]} +${event.loot[m]} ${t.materials[m]}`,
        ),
      });
      break;
    case 'purchased':
      playSfx('purchase');
      break;
    case 'sold':
      playSfx('purchase');
      if (event.pulses > 0) ui.flyPulses(event.pulses);
      break;
    case 'crafted':
      playSfx('place');
      ui.pushToast(t.craft.crafted(event.quantity, t.materials[event.material] ?? ''), 'success');
      break;
    case 'era_advanced': {
      playSfx('level_up');
      const key = ERAS.find((e) => e.id === event.era)?.key ?? 'village';
      ui.celebrate({
        kind: 'era',
        title: t.celebrations.eraTitle(t.eras[key]?.name ?? ''),
        body: t.celebrations.eraBody,
      });
      break;
    }
  }
}

/** Turns game events into feedback: sounds, toasts, celebrations, flying Pulses. */
export function GameEffects() {
  useEffect(() => {
    const offEvents = onGameEvents((events) => events.forEach(handleEvent));
    const offErrors = onGameError((error, command) => {
      // Background commands fail silently; everything else explains itself.
      if (command.type === 'tick' || command.type === 'advance_era') return;
      useUi.getState().pushToast(errorMessage(error), 'warning');
    });
    return () => {
      offEvents();
      offErrors();
    };
  }, []);
  return null;
}
