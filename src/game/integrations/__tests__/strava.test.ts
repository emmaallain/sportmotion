import { seededRandom } from '../../economy/chest';
import { evaluateDay } from '../../economy/day';
import { importStravaActivities, processRequest } from '../../engine/server';
import {
  isAllowedReturnUrl,
  mapStravaSport,
  stravaAuthorizeUrl,
  stravaLocalDay,
  stravaToActivity,
  tokenNeedsRefresh,
} from '../strava';
import type { StravaActivity } from '../strava';

const run = (over: Partial<StravaActivity> = {}): StravaActivity => ({
  id: 101,
  sport_type: 'Run',
  type: 'Run',
  start_date: '2026-06-15T06:00:00Z',
  start_date_local: '2026-06-15T08:00:00Z',
  moving_time: 1800,
  elapsed_time: 1900,
  distance: 5000,
  manual: false,
  ...over,
});
const env = {
  now: Date.parse('2026-06-15T12:00:00Z'),
  rand: seededRandom(1),
  allowMockActivities: false,
};

describe('Strava mapping', () => {
  it('maps sport types, preferring sport_type over the legacy type', () => {
    expect(mapStravaSport('TrailRun')).toBe('run');
    expect(mapStravaSport('GravelRide')).toBe('cycling');
    expect(mapStravaSport('WeightTraining')).toBe('strength');
    expect(mapStravaSport('Yoga')).toBe('yoga');
    expect(mapStravaSport('Sail')).toBeNull();
    expect(mapStravaSport(undefined)).toBeNull();
    expect(stravaToActivity(run({ sport_type: 'TrailRun', type: 'Ride' }))?.type).toBe('run');
    expect(stravaToActivity(run({ sport_type: undefined, type: 'Ride' }))?.type).toBe('cycling');
  });

  it('converts a run with moving time, distance and estimated steps', () => {
    expect(stravaToActivity(run())).toEqual({
      id: 'strava-101',
      type: 'run',
      source: 'strava',
      startMs: Date.parse('2026-06-15T06:00:00Z'),
      durationMin: 30,
      distanceKm: 5,
      steps: 4762,
    });
  });

  it('gives no steps to sports without steps', () => {
    const ride = stravaToActivity(run({ sport_type: 'Ride', distance: 20_000 }));
    expect(ride).not.toHaveProperty('steps');
    expect(ride?.distanceKm).toBe(20);
    expect(stravaToActivity(run({ sport_type: 'Yoga', distance: 0 }))).not.toHaveProperty(
      'distanceKm',
    );
  });

  it('ignores unknown sports and empty activities', () => {
    expect(stravaToActivity(run({ sport_type: 'Sail', type: 'Sail' }))).toBeNull();
    expect(stravaToActivity(run({ moving_time: 0, elapsed_time: 0 }))).toBeNull();
    expect(stravaToActivity(run({ start_date: 'nope' }))).toBeNull();
    expect(stravaToActivity(run({ moving_time: undefined }))?.durationMin).toBe(32);
  });

  it('treats activities typed by hand in Strava as manual entries (50 %)', () => {
    const manual = stravaToActivity(run({ manual: true }));
    expect(manual?.source).toBe('manual');
    expect(manual && evaluateDay([manual]).accepted[0]?.factor).toBe(0.5);
  });

  it('is accepted at full value by the engine, with its plausibility checks', () => {
    const activity = stravaToActivity(run())!;
    const day = evaluateDay([activity]);
    expect(day.rejected).toEqual([]);
    expect(day.accepted[0]?.factor).toBe(1);
    expect(day.quests.sport.done).toBe(true);
    // a "run" at 60 km/h is a car ride
    const car = stravaToActivity(run({ distance: 30_000 }))!;
    expect(evaluateDay([car]).rejected[0]?.reason).toBe('vehicle_speed');
  });

  it('reads the local day from start_date_local', () => {
    expect(stravaLocalDay(run({ start_date_local: '2026-06-14T23:30:00Z' }))).toBe('2026-06-14');
  });
});

