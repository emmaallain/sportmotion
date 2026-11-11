import { isSupabaseConfigured } from './env';
import { LocalRepository } from './localRepository';
import type { GameRepository } from './repository';
import { getSupabase } from './supabaseClient';
import { SupabaseRepository } from './supabaseRepository';

export type { GameRepository, RemoteError, RemoteResult, RepositoryMode } from './repository';
export { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './env';

let repository: GameRepository | null = null;

/** Local (AsyncStorage) by default; Supabase when the environment is configured. */
export function getRepository(): GameRepository {
  if (repository) return repository;
  repository = isSupabaseConfigured()
    ? new SupabaseRepository(getSupabase())
    : new LocalRepository();
  return repository;
}

/** Test hook. */
export function setRepository(next: GameRepository | null): void {
  repository = next;
}
