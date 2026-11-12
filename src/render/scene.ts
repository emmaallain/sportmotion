import { getCityItem, getFurniture } from '@/game/catalog';
import type { RoomType } from '@/game/catalog';
import {
  INTERIOR_SIZE,
  MAX_PLOTS,
  PLOT_SIZE,
  ROOM_ORIGINS,
  ROOM_SIZE,
  footprint,
  ownedPlots,
  plotRect,
  tileKey,
} from '@/game/city';
import type { CityState, Interior, Rotation } from '@/game/city';

import { IsoPen, alpha, shade } from './draw';
import type { DrawOp } from './draw';
import { depthOrder } from './iso';
import { GROUND, citySprite, furnitureSprite } from './sprites';

/** Ground of the owned plots: grass with a subtle checker so tiles can be counted. */
function groundOps(plots: number): DrawOp[] {
  const pen = new IsoPen();
  for (const plot of ownedPlots(plots)) {
    pen.tile(
      plot.x - 0.15,
      plot.y - 0.15,
      plot.x + plot.size + 0.15,
      plot.y + plot.size + 0.15,
      -0.02,
      GROUND.plotEdge,
    );
    pen.tile(plot.x, plot.y, plot.x + plot.size, plot.y + plot.size, 0, GROUND.grass);
    for (let x = 0; x < plot.size; x++) {
      for (let y = (x + 1) % 2; y < plot.size; y += 2) {
        pen.tile(plot.x + x, plot.y + y, plot.x + x + 1, plot.y + y + 1, 0, GROUND.grassAlt);
      }
    }
  }
  return pen.ops;
}

/** Outline of the next plot that can be bought. */
function nextPlotOps(plots: number): DrawOp[] {
  if (plots >= MAX_PLOTS) return [];
  const plot = plotRect(plots);
  const pen = new IsoPen();
  pen.tile(
    plot.x + 0.3,
    plot.y + 0.3,
    plot.x + plot.size - 0.3,
    plot.y + plot.size - 0.3,
    0,
    alpha('#FFFFFF', 0.22),
    alpha('#FFFFFF', 0.85),
  );
  const cx = plot.x + plot.size / 2;
  const cy = plot.y + plot.size / 2;
  pen.line([cx - 1.5, cy, 0], [cx + 1.5, cy, 0], alpha('#FFFFFF', 0.9), 5);
  pen.line([cx, cy - 1.5, 0], [cx, cy + 1.5, 0], alpha('#FFFFFF', 0.9), 5);
  return pen.ops;
}

export interface CitySceneOptions {
  /** Placed item left out of the scene (it is being moved and drawn as a ghost). */
  hiddenId?: string | null;
  showNextPlot?: boolean;
}

/** Every draw operation of the city, back to front. */
export function buildCityScene(city: CityState, options: CitySceneOptions = {}): DrawOp[] {
  const ops: DrawOp[] = groundOps(city.plots);
  if (options.showNextPlot) ops.push(...nextPlotOps(city.plots));

  const roads = new Set<string>();
  for (const placed of city.items) {
    if (getCityItem(placed.itemId)?.kind === 'road') roads.add(tileKey(placed.x, placed.y));
  }

  const standing: { ops: DrawOp[]; x: number; y: number; w: number; h: number }[] = [];
  for (const placed of city.items) {
    if (placed.id === options.hiddenId) continue;
    const item = getCityItem(placed.itemId);
    if (!item) continue;
    const [w, h] = footprint(item.size, placed.rot);
    if (item.kind === 'road') {
      // roads are flat: they go straight onto the ground layer
      ops.push(
        ...citySprite(item.sprite, 1, 1, placed.x, placed.y, {
          roads: {
            xp: roads.has(tileKey(placed.x + 1, placed.y)),
            xm: roads.has(tileKey(placed.x - 1, placed.y)),
            yp: roads.has(tileKey(placed.x, placed.y + 1)),
            ym: roads.has(tileKey(placed.x, placed.y - 1)),
          },
        }),
      );
    } else {
      standing.push({
        ops: citySprite(item.sprite, w, h, placed.x, placed.y),
        x: placed.x,
        y: placed.y,
        w,
        h,
      });
    }
  }
  for (const index of depthOrder(standing)) ops.push(...(standing[index]?.ops ?? []));
  return ops;
}

/** Translucent footprint: green when the spot is valid, red otherwise. */
export function footprintOps(x: number, y: number, w: number, h: number, valid: boolean): DrawOp[] {
  const color = valid ? '#4F9A4B' : '#C2473D';
  // slightly larger than the footprint so it stays visible around the sprite
  const g = 0.14;
  return new IsoPen().tile(x - g, y - g, x + w + g, y + h + g, 0.02, alpha(color, 0.5), color).ops;
}

/** Small bubble floating above a building whose harvest is ready. */
export function harvestBadgeOps(
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): DrawOp[] {
  const pen = new IsoPen();
  const at = [x + w / 2, y + h / 2, 1.55] as const;
  pen.line([at[0], at[1], 1.15], at, '#FFFFFF', 3);
  pen.ellipse(at, 13, 13, '#FFFFFF', '#3B6340');
  pen.ellipse(at, 8, 8, color);
  return pen.ops;
}

