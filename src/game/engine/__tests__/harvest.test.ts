import { seededRandom } from '../../economy/chest';
import { addDays } from '../../economy/dates';
import type { Activity, ActivityType } from '../../economy/types';
import { CITY_ITEMS } from '../../catalog/index';
import type { GameCommand } from '../commands';
import { HARVEST_MAX_PER_TYPE, harvestYield, readyHarvests } from '../harvest';
import { applyCommand } from '../reducer';
import { processRequest } from '../server';
import { createInitialState } from '../state';
import type { GameState } from '../state';

const D1 = '2026-05-01';
let seq = 0;
const ctx = (today = D1) => ({ today, rand: seededRandom(1) });

function send(state: GameState, command: GameCommand, today = D1) {
  return applyCommand(state, command, ctx(today));
}
function ok(state: GameState, command: GameCommand, today = D1): GameState {
  const r = send(state, command, today);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.state;
}
function act(type: ActivityType, hour: number, durationMin: number, steps?: number): GameCommand {
  const activity: Activity = {
    id: `h${++seq}`,
    type,
    source: 'mock',
    startMs: Date.parse(`${D1}T00:00:00Z`) + hour * 3_600_000,
    durationMin,
    steps,
  };
  return { type: 'add_activity', activity };
}

/** A village with one of each era-1 harvest building, plus three wells. */
function village(): GameState {
  const state = createInitialState();
  const items: [string, string, number, number][] = [
    ['well1', 'well', 0, 0],
    ['well2', 'well', 1, 0],
    ['well3', 'well', 2, 0],
    ['field', 'field', 0, 2],
    ['garden', 'vegetable_garden', 2, 2],
    ['coop', 'chicken_coop', 4, 2],
    ['orchard', 'orchard', 6, 2],
    ['barn', 'barn', 0, 5],
    ['house', 'village_house', 4, 5],
  ];
  state.city.items = items.map(([id, itemId, x, y]) => ({ id, itemId, x, y, rot: 0 }));
  return state;
}

describe('harvests', () => {
  it('needs movement: nothing is ready on a day without activity', () => {
    expect(readyHarvests(village(), D1)).toEqual([]);
    expect(send(village(), { type: 'harvest_all' })).toEqual({
      ok: false,
      error: { code: 'nothing_to_harvest' },
    });
  });

  it('ripens the buildings tied to the quest that was validated', () => {
    let s = ok(village(), act('walk', 8, 50, 5000));
    expect(readyHarvests(s, D1).map((p) => p.id)).toEqual(['orchard']);
    s = ok(s, act('strength', 10, 30));
    expect(readyHarvests(s, D1).map((p) => p.id)).toEqual(['field', 'coop', 'orchard']);
    s = ok(s, act('yoga', 12, 15));
    // stretch quest → wells and garden; the three quests → barn
    expect(readyHarvests(s, D1).map((p) => p.id)).toEqual([
      'well1',
      'well2',
      'field',
      'garden',
      'coop',
      'orchard',
      'barn',
    ]);
  });

  it('is not ready below the quest goal', () => {
    const s = ok(village(), act('walk', 8, 49, 4999));
    expect(readyHarvests(s, D1)).toEqual([]);
  });

  it('credits the materials once per building and per day', () => {
    const s = ok(village(), act('walk', 8, 50, 5000));
    const wood = s.balances.materials.wood;
    const r = send(s, { type: 'harvest', id: 'orchard' });
    expect(r.ok && r.events).toContainEqual({
      type: 'harvested',
      count: 1,
      materials: { wood: 2 },
    });
    const after = r.ok ? r.state : s;
    expect(after.balances.materials.wood).toBe(wood + 2);
    expect(after.balances.pulses).toBe(s.balances.pulses);
    expect(send(after, { type: 'harvest', id: 'orchard' })).toEqual({
      ok: false,
      error: { code: 'nothing_to_harvest' },
    });
    expect(readyHarvests(after, D1)).toEqual([]);
  });

  it('refuses buildings that are not ready or have no harvest', () => {
    const s = ok(village(), act('walk', 8, 50, 5000));
    expect(send(s, { type: 'harvest', id: 'field' }).ok).toBe(false);
    expect(send(s, { type: 'harvest', id: 'house' }).ok).toBe(false);
    expect(send(s, { type: 'harvest', id: 'nope' }).ok).toBe(false);
  });

  it(`limits each kind of building to ${HARVEST_MAX_PER_TYPE} harvests a day`, () => {
    let s = ok(village(), act('yoga', 8, 15));
    const water = s.balances.materials.water;
    // the first two wells produce; the third one is over the daily limit
    expect(send(s, { type: 'harvest', id: 'well3' }).ok).toBe(false);
    s = ok(s, { type: 'harvest', id: 'well1' });
    s = ok(s, { type: 'harvest', id: 'well2' });
    expect(send(s, { type: 'harvest', id: 'well3' }).ok).toBe(false);
    expect(s.balances.materials.water).toBe(water + 4);
    // selling a harvested building and buying another one does not reset the limit
    s = ok(s, { type: 'sell_item', id: 'well1' });
    expect(readyHarvests(s, D1).map((p) => p.itemId)).not.toContain('well');
  });

  it('collects everything at once', () => {
    let s = village();
    for (const c of [act('walk', 8, 50, 5000), act('cycling', 10, 30), act('stretch', 12, 15)]) {
      s = ok(s, c);
    }
    const before = s.balances.materials;
    const expected = harvestYield(readyHarvests(s, D1));
    expect(expected).toEqual({ wood: 3, stone: 1, water: 5, energy: 5 });
    const after = ok(s, { type: 'harvest_all' });
    expect(after.balances.materials.wood).toBe(before.wood + 3);
    expect(after.balances.materials.energy).toBe(before.energy + 5);
    expect(after.days[D1]?.harvested).toHaveLength(7);
    expect(send(after, { type: 'harvest_all' }).ok).toBe(false);
  });

  it('starts again the next day, and yesterday’s forgotten harvest is not kept', () => {
    const s = ok(village(), act('walk', 8, 50, 5000));
    const tomorrow = addDays(D1, 1);
    expect(readyHarvests(s, tomorrow)).toEqual([]);
    expect(send(s, { type: 'harvest_all' }, tomorrow).ok).toBe(false);
  });

  it('is validated by the server like any other command', () => {
    const now = Date.parse(`${D1}T12:00:00Z`);
    const env = { now, rand: seededRandom(2), allowMockActivities: true };
    const refused = processRequest(village(), { command: { type: 'harvest_all' }, today: D1 }, env);
    expect(refused.status).toBe(422);
    const walked = ok(village(), act('walk', 8, 50, 5000));
    const accepted = processRequest(walked, { command: { type: 'harvest_all' }, today: D1 }, env);
    expect(accepted.status).toBe(200);
  });

  it('only ever yields materials, in small amounts', () => {
    const producers = CITY_ITEMS.filter((i) => i.harvest);
    expect(producers.length).toBeGreaterThanOrEqual(7);
    for (const item of producers) {
      const total = Object.values(item.harvest?.yield ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(3);
      expect(item.kind).not.toBe('road');
    }
  });
});
