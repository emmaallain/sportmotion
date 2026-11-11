import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import { seededRandom } from '@/game/economy';
import { createInitialState, processRequest } from '@/game/engine';
import type { GameState } from '@/game/engine';

import { SupabaseRepository } from '../supabaseRepository';

const TODAY = new Date().toISOString().slice(0, 10);

/** Fake Supabase: one user, a `game_states` row, and edge functions running the real reducer. */
function fakeClient(options: { offline?: boolean; session?: boolean } = {}) {
  const server: { state: GameState | null; calls: { name: string; body: unknown }[] } = {
    state: null,
    calls: [],
  };
  let session = options.session ?? false;
  const signInAnonymously = jest.fn(async () => {
    session = true;
    return { data: { user: { id: 'u1' } }, error: null };
  });
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: session ? { user: { id: 'u1' } } : null },
      }),
      signInAnonymously,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (options.offline) return { data: null, error: new Error('offline') };
            return { data: server.state ? { state: server.state } : null, error: null };
          },
        }),
      }),
    }),
    functions: {
      invoke: async (name: string, { body }: { body: Record<string, unknown> }) => {
        server.calls.push({ name, body });
        if (options.offline) throw new Error('offline');
        if (body.action === 'reset') {
          server.state = createInitialState();
          return { data: { ok: true, state: server.state }, error: null };
        }
        const res = processRequest(server.state, body, {
          now: Date.now(),
          rand: seededRandom(5),
          allowMockActivities: false,
        });
        if (res.body.ok) {
          server.state = res.body.state;
          return { data: res.body, error: null };
        }
        // like supabase-js: non-2xx replies come back as an error carrying the Response
        return { data: null, error: { context: { json: async () => res.body } } };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, server, signInAnonymously };
}

beforeEach(() => AsyncStorage.clear());

describe('SupabaseRepository', () => {
  it('signs guests in anonymously and starts with no game', async () => {
    const { client, signInAnonymously } = fakeClient();
    const repo = new SupabaseRepository(client);
    expect(repo.mode).toBe('supabase');
    expect(await repo.load()).toBeNull();
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    await repo.load();
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('routes activities to validate-activity and everything else to game-command', async () => {
    const { client, server } = fakeClient({ session: true });
    const repo = new SupabaseRepository(client);
    const bonus = await repo.send({ type: 'claim_starter_bonus' }, { today: TODAY });
    expect(bonus.ok && bonus.state.balances.pulses).toBe(200);
    await repo.send(
      {
        type: 'add_activity',
        activity: {
          id: 'w',
          type: 'walk',
          source: 'manual',
          startMs: Date.now() - 3_600_000,
          durationMin: 60,
          steps: 6000,
        },
      },
      { today: TODAY },
    );
    expect(server.calls.map((c) => c.name)).toEqual(['game-command', 'validate-activity']);
    expect(server.state?.balances.materials.wood).toBe(13);
  });

  it('returns the server error and the authoritative state when a command is refused', async () => {
    const { client } = fakeClient({ session: true });
    const repo = new SupabaseRepository(client);
    const refused = await repo.send(
      { type: 'place_item', id: 'b', itemId: 'village_house', x: 1, y: 1, rot: 0 },
      { today: TODAY },
    );
    expect(refused).toMatchObject({ ok: false, error: { code: 'insufficient_funds' } });
    expect(!refused.ok && refused.state?.balances.pulses).toBe(0);

    const mock = await repo.send(
      {
        type: 'add_activity',
        activity: { id: 'm', type: 'yoga', source: 'mock', startMs: Date.now(), durationMin: 20 },
      },
      { today: TODAY },
    );
    expect(mock).toMatchObject({ ok: false, error: { code: 'mock_not_allowed' } });
  });

  it('caches the last state and serves it when offline', async () => {
    const online = fakeClient({ session: true });
    const repo = new SupabaseRepository(online.client);
    await repo.send({ type: 'claim_starter_bonus' }, { today: TODAY });
    expect((await repo.load())?.balances.pulses).toBe(200);

    const offline = new SupabaseRepository(fakeClient({ session: true, offline: true }).client);
    expect((await offline.load())?.balances.pulses).toBe(200);
    expect(await offline.send({ type: 'tick' }, { today: TODAY })).toEqual({
      ok: false,
      error: { code: 'network' },
    });
  });

  it('saves to the local cache only, and resets on the server', async () => {
    const { client, server } = fakeClient({ session: true });
    const repo = new SupabaseRepository(client);
    await repo.send({ type: 'claim_starter_bonus' }, { today: TODAY });
    const state = createInitialState();
    state.balances.pulses = 999_999; // a tampered client state…
    await repo.save(state);
    expect(server.state?.balances.pulses).toBe(200); // …never reaches the server

    await repo.reset();
    expect(server.calls[server.calls.length - 1]?.body).toMatchObject({ action: 'reset' });
    expect(server.state?.balances.pulses).toBe(0);
  });
});
