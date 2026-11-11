/**
 * Runs the real migration in an embedded Postgres (PGlite) with a minimal stand-in for
 * Supabase's `auth` schema, then checks the row level security rules as a player would
 * experience them.
 *
 *   npm run test:db      (Node's test runner: PGlite cannot run inside Jest's sandbox)
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const ALICE = '00000000-0000-0000-0000-00000000000a';
const BOB = '00000000-0000-0000-0000-00000000000b';
const CAROL = '00000000-0000-0000-0000-00000000000c';

/** What Supabase provides before any migration runs. */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

/** The few Jest-style matchers this file uses, on top of node:assert. */
function expect(actual: unknown) {
  return {
    toEqual: (expected: unknown) => assert.deepEqual(actual, expected),
    toBe: (expected: unknown) => assert.equal(actual, expected),
    toHaveLength: (n: number) => assert.equal((actual as unknown[]).length, n),
    toMatch: (re: RegExp) => assert.match(String(actual), re),
    toBeGreaterThanOrEqual: (n: number) => assert.ok((actual as number) >= n),
    rejects: { toThrow: () => assert.rejects(actual as Promise<unknown>) },
  };
}

let db: PGlite;

/** Runs SQL as a signed-in player (or as the service role when `user` is null). */
async function as<T = Record<string, unknown>>(user: string | null, sql: string): Promise<T[]> {
  await db.exec(
    user
      ? `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`
      : `reset role; select set_config('request.jwt.claim.sub', '', false);`,
  );
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const denied = (user: string, sql: string) => expect(as(user, sql)).rejects.toThrow();

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUB);
  const dir = join(__dirname, '..', 'migrations');
  for (const file of readdirSync(dir).sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'));
  }
  await db.exec(`insert into auth.users (id) values ('${ALICE}'), ('${BOB}'), ('${CAROL}');`);
  // what the edge function would have written with the service role
  await db.exec(`
    update public.balances set pulses = 500, wood = 20 where user_id = '${ALICE}';
    insert into public.game_states (user_id, state) values ('${ALICE}', '{"version":1}');
    insert into public.buildings (user_id, id, item_id, x, y) values ('${ALICE}', 'h1', 'village_house', 4, 4);
    insert into public.activities (user_id, id, day, type, source, started_at, duration_min, steps)
      values ('${ALICE}', 'a1', '2026-06-15', 'walk', 'healthkit', now(), 50, 5000);
    insert into public.day_ledgers (user_id, day, base_pulses, pulses) values ('${ALICE}', '2026-06-15', 50, 50);
  `);
});

afterAll(async () => {
  await db.close();
});

