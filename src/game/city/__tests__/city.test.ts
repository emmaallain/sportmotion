import { getCityItem, getFurniture } from '../../catalog/index';
import type { CityItem, FurnitureItem } from '../../catalog/types';
import { computeCityFacts } from '../facts';
import { MAX_PLOTS, nextPlotPrice, ownedPlots, plotAt, plotRect } from '../grid';
import { canPlaceFurniture, furnitureAt, roomAt } from '../interior';
import type { Interior } from '../interior';
import { buildOccupancy, canPlace, footprint, itemAt } from '../placement';
import type { CityState, PlacedItem } from '../placement';
import { plotsLinkedByRoad } from '../roads';

const get = (id: string): CityItem => {
  const item = getCityItem(id);
  if (!item) throw new Error(id);
  return item;
};
const furn = (id: string): FurnitureItem => {
  const item = getFurniture(id);
  if (!item) throw new Error(id);
  return item;
};
let n = 0;
const put = (itemId: string, x: number, y: number, rot: 0 | 1 = 0): PlacedItem => ({
  id: `p${++n}`,
  itemId,
  x,
  y,
  rot,
});
const city = (items: PlacedItem[], plots = 1): CityState => ({ plots, items });
const roadRow = (from: number, to: number, y = 8) =>
  Array.from({ length: to - from + 1 }, (_, i) => put('dirt_path', from + i, y));

describe('plots', () => {
  it('prices extra plots 300, 600, 1 200…', () => {
    expect(nextPlotPrice(1)).toBe(300);
    expect(nextPlotPrice(2)).toBe(600);
    expect(nextPlotPrice(3)).toBe(1200);
    expect(nextPlotPrice(MAX_PLOTS)).toBeNull();
  });

  it('maps tiles to owned plots', () => {
    expect(plotAt(0, 0, 1)).toBe(0);
    expect(plotAt(15, 15, 1)).toBe(0);
    expect(plotAt(16, 0, 1)).toBe(-1);
    expect(plotAt(16, 0, 2)).toBe(1);
    expect(plotAt(-1, 0, 2)).toBe(-1);
    expect(plotAt(0, 16, 3)).toBe(2);
    expect(plotRect(1)).toEqual({ index: 1, x: 16, y: 0, size: 16 });
    expect(ownedPlots(2)).toHaveLength(2);
    expect(() => plotRect(99)).toThrow();
  });
});

describe('placement', () => {
  it('swaps the footprint when rotated', () => {
    expect(footprint([3, 2], 0)).toEqual([3, 2]);
    expect(footprint([3, 2], 1)).toEqual([2, 3]);
  });

  it('accepts a free spot on an owned plot', () => {
    expect(canPlace(city([]), getCityItem, get('village_house'), 4, 4, 0)).toEqual({ ok: true });
  });

  it('refuses tiles outside owned plots', () => {
    const house = get('village_house');
    expect(canPlace(city([]), getCityItem, house, 15, 4, 0)).toEqual({
      ok: false,
      reason: 'out_of_bounds',
    });
    expect(canPlace(city([]), getCityItem, house, -1, 0, 0).ok).toBe(false);
    expect(canPlace(city([]), getCityItem, house, 0.5, 0, 0).ok).toBe(false);
    expect(canPlace(city([], 2), getCityItem, house, 15, 4, 0).ok).toBe(true);
  });

  it('refuses collisions, including with a rotated footprint', () => {
    const c = city([put('barn', 4, 4, 1)]); // rotated barn covers x 4–5, y 4–6
    expect(canPlace(c, getCityItem, get('well'), 5, 6, 0)).toEqual({
      ok: false,
      reason: 'occupied',
    });
    expect(canPlace(c, getCityItem, get('well'), 6, 4, 0).ok).toBe(true);
    expect(itemAt(c, getCityItem, 4, 6)?.itemId).toBe('barn');
    expect(itemAt(c, getCityItem, 6, 4)).toBeUndefined();
  });

  it('lets an item move over its own footprint', () => {
    const house = put('village_house', 4, 4);
    const c = city([house]);
    expect(canPlace(c, getCityItem, get('village_house'), 5, 4, 0).ok).toBe(false);
    expect(canPlace(c, getCityItem, get('village_house'), 5, 4, 0, house.id).ok).toBe(true);
  });

  it('requires a road next to buildings that need one', () => {
    const school = get('school');
    expect(canPlace(city([]), getCityItem, school, 4, 4, 0)).toEqual({
      ok: false,
      reason: 'needs_road',
    });
    const c = city([put('dirt_path', 3, 5)]);
    expect(canPlace(c, getCityItem, school, 4, 4, 0).ok).toBe(true);
    // diagonal contact is not enough
    expect(canPlace(city([put('dirt_path', 3, 3)]), getCityItem, school, 4, 4, 0).ok).toBe(false);
  });

  it('ignores unknown items in the occupancy map', () => {
    expect(buildOccupancy(city([put('ghost', 1, 1)]), getCityItem).size).toBe(0);
  });
});

