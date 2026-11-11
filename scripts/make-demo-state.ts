/** Prints a mid-game save (JSON) produced by the simulation — handy for manual testing. */
import { PROFILES, simulate } from './simulate-economy';

const days = Number(process.argv[2] ?? 30);
const result = simulate(PROFILES.regular!, days);
const state = { ...result.final, onboardingDone: true, days: {} };
process.stdout.write(JSON.stringify(state));
