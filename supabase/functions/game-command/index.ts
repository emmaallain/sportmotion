// POST /functions/v1/game-command
// Body: { "command": GameCommand, "today": "YYYY-MM-DD" }  or  { "action": "reset", "today": … }
//
// Every other mutation (building, selling, crafting, chest, plots, eras…). Spending is
// validated here against the shared catalog, so balances cannot be forged by the client.
import { handle } from '../_shared/handler.ts';

Deno.serve((req) => handle(req));
