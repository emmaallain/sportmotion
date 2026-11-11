import type { ChestLoot } from '../economy/chest';
import type { DayKey } from '../economy/dates';
import type {
  Activity,
  BasicMaterials,
  MaterialId,
  QuestId,
  RejectionReason,
} from '../economy/types';
import type { RoomType } from '../catalog/types';
import type { PlacementError, Rotation } from '../city/placement';
import type { EraId } from '../progression/eras';
import type { GameState } from './state';

export type GameCommand =
  /** Settles missed days (streak / jokers). Safe to send at any time. */
  | { type: 'tick' }
  | { type: 'claim_starter_bonus' }
  | { type: 'finish_onboarding' }
  | { type: 'add_activity'; activity: Activity }
  | { type: 'open_chest' }
  | { type: 'place_item'; id: string; itemId: string; x: number; y: number; rot: Rotation }
  | { type: 'move_item'; id: string; x: number; y: number; rot: Rotation }
  | { type: 'sell_item'; id: string }
  | { type: 'buy_plot' }
  | { type: 'craft'; recipeId: string; quantity: number }
  | { type: 'buy_room'; houseId: string; room: RoomType }
  | {
      type: 'place_furniture';
      houseId: string;
      id: string;
      furnitureId: string;
      x: number;
      y: number;
      rot: Rotation;
    }
  | { type: 'move_furniture'; houseId: string; id: string; x: number; y: number; rot: Rotation }
  | { type: 'sell_furniture'; houseId: string; id: string }
  | { type: 'advance_era' };

export interface CommandContext {
  /** The player's current local day. */
  today: DayKey;
  /** Random source in [0, 1). */
  rand: () => number;
}

export type GameEvent =
  | {
      type: 'activity_counted';
      activityId: string;
      pulses: number;
      xp: number;
      materials: BasicMaterials;
      reclassified: boolean;
      /** True when part of a manual entry was cut by the 60 min/day limit. */
      truncated: boolean;
    }
  | { type: 'quest_completed'; quest: QuestId }
  | { type: 'full_day'; streak: number }
  | { type: 'level_up'; level: number }
  | { type: 'joker_used'; count: number }
  | { type: 'streak_broken' }
  | { type: 'chest_opened'; loot: ChestLoot }
  | { type: 'purchased'; pulses: number; xp: number }
  | { type: 'sold'; pulses: number }
  | { type: 'crafted'; material: MaterialId; quantity: number }
  | { type: 'era_advanced'; era: EraId };

export type GameError =
  | { code: 'unknown_item' }
  | { code: 'locked' }
  | { code: 'insufficient_funds' }
  | { code: 'placement'; reason: PlacementError }
  | { code: 'activity_rejected'; reason: RejectionReason }
  | { code: 'not_found' }
  | { code: 'no_chest' }
  | { code: 'max_plots' }
  | { code: 'max_rooms' }
  | { code: 'room_owned' }
  | { code: 'missing_building' }
  | { code: 'era_requirements' }
  | { code: 'coming_soon' }
  | { code: 'invalid' };

export type CommandResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: GameError };
