import { LocalRepository } from './localRepository';
import type { GameRepository } from './repository';

export type { GameRepository, RemoteResult, RepositoryMode } from './repository';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** The backend is used only when both environment variables are present. */
export const isSupabaseConfigured = (): boolean =>
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

let repository: GameRepository | null = null;

/** Local (AsyncStorage) by default; Supabase when the environment is configured. */
export function getRepository(): GameRepository {
  if (repository) return repository;
  repository = new LocalRepository();
  return repository;
}

/** Test hook. */
export function setRepository(next: GameRepository | null): void {
  repository = next;
}
