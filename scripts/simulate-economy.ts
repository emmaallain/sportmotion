/**
 * Economy balancing simulation.
 *
 * Plays the real game engine day after day with a scripted player and reports how long each
 * era takes. Targets (GAME_DESIGN §2.8): a player who completes every day finishes era 1 in
 * about 2 weeks and era 2 in about 6 weeks.
 *
 *   npm run simulate
 */
import {
  CITY_ITEMS,
  FURNITURE,
  ROOMS,
  getCityItem,
  getFurniture,
  getRecipe,
} from '../src/game/catalog/index';
import type { CityItem, Cost } from '../src/game/catalog/types';
import { MAX_PLOTS, PLOT_SIZE, plotRect } from '../src/game/city/grid';
import { canPlace } from '../src/game/city/placement';
import { canPlaceFurniture } from '../src/game/city/interior';
import { seededRandom } from '../src/game/economy/chest';
import { addDays } from '../src/game/economy/dates';
import { ALL_MATERIALS } from '../src/game/economy/types';
import type { Activity, ActivityType, MaterialId } from '../src/game/economy/types';
import { applyCommand, canAfford } from '../src/game/engine/reducer';
import { selectEraProgress, selectLevel } from '../src/game/engine/selectors';
import { createInitialState } from '../src/game/engine/state';
import type { GameCommand, CommandContext } from '../src/game/engine/commands';
import type { GameState } from '../src/game/engine/state';
import { lockReason } from '../src/game/progression/eras';

export interface PlayerProfile {
  name: string;
  steps: number;
  sportMin: number;
  stretchMin: number;
  /** Sport types the player rotates through, one per day. */
  sports: ActivityType[];
  /** Completes the day only on these weekdays indices (0–6); undefined = every day. */
  restEvery?: number;
}

export const PROFILES: Record<string, PlayerProfile> = {
  /** The reference player of the game design: exactly the three quests, every day. */
  regular: {
    name: 'Régulier (journée complète, sans extra)',
    steps: 5000,
    sportMin: 30,
    stretchMin: 15,
    sports: ['strength', 'cycling'],
  },
  active: {
    name: 'Actif (8 000 pas, 45 min de sport, 20 min de stretching)',
    steps: 8000,
    sportMin: 45,
    stretchMin: 20,
    sports: ['strength', 'run', 'strength', 'swimming'],
  },
  relaxed: {
    name: 'Tranquille (journée complète 6 jours sur 7)',
    steps: 5000,
    sportMin: 30,
    stretchMin: 15,
    sports: ['strength', 'cycling'],
    restEvery: 7,
  },
};

export interface SimulationResult {
  profile: string;
  /** Day number (1-based) on which the Bourg era was reached. */
  era1Days: number | null;
  /** Days spent in the Bourg era before all conditions for the next era are met. */
  era2Days: number | null;
  log: string[];
  final: GameState;
}

const START_DAY = '2026-01-01';

class Sim {
  state = createInitialState();
  seq = 0;
  day = START_DAY;
  rand = seededRandom(7);
  log: string[] = [];

  ctx(): CommandContext {
    return { today: this.day, rand: this.rand };
  }

  send(command: GameCommand): boolean {
    const result = applyCommand(this.state, command, this.ctx());
    if (result.ok) this.state = result.state;
    return result.ok;
  }

  id(prefix: string): string {
    this.seq += 1;
    return `${prefix}${this.seq}`;
  }

  player() {
    return { era: this.state.era, level: selectLevel(this.state).level };
  }

  unlocked(item: CityItem): boolean {
    return lockReason(item, this.player()) === null;
  }

  /** First free spot for an item, scanning plot by plot. */
  findSpot(item: CityItem): { x: number; y: number } | null {
    for (let p = 0; p < this.state.city.plots; p++) {
      const rect = plotRect(p);
      for (let y = rect.y; y < rect.y + PLOT_SIZE; y++) {
        for (let x = rect.x; x < rect.x + PLOT_SIZE; x++) {
          if (canPlace(this.state.city, getCityItem, item, x, y, 0).ok) return { x, y };
        }
      }
    }
    return null;
  }

