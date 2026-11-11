import { IsoPen, alpha, shade } from './draw';
import type { DrawOp } from './draw';

/**
 * Procedural sprites. No bitmap assets: every building, tree and piece of furniture is
 * described with a few isometric boxes and roofs, in a soft, natural palette.
 */
export interface SpriteContext {
  /** Which of the 4 neighbouring tiles hold a road (roads only). */
  roads?: { xp: boolean; xm: boolean; yp: boolean; ym: boolean };
}

type Sprite = (pen: IsoPen, w: number, h: number, ctx: SpriteContext) => void;

const C = {
  grass: '#8DB667',
  grassDark: '#7FA95C',
  soil: '#8A6444',
  soilDark: '#75523A',
  crop: '#C9B458',
  leaf: '#5E9448',
  leafDark: '#4A7B3C',
  pine: '#3F6E4A',
  trunk: '#7A5536',
  wood: '#A9794A',
  woodDark: '#8B5E3A',
  plaster: '#EADFC8',
  plasterWarm: '#E8D2A6',
  stone: '#A9A79E',
  stoneDark: '#8C8A82',
  brick: '#B5654A',
  tile: '#A8523A',
  slate: '#5F6B78',
  thatch: '#C2A25E',
  barn: '#9C4234',
  white: '#F4F1E8',
  glass: '#9CC4D4',
  door: '#6B4630',
  water: '#6FA9CF',
  waterLight: '#9CC9E2',
  dirt: '#B89468',
  dirtDark: '#A5825A',
  asphalt: '#6A6C70',
  asphaltLine: '#E6DFA8',
  metal: '#7C8791',
  hay: '#D9BC5C',
  red: '#C0504A',
  yellow: '#E2B93B',
  green: '#5B9460',
  pitch: '#6FAE5C',
  pitchLight: '#7DBB69',
  concrete: '#C9C5BA',
} as const;

// ───────────────────────────── helpers ─────────────────────────────

function windowsLeft(pen: IsoPen, y: number, x0: number, x1: number, z: number, n: number) {
  const span = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const c = x0 + span * (i + 0.5);
    pen.onLeftWall(y, c - 0.13, c + 0.13, z, z + 0.28, C.white);
    pen.onLeftWall(y, c - 0.1, c + 0.1, z + 0.03, z + 0.25, C.glass);
  }
}

function windowsRight(pen: IsoPen, x: number, y0: number, y1: number, z: number, n: number) {
  const span = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const c = y0 + span * (i + 0.5);
    pen.onRightWall(x, c - 0.13, c + 0.13, z, z + 0.28, shade(C.white, 0.85));
    pen.onRightWall(x, c - 0.1, c + 0.1, z + 0.03, z + 0.25, shade(C.glass, 0.8));
  }
}

interface BuildingOptions {
  wall: string;
  roof: string;
  floors?: number;
  roofType?: 'gable' | 'hip' | 'flat';
  rise?: number;
  inset?: number;
  chimney?: boolean;
  door?: string;
  /** Coloured band above the ground floor (shop awning). */
  awning?: string;
  trim?: string;
}

const FLOOR_H = 0.62;

/** A generic house-like building filling its footprint. Returns its wall height. */
function building(pen: IsoPen, w: number, h: number, o: BuildingOptions): number {
  const inset = o.inset ?? 0.16;
  const floors = o.floors ?? 1;
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const wallH = floors * FLOOR_H + 0.08;
  const alongX = w >= h;

  pen.shadow(x0, y0, x1, y1);
  pen.box(x0, y0, x1, y1, 0, wallH, o.wall);
  if (o.trim) {
    pen.onLeftWall(y1, x0, x1, 0, 0.08, o.trim);
    pen.onRightWall(x1, y0, y1, 0, 0.08, shade(o.trim, 0.8));
  }

  const nLeft = Math.max(1, Math.round((x1 - x0) * 1.4));
  const nRight = Math.max(1, Math.round((y1 - y0) * 1.4));
  for (let f = 0; f < floors; f++) {
    const z = f * FLOOR_H + 0.22;
    if (f === 0) {
      // ground floor: a door in the middle of the longest visible wall
      const door = o.door ?? C.door;
      if (alongX) {
        const c = (x0 + x1) / 2;
        pen.onLeftWall(y1, c - 0.14, c + 0.14, 0, 0.42, door);
        if (nLeft > 1) {
          windowsLeft(pen, y1, x0, c - 0.14, z, Math.max(1, Math.floor(nLeft / 2)));
          windowsLeft(pen, y1, c + 0.14, x1, z, Math.max(1, Math.floor(nLeft / 2)));
        }
        windowsRight(pen, x1, y0, y1, z, nRight);
      } else {
        const c = (y0 + y1) / 2;
        pen.onRightWall(x1, c - 0.14, c + 0.14, 0, 0.42, shade(door, 0.8));
        if (nRight > 1) {
          windowsRight(pen, x1, y0, c - 0.14, z, Math.max(1, Math.floor(nRight / 2)));
          windowsRight(pen, x1, c + 0.14, y1, z, Math.max(1, Math.floor(nRight / 2)));
        }
        windowsLeft(pen, y1, x0, x1, z, nLeft);
      }
    } else {
      windowsLeft(pen, y1, x0, x1, z, nLeft);
      windowsRight(pen, x1, y0, y1, z, nRight);
    }
  }
  if (o.awning) {
    const z = FLOOR_H - 0.04;
    pen.poly(
      [
        [x0, y1, z + 0.12],
        [x1, y1, z + 0.12],
        [x1, y1 + 0.22, z - 0.02],
        [x0, y1 + 0.22, z - 0.02],
      ],
      o.awning,
    );
    pen.poly(
      [
        [x1, y0, z + 0.12],
        [x1, y1, z + 0.12],
        [x1 + 0.22, y1, z - 0.02],
        [x1 + 0.22, y0, z - 0.02],
      ],
      shade(o.awning, 0.8),
    );
  }

  const over = 0.07;
  const rise = o.rise ?? 0.5;
  const type = o.roofType ?? 'gable';
  if (type === 'gable') {
    pen.gable(
      x0 - over,
      y0 - over,
      x1 + over,
      y1 + over,
      wallH,
      rise,
      o.roof,
      alongX ? 'x' : 'y',
      o.wall,
    );
  } else if (type === 'hip') {
    pen.hip(x0 - over, y0 - over, x1 + over, y1 + over, wallH, rise, o.roof);
  } else {
    pen.box(x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, wallH, wallH + 0.08, o.roof);
  }
  if (o.chimney) {
    const cx = x0 + (x1 - x0) * 0.28;
    const cy = y0 + (y1 - y0) * 0.3;
    pen.box(cx, cy, cx + 0.16, cy + 0.16, wallH + rise * 0.3, wallH + rise + 0.12, C.brick);
  }
  return wallH;
}

