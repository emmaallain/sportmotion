// In-memory stand-in for the Supabase client, for the edge function tests.
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

/** Just enough of the PostgREST query builder for the handler. */
export class Query implements PromiseLike<{ data: Row[] | Row | null; error: { code: string } | null }> {
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

export class FakeDb {
  tables: Record<string, Row[]> = { profiles: [{ id: 'user-1' }] };
  keys: Record<string, string[]> = {
    game_states: ['user_id'],
    balances: ['user_id'],
    profiles: ['id'],
    activities: ['user_id', 'id'],
    day_ledgers: ['user_id', 'day'],
    buildings: ['user_id', 'id'],
    strava_connections: ['user_id'],
    strava_oauth_states: ['state'],
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

