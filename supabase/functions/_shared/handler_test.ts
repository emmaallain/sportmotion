// Integration tests of the edge handler against an in-memory stand-in for Supabase.
//   deno test --allow-env supabase/functions/_shared/handler_test.ts
import type { SupabaseClient } from '@supabase/supabase-js';

import { handle } from './handler.ts';

type Row = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message = ''): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`);
}

/** Just enough of the PostgREST query builder for the handler. */
class Query implements PromiseLike<{ data: Row[] | Row | null; error: { code: string } | null }> {
  private filters: [string, unknown][] = [];
  private inFilter: [string, unknown[]] | null = null;
  private single = false;
  private returning = false;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
    private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select',
    private payload: Row | Row[] | null = null,
  ) {}

  select(_columns?: string) {
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[]) {
    this.op = 'upsert';
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.inFilter = [column, values];
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private matches(row: Row): boolean {
    return (
      this.filters.every(([c, v]) => row[c] === v) &&
      (!this.inFilter || this.inFilter[1].includes(row[this.inFilter[0]]))
    );
  }

  private run(): { data: Row[] | Row | null; error: { code: string } | null } {
    const rows = (this.db.tables[this.table] ??= []);
    const keys = this.db.keys[this.table] ?? ['id'];
    const sameKey = (a: Row, b: Row) => keys.every((k) => a[k] === b[k]);
    const list = (p: Row | Row[] | null) => (Array.isArray(p) ? p : p ? [p] : []);
    switch (this.op) {
      case 'select': {
        // like the real API, a read returns copies, never the stored rows
        const found = structuredClone(rows.filter((r) => this.matches(r)));
        return { data: this.single ? (found[0] ?? null) : found, error: null };
      }
      case 'insert':
        for (const row of list(this.payload)) {
          if (rows.some((r) => sameKey(r, row))) return { data: null, error: { code: '23505' } };
          rows.push({ ...row });
        }
        return { data: null, error: null };
      case 'upsert':
        for (const row of list(this.payload)) {
          const existing = rows.find((r) => sameKey(r, row));
          if (existing) Object.assign(existing, row);
          else rows.push({ ...row });
        }
        return { data: null, error: null };
      case 'update': {
        this.db.beforeUpdate?.(this.table);
        const found = rows.filter((r) => this.matches(r));
        for (const row of found) Object.assign(row, this.payload);
        return { data: this.returning ? found : null, error: null };
      }
      case 'delete':
        this.db.tables[this.table] = rows.filter((r) => !this.matches(r));
        return { data: null, error: null };
    }
  }

  then<A, B>(
    resolve?: ((value: ReturnType<Query['run']>) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}

class FakeDb {
  tables: Record<string, Row[]> = { profiles: [{ id: 'user-1' }] };
  keys: Record<string, string[]> = {
    game_states: ['user_id'],
    balances: ['user_id'],
    profiles: ['id'],
    activities: ['user_id', 'id'],
    day_ledgers: ['user_id', 'day'],
    buildings: ['user_id', 'id'],
  };
  beforeUpdate?: (table: string) => void;

  client(): SupabaseClient {
    return {
      from: (table: string) => new Query(this, table),
      auth: {
        getUser: (token: string) =>
          Promise.resolve(
            token === 'good-token'
              ? { data: { user: { id: 'user-1' } }, error: null }
              : { data: { user: null }, error: { message: 'invalid' } },
          ),
      },
    } as unknown as SupabaseClient;
  }
}

const today = new Date().toISOString().slice(0, 10);

function post(body: unknown, token = 'good-token'): Request {
  return new Request('http://localhost/functions/v1/game-command', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const walk = (id: string, source = 'healthkit') => ({
  command: {
    type: 'add_activity',
    activity: { id, type: 'walk', source, startMs: Date.now() - 3_600_000, durationMin: 50, steps: 5000 },
  },
  today,
});

Deno.test('rejects callers without a valid session', async () => {
  const db = new FakeDb();
  const res = await handle(post({ command: { type: 'tick' }, today }, 'forged'), { admin: db.client() });
  assertEquals(res.status, 401);
  assertEquals(db.tables.game_states, undefined);
});

Deno.test('answers CORS preflight and refuses other methods', async () => {
  const db = new FakeDb();
  const preflight = await handle(new Request('http://localhost/', { method: 'OPTIONS' }), { admin: db.client() });
  assertEquals(preflight.status, 200);
  const get = await handle(new Request('http://localhost/', { method: 'GET' }), { admin: db.client() });
  assertEquals(get.status, 405);
  const garbage = await handle(post('{not json'), { admin: db.client() });
  assertEquals(garbage.status, 400);
});

Deno.test('creates the game, computes gains server-side and projects the read model', async () => {
  const db = new FakeDb();
  const res = await handle(post(walk('w1')), { admin: db.client(), only: ['add_activity'] });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.state.balances.pulses, 50);

  assertEquals(db.tables.game_states?.length, 1);
  assertEquals(db.tables.game_states?.[0]?.version, 1);
  assertEquals(db.tables.balances?.[0]?.pulses, 50);
  assertEquals(db.tables.balances?.[0]?.wood, 5);
  assertEquals(db.tables.activities?.length, 1);
  assertEquals(db.tables.activities?.[0]?.steps, 5000);
  assertEquals(db.tables.day_ledgers?.[0]?.base_pulses, 50);
  assertEquals(db.tables.day_ledgers?.[0]?.steps, 5000);
  assertEquals(db.tables.profiles?.[0]?.level, 1);

  // the same activity again is refused and nothing changes
  const again = await handle(post(walk('w1')), { admin: db.client() });
  assertEquals(again.status, 422);
  assertEquals(db.tables.game_states?.[0]?.version, 1);
  assertEquals(db.tables.balances?.[0]?.pulses, 50);
});

Deno.test('validate-activity only accepts activities', async () => {
  const db = new FakeDb();
  const res = await handle(post({ command: { type: 'claim_starter_bonus' }, today }), {
    admin: db.client(),
    only: ['add_activity'],
  });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error.code, 'command_not_allowed');
});

Deno.test('refuses simulated activities unless ALLOW_MOCK_ACTIVITIES is set', async () => {
  const db = new FakeDb();
  Deno.env.delete('ALLOW_MOCK_ACTIVITIES');
  const refused = await handle(post(walk('m1', 'mock')), { admin: db.client() });
  assertEquals(refused.status, 422);
  Deno.env.set('ALLOW_MOCK_ACTIVITIES', 'true');
  const allowed = await handle(post(walk('m1', 'mock')), { admin: db.client() });
  assertEquals(allowed.status, 200);
  Deno.env.delete('ALLOW_MOCK_ACTIVITIES');
});

Deno.test('spending is validated on the server and buildings are projected', async () => {
  const db = new FakeDb();
  const send = (command: unknown) => handle(post({ command, today }), { admin: db.client() });

  const house = { type: 'place_item', id: 'h1', itemId: 'village_house', x: 4, y: 4, rot: 0 };
  assertEquals((await send(house)).status, 422); // no money yet

  assertEquals((await send({ type: 'claim_starter_bonus' })).status, 200);
  assertEquals((await send(house)).status, 200);
  assertEquals(db.tables.balances?.[0]?.pulses, 50);
  assertEquals(db.tables.buildings?.length, 1);
  assertEquals(db.tables.buildings?.[0]?.item_id, 'village_house');

  assertEquals((await send({ type: 'move_item', id: 'h1', x: 6, y: 6, rot: 0 })).status, 200);
  assertEquals(db.tables.buildings?.[0]?.x, 6);

  assertEquals((await send({ type: 'sell_item', id: 'h1' })).status, 200);
  assertEquals(db.tables.buildings?.length, 0);
  assertEquals(db.tables.balances?.[0]?.pulses, 125);
  assertEquals(db.tables.game_states?.[0]?.version, 4);
});

Deno.test('retries when another request wrote in between (optimistic lock)', async () => {
  const db = new FakeDb();
  await handle(post({ command: { type: 'claim_starter_bonus' }, today }), { admin: db.client() });
  let interfered = false;
  db.beforeUpdate = (table) => {
    if (table === 'game_states' && !interfered) {
      interfered = true;
      const row = db.tables.game_states?.[0];
      assert(row, 'row exists');
      row.version = (row.version as number) + 1; // a concurrent write
    }
  };
  const res = await handle(post(walk('w9')), { admin: db.client() });
  assertEquals(res.status, 200);
  assert(interfered, 'the concurrent write happened');
  assertEquals(db.tables.game_states?.[0]?.version, 3);
  assertEquals(db.tables.balances?.[0]?.pulses, 250);
});

Deno.test('reset starts a new game and clears the read model', async () => {
  const db = new FakeDb();
  const send = (body: unknown) => handle(post(body), { admin: db.client() });
  await send({ command: { type: 'claim_starter_bonus' }, today });
  await send({
    command: { type: 'place_item', id: 'h1', itemId: 'village_house', x: 4, y: 4, rot: 0 },
    today,
  });
  const res = await send({ action: 'reset', today });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).state.balances.pulses, 0);
  assertEquals(db.tables.buildings?.length, 0);
  assertEquals(db.tables.balances?.[0]?.pulses, 0);
});