function tree(pen: IsoPen, x: number, y: number, scale = 1, leaf: string = C.leaf): void {
  pen.ellipse([x + 0.08, y + 0.08, 0], 15 * scale, 7 * scale, '#1e2a1a2e');
  pen.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, 0, 0.45 * scale, C.trunk);
  pen.ellipse([x, y, 0.62 * scale], 17 * scale, 14 * scale, shade(leaf, 0.82));
  pen.ellipse([x - 0.08, y - 0.02, 0.86 * scale], 14 * scale, 12 * scale, leaf);
  pen.ellipse([x + 0.03, y - 0.1, 1.08 * scale], 10 * scale, 9 * scale, shade(leaf, 1.18));
}

function pine(pen: IsoPen, x: number, y: number, scale = 1): void {
  pen.ellipse([x + 0.08, y + 0.08, 0], 13 * scale, 6 * scale, '#1e2a1a2e');
  pen.box(x - 0.04, y - 0.04, x + 0.04, y + 0.04, 0, 0.3 * scale, C.trunk);
  for (let i = 0; i < 3; i++) {
    const z = (0.25 + i * 0.38) * scale;
    const r = (0.34 - i * 0.08) * scale;
    pen.hip(x - r, y - r, x + r, y + r, z, 0.6 * scale, i % 2 ? shade(C.pine, 1.12) : C.pine);
  }
}

function ground(pen: IsoPen, w: number, h: number, color: string, inset = 0.04): void {
  pen.tile(inset, inset, w - inset, h - inset, 0.01, color, shade(color, 0.85));
}

function fenceRun(pen: IsoPen, a: [number, number], b: [number, number], color: string = C.wood) {
  const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 3));
  for (let i = 0; i <= steps; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / steps;
    const y = a[1] + ((b[1] - a[1]) * i) / steps;
    pen.line([x, y, 0], [x, y, 0.3], shade(color, 0.85), 2.5);
  }
  pen.line([a[0], a[1], 0.24], [b[0], b[1], 0.24], color, 2);
  pen.line([a[0], a[1], 0.12], [b[0], b[1], 0.12], color, 2);
}

function dots(pen: IsoPen, w: number, h: number, colors: string[], count: number, z = 0.06) {
  // deterministic scatter (golden-angle like) so sprites never flicker between renders
  for (let i = 0; i < count; i++) {
    const x = 0.15 + ((i * 0.618) % 1) * (w - 0.3);
    const y = 0.15 + ((i * 0.381 + 0.27) % 1) * (h - 0.3);
    pen.ellipse([x, y, z], 3, 2.4, colors[i % colors.length] as string);
  }
}

function road(color: string, edge: string, line?: string): Sprite {
  return (pen, _w, _h, ctx) => {
    pen.tile(0, 0, 1, 1, 0.005, color, edge);
    if (!line) {
      dots(pen, 1, 1, [shade(color, 0.9), shade(color, 1.1)], 5, 0.01);
      return;
    }
    const r = ctx.roads ?? { xp: true, xm: true, yp: false, ym: false };
    const any = r.xp || r.xm || r.yp || r.ym;
    const dash = (a: [number, number], b: [number, number]) =>
      pen.line([a[0], a[1], 0.01], [b[0], b[1], 0.01], line, 1.6);
    if (r.xm || !any) dash([0.08, 0.5], [0.4, 0.5]);
    if (r.xp || !any) dash([0.6, 0.5], [0.92, 0.5]);
    if (r.ym) dash([0.5, 0.08], [0.5, 0.4]);
    if (r.yp) dash([0.5, 0.6], [0.5, 0.92]);
  };
}

/** Simple block used for the locked eras (shop thumbnails only). */
function tower(wall: string, floors: number, roof: string = C.concrete): Sprite {
  return (pen, w, h) => {
    building(pen, w, h, { wall, roof, floors, roofType: 'flat', inset: 0.2, trim: C.concrete });
  };
}

// ───────────────────────────── city sprites ─────────────────────────────

