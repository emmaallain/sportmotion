import { PROFILES, simulate } from '../simulate-economy';

describe('economy balancing (GAME_DESIGN §2.8)', () => {
  const regular = simulate(PROFILES.regular!);

  it('finishes era 1 in about 2 weeks for a player completing every day', () => {
    expect(regular.era1Days).toBeGreaterThanOrEqual(10);
    expect(regular.era1Days).toBeLessThanOrEqual(16);
  });

  it('finishes era 2 in about 6 weeks', () => {
    expect(regular.era2Days).toBeGreaterThanOrEqual(35);
    expect(regular.era2Days).toBeLessThanOrEqual(49);
  });

  it('is faster for a more active player, but not absurdly so', () => {
    const active = simulate(PROFILES.active!);
    expect(active.era1Days).toBeLessThanOrEqual(regular.era1Days ?? 0);
    expect(active.era1Days).toBeGreaterThanOrEqual(7);
    expect(active.era2Days).toBeLessThan(regular.era2Days ?? 0);
    expect(active.era2Days).toBeGreaterThanOrEqual(21);
  });

  it('never drives a balance negative', () => {
    const { final } = regular;
    expect(final.balances.pulses).toBeGreaterThanOrEqual(0);
    for (const amount of Object.values(final.balances.materials)) {
      expect(amount).toBeGreaterThanOrEqual(0);
    }
  });
});
