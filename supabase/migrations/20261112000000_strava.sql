-- Strava integration.
--
-- The OAuth tokens never leave the server: the app can only read who is connected and when
-- the last sync happened. Activities are fetched from Strava by the `strava-sync` edge
-- function itself, so the "strava" source cannot be forged by a device.

alter table public.activities drop constraint activities_source_check;
alter table public.activities add constraint activities_source_check
  check (source in ('mock', 'manual', 'healthkit', 'health_connect', 'strava'));

create table public.strava_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  athlete_id bigint not null,
  athlete_name text,
  access_token text not null,
  refresh_token text not null,
  -- epoch seconds, as returned by Strava
  expires_at bigint not null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz
);
-- One Strava athlete feeds one SportMotion account (no sharing a watch between accounts).
create unique index strava_connections_athlete_idx on public.strava_connections (athlete_id);

-- Short-lived, single-use values tying a Strava authorisation to the player who started it.
create table public.strava_oauth_states (
  state uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  return_to text not null,
  created_at timestamptz not null default now()
);

alter table public.strava_connections enable row level security;
alter table public.strava_oauth_states enable row level security;

revoke all on public.strava_connections, public.strava_oauth_states from anon, authenticated;
-- Column-level grant: the token columns are not readable, even for one's own row.
grant select (user_id, athlete_id, athlete_name, connected_at, last_sync_at)
  on public.strava_connections to authenticated;

create policy "strava_connections: read own" on public.strava_connections
  for select to authenticated using (user_id = (select auth.uid()));
-- strava_oauth_states: no policy at all — server only.
