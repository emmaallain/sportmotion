import AsyncStorage from '@react-native-async-storage/async-storage';

import { createInitialState } from '@/game/engine';

import { getRepository, isSupabaseConfigured, setRepository } from '../index';
import { LOCAL_SAVE_KEY, LocalRepository, parseSnapshot } from '../localRepository';

beforeEach(() => AsyncStorage.clear());

describe('LocalRepository', () => {
  it('returns null for a new player', async () => {
    expect(await new LocalRepository().load()).toBeNull();
  });

  it('round-trips a snapshot', async () => {
    const repo = new LocalRepository();
    const state = createInitialState();
    state.balances.pulses = 321;
    state.city.items.push({ id: 'a', itemId: 'well', x: 1, y: 2, rot: 0 });
    await repo.save(state);
    expect(await repo.load()).toEqual(state);
    await repo.reset();
    expect(await repo.load()).toBeNull();
  });

  it('ignores corrupted or outdated data', async () => {
    await AsyncStorage.setItem(LOCAL_SAVE_KEY, '{not json');
    expect(await new LocalRepository().load()).toBeNull();
    expect(parseSnapshot(JSON.stringify({ version: 0 }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ version: 1 }))).toBeNull();
    expect(parseSnapshot('null')).toBeNull();
  });

  it('fills in fields missing from an older snapshot', () => {
    const { onboardingDone: _dropped, ...old } = createInitialState();
    expect(parseSnapshot(JSON.stringify(old))?.onboardingDone).toBe(false);
  });
});

describe('repository selection', () => {
  afterEach(() => setRepository(null));

  it('defaults to local mode without Supabase variables', () => {
    expect(isSupabaseConfigured()).toBe(false);
    expect(getRepository().mode).toBe('local');
    expect(getRepository()).toBe(getRepository());
  });
});
