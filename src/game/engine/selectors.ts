import { getCityItem } from '../catalog/index';
import { computeCityFacts } from '../city/facts';
import { evaluateDay } from '../economy/day';
import type { DayEvaluation } from '../economy/types';
import { checkEraAdvance, eraAdvanceStatus } from '../progression/eras';
import type { AdvanceCheck, RequirementStatus } from '../progression/eras';
import { levelFromXp } from '../progression/levels';
import type { LevelInfo } from '../progression/levels';
import { dayRecord } from './reducer';
import type { DayRecord, GameState } from './state';

export const selectLevel = (state: GameState): LevelInfo => levelFromXp(state.balances.xp);

export function selectToday(
  state: GameState,
  today: string,
): { record: DayRecord; evaluation: DayEvaluation } {
  const record = dayRecord(state, today);
  return { record, evaluation: evaluateDay(record.activities) };
}

export function selectEraProgress(state: GameState): {
  status: RequirementStatus[];
  check: AdvanceCheck;
} {
  const facts = computeCityFacts(state.city, getCityItem);
  const level = selectLevel(state).level;
  return {
    status: eraAdvanceStatus(state.era, level, facts),
    check: checkEraAdvance(state.era, level, facts),
  };
}
