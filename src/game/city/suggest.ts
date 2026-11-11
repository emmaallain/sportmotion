import type { CityItem } from '../catalog/types';
import { PLOT_SIZE, plotRect } from './grid';
import { canPlace } from './placement';
import type { CityState, ItemLookup, Rotation } from './placement';

/**
 * A valid spot for `item`, as close as possible to (nearX, nearY) — by default the centre of
 * the first plot. Used to pre-position the placement ghost.
 */
export function suggestSpot(
  city: CityState,
  lookup: ItemLookup,
  item: CityItem,
  rot: Rotation = 0,
  nearX = PLOT_SIZE / 2 - 1,
  nearY = PLOT_SIZE / 2 - 1,
): { x: number; y: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (let p = 0; p < city.plots; p++) {
    const rect = plotRect(p);
    for (let x = rect.x; x < rect.x + rect.size; x++) {
      for (let y = rect.y; y < rect.y + rect.size; y++) {
        const d = Math.abs(x - nearX) + Math.abs(y - nearY);
        if (best && d >= best.d) continue;
        if (canPlace(city, lookup, item, x, y, rot).ok) best = { x, y, d };
      }
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}