  /** Crafts the advanced materials missing for `cost`, if the workshop is owned. */
  craftFor(cost: Cost): void {
    for (const material of ['brick', 'glass', 'steel'] as MaterialId[]) {
      const missing = (cost.materials?.[material] ?? 0) - this.state.balances.materials[material];
      if (missing <= 0) continue;
      const recipe = getRecipe(material);
      if (!recipe) continue;
      for (let i = 0; i < missing; i++) {
        if (!this.send({ type: 'craft', recipeId: recipe.id, quantity: 1 })) break;
      }
    }
  }

  buy(itemId: string): boolean {
    const item = getCityItem(itemId);
    if (!item || !this.unlocked(item)) return false;
    this.craftFor(item.cost);
    if (!canAfford(this.state.balances, item.cost)) return false;
    let spot = this.findSpot(item);
    if (!spot && this.state.city.plots < MAX_PLOTS && this.send({ type: 'buy_plot' })) {
      spot = this.findSpot(item);
    }
    if (!spot) return false;
    return this.send({
      type: 'place_item',
      id: this.id('b'),
      itemId,
      x: spot.x,
      y: spot.y,
      rot: 0,
    });
  }

  count(itemId: string): number {
    return this.state.city.items.filter((p) => p.itemId === itemId).length;
  }

  /** Lays a straight road along row 8 of the first two plots (links them once both are owned). */
  layRoad(itemId: string, fromX: number, toX: number): void {
    for (let x = fromX; x <= toX; x++) {
      const taken = this.state.city.items.some((p) => p.x === x && p.y === 8);
      if (!taken) this.send({ type: 'place_item', id: this.id('r'), itemId, x, y: 8, rot: 0 });
    }
  }

  /** Buys what the current era needs, in a sensible order. Returns false while a goal is pending. */
  pursueGoals(): boolean {
    const goals: [string, number][] =
      this.state.era === 1
        ? [
            ['village_house', 1],
            ['field', 1],
            ['vegetable_garden', 1],
            ['chicken_coop', 1],
            ['village_house', 2],
            ['orchard', 1],
            ['barn', 1],
            ['village_house', 3],
          ]
        : [
            ['brickworks', 1],
            ['village_house', 6],
            ['school', 1],
          ];
    if (this.state.era === 1 && this.count('dirt_path') === 0) this.layRoad('dirt_path', 0, 15);
    if (this.state.era === 2) {
      if (this.state.city.plots < 2) this.send({ type: 'buy_plot' });
      if (this.state.city.plots >= 2) this.layRoad('dirt_path', 16, 31);
    }
    for (const [itemId, target] of goals) {
      const item = getCityItem(itemId);
      if (!item) continue;
      while (this.count(itemId) < target) {
        if (!this.unlocked(item)) break;
        if (!this.buy(itemId)) return false;
      }
    }
    return true;
  }

