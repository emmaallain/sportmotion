import type { MaterialId } from '../economy/types';
import type { FurnitureItem, RoomDef, RoomType } from './types';

/** XP per Pulse spent on rooms and furniture. */
export const INTERIOR_XP_RATE = 0.2;

const xp = (pulses: number) => Math.round(pulses * INTERIOR_XP_RATE);

export const ROOMS: readonly RoomDef[] = [
  { id: 'living_room', cost: { pulses: 80, materials: { wood: 4 } }, xp: xp(80) },
  { id: 'bedroom', cost: { pulses: 90, materials: { wood: 5 } }, xp: xp(90) },
  { id: 'kitchen', cost: { pulses: 100, materials: { wood: 4, water: 3 } }, xp: xp(100) },
  { id: 'bathroom', cost: { pulses: 110, materials: { stone: 3, water: 4 } }, xp: xp(110) },
];

function furniture(
  id: string,
  suggestedRoom: RoomType | 'any',
  pulses: number,
  materials: Partial<Record<MaterialId, number>> | undefined,
  size: readonly [number, number] = [1, 1],
): FurnitureItem {
  return {
    id,
    cost: { pulses, materials },
    size,
    sprite: id,
    xp: xp(pulses),
    rotatable: size[0] !== size[1],
    suggestedRoom,
  };
}

export const FURNITURE: readonly FurnitureItem[] = [
  furniture('sofa', 'living_room', 40, { wood: 3 }, [2, 1]),
  furniture('armchair', 'living_room', 30, { wood: 2 }),
  furniture('coffee_table', 'living_room', 25, { wood: 2 }),
  furniture('tv', 'living_room', 80, { energy: 3 }),
  furniture('bookshelf', 'living_room', 45, { wood: 4 }),
  furniture('bed', 'bedroom', 50, { wood: 4 }, [2, 1]),
  furniture('wardrobe', 'bedroom', 50, { wood: 5 }),
  furniture('desk', 'bedroom', 40, { wood: 3 }, [2, 1]),
  furniture('dining_table', 'kitchen', 45, { wood: 4 }, [2, 1]),
  furniture('chair', 'kitchen', 15, { wood: 1 }),
  furniture('fridge', 'kitchen', 60, { stone: 2, energy: 2 }),
  furniture('stove', 'kitchen', 55, { stone: 3, energy: 1 }),
  furniture('kitchen_sink', 'kitchen', 40, { stone: 2, water: 2 }),
  furniture('bathtub', 'bathroom', 70, { stone: 3, water: 4 }, [2, 1]),
  furniture('toilet', 'bathroom', 45, { stone: 2, water: 1 }),
  furniture('washbasin', 'bathroom', 35, { stone: 2, water: 1 }),
  furniture('lamp', 'any', 20, { energy: 1 }),
  furniture('plant', 'any', 15, { water: 1 }),
  furniture('rug', 'any', 25, undefined, [2, 2]),
];
