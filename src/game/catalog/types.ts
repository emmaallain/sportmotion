import type { MaterialId } from '../economy/types';
import type { EraId } from '../progression/eras';

export interface Cost {
  pulses: number;
  materials?: Partial<Record<MaterialId, number>>;
}

export type CityCategory = 'roads' | 'housing' | 'farm' | 'services' | 'decoration';
export const CITY_CATEGORIES: readonly CityCategory[] = [
  'roads',
  'housing',
  'farm',
  'services',
  'decoration',
];

export type CityItemKind = 'road' | 'building' | 'decor';

export interface CityItem {
  id: string;
  category: CityCategory;
  kind: CityItemKind;
  era: EraId;
  /** Player level required. */
  level: number;
  cost: Cost;
  /** Footprint in tiles: [width along x, depth along y]. */
  size: readonly [number, number];
  /** Sprite key, resolved by the render layer. */
  sprite: string;
  /** XP granted when the item is bought. */
  xp: number;
  tags: readonly string[];
  /** Must touch a road tile when placed. */
  requiresRoad: boolean;
  rotatable: boolean;
  /** Homes only: how many interior rooms can be bought. */
  maxRooms: number;
  /** Recipes that can be crafted in this building. */
  recipes: readonly string[];
}

export type RoomType = 'living_room' | 'kitchen' | 'bedroom' | 'bathroom';

export interface RoomDef {
  id: RoomType;
  cost: Cost;
  xp: number;
}

export interface FurnitureItem {
  id: string;
  cost: Cost;
  size: readonly [number, number];
  sprite: string;
  xp: number;
  rotatable: boolean;
  /** Room this piece is designed for (purely a shop hint). */
  suggestedRoom: RoomType | 'any';
}

export interface Recipe {
  id: string;
  output: MaterialId;
  inputs: Partial<Record<MaterialId, number>>;
  /** Building that must be owned to craft. */
  building: string;
  era: EraId;
}
