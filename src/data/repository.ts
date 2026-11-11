import type { CommandContext, GameCommand, GameError, GameState } from '@/game/engine';

export type RepositoryMode = 'local' | 'supabase';

export type RemoteResult =
  /** The server accepted the command; `state` is authoritative. */
  | { ok: true; state: GameState }
  /** The server refused the command; `state` (when present) is what the client must roll back to. */
  | { ok: false; error: GameError | { code: 'network' }; state?: GameState };

/**
 * Persistence boundary of the game.
 *
 * - local mode: the device is the source of truth, `save` writes the whole snapshot.
 * - supabase mode: the server is the source of truth, every command goes through `send`
 *   and the client cannot write its balances itself.
 */
export interface GameRepository {
  readonly mode: RepositoryMode;
  /** Loads the saved game, or null for a new player. */
  load(): Promise<GameState | null>;
  /** Persists a snapshot (local cache in supabase mode). */
  save(state: GameState): Promise<void>;
  /** Server-side validation of a command. Absent in local mode. */
  send?(command: GameCommand, ctx: Pick<CommandContext, 'today'>): Promise<RemoteResult>;
  /** Erases the saved game. */
  reset(): Promise<void>;
}
