import { applyMultiplier, evaluateDay } from '../day';
import { act } from './helpers';

describe('evaluateDay — quests', () => {
  it('returns an empty day when there is no activity', () => {
    const day = evaluateDay([]);
    expect(day.basePulses).toBe(0);
    expect(day.xp).toBe(0);
    expect(day.fullDay).toBe(false);
    expect(day.materials).toEqual({ wood: 0, stone: 0, water: 0, energy: 0 });
  });

  it('validates the walk quest at 5 000 steps', () => {
    const below = evaluateDay([act('walk', 8, 50, { steps: 4999 })]);
    expect(below.quests.walk.done).toBe(false);
    expect(below.basePulses).toBe(0);

    const reached = evaluateDay([act('walk', 8, 50, { steps: 5000 })]);
    expect(reached.quests.walk.done).toBe(true);
    expect(reached.basePulses).toBe(50);
    expect(reached.materials.wood).toBe(5);
  });

  it('validates the sport quest at 30 minutes of sport, walking does not count', () => {
    expect(evaluateDay([act('walk', 8, 60, { steps: 3000 })]).quests.sport.progress).toBe(0);
    const day = evaluateDay([act('strength', 8, 30)]);
    expect(day.quests.sport.done).toBe(true);
    expect(day.basePulses).toBe(50);
    expect(day.materials.stone).toBe(6);
    expect(day.materials.energy).toBe(0);
  });

  it('validates the stretch quest at 15 minutes (stretch, yoga, mobility)', () => {
    const day = evaluateDay([act('stretch', 8, 5), act('yoga', 9, 5), act('mobility', 10, 5)]);
    expect(day.quests.stretch.done).toBe(true);
    expect(day.basePulses).toBe(40);
    expect(day.materials.water).toBe(5);
  });

  it('adds the full-day bonus when the three quests are done', () => {
    const day = evaluateDay([
      act('walk', 8, 50, { steps: 5000 }),
      act('cycling', 10, 30),
      act('yoga', 12, 15),
    ]);
    expect(day.fullDay).toBe(true);
    expect(day.basePulses).toBe(50 + 50 + 40 + 60);
    expect(day.xp).toBe(200);
    expect(day.materials).toEqual({ wood: 5, stone: 0, water: 5, energy: 6 });
  });

  it('a run counts for steps, sport, wood and energy', () => {
    const day = evaluateDay([act('run', 8, 40, { steps: 6000, distanceKm: 7 })]);
    expect(day.quests.walk.done).toBe(true);
    expect(day.quests.sport.done).toBe(true);
    expect(day.materials.wood).toBe(6);
    expect(day.materials.energy).toBe(8);
  });
});

describe('evaluateDay — extra gains', () => {
  it('pays 1 Pulse per 250 extra steps', () => {
    const day = evaluateDay([act('walk', 8, 90, { steps: 5000 + 1300 })]);
    expect(day.basePulses).toBe(50 + 5);
  });

  it('pays 1 Pulse per extra sport minute', () => {
    expect(evaluateDay([act('swimming', 8, 45)]).basePulses).toBe(50 + 15);
  });

  it('pays extra stretch minutes up to 15', () => {
    expect(evaluateDay([act('stretch', 8, 20)]).basePulses).toBe(40 + 5);
    expect(evaluateDay([act('stretch', 8, 60)]).basePulses).toBe(40 + 15);
  });

  it('gives 1 XP per base Pulse', () => {
    const day = evaluateDay([act('team_sport', 8, 50)]);
    expect(day.xp).toBe(day.basePulses);
  });
});

describe('evaluateDay — caps', () => {
  it('caps base Pulses at 400 per day', () => {
    const day = evaluateDay([
      act('walk', 6, 240, { steps: 40_000 }),
      act('cycling', 11, 300),
      act('yoga', 17, 30),
    ]);
    expect(day.uncappedBasePulses).toBeGreaterThan(400);
    expect(day.basePulses).toBe(400);
    expect(day.xp).toBe(400);
    expect(day.capped.pulses).toBe(true);
  });

  it('caps materials: 25 wood, 12 stone, 15 water, 15 energy', () => {
    const day = evaluateDay([
      act('walk', 0, 300, { steps: 40_000 }),
      act('strength', 6, 120),
      act('cycling', 9, 120),
      act('yoga', 12, 90),
    ]);
    expect(day.materials).toEqual({ wood: 25, stone: 12, water: 15, energy: 15 });
  });

  it('caps steps at 50 000 per day', () => {
    const day = evaluateDay([
      act('walk', 0, 400, { steps: 40_000 }),
      act('walk', 8, 400, { steps: 40_000 }),
    ]);
    expect(day.totals.steps).toBe(50_000);
    expect(day.capped.steps).toBe(true);
  });

  it('caps sport at 6 hours per day and scales strength / cardio accordingly', () => {
    const day = evaluateDay([act('strength', 0, 240), act('cycling', 5, 240)]);
    expect(day.totals.sportMin).toBe(360);
    expect(day.totals.strengthMin).toBe(180);
    expect(day.totals.cardioMin).toBe(180);
    expect(day.capped.sport).toBe(true);
  });
});

