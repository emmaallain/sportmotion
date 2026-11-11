import { isSupabaseConfigured } from './env';
import { getSupabase } from './supabaseClient';

export interface Account {
  /** null for a guest (anonymous) account. */
  email: string | null;
  anonymous: boolean;
}

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false };

/** Current account, or null in local mode / when signed out. */
export async function getAccount(): Promise<Account | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase().auth.getUser();
  if (!data.user) return null;
  return { email: data.user.email ?? null, anonymous: data.user.is_anonymous ?? !data.user.email };
}

/** Turns the guest account into a permanent one: the city is kept. */
export async function linkEmail(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await getSupabase().auth.updateUser({ email, password });
  if (error) return { ok: false };
  return { ok: true, needsConfirmation: data.user?.email !== email };
}

/** Signs in to an existing account (replaces the current guest session). */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  return error ? { ok: false } : { ok: true };
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}
