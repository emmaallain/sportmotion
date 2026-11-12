import { Platform } from 'react-native';

import { dayRecord } from '@/game/engine';
import { currentDayStartMs } from '@/state/clock';
import { useGame } from '@/state/gameStore';
import { useSettings } from '@/state/settingsStore';

import type { ActivityProvider, ProviderStatus } from './ActivityProvider';
import { healthConnectProvider, healthKitProvider } from './index';
import { syncProvider } from './sync';

/** The health store of this device: Apple Health on iOS, Health Connect on Android. */
export function deviceHealthProvider(): ActivityProvider | null {
  if (Platform.OS === 'ios') return healthKitProvider;
  if (Platform.OS === 'android') return healthConnectProvider;
  return null;
}

export async function deviceHealthStatus(): Promise<ProviderStatus> {
  return (await deviceHealthProvider()?.getStatus()) ?? 'unavailable';
}

export interface HealthSyncResult {
  added: number;
  rejected: number;
}

let running: Promise<HealthSyncResult | null> | null = null;

/**
 * Reads today's steps and workouts from the device's health store and feeds them to the
 * game. Safe to call often: ids are stable, so nothing is ever counted twice.
 */
export function syncHealth(): Promise<HealthSyncResult | null> {
  if (running) return running;
  running = (async () => {
    const provider = deviceHealthProvider();
    if (!provider || !useSettings.getState().healthEnabled) return null;
    try {
      // Silent when access was already decided; needed after every app start.
      if (!(await provider.requestPermissions())) return null;
      const { game, today, dispatch } = useGame.getState();
      const known = new Set(dayRecord(game, today).activities.map((a) => a.id));
      const result = await syncProvider(provider, currentDayStartMs(), known, (command) =>
        dispatch(command, { silent: true }),
      );
      useSettings.getState().setHealthSyncedAt(Date.now());
      return result;
    } catch {
      return null;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Asks for access (system dialog) and runs a first sync. */
export async function connectHealth(): Promise<'connected' | 'refused' | 'unavailable'> {
  const provider = deviceHealthProvider();
  if (!provider) return 'unavailable';
  const status = await provider.getStatus();
  if (status === 'coming_soon' || status === 'unavailable') return 'unavailable';
  if (!(await provider.requestPermissions())) return 'refused';
  useSettings.getState().setHealthEnabled(true);
  await syncHealth();
  return 'connected';
}

export function disconnectHealth(): void {
  useSettings.getState().setHealthEnabled(false);
}
