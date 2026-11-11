import { EMPTY_FACTS, ERAS, checkEraAdvance, eraAdvanceStatus, eraDef, lockReason } from '../eras';
import type { CityFacts } from '../eras';
import { MAX_LEVEL, levelFromXp, totalXpForLevel, xpToNextLevel } from '../levels';

describe('levels', () => {
  it('follows round(100 × n^1.5)', () => {
    expect(xpToNextLevel(1)).toBe(100);
    expect(xpToNextLevel(2)).toBe(283);
    expect(xpToNextLevel(4)).toBe(800);
    expect(xpToNextLevel(9)).toBe(2700);
  });

  it('accumulates XP per level', () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(100);
    expect(totalXpForLevel(6)).toBe(100 + 283 + 520 + 800 + 1118);
  });

  it('derives the level from total XP', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNext: 100 });
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: 283 });
    expect(levelFromXp(241)).toMatchObject({ level: 2, xpIntoLevel: 141 });
    expect(levelFromXp(totalXpForLevel(13)).level).toBe(13);
    expect(levelFromXp(totalXpForLevel(13) - 1).level).toBe(12);
    expect(levelFromXp(-5).level).toBe(1);
  });

  it('stops at the max level', () => {
    const info = levelFromXp(10_000_000);
    expect(info).toMatchObject({ level: MAX_LEVEL, xpForNext: 0, progress: 1 });
  });
});

describe('eras', () => {
  const facts = (over: Partial<CityFacts>): CityFacts => ({ ...EMPTY_FACTS, ...over });
  const village = facts({ tagCounts: { housing: 3 }, tagDistinct: { farm: 5 } });

  it('covers levels 1–30 without gaps', () => {
    expect(ERAS.map((e) => [e.minLevel, e.maxLevel])).toEqual([
      [1, 5],
      [6, 12],
      [13, 20],
      [21, 30],
    ]);
    expect(() => eraDef(9 as never)).toThrow();
  });

  it('needs the level AND the buildings to leave the village', () => {
    expect(checkEraAdvance(1, 6, village)).toEqual({ ok: true, next: 2 });
    expect(checkEraAdvance(1, 5, village)).toEqual({ ok: false, reason: 'requirements' });
    expect(checkEraAdvance(1, 9, facts({ tagCounts: { housing: 3 } }))).toEqual({
      ok: false,
      reason: 'requirements',
    });
    expect(
      checkEraAdvance(1, 6, facts({ tagCounts: { housing: 2 }, tagDistinct: { farm: 5 } })).ok,
    ).toBe(false);
  });

  it('reports each condition with its progress', () => {
    const status = eraAdvanceStatus(1, 4, facts({ tagCounts: { housing: 5 } }));
    expect(status.map((s) => [s.current, s.target, s.done])).toEqual([
      [4, 6, false],
      [3, 3, true],
      [0, 5, false],
    ]);
  });

  it('lists the Bourg conditions: level 13, 6 homes, school, linked plots', () => {
    const done = facts({
      tagCounts: { housing: 6 },
      itemCounts: { school: 1 },
      plotsLinked: true,
    });
    expect(eraAdvanceStatus(2, 13, done).every((s) => s.done)).toBe(true);
    expect(eraAdvanceStatus(2, 13, { ...done, plotsLinked: false }).every((s) => s.done)).toBe(
      false,
    );
  });

  it('keeps eras 3 and 4 locked in the MVP', () => {
    const done = facts({ tagCounts: { housing: 6 }, itemCounts: { school: 1 }, plotsLinked: true });
    expect(checkEraAdvance(2, 13, done)).toEqual({ ok: false, reason: 'coming_soon' });
    expect(checkEraAdvance(4, 30, done)).toEqual({ ok: false, reason: 'last_era' });
    expect(eraAdvanceStatus(4, 30, done)).toEqual([]);
  });

  it('explains why an item is locked', () => {
    expect(lockReason({ era: 1, level: 1 }, { era: 1, level: 1 })).toBeNull();
    expect(lockReason({ era: 1, level: 4 }, { era: 1, level: 3 })).toEqual({
      type: 'level',
      level: 4,
    });
    expect(lockReason({ era: 2, level: 6 }, { era: 1, level: 8 })).toEqual({ type: 'era', era: 2 });
    expect(lockReason({ era: 3, level: 13 }, { era: 2, level: 20 })).toEqual({
      type: 'coming_soon',
    });
  });
});
