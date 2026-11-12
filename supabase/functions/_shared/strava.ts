// Strava integration for the edge functions.
//
//   strava-connect   (signed in)  → returns the Strava consent URL, or disconnects
//   strava-callback  (browser)    → Strava sends the player back here with a code
//   strava-sync      (signed in)  → fetches today's activities and applies them to the game
//
// The client secret and the athlete's tokens stay on the server. The device never sends
// Strava activities itself, so that source cannot be forged.
import type { SupabaseClient } from '@supabase/supabase-js';

import { importStravaActivities, isPlausibleToday } from './game/engine/server.ts';
import {
  STRAVA_ACTIVITIES_URL,
  STRAVA_DEAUTHORIZE_URL,
  STRAVA_TOKEN_URL,
  isAllowedReturnUrl,
  stravaAuthorizeUrl,
  tokenNeedsRefresh,
} from './game/integrations/strava.ts';
import type { StravaActivity } from './game/integrations/strava.ts';
import { CORS, adminClient, authenticate, json, serverEnv, transact } from './handler.ts';

export interface StravaDeps {
  admin: SupabaseClient;
  fetch: typeof fetch;
  clientId: string;
  clientSecret: string;
  /** Public URL of the strava-callback function (must match the Strava app settings). */
  callbackUrl: string;
  /** Web address of the app, when it is hosted (allowed as a return address). */
  webOrigin?: string;
  now: () => number;
}

const STATE_TTL_MS = 10 * 60_000;

/** Builds the dependencies from the function's environment, or explains what is missing. */
export function stravaDeps(): StravaDeps | Response {
  const admin = adminClient();
  const clientId = Deno.env.get('STRAVA_CLIENT_ID');
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
  const url = Deno.env.get('SUPABASE_URL');
  if (!admin || !clientId || !clientSecret || !url) {
    return json(500, { ok: false, error: { code: 'strava_not_configured' } });
  }
  return {
    admin,
    fetch,
    clientId,
    clientSecret,
    callbackUrl: `${url}/functions/v1/strava-callback`,
    webOrigin: Deno.env.get('APP_WEB_URL') ?? undefined,
    now: Date.now,
  };
}

interface TokenReply {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  athlete?: { id?: number; firstname?: string; lastname?: string };
}

async function tokenRequest(deps: StravaDeps, params: Record<string, string>): Promise<TokenReply | null> {
  const res = await deps.fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: deps.clientId,
      client_secret: deps.clientSecret,
      ...params,
    }),
  });
  if (!res.ok) return null;
  const reply = (await res.json()) as TokenReply;
  return reply.access_token && reply.refresh_token && reply.expires_at ? reply : null;
}

function redirect(to: string, status: 'connected' | 'denied' | 'error'): Response {
  const separator = to.includes('?') ? '&' : '?';
  return new Response(null, { status: 302, headers: { Location: `${to}${separator}strava=${status}` } });
}

// ───────────────────────────── strava-connect ─────────────────────────────

