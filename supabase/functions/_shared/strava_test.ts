// Tests of the Strava functions with an in-memory Supabase and a fake Strava API.
//   deno test --allow-env supabase/functions/_shared/strava_test.ts
import { FakeDb } from './fake_supabase.ts';
import { handleCallback, handleConnect, handleSync } from './strava.ts';
import type { StravaDeps } from './strava.ts';

function assertEquals(actual: unknown, expected: unknown, message = ''): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`);
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const NOW = Date.parse('2026-06-15T12:00:00Z');
const TODAY = '2026-06-15';

/** Fake Strava: records the calls and answers like the real API. */
function fakeStrava(options: { activities?: unknown[]; tokenOk?: boolean; apiStatus?: number } = {}) {
  const calls: { url: string; body: string; auth: string }[] = [];
  const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body: String(init?.body ?? ''),
      auth: String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ''),
    });
    if (url.includes('/oauth/token')) {
      if (options.tokenOk === false) return Promise.resolve(new Response('{}', { status: 400 }));
      const refresh = String(init?.body).includes('grant_type=refresh_token');
      return Promise.resolve(
        Response.json({
          access_token: refresh ? 'access-2' : 'access-1',
          refresh_token: refresh ? 'refresh-2' : 'refresh-1',
          expires_at: Math.floor(NOW / 1000) + 21_600,
          athlete: { id: 4242, firstname: 'Emma', lastname: 'A.' },
        }),
      );
    }
    if (url.includes('/athlete/activities')) {
      if (options.apiStatus) return Promise.resolve(new Response('{}', { status: options.apiStatus }));
      return Promise.resolve(Response.json(options.activities ?? []));
    }
    return Promise.resolve(new Response('{}'));
  }) as typeof fetch;
  return { fetcher, calls };
}

function deps(db: FakeDb, strava = fakeStrava(), now = NOW): StravaDeps {
  return {
    admin: db.client(),
    fetch: strava.fetcher,
    clientId: '1234',
    clientSecret: 'shh',
    callbackUrl: 'https://proj.supabase.co/functions/v1/strava-callback',
    webOrigin: 'https://sportmotion.example',
    now: () => now,
  };
}

const post = (body: unknown, token = 'good-token') =>
  new Request('http://localhost/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const run = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  sport_type: 'Run',
  type: 'Run',
  start_date: '2026-06-15T06:00:00Z',
  start_date_local: '2026-06-15T08:00:00Z',
  moving_time: 1800,
  distance: 5000,
  manual: false,
  ...over,
});

async function connect(db: FakeDb, strava = fakeStrava()): Promise<string> {
  const res = await handleConnect(post({ return_to: 'sportmotion://strava' }), deps(db, strava));
  assertEquals(res.status, 200);
  const { url } = await res.json();
  return new URL(url).searchParams.get('state') as string;
}

Deno.test('connect: needs a session and a safe return address', async () => {
  const db = new FakeDb();
  assertEquals((await handleConnect(post({ return_to: 'sportmotion://strava' }, 'bad'), deps(db))).status, 401);
  assertEquals((await handleConnect(post({ return_to: 'https://evil.com' }), deps(db))).status, 400);
  assertEquals(db.tables.strava_oauth_states, undefined);
});

Deno.test('connect: returns the Strava consent URL with a single-use state', async () => {
  const db = new FakeDb();
  const res = await handleConnect(post({ return_to: 'sportmotion://strava' }), deps(db));
  const url = new URL((await res.json()).url);
  assertEquals(url.origin + url.pathname, 'https://www.strava.com/oauth/authorize');
  assertEquals(url.searchParams.get('client_id'), '1234');
  assertEquals(url.searchParams.get('redirect_uri'), 'https://proj.supabase.co/functions/v1/strava-callback');
  assertEquals(url.searchParams.get('scope'), 'activity:read_all');
  assert(!url.toString().includes('shh'), 'the secret never appears in the URL');
  assertEquals(db.tables.strava_oauth_states?.[0]?.state, url.searchParams.get('state'));
  // asking again replaces the pending state
  await handleConnect(post({ return_to: 'sportmotion://strava' }), deps(db));
  assertEquals(db.tables.strava_oauth_states?.length, 1);
});

Deno.test('callback: exchanges the code, stores the tokens and returns to the app', async () => {
  const db = new FakeDb();
  const strava = fakeStrava();
  const state = await connect(db, strava);
  const res = await handleCallback(
    new Request(`https://proj.supabase.co/functions/v1/strava-callback?state=${state}&code=abc&scope=read,activity:read_all`),
    deps(db, strava),
  );
  assertEquals(res.status, 302);
  assertEquals(res.headers.get('Location'), 'sportmotion://strava?strava=connected');
  const row = db.tables.strava_connections?.[0];
  assertEquals([row?.user_id, row?.athlete_id, row?.athlete_name, row?.access_token], ['user-1', 4242, 'Emma A.', 'access-1']);
  assert(strava.calls[0]?.body.includes('client_secret=shh') && strava.calls[0]?.body.includes('code=abc'), 'token exchange');
  // the state cannot be replayed
  assertEquals(db.tables.strava_oauth_states?.length, 0);
  const replay = await handleCallback(
    new Request(`https://proj.supabase.co/x?state=${state}&code=abc&scope=activity:read_all`),
    deps(db, strava),
  );
  assertEquals(replay.status, 400);
});

