import { CITY_ITEMS, FURNITURE, getCityItem } from '@/game/catalog';
import { suggestSpot } from '@/game/city';
import type { CityState } from '@/game/city';

import { IsoPen, alpha, opsBounds, shade } from '../draw';
import {
  MAX_SCALE,
  MIN_SCALE,
  depthOrder,
  fitCamera,
  project,
  screenToWorld,
  tileAt,
  unproject,
  zoomAt,
} from '../iso';
import {
  buildCityScene,
  buildInteriorScene,
  footprintOps,
  furnitureGhostOps,
  ghostOps,
  selectionOps,
} from '../scene';
import { citySprite, furnitureSprite, hasCitySprite, hasFurnitureSprite } from '../sprites';

describe('isometric math', () => {
  it('projects and unprojects consistently', () => {
    for (const [x, y] of [
      [0, 0],
      [3, 7],
      [15.5, 2.25],
    ] as const) {
      const p = project(x, y);
      const g = unproject(p.x, p.y);
      expect(g.x).toBeCloseTo(x);
      expect(g.y).toBeCloseTo(y);
    }
    expect(project(1, 0)).toEqual({ x: 32, y: 16 });
    expect(project(0, 0, 1).y).toBeLessThan(0);
  });

  it('finds the tile under a point', () => {
    const centre = project(4.5, 9.5);
    expect(tileAt(centre.x, centre.y)).toEqual({ x: 4, y: 9 });
    expect(tileAt(project(-0.5, 0.5).x, project(-0.5, 0.5).y)).toEqual({ x: -1, y: 0 });
  });

  it('zooms around a fixed point and clamps the scale', () => {
    const camera = { tx: 10, ty: 20, scale: 1 };
    const before = screenToWorld(camera, 100, 150);
    const zoomed = zoomAt(camera, 2, 100, 150);
    const after = screenToWorld(zoomed, 100, 150);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomAt(camera, 100, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt(camera, 0.001, 0, 0).scale).toBe(MIN_SCALE);
  });

  it('frames a rectangle in the viewport', () => {
    const camera = fitCamera({ x: 0, y: 0, w: 16, h: 16 }, 400, 800);
    const centre = project(8, 8);
    expect(centre.x * camera.scale + camera.tx).toBeCloseTo(200);
    expect(camera.scale).toBeLessThanOrEqual(1.3);
    expect(16 * 64 * camera.scale).toBeLessThanOrEqual(400);
  });

  it('orders footprints back to front', () => {
    const rects = [
      { x: 4, y: 4, w: 2, h: 2 }, // front
      { x: 0, y: 0, w: 2, h: 2 }, // back
      { x: 2, y: 0, w: 1, h: 4 }, // tall strip between
    ];
    const order = depthOrder(rects);
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(2));
    expect(order.indexOf(2)).toBeLessThan(order.indexOf(0));
    expect(depthOrder([])).toEqual([]);
  });

  it('keeps a wide building behind a small one standing in front of its corner', () => {
    const rects = [
      { x: 3, y: 2, w: 1, h: 1 }, // decor in front of the pitch's far side
      { x: 0, y: 0, w: 4, h: 2 }, // pitch
    ];
    expect(depthOrder(rects)).toEqual([1, 0]);
  });
});