  /** Spends what is left on things that are nice to have: one of each building, rooms, décor. */
  buyExtras(): void {
    const houses = this.state.city.items.filter((p) => (getCityItem(p.itemId)?.maxRooms ?? 0) > 0);
    for (const house of houses) {
      const max = getCityItem(house.itemId)?.maxRooms ?? 0;
      for (const room of ROOMS) {
        const interior = this.state.interiors[house.id];
        if ((interior?.rooms.length ?? 0) >= max) break;
        this.send({ type: 'buy_room', houseId: house.id, room: room.id });
      }
      const interior = this.state.interiors[house.id];
      if (!interior) continue;
      for (const f of FURNITURE) {
        const current = this.state.interiors[house.id];
        if (!current || current.furniture.some((x) => x.furnitureId === f.id)) continue;
        if (!canAfford(this.state.balances, f.cost)) continue;
        search: for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            if (canPlaceFurniture(current, getFurniture, f, x, y, 0).ok) {
              this.send({
                type: 'place_furniture',
                houseId: house.id,
                id: this.id('f'),
                furnitureId: f.id,
                x,
                y,
                rot: 0,
              });
              break search;
            }
          }
        }
      }
    }
    // One of each unlocked building, most valuable first; then décor while it is affordable.
    const candidates = CITY_ITEMS.filter((i) => i.kind !== 'road' && this.unlocked(i)).sort(
      (a, b) => b.cost.pulses - a.cost.pulses,
    );
    for (const item of candidates) {
      if (this.count(item.id) === 0) this.buy(item.id);
    }
    for (const item of candidates) {
      const limit = item.kind === 'decor' ? 8 : 3;
      while (this.count(item.id) < limit && this.buy(item.id)) {
        /* keep buying */
      }
    }
  }

  playDay(profile: PlayerProfile, dayIndex: number): void {
    this.send({ type: 'tick' });
    const rest = profile.restEvery !== undefined && (dayIndex + 1) % profile.restEvery === 0;
    if (!rest) {
      const base = Date.parse(`${this.day}T00:00:00Z`);
      const sport = profile.sports[dayIndex % profile.sports.length] ?? 'strength';
      const activities: Activity[] = [
        {
          id: this.id('a'),
          type: 'walk',
          source: 'mock',
          startMs: base + 8 * 3_600_000,
          durationMin: Math.round(profile.steps / 100),
          steps: profile.steps,
        },
        {
          id: this.id('a'),
          type: sport,
          source: 'mock',
          startMs: base + 12 * 3_600_000,
          durationMin: profile.sportMin,
          steps: sport === 'run' ? profile.sportMin * 160 : undefined,
        },
        {
          id: this.id('a'),
          type: 'stretch',
          source: 'mock',
          startMs: base + 19 * 3_600_000,
          durationMin: profile.stretchMin,
        },
      ];
      for (const activity of activities) this.send({ type: 'add_activity', activity });
      this.send({ type: 'open_chest' });
    }
    const goalsDone = this.pursueGoals();
    if (goalsDone) this.buyExtras();
    this.send({ type: 'advance_era' });
  }
}

export function simulate(profile: PlayerProfile, maxDays = 200): SimulationResult {
  const sim = new Sim();
  sim.send({ type: 'claim_starter_bonus' });
  let era1Days: number | null = null;
  let era2Days: number | null = null;

  for (let d = 0; d < maxDays; d++) {
    sim.day = addDays(START_DAY, d);
    sim.playDay(profile, d);
    const level = selectLevel(sim.state).level;
    if (era1Days === null && sim.state.era >= 2) {
      era1Days = d + 1;
      sim.log.push(`jour ${d + 1} : passage à l'ère Bourg (niveau ${level})`);
    }
    if (era1Days !== null && era2Days === null) {
      const progress = selectEraProgress(sim.state);
      if (progress.status.every((s) => s.done)) {
        era2Days = d + 1 - era1Days;
        sim.log.push(`jour ${d + 1} : conditions de l'ère Ville remplies (niveau ${level})`);
        break;
      }
    }
    if ((d + 1) % 7 === 0) {
      const b = sim.state.balances;
      const mats = ALL_MATERIALS.filter((m) => b.materials[m] > 0)
        .map((m) => `${m} ${b.materials[m]}`)
        .join(', ');
      sim.log.push(
        `jour ${d + 1} : niveau ${level}, série ${sim.state.streak.count}, ${b.pulses} Pulses, ` +
          `${sim.state.city.items.length} éléments, ${sim.state.city.plots} terrain(s) — ${mats}`,
      );
    }
  }
  return { profile: profile.name, era1Days, era2Days, log: sim.log, final: sim.state };
}

function main(): void {
  const verbose = process.argv.includes('--verbose');
  console.log('Simulation de l’économie SportMotion\n');
  console.log('Cibles : ère 1 ≈ 14 jours, ère 2 ≈ 42 jours (joueur « Régulier »)\n');
  for (const profile of Object.values(PROFILES)) {
    const result = simulate(profile);
    console.log(`▸ ${result.profile}`);
    console.log(`    ère 1 (Village) : ${result.era1Days ?? '> 200'} jours`);
    console.log(
      `    ère 2 (Bourg)   : ${result.era2Days ?? '> 200'} jours` +
        (result.era2Days ? ` (${(result.era2Days / 7).toFixed(1)} semaines)` : ''),
    );
    if (verbose) for (const line of result.log) console.log(`      ${line}`);
    console.log('');
  }
}

if (require.main === module) main();
