import AsyncStorage from '@react-native-async-storage/async-storage';

import { STATE_VERSION, createInitialState } from '@/game/engine';
import type { GameState } from '@/game/engine';

import type { GameRepository } from './repository';

export const LOCAL_SAVE_KEY = 'sportmotion/game/v1';

/** Accepts only snapshots of the current version with the expected shape. */
export function parseSnapshot(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<GameState> | null;
    if (!data || typeof data !== 'object' || data.version !== STATE_VERSION) return null;
    if (!data.balances || !data.city || !Array.isArray(data.city.items)) return null;
    // Fill in fields added after the snapshot was written.
    return { ...createInitialState(), ...data } as GameState;
  } catch {
    return null;
  }
}

/** Offline persistence: one JSON snapshot in AsyncStorage. */
export class LocalRepository implements GameRepository {
  readonly mode = 'local' as const;

  constructor(private readonly key: string = LOCAL_SAVE_KEY) {}

  async load(): Promise<GameState | null> {
    return parseSnapshot(await AsyncStorage.getItem(this.key));
  }

  async save(state: GameState): Promise<void> {
    await AsyncStorage.setItem(this.key, JSON.stringify(state));
  }

  async reset(): Promise<void> {
    await AsyncStorage.removeItem(this.key);
  }
}
