// POST /functions/v1/validate-activity
// Body: { "command": { "type": "add_activity", "activity": {...} }, "today": "YYYY-MM-DD" }
//
// Server-side validation of an activity: plausibility checks, daily caps, quests, streak and
// multiplier are all computed here. The client only displays the returned state.
import { handle } from '../_shared/handler.ts';

Deno.serve((req) => handle(req, { only: ['add_activity'] }));
