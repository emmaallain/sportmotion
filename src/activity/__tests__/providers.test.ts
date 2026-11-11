import { evaluateDay } from '@/game/economy';

import {
  ManualActivityProvider,
  MockActivityProvider,
  estimateDistanceKm,
  estimateSteps,
  newActivityId,
  nextFreeSlot,
  validateManualEntry,
} from '../index';

const DAY = Date.parse('2026-04-02T00:00:00Z');

describe('nextFreeSlot', () => {
  it('starts at 6:00 on an empty day', () => {
    expect(nextFreeSlot([], DAY)).toBe(DAY + 6 * 3_600_000);
  });

  it('chains activities so they never overlap', () => {
    const mock = new MockActivityProvider();
    const first = mock.simulateSteps(3000, nextFreeSlot([], DAY));
    const second = mock.simulateSession('strength', 30, nextFreeSlot([first], DAY));
    expect(second.startMs).toBe(first.startMs + first.durationMin * 60_000);
    expect(evaluateDay([first, second]).rejected).toHaveLength(0);
  });
});

describe('MockActivityProvider', () => {
  it('simulates plausible walks', async () => {
    const mock = new MockActivityProvider();
    const walk = mock.simulateSteps(5000, DAY);
    expect(walk).toMatchObject({ type: 'walk', source: 'mock', steps: 5000, durationMin: 50 });
    const day = evaluateDay([walk]);
    expect(day.accepted[0]).toMatchObject({ type: 'walk', reclassified: false });
    expect(day.quests.walk.done).toBe(true);
    expect(await mock.getStatus()).toBe('available');
    expect(await mock.requestPermissions()).toBe(true);
  });

  it('simulates runs with steps and a believable speed', () => {
    const run = new MockActivityProvider().simulateSession('run', 30, DAY);
    expect(run.steps).toBe(4800);
    expect(evaluateDay([run]).rejected).toHaveLength(0);
    expect(evaluateDay([run]).quests.sport.done).toBe(true);
  });

  it('simulates sessions without steps', () => {
    const yoga = new MockActivityProvider().simulateSession('yoga', 20, DAY);
    expect(yoga.steps).toBeUndefined();
  });

  it('returns what it recorded in a time window', async () => {
    const mock = new MockActivityProvider();
    mock.simulateSteps(1000, DAY + 1000);
    mock.simulateSteps(1000, DAY + 86_400_000 + 1000);
    expect(await mock.fetchActivities(DAY, DAY + 86_400_000)).toHaveLength(1);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newActivityId('x')));
    expect(ids.size).toBe(200);
  });
});

describe('ManualActivityProvider', () => {
  it('builds a manual activity and estimates steps for a walk', async () => {
    const manual = new ManualActivityProvider();
    const walk = manual.createActivity({ type: 'walk', durationMin: 30 }, DAY);
    expect(walk).toMatchObject({ source: 'manual', steps: 3000, durationMin: 30 });
    expect(manual.createActivity({ type: 'run', durationMin: 20, steps: 2500 }, DAY)?.steps).toBe(
      2500,
    );
    expect(manual.createActivity({ type: 'yoga', durationMin: 20 }, DAY)?.steps).toBeUndefined();
    expect(await manual.fetchActivities(DAY, DAY + 1)).toHaveLength(3);
    expect(await manual.getStatus()).toBe('available');
    expect(await manual.requestPermissions()).toBe(true);
  });

  it('rejects invalid entries', () => {
    const manual = new ManualActivityProvider();
    expect(manual.createActivity({ type: 'yoga', durationMin: 0 }, DAY)).toBeNull();
    expect(manual.createActivity({ type: 'yoga', durationMin: Number.NaN }, DAY)).toBeNull();
    expect(validateManualEntry({ type: 'yoga', durationMin: 241 })).toBe(false);
    expect(validateManualEntry({ type: 'walk', durationMin: 30, steps: -1 })).toBe(false);
    expect(validateManualEntry({ type: 'walk', durationMin: 30, steps: 4000 })).toBe(true);
  });

  it('is counted at 50 % by the engine', () => {
    const a = new ManualActivityProvider().createActivity(
      { type: 'strength', durationMin: 40 },
      DAY,
    );
    expect(a && evaluateDay([a]).totals.sportMin).toBe(20);
  });
});

describe('estimates', () => {
  it('estimates steps and distance', () => {
    expect(estimateSteps('walk', 10)).toBe(1000);
    expect(estimateSteps('run', 10)).toBe(1600);
    expect(estimateDistanceKm('walk', 4000)).toBe(3);
  });
});