describe('drawing helpers', () => {
  it('shades and adds alpha', () => {
    expect(shade('#808080', 0.5)).toBe('#404040');
    expect(shade('#000000', 2)).toBe('#ffffff');
    expect(alpha('#ff0000', 0.5)).toBe('#ff000080');
  });

  it('records operations in screen space', () => {
    const pen = new IsoPen(2, 3);
    pen.tile(0, 0, 1, 1, 0, '#112233');
    const op = pen.ops[0];
    expect(op?.k).toBe('poly');
    expect(op && op.k === 'poly' && op.pts.slice(0, 2)).toEqual([project(2, 3).x, project(2, 3).y]);
    expect(opsBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    pen.line([0, 0, 0], [1, 1, 1], '#000000').ellipse([0, 0, 0], 5, 5, '#000000');
    const b = opsBounds(pen.ops);
    expect(b.maxX).toBeGreaterThan(b.minX);
  });
});

describe('sprites', () => {
  it('has a sprite for every catalog entry', () => {
    for (const item of CITY_ITEMS) expect(hasCitySprite(item.sprite)).toBe(true);
    for (const item of FURNITURE) expect(hasFurnitureSprite(item.sprite)).toBe(true);
  });

  it('draws every sprite in both rotations with finite coordinates', () => {
    const check = (ops: ReturnType<typeof citySprite>) => {
      expect(ops.length).toBeGreaterThan(0);
      const b = opsBounds(ops);
      for (const v of Object.values(b)) expect(Number.isFinite(v)).toBe(true);
    };
    for (const item of CITY_ITEMS) {
      check(citySprite(item.sprite, item.size[0], item.size[1]));
      check(citySprite(item.sprite, item.size[1], item.size[0], 5, 5));
    }
    for (const item of FURNITURE) {
      check(furnitureSprite(item.sprite, item.size[0], item.size[1]));
      check(furnitureSprite(item.sprite, item.size[1], item.size[0]));
    }
    check(citySprite('unknown', 1, 1));
  });

  it('only uses well-formed colours', () => {
    const colour = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
    for (const item of CITY_ITEMS) {
      for (const op of citySprite(item.sprite, item.size[0], item.size[1])) {
        expect(op.k === 'line' ? op.color : op.fill).toMatch(colour);
      }
    }
  });
});

describe('scenes', () => {
  const city: CityState = {
    plots: 2,
    items: [
      { id: 'h', itemId: 'village_house', x: 4, y: 4, rot: 0 },
      { id: 'r1', itemId: 'asphalt_road', x: 6, y: 4, rot: 0 },
      { id: 'r2', itemId: 'asphalt_road', x: 7, y: 4, rot: 0 },
      { id: 'b', itemId: 'barn', x: 8, y: 8, rot: 1 },
      { id: 'x', itemId: 'ghost', x: 1, y: 1, rot: 0 },
    ],
  };

  it('builds the city and can hide the item being moved', () => {
    const full = buildCityScene(city);
    const hidden = buildCityScene(city, { hiddenId: 'h' });
    expect(full.length).toBeGreaterThan(hidden.length);
    expect(buildCityScene(city, { showNextPlot: true }).length).toBeGreaterThan(full.length);
    expect(buildCityScene({ plots: 9, items: [] }, { showNextPlot: true }).length).toBeGreaterThan(
      0,
    );
  });

  it('builds overlays', () => {
    expect(footprintOps(0, 0, 2, 2, true)[0]).toMatchObject({ k: 'poly' });
    expect(selectionOps(0, 0, 1, 1)).toHaveLength(1);
    expect(ghostOps('barn', [3, 2], 0, 0, 1, false).length).toBeGreaterThan(1);
    expect(furnitureGhostOps('sofa', [2, 1], 0, 0, 0, true).length).toBeGreaterThan(1);
  });

  it('builds interiors with rooms, empty slots and furniture', () => {
    const empty = buildInteriorScene({ rooms: [], furniture: [] }, 2);
    const furnished = buildInteriorScene(
      {
        rooms: ['living_room', 'kitchen', 'bedroom', 'bathroom'],
        furniture: [
          { id: 'a', furnitureId: 'rug', x: 0, y: 0, rot: 0 },
          { id: 'b', furnitureId: 'sofa', x: 0, y: 2, rot: 0 },
          { id: 'c', furnitureId: 'ghost', x: 5, y: 5, rot: 0 },
        ],
      },
      4,
    );
    expect(furnished.length).toBeGreaterThan(empty.length);
  });
});

describe('suggestSpot', () => {
  it('proposes a valid spot near the centre and respects roads', () => {
    const house = getCityItem('village_house')!;
    expect(suggestSpot({ plots: 1, items: [] }, getCityItem, house)).toEqual({ x: 7, y: 7 });
    const school = getCityItem('school')!;
    expect(suggestSpot({ plots: 1, items: [] }, getCityItem, school)).toBeNull();
    const withRoad: CityState = {
      plots: 1,
      items: [{ id: 'r', itemId: 'dirt_path', x: 2, y: 2, rot: 0 }],
    };
    expect(suggestSpot(withRoad, getCityItem, school)).not.toBeNull();
  });
});
