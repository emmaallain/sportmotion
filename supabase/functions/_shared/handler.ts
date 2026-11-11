// Shared HTTP handler of the SportMotion edge functions (Deno).
//
// It authenticates the caller, loads their authoritative game state, runs the same pure
// reducer as the app (`./game`, generated from `src/game` by `npm run sync:edge`) and stores
// the result with the service role. Players have no write access to these tables (RLS).
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { evaluateDay } from './game/economy/day.ts';
import { ALL_MATERIALS } from './game/economy/types.ts';
import type { GameCommand } from './game/engine/commands.ts';
import { processRequest, reviveState } from './game/engine/server.ts';
import type { GameState } from './game/engine/state.ts';
import { levelFromXp } from './game/progression/levels.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const MAX_ATTEMPTS = 3;

/** Writes the read-model tables from the new state. Failures are logged, never fatal. */
async function project(
  admin: SupabaseClient,
  userId: string,
  before: GameState,
  after: GameState,
  today: string,
): Promise<void> {
  const now = new Date().toISOString();
  const tasks: PromiseLike<{ error: unknown }>[] = [];

  const materials = Object.fromEntries(ALL_MATERIALS.map((m) => [m, after.balances.materials[m]]));
  tasks.push(
    admin.from('balances').upsert({
      user_id: userId,
      pulses: after.balances.pulses,
      xp: after.balances.xp,
      ...materials,
      updated_at: now,
    }),
    admin
      .from('profiles')
      .update({
        era: after.era,
        level: levelFromXp(after.balances.xp).level,
        plots: after.city.plots,
        streak_count: after.streak.count,
        best_streak: after.streak.bestCount,
        jokers: after.streak.jokers,
        onboarding_done: after.onboardingDone,
        updated_at: now,
      })
      .eq('id', userId),
  );

  const day = after.days[today];
  if (day && day !== before.days[today]) {
    const totals = evaluateDay(day.activities).totals;
    tasks.push(
      admin.from('day_ledgers').upsert({
        user_id: userId,
        day: today,
        multiplier: day.multiplier,
        base_pulses: day.granted.basePulses,
        pulses: day.granted.pulses,
        xp: day.granted.xp,
        wood: day.granted.materials.wood,
        stone: day.granted.materials.stone,
        water: day.granted.materials.water,
        energy: day.granted.materials.energy,
        steps: totals.steps,
        active_minutes: totals.sportMin + totals.stretchMin,
        completed: day.completed,
        chest: day.chest,
      }),
    );
    const known = new Set((before.days[today]?.activities ?? []).map((a) => a.id));
    const added = day.activities.filter((a) => !known.has(a.id));
    if (added.length > 0) {
      tasks.push(
        admin.from('activities').upsert(
          added.map((a) => ({
            user_id: userId,
            id: a.id,
            day: today,
            type: a.type,
            source: a.source,
            started_at: new Date(a.startMs).toISOString(),
            duration_min: a.durationMin,
            steps: a.steps === undefined ? null : Math.round(a.steps),
            distance_km: a.distanceKm ?? null,
          })),
        ),
      );
    }
  }

  if (after.city.items !== before.city.items || after.interiors !== before.interiors) {
    const kept = new Set(after.city.items.map((p) => p.id));
    const removed = before.city.items.filter((p) => !kept.has(p.id)).map((p) => p.id);
    if (removed.length > 0) {
      tasks.push(admin.from('buildings').delete().eq('user_id', userId).in('id', removed));
    }
    const previous = new Map(before.city.items.map((p) => [p.id, p]));
    const changed = after.city.items.filter(
      (p) => previous.get(p.id) !== p || before.interiors[p.id] !== after.interiors[p.id],
    );
    if (changed.length > 0) {
      tasks.push(
        admin.from('buildings').upsert(
          changed.map((p) => ({
            user_id: userId,
            id: p.id,
            item_id: p.itemId,
            x: p.x,
            y: p.y,
            rotation: p.rot,
            interior: after.interiors[p.id] ?? null,
          })),
        ),
      );
    }
  }

  const results = await Promise.all(tasks);
  for (const { error } of results) if (error) console.error('projection failed', error);
}

export interface HandlerOptions {
  /** Restricts the endpoint to some command types. */
  only?: readonly GameCommand['type'][];
  /** Test hook: provides the service-role client instead of creating one from the env. */
  admin?: SupabaseClient;
}

export async function handle(req: Request, options: HandlerOptions = {}): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, error: { code: 'bad_request' } });

  let admin = options.admin;
  if (!admin) {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) {
      return json(500, { ok: false, error: { code: 'server_misconfigured' } });
    }
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  // Who is calling? The JWT is verified by Supabase Auth, never trusted from the body.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth?.user) return json(401, { ok: false, error: { code: 'unauthorized' } });
  const userId = auth.user.id;

  let request: unknown;
  try {
    request = await req.json();
  } catch {
    return json(400, { ok: false, error: { code: 'bad_request' } });
  }

  const env = {
    now: Date.now(),
    rand: Math.random,
    // Demo projects only. Never enable in production: simulated activities are free Pulses.
    allowMockActivities: Deno.env.get('ALLOW_MOCK_ACTIVITIES') === 'true',
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: row, error: readError } = await admin
      .from('game_states')
      .select('state, version')
      .eq('user_id', userId)
      .maybeSingle();
    if (readError) return json(500, { ok: false, error: { code: 'storage' } });

    // "reset" is an account action, not a game command: it starts a brand new game.
    const reset = (request as { action?: unknown } | null)?.action === 'reset';
    const response = reset
      ? processRequest(null, { command: { type: 'tick' }, today: (request as { today?: unknown }).today }, env)
      : processRequest(row?.state ?? null, request, env, options.only);
    if (response.status !== 200 || !response.body.ok) return json(response.status, response.body);

    const before = reviveState(row?.state ?? null);
    const next = response.body.state;
    const updatedAt = new Date().toISOString();
    let saved = false;
    if (row) {
      const { data, error } = await admin
        .from('game_states')
        .update({ state: next, version: row.version + 1, updated_at: updatedAt })
        .eq('user_id', userId)
        .eq('version', row.version)
        .select('version');
      if (error) return json(500, { ok: false, error: { code: 'storage' } });
      saved = (data?.length ?? 0) === 1;
    } else {
      const { error } = await admin
        .from('game_states')
        .insert({ user_id: userId, state: next, version: 1, updated_at: updatedAt });
      // A unique violation means another request created the row first: retry on top of it.
      if (error && error.code !== '23505') return json(500, { ok: false, error: { code: 'storage' } });
      saved = !error;
    }
    if (!saved) continue; // someone else wrote in between: replay on the fresh state

    const today = (request as { today: string }).today;
    if (reset) {
      await Promise.all([
        admin.from('buildings').delete().eq('user_id', userId),
        admin.from('activities').delete().eq('user_id', userId),
        admin.from('day_ledgers').delete().eq('user_id', userId),
      ]);
    }
    await project(admin, userId, reset ? next : before, next, today);
    return json(200, response.body);
  }
  return json(409, { ok: false, error: { code: 'conflict' } });
}
