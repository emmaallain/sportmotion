import {
  CARDIO_MIN_PER_ENERGY,
  DAILY_BASE_PULSE_CAP,
  DAILY_MATERIAL_CAPS,
  EXTRA_SPORT_MIN_PER_PULSE,
  EXTRA_STEPS_PER_PULSE,
  EXTRA_STRETCH_MAX_MIN,
  EXTRA_STRETCH_MIN_PER_PULSE,
  FULL_DAY_BONUS,
  MANUAL_GAIN_FACTOR,
  MAX_SPORT_MIN_PER_DAY,
  MAX_STEPS_PER_DAY,
  QUEST_GOALS,
  QUEST_REWARDS,
  STEPS_PER_WOOD,
  STRENGTH_MIN_PER_STONE,
  STRETCH_MIN_PER_WATER,
  countsSteps,
  isCardio,
  isSport,
  isStrength,
  isStretch,
} from './constants';
import { applyManualLimit, checkActivity, resolveOverlaps } from './plausibility';
import type {
  AcceptedActivity,
  Activity,
  BasicMaterials,
  DayEvaluation,
  DayTotals,
  QuestId,
  QuestProgress,
  RejectionReason,
} from './types';

// Guards against float noise (e.g. 0.5 * 30 summed in a different order).
const floor = (n: number) => Math.floor(n + 1e-9);

function quest(id: QuestId, progress: number): QuestProgress {
  const goal = QUEST_GOALS[id];
  return {
    progress: Math.min(floor(progress), goal),
    goal,
    done: progress + 1e-9 >= goal,
    reward: QUEST_REWARDS[id],
  };
}

/**
 * Evaluates everything a single day is worth, from the full list of that day's activities.
 *
 * Pure and idempotent: the caller grants the difference between two evaluations, so the
 * same function can run on the device (offline mode) and on the server (authoritative).
 */
export function evaluateDay(activities: readonly Activity[]): DayEvaluation {
  const rejected: { id: string; reason: RejectionReason }[] = [];
  const reclassifiedIds = new Set<string>();
  const seen = new Set<string>();
  const plausible: Activity[] = [];

  for (const activity of activities) {
    if (seen.has(activity.id)) {
      rejected.push({ id: activity.id, reason: 'duplicate' });
      continue;
    }
    seen.add(activity.id);
    const check = checkActivity(activity);
    if (!check.ok) {
      rejected.push({ id: activity.id, reason: check.reason });
      continue;
    }
    if (check.reclassified) reclassifiedIds.add(activity.id);
    plausible.push(check.activity);
  }

  const { kept, dropped } = resolveOverlaps(plausible);
  for (const d of dropped) rejected.push({ id: d.id, reason: 'overlap' });

  const countedMinutes = applyManualLimit(kept);
  const accepted: AcceptedActivity[] = [];
  const totals: DayTotals = { steps: 0, sportMin: 0, stretchMin: 0, strengthMin: 0, cardioMin: 0 };

  for (const a of kept) {
    const countedMin = countedMinutes.get(a.id) ?? 0;
    if (countedMin <= 0) {
      rejected.push({ id: a.id, reason: 'manual_limit' });
      continue;
    }
    const factor = a.source === 'manual' ? MANUAL_GAIN_FACTOR : 1;
    const share = countedMin / a.durationMin;
    const minutes = countedMin * factor;
    if (countsSteps(a.type)) totals.steps += (a.steps ?? 0) * share * factor;
    if (isSport(a.type)) totals.sportMin += minutes;
    if (isStrength(a.type)) totals.strengthMin += minutes;
    if (isCardio(a.type)) totals.cardioMin += minutes;
    if (isStretch(a.type)) totals.stretchMin += minutes;
    accepted.push({
      id: a.id,
      type: a.type,
      reclassified: reclassifiedIds.has(a.id),
      countedMin,
      factor,
    });
  }

  const capped = { steps: false, sport: false, pulses: false };
  if (totals.steps > MAX_STEPS_PER_DAY) {
    totals.steps = MAX_STEPS_PER_DAY;
    capped.steps = true;
  }
  if (totals.sportMin > MAX_SPORT_MIN_PER_DAY) {
    const ratio = MAX_SPORT_MIN_PER_DAY / totals.sportMin;
    totals.sportMin = MAX_SPORT_MIN_PER_DAY;
    totals.strengthMin *= ratio;
    totals.cardioMin *= ratio;
    capped.sport = true;
  }

  const quests: Record<QuestId, QuestProgress> = {
    walk: quest('walk', totals.steps),
    sport: quest('sport', totals.sportMin),
    stretch: quest('stretch', totals.stretchMin),
  };
  const fullDay = quests.walk.done && quests.sport.done && quests.stretch.done;

  let pulses = 0;
  for (const q of Object.values(quests)) if (q.done) pulses += q.reward;
  if (fullDay) pulses += FULL_DAY_BONUS;
  pulses += floor(Math.max(0, totals.steps - QUEST_GOALS.walk) / EXTRA_STEPS_PER_PULSE);
  pulses += floor(Math.max(0, totals.sportMin - QUEST_GOALS.sport) / EXTRA_SPORT_MIN_PER_PULSE);
  pulses += floor(
    Math.min(EXTRA_STRETCH_MAX_MIN, Math.max(0, totals.stretchMin - QUEST_GOALS.stretch)) /
      EXTRA_STRETCH_MIN_PER_PULSE,
  );

  const basePulses = Math.min(pulses, DAILY_BASE_PULSE_CAP);
  capped.pulses = pulses > DAILY_BASE_PULSE_CAP;

  const materials: BasicMaterials = {
    wood: Math.min(DAILY_MATERIAL_CAPS.wood, floor(totals.steps / STEPS_PER_WOOD)),
    stone: Math.min(DAILY_MATERIAL_CAPS.stone, floor(totals.strengthMin / STRENGTH_MIN_PER_STONE)),
    water: Math.min(DAILY_MATERIAL_CAPS.water, floor(totals.stretchMin / STRETCH_MIN_PER_WATER)),
    energy: Math.min(DAILY_MATERIAL_CAPS.energy, floor(totals.cardioMin / CARDIO_MIN_PER_ENERGY)),
  };

  return {
    totals: {
      steps: floor(totals.steps),
      sportMin: floor(totals.sportMin),
      stretchMin: floor(totals.stretchMin),
      strengthMin: floor(totals.strengthMin),
      cardioMin: floor(totals.cardioMin),
    },
    quests,
    fullDay,
    uncappedBasePulses: pulses,
    basePulses,
    xp: basePulses,
    materials,
    accepted,
    rejected,
    capped,
  };
}

/** Pulses actually paid for a number of base Pulses under a streak multiplier. */
export function applyMultiplier(basePulses: number, multiplier: number): number {
  return Math.round(basePulses * multiplier);
}