describe('schema', () => {
  it('creates a profile and an empty balance for every new account', async () => {
    const profiles = await as<{ friend_code: string; era: number }>(
      null,
      `select friend_code, era from public.profiles`,
    );
    expect(profiles).toHaveLength(3);
    expect(new Set(profiles.map((p) => p.friend_code)).size).toBe(3);
    expect(profiles[0]?.friend_code).toMatch(/^[0-9A-F]{8}$/);
    const balances = await as(null, `select pulses from public.balances where user_id = '${BOB}'`);
    expect(balances).toEqual([{ pulses: 0 }]);
  });

  it('enables row level security on every table', async () => {
    const rows = await as<{ relname: string; relrowsecurity: boolean }>(
      null,
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });

  it('refuses impossible values', async () => {
    await expect(
      as(null, `update public.balances set pulses = -1 where user_id = '${ALICE}'`),
    ).rejects.toThrow();
    await expect(
      as(
        null,
        `insert into public.day_ledgers (user_id, day, base_pulses) values ('${BOB}', '2026-06-15', 401)`,
      ),
    ).rejects.toThrow();
    await expect(
      as(
        null,
        `insert into public.challenges (created_by, metric, week_start) values ('${ALICE}', 'pulses', '2026-06-15')`,
      ),
    ).rejects.toThrow();
  });
});

describe('row level security — game data', () => {
  it('lets a player read only their own data', async () => {
    expect(await as(ALICE, `select pulses from public.balances`)).toEqual([{ pulses: 500 }]);
    expect(await as(BOB, `select pulses from public.balances`)).toEqual([{ pulses: 0 }]);
    expect(await as(BOB, `select * from public.game_states`)).toEqual([]);
    expect(await as(BOB, `select * from public.activities`)).toEqual([]);
    expect(await as(BOB, `select * from public.day_ledgers`)).toEqual([]);
    expect(await as(BOB, `select * from public.buildings`)).toEqual([]);
    expect(await as(ALICE, `select id from public.buildings`)).toEqual([{ id: 'h1' }]);
  });

  it('never lets a player write balances, state, activities, ledgers or buildings', async () => {
    await denied(ALICE, `update public.balances set pulses = 999999 where user_id = '${ALICE}'`);
    await denied(ALICE, `insert into public.balances (user_id, pulses) values ('${ALICE}', 5)`);
    await denied(ALICE, `delete from public.balances`);
    await denied(ALICE, `update public.game_states set state = '{"balances":{"pulses":1000000}}'`);
    await denied(
      ALICE,
      `insert into public.activities (user_id, id, day, type, source, started_at, duration_min)
       values ('${ALICE}', 'fake', '2026-06-15', 'run', 'healthkit', now(), 300)`,
    );
    await denied(ALICE, `update public.day_ledgers set pulses = 1200`);
    await denied(
      ALICE,
      `insert into public.buildings (user_id, id, item_id, x, y) values ('${ALICE}', 'free', 'school', 1, 1)`,
    );
    await denied(ALICE, `delete from public.buildings`);
    expect(await as(ALICE, `select pulses from public.balances`)).toEqual([{ pulses: 500 }]);
  });

  it('lets a player rename themselves and nothing else on the profile', async () => {
    await as(ALICE, `update public.profiles set display_name = 'Alice' where id = '${ALICE}'`);
    expect(await as(ALICE, `select display_name from public.profiles`)).toEqual([
      { display_name: 'Alice' },
    ]);
    await denied(ALICE, `update public.profiles set era = 4 where id = '${ALICE}'`);
    await denied(ALICE, `update public.profiles set level = 30, streak_count = 365`);
    // renaming someone else silently matches no row
    await as(BOB, `update public.profiles set display_name = 'Hacked' where id = '${ALICE}'`);
    expect(await as(ALICE, `select display_name from public.profiles`)).toEqual([
      { display_name: 'Alice' },
    ]);
  });

  it('gives anonymous (signed-out) callers nothing', async () => {
    await db.exec(`set role anon;`);
    try {
      await expect(db.query(`select * from public.balances`)).rejects.toThrow();
      await expect(db.query(`select * from public.profiles`)).rejects.toThrow();
    } finally {
      await db.exec(`reset role;`);
    }
  });
});

describe('row level security — friends (data model prepared for later)', () => {
  it('finds a player by friend code without exposing the table', async () => {
    const [{ friend_code }] = await as<{ friend_code: string }>(
      null,
      `select friend_code from public.profiles where id = '${ALICE}'`,
    ).then((rows) => rows as [{ friend_code: string }]);
    const found = await as(
      BOB,
      `select id from public.find_profile_by_friend_code('${friend_code.toLowerCase()}')`,
    );
    expect(found).toEqual([{ id: ALICE }]);
    expect(await as(BOB, `select id from public.profiles`)).toEqual([{ id: BOB }]);
  });

  it('runs the friend request flow', async () => {
    // a request must come from yourself and start pending
    await denied(
      BOB,
      `insert into public.friendships (requester_id, addressee_id) values ('${ALICE}', '${BOB}')`,
    );
    await denied(
      BOB,
      `insert into public.friendships (requester_id, addressee_id, status) values ('${BOB}', '${ALICE}', 'accepted')`,
    );
    await as(
      BOB,
      `insert into public.friendships (requester_id, addressee_id) values ('${BOB}', '${ALICE}')`,
    );
    // no duplicate, in either direction
    await denied(
      ALICE,
      `insert into public.friendships (requester_id, addressee_id) values ('${ALICE}', '${BOB}')`,
    );
    // outsiders see nothing; not friends yet → no access to the city
    expect(await as(CAROL, `select * from public.friendships`)).toEqual([]);
    expect(await as(BOB, `select * from public.buildings`)).toEqual([]);
    // the requester cannot accept their own request
    await as(BOB, `update public.friendships set status = 'accepted'`);
    expect(await as(BOB, `select status from public.friendships`)).toEqual([{ status: 'pending' }]);
    // the addressee accepts
    await as(ALICE, `update public.friendships set status = 'accepted', responded_at = now()`);
    expect(await as(BOB, `select status from public.friendships`)).toEqual([
      { status: 'accepted' },
    ]);
  });

  it('lets friends visit a city read-only, and nobody else', async () => {
    expect(await as(BOB, `select id from public.buildings`)).toEqual([{ id: 'h1' }]);
    expect(await as(BOB, `select id from public.profiles order by id`)).toEqual([
      { id: ALICE },
      { id: BOB },
    ]);
    expect(await as(CAROL, `select id from public.buildings`)).toEqual([]);
    await denied(BOB, `delete from public.buildings`);
    // friendship does not open balances or activities
    expect(await as(BOB, `select * from public.activities`)).toEqual([]);
    expect(await as(BOB, `select pulses from public.balances`)).toEqual([{ pulses: 0 }]);
  });

  it('only lets friends propose quests, and only the recipient answer', async () => {
    await denied(
      CAROL,
      `insert into public.friend_quests (from_user, to_user, metric, target, day)
       values ('${CAROL}', '${ALICE}', 'steps', 8000, '2026-06-16')`,
    );
    await as(
      BOB,
      `insert into public.friend_quests (from_user, to_user, metric, target, day)
       values ('${BOB}', '${ALICE}', 'steps', 8000, '2026-06-16')`,
    );
    await as(BOB, `update public.friend_quests set status = 'accepted'`);
    expect(await as(ALICE, `select status from public.friend_quests`)).toEqual([
      { status: 'proposed' },
    ]);
    await as(ALICE, `update public.friend_quests set status = 'accepted'`);
    expect(await as(BOB, `select status from public.friend_quests`)).toEqual([
      { status: 'accepted' },
    ]);
    // a player cannot mark a quest completed themselves
    await as(ALICE, `update public.friend_quests set status = 'completed'`);
    expect(await as(ALICE, `select status from public.friend_quests`)).toEqual([
      { status: 'accepted' },
    ]);
    expect(await as(CAROL, `select * from public.friend_quests`)).toEqual([]);
  });

  it('keeps challenge scores server-side', async () => {
    const [{ id }] = (await as<{ id: string }>(
      ALICE,
      `insert into public.challenges (created_by, metric, week_start)
       values ('${ALICE}', 'steps', '2026-06-15') returning id`,
    )) as [{ id: string }];
    await as(
      ALICE,
      `insert into public.challenge_participants (challenge_id, user_id) values ('${id}', '${ALICE}')`,
    );
    await as(
      BOB,
      `insert into public.challenge_participants (challenge_id, user_id) values ('${id}', '${BOB}')`,
    );
    await denied(
      CAROL,
      `insert into public.challenge_participants (challenge_id, user_id, score) values ('${id}', '${CAROL}', 99999)`,
    );
    await denied(BOB, `update public.challenge_participants set score = 99999`);
    expect(
      await as(BOB, `select user_id from public.challenge_participants order by user_id`),
    ).toEqual([{ user_id: ALICE }, { user_id: BOB }]);
    expect(await as(CAROL, `select * from public.challenge_participants`)).toEqual([]);
    expect(await as(CAROL, `select * from public.challenges`)).toEqual([]);
  });
});
