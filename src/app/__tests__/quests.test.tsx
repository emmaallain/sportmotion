import { fireEvent, render, screen } from '@testing-library/react-native';

import { LocalRepository } from '@/data/localRepository';
import { createInitialState } from '@/game/engine';
import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';

import QuestsScreen from '../(tabs)/quests';

const add = (id: string, type: 'walk' | 'strength' | 'stretch', durationMin: number, at: number) =>
  useGame.getState().dispatch({
    type: 'add_activity',
    activity: {
      id,
      type,
      source: 'mock',
      startMs: Date.now() + at,
      durationMin,
      steps: type === 'walk' ? durationMin * 100 : undefined,
    },
  });

beforeEach(async () => {
  useGame.setState({ game: createInitialState() });
  await useGame.getState().hydrate(new LocalRepository('test/quests'));
});

describe('Quests screen', () => {
  it('shows the three quests with their progress', async () => {
    add('w', 'walk', 20, 0);
    await render(<QuestsScreen />);
    expect(screen.getByText(t.quests.title)).toBeTruthy();
    expect(screen.getByText(t.quests.walk)).toBeTruthy();
    expect(screen.getByText(t.quests.sport)).toBeTruthy();
    expect(screen.getByText(t.quests.stretch)).toBeTruthy();
    expect(screen.getByTestId('quest-walk-progress')).toHaveTextContent(/2\s000 pas/);
    expect(screen.queryByTestId('open-chest')).toBeNull();
  });

  it('offers the chest once the day is complete and opens it', async () => {
    add('w', 'walk', 50, 0);
    add('s', 'strength', 30, 4e6);
    add('y', 'stretch', 15, 8e6);
    await render(<QuestsScreen />);
    expect(screen.getAllByText(new RegExp(t.quests.done))).toHaveLength(3);
    await fireEvent.press(screen.getByTestId('open-chest'));
    expect(screen.queryByTestId('open-chest')).toBeNull();
    expect(screen.getByText(new RegExp(t.quests.chestOpened))).toBeTruthy();
    expect(useGame.getState().game.streak.count).toBe(1);
  });
});
