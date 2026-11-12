// See ../_shared/strava.ts
import { handleConnect, stravaDeps } from '../_shared/strava.ts';

Deno.serve((req) => {
  const deps = stravaDeps();
  return deps instanceof Response ? deps : handleConnect(req, deps);
});
