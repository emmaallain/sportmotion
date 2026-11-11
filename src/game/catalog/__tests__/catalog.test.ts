import {
  CITY_CATEGORIES,
  CITY_ITEMS,
  FURNITURE,
  RECIPES,
  ROOMS,
  getCityItem,
  getFurniture,
  getRecipe,
  getRoom,
} from '../index';
import { ALL_MATERIALS } from '../../economy/types';
import { ERAS } from '../../progression/eras';
import { fr } from '../../../i18n/fr';

describe('catalog', () => {
  it('has at least 25 city items for eras 1–2 and 12 pieces of furniture', () => {
    expect(CITY_ITEMS.filter((i) => i.era <= 2).length).toBeGreaterThanOrEqual(25);
    expect(FURNITURE.length).toBeGreaterThanOrEqual(12);
    expect(ROOMS.map((r) => r.id).sort()).toEqual([
      'bathroom',
      'bedroom',
      'kitchen',
      'living_room',
    ]);
  });

  it('has unique ids', () => {
    const ids = [...CITY_ITEMS, ...FURNITURE].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains every element named in the game design', () => {
    const required = [
      'dirt_path',
      'village_house',
      'well',
      'field',
      'vegetable_garden',
      'chicken_coop',
      'barn',
      'orchard',
      'asphalt_road',
      'bakery',
      'school',
      'football_pitch',
      'brickworks',
      'two_story_house',
      'avenue',
      'apartment_3',
      'apartment_5',
      'park',
      'gym',
      'glassworks',
      'foundry',
      'train_station',
      'skyscraper',
      'stadium',
      'port',
      'airport',
    ];
    for (const id of required) expect(getCityItem(id)).toBeDefined();
  });

  it('uses the reference prices of the game design', () => {
    expect(getCityItem('dirt_path')?.cost).toEqual({ pulses: 2, materials: undefined });
    expect(getCityItem('asphalt_road')?.cost).toEqual({ pulses: 5, materials: { stone: 1 } });
    expect(getCityItem('village_house')?.cost).toEqual({
      pulses: 150,
      materials: { wood: 10, stone: 5 },
    });
    expect(getCityItem('field')?.cost).toEqual({ pulses: 60, materials: { wood: 4 } });
    expect(getCityItem('barn')?.cost).toEqual({ pulses: 200, materials: { wood: 15, stone: 6 } });
    expect(getCityItem('school')?.cost).toEqual({
      pulses: 600,
      materials: { brick: 20, wood: 10 },
    });
    expect(getFurniture('sofa')?.cost).toEqual({ pulses: 40, materials: { wood: 3 } });
    expect(getFurniture('bed')?.cost).toEqual({ pulses: 50, materials: { wood: 4 } });
  });

  it('keeps every item inside the level range of its era', () => {
    for (const item of CITY_ITEMS) {
      const era = ERAS.find((e) => e.id === item.era);
      expect(item.level).toBeGreaterThanOrEqual(era?.minLevel ?? 0);
      expect(item.level).toBeLessThanOrEqual(era?.maxLevel ?? 0);
    }
  });

  it('has sane costs, sizes and categories', () => {
    for (const item of CITY_ITEMS) {
      expect(item.cost.pulses).toBeGreaterThan(0);
      expect(item.size[0] * item.size[1]).toBeGreaterThan(0);
      expect(CITY_CATEGORIES).toContain(item.category);
      for (const m of Object.keys(item.cost.materials ?? {})) expect(ALL_MATERIALS).toContain(m);
      if (item.kind === 'road') expect(item.size).toEqual([1, 1]);
    }
  });

  it('never asks for a material that is not obtainable in the item era', () => {
    for (const item of CITY_ITEMS) {
      const mats = item.cost.materials ?? {};
      if (item.era < 2) expect(mats.brick).toBeUndefined();
      if (item.era < 3) {
        expect(mats.glass).toBeUndefined();
        expect(mats.steel).toBeUndefined();
      }
    }
    for (const f of FURNITURE) {
      expect(Object.keys(f.cost.materials ?? {})).not.toContain('brick');
    }
  });

  it('defines the three recipes with an existing workshop', () => {
    expect(getRecipe('brick')?.inputs).toEqual({ stone: 2, water: 1 });
    expect(getRecipe('glass')?.inputs).toEqual({ water: 2, energy: 1 });
    expect(getRecipe('steel')?.inputs).toEqual({ stone: 2, energy: 2 });
    for (const recipe of RECIPES) {
      const building = getCityItem(recipe.building);
      expect(building?.recipes).toContain(recipe.id);
      expect(building?.era).toBe(recipe.era);
    }
  });

  it('gives homes their room limits', () => {
    expect(getCityItem('village_house')?.maxRooms).toBe(2);
    expect(getCityItem('two_story_house')?.maxRooms).toBe(4);
    expect(getRoom('kitchen')).toBeDefined();
    expect(getRoom('garage')).toBeUndefined();
  });

  it('has a French name for every item, room and piece of furniture', () => {
    for (const item of CITY_ITEMS) expect(fr.items[item.id]).toBeTruthy();
    for (const f of FURNITURE) expect(fr.furniture[f.id]).toBeTruthy();
    for (const r of ROOMS) expect(fr.rooms[r.id]).toBeTruthy();
  });
});
