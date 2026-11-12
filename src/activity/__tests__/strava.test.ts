import { createInitialState } from '@/game/engine';
import { useGame } from '@/state/gameStore';
import { useSettings } from '@/state/settingsStore';

import {
  connectStrava,
  finishStravaConnect,
  parseStravaReturn,
  stravaReturnUrl,
  syncStrava,
  unlinkStrava,
} from '../stravaSync';

const mockSync = jest.fn();
const mockAuthorizeUrl = jest.fn();
const mockDisconnect = jest.fn(async () => true);
const mockOpen = jest.fn();
let mockAvailable = true;

jest.mock('@/data/strava', () => ({
  isStravaAvailable: () => mockAvailable,
  requestStravaSync: (today: string) => mockSync(today),
  getStravaAuthorizeUrl: (returnTo: string) => mockAuthorizeUrl(returnTo),
  disconnectStrava: () => mockDisconnect(),
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (url: string, returnTo: string) => mockOpen(url, returnTo),
}));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `sportmotion://${path}` }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable = true;
  useSettings.setState({ stravaEnabled: false, dayOffset: 0 });
  useGame.setState({ game: createInitialState() });
});

describe('parseStravaReturn', () => {
  it('reads the outcome from the return address', () => {
    expect(parseStravaReturn('sportmotion://profile?strava=connected')).toBe('connected');
    expect(parseStravaReturn('https://app.example/profile?x=1&strava=denied')).toBe('denied');
    expect(parseStravaReturn('sportmotion://profile?strava=error')).toBe('error');
    expect(parseStravaReturn('sportmotion://profile?strava=hacked')).toBeNull();
    expect(parseStravaReturn('sportmotion://profile')).toBeNull();
    expect(parseStravaReturn(null)).toBeNull();
  });

  it('returns to the app through its deep link', () => {
    expect(stravaReturnUrl()).toBe('sportmotion://profile');
  });
});

describe('syncStrava', () => {
  it('does nothing until the player has connected Strava, or in local mode', async () => {
    expect(await syncStrava()).toBeNull();
    useSettings.setState({ stravaEnabled: true });
    mockAvailable = false;
    expect(await syncStrava()).toBeNull();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('adopts the state computed by the server', async () => {
    useSettings.setState({ stravaEnabled: true });
    const state = createInitialState();
    state.balances.pulses = 95;
    mockSync.mockResolvedValue({ ok: true, state, events: [], added: 2 });
    expect(await syncStrava()).toBe(2);
    expect(mockSync).toHaveBeenCalledWith(useGame.getState().today);
    expect(useGame.getState().game.balances.pulses).toBe(95);
  });

  it('stops syncing when the link was revoked on Strava', async () => {
    useSettings.setState({ stravaEnabled: true });
    mockSync.mockResolvedValue({ ok: false, code: 'not_connected' });
    expect(await syncStrava()).toBeNull();
    expect(useSettings.getState().stravaEnabled).toBe(false);
  });

  it('keeps the link on a network error', async () => {
    useSettings.setState({ stravaEnabled: true });
    mockSync.mockResolvedValue({ ok: false, code: 'network' });
    expect(await syncStrava()).toBeNull();
    expect(useSettings.getState().stravaEnabled).toBe(true);
  });
});

describe('connectStrava', () => {
  it('opens the consent page and syncs once connected', async () => {
    mockAuthorizeUrl.mockResolvedValue('https://www.strava.com/oauth/authorize?x=1');
    mockOpen.mockResolvedValue({ type: 'success', url: 'sportmotion://profile?strava=connected' });
    mockSync.mockResolvedValue({ ok: true, state: createInitialState(), events: [], added: 0 });
    expect(await connectStrava()).toBe('connected');
    expect(mockAuthorizeUrl).toHaveBeenCalledWith('sportmotion://profile');
    expect(mockOpen).toHaveBeenCalledWith(
      'https://www.strava.com/oauth/authorize?x=1',
      'sportmotion://profile',
    );
    expect(useSettings.getState().stravaEnabled).toBe(true);
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('reports a refusal, a closed browser or a server error', async () => {
    mockAuthorizeUrl.mockResolvedValue('https://www.strava.com/oauth/authorize');
    mockOpen.mockResolvedValue({ type: 'success', url: 'sportmotion://profile?strava=denied' });
    expect(await connectStrava()).toBe('denied');
    mockOpen.mockResolvedValue({ type: 'cancel' });
    expect(await connectStrava()).toBe('denied');
    mockAuthorizeUrl.mockResolvedValue(null);
    expect(await connectStrava()).toBe('error');
    expect(useSettings.getState().stravaEnabled).toBe(false);
  });

  it('finishes a web return and can unlink', async () => {
    mockSync.mockResolvedValue({ ok: true, state: createInitialState(), events: [], added: 0 });
    expect(await finishStravaConnect('connected')).toBe('connected');
    expect(useSettings.getState().stravaEnabled).toBe(true);
    expect(await finishStravaConnect('denied')).toBe('denied');
    await unlinkStrava();
    expect(mockDisconnect).toHaveBeenCalled();
    expect(useSettings.getState().stravaEnabled).toBe(false);
  });
});
