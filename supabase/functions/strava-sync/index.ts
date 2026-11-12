// See ../_shared/strava.ts
import { handleSync, stravaDeps } from '../_shared/strava.ts';

Deno.serve((req) => {
  const deps = stravaDeps();
  return deps instanceof Response ? deps : handleSync(req, deps);
});