export function selectionOps(x: number, y: number, w: number, h: number): DrawOp[] {
  const pen = new IsoPen();
  pen.tile(x - 0.06, y - 0.06, x + w + 0.06, y + h + 0.06, 0.02, alpha('#FFFFFF', 0.28), '#FFFFFF');
  return pen.ops;
}

export function ghostOps(
  spriteId: string,
  size: readonly [number, number],
  x: number,
  y: number,
  rot: Rotation,
  valid: boolean,
): DrawOp[] {
  const [w, h] = footprint(size, rot);
  return [...footprintOps(x, y, w, h, valid), ...citySprite(spriteId, w, h, x, y)];
}

// ───────────────────────────── interiors ─────────────────────────────

const FLOORS: Record<RoomType, [string, string]> = {
  living_room: ['#C9A57A', '#BF9A6E'],
  kitchen: ['#E4DCCB', '#CFC6B2'],
  bedroom: ['#B9C7B0', '#AEBDA5'],
  bathroom: ['#BFD9E2', '#A9CBD6'],
};

const WALLS: Record<RoomType, string> = {
  living_room: '#EFE3CC',
  kitchen: '#F1E9D2',
  bedroom: '#E3E7D6',
  bathroom: '#DCEAEE',
};

export function buildInteriorScene(interior: Interior, maxRooms: number): DrawOp[] {
  const pen = new IsoPen();
  const wallH = 1.5;
  // slab
  pen.box(-0.2, -0.2, INTERIOR_SIZE + 0.2, INTERIOR_SIZE + 0.2, -0.25, 0, '#8A8172', '#9A9182');

  ROOM_ORIGINS.forEach(([ox, oy], index) => {
    const room = interior.rooms[index];
    if (!room) {
      const available = index < maxRooms;
      pen.tile(
        ox,
        oy,
        ox + ROOM_SIZE,
        oy + ROOM_SIZE,
        0,
        available ? '#B5AD9D' : '#9C9486',
        '#8A8172',
      );
      if (available) {
        const cx = ox + ROOM_SIZE / 2;
        const cy = oy + ROOM_SIZE / 2;
        pen.line([cx - 0.5, cy, 0.01], [cx + 0.5, cy, 0.01], alpha('#FFFFFF', 0.8), 4);
        pen.line([cx, cy - 0.5, 0.01], [cx, cy + 0.5, 0.01], alpha('#FFFFFF', 0.8), 4);
      }
      return;
    }
    const [a, b] = FLOORS[room];
    for (let x = 0; x < ROOM_SIZE; x++) {
      for (let y = 0; y < ROOM_SIZE; y++) {
        pen.tile(ox + x, oy + y, ox + x + 1, oy + y + 1, 0, (x + y) % 2 ? a : b);
      }
    }
    pen.tile(ox, oy, ox + ROOM_SIZE, oy + ROOM_SIZE, 0.001, '#00000000', shade(a, 0.75));
    // back walls only where the room touches the outside of the house
    const wall = WALLS[room];
    if (oy === 0) {
      pen.poly(
        [
          [ox, 0, 0],
          [ox + ROOM_SIZE, 0, 0],
          [ox + ROOM_SIZE, 0, wallH],
          [ox, 0, wallH],
        ],
        wall,
        shade(wall, 0.8),
      );
      pen.onLeftWall(0, ox + 1.4, ox + 2.6, 0.55, 1.15, '#9CC4D4');
    }
    if (ox === 0) {
      pen.poly(
        [
          [0, oy, 0],
          [0, oy + ROOM_SIZE, 0],
          [0, oy + ROOM_SIZE, wallH],
          [0, oy, wallH],
        ],
        shade(wall, 0.9),
        shade(wall, 0.75),
      );
      pen.onRightWall(0, oy + 1.4, oy + 2.6, 0.55, 1.15, shade('#9CC4D4', 0.9));
    }
  });

  const ops = pen.ops;
  const pieces: { ops: DrawOp[]; x: number; y: number; w: number; h: number; flat: boolean }[] = [];
  for (const placed of interior.furniture) {
    const item = getFurniture(placed.furnitureId);
    if (!item) continue;
    const [w, h] = footprint(item.size, placed.rot);
    pieces.push({
      ops: furnitureSprite(item.sprite, w, h, placed.x, placed.y),
      x: placed.x,
      y: placed.y,
      w,
      h,
      flat: item.id === 'rug',
    });
  }
  for (const piece of pieces) if (piece.flat) ops.push(...piece.ops);
  const standing = pieces.filter((p) => !p.flat);
  for (const index of depthOrder(standing)) ops.push(...(standing[index]?.ops ?? []));
  return ops;
}

export function furnitureGhostOps(
  spriteId: string,
  size: readonly [number, number],
  x: number,
  y: number,
  rot: Rotation,
  valid: boolean,
): DrawOp[] {
  const [w, h] = footprint(size, rot);
  return [...footprintOps(x, y, w, h, valid), ...furnitureSprite(spriteId, w, h, x, y)];
}

/** Initial framing: the middle of the first plot, close enough to read the buildings. */
export const CITY_VIEW = { x: 3, y: 3, w: PLOT_SIZE - 6, h: PLOT_SIZE - 6 };
export const INTERIOR_VIEW = { x: 0, y: 0, w: INTERIOR_SIZE, h: INTERIOR_SIZE };
