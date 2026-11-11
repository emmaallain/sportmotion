import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  DAILY_BASE_PULSE_CAP,
  daysToNextMultiplier,
  msUntilLocalMidnight,
  multiplierForStreak,
} from '@/game/economy';
import type { QuestId } from '@/game/economy';
import { selectToday } from '@/game/engine';
import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';
import { Screen } from '@/ui/Screen';
import { Body, Button, Card, ProgressBar, Title } from '@/ui/components';
import { colors, font, icons, spacing } from '@/ui/theme';

const QUESTS: { id: QuestId; goal: string; format: (n: number) => string }[] = [
  { id: 'walk', goal: t.quests.walkGoal, format: (n) => t.common.steps(n) },
  { id: 'sport', goal: t.quests.sportGoal, format: (n) => t.common.minutes(n) },
  { id: 'stretch', goal: t.quests.stretchGoal, format: (n) => t.common.minutes(n) },
];

function formatCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

function useCountdown(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return formatCountdown(msUntilLocalMidnight(now));
}

export default function QuestsScreen() {
  const game = useGame((s) => s.game);
  const today = useGame((s) => s.today);
  const dispatch = useGame((s) => s.dispatch);
  const countdown = useCountdown();

  const { record, evaluation } = selectToday(game, today);
  const doneCount = QUESTS.filter((q) => evaluation.quests[q.id].done).length;
  const streak = game.streak;
  const nextTier = daysToNextMultiplier(streak.count);
  const formatMultiplier = t.hud.multiplier;

  return (
    <Screen>
      <View>
        <Title>{t.quests.title}</Title>
        <Body muted>{t.quests.resetIn(countdown)}</Body>
      </View>

      {QUESTS.map((q) => {
        const quest = evaluation.quests[q.id];
        return (
          <Card key={q.id}>
            <View style={styles.questHeader}>
              <Text style={styles.questIcon}>{icons.quests[q.id]}</Text>
              <View style={styles.flex}>
                <Text style={styles.questName}>{t.quests[q.id]}</Text>
                <Body muted>{q.goal}</Body>
              </View>
              <Text style={[styles.reward, quest.done && styles.rewardDone]}>
                {quest.done ? `${icons.check} ${t.quests.done}` : t.quests.reward(quest.reward)}
              </Text>
            </View>
            <ProgressBar
              value={quest.progress / quest.goal}
              color={quest.done ? colors.success : colors.accent}
              label={t.quests[q.id]}
            />
            <Body muted testID={`quest-${q.id}-progress`}>
              {q.format(quest.progress)} / {q.format(quest.goal)}
            </Body>
          </Card>
        );
      })}

      <Card style={evaluation.fullDay ? styles.bonusDone : undefined}>
        <View style={styles.questHeader}>
          <Text style={styles.questIcon}>{icons.chest}</Text>
          <View style={styles.flex}>
            <Text style={styles.questName}>{t.quests.bonusTitle}</Text>
            <Body muted>{t.quests.bonusBody}</Body>
          </View>
        </View>
        <ProgressBar value={doneCount / 3} color={colors.streak} label={t.quests.bonusTitle} />
        <Body muted>{t.quests.bonusProgress(doneCount)}</Body>
        {record.chest === 'ready' ? (
          <Button
            testID="open-chest"
            icon={icons.chest}
            label={t.quests.chestReady}
            onPress={() => dispatch({ type: 'open_chest' })}
          />
        ) : null}
        {record.chest === 'opened' ? (
          <Body style={styles.opened}>
            {icons.check} {t.quests.chestOpened}
          </Body>
        ) : null}
      </Card>

      <Card>
        <Text style={styles.questName}>
          {icons.streak} {t.quests.streakTitle} — {t.quests.streakDays(streak.count)}
        </Text>
        <Body>{t.quests.multiplierToday(formatMultiplier(record.multiplier))}</Body>
        <Body muted>
          {nextTier
            ? t.quests.nextTier(nextTier.days, formatMultiplier(nextTier.multiplier))
            : t.quests.topTier}
        </Body>
        {multiplierForStreak(streak.count) > record.multiplier ? (
          <Body style={styles.opened}>
            {t.hud.multiplier(multiplierForStreak(streak.count))} dès demain
          </Body>
        ) : null}
        <View style={styles.divider} />
        <Body>
          {icons.joker} {t.quests.jokers(streak.jokers)}
        </Body>
        <Body muted>{t.quests.jokersHint}</Body>
        <Body muted style={styles.italic}>
          {t.quests.restIsSport}
        </Body>
      </Card>

      <Card>
        <Text style={styles.questName}>{t.quests.todayGains}</Text>
        <ProgressBar
          value={evaluation.basePulses / DAILY_BASE_PULSE_CAP}
          color={colors.pulse}
          label={t.quests.todayGains}
        />
        <Body muted>{t.quests.basePulses(evaluation.basePulses, DAILY_BASE_PULSE_CAP)}</Body>
        {evaluation.capped.pulses ? <Body style={styles.opened}>{t.quests.capReached}</Body> : null}
        <View style={styles.divider} />
        <Body muted>
          {t.quests.extraTitle} : {t.quests.extraBody}
        </Body>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  questHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  questIcon: { fontSize: 30 },
  questName: { fontSize: font.label, fontWeight: '700', color: colors.text },
  reward: { fontSize: font.body, fontWeight: '700', color: colors.pulse },
  rewardDone: { color: colors.success },
  bonusDone: { borderColor: colors.streak },
  opened: { color: colors.primaryDark, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  italic: { fontStyle: 'italic' },
});
