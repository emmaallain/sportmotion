/** Isometric projection helpers (2:1 diamond tiles). Pure math, no rendering. */
export const TILE_W = 64;
export const TILE_H = 32;
const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;
/** Screen pixels for one unit of height. */
export const Z_UNIT = 38;

export interface Point {
  x: number;
  y: number;
}

/** Grid coordinates (fractions allowed) and height → world pixels. */
export function project(gx: number, gy: number, gz = 0): Point {
  return { x: (gx - gy) * HALF_W, y: (gx + gy) * HALF_H - gz * Z_UNIT };
}

/** World pixels (on the ground plane) → fractional grid coordinates. */
export function unproject(wx: number, wy: number): Point {
  return { x: (wx / HALF_W + wy / HALF_H) / 2, y: (wy / HALF_H - wx / HALF_W) / 2 };
}

/** Tile under a world point. */
export function tileAt(wx: number, wy: number): Point {
  const g = unproject(wx, wy);
  return { x: Math.floor(g.x), y: Math.floor(g.y) };
}

export interface Camera {
  /** Screen position of the world origin. */
  tx: number;
  ty: number;
  scale: number;
}

export const MIN_SCALE = 0.3;
export const MAX_SCALE = 2.5;

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function screenToWorld(camera: Camera, sx: number, sy: number): Point {
  return { x: (sx - camera.tx) / camera.scale, y: (sy - camera.ty) / camera.scale };
}

/** Zooms by `factor` keeping the world point under (fx, fy) fixed on screen. */
export function zoomAt(camera: Camera, factor: number, fx: number, fy: number): Camera {
  const scale = clampScale(camera.scale * factor);
  const ratio = scale / camera.scale;
  return { scale, tx: fx - (fx - camera.tx) * ratio, ty: fy - (fy - camera.ty) * ratio };
}

/** Camera that fits a grid rectangle inside a viewport, with a margin. */
export function fitCamera(
  rect: { x: number; y: number; w: number; h: number },
  viewW: number,
  viewH: number,
  margin = 24,
  maxScale = 1.3,
): Camera {
  const left = project(rect.x, rect.y + rect.h).x;
  const right = project(rect.x + rect.w, rect.y).x;
  const top = project(rect.x, rect.y).y - Z_UNIT;
  const bottom = project(rect.x + rect.w, rect.y + rect.h).y;
  const scale = clampScale(
    Math.min(
      maxScale,
      (viewW - margin * 2) / Math.max(1, right - left),
      (viewH - margin * 2) / Math.max(1, bottom - top),
    ),
  );
  return {
    scale,
    tx: viewW / 2 - ((left + right) / 2) * scale,
    ty: viewH / 2 - ((top + bottom) / 2) * scale,
  };
}

export interface DepthRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Back-to-front order for axis-aligned footprints (painter's algorithm).
 * A rectangle is behind another when it lies entirely further back along x or y.
 * Returns indices into `rects`.
 */
export function depthOrder(rects: readonly DepthRect[]): number[] {
  const n = rects.length;
  const after: number[][] = Array.from({ length: n }, () => []);
  const pending = new Array<number>(n).fill(0);
  const behind = (a: DepthRect, b: DepthRect) => a.x + a.w <= b.x || a.y + a.h <= b.y;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = rects[i] as DepthRect;
      const b = rects[j] as DepthRect;
      const ab = behind(a, b);
      const ba = behind(b, a);
      if (ab && !ba) {
        (after[i] as number[]).push(j);
        pending[j] = (pending[j] ?? 0) + 1;
      } else if (ba && !ab) {
        (after[j] as number[]).push(i);
        pending[i] = (pending[i] ?? 0) + 1;
      }
    }
  }
  const key = (i: number) => {
    const r = rects[i] as DepthRect;
    return r.x + r.w + r.y + r.h;
  };
  const ready = [];
  for (let i = 0; i < n; i++) if (pending[i] === 0) ready.push(i);
  const order: number[] = [];
  const done = new Array<boolean>(n).fill(false);
  while (order.length < n) {
    if (ready.length === 0) {
      // Cycle (cannot happen with non-overlapping footprints): fall back to the nearest key.
      let best = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || key(i) < key(best))) best = i;
      ready.push(best);
    }
    ready.sort((a, b) => key(b) - key(a));
    const next = ready.pop() as number;
    if (done[next]) continue;
    done[next] = true;
    order.push(next);
    for (const j of after[next] as number[]) {
      pending[j] = (pending[j] ?? 0) - 1;
      if (pending[j] === 0 && !done[j]) ready.push(j);
    }
  }
  return order;
}
