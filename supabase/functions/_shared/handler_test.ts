// Integration tests of the edge handler against an in-memory stand-in for Supabase.
//   deno test --allow-env supabase/functions/_shared/handler_test.ts
import { FakeDb } from './fake_supabase.ts';
import { handle } from './handler.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message = ''): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`);
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
