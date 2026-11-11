import { project } from './iso';

/**
 * A tiny display list. Sprites are described with these operations so they can be generated
 * and tested without Skia; `skia/renderOps.ts` paints them.
 */
export type DrawOp =
  | { k: 'poly'; pts: number[]; fill: string; stroke?: string; sw?: number }
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string; stroke?: string }
  | { k: 'line'; x0: number; y0: number; x1: number; y1: number; color: string; w: number };

export type P3 = readonly [number, number, number];

const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

/** Lightens (factor > 1) or darkens (factor < 1) a #rrggbb colour. */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => (factor <= 1 ? c * factor : c + (255 - c) * (factor - 1));
  const out = (clamp(mix(r)) << 16) | (clamp(mix(g)) << 8) | clamp(mix(b));
  return `#${out.toString(16).padStart(6, '0')}${hex.slice(7)}`;
}

/** Adds an alpha channel (0..1) to a #rrggbb colour. */
export function alpha(hex: string, a: number): string {
  return `${hex.slice(0, 7)}${clamp(a * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/**
 * Draws in grid space (x → right-down, y → left-down, z → up) and records screen-space ops.
 * The light comes from the top-left: tops are lightest, x-facing walls darkest.
 */
export class IsoPen {
  readonly ops: DrawOp[] = [];

  constructor(
    private readonly ox = 0,
    private readonly oy = 0,
  ) {}

  private flat(points: readonly P3[]): number[] {
    const out: number[] = [];
    for (const [x, y, z] of points) {
      const p = project(this.ox + x, this.oy + y, z);
      out.push(p.x, p.y);
    }
    return out;
  }

  poly(points: readonly P3[], fill: string, stroke?: string, sw = 1): this {
    this.ops.push({ k: 'poly', pts: this.flat(points), fill, stroke, sw });
    return this;
  }

  line(a: P3, b: P3, color: string, w = 1.5): this {
    const [x0, y0, x1, y1] = this.flat([a, b]) as [number, number, number, number];
    this.ops.push({ k: 'line', x0, y0, x1, y1, color, w });
    return this;
  }

  /** Screen-space ellipse centred on a grid point (rx, ry in pixels). */
  ellipse(at: P3, rx: number, ry: number, fill: string, stroke?: string): this {
    const [cx, cy] = this.flat([at]) as [number, number];
    this.ops.push({ k: 'ellipse', cx, cy, rx, ry, fill, stroke });
    return this;
  }

  /** Horizontal rectangle at height z. */
  tile(x0: number, y0: number, x1: number, y1: number, z: number, fill: string, stroke?: string) {
    return this.poly(
      [
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y1, z],
      ],
      fill,
      stroke,
    );
  }

  /** Soft contact shadow under an object. */
  shadow(x0: number, y0: number, x1: number, y1: number, grow = 0.12): this {
    return this.tile(x0 - grow, y0 - grow, x1 + grow * 2, y1 + grow * 2, 0, '#1e2a1a2e');
  }

  /** Box: the two visible walls then the top. `color` is the wall colour. */
  box(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z0: number,
    z1: number,
    color: string,
    top: string = shade(color, 1.25),
  ): this {
    // wall on the y = y1 plane (faces the viewer's left)
    this.poly(
      [
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      color,
    );
    // wall on the x = x1 plane (faces the viewer's right, in shade)
    this.poly(
      [
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1],
      ],
      shade(color, 0.8),
    );
    return this.tile(x0, y0, x1, y1, z1, top);
  }

  /** Rectangle painted on the y = y plane wall, between x0..x1 and z0..z1. */
  onLeftWall(y: number, x0: number, x1: number, z0: number, z1: number, fill: string): this {
    return this.poly(
      [
        [x0, y, z0],
        [x1, y, z0],
        [x1, y, z1],
        [x0, y, z1],
      ],
      fill,
    );
  }

  /** Rectangle painted on the x = x plane wall, between y0..y1 and z0..z1. */
  onRightWall(x: number, y0: number, y1: number, z0: number, z1: number, fill: string): this {
    return this.poly(
      [
        [x, y0, z0],
        [x, y1, z0],
        [x, y1, z1],
        [x, y0, z1],
      ],
      fill,
    );
  }

  /** Gable roof whose ridge runs along `axis`. */
  gable(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
    rise: number,
    color: string,
    axis: 'x' | 'y' = 'x',
    wall?: string,
  ): this {
    if (axis === 'x') {
      const ym = (y0 + y1) / 2;
      this.poly(
        [
          [x0, y0, z],
          [x1, y0, z],
          [x1, ym, z + rise],
          [x0, ym, z + rise],
        ],
        shade(color, 0.7),
      );
      // gable end on the x = x1 wall
      this.poly(
        [
          [x1, y0, z],
          [x1, y1, z],
          [x1, ym, z + rise],
        ],
        wall ? shade(wall, 0.8) : shade(color, 0.6),
      );
      return this.poly(
        [
          [x0, y1, z],
          [x1, y1, z],
          [x1, ym, z + rise],
          [x0, ym, z + rise],
        ],
        color,
      );
    }
    const xm = (x0 + x1) / 2;
    this.poly(
      [
        [x0, y0, z],
        [x0, y1, z],
        [xm, y1, z + rise],
        [xm, y0, z + rise],
      ],
      shade(color, 1.15),
    );
    // gable end on the y = y1 wall
    this.poly(
      [
        [x0, y1, z],
        [x1, y1, z],
        [xm, y1, z + rise],
      ],
      wall ?? shade(color, 0.85),
    );
    return this.poly(
      [
        [x1, y0, z],
        [x1, y1, z],
        [xm, y1, z + rise],
        [xm, y0, z + rise],
      ],
      shade(color, 0.8),
    );
  }

  /** Four-sided roof meeting at a point (or a short ridge when the base is not square). */
  hip(x0: number, y0: number, x1: number, y1: number, z: number, rise: number, color: string) {
    const xm = (x0 + x1) / 2;
    const ym = (y0 + y1) / 2;
    const top: P3 = [xm, ym, z + rise];
    this.poly([[x0, y0, z], [x1, y0, z], top], shade(color, 0.65));
    this.poly([[x0, y0, z], [x0, y1, z], top], shade(color, 1.1));
    this.poly([[x1, y0, z], [x1, y1, z], top], shade(color, 0.8));
    return this.poly([[x0, y1, z], [x1, y1, z], top], color);
  }

  /** Upright cylinder approximated with a box-like silhouette and elliptical caps. */
  cylinder(x: number, y: number, radius: number, z0: number, z1: number, color: string): this {
    const rx = radius * 44;
    const ry = radius * 22;
    const base = project(this.ox + x, this.oy + y, z0);
    const cap = project(this.ox + x, this.oy + y, z1);
    this.ops.push({ k: 'ellipse', cx: base.x, cy: base.y, rx, ry, fill: shade(color, 0.8) });
    this.ops.push({
      k: 'poly',
      pts: [base.x - rx, base.y, base.x + rx, base.y, cap.x + rx, cap.y, cap.x - rx, cap.y],
      fill: shade(color, 0.9),
    });
    this.ops.push({ k: 'ellipse', cx: cap.x, cy: cap.y, rx, ry, fill: shade(color, 1.2) });
    return this;
  }
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function opsBounds(ops: readonly DrawOp[]): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number) => {
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
  };
  for (const op of ops) {
    if (op.k === 'poly')
      for (let i = 0; i < op.pts.length; i += 2) add(op.pts[i] ?? 0, op.pts[i + 1] ?? 0);
    else if (op.k === 'ellipse') {
      add(op.cx - op.rx, op.cy - op.ry);
      add(op.cx + op.rx, op.cy + op.ry);
    } else {
      add(op.x0, op.y0);
      add(op.x1, op.y1);
    }
  }
  if (!Number.isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return b;
}