Deno.test('callback: refusal, missing scope, expired or unknown state', async () => {
  const db = new FakeDb();
  let state = await connect(db);
  let res = await handleCallback(new Request(`https://x/?state=${state}&error=access_denied`), deps(db));
  assertEquals(res.headers.get('Location'), 'sportmotion://strava?strava=denied');

  state = await connect(db);
  res = await handleCallback(new Request(`https://x/?state=${state}&code=abc&scope=read`), deps(db));
  assertEquals(res.headers.get('Location'), 'sportmotion://strava?strava=denied');

  state = await connect(db);
  res = await handleCallback(
    new Request(`https://x/?state=${state}&code=abc&scope=activity:read_all`),
    deps(db, fakeStrava(), NOW + 11 * 60_000),
  );
  assertEquals(res.headers.get('Location'), 'sportmotion://strava?strava=error');

  state = await connect(db);
  res = await handleCallback(
    new Request(`https://x/?state=${state}&code=abc&scope=activity:read_all`),
    deps(db, fakeStrava({ tokenOk: false })),
  );
  assertEquals(res.headers.get('Location'), 'sportmotion://strava?strava=error');

  res = await handleCallback(new Request('https://x/?state=forged&code=abc'), deps(db));
  assertEquals(res.status, 400);
  assertEquals(db.tables.strava_connections, undefined);
});

function connected(db: FakeDb, expiresAt = Math.floor(NOW / 1000) + 3600): void {
  db.tables.strava_connections = [
    { user_id: 'user-1', athlete_id: 4242, access_token: 'access-1', refresh_token: 'refresh-1', expires_at: expiresAt },
  ];
}

Deno.test('sync: needs a session, a plausible day and a connection', async () => {
  const db = new FakeDb();
  assertEquals((await handleSync(post({ today: TODAY }, 'bad'), deps(db))).status, 401);
  assertEquals((await handleSync(post({ today: '2030-01-01' }), deps(db))).status, 400);
  const res = await handleSync(post({ today: TODAY }), deps(db));
  assertEquals([res.status, (await res.json()).error.code], [409, 'strava_not_connected']);
});

Deno.test('sync: imports today’s activities once and credits the game on the server', async () => {
  const db = new FakeDb();
  connected(db);
  const strava = fakeStrava({
    activities: [run(1), run(2, { sport_type: 'Yoga', start_date: '2026-06-15T16:00:00Z', distance: 0, moving_time: 1200 }), run(3, { start_date_local: '2026-06-13T08:00:00Z' })],
  });
  const res = await handleSync(post({ today: TODAY }), deps(db, strava));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.added, 2);
  assertEquals(body.state.balances.pulses, 95);
  assertEquals(strava.calls[0]?.auth, 'Bearer access-1');
  assert(strava.calls[0]?.url.includes('after='), 'only recent activities are requested');
  assertEquals(db.tables.balances?.[0]?.pulses, 95);
  assertEquals(db.tables.activities?.map((a) => a.source), ['strava', 'strava']);
  assert(db.tables.strava_connections?.[0]?.last_sync_at, 'last sync recorded');

  const again = await handleSync(post({ today: TODAY }), deps(db, strava));
  assertEquals((await again.json()).added, 0);
  assertEquals(db.tables.balances?.[0]?.pulses, 95);
});

Deno.test('sync: refreshes an expired token before calling Strava', async () => {
  const db = new FakeDb();
  connected(db, Math.floor(NOW / 1000) - 60);
  const strava = fakeStrava({ activities: [run(1)] });
  const res = await handleSync(post({ today: TODAY }), deps(db, strava));
  assertEquals(res.status, 200);
  assert(strava.calls[0]?.body.includes('grant_type=refresh_token'), 'refresh first');
  assertEquals(strava.calls[1]?.auth, 'Bearer access-2');
  assertEquals(db.tables.strava_connections?.[0]?.refresh_token, 'refresh-2');
});

Deno.test('sync: forgets the link when the player revoked the app on Strava', async () => {
  const db = new FakeDb();
  connected(db, Math.floor(NOW / 1000) - 60);
  let res = await handleSync(post({ today: TODAY }), deps(db, fakeStrava({ tokenOk: false })));
  assertEquals(res.status, 409);
  assertEquals(db.tables.strava_connections?.length, 0);

  connected(db);
  res = await handleSync(post({ today: TODAY }), deps(db, fakeStrava({ apiStatus: 401 })));
  assertEquals(res.status, 409);
  assertEquals(db.tables.strava_connections?.length, 0);
});

Deno.test('sync: a Strava outage changes nothing', async () => {
  const db = new FakeDb();
  connected(db);
  const res = await handleSync(post({ today: TODAY }), deps(db, fakeStrava({ apiStatus: 503 })));
  assertEquals(res.status, 502);
  assertEquals(db.tables.strava_connections?.length, 1);
  assertEquals(db.tables.game_states, undefined);
});

Deno.test('disconnect: revokes on Strava and deletes the tokens', async () => {
  const db = new FakeDb();
  connected(db);
  const strava = fakeStrava();
  const res = await handleConnect(post({ action: 'disconnect' }), deps(db, strava));
  assertEquals(res.status, 200);
  assert(strava.calls[0]?.url.includes('/oauth/deauthorize'), 'deauthorize called');
  assertEquals(db.tables.strava_connections?.length, 0);
});
