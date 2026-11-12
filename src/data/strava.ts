import { reviveState } from '@/game/engine';
import type { GameEvent, GameState } from '@/game/engine';

import { isSupabaseConfigured } from './env';
import { getSupabase } from './supabaseClient';

export interface StravaConnection {
  athleteName: string | null;
  lastSyncAt: string | null;
}

export type StravaSyncResult =
  | { ok: true; state: GameState; events: GameEvent[]; added: number }
  | { ok: false; code: 'not_connected' | 'not_configured' | 'network' };

/** Strava needs the backend: the client secret and the tokens must stay on a server. */
export const isStravaAvailable = (): boolean => isSupabaseConfigured();

async function readBody(data: unknown, error: unknown): Promise<Record<string, unknown> | null> {
  if (data && typeof data === 'object') return data as Record<string, unknown>;
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (context?.json) {
    return (await context.json().catch(() => null)) as Record<string, unknown> | null;
  }
  return null;
}

/** Who is connected (never the tokens: the app cannot read them). */
export async function getStravaConnection(): Promise<StravaConnection | null> {
  if (!isStravaAvailable()) return null;
  const { data, error } = await getSupabase()
    .from('strava_connections')
    .select('athlete_name, last_sync_at')
    .maybeSingle();
  if (error || !data) return null;
  return { athleteName: data.athlete_name ?? null, lastSyncAt: data.last_sync_at ?? null };
}

/** Asks the server for the Strava consent page to open. */
export async function getStravaAuthorizeUrl(returnTo: string): Promise<string | null> {
  const { data, error } = await getSupabase().functions.invoke('strava-connect', {
    body: { return_to: returnTo },
  });
  const body = await readBody(data, error);
  return typeof body?.url === 'string' ? body.url : null;
}

export async function disconnectStrava(): Promise<boolean> {
  const { data, error } = await getSupabase().functions.invoke('strava-connect', {
    body: { action: 'disconnect' },
  });
  return (await readBody(data, error))?.ok === true;
}

/** The server fetches today's Strava activities and returns the updated game. */
export async function requestStravaSync(today: string): Promise<StravaSyncResult> {
  try {
    const { data, error } = await getSupabase().functions.invoke('strava-sync', {
      body: { today },
    });
    const body = await readBody(data, error);
    if (body?.ok === true && body.state) {
      return {
        ok: true,
        state: reviveState(body.state),
        events: (body.events as GameEvent[] | undefined) ?? [],
        added: typeof body.added === 'number' ? body.added : 0,
      };
    }
    const code = (body?.error as { code?: string } | undefined)?.code;
    if (code === 'strava_not_connected') return { ok: false, code: 'not_connected' };
    if (code === 'strava_not_configured') return { ok: false, code: 'not_configured' };
    return { ok: false, code: 'network' };
  } catch {
    return { ok: false, code: 'network' };
  }
}
