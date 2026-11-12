import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import {
  disconnectStrava,
  getStravaAuthorizeUrl,
  isStravaAvailable,
  requestStravaSync,
} from '@/data/strava';
import { useGame } from '@/state/gameStore';
import { useSettings } from '@/state/settingsStore';

export type StravaOutcome = 'connected' | 'denied' | 'error';

/** Reads the `strava=…` marker the server adds to the address it sends the player back to. */
export function parseStravaReturn(url: string | null | undefined): StravaOutcome | null {
  const match = /[?&]strava=(connected|denied|error)\b/.exec(url ?? '');
  return (match?.[1] as StravaOutcome | undefined) ?? null;
}

/** Address Strava's consent page returns to: this app (deep link) or this web page. */
export function stravaReturnUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/profile`;
  }
  return Linking.createURL('profile');
}

let syncing: Promise<number | null> | null = null;

/**
 * Asks the server to import today's Strava activities. Returns how many were added, or
 * null when nothing could be done (not connected, offline…).
 */
export function syncStrava(): Promise<number | null> {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!isStravaAvailable() || !useSettings.getState().stravaEnabled) return null;
    const result = await requestStravaSync(useGame.getState().today);
    if (!result.ok) {
      // revoked on strava.com: stop asking until the player connects again
      if (result.code === 'not_connected') useSettings.getState().setStravaEnabled(false);
      return null;
    }
    useGame.getState().adopt(result.state, result.events);
    return result.added;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Called when the player comes back from Strava's consent page. */
export async function finishStravaConnect(outcome: StravaOutcome): Promise<StravaOutcome> {
  if (outcome === 'connected') {
    useSettings.getState().setStravaEnabled(true);
    await syncStrava();
  }
  return outcome;
}

/**
 * Opens Strava's consent page. On a phone it comes back here with the outcome; on the web
 * the page navigates away and the profile screen finishes the job when it reloads.
 */
export async function connectStrava(): Promise<StravaOutcome | 'redirecting'> {
  const returnTo = stravaReturnUrl();
  const url = await getStravaAuthorizeUrl(returnTo).catch(() => null);
  if (!url) return 'error';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return 'redirecting';
  }
  const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
  if (result.type !== 'success') return 'denied';
  return finishStravaConnect(parseStravaReturn(result.url) ?? 'error');
}

export async function unlinkStrava(): Promise<void> {
  await disconnectStrava().catch(() => false);
  useSettings.getState().setStravaEnabled(false);
}
