import { seededRandom } from '../../economy/chest';
import { isPlausibleToday, processRequest, reviveState } from '../server';
import type { ServerEnv } from '../server';
import { createInitialState } from '../state';

const NOW = Date.parse('2026-06-15T12:00:00Z');
const TODAY = '2026-06-15';
const env = (over: Partial<ServerEnv> = {}): ServerEnv => ({
  now: NOW,
  rand: seededRandom(3),
  allowMockActivities: false,
  ...over,
});
const walk = (over: Record<string, unknown> = {}) => ({
  id: 'w1',
  type: 'walk',
  source: 'healthkit',
  startMs: NOW - 3_600_000,
  durationMin: 50,
  steps: 5000,
  ...over,
});
const send = (command: unknown, today: unknown = TODAY, e = env(), stored: unknown = null) =>
  processRequest(stored, { command, today }, e);

describe('isPlausibleToday', () => {
  it('accepts any day that exists somewhere on Earth right now', () => {
    expect(isPlausibleToday('2026-06-15', NOW)).toBe(true);
    expect(isPlausibleToday('2026-06-16', NOW)).toBe(true); // UTC+14
    expect(isPlausibleToday('2026-06-14', Date.parse('2026-06-15T05:00:00Z'))).toBe(true); // UTC−12
  });
  it('refuses other days and malformed values', () => {
    expect(isPlausibleToday('2026-06-17', NOW)).toBe(false);
    expect(isPlausibleToday('2026-06-13', NOW)).toBe(false);
    expect(isPlausibleToday('demain', NOW)).toBe(false);
    expect(isPlausibleToday(undefined, NOW)).toBe(false);
  });
});

describe('processRequest', () => {
  it('creates the game on the first command', () => {
    const res = send({ type: 'claim_starter_bonus' });
    expect(res.status).toBe(200);
    expect(res.body.state.balances.pulses).toBe(200);
  });

  it('computes activity gains on the server', () => {
    const res = send({ type: 'add_activity', activity: walk() });
    expect(res.status).toBe(200);
    expect(res.body.state.balances).toMatchObject({ pulses: 50, xp: 50 });
    expect(res.body.ok && res.body.events.map((e) => e.type)).toContain('quest_completed');
  });

  it('ignores balances or extra fields smuggled in the request', () => {
    const res = processRequest(
      null,
      {
        command: { type: 'add_activity', activity: walk({ pulses: 9999, bonus: true }) },
        today: TODAY,
        state: { balances: { pulses: 1_000_000 } },
      },
      env(),
    );
    expect(res.body.state.balances.pulses).toBe(50);
    expect(res.body.state.days[TODAY]?.activities[0]).not.toHaveProperty('pulses');
  });

  it('refuses simulated activities unless the project allows them', () => {
    const mock = { type: 'add_activity', activity: walk({ source: 'mock' }) };
    expect(send(mock)).toMatchObject({
      status: 422,
      body: { error: { code: 'mock_not_allowed' } },
    });
    expect(send(mock, TODAY, env({ allowMockActivities: true })).status).toBe(200);
  });

  it('refuses malformed activities', () => {
    for (const bad of [
      walk({ id: '' }),
      walk({ type: 'teleport' }),
      walk({ source: 'cheat' }),
      walk({ durationMin: '50' }),
      walk({ steps: '5000' }),
      null,
      'walk',
    ]) {
      expect(send({ type: 'add_activity', activity: bad }).status).toBe(400);
    }
  });

  it('refuses activities from another day or from the future', () => {
    const old = { type: 'add_activity', activity: walk({ startMs: NOW - 4 * 86_400_000 }) };
    const future = { type: 'add_activity', activity: walk({ startMs: NOW + 2 * 86_400_000 }) };
    expect(send(old).body).toMatchObject({ error: { code: 'activity_out_of_window' } });
    expect(send(future).body).toMatchObject({ error: { code: 'activity_out_of_window' } });
  });

  it('still applies the plausibility rules of the engine', () => {
    const car = { type: 'add_activity', activity: walk({ type: 'run', distanceKm: 60 }) };
    expect(send(car)).toMatchObject({
      status: 422,
      body: { error: { code: 'activity_rejected', reason: 'vehicle_speed' } },
    });
  });

  it('refuses an implausible or backdated "today"', () => {
    expect(send({ type: 'tick' }, '2026-07-01').body).toMatchObject({ error: { code: 'bad_day' } });
    const first = send({ type: 'add_activity', activity: walk() }, '2026-06-16');
    const done = processRequest(
      first.body.state,
      {
        command: {
          type: 'add_activity',
          activity: walk({ id: 's', type: 'strength', startMs: NOW, durationMin: 30 }),
        },
        today: '2026-06-16',
      },
      env(),
    );
    const complete = processRequest(
      done.body.state,
      {
        command: {
          type: 'add_activity',
          activity: walk({
            id: 'y',
            type: 'yoga',
            startMs: NOW + 3_600_000,
            durationMin: 15,
            steps: undefined,
          }),
        },
        today: '2026-06-16',
      },
      env(),
    );
    expect(complete.body.state.streak.lastSettledDay).toBe('2026-06-16');
    // going back to the 15th after completing the 16th is refused
    expect(send({ type: 'tick' }, TODAY, env(), complete.body.state).body).toMatchObject({
      error: { code: 'bad_day' },
    });
  });

  it('refuses unknown commands and bad envelopes', () => {
    expect(send({ type: 'grant_pulses', amount: 500 }).status).toBe(400);
    expect(send(null).status).toBe(400);
    expect(processRequest(null, 'hello', env()).status).toBe(400);
    expect(processRequest(null, null, env()).status).toBe(400);
  });

  it('can restrict an endpoint to some commands', () => {
    const res = processRequest(null, { command: { type: 'buy_plot' }, today: TODAY }, env(), [
      'add_activity',
    ]);
    expect(res.body).toMatchObject({ error: { code: 'command_not_allowed' } });
  });

  it('returns the unchanged state with engine errors', () => {
    const res = send({ type: 'place_item', id: 'b1', itemId: 'village_house', x: 1, y: 1, rot: 0 });
    expect(res).toMatchObject({ status: 422, body: { error: { code: 'insufficient_funds' } } });
    expect(res.body.state.city.items).toHaveLength(0);
  });
});

describe('reviveState', () => {
  it('starts fresh from missing or foreign data', () => {
    expect(reviveState(undefined)).toEqual(createInitialState());
    expect(reviveState({ version: 99 })).toEqual(createInitialState());
    expect(reviveState('x')).toEqual(createInitialState());
  });
  it('keeps a valid snapshot', () => {
    const state = createInitialState();
    state.balances.pulses = 42;
    expect(reviveState(JSON.parse(JSON.stringify(state))).balances.pulses).toBe(42);
  });
});
