import { CITY_ITEMS } from './cityItems';
import { FURNITURE, ROOMS } from './interiorItems';
import { RECIPES } from './recipes';
import type { CityItem, FurnitureItem, Recipe, RoomDef } from './types';

export * from './types';
export { CITY_ITEMS, BUILD_XP_RATE } from './cityItems';
export { FURNITURE, ROOMS, INTERIOR_XP_RATE } from './interiorItems';
export { RECIPES } from './recipes';

const cityById = new Map(CITY_ITEMS.map((i) => [i.id, i]));
const furnitureById = new Map(FURNITURE.map((f) => [f.id, f]));
const roomById = new Map<string, RoomDef>(ROOMS.map((r) => [r.id, r]));
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

export const getCityItem = (id: string): CityItem | undefined => cityById.get(id);
export const getFurniture = (id: string): FurnitureItem | undefined => furnitureById.get(id);
export const getRoom = (id: string): RoomDef | undefined => roomById.get(id);
export const getRecipe = (id: string): Recipe | undefined => recipeById.get(id);
