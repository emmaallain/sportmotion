import { create } from 'zustand';

import { getRepository } from '@/data';
import type { GameRepository, RemoteError } from '@/data';
import { applyCommand, createInitialState } from '@/game/engine';
import type { CommandResult, GameCommand, GameEvent, GameState } from '@/game/engine';

import { currentDayKey } from './clock';
import { useSettings } from './settingsStore';

type EventListener = (events: GameEvent[], command: GameCommand) => void;
type ErrorListener = (error: RemoteError, command: GameCommand) => void;

const eventListeners = new Set<EventListener>();
const errorListeners = new Set<ErrorListener>();

/** UI side effects (sounds, toasts, celebrations) subscribe here. */
export function onGameEvents(listener: EventListener): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

export function onGameError(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

/** Commands whose outcome depends on server-side randomness: never applied optimistically. */
const SERVER_ONLY: readonly GameCommand['type'][] = ['open_chest'];

export interface GameStore {
  game: GameState;
  hydrated: boolean;
  /** Current game day; refreshed by `refreshDay`. */
  today: string;
  online: boolean;
  hydrate: (repository?: GameRepository) => Promise<void>;
  /** Applies a command. Returns the local result (optimistic in online mode). */
  dispatch: (command: GameCommand, options?: { silent?: boolean }) => CommandResult;
  /** Takes a state computed by the server (e.g. after a Strava sync) and its events. */
  adopt: (state: GameState, events?: GameEvent[]) => void;
  /** Re-reads the calendar and settles missed days. */
  refreshDay: () => void;
  reset: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let repo: GameRepository | null = null;
let remoteQueue: Promise<void> = Promise.resolve();
let pendingRemote = 0;

function scheduleSave(get: () => GameStore): void {
  if (!repo) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void repo?.save(get().game).catch(() => undefined);
  }, 250);
}

/** Writes the pending snapshot immediately (used before leaving and in tests). */
export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await repo?.save(useGame.getState().game);
}

export const useGame = create<GameStore>((set, get) => ({
  game: createInitialState(),
  hydrated: false,
  today: currentDayKey(),
  online: false,

  hydrate: async (repository = getRepository()) => {
    repo = repository;
    // The settings hold the demo calendar offset: they must be read before the first tick.
    await Promise.resolve(useSettings.persist.rehydrate()).catch(() => undefined);
    let loaded: GameState | null = null;
    try {
      loaded = await repository.load();
    } catch {
      loaded = null;
    }
    set({
      game: loaded ?? createInitialState(),
      hydrated: true,
      today: currentDayKey(),
      online: repository.mode === 'supabase',
    });
    get().refreshDay();
  },

  dispatch: (command, options) => {
    const today = currentDayKey();
    const ctx = { today, rand: Math.random };
    const remote = repo?.send?.bind(repo);

    if (remote && SERVER_ONLY.includes(command.type)) {
      // Let the server decide; report the result through the listeners.
      const probe = applyCommand(get().game, command, ctx);
      if (!probe.ok) return probe;
      pendingRemote += 1;
      remoteQueue = remoteQueue.then(async () => {
        const before = get().game;
        const result = await remote(command, { today });
        pendingRemote -= 1;
        if (result.ok) {
          set({ game: result.state, today });
          const events = diffChestEvents(before, result.state, today);
          if (events.length > 0) eventListeners.forEach((l) => l(events, command));
          scheduleSave(get);
        } else {
          errorListeners.forEach((l) => l(result.error, command));
        }
      });
      return { ok: true, state: get().game, events: [] };
    }

    const result = applyCommand(get().game, command, ctx);
    if (!result.ok) {
      // Background syncs retry the same activities: their refusals are not worth a message.
      if (!options?.silent) errorListeners.forEach((l) => l(result.error, command));
      return result;
    }
    if (result.state !== get().game || today !== get().today) {
      set({ game: result.state, today });
      scheduleSave(get);
    }
    if (result.events.length > 0) eventListeners.forEach((l) => l(result.events, command));

    if (remote && command.type !== 'tick') {
      pendingRemote += 1;
      remoteQueue = remoteQueue.then(async () => {
        const outcome = await remote(command, { today });
        pendingRemote -= 1;
        if (outcome.ok) {
          // Adopt the authoritative state once nothing newer is in flight.
          if (pendingRemote === 0) {
            set({ game: outcome.state });
            scheduleSave(get);
          }
        } else {
          if (outcome.state) set({ game: outcome.state });
          errorListeners.forEach((l) => l(outcome.error, command));
        }
      });
    }
    return result;
  },

  adopt: (state, events = []) => {
    set({ game: state });
    scheduleSave(get);
    if (events.length > 0) eventListeners.forEach((l) => l(events, { type: 'tick' }));
  },

  refreshDay: () => {
    get().dispatch({ type: 'tick' });
    const today = currentDayKey();
    if (today !== get().today) set({ today });
  },

  reset: async () => {
    await repo?.reset();
    set({ game: createInitialState(), today: currentDayKey() });
  },
}));

function diffChestEvents(before: GameState, after: GameState, today: string): GameEvent[] {
  const loot = after.days[today]?.chestLoot;
  if (loot && before.days[today]?.chest !== 'opened' && after.days[today]?.chest === 'opened') {
    return [{ type: 'chest_opened', loot }];
  }
  return [];
}