const CITY: Record<string, Sprite> = {
  dirt_path: road(C.dirt, C.dirtDark),
  asphalt_road: road(C.asphalt, shade(C.asphalt, 0.8), C.asphaltLine),
  avenue: road(shade(C.asphalt, 0.9), shade(C.asphalt, 0.7), C.white),

  village_house: (pen, w, h) => {
    building(pen, w, h, {
      wall: C.plaster,
      roof: C.tile,
      chimney: true,
      trim: C.stone,
      rise: 0.55,
    });
  },

  two_story_house: (pen, w, h) => {
    building(pen, w, h, {
      wall: C.plasterWarm,
      roof: C.slate,
      floors: 2,
      roofType: 'hip',
      chimney: true,
      trim: C.brick,
      rise: 0.5,
    });
  },

  well: (pen) => {
    pen.shadow(0.25, 0.25, 0.75, 0.75);
    pen.cylinder(0.5, 0.5, 0.3, 0, 0.3, C.stone);
    pen.ellipse([0.5, 0.5, 0.3], 9, 4.5, '#3D5B6B');
    pen.line([0.28, 0.5, 0.25], [0.28, 0.5, 0.8], C.woodDark, 2.5);
    pen.line([0.72, 0.5, 0.25], [0.72, 0.5, 0.8], C.woodDark, 2.5);
    pen.gable(0.2, 0.3, 0.8, 0.7, 0.8, 0.22, C.tile, 'x');
  },

  field: (pen, w, h) => {
    ground(pen, w, h, C.soil);
    const rows = Math.round(h * 4);
    for (let i = 0; i < rows; i++) {
      const y = 0.14 + (i * (h - 0.28)) / (rows - 1);
      pen.line([0.12, y, 0.02], [w - 0.12, y, 0.02], C.soilDark, 2);
      pen.line([0.12, y, 0.1], [w - 0.12, y, 0.1], i % 2 ? C.crop : shade(C.crop, 1.12), 2.5);
    }
  },

  vegetable_garden: (pen, w, h) => {
    ground(pen, w, h, C.soil);
    const rows = Math.round(h * 3);
    for (let i = 0; i < rows; i++) {
      const y = 0.2 + (i * (h - 0.4)) / (rows - 1);
      const colors = [C.leaf, '#D9773A', '#B54C4C', shade(C.leaf, 1.2)];
      for (let j = 0; j < w * 4; j++) {
        pen.ellipse(
          [0.2 + j * 0.25 * ((w - 0.4) / (w - 0.25)), y, 0.06],
          4.5,
          3.5,
          colors[i % 4] as string,
        );
      }
    }
    fenceRun(pen, [0.06, h - 0.06], [w - 0.06, h - 0.06]);
    fenceRun(pen, [w - 0.06, 0.06], [w - 0.06, h - 0.06]);
  },

  chicken_coop: (pen, w, h) => {
    ground(pen, w, h, shade(C.grass, 0.94));
    fenceRun(pen, [0.08, 0.08], [w - 0.08, 0.08]);
    fenceRun(pen, [0.08, 0.08], [0.08, h - 0.08]);
    pen.shadow(0.2, 0.2, w * 0.55, h * 0.55);
    pen.box(0.2, 0.2, w * 0.55, h * 0.55, 0.12, 0.55, C.wood);
    pen.onLeftWall(h * 0.55, 0.42, 0.62, 0.12, 0.36, C.door);
    pen.gable(0.14, 0.14, w * 0.55 + 0.06, h * 0.55 + 0.06, 0.55, 0.3, C.tile, 'x', C.wood);
    for (const [x, y] of [
      [w * 0.72, h * 0.4],
      [w * 0.55, h * 0.78],
      [w * 0.8, h * 0.74],
      [w * 0.3, h * 0.8],
    ] as const) {
      pen.ellipse([x, y, 0.08], 4.5, 3.6, C.white);
      pen.ellipse([x + 0.05, y - 0.02, 0.16], 2.2, 2.2, C.white);
      pen.ellipse([x + 0.06, y - 0.03, 0.2], 1.2, 1, C.red);
    }
    fenceRun(pen, [0.08, h - 0.08], [w - 0.08, h - 0.08]);
    fenceRun(pen, [w - 0.08, 0.08], [w - 0.08, h - 0.08]);
  },

  orchard: (pen, w, h) => {
    ground(pen, w, h, shade(C.grass, 1.06));
    const spots: [number, number][] = [];
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) spots.push([i + 0.5, j + 0.5]);
    spots.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    for (const [x, y] of spots) {
      tree(pen, x, y, 0.72, shade(C.leaf, 1.05));
      for (const [dx, dz] of [
        [-0.1, 0.5],
        [0.08, 0.62],
        [-0.02, 0.78],
      ] as const) {
        pen.ellipse([x + dx, y, dz], 2.2, 2.2, C.red);
      }
    }
  },

  barn: (pen, w, h) => {
    const wallH = building(pen, w, h, {
      wall: C.barn,
      roof: C.slate,
      rise: 0.7,
      door: C.white,
      trim: C.stoneDark,
      inset: 0.14,
    });
    // big white-framed barn door on the gable end
    if (w >= h) {
      const c = h / 2;
      pen.onRightWall(w - 0.14, c - 0.3, c + 0.3, 0, wallH * 0.8, shade(C.white, 0.85));
      pen.onRightWall(w - 0.14, c - 0.25, c + 0.25, 0, wallH * 0.74, shade(C.woodDark, 0.8));
    } else {
      const c = w / 2;
      pen.onLeftWall(h - 0.14, c - 0.3, c + 0.3, 0, wallH * 0.8, C.white);
      pen.onLeftWall(h - 0.14, c - 0.25, c + 0.25, 0, wallH * 0.74, C.woodDark);
    }
  },

  windmill: (pen, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    pen.shadow(cx - 0.5, cy - 0.5, cx + 0.5, cy + 0.5);
    pen.box(cx - 0.5, cy - 0.5, cx + 0.5, cy + 0.5, 0, 0.7, C.stone);
    pen.onLeftWall(cy + 0.5, cx - 0.12, cx + 0.12, 0, 0.42, C.door);
    pen.box(cx - 0.38, cy - 0.38, cx + 0.38, cy + 0.38, 0.7, 1.7, C.plaster);
    windowsLeft(pen, cy + 0.38, cx - 0.38, cx + 0.38, 1.1, 1);
    pen.hip(cx - 0.44, cy - 0.44, cx + 0.44, cy + 0.44, 1.7, 0.5, C.tile);
    const hub: [number, number, number] = [cx, cy + 0.42, 1.55];
    for (const [dx, dz] of [
      [0.75, 0.55],
      [-0.75, -0.55],
      [0.5, -0.75],
      [-0.5, 0.75],
    ] as const) {
      pen.line(hub, [hub[0] + dx, hub[1], hub[2] + dz], C.woodDark, 3);
      pen.line(
        [hub[0] + dx * 0.35, hub[1], hub[2] + dz * 0.35 + 0.1],
        [hub[0] + dx, hub[1], hub[2] + dz + 0.1],
        C.white,
        4,
      );
    }
    pen.ellipse(hub, 3.5, 3.5, C.woodDark);
  },

  oak_tree: (pen) => tree(pen, 0.5, 0.5, 1.15),
  pine_tree: (pen) => pine(pen, 0.5, 0.5, 1.1),

  bush: (pen) => {
    pen.ellipse([0.55, 0.55, 0], 14, 6, '#1e2a1a2e');
    pen.ellipse([0.5, 0.5, 0.18], 14, 10, C.leafDark);
    pen.ellipse([0.42, 0.46, 0.28], 10, 8, C.leaf);
  },

  wooden_fence: (pen, w, h) => {
    if (w >= h) fenceRun(pen, [0, 0.5], [w, 0.5]);
    else fenceRun(pen, [0.5, 0], [0.5, h]);
  },

  flowers: (pen, w, h) => {
    dots(pen, w, h, [shade(C.leaf, 1.1)], 9, 0.03);
    dots(pen, w, h, ['#E8C547', '#D9698A', '#F2F0E6', '#8D7BC9'], 8, 0.12);
  },

  bench: (pen, w, h) => {
    const alongX = w >= h;
    const [x0, y0, x1, y1] = alongX ? [0.15, 0.38, 0.85, 0.62] : [0.38, 0.15, 0.62, 0.85];
    pen.shadow(x0, y0, x1, y1, 0.04);
    pen.box(x0, y0, x1, y1, 0.12, 0.2, C.wood);
    if (alongX) pen.box(x0, y0, x1, y0 + 0.06, 0.2, 0.42, C.woodDark);
    else pen.box(x0, y0, x0 + 0.06, y1, 0.2, 0.42, C.woodDark);
  },

  hay_bale: (pen) => {
    pen.shadow(0.25, 0.25, 0.75, 0.75, 0.05);
    pen.cylinder(0.5, 0.5, 0.32, 0, 0.38, C.hay);
    pen.line([0.2, 0.5, 0.19], [0.8, 0.5, 0.19], shade(C.hay, 0.75), 1.5);
  },

  scarecrow: (pen) => {
    pen.ellipse([0.55, 0.55, 0], 9, 4, '#1e2a1a2e');
    pen.line([0.5, 0.5, 0], [0.5, 0.5, 0.95], C.woodDark, 3);
    pen.line([0.2, 0.5, 0.65], [0.8, 0.5, 0.65], C.woodDark, 3);
    pen.poly(
      [
        [0.32, 0.5, 0.72],
        [0.68, 0.5, 0.72],
        [0.62, 0.5, 0.32],
        [0.38, 0.5, 0.32],
      ],
      '#B7774A',
    );
    pen.ellipse([0.5, 0.5, 0.9], 6, 6, C.hay);
    pen.poly(
      [
        [0.34, 0.5, 0.98],
        [0.66, 0.5, 0.98],
        [0.5, 0.5, 1.22],
      ],
      C.woodDark,
    );
  },

  pond: (pen, w, h) => {
    const c: [number, number, number] = [w / 2, h / 2, 0.01];
    pen.ellipse(c, w * 27, h * 13, shade(C.grassDark, 0.85));
    pen.ellipse(c, w * 24, h * 11.5, C.water);
    pen.ellipse([w / 2 - 0.15, h / 2 - 0.15, 0.01], w * 12, h * 5, C.waterLight);
    pen.ellipse([w * 0.72, h * 0.6, 0.03], 5, 2.5, C.leaf);
    pen.ellipse([w * 0.36, h * 0.7, 0.03], 4, 2, shade(C.leaf, 1.15));
  },

  brickworks: (pen, w, h) => {
    const wallH = building(pen, w, h, {
      wall: C.brick,
      roof: C.slate,
      rise: 0.35,
      door: C.woodDark,
      trim: C.stoneDark,
    });
    pen.box(w - 0.62, 0.3, w - 0.36, 0.56, wallH, wallH + 1.1, shade(C.brick, 0.9), C.stoneDark);
    pen.ellipse([w - 0.49, 0.43, wallH + 1.3], 7, 5, alpha('#D8D4CC', 0.8));
    pen.ellipse([w - 0.4, 0.4, wallH + 1.55], 9, 6, alpha('#D8D4CC', 0.55));
    // stack of fresh bricks by the door
    pen.box(0.1, h - 0.2, 0.36, h - 0.04, 0, 0.16, shade(C.brick, 1.15));
  },

  bakery: (pen, w, h) => {
    building(pen, w, h, {
      wall: C.plasterWarm,
      roof: C.tile,
      rise: 0.45,
      awning: '#C96F4A',
      chimney: true,
      trim: C.stone,
    });
  },

  grocery: (pen, w, h) => {
    building(pen, w, h, {
      wall: C.plaster,
      roof: C.slate,
      roofType: 'hip',
      rise: 0.4,
      awning: C.green,
      trim: C.stone,
    });
    pen.box(0.1, h - 0.2, 0.34, h - 0.02, 0, 0.14, C.wood);
    pen.ellipse([0.22, h - 0.11, 0.18], 5, 3, '#D9773A');
  },

  football_pitch: (pen, w, h) => {
    pen.tile(0.05, 0.05, w - 0.05, h - 0.05, 0.01, C.pitch, shade(C.pitch, 0.8));
    const alongX = w >= h;
    const stripes = 6;
    for (let i = 0; i < stripes; i += 2) {
      if (alongX) {
        const a = 0.15 + ((w - 0.3) * i) / stripes;
        pen.tile(a, 0.15, a + (w - 0.3) / stripes, h - 0.15, 0.012, C.pitchLight);
      } else {
        const a = 0.15 + ((h - 0.3) * i) / stripes;
        pen.tile(0.15, a, w - 0.15, a + (h - 0.3) / stripes, 0.012, C.pitchLight);
      }
    }
    const line = (a: [number, number], b: [number, number]) =>
      pen.line([a[0], a[1], 0.015], [b[0], b[1], 0.015], C.white, 1.6);
    line([0.15, 0.15], [w - 0.15, 0.15]);
    line([w - 0.15, 0.15], [w - 0.15, h - 0.15]);
    line([w - 0.15, h - 0.15], [0.15, h - 0.15]);
    line([0.15, h - 0.15], [0.15, 0.15]);
    if (alongX) line([w / 2, 0.15], [w / 2, h - 0.15]);
    else line([0.15, h / 2], [w - 0.15, h / 2]);
    pen.ellipse([w / 2, h / 2, 0.015], 14, 7, alpha(C.white, 0), C.white);
    const goal = (x: number, y: number) => {
      const [dx, dy] = alongX ? [0, 0.35] : [0.35, 0];
      pen.line([x - dx, y - dy, 0], [x - dx, y - dy, 0.32], C.white, 2);
      pen.line([x + dx, y + dy, 0], [x + dx, y + dy, 0.32], C.white, 2);
      pen.line([x - dx, y - dy, 0.32], [x + dx, y + dy, 0.32], C.white, 2);
    };
    if (alongX) {
      goal(0.15, h / 2);
      goal(w - 0.15, h / 2);
    } else {
      goal(w / 2, 0.15);
      goal(w / 2, h - 0.15);
    }
  },

  school: (pen, w, h) => {
    const wallH = building(pen, w, h, {
      wall: '#D9B27A',
      roof: C.tile,
      floors: 2,
      roofType: 'hip',
      rise: 0.4,
      door: '#3F5E7A',
      trim: C.brick,
    });
    // flag pole and a small bell turret
    const fx = 0.12;
    const fy = h - 0.12;
    pen.line([fx, fy, 0], [fx, fy, wallH + 0.7], C.metal, 2);
    pen.poly(
      [
        [fx, fy, wallH + 0.7],
        [fx + 0.3, fy, wallH + 0.62],
        [fx, fy, wallH + 0.5],
      ],
      '#3F6FA8',
    );
  },

  church: (pen, w, h) => {
    const alongX = w >= h;
    building(pen, w, h, {
      wall: C.stone,
      roof: C.slate,
      rise: 0.75,
      door: C.door,
      trim: C.stoneDark,
      inset: 0.2,
    });
    // bell tower at the back end of the nave
    const [tx, ty] = alongX ? [0.25, h / 2 - 0.4] : [w / 2 - 0.4, 0.25];
    pen.box(tx, ty, tx + 0.8, ty + 0.8, 0, 1.9, shade(C.stone, 1.05));
    pen.onLeftWall(ty + 0.8, tx + 0.28, tx + 0.52, 1.35, 1.7, '#3A4250');
    pen.onRightWall(tx + 0.8, ty + 0.28, ty + 0.52, 1.35, 1.7, '#2E3540');
    pen.hip(tx - 0.05, ty - 0.05, tx + 0.85, ty + 0.85, 1.9, 0.95, C.slate);
    pen.line([tx + 0.4, ty + 0.4, 2.85], [tx + 0.4, ty + 0.4, 3.1], C.metal, 2);
    pen.line([tx + 0.3, ty + 0.4, 3.0], [tx + 0.5, ty + 0.4, 3.0], C.metal, 2);
  },

  town_hall: (pen, w, h) => {
    const wallH = building(pen, w, h, {
      wall: C.plaster,
      roof: C.slate,
      floors: 2,
      roofType: 'hip',
      rise: 0.5,
      door: C.door,
      trim: C.stone,
      inset: 0.22,
    });
    const cx = w / 2;
    const cy = h / 2;
    pen.box(cx - 0.3, cy - 0.3, cx + 0.3, cy + 0.3, wallH + 0.2, wallH + 0.95, C.plaster);
    pen.ellipse([cx, cy + 0.3, wallH + 0.68], 6, 6, C.white, C.stoneDark);
    pen.hip(cx - 0.36, cy - 0.36, cx + 0.36, cy + 0.36, wallH + 0.95, 0.45, C.slate);
    // steps
    pen.box(cx - 0.4, h - 0.22, cx + 0.4, h - 0.06, 0, 0.08, C.stone);
  },

  water_tower: (pen) => {
    pen.shadow(0.2, 0.2, 0.8, 0.8);
    for (const [x, y] of [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ] as const) {
      pen.line([x, y, 0], [x, y, 1.2], C.metal, 3);
    }
    pen.line([0.25, 0.75, 0.2], [0.75, 0.75, 0.9], C.metal, 1.5);
    pen.line([0.75, 0.25, 0.2], [0.75, 0.75, 0.9], C.metal, 1.5);
    pen.cylinder(0.5, 0.5, 0.42, 1.2, 1.85, '#BFC8CC');
    pen.hip(0.1, 0.1, 0.9, 0.9, 1.85, 0.3, C.slate);
  },

  market_stall: (pen) => {
    pen.shadow(0.15, 0.15, 0.85, 0.85, 0.05);
    pen.box(0.18, 0.3, 0.82, 0.7, 0, 0.3, C.wood);
    for (const [x, c] of [
      [0.3, '#D9773A'],
      [0.5, C.red],
      [0.7, C.leaf],
    ] as const) {
      pen.ellipse([x, 0.5, 0.34], 5, 3, c);
    }
    for (const [x, y] of [
      [0.18, 0.3],
      [0.82, 0.3],
      [0.18, 0.7],
      [0.82, 0.7],
    ] as const) {
      pen.line([x, y, 0.3], [x, y, 0.85], C.woodDark, 2);
    }
    pen.gable(0.1, 0.22, 0.9, 0.78, 0.85, 0.22, C.red, 'x');
    pen.line([0.36, 0.78, 0.85], [0.36, 0.5, 1.07], C.white, 3);
    pen.line([0.64, 0.78, 0.85], [0.64, 0.5, 1.07], C.white, 3);
  },

  street_lamp: (pen) => {
    pen.ellipse([0.53, 0.53, 0], 6, 3, '#1e2a1a2e');
    pen.line([0.5, 0.5, 0], [0.5, 0.5, 1.05], '#3F4A4F', 2.5);
    pen.ellipse([0.5, 0.5, 1.12], 9, 9, alpha('#F6E7A6', 0.35));
    pen.ellipse([0.5, 0.5, 1.12], 4.5, 4.5, '#F6E7A6', '#3F4A4F');
  },

  hedge: (pen, w, h) => {
    const [x0, y0, x1, y1] = w >= h ? [0, 0.32, w, 0.68] : [0.32, 0, 0.68, h];
    pen.shadow(x0, y0, x1, y1, 0.03);
    pen.box(x0, y0, x1, y1, 0, 0.32, C.leafDark, C.leaf);
  },

  stone_wall: (pen, w, h) => {
    const [x0, y0, x1, y1] = w >= h ? [0, 0.38, w, 0.62] : [0.38, 0, 0.62, h];
    pen.shadow(x0, y0, x1, y1, 0.03);
    pen.box(x0, y0, x1, y1, 0, 0.26, C.stoneDark, C.stone);
  },

  flower_bed: (pen, w, h) => {
    pen.box(0.12, 0.12, w - 0.12, h - 0.12, 0, 0.08, C.stoneDark, C.soil);
    dots(pen, w, h, [C.leaf, '#D9698A', '#E8C547', '#F2F0E6', '#C85A5A'], 14, 0.14);
  },

  fountain: (pen, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    pen.shadow(cx - 0.7, cy - 0.7, cx + 0.7, cy + 0.7);
    pen.cylinder(cx, cy, 0.78, 0, 0.2, C.stone);
    pen.ellipse([cx, cy, 0.2], 29, 14.5, C.water);
    pen.cylinder(cx, cy, 0.14, 0.2, 0.7, C.stone);
    pen.ellipse([cx, cy, 0.7], 12, 6, C.waterLight, C.stoneDark);
    pen.line([cx, cy, 0.7], [cx, cy, 1.0], C.waterLight, 2.5);
    pen.ellipse([cx, cy, 1.0], 4, 3, alpha('#FFFFFF', 0.8));
  },

  playground: (pen, w, h) => {
    ground(pen, w, h, '#D8C59A');
    // swing
    pen.line([0.3, 0.4, 0], [0.45, 0.4, 0.85], C.red, 2.5);
    pen.line([0.6, 0.4, 0], [0.45, 0.4, 0.85], C.red, 2.5);
    pen.line([0.3, 1.2, 0], [0.45, 1.2, 0.85], C.red, 2.5);
    pen.line([0.6, 1.2, 0], [0.45, 1.2, 0.85], C.red, 2.5);
    pen.line([0.45, 0.4, 0.85], [0.45, 1.2, 0.85], C.red, 2.5);
    pen.line([0.45, 0.8, 0.85], [0.45, 0.8, 0.25], C.metal, 1.2);
    pen.box(0.38, 0.72, 0.52, 0.88, 0.22, 0.26, C.wood);
    // slide
    const sx = w - 0.75;
    const sy = h - 0.7;
    pen.box(sx, sy, sx + 0.35, sy + 0.35, 0, 0.7, C.yellow);
    pen.poly(
      [
        [sx, sy + 0.35, 0.7],
        [sx + 0.35, sy + 0.35, 0.7],
        [sx + 0.35, sy + 1.0 > h ? h : sy + 0.6, 0.02],
        [sx, sy + 1.0 > h ? h : sy + 0.6, 0.02],
      ],
      '#4F8FBF',
    );
  },

  statue: (pen) => {
    pen.shadow(0.25, 0.25, 0.75, 0.75);
    pen.box(0.28, 0.28, 0.72, 0.72, 0, 0.35, C.stone);
    pen.box(0.4, 0.4, 0.6, 0.6, 0.35, 0.95, '#7F9C8A');
    pen.ellipse([0.5, 0.5, 1.08], 6, 6, '#7F9C8A');
    pen.line([0.6, 0.5, 0.8], [0.78, 0.5, 1.05], '#7F9C8A', 3);
  },

  // ── locked eras: simple volumes, only ever seen as shop thumbnails ──
  apartment_3: tower('#D9C7A8', 3, C.slate),
  apartment_5: tower('#C9BBA6', 5, C.slate),
  glassworks: tower('#A9BFC4', 1, C.metal),
  foundry: tower('#8F7F78', 1, C.metal),
  gym: tower('#C5CFD6', 2, C.metal),
  train_station: tower('#D2B48C', 1, C.tile),
  skyscraper: tower('#9DB7C9', 9, C.metal),
  stadium: tower('#C9C5BA', 1, C.pitch),
  port: tower('#8FA9BB', 1, C.metal),
  airport: tower('#D5D8DA', 1, C.metal),
  park: (pen, w, h) => {
    ground(pen, w, h, shade(C.grass, 1.08));
    tree(pen, 0.6, 0.6, 0.9);
    tree(pen, w - 0.7, 0.8, 0.8);
    tree(pen, 0.9, h - 0.7, 0.85);
    pen.ellipse([w / 2, h / 2, 0.01], 22, 11, C.water);
  },
};

