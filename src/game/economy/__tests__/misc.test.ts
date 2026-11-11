import { rollChest, seededRandom } from '../chest';
import {
  addDays,
  dayKeyAtOffset,
  diffDays,
  isDayKey,
  localDayKey,
  msUntilLocalMidnight,
} from '../dates';
import { applyManualLimit, averageSpeedKmh, overlaps } from '../plausibility';
import { act } from './helpers';

describe('dates', () => {
  it('formats local day keys', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('computes a day key at a UTC offset', () => {
    const ms = Date.parse('2026-03-10T23:30:00Z');
    expect(dayKeyAtOffset(ms, 0)).toBe('2026-03-10');
    expect(dayKeyAtOffset(ms, 60)).toBe('2026-03-11');
    expect(dayKeyAtOffset(ms, -24 * 60)).toBe('2026-03-09');
  });
  it('adds and diffs days across months', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-02-27', '2026-03-02')).toBe(3);
    expect(diffDays('2026-03-02', '2026-02-27')).toBe(-3);
  });
  it('validates day keys', () => {
    expect(isDayKey('2026-03-10')).toBe(true);
    expect(isDayKey('2026-13-10')).toBe(false);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('10/03/2026')).toBe(false);
    expect(isDayKey(20260310)).toBe(false);
  });
  it('counts down to local midnight', () => {
    expect(msUntilLocalMidnight(new Date(2026, 2, 10, 23, 0, 0))).toBe(3_600_000);
  });
});

describe('chest', () => {
  it('is deterministic for a given seed', () => {
    expect(rollChest(seededRandom(42), 1)).toEqual(rollChest(seededRandom(42), 1));
  });
  it('gives 6 to 12 basic materials and no brick in era 1', () => {
    for (let seed = 0; seed < 200; seed++) {
      const loot = rollChest(seededRandom(seed), 1);
      const total = Object.values(loot).reduce((a, b) => a + (b ?? 0), 0);
      expect(total).toBeGreaterThanOrEqual(6);
      expect(total).toBeLessThanOrEqual(12);
      expect(loot.brick).toBeUndefined();
    }
  });
  it('adds 1 to 3 bricks from era 2', () => {
    for (let seed = 0; seed < 50; seed++) {
      const brick = rollChest(seededRandom(seed), 2).brick ?? 0;
      expect(brick).toBeGreaterThanOrEqual(1);
      expect(brick).toBeLessThanOrEqual(3);
    }
  });
});

describe('plausibility helpers', () => {
  it('computes the average speed only when a distance is known', () => {
    expect(averageSpeedKmh(act('run', 8, 30, { distanceKm: 5 }))).toBe(10);
    expect(averageSpeedKmh(act('run', 8, 30))).toBeNull();
  });
  it('detects overlaps', () => {
    expect(overlaps(act('run', 8, 60), act('walk', 8.5, 10))).toBe(true);
    expect(overlaps(act('run', 8, 60), act('walk', 9, 10))).toBe(false);
  });
  it('leaves non-manual activities untouched by the manual limit', () => {
    const a = act('cycling', 8, 200);
    expect(applyManualLimit([a]).get(a.id)).toBe(200);
  });
});
