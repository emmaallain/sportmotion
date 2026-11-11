import { StyleSheet, Text, View } from 'react-native';

import { selectEraProgress, selectLevel } from '@/game/engine';
import { ERAS, MAX_PLAYABLE_ERA } from '@/game/progression';
import type { Requirement, RequirementStatus } from '@/game/progression';
import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';
import { Screen } from '@/ui/Screen';
import { Body, Button, Card, ProgressBar, Title } from '@/ui/components';
import { colors, font, icons, radius, spacing } from '@/ui/theme';

const ERA_ICONS: Record<string, string> = {
  village: '🏡',
  bourg: '🏘️',
  ville: '🏙️',
  metropole: '🌆',
};

export function requirementLabel(requirement: Requirement): string {
  const r = t.progress.requirement;
  switch (requirement.type) {
    case 'level':
      return r.level(requirement.level);
    case 'tag_count':
      if (requirement.tag === 'housing') return r.housing(requirement.min);
      if (requirement.tag === 'apartment') return r.apartment(requirement.min);
      return r.tag(requirement.tag, requirement.min);
    case 'tag_distinct':
      if (requirement.tag === 'farm') return r.farm(requirement.min);
      return r.tag(requirement.tag, requirement.min);
    case 'item':
      return r.item(t.items[requirement.itemId] ?? requirement.itemId, requirement.min);
    case 'plots_linked':
      return r.plotsLinked;
  }
}

function RequirementRow({ status }: { status: RequirementStatus }) {
  const label = requirementLabel(status.requirement);
  return (
    <View
      style={styles.requirement}
      accessible
      accessibilityLabel={`${label} : ${status.current} / ${status.target}`}
      accessibilityState={{ checked: status.done }}
    >
      <Text style={[styles.check, status.done && styles.checkDone]}>
        {status.done ? icons.check : '○'}
      </Text>
      <Text style={[styles.requirementText, status.done && styles.requirementDone]}>{label}</Text>
      <Text style={styles.count}>
        {status.current} / {status.target}
      </Text>
    </View>
  );
}

export default function ProgressScreen() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const level = selectLevel(game);
  const { status, check } = selectEraProgress(game);
  const current = ERAS.find((e) => e.id === game.era) ?? ERAS[0];
  const next = ERAS.find((e) => e.id === game.era + 1);
  const nextName = next ? (t.eras[next.key]?.name ?? '') : '';

  return (
    <Screen>
      <Title>{t.progress.title}</Title>

      <Card>
        <View style={styles.levelRow}>
          <Text style={styles.levelBadge}>{level.level}</Text>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{t.common.level(level.level)}</Text>
            <Body muted>
              {level.xpForNext > 0
                ? t.progress.xpToNext(level.xpForNext - level.xpIntoLevel)
                : t.progress.maxLevel}
            </Body>
          </View>
          <Text style={styles.totalXp}>
            {icons.xp} {t.common.xp(game.balances.xp)}
          </Text>
        </View>
        <ProgressBar value={level.progress} color={colors.xp} label={t.common.level(level.level)} />
      </Card>

      {next && current ? (
        <Card style={check.ok ? styles.ready : undefined}>
          <Text style={styles.cardTitle}>
            {ERA_ICONS[next.key]} {t.progress.nextEra(nextName)}
          </Text>
          {status.map((s, i) => (
            <RequirementRow key={i} status={s} />
          ))}
          {check.ok ? (
            <Button
              testID="advance-era"
              label={t.progress.advance(nextName)}
              onPress={() => dispatch({ type: 'advance_era' })}
            />
          ) : null}
          {game.era >= MAX_PLAYABLE_ERA ? (
            <View style={styles.soon}>
              <Text style={styles.soonText}>
                {status.every((s) => s.done) ? `${t.progress.allDone} ` : ''}
                {t.progress.comingSoon}
              </Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {ERAS.map((era) => {
        const reached = era.id <= game.era;
        const isCurrent = era.id === game.era;
        const copy = t.eras[era.key];
        return (
          <Card key={era.id} style={[!reached && styles.locked, isCurrent && styles.current]}>
            <View style={styles.levelRow}>
              <Text style={styles.eraIcon}>{ERA_ICONS[era.key]}</Text>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{copy?.name}</Text>
                <Body muted>{t.progress.levels(era.minLevel, era.maxLevel)}</Body>
              </View>
              <Text style={[styles.tag, reached ? styles.tagReached : styles.tagLocked]}>
                {isCurrent
                  ? t.progress.currentEra
                  : reached
                    ? `${icons.check} ${t.progress.reached}`
                    : era.id > MAX_PLAYABLE_ERA
                      ? t.common.soon
                      : `${icons.lock} ${t.progress.locked}`}
              </Text>
            </View>
            <Body muted>
              {t.progress.unlocks} : {copy?.unlocks}
            </Body>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  levelBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.xp,
    color: '#FFFFFF',
    fontSize: font.title,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 52,
    overflow: 'hidden',
  },
  cardTitle: { fontSize: font.label, fontWeight: '800', color: colors.text },
  totalXp: { fontSize: font.body, fontWeight: '700', color: colors.xp },
  requirement: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 32 },
  check: {
    width: 22,
    fontSize: font.label,
    color: colors.locked,
    fontWeight: '800',
    textAlign: 'center',
  },
  checkDone: { color: colors.success },
  requirementText: { flex: 1, fontSize: font.body, color: colors.text },
  requirementDone: { color: colors.textMuted },
  count: { fontSize: font.body, fontWeight: '700', color: colors.text },
  ready: { borderColor: colors.primary, borderWidth: 2 },
  soon: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  soonText: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  locked: { backgroundColor: colors.surfaceAlt },
  current: { borderColor: colors.primary, borderWidth: 2 },
  eraIcon: { fontSize: 34 },
  tag: {
    fontSize: font.small,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  tagReached: { backgroundColor: '#DDEBD6', color: colors.primaryDark },
  tagLocked: { backgroundColor: colors.border, color: colors.text },
});