export async function handleConnect(req: Request, deps: StravaDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, error: { code: 'bad_request' } });
  const userId = await authenticate(req, deps.admin);
  if (!userId) return json(401, { ok: false, error: { code: 'unauthorized' } });
  const body = (await req.json().catch(() => null)) as { action?: unknown; return_to?: unknown } | null;

  if (body?.action === 'disconnect') {
    const { data: connection } = await deps.admin
      .from('strava_connections')
      .select('access_token')
      .eq('user_id', userId)
      .maybeSingle();
    if (connection) {
      // Best effort: also revoke the authorisation on Strava's side.
      await deps
        .fetch(STRAVA_DEAUTHORIZE_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${connection.access_token}` },
        })
        .catch(() => undefined);
      await deps.admin.from('strava_connections').delete().eq('user_id', userId);
    }
    return json(200, { ok: true });
  }

  if (!isAllowedReturnUrl(body?.return_to, deps.webOrigin)) {
    return json(400, { ok: false, error: { code: 'bad_request' } });
  }
  const state = crypto.randomUUID();
  // one pending authorisation per player
  await deps.admin.from('strava_oauth_states').delete().eq('user_id', userId);
  const { error } = await deps.admin.from('strava_oauth_states').insert({
    state,
    user_id: userId,
    return_to: body.return_to,
    created_at: new Date(deps.now()).toISOString(),
  });
  if (error) return json(500, { ok: false, error: { code: 'storage' } });
  return json(200, { ok: true, url: stravaAuthorizeUrl(deps.clientId, deps.callbackUrl, state) });
}

// ───────────────────────────── strava-callback ─────────────────────────────

export async function handleCallback(req: Request, deps: StravaDeps): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const state = params.get('state') ?? '';
  const { data: pending } = await deps.admin
    .from('strava_oauth_states')
    .select('state, user_id, return_to, created_at')
    .eq('state', state)
    .maybeSingle();
  // Unknown, reused or expired state: we do not know whom to send back, nor where.
  if (!pending) return new Response('Lien Strava expiré. Relancez la connexion depuis SportMotion.', { status: 400 });
  await deps.admin.from('strava_oauth_states').delete().eq('state', state); // single use
  const returnTo = pending.return_to as string;
  if (deps.now() - Date.parse(pending.created_at as string) > STATE_TTL_MS) {
    return redirect(returnTo, 'error');
  }

  const code = params.get('code');
  const scope = params.get('scope') ?? '';
  if (params.get('error') || !code || !scope.includes('activity:read')) {
    return redirect(returnTo, 'denied');
  }

  const tokens = await tokenRequest(deps, { code, grant_type: 'authorization_code' }).catch(() => null);
  if (!tokens?.athlete?.id) return redirect(returnTo, 'error');

  const { error } = await deps.admin.from('strava_connections').upsert({
    user_id: pending.user_id,
    athlete_id: tokens.athlete.id,
    athlete_name: [tokens.athlete.firstname, tokens.athlete.lastname].filter(Boolean).join(' ') || null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    connected_at: new Date(deps.now()).toISOString(),
    last_sync_at: null,
  });
  // e.g. this Strava athlete is already linked to another SportMotion account
  return redirect(returnTo, error ? 'error' : 'connected');
}

// ───────────────────────────── strava-sync ─────────────────────────────

export async function handleSync(req: Request, deps: StravaDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, error: { code: 'bad_request' } });
  const userId = await authenticate(req, deps.admin);
  if (!userId) return json(401, { ok: false, error: { code: 'unauthorized' } });
  const body = (await req.json().catch(() => null)) as { today?: unknown } | null;
  const today = body?.today;
  if (!isPlausibleToday(today, deps.now())) return json(400, { ok: false, error: { code: 'bad_day' } });

  const { data: connection } = await deps.admin
    .from('strava_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (!connection) return json(409, { ok: false, error: { code: 'strava_not_connected' } });

  const forget = async () => {
    await deps.admin.from('strava_connections').delete().eq('user_id', userId);
    return json(409, { ok: false, error: { code: 'strava_not_connected' } });
  };

  let accessToken = connection.access_token as string;
  if (tokenNeedsRefresh(Number(connection.expires_at), deps.now())) {
    const refreshed = await tokenRequest(deps, {
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token as string,
    }).catch(() => null);
    // The player revoked the app on strava.com: the link is gone.
    if (!refreshed) return forget();
    accessToken = refreshed.access_token as string;
    await deps.admin
      .from('strava_connections')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: refreshed.expires_at,
      })
      .eq('user_id', userId);
  }

  // Everything that started since the eve of "today" (covers every time zone); the engine
  // only keeps the activities of the player's current day.
  const after = Math.floor(Date.parse(`${today}T00:00:00Z`) / 1000) - 36 * 3600;
  const res = await deps
    .fetch(`${STRAVA_ACTIVITIES_URL}?after=${after}&per_page=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    .catch(() => null);
  if (res?.status === 401) return forget();
  if (!res || !res.ok) return json(502, { ok: false, error: { code: 'strava_unavailable' } });
  const activities = (await res.json()) as StravaActivity[];
  if (!Array.isArray(activities)) return json(502, { ok: false, error: { code: 'strava_unavailable' } });

  const env = serverEnv();
  const response = await transact(deps.admin, userId, today, (stored) => {
    const result = importStravaActivities(stored, activities, today, env);
    return {
      status: 200,
      body: { ok: true, state: result.state, events: result.events, added: result.added },
    };
  });
  if (response.status === 200) {
    await deps.admin
      .from('strava_connections')
      .update({ last_sync_at: new Date(deps.now()).toISOString() })
      .eq('user_id', userId);
  }
  return response;
}
