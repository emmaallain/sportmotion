import type { SupabaseClient } from '@supabase/supabase-js';

import { localDayKey } from '@/game/economy';
import { reviveState } from '@/game/engine';
import type { CommandContext, GameCommand, GameError, GameState } from '@/game/engine';

import { LocalRepository } from './localRepository';
import type { GameRepository, RemoteResult } from './repository';

export const CACHE_KEY = 'sportmotion/cache/v1';

interface FunctionBody {
  ok?: boolean;
  state?: unknown;
  error?: { code?: string };
}

/** Reads the JSON body of an edge function reply, including non-2xx ones. */
async function readBody(data: unknown, error: unknown): Promise<FunctionBody | null> {
  if (data && typeof data === 'object') return data as FunctionBody;
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      return (await (context as Response).json()) as FunctionBody;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Online persistence. The server is authoritative:
 *  - reads come from `game_states` (row level security: own row only);
 *  - every mutation goes through an edge function that recomputes the gains and the costs —
 *    the client has no write access to its balances;
 *  - the last known state is cached locally so the city still opens without network.
 */
export class SupabaseRepository implements GameRepository {
  readonly mode = 'supabase' as const;

  constructor(
    private readonly client: SupabaseClient,
    private readonly cache: GameRepository = new LocalRepository(CACHE_KEY),
  ) {}

  /** Guests get an anonymous account on first launch; they can attach an e-mail later. */
  async ensureSession(): Promise<string> {
    const { data } = await this.client.auth.getSession();
    if (data.session) return data.session.user.id;
    const { data: created, error } = await this.client.auth.signInAnonymously();
    if (error || !created.user) throw error ?? new Error('anonymous sign-in failed');
    return created.user.id;
  }

  async load(): Promise<GameState | null> {
    try {
      const userId = await this.ensureSession();
      const { data, error } = await this.client
        .from('game_states')
        .select('state')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const state = reviveState(data.state);
      await this.cache.save(state);
      return state;
    } catch {
      // offline: show the last state we know about
      return this.cache.load();
    }
  }

  async save(state: GameState): Promise<void> {
    await this.cache.save(state);
  }

  private async invoke(name: string, body: unknown): Promise<RemoteResult> {
    try {
      await this.ensureSession();
      const { data, error } = await this.client.functions.invoke(name, {
        body: body as Record<string, unknown>,
      });
      const reply = await readBody(data, error);
      if (!reply) return { ok: false, error: { code: 'network' } };
      const state = reply.state === undefined ? undefined : reviveState(reply.state);
      if (reply.ok && state) return { ok: true, state };
      return {
        ok: false,
        error: (reply.error?.code ? reply.error : { code: 'network' }) as GameError,
        state,
      };
    } catch {
      return { ok: false, error: { code: 'network' } };
    }
  }

  send(command: GameCommand, ctx: Pick<CommandContext, 'today'>): Promise<RemoteResult> {
    const name = command.type === 'add_activity' ? 'validate-activity' : 'game-command';
    return this.invoke(name, { command, today: ctx.today });
  }

  async reset(): Promise<void> {
    await this.cache.reset();
    await this.invoke('game-command', { action: 'reset', today: localDayKey(new Date()) });
  }
}
