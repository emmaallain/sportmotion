import { fireEvent, render, screen } from '@testing-library/react-native';

import { LocalRepository } from '@/data/localRepository';
import { createInitialState } from '@/game/engine';
import type { GameState } from '@/game/engine';
import { totalXpForLevel } from '@/game/progression';
import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';
import { useUi } from '@/state/uiStore';

import ActivitiesScreen from '../(tabs)/activities';
import ProgressScreen from '../(tabs)/progress';
import ShopScreen from '../shop';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), push: jest.fn(), replace: jest.fn() },
}));
// Thumbnails need Skia; the shop must work without them.
jest.mock('@/render/lazy', () => ({ spriteThumbnail: async () => null }));

async function start(patch: Partial<GameState> = {}) {
  await useGame.getState().hydrate(new LocalRepository(`test/screens/${Math.random()}`));
  useGame.setState({ game: { ...createInitialState(), onboardingDone: true, ...patch } });
  useUi.setState({ placement: null, toasts: [], celebrations: [] });
}

describe('Shop screen', () => {
  it('lists the category, with locked items explaining their condition', async () => {
    await start();
    await render(<ShopScreen />);
    expect(screen.getByText(t.items.village_house!)).toBeTruthy();
    expect(screen.getByText(new RegExp(t.shop.lockedEra('Bourg')))).toBeTruthy();
    expect(screen.getAllByText(new RegExp(t.shop.comingSoon)).length).toBeGreaterThanOrEqual(3);
    // locked items offer no "choose" button
    expect(screen.queryByTestId('shop-choose-two_story_house')).toBeNull();
    expect(screen.queryByTestId('shop-choose-skyscraper')).toBeNull();
  });

  it('disables what the player cannot afford', async () => {
    await start();
    await render(<ShopScreen />);
    expect(screen.getByTestId('shop-choose-village_house')).toBeDisabled();
  });

  it('starts the placement of an affordable item and goes back to the city', async () => {
    const base = createInitialState();
    await start({
      balances: {
        ...base.balances,
        pulses: 500,
        materials: { ...base.balances.materials, wood: 20, stone: 20 },
      },
    });
    await render(<ShopScreen />);
    await fireEvent.press(screen.getByTestId('shop-choose-village_house'));
    expect(useUi.getState().placement).toMatchObject({
      mode: 'new',
      itemId: 'village_house',
      x: 7,
      y: 7,
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows level requirements in other categories', async () => {
    await start();
    await render(<ShopScreen />);
    await fireEvent.press(screen.getByLabelText(t.shop.categories.farm!));
    expect(screen.getByText(t.items.field!)).toBeTruthy();
    expect(screen.getByText(new RegExp(t.shop.lockedLevel(4)))).toBeTruthy();
  });
});

describe('Activities screen', () => {
  it('simulates steps and shows them in the day summary', async () => {
    await start();
    await render(<ActivitiesScreen />);
    expect(screen.getByText(t.activities.empty)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sim-steps-5000'));
    expect(screen.queryByText(t.activities.empty)).toBeNull();
    expect(screen.getAllByText(t.activityTypes.walk!).length).toBeGreaterThan(0);
    expect(useGame.getState().game.balances.pulses).toBe(50);
  });

  it('records a manual entry at 50 %', async () => {
    await start();
    await render(<ActivitiesScreen />);
    await fireEvent.press(screen.getByTestId('add-activity'));
    await fireEvent.press(screen.getByLabelText(t.activityTypes.strength!));
    await fireEvent.changeText(screen.getByTestId('manual-duration'), '40');
    await fireEvent.press(screen.getByTestId('manual-save'));
    const today = useGame.getState().today;
    const day = useGame.getState().game.days[today];
    expect(day?.activities[0]).toMatchObject({
      type: 'strength',
      source: 'manual',
      durationMin: 40,
    });
    // 40 manual minutes count as 20: 4 stone, quest not validated yet
    expect(useGame.getState().game.balances.materials.stone).toBe(4);
    expect(useGame.getState().game.balances.pulses).toBe(0);
    expect(screen.getByText(t.activities.halfGains)).toBeTruthy();
  });

  it('refuses an invalid duration', async () => {
    await start();
    await render(<ActivitiesScreen />);
    await fireEvent.press(screen.getByTestId('add-activity'));
    await fireEvent.changeText(screen.getByTestId('manual-duration'), '0');
    await fireEvent.press(screen.getByTestId('manual-save'));
    expect(screen.getByText(t.activities.invalidDuration)).toBeTruthy();
    expect(Object.keys(useGame.getState().game.days)).toHaveLength(0);
  });
});

describe('Progress screen', () => {
  it('shows the conditions of the next era with their progress', async () => {
    const base = createInitialState();
    await start({
      balances: { ...base.balances, xp: totalXpForLevel(4) },
      city: { plots: 1, items: [{ id: 'h', itemId: 'village_house', x: 1, y: 1, rot: 0 }] },
    });
    await render(<ProgressScreen />);
    expect(screen.getByText(new RegExp(t.progress.nextEra('Bourg')))).toBeTruthy();
    expect(screen.getByLabelText(`${t.progress.requirement.level(6)} : 4 / 6`)).toBeTruthy();
    expect(screen.getByLabelText(`${t.progress.requirement.housing(3)} : 1 / 3`)).toBeTruthy();
    expect(screen.getByLabelText(`${t.progress.requirement.farm(5)} : 0 / 5`)).toBeTruthy();
    expect(screen.queryByTestId('advance-era')).toBeNull();
  });

  it('announces the locked eras as coming soon once in the Bourg', async () => {
    await start({ era: 2 });
    await render(<ProgressScreen />);
    expect(screen.getByText(new RegExp(t.progress.comingSoon))).toBeTruthy();
  });
});
