import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { multiplierForStreak } from '@/game/economy';
import type { MaterialId } from '@/game/economy';
import { dayRecord, selectLevel } from '@/game/engine';
import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';

import { ProgressBar } from './components';
import { colors, font, icons, radius, spacing } from './theme';

const BASIC: MaterialId[] = ['wood', 'stone', 'water', 'energy'];

/** Top bar: Pulses, materials, level + XP bar, streak + multiplier. */
export function Hud() {
  const game = useGame((s) => s.game);
  const today = useGame((s) => s.today);
  const level = selectLevel(game);
  const multiplier = dayRecord(game, today).multiplier;
  const nextMultiplier = multiplierForStreak(game.streak.count);
  const materials = [
    ...BASIC,
    ...(['brick', 'glass', 'steel'] as MaterialId[]).filter(
      (m) => game.balances.materials[m] > 0 || (m === 'brick' && game.era >= 2),
    ),
  ];

  // Small "beat" of the Pulses counter whenever the balance changes.
  const beat = useSharedValue(1);
  const pulses = game.balances.pulses;
  useEffect(() => {
    beat.set(withSequence(withTiming(1.18, { duration: 120 }), withTiming(1, { duration: 180 })));
  }, [pulses, beat]);
  const beatStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.get() }] }));

  return (
    <View style={styles.hud} accessibilityRole="summary">
      <View style={styles.row}>
        <Animated.View
          style={[styles.pill, styles.pulsePill, beatStyle]}
          accessible
          accessibilityLabel={t.hud.a11yPulses(pulses)}
          testID="hud-pulses"
        >
          <Text style={styles.pillIcon}>{icons.pulses}</Text>
          <Text style={styles.pulseValue}>{pulses.toLocaleString('fr-FR')}</Text>
        </Animated.View>

        <View
          style={styles.levelBox}
          accessible
          accessibilityLabel={t.hud.a11yLevel(level.level, Math.round(level.progress * 100))}
        >
          <Text style={styles.levelText}>
            {icons.xp} {t.common.levelShort(level.level)}
          </Text>
          <ProgressBar value={level.progress} color={colors.xp} height={8} />
        </View>

        <View
          style={[styles.pill, styles.streakPill]}
          accessible
          accessibilityLabel={t.hud.a11yStreak(game.streak.count, multiplier)}
          testID="hud-streak"
        >
          <Text style={styles.pillIcon}>{icons.streak}</Text>
          <Text style={styles.streakValue}>{game.streak.count}</Text>
          <Text style={styles.multiplier}>
            {t.hud.multiplier(Math.max(multiplier, nextMultiplier))}
          </Text>
        </View>
      </View>

      <View style={styles.materials}>
        {materials.map((m) => (
          <View
            key={m}
            style={styles.material}
            accessible
            accessibilityLabel={t.hud.a11yMaterial(t.materials[m] ?? m, game.balances.materials[m])}
          >
            <Text style={styles.materialIcon}>{icons.materials[m]}</Text>
            <Text style={styles.materialValue}>{game.balances.materials[m]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pulsePill: { backgroundColor: '#FBEDEA', borderColor: '#E9C4BE' },
  streakPill: { backgroundColor: '#FBF0E0', borderColor: '#EBD3AE' },
  pillIcon: { fontSize: font.body },
  pulseValue: { fontSize: font.label, fontWeight: '800', color: colors.pulse },
  streakValue: { fontSize: font.label, fontWeight: '800', color: colors.streak },
  multiplier: { fontSize: font.small, fontWeight: '700', color: colors.text },
  levelBox: { flex: 1, gap: 4 },
  levelText: { fontSize: font.small, fontWeight: '700', color: colors.text },
  materials: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  material: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  materialIcon: { fontSize: font.body },
  materialValue: { fontSize: font.body, fontWeight: '700', color: colors.text },
});
