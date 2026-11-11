import { addDays } from '../../economy/dates';
import { seededRandom } from '../../economy/chest';
import type { Activity, ActivityType } from '../../economy/types';
import { totalXpForLevel } from '../../progression/levels';
import type { CommandContext, GameCommand, GameError, GameEvent } from '../commands';
import { applyCommand, canAfford } from '../reducer';
import { selectEraProgress, selectLevel, selectToday } from '../selectors';
import { createInitialState } from '../state';
import type { GameState } from '../state';

const D1 = '2026-05-01';
let seq = 0;
const ctx = (today = D1): CommandContext => ({ today, rand: seededRandom(1) });

function activity(
  type: ActivityType,
  hour: number,
  durationMin: number,
  extra: Partial<Activity> = {},
): Activity {
  return {
    id: `act${++seq}`,
    type,
    source: 'mock',
    startMs: Date.parse('2026-05-01T00:00:00Z') + hour * 3_600_000,
    durationMin,
    ...extra,
  };
}

function ok(state: GameState, command: GameCommand, today = D1) {
  const result = applyCommand(state, command, ctx(today));
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.error)}`);
  return result;
}

function err(state: GameState, command: GameCommand, today = D1): GameError {
  const result = applyCommand(state, command, ctx(today));
  if (result.ok) throw new Error('expected failure');
  return result.error;
}

/** A state rich enough to buy anything. */
function rich(over: Partial<GameState> = {}): GameState {
  const base = createInitialState();
  return {
    ...base,
    balances: {
      pulses: 100_000,
      xp: 0,
      materials: { wood: 999, stone: 999, water: 999, energy: 999, brick: 999, glass: 0, steel: 0 },
    },
    ...over,
  };
}

function fullDay(state: GameState, today = D1): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let s = state;
  for (const a of [
    activity('walk', 8, 50, { steps: 5000 }),
    activity('strength', 10, 30),
    activity('stretch', 12, 15),
  ]) {
    const r = ok(s, { type: 'add_activity', activity: a }, today);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

const place = (itemId: string, x: number, y: number, id = `b${++seq}`): GameCommand => ({
  type: 'place_item',
  id,
  itemId,
  x,
  y,
  rot: 0,
});

describe('onboarding', () => {
  it('grants the starter bonus once', () => {
    const first = ok(createInitialState(), { type: 'claim_starter_bonus' }).state;
    expect(first.balances.pulses).toBe(200);
    expect(first.balances.materials).toMatchObject({ wood: 10, stone: 5 });
    const second = ok(first, { type: 'claim_starter_bonus' }).state;
    expect(second.balances.pulses).toBe(200);
  });

  it('lets the player afford exactly the first village house', () => {
    const s = ok(createInitialState(), { type: 'claim_starter_bonus' }).state;
    const after = ok(s, place('village_house', 4, 4)).state;
    expect(after.balances.pulses).toBe(50);
    expect(after.balances.materials).toMatchObject({ wood: 0, stone: 0 });
    expect(ok(after, { type: 'finish_onboarding' }).state.onboardingDone).toBe(true);
  });
});

describe('activities', () => {
  it('credits Pulses, XP and materials and reports the quest', () => {
    const r = ok(createInitialState(), {
      type: 'add_activity',
      activity: activity('walk', 8, 60, { steps: 6000 }),
    });
    expect(r.state.balances.pulses).toBe(54);
    expect(r.state.balances.xp).toBe(54);
    expect(r.state.balances.materials.wood).toBe(6);
    expect(r.events).toContainEqual({ type: 'quest_completed', quest: 'walk' });
    expect(r.events[0]).toMatchObject({ type: 'activity_counted', pulses: 54 });
  });

  it('only pays the difference when activities accumulate', () => {
    let s = ok(createInitialState(), {
      type: 'add_activity',
      activity: activity('strength', 8, 20),
    }).state;
    expect(s.balances.pulses).toBe(0);
    expect(s.balances.materials.stone).toBe(4);
    s = ok(s, { type: 'add_activity', activity: activity('strength', 9, 20) }).state;
    expect(s.balances.pulses).toBe(50 + 10);
    expect(s.balances.materials.stone).toBe(8);
  });

  it('completes the day: bonus, streak, chest', () => {
    const { state, events } = fullDay(createInitialState());
    expect(state.balances.pulses).toBe(200);
    expect(state.streak.count).toBe(1);
    expect(events).toContainEqual({ type: 'full_day', streak: 1 });
    expect(selectToday(state, D1).record.chest).toBe('ready');
    expect(selectToday(state, D1).evaluation.fullDay).toBe(true);
  });

  it('rejects implausible activities without storing them', () => {
    const s = createInitialState();
    expect(
      err(s, {
        type: 'add_activity',
        activity: activity('run', 8, 30, { steps: 3000, distanceKm: 20 }),
      }),
    ).toEqual({ code: 'activity_rejected', reason: 'vehicle_speed' });
    expect(err(s, { type: 'add_activity', activity: activity('walk', 8, -1) })).toEqual({
      code: 'activity_rejected',
      reason: 'invalid',
    });
  });

  it('rejects a duplicate id and a shorter overlapping activity', () => {
    const a = activity('cycling', 8, 60);
    const s = ok(createInitialState(), { type: 'add_activity', activity: a }).state;
    expect(err(s, { type: 'add_activity', activity: a })).toEqual({
      code: 'activity_rejected',
      reason: 'duplicate',
    });
    expect(err(s, { type: 'add_activity', activity: activity('strength', 8.5, 10) })).toEqual({
      code: 'activity_rejected',
      reason: 'overlap',
    });
    expect(err(s, { type: 'add_activity', activity: { ...a, id: '' } }).code).toBe('invalid');
  });

  it('never takes back what was granted when a longer activity replaces a shorter one', () => {
    let s = ok(createInitialState(), {
      type: 'add_activity',
      activity: activity('strength', 8, 30),
    }).state;
    expect(s.balances.materials.stone).toBe(6);
    s = ok(s, { type: 'add_activity', activity: activity('yoga', 8, 45) }).state;
    expect(s.balances.materials.stone).toBe(6);
    // the yoga session (40 + 15) replaces the strength session (50): the day is now worth 55
    expect(s.balances.pulses).toBe(55);
  });

  it('flags manual entries cut by the daily limit', () => {
    const s = ok(createInitialState(), {
      type: 'add_activity',
      activity: activity('strength', 8, 50, { source: 'manual' }),
    }).state;
    const r = ok(s, {
      type: 'add_activity',
      activity: activity('cycling', 10, 30, { source: 'manual' }),
    });
    expect(r.events[0]).toMatchObject({ truncated: true });
    expect(
      err(r.state, {
        type: 'add_activity',
        activity: activity('yoga', 12, 10, { source: 'manual' }),
      }),
    ).toEqual({ code: 'activity_rejected', reason: 'manual_limit' });
  });

  it('applies the multiplier of the morning streak to Pulses only', () => {
    const start: GameState = {
      ...createInitialState(),
      streak: {
        count: 7,
        jokers: 1,
        lastSettledDay: addDays(D1, -1),
        lastCompletedDay: addDays(D1, -1),
        bestCount: 7,
      },
    };
    const { state } = fullDay(start);
    expect(state.days[D1]?.multiplier).toBe(2);
    expect(state.balances.pulses).toBe(400);
    expect(state.balances.xp).toBe(200);
    expect(state.balances.materials).toMatchObject({ wood: 5, stone: 6, water: 5 });
    expect(state.streak.count).toBe(8);
  });

  it('pays at most 1 200 Pulses a day at ×3', () => {
    const start: GameState = {
      ...createInitialState(),
      streak: {
        count: 30,
        jokers: 2,
        lastSettledDay: addDays(D1, -1),
        lastCompletedDay: addDays(D1, -1),
        bestCount: 30,
      },
    };
    let s = start;
    for (const a of [
      activity('walk', 0, 300, { steps: 45_000 }),
      activity('cycling', 6, 300),
      activity('yoga', 12, 60),
    ]) {
      s = ok(s, { type: 'add_activity', activity: a }).state;
    }
    expect(s.balances.pulses).toBe(1200);
    expect(s.balances.xp).toBe(400);
  });

  it('emits level_up when XP crosses a level', () => {
    const { events } = fullDay(createInitialState());
    expect(events).toContainEqual({ type: 'level_up', level: 2 });
  });

  it('prunes day records older than the history window', () => {
    let s = fullDay(createInitialState()).state;
    s = ok(s, { type: 'add_activity', activity: activity('yoga', 8, 5) }, addDays(D1, 100)).state;
    expect(Object.keys(s.days)).toEqual([addDays(D1, 100)]);
  });
});

describe('streak over several days', () => {
  it('grows day after day and resets without losing anything', () => {
    let s = createInitialState();
    for (let d = 0; d < 3; d++) s = fullDay(s, addDays(D1, d)).state;
    expect(s.streak.count).toBe(3);
    const pulses = s.balances.pulses;
    const items = s.city.items;

    const r = ok(s, { type: 'tick' }, addDays(D1, 5));
    expect(r.events).toContainEqual({ type: 'streak_broken' });
    expect(r.state.streak.count).toBe(0);
    expect(r.state.balances.pulses).toBe(pulses);
    expect(r.state.city.items).toBe(items);
  });

  it('uses a rest joker for a missed day', () => {
    let s = createInitialState();
    for (let d = 0; d < 7; d++) s = fullDay(s, addDays(D1, d)).state;
    expect(s.streak.jokers).toBe(1);
    const r = ok(s, { type: 'tick' }, addDays(D1, 8));
    expect(r.events).toContainEqual({ type: 'joker_used', count: 1 });
    expect(r.state.streak.count).toBe(7);
  });
});

describe('chest', () => {
  it('opens once, after a full day', () => {
    expect(err(createInitialState(), { type: 'open_chest' })).toEqual({ code: 'no_chest' });
    const { state } = fullDay(createInitialState());
    const r = ok(state, { type: 'open_chest' });
    const event = r.events.find((e) => e.type === 'chest_opened');
    expect(event).toBeDefined();
    expect(r.state.days[D1]?.chest).toBe('opened');
    expect(r.state.days[D1]?.chestLoot).toEqual(event?.type === 'chest_opened' && event.loot);
    expect(err(r.state, { type: 'open_chest' })).toEqual({ code: 'no_chest' });
  });
});

describe('building', () => {
  it('buys and places an item, paying Pulses and materials and earning XP', () => {
    const r = ok(rich(), place('village_house', 2, 2, 'h1'));
    expect(r.state.balances.pulses).toBe(100_000 - 150);
    expect(r.state.balances.materials.wood).toBe(989);
    expect(r.state.balances.xp).toBe(15);
    expect(r.state.city.items).toEqual([{ id: 'h1', itemId: 'village_house', x: 2, y: 2, rot: 0 }]);
    expect(r.events).toContainEqual({ type: 'purchased', pulses: 150, xp: 15 });
  });

  it('refuses unknown, locked, unaffordable, or badly placed items', () => {
    expect(err(rich(), place('castle', 0, 0)).code).toBe('unknown_item');
    expect(err(rich(), place('barn', 0, 0)).code).toBe('locked');
    expect(err(rich(), place('bakery', 0, 0)).code).toBe('locked');
    expect(err(rich({ era: 2 }), place('skyscraper', 0, 0)).code).toBe('coming_soon');
    expect(err(createInitialState(), place('village_house', 0, 0)).code).toBe('insufficient_funds');
    expect(err(rich(), place('village_house', 15, 15))).toEqual({
      code: 'placement',
      reason: 'out_of_bounds',
    });
    expect(err(rich(), { ...place('well', 0, 0), x: 0.5 } as GameCommand).code).toBe('invalid');
    expect(err(rich(), { ...place('well', 0, 0), id: '' } as GameCommand).code).toBe('invalid');
    const s = ok(rich(), place('well', 0, 0, 'w')).state;
    expect(err(s, place('well', 0, 0)).code).toBe('placement');
    expect(err(s, place('well', 1, 0, 'w')).code).toBe('invalid');
  });

  it('checks materials as well as Pulses', () => {
    const s = rich();
    s.balances.materials.wood = 3;
    expect(canAfford(s.balances, { pulses: 10, materials: { wood: 4 } })).toBe(false);
    expect(canAfford(s.balances, { pulses: 10, materials: { wood: 3 } })).toBe(true);
    expect(canAfford(s.balances, { pulses: 10, materials: { wood: 2 } }, 2)).toBe(false);
  });

  it('moves and rotates items', () => {
    let s = ok(rich({ balances: { ...rich().balances, xp: totalXpForLevel(4) } }), {
      ...place('barn', 0, 0, 'barn'),
    }).state;
    s = ok(s, { type: 'move_item', id: 'barn', x: 5, y: 5, rot: 1 }).state;
    expect(s.city.items[0]).toMatchObject({ x: 5, y: 5, rot: 1 });
    expect(err(s, { type: 'move_item', id: 'barn', x: 15, y: 15, rot: 0 }).code).toBe('placement');
    expect(err(s, { type: 'move_item', id: 'nope', x: 1, y: 1, rot: 0 }).code).toBe('not_found');
    expect(err(s, { type: 'move_item', id: 'barn', x: 1.2, y: 1, rot: 0 }).code).toBe('invalid');
  });

  it('ignores rotation for square items', () => {
    const s = ok(rich(), { ...place('well', 0, 0, 'w'), rot: 1 } as GameCommand).state;
    expect(s.city.items[0]?.rot).toBe(0);
  });

  it('sells for 50 % of the Pulses and no materials', () => {
    const bought = ok(rich(), place('village_house', 2, 2, 'h1')).state;
    const r = ok(bought, { type: 'sell_item', id: 'h1' });
    expect(r.state.balances.pulses).toBe(100_000 - 150 + 75);
    expect(r.state.balances.materials.wood).toBe(989);
    expect(r.state.balances.xp).toBe(15);
    expect(r.state.city.items).toHaveLength(0);
    expect(err(r.state, { type: 'sell_item', id: 'h1' }).code).toBe('not_found');
  });

  it('sells extra plots from the Bourg era on, at a doubling price', () => {
    expect(err(rich(), { type: 'buy_plot' }).code).toBe('locked');
    let s = ok(rich({ era: 2 }), { type: 'buy_plot' }).state;
    expect(s.city.plots).toBe(2);
    expect(s.balances.pulses).toBe(100_000 - 300);
    s = ok(s, { type: 'buy_plot' }).state;
    expect(s.balances.pulses).toBe(100_000 - 900);
    const poor = { ...rich({ era: 2 }), balances: { ...rich().balances, pulses: 10 } };
    expect(err(poor, { type: 'buy_plot' }).code).toBe('insufficient_funds');
    const full = rich({ era: 2, city: { plots: 9, items: [] } });
    expect(err(full, { type: 'buy_plot' }).code).toBe('max_plots');
  });
});

describe('crafting', () => {
  const bourg = () => rich({ era: 2, balances: { ...rich().balances, xp: totalXpForLevel(6) } });

  it('needs the workshop and the era', () => {
    expect(err(rich(), { type: 'craft', recipeId: 'brick', quantity: 1 }).code).toBe('locked');
    expect(err(bourg(), { type: 'craft', recipeId: 'brick', quantity: 1 }).code).toBe(
      'missing_building',
    );
    expect(err(bourg(), { type: 'craft', recipeId: 'gold', quantity: 1 }).code).toBe(
      'unknown_item',
    );
    expect(err(bourg(), { type: 'craft', recipeId: 'brick', quantity: 0 }).code).toBe('invalid');
    expect(err(bourg(), { type: 'craft', recipeId: 'glass', quantity: 1 }).code).toBe('locked');
  });

  it('turns 2 stone + 1 water into a brick', () => {
    let s = ok(bourg(), place('dirt_path', 0, 0)).state;
    s = ok(s, place('brickworks', 1, 0)).state;
    const before = s.balances.materials;
    const r = ok(s, { type: 'craft', recipeId: 'brick', quantity: 3 });
    expect(r.state.balances.materials.brick).toBe(before.brick + 3);
    expect(r.state.balances.materials.stone).toBe(before.stone - 6);
    expect(r.state.balances.materials.water).toBe(before.water - 3);
    expect(r.events).toContainEqual({ type: 'crafted', material: 'brick', quantity: 3 });
    expect(err(r.state, { type: 'craft', recipeId: 'brick', quantity: 900 }).code).toBe(
      'insufficient_funds',
    );
  });
});

describe('interiors', () => {
  const withHouse = () => ok(rich(), place('village_house', 2, 2, 'h1')).state;

  it('buys rooms up to the house limit', () => {
    let s = ok(withHouse(), { type: 'buy_room', houseId: 'h1', room: 'living_room' }).state;
    expect(s.interiors.h1?.rooms).toEqual(['living_room']);
    expect(err(s, { type: 'buy_room', houseId: 'h1', room: 'living_room' }).code).toBe(
      'room_owned',
    );
    s = ok(s, { type: 'buy_room', houseId: 'h1', room: 'kitchen' }).state;
    expect(err(s, { type: 'buy_room', houseId: 'h1', room: 'bedroom' }).code).toBe('max_rooms');
    expect(err(s, { type: 'buy_room', houseId: 'nope', room: 'bedroom' }).code).toBe('not_found');
    expect(err(s, { type: 'buy_room', houseId: 'h1', room: 'garage' as never }).code).toBe(
      'unknown_item',
    );
  });

  it('refuses rooms in buildings that are not homes', () => {
    const s = ok(rich(), place('well', 0, 0, 'w')).state;
    expect(err(s, { type: 'buy_room', houseId: 'w', room: 'kitchen' }).code).toBe('not_found');
  });

  it('places, moves and sells furniture', () => {
    let s = ok(withHouse(), { type: 'buy_room', houseId: 'h1', room: 'living_room' }).state;
    const sofa: GameCommand = {
      type: 'place_furniture',
      houseId: 'h1',
      id: 'f1',
      furnitureId: 'sofa',
      x: 0,
      y: 0,
      rot: 0,
    };
    const pulses = s.balances.pulses;
    s = ok(s, sofa).state;
    expect(s.balances.pulses).toBe(pulses - 40);
    expect(err(s, sofa).code).toBe('invalid');
    expect(err(s, { ...sofa, id: 'f2' } as GameCommand).code).toBe('placement');
    expect(err(s, { ...sofa, id: 'f2', furnitureId: 'piano' } as GameCommand).code).toBe(
      'unknown_item',
    );
    expect(err(s, { ...sofa, id: 'f2', houseId: 'zz' } as GameCommand).code).toBe('not_found');
    expect(err(s, { ...sofa, id: 'f2', x: 1.5 } as GameCommand).code).toBe('invalid');

    s = ok(s, { type: 'move_furniture', houseId: 'h1', id: 'f1', x: 1, y: 2, rot: 1 }).state;
    expect(s.interiors.h1?.furniture[0]).toMatchObject({ x: 1, y: 2, rot: 1 });
    expect(
      err(s, { type: 'move_furniture', houseId: 'h1', id: 'f1', x: 6, y: 6, rot: 0 }).code,
    ).toBe('placement');
    expect(
      err(s, { type: 'move_furniture', houseId: 'h1', id: 'zz', x: 0, y: 0, rot: 0 }).code,
    ).toBe('not_found');
    expect(
      err(s, { type: 'move_furniture', houseId: 'h1', id: 'f1', x: 0, y: 0, rot: 5 as never }).code,
    ).toBe('invalid');

    const r = ok(s, { type: 'sell_furniture', houseId: 'h1', id: 'f1' });
    expect(r.state.balances.pulses).toBe(pulses - 40 + 20);
    expect(r.state.interiors.h1?.furniture).toHaveLength(0);
    expect(err(r.state, { type: 'sell_furniture', houseId: 'h1', id: 'f1' }).code).toBe(
      'not_found',
    );
  });

  it('refuses furniture when out of resources', () => {
    let s = ok(withHouse(), { type: 'buy_room', houseId: 'h1', room: 'living_room' }).state;
    s = { ...s, balances: { ...s.balances, pulses: 0 } };
    expect(
      err(s, {
        type: 'place_furniture',
        houseId: 'h1',
        id: 'f1',
        furnitureId: 'sofa',
        x: 0,
        y: 0,
        rot: 0,
      }).code,
    ).toBe('insufficient_funds');
    expect(err(s, { type: 'buy_room', houseId: 'h1', room: 'kitchen' }).code).toBe(
      'insufficient_funds',
    );
  });

  it('drops the interior when the house is sold', () => {
    let s = ok(withHouse(), { type: 'buy_room', houseId: 'h1', room: 'living_room' }).state;
    s = ok(s, { type: 'sell_item', id: 'h1' }).state;
    expect(s.interiors.h1).toBeUndefined();
  });
});

describe('eras', () => {
  function village(): GameState {
    let s = rich({ balances: { ...rich().balances, xp: totalXpForLevel(6) } });
    const builds: [string, number, number][] = [
      ['village_house', 0, 0],
      ['village_house', 2, 0],
      ['village_house', 4, 0],
      ['field', 0, 3],
      ['vegetable_garden', 2, 3],
      ['chicken_coop', 4, 3],
      ['orchard', 6, 3],
    ];
    for (const [id, x, y] of builds) s = ok(s, place(id, x, y)).state;
    return s;
  }

  it('advances to the Bourg once level and buildings are there', () => {
    const almost = village();
    expect(err(almost, { type: 'advance_era' }).code).toBe('era_requirements');
    expect(selectEraProgress(almost).status.filter((x) => !x.done)).toHaveLength(1);
    const ready = ok(almost, place('barn', 8, 3)).state;
    expect(selectEraProgress(ready).check).toEqual({ ok: true, next: 2 });
    const r = ok(ready, { type: 'advance_era' });
    expect(r.state.era).toBe(2);
    expect(r.events).toContainEqual({ type: 'era_advanced', era: 2 });
    expect(err(r.state, { type: 'advance_era' }).code).toBe('coming_soon');
  });

  it('exposes the level through a selector', () => {
    expect(selectLevel(village()).level).toBeGreaterThanOrEqual(6);
  });
});

describe('robustness', () => {
  it('rejects unknown commands', () => {
    expect(err(createInitialState(), { type: 'cheat' } as unknown as GameCommand).code).toBe(
      'invalid',
    );
  });

  it('never mutates the previous state', () => {
    const s = rich();
    const frozen = JSON.stringify(s);
    ok(s, place('village_house', 2, 2));
    fullDay(s);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});