describe('evaluateDay — plausibility', () => {
  it('counts a walk faster than 9 km/h as a run', () => {
    const day = evaluateDay([act('walk', 8, 30, { steps: 4500, distanceKm: 5 })]);
    expect(day.accepted[0]).toMatchObject({ type: 'run', reclassified: true });
    expect(day.quests.sport.done).toBe(true);
    expect(day.materials.energy).toBe(6);
  });

  it('rejects a run faster than 25 km/h', () => {
    const day = evaluateDay([act('run', 8, 30, { steps: 3000, distanceKm: 15 })]);
    expect(day.rejected).toEqual([expect.objectContaining({ reason: 'vehicle_speed' })]);
    expect(day.totals.steps).toBe(0);
  });

  it('rejects a "walk" at vehicle speed', () => {
    const day = evaluateDay([act('walk', 8, 60, { steps: 500, distanceKm: 40 })]);
    expect(day.rejected[0]?.reason).toBe('vehicle_speed');
  });

  it('rejects more than 220 steps/min over more than 10 minutes', () => {
    const day = evaluateDay([act('run', 8, 20, { steps: 221 * 20 })]);
    expect(day.rejected[0]?.reason).toBe('cadence');
    const short = evaluateDay([act('run', 8, 10, { steps: 230 * 10 })]);
    expect(short.rejected).toHaveLength(0);
  });

  it('rejects invalid numbers', () => {
    const day = evaluateDay([
      act('walk', 8, 0, { steps: 100 }),
      act('walk', 9, -5),
      act('walk', 10, 30, { steps: -1 }),
      act('walk', 11, Number.NaN),
      act('strength', 12, 25 * 60),
    ]);
    expect(day.rejected.map((r) => r.reason)).toEqual(Array(5).fill('invalid'));
    expect(day.accepted).toHaveLength(0);
  });

  it('keeps only the longest of overlapping activities', () => {
    const long = act('cycling', 8, 60);
    const short = act('strength', 8.5, 20);
    const later = act('yoga', 10, 15);
    const day = evaluateDay([short, long, later]);
    expect(day.accepted.map((a) => a.id)).toEqual([long.id, later.id]);
    expect(day.rejected).toEqual([{ id: short.id, reason: 'overlap' }]);
    expect(day.totals.strengthMin).toBe(0);
  });

  it('does not treat back-to-back activities as overlapping', () => {
    const day = evaluateDay([act('cycling', 8, 60), act('strength', 9, 30)]);
    expect(day.accepted).toHaveLength(2);
  });

  it('ignores a duplicated activity id', () => {
    const a = act('strength', 8, 30);
    const day = evaluateDay([a, { ...a }]);
    expect(day.totals.sportMin).toBe(30);
    expect(day.rejected).toEqual([{ id: a.id, reason: 'duplicate' }]);
  });

  it('is independent of the input order', () => {
    const list = [
      act('walk', 7, 60, { steps: 6000 }),
      act('strength', 9, 40),
      act('cycling', 9.25, 30),
      act('yoga', 12, 20, { source: 'manual' }),
    ];
    const forward = evaluateDay(list);
    const backward = evaluateDay([...list].reverse());
    expect(backward.basePulses).toBe(forward.basePulses);
    expect(backward.materials).toEqual(forward.materials);
    expect(backward.totals).toEqual(forward.totals);
  });
});

describe('evaluateDay — manual entries', () => {
  it('counts manual entries at 50 %', () => {
    const day = evaluateDay([act('strength', 8, 40, { source: 'manual' })]);
    expect(day.totals.sportMin).toBe(20);
    expect(day.quests.sport.done).toBe(false);
    expect(day.materials.stone).toBe(4);
    expect(day.accepted[0]?.factor).toBe(0.5);
  });

  it('halves manual steps too', () => {
    const day = evaluateDay([act('walk', 8, 60, { source: 'manual', steps: 6000 })]);
    expect(day.totals.steps).toBe(3000);
    expect(day.materials.wood).toBe(3);
  });

  it('limits manual entries to 60 counted minutes per day', () => {
    const first = act('strength', 8, 45, { source: 'manual' });
    const second = act('cycling', 10, 45, { source: 'manual' });
    const third = act('yoga', 12, 30, { source: 'manual' });
    const day = evaluateDay([first, second, third]);
    expect(day.accepted).toEqual([
      expect.objectContaining({ id: first.id, countedMin: 45 }),
      expect.objectContaining({ id: second.id, countedMin: 15 }),
    ]);
    expect(day.rejected).toEqual([{ id: third.id, reason: 'manual_limit' }]);
    expect(day.totals.sportMin).toBe(30);
    expect(day.totals.stretchMin).toBe(0);
  });

  it('scales the steps of a manual walk truncated by the limit', () => {
    const day = evaluateDay([act('walk', 8, 120, { source: 'manual', steps: 12_000 })]);
    expect(day.totals.steps).toBe(3000);
  });

  it('does not limit sensor activities', () => {
    const day = evaluateDay([act('strength', 8, 60, { source: 'manual' }), act('cycling', 10, 90)]);
    expect(day.totals.sportMin).toBe(30 + 90);
  });
});

describe('applyMultiplier', () => {
  it('multiplies and rounds', () => {
    expect(applyMultiplier(200, 1)).toBe(200);
    expect(applyMultiplier(55, 1.5)).toBe(83);
    expect(applyMultiplier(400, 3)).toBe(1200);
  });
});
