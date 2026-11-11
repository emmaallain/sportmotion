import { useSettings } from '@/state/settingsStore';

import {
  ambienceForEra,
  effectiveVolume,
  playSfx,
  refreshAudioSettings,
  setAmbience,
  setAudioPaused,
} from '../index';

interface FakePlayer {
  volume: number;
  loop: boolean;
  play: jest.Mock;
  pause: jest.Mock;
  remove: jest.Mock;
  seekTo: jest.Mock;
}
const mockPlayers: FakePlayer[] = [];
const mockSetMode = jest.fn((_mode: unknown) => Promise.resolve());

jest.mock('expo-audio', () => ({
  createAudioPlayer: () => {
    const player = {
      volume: 1,
      loop: false,
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      seekTo: jest.fn(() => Promise.resolve()),
    };
    mockPlayers.push(player);
    return player;
  },
  setAudioModeAsync: (mode: unknown) => mockSetMode(mode),
}));

beforeEach(() => {
  useSettings.setState({ musicVolume: 0.5, sfxVolume: 0.8, muted: false });
});

describe('audio engine', () => {
  it('maps eras to ambiences', () => {
    expect([1, 2, 3, 4].map((e) => ambienceForEra(e as 1))).toEqual([
      'village',
      'bourg',
      'ville',
      'ville',
    ]);
  });

  it('computes the effective volume', () => {
    expect(effectiveVolume(0.4, false)).toBe(0.4);
    expect(effectiveVolume(0.4, true)).toBe(0);
    expect(effectiveVolume(3, false)).toBe(1);
  });

  it('plays effects at the effects volume and respects the silent switch', () => {
    playSfx('place');
    const player = mockPlayers[mockPlayers.length - 1];
    expect(player?.volume).toBe(0.8);
    expect(player?.play).toHaveBeenCalledTimes(1);
    expect(mockSetMode).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: false }));
    playSfx('place');
    expect(player?.play).toHaveBeenCalledTimes(2);
  });

  it('stays silent when muted', () => {
    const before = mockPlayers.length;
    useSettings.setState({ muted: true });
    playSfx('quest');
    expect(mockPlayers.length).toBe(before);
  });

  it('loops one ambience at a time and follows the settings', () => {
    setAmbience('village');
    const village = mockPlayers[mockPlayers.length - 1];
    expect(village?.loop).toBe(true);
    expect(village?.volume).toBe(0.5);
    expect(village?.play).toHaveBeenCalled();

    useSettings.setState({ musicVolume: 0.2 });
    refreshAudioSettings();
    expect(village?.volume).toBe(0.2);

    useSettings.setState({ muted: true });
    refreshAudioSettings();
    expect(village?.pause).toHaveBeenCalled();

    useSettings.setState({ muted: false });
    setAmbience('bourg');
    expect(village?.remove).toHaveBeenCalled();
    const bourg = mockPlayers[mockPlayers.length - 1];
    expect(bourg).not.toBe(village);

    setAudioPaused(true);
    expect(bourg?.pause).toHaveBeenCalled();
    setAudioPaused(false);
    setAmbience(null);
    expect(bourg?.remove).toHaveBeenCalled();
  });
});
