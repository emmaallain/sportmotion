import AsyncStorage from '@react-native-async-storage/async-storage';

import { LocalRepository } from '@/data/localRepository';
import type { GameRepository, RemoteResult } from '@/data/repository';
import { applyCommand, createInitialState } from '@/game/engine';
import type { GameCommand, GameEvent, GameState } from '@/game/engine';
import { seededRandom } from '@/game/economy';

import { currentDayKey } from '../clock';
import { flushSave, onGameError, onGameEvents, useGame } from '../gameStore';
import { useSettings } from '../settingsStore';

const walk = (id: string, steps = 5000): GameCommand => ({
  type: 'add_activity',
  activity: { id, type: 'walk', source: 'mock', startMs: Date.now(), durationMin: 50, steps },
});

beforeEach(async () => {
  await AsyncStorage.clear();
  useSettings.setState({ dayOffset: 0 });
  useGame.setState({ game: createInitialState(), hydrated: false });
});

describe('game store (local mode)', () => {
  it('hydrates a new game and persists commands', async () => {
    const repo = new LocalRepository();
    await useGame.getState().hydrate(repo);
    expect(useGame.getState().hydrated).toBe(true);
    expect(useGame.getState().online).toBe(false);

    const result = useGame.getState().dispatch({ type: 'claim_starter_bonus' });
    expect(result.ok).toBe(true);
    expect(useGame.getState().game.balances.pulses).toBe(200);
    await flushSave();
    expect((await repo.load())?.balances.pulses).toBe(200);

    useGame.setState({ game: createInitialState(), hydrated: false });
    await useGame.getState().hydrate(repo);
    expect(useGame.getState().game.balances.pulses).toBe(200);
  });

  it('notifies listeners of events and errors', async () => {
    await useGame.getState().hydrate(new LocalRepository());
    const events: GameEvent[] = [];
    const errors: string[] = [];
    const offEvents = onGameEvents((e) => events.push(...e));
    const offErrors = onGameError((e) => errors.push(e.code));

    useGame.getState().dispatch(walk('w1'));
    expect(events.map((e) => e.type)).toContain('quest_completed');
    useGame.getState().dispatch({ type: 'open_chest' });
    expect(errors).toEqual(['no_chest']);

    offEvents();
    offErrors();
    useGame.getState().dispatch(walk('w2', 100));
    expect(events.filter((e) => e.type === 'activity_counted')).toHaveLength(1);
  });

  it('follows the demo calendar offset and settles the streak', async () => {
    await useGame.getState().hydrate(new LocalRepository());
    const day1 = currentDayKey();
    for (const type of ['walk', 'strength', 'stretch'] as const) {
      useGame.getState().dispatch({
        type: 'add_activity',
        activity: {
          id: `a-${type}`,
          type,
          source: 'mock',
          startMs: Date.now() + (type === 'walk' ? 0 : type === 'strength' ? 4e6 : 8e6),
          durationMin: type === 'walk' ? 50 : type === 'strength' ? 30 : 15,
          steps: type === 'walk' ? 5000 : undefined,
        },
      });
    }
    expect(useGame.getState().game.streak.count).toBe(1);

    useSettings.getState().shiftDay(1);
    useGame.getState().refreshDay();
    expect(useGame.getState().today).not.toBe(day1);
    expect(useGame.getState().game.streak.count).toBe(1);

    useSettings.getState().shiftDay(2);
    useGame.getState().refreshDay();
    expect(useGame.getState().game.streak.count).toBe(0);
  });

  it('resets the saved game', async () => {
    const repo = new LocalRepository();
    await useGame.getState().hydrate(repo);
    useGame.getState().dispatch({ type: 'claim_starter_bonus' });
    await flushSave();
    await useGame.getState().reset();
    expect(useGame.getState().game.balances.pulses).toBe(0);
    expect(await repo.load()).toBeNull();
  });

  it('starts a new game when loading fails', async () => {
    const broken: GameRepository = {
      mode: 'local',
      load: () => Promise.reject(new Error('disk')),
      save: () => Promise.resolve(),
      reset: () => Promise.resolve(),
    };
    await useGame.getState().hydrate(broken);
    expect(useGame.getState().hydrated).toBe(true);
    expect(useGame.getState().game.balances.pulses).toBe(0);
  });
});

/** In-memory stand-in for the server: runs the same reducer, with its own randomness. */
class FakeServer implements GameRepository {
  readonly mode = 'supabase' as const;
  state: GameState = createInitialState();
  sent: GameCommand[] = [];
  failNext = false;

  load = async () => this.state;
  save = async () => undefined;
  reset = async () => undefined;

  send = async (command: GameCommand, ctx: { today: string }): Promise<RemoteResult> => {
    this.sent.push(command);
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, error: { code: 'network' }, state: this.state };
    }
    const result = applyCommand(this.state, command, { ...ctx, rand: seededRandom(99) });
    if (!result.ok) return { ok: false, error: result.error, state: this.state };
    this.state = result.state;
    return { ok: true, state: result.state };
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('game store (online mode)', () => {
  it('applies commands optimistically and adopts the server state', async () => {
    const server = new FakeServer();
    await useGame.getState().hydrate(server);
    expect(useGame.getState().online).toBe(true);

    useGame.getState().dispatch({ type: 'claim_starter_bonus' });
    expect(useGame.getState().game.balances.pulses).toBe(200);
    await settle();
    expect(server.sent.map((c) => c.type)).toEqual(['claim_starter_bonus']);
    expect(useGame.getState().game).toBe(server.state);
  });

  it('rolls back to the server state when the server refuses', async () => {
    const server = new FakeServer();
    await useGame.getState().hydrate(server);
    const errors: string[] = [];
    const off = onGameError((e) => errors.push(e.code));

    server.failNext = true;
    useGame.getState().dispatch({ type: 'claim_starter_bonus' });
    expect(useGame.getState().game.balances.pulses).toBe(200);
    await settle();
    expect(useGame.getState().game.balances.pulses).toBe(0);
    expect(errors).toEqual(['network']);
    off();
  });

  it('lets the server roll the chest', async () => {
    const server = new FakeServer();
    await useGame.getState().hydrate(server);
    const events: GameEvent[] = [];
    const off = onGameEvents((e) => events.push(...e));

    const base = Date.now();
    const steps: GameCommand[] = [
      walk('w1'),
      {
        type: 'add_activity',
        activity: {
          id: 's1',
          type: 'strength',
          source: 'mock',
          startMs: base + 4e6,
          durationMin: 30,
        },
      },
      {
        type: 'add_activity',
        activity: { id: 'y1', type: 'yoga', source: 'mock', startMs: base + 8e6, durationMin: 15 },
      },
    ];
    steps.forEach((c) => useGame.getState().dispatch(c));
    await settle();

    const before = useGame.getState().game.balances.materials;
    useGame.getState().dispatch({ type: 'open_chest' });
    // not applied locally: the loot comes from the server
    expect(useGame.getState().game.balances.materials).toEqual(before);
    await settle();
    await settle();
    const chest = events.find((e) => e.type === 'chest_opened');
    expect(chest).toBeDefined();
    expect(useGame.getState().game.days[useGame.getState().today]?.chest).toBe('opened');
    off();
  });
});