// ───────────────────────────── furniture sprites ─────────────────────────────

const F = {
  fabric: '#7E9BB5',
  fabricWarm: '#B5706A',
  wood: '#A77B4F',
  woodDark: '#84603D',
  white: '#F2EFE8',
  metal: '#B9C0C6',
  linen: '#E7DFCF',
} as const;

/** Orients a 2×1 piece: returns helper coordinates so "back" is the far long side. */
const FURNITURE: Record<string, Sprite> = {
  sofa: (pen, w, h) => {
    pen.box(0.08, 0.1, w - 0.08, h - 0.1, 0, 0.26, F.fabric);
    if (w >= h) pen.box(0.08, 0.1, w - 0.08, 0.3, 0.26, 0.6, shade(F.fabric, 0.9));
    else pen.box(0.1, 0.08, 0.3, h - 0.08, 0.26, 0.6, shade(F.fabric, 0.9));
  },
  armchair: (pen) => {
    pen.box(0.15, 0.15, 0.85, 0.85, 0, 0.26, F.fabricWarm);
    pen.box(0.15, 0.15, 0.85, 0.34, 0.26, 0.62, shade(F.fabricWarm, 0.9));
  },
  coffee_table: (pen) => {
    pen.box(0.2, 0.2, 0.8, 0.8, 0.16, 0.22, F.wood);
    pen.line([0.25, 0.75, 0], [0.25, 0.75, 0.16], F.woodDark, 2);
    pen.line([0.75, 0.75, 0], [0.75, 0.75, 0.16], F.woodDark, 2);
    pen.line([0.75, 0.25, 0], [0.75, 0.25, 0.16], F.woodDark, 2);
  },
  tv: (pen) => {
    pen.box(0.15, 0.3, 0.85, 0.7, 0, 0.28, F.woodDark);
    pen.box(0.2, 0.44, 0.8, 0.52, 0.3, 0.8, '#2F3438', '#2F3438');
    pen.onLeftWall(0.52, 0.24, 0.76, 0.34, 0.76, '#5D7F99');
  },
  bookshelf: (pen) => {
    pen.box(0.1, 0.1, 0.9, 0.4, 0, 1.1, F.wood);
    for (let i = 0; i < 3; i++) {
      const z = 0.12 + i * 0.33;
      pen.onLeftWall(0.4, 0.15, 0.85, z, z + 0.24, shade(F.woodDark, 0.8));
      for (let j = 0; j < 5; j++) {
        const colors = ['#B5524A', '#4F7F9B', '#D9B24A', '#5E9448', '#8D7BC9'];
        pen.onLeftWall(
          0.4,
          0.18 + j * 0.13,
          0.28 + j * 0.13,
          z,
          z + 0.2,
          colors[(i + j) % 5] as string,
        );
      }
    }
  },
  bed: (pen, w, h) => {
    pen.box(0.06, 0.08, w - 0.06, h - 0.08, 0, 0.2, F.wood);
    pen.box(0.08, 0.1, w - 0.08, h - 0.1, 0.2, 0.32, F.linen);
    if (w >= h) {
      pen.box(0.06, 0.08, 0.14, h - 0.08, 0.2, 0.6, F.woodDark);
      pen.box(0.2, 0.2, 0.55, h - 0.2, 0.32, 0.4, F.white);
      pen.tile(0.75, 0.1, w - 0.08, h - 0.1, 0.33, '#7D9E8C');
    } else {
      pen.box(0.08, 0.06, w - 0.08, 0.14, 0.2, 0.6, F.woodDark);
      pen.box(0.2, 0.2, w - 0.2, 0.55, 0.32, 0.4, F.white);
      pen.tile(0.1, 0.75, w - 0.1, h - 0.08, 0.33, '#7D9E8C');
    }
  },
  wardrobe: (pen) => {
    pen.box(0.1, 0.1, 0.9, 0.5, 0, 1.15, F.woodDark);
    pen.line([0.5, 0.5, 0.05], [0.5, 0.5, 1.1], shade(F.woodDark, 0.7), 1.5);
    pen.ellipse([0.44, 0.5, 0.6], 1.6, 1.6, F.metal);
    pen.ellipse([0.56, 0.5, 0.6], 1.6, 1.6, F.metal);
  },
  desk: (pen, w, h) => {
    pen.box(0.08, 0.15, w - 0.08, h - 0.15, 0.36, 0.42, F.wood);
    pen.box(0.1, 0.17, 0.3, h - 0.17, 0, 0.36, F.woodDark);
    if (w >= h) pen.line([w - 0.12, h - 0.18, 0], [w - 0.12, h - 0.18, 0.36], F.woodDark, 2.5);
    else pen.line([w - 0.18, h - 0.12, 0], [w - 0.18, h - 0.12, 0.36], F.woodDark, 2.5);
    pen.box(w / 2 - 0.12, h / 2 - 0.08, w / 2 + 0.12, h / 2 + 0.02, 0.42, 0.6, '#3A3F44');
  },
  dining_table: (pen, w, h) => {
    for (const [x, y] of [
      [0.14, h - 0.14],
      [w - 0.14, h - 0.14],
      [w - 0.14, 0.14],
    ] as const) {
      pen.line([x, y, 0], [x, y, 0.36], F.woodDark, 3);
    }
    pen.box(0.08, 0.08, w - 0.08, h - 0.08, 0.36, 0.43, F.wood);
    pen.ellipse([w / 2, h / 2, 0.45], 6, 3.5, '#C9614A');
  },
  chair: (pen) => {
    pen.box(0.28, 0.28, 0.72, 0.72, 0.22, 0.28, F.wood);
    pen.box(0.28, 0.28, 0.72, 0.36, 0.28, 0.66, F.woodDark);
    pen.line([0.32, 0.68, 0], [0.32, 0.68, 0.22], F.woodDark, 2);
    pen.line([0.68, 0.68, 0], [0.68, 0.68, 0.22], F.woodDark, 2);
  },
  fridge: (pen) => {
    pen.box(0.18, 0.18, 0.82, 0.7, 0, 1.05, F.white);
    pen.line([0.18, 0.7, 0.68], [0.82, 0.7, 0.68], F.metal, 1.5);
    pen.line([0.72, 0.7, 0.2], [0.72, 0.7, 0.55], F.metal, 2);
  },
  stove: (pen) => {
    pen.box(0.12, 0.12, 0.88, 0.75, 0, 0.5, F.white, '#3A3F44');
    pen.onLeftWall(0.75, 0.22, 0.78, 0.08, 0.36, '#3A3F44');
    pen.ellipse([0.35, 0.35, 0.5], 5, 2.5, '#6B7178');
    pen.ellipse([0.65, 0.5, 0.5], 5, 2.5, '#6B7178');
  },
  kitchen_sink: (pen) => {
    pen.box(0.1, 0.12, 0.9, 0.72, 0, 0.5, F.wood, F.linen);
    pen.tile(0.28, 0.25, 0.72, 0.6, 0.5, F.metal);
    pen.line([0.5, 0.25, 0.5], [0.5, 0.25, 0.68], F.metal, 2);
  },
  bathtub: (pen, w, h) => {
    pen.box(0.08, 0.12, w - 0.08, h - 0.12, 0, 0.34, F.white);
    pen.tile(0.16, 0.2, w - 0.16, h - 0.2, 0.33, '#9CC9E2');
  },
  toilet: (pen) => {
    pen.box(0.3, 0.2, 0.7, 0.38, 0, 0.55, F.white);
    pen.box(0.32, 0.38, 0.68, 0.74, 0, 0.26, F.white);
    pen.ellipse([0.5, 0.56, 0.27], 7, 4.5, '#DDE6EA');
  },
  washbasin: (pen) => {
    pen.box(0.22, 0.15, 0.78, 0.55, 0, 0.48, F.white);
    pen.ellipse([0.5, 0.35, 0.49], 8, 4.2, '#9CC9E2');
    pen.box(0.3, 0.15, 0.7, 0.19, 0.6, 1.0, '#BFD7E2');
  },
  lamp: (pen) => {
    pen.ellipse([0.5, 0.5, 0], 6, 3, F.woodDark);
    pen.line([0.5, 0.5, 0], [0.5, 0.5, 0.75], F.woodDark, 2);
    pen.ellipse([0.5, 0.5, 0.82], 12, 9, alpha('#F6E7A6', 0.35));
    pen.hip(0.34, 0.34, 0.66, 0.66, 0.68, 0.3, '#EAD9A0');
  },
  plant: (pen) => {
    pen.cylinder(0.5, 0.5, 0.18, 0, 0.22, '#B5704A');
    pen.ellipse([0.5, 0.5, 0.42], 10, 9, C.leafDark);
    pen.ellipse([0.44, 0.46, 0.58], 7, 7, C.leaf);
  },
  rug: (pen, w, h) => {
    pen.tile(0.12, 0.12, w - 0.12, h - 0.12, 0.012, '#B5706A', '#8F5650');
    pen.tile(0.3, 0.3, w - 0.3, h - 0.3, 0.014, '#D9B98C');
  },
};

function fallback(pen: IsoPen, w: number, h: number): void {
  pen.box(0.15, 0.15, w - 0.15, h - 0.15, 0, 0.5, '#B0A99A');
}

/** Draw operations for a city item whose footprint (after rotation) is w × h tiles. */
export function citySprite(
  spriteId: string,
  w: number,
  h: number,
  ox = 0,
  oy = 0,
  ctx: SpriteContext = {},
): DrawOp[] {
  const pen = new IsoPen(ox, oy);
  (CITY[spriteId] ?? fallback)(pen, w, h, ctx);
  return pen.ops;
}

export function furnitureSprite(spriteId: string, w: number, h: number, ox = 0, oy = 0): DrawOp[] {
  const pen = new IsoPen(ox, oy);
  (FURNITURE[spriteId] ?? fallback)(pen, w, h, {});
  return pen.ops;
}

export const hasCitySprite = (id: string) => id in CITY;
export const hasFurnitureSprite = (id: string) => id in FURNITURE;

export const GROUND = {
  grass: C.grass,
  grassAlt: C.grassDark,
  meadow: '#A9CC8A',
  plotEdge: '#6E9650',
};
