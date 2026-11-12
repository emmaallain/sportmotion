import { addDays, dayKeyAtOffset, isDayKey } from '../economy/dates';
import { ACTIVITY_TYPES } from '../economy/types';
import type { Activity, ActivitySource } from '../economy/types';
import type { GameCommand, GameError, GameEvent } from './commands';
import { applyCommand } from './reducer';
import { STATE_VERSION, createInitialState } from './state';
import type { GameState } from './state';

/**
 * Server-side entry point, shared by the Supabase edge functions.
 *
 * Pure: the edge function only authenticates the caller, loads the saved state, calls
 * `processRequest`, and stores the result. The client never computes its own balances.
 */
export interface ServerEnv {
  /** Server clock, epoch ms. */
  now: number;
  rand: () => number;
  /** Simulated activities are refused unless the project explicitly allows them (demo). */
  allowMockActivities: boolean;
}

export type ServerErrorCode =
  'bad_request' | 'bad_day' | 'mock_not_allowed' | 'activity_out_of_window' | 'command_not_allowed';

export type ServerResponse =
  | { status: 200; body: { ok: true; state: GameState; events: GameEvent[] } }
  | {
      status: 400 | 422;
      body: { ok: false; error: GameError | { code: ServerErrorCode }; state: GameState };
    };

const SOURCES: readonly ActivitySource[] = ['mock', 'manual', 'healthkit', 'health_connect'];
const HOUR = 3_600_000;

/** Commands the client may send. `tick` is implicit in every command. */
const ALLOWED: readonly GameCommand['type'][] = [
  'tick',
  'claim_starter_bonus',
  'finish_onboarding',
  'add_activity',
  'open_chest',
  'harvest',
  'harvest_all',
  'place_item',
  'move_item',
  'sell_item',
  'buy_plot',
  'craft',
  'buy_room',
  'place_furniture',
  'move_furniture',
  'sell_furniture',
  'advance_era',
];

/**
 * The player's "today" comes from the device (the server does not know its time zone), but
 * it must be a real calendar day somewhere on Earth right now: UTC−12 … UTC+14.
 */
export function isPlausibleToday(today: unknown, now: number): today is string {
  if (!isDayKey(today)) return false;
  return today >= dayKeyAtOffset(now, -12 * 60) && today <= dayKeyAtOffset(now, 14 * 60);
}

function sanitizeActivity(raw: unknown): Activity | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const optionalNumber = (v: unknown) => v === undefined || v === null || typeof v === 'number';
  if (
    typeof a.id !== 'string' ||
    a.id.length === 0 ||
    a.id.length > 64 ||
    !ACTIVITY_TYPES.includes(a.type as never) ||
    !SOURCES.includes(a.source as never) ||
    typeof a.startMs !== 'number' ||
    typeof a.durationMin !== 'number' ||
    !optionalNumber(a.steps) ||
    !optionalNumber(a.distanceKm)
  ) {
    return null;
  }
  // Rebuild the object: unknown properties never reach the stored state.
  const activity: Activity = {
    id: a.id,
    type: a.type as Activity['type'],
    source: a.source as ActivitySource,
    startMs: a.startMs,
    durationMin: a.durationMin,
  };
  if (typeof a.steps === 'number') activity.steps = a.steps;
  if (typeof a.distanceKm === 'number') activity.distanceKm = a.distanceKm;
  return activity;
}

/** Keeps a state loaded from storage usable even if it predates newer fields. */
export function reviveState(stored: unknown): GameState {
  const fresh = createInitialState();
  if (!stored || typeof stored !== 'object') return fresh;
  const data = stored as Partial<GameState>;
  if (data.version !== STATE_VERSION || !data.balances || !data.city) return fresh;
  return { ...fresh, ...data } as GameState;
}

export function processRequest(
  stored: unknown,
  request: unknown,
  env: ServerEnv,
  /** Restricts the endpoint to some command types (e.g. `validate-activity`). */
  only?: readonly GameCommand['type'][],
): ServerResponse {
  const state = reviveState(stored);
  const reject = (
    status: 400 | 422,
    error: GameError | { code: ServerErrorCode },
  ): ServerResponse => ({ status, body: { ok: false, error, state } });

  if (!request || typeof request !== 'object') return reject(400, { code: 'bad_request' });
  const { command: rawCommand, today } = request as { command?: unknown; today?: unknown };
  if (!rawCommand || typeof rawCommand !== 'object') return reject(400, { code: 'bad_request' });
  const type = (rawCommand as { type?: unknown }).type;
  if (typeof type !== 'string' || !ALLOWED.includes(type as never)) {
    return reject(400, { code: 'bad_request' });
  }
  if (only && !only.includes(type as GameCommand['type'])) {
    return reject(400, { code: 'command_not_allowed' });
  }
  if (!isPlausibleToday(today, env.now)) return reject(400, { code: 'bad_day' });
  // The calendar never goes backwards: a device cannot replay an earlier day.
  const last = state.streak.lastSettledDay;
  if (last !== null && today < last) return reject(400, { code: 'bad_day' });

  let command = rawCommand as GameCommand;
  if (command.type === 'add_activity') {
    const activity = sanitizeActivity(command.activity);
    if (!activity) return reject(400, { code: 'bad_request' });
    if (activity.source === 'mock' && !env.allowMockActivities) {
      return reject(422, { code: 'mock_not_allowed' });
    }
    // An activity belongs to the day it is reported for, and cannot come from the future.
    const dayStart = Date.parse(`${addDays(today, -1)}T00:00:00Z`) - 14 * HOUR;
    if (activity.startMs < dayStart || activity.startMs > env.now + 14 * HOUR) {
      return reject(422, { code: 'activity_out_of_window' });
    }
    command = { type: 'add_activity', activity };
  }

  const result = applyCommand(state, command, { today, rand: env.rand });
  if (!result.ok) return reject(422, result.error);
  return { status: 200, body: { ok: true, state: result.state, events: result.events } };
}