describe('roads', () => {
  it('needs two plots', () => {
    expect(plotsLinkedByRoad(city(roadRow(0, 15)), getCityItem)).toBe(false);
  });

  it('detects a continuous road across both plots', () => {
    expect(plotsLinkedByRoad(city(roadRow(10, 20), 2), getCityItem)).toBe(true);
  });

  it('is not fooled by a gap or by separate roads', () => {
    const gap = [...roadRow(10, 15), ...roadRow(17, 20)];
    expect(plotsLinkedByRoad(city(gap, 2), getCityItem)).toBe(false);
    const diagonal = [put('dirt_path', 15, 8), put('dirt_path', 16, 9)];
    expect(plotsLinkedByRoad(city(diagonal, 2), getCityItem)).toBe(false);
  });

  it('follows bends and mixes road types', () => {
    const bend = [
      put('dirt_path', 14, 2),
      put('dirt_path', 15, 2),
      put('asphalt_road', 15, 3),
      put('asphalt_road', 16, 3),
    ];
    expect(plotsLinkedByRoad(city(bend, 2), getCityItem)).toBe(true);
  });
});

describe('city facts', () => {
  it('counts tags, distinct kinds and items', () => {
    const c = city(
      [
        put('village_house', 0, 0),
        put('village_house', 2, 0),
        put('two_story_house', 4, 0),
        put('field', 0, 4),
        put('field', 2, 4),
        put('barn', 4, 4),
        put('ghost', 9, 9),
      ],
      1,
    );
    const facts = computeCityFacts(c, getCityItem);
    expect(facts.tagCounts.housing).toBe(3);
    expect(facts.tagCounts.farm).toBe(3);
    expect(facts.tagDistinct.farm).toBe(2);
    expect(facts.itemCounts.field).toBe(2);
    expect(facts.plotsLinked).toBe(false);
  });
});

describe('interiors', () => {
  const interior = (rooms: number, furniture: Interior['furniture'] = []): Interior => ({
    rooms: (['living_room', 'kitchen', 'bedroom', 'bathroom'] as const).slice(0, rooms),
    furniture,
  });

  it('maps tiles to purchased rooms only', () => {
    expect(roomAt(0, 0, 1)).toBe(0);
    expect(roomAt(4, 0, 1)).toBe(-1);
    expect(roomAt(4, 0, 2)).toBe(1);
    expect(roomAt(7, 7, 4)).toBe(3);
    expect(roomAt(8, 0, 4)).toBe(-1);
  });

  it('places furniture inside a purchased room', () => {
    expect(canPlaceFurniture(interior(1), getFurniture, furn('sofa'), 0, 0, 0).ok).toBe(true);
    expect(canPlaceFurniture(interior(0), getFurniture, furn('sofa'), 0, 0, 0)).toEqual({
      ok: false,
      reason: 'out_of_bounds',
    });
    expect(canPlaceFurniture(interior(1), getFurniture, furn('sofa'), 0.5, 0, 0).ok).toBe(false);
  });

  it('refuses furniture straddling two rooms', () => {
    expect(canPlaceFurniture(interior(2), getFurniture, furn('sofa'), 3, 0, 0).ok).toBe(false);
    expect(canPlaceFurniture(interior(2), getFurniture, furn('sofa'), 3, 0, 1).ok).toBe(true);
  });

  it('refuses overlapping furniture but allows moving in place', () => {
    const sofa = { id: 's', furnitureId: 'sofa', x: 0, y: 0, rot: 0 as const };
    const home = interior(1, [sofa, { id: 'g', furnitureId: 'ghost', x: 3, y: 3, rot: 0 }]);
    expect(canPlaceFurniture(home, getFurniture, furn('lamp'), 1, 0, 0)).toEqual({
      ok: false,
      reason: 'occupied',
    });
    expect(canPlaceFurniture(home, getFurniture, furn('sofa'), 1, 0, 0, 's').ok).toBe(true);
    expect(furnitureAt(home, getFurniture, 1, 0)?.id).toBe('s');
    expect(furnitureAt(home, getFurniture, 2, 0)).toBeUndefined();
  });
});
