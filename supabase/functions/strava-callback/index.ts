// See ../_shared/strava.ts
import { handleCallback, stravaDeps } from '../_shared/strava.ts';

Deno.serve((req) => {
  const deps = stravaDeps();
  return deps instanceof Response ? deps : handleCallback(req, deps);
});
