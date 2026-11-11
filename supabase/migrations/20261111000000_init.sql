-- SportMotion — initial schema.
--
-- Security model
--   * The game state is authoritative on the server. Every mutation goes through the
--     `game-command` / `validate-activity` edge functions, which run the same pure reducer as
--     the app (supabase/functions/_shared/game) with the service role.
--   * Players can READ their own rows. They can never INSERT / UPDATE / DELETE balances,
--     activities, buildings or ledgers: there is simply no policy allowing it.
--   * `game_states` holds the full snapshot (source of truth). `balances`, `activities`,
--     `day_ledgers` and `buildings` are projections written by the edge function in the same
--     request, for querying, for support, and for the future "visit a friend's city" feature.

create extension if not exists pgcrypto;

-- ───────────────────────────── profiles ─────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),
  -- Short code shared with friends to be added (feature planned after the MVP).
  friend_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  era smallint not null default 1 check (era between 1 and 4),
  level smallint not null default 1 check (level between 1 and 30),
  plots smallint not null default 1 check (plots between 1 and 9),
  streak_count integer not null default 0 check (streak_count >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  jokers smallint not null default 0 check (jokers between 0 and 2),
  onboarding_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────────── authoritative snapshot ─────────────────────────────

create table public.game_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  -- Optimistic concurrency: the edge function updates "where version = <the one it read>".
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ───────────────────────────── balances ─────────────────────────────

create table public.balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pulses integer not null default 0 check (pulses >= 0),
  xp integer not null default 0 check (xp >= 0),
  wood integer not null default 0 check (wood >= 0),
  stone integer not null default 0 check (stone >= 0),
  water integer not null default 0 check (water >= 0),
  energy integer not null default 0 check (energy >= 0),
  brick integer not null default 0 check (brick >= 0),
  glass integer not null default 0 check (glass >= 0),
  steel integer not null default 0 check (steel >= 0),
  updated_at timestamptz not null default now()
);

-- ───────────────────────────── activities ─────────────────────────────

create table public.activities (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  day date not null,
  type text not null check (
    type in ('walk', 'run', 'strength', 'stretch', 'yoga', 'mobility', 'cycling', 'swimming', 'team_sport')
  ),
  source text not null check (source in ('mock', 'manual', 'healthkit', 'health_connect')),
  started_at timestamptz not null,
  duration_min numeric not null check (duration_min > 0),
  steps integer check (steps >= 0),
  distance_km numeric check (distance_km >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index activities_user_day_idx on public.activities (user_id, day);

-- What each day has paid out (one row per player and per day).
create table public.day_ledgers (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  multiplier numeric not null default 1,
  base_pulses integer not null default 0 check (base_pulses between 0 and 400),
  pulses integer not null default 0 check (pulses between 0 and 1200),
  xp integer not null default 0,
  wood integer not null default 0,
  stone integer not null default 0,
  water integer not null default 0,
  energy integer not null default 0,
  steps integer not null default 0,
  active_minutes integer not null default 0,
  completed boolean not null default false,
  chest text not null default 'none' check (chest in ('none', 'ready', 'opened')),
  primary key (user_id, day)
);

-- ───────────────────────────── buildings ("constructions") ─────────────────────────────

create table public.buildings (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  item_id text not null,
  x integer not null,
  y integer not null,
  rotation smallint not null default 0 check (rotation in (0, 1)),
  -- Rooms and furniture for homes: { "rooms": [...], "furniture": [...] }
  interior jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ───────────────────────────── friends (data model only, no UI in the MVP) ─────────────────────────────

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
-- One relationship per pair, whichever side asked first.
create unique index friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- "Fais 8 000 pas demain" — a quest proposed by a friend.
create table public.friend_quests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  metric text not null check (metric in ('steps', 'active_minutes', 'stretch_minutes')),
  target integer not null check (target > 0),
  day date not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'declined', 'completed', 'expired')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

-- Weekly mini-contest between friends. Ranked on steps or active minutes — never on Pulses.
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  metric text not null check (metric in ('steps', 'active_minutes')),
  week_start date not null,
  status text not null default 'open' check (status in ('open', 'finished')),
  created_at timestamptz not null default now()
);

create table public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- ───────────────────────────── helpers ─────────────────────────────

-- True when the caller and `other` are accepted friends.
create or replace function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = other)
        or (f.addressee_id = auth.uid() and f.requester_id = other)
      )
  );