describe('importStravaActivities', () => {
  it('adds today’s activities once and ignores other days', () => {
    const list = [
      run(),
      run({
        id: 102,
        sport_type: 'Yoga',
        start_date: '2026-06-15T16:00:00Z',
        start_date_local: '2026-06-15T18:00:00Z',
        moving_time: 1200,
        distance: 0,
      }),
      run({ id: 99, start_date: '2026-06-14T06:00:00Z', start_date_local: '2026-06-14T08:00:00Z' }),
      run({ id: 103, sport_type: 'Sail', type: 'Sail' }),
    ];
    const first = importStravaActivities(null, list, '2026-06-15', env);
    expect(first.added).toBe(2);
    expect(first.state.days['2026-06-15']?.activities.map((a) => a.id).sort()).toEqual([
      'strava-101',
      'strava-102',
    ]);
    expect(first.state.balances.pulses).toBe(50 + 40 + 5);
    expect(first.events.some((e) => e.type === 'quest_completed')).toBe(true);

    const again = importStravaActivities(first.state, list, '2026-06-15', env);
    expect(again).toMatchObject({ added: 0, skipped: 2 });
    expect(again.state.balances.pulses).toBe(first.state.balances.pulses);
  });

  it('keeps the longest of two overlapping activities', () => {
    const list = [
      run({ id: 1, moving_time: 600 }),
      run({ id: 2, moving_time: 3600, distance: 10_000 }),
    ];
    const result = importStravaActivities(null, list, '2026-06-15', env);
    expect(result).toMatchObject({ added: 1, skipped: 1 });
    expect(result.state.days['2026-06-15']?.activities[0]?.id).toBe('strava-2');
  });
});

describe('a device cannot forge the "strava" source', () => {
  it('refuses add_activity commands claiming to come from Strava', () => {
    const res = processRequest(
      null,
      {
        command: { type: 'add_activity', activity: { ...stravaToActivity(run()) } },
        today: '2026-06-15',
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('OAuth helpers', () => {
  it('builds the authorize URL', () => {
    const url = new URL(
      stravaAuthorizeUrl('1234', 'https://x.supabase.co/functions/v1/strava-callback', 'abc'),
    );
    expect(url.origin + url.pathname).toBe('https://www.strava.com/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '1234',
      redirect_uri: 'https://x.supabase.co/functions/v1/strava-callback',
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'activity:read_all',
      state: 'abc',
    });
  });

  it('refreshes tokens shortly before they expire', () => {
    const now = 1_000_000_000_000;
    expect(tokenNeedsRefresh(now / 1000 + 3600, now)).toBe(false);
    expect(tokenNeedsRefresh(now / 1000 + 200, now)).toBe(true);
    expect(tokenNeedsRefresh(now / 1000 - 10, now)).toBe(true);
  });

  it('only redirects back to the app, a local dev server or the configured site', () => {
    const site = 'https://sportmotion.example';
    expect(isAllowedReturnUrl('sportmotion://strava', site)).toBe(true);
    expect(isAllowedReturnUrl('exp://192.168.1.10:8081/--/strava', site)).toBe(true);
    expect(isAllowedReturnUrl('http://localhost:8081/profile', site)).toBe(true);
    expect(isAllowedReturnUrl('https://sportmotion.example/profile', site)).toBe(true);
    expect(isAllowedReturnUrl('https://sportmotion.example.evil.com/', site)).toBe(false);
    expect(isAllowedReturnUrl('https://evil.com/?https://sportmotion.example/', site)).toBe(false);
    expect(isAllowedReturnUrl('http://localhost.evil.com/', site)).toBe(false);
    expect(isAllowedReturnUrl('javascript:alert(1)', site)).toBe(false);
    expect(isAllowedReturnUrl('https://anything.com', undefined)).toBe(false);
    expect(isAllowedReturnUrl(42, site)).toBe(false);
  });
});