$$;

-- True when the caller takes part in the challenge (avoids a recursive policy).
create or replace function public.in_challenge(challenge uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.challenge_participants p
    where p.challenge_id = challenge and p.user_id = auth.uid()
  );
$$;

-- Finds a player by friend code without exposing the profiles table.
create or replace function public.find_profile_by_friend_code(code text)
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name from public.profiles p where p.friend_code = upper(code);
$$;

-- Every new account gets its profile and an empty balance.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.balances (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_friend(uuid) from public, anon;
revoke execute on function public.in_challenge(uuid) from public, anon;
revoke execute on function public.find_profile_by_friend_code(text) from public, anon;
grant execute on function public.is_friend(uuid) to authenticated;
grant execute on function public.in_challenge(uuid) to authenticated;
grant execute on function public.find_profile_by_friend_code(text) to authenticated;

-- ───────────────────────────── row level security ─────────────────────────────

alter table public.profiles enable row level security;
alter table public.game_states enable row level security;
alter table public.balances enable row level security;
alter table public.activities enable row level security;
alter table public.day_ledgers enable row level security;
alter table public.buildings enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_quests enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;

-- Table privileges: read-only for players on everything the server computes.
revoke all on public.profiles, public.game_states, public.balances, public.activities,
  public.day_ledgers, public.buildings from anon, authenticated;
grant select on public.profiles, public.game_states, public.balances, public.activities,
  public.day_ledgers, public.buildings to authenticated;
-- The only thing a player edits directly: their display name.
grant update (display_name) on public.profiles to authenticated;

-- Supabase grants everything on new tables by default: start from nothing, then open only
-- the operations a policy below is written for.
revoke all on public.friendships, public.friend_quests, public.challenges,
  public.challenge_participants from anon, authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update on public.friend_quests to authenticated;
grant select, insert on public.challenges to authenticated;
grant select, insert, delete on public.challenge_participants to authenticated;

-- Own data (and, read-only, a friend's profile and city).
create policy "profiles: read own or friends" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_friend(id));
create policy "profiles: rename self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "game_states: read own" on public.game_states
  for select to authenticated using (user_id = (select auth.uid()));

create policy "balances: read own" on public.balances
  for select to authenticated using (user_id = (select auth.uid()));

create policy "activities: read own" on public.activities
  for select to authenticated using (user_id = (select auth.uid()));

create policy "day_ledgers: read own" on public.day_ledgers
  for select to authenticated using (user_id = (select auth.uid()));

create policy "buildings: read own or friends" on public.buildings
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend(user_id));

-- Friendships: both sides see the row; only the requester creates it; only the addressee
-- answers; either side can remove it.
create policy "friendships: read mine" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "friendships: request" on public.friendships
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
create policy "friendships: answer" on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status in ('accepted', 'declined'));
create policy "friendships: remove" on public.friendships
  for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- Friend quests: proposed to an accepted friend; the recipient accepts or declines.
-- ('completed' / 'expired' are set by the server.)
create policy "friend_quests: read mine" on public.friend_quests
  for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));
create policy "friend_quests: propose to a friend" on public.friend_quests
  for insert to authenticated
  with check (
    from_user = (select auth.uid()) and status = 'proposed' and public.is_friend(to_user)
  );
create policy "friend_quests: answer" on public.friend_quests
  for update to authenticated
  using (to_user = (select auth.uid()) and status = 'proposed')
  with check (to_user = (select auth.uid()) and status in ('accepted', 'declined'));

-- Challenges: visible to participants; scores are written by the server only.
create policy "challenges: read mine" on public.challenges
  for select to authenticated
  using (created_by = (select auth.uid()) or public.in_challenge(id));
create policy "challenges: create" on public.challenges
  for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'open');

create policy "challenge_participants: read same challenge" on public.challenge_participants
  for select to authenticated
  using (user_id = (select auth.uid()) or public.in_challenge(challenge_id));
create policy "challenge_participants: join with score 0" on public.challenge_participants
  for insert to authenticated
  with check (user_id = (select auth.uid()) and score = 0);
create policy "challenge_participants: leave" on public.challenge_participants
  for delete to authenticated
  using (user_id = (select auth.uid()));
