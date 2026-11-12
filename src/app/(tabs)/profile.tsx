import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';
import { useSettings } from '@/state/settingsStore';
import { AccountCard } from '@/ui/AccountCard';
import { HealthSourceRow } from '@/ui/HealthSourceRow';
import { Screen } from '@/ui/Screen';
import { Body, Button, Card, Title } from '@/ui/components';
import { ConfirmDialog } from '@/ui/dialogs';
import { TOUCH, colors, font, radius, spacing } from '@/ui/theme';

function VolumeRow({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  testID: string;
}) {
  const steps = 10;
  const level = Math.round(value * steps);
  return (
    <View style={styles.volume}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={styles.volumeControls}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: level * 10 }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          onChange(value + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))
        }
      >
        <Pressable
          testID={`${testID}-down`}
          accessibilityRole="button"
          accessibilityLabel={t.profile.decrease(label)}
          onPress={() => onChange(value - 0.1)}
          style={styles.step}
        >
          <Text style={styles.stepGlyph}>－</Text>
        </Pressable>
        <View style={styles.bars}>
          {Array.from({ length: steps }, (_, i) => (
            <View key={i} style={[styles.barTick, i < level && styles.barTickOn]} />
          ))}
        </View>
        <Pressable
          testID={`${testID}-up`}
          accessibilityRole="button"
          accessibilityLabel={t.profile.increase(label)}
          onPress={() => onChange(value + 0.1)}
          style={styles.step}
        >
          <Text style={styles.stepGlyph}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const settings = useSettings();
  const game = useGame((s) => s.game);
  const reset = useGame((s) => s.reset);
  const [confirmReset, setConfirmReset] = useState(false);

  const sources: [string, string][] = [
    ['🧪', t.sources.mock ?? ''],
    ['✍️', t.sources.manual ?? ''],
  ];

  return (
    <Screen>
      <Title>{t.profile.title}</Title>

      <Card>
        <Text style={styles.cardTitle}>🔊 {t.profile.sound}</Text>
        <View style={styles.switchRow}>
          <Text style={styles.label}>{t.profile.mute}</Text>
          <Switch
            testID="mute-switch"
            accessibilityLabel={t.profile.mute}
            value={settings.muted}
            onValueChange={settings.setMuted}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        <VolumeRow
          testID="music-volume"
          label={t.profile.musicVolume}
          value={settings.musicVolume}
          onChange={settings.setMusicVolume}
        />
        <VolumeRow
          testID="sfx-volume"
          label={t.profile.sfxVolume}
          value={settings.sfxVolume}
          onChange={settings.setSfxVolume}
        />
        <Body muted>{t.profile.silentMode}</Body>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>👟 {t.profile.sourcesTitle}</Text>
        {sources.map(([icon, name]) => (
          <View key={name} style={styles.switchRow}>
            <Text style={styles.label}>
              {icon} {name}
            </Text>
            <Text style={[styles.tag, styles.tagOn]}>{t.profile.sourceActive}</Text>
          </View>
        ))}
        <HealthSourceRow platform="ios" />
        <HealthSourceRow platform="android" />
      </Card>

      <AccountCard />

      <Card>
        <Text style={styles.cardTitle}>📊 {t.profile.stats}</Text>
        <Body>{t.profile.bestStreak(game.streak.bestCount)}</Body>
        <Body>{t.profile.buildings(game.city.items.length)}</Body>
      </Card>

      <Button
        variant="secondary"
        testID="replay-onboarding"
        label={t.profile.replayOnboarding}
        onPress={() => router.push('/onboarding')}
      />
      <Button
        variant="danger"
        testID="reset-game"
        label={t.profile.reset}
        onPress={() => setConfirmReset(true)}
      />
      <Body muted style={styles.version}>
        {t.profile.version(Constants.expoConfig?.version ?? '1.0.0')}
      </Body>

      <ConfirmDialog
        visible={confirmReset}
        title={t.profile.resetConfirmTitle}
        body={t.profile.resetConfirmBody}
        confirmLabel={t.profile.reset}
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          useSettings.getState().resetDayOffset();
          void reset();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: font.label, fontWeight: '800', color: colors.text },
  label: { fontSize: font.body, color: colors.text, fontWeight: '600', flexShrink: 1 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TOUCH,
    gap: spacing.md,
  },
  volume: { gap: spacing.xs },
  volumeControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 20, fontWeight: '700', color: colors.text },
  bars: { flex: 1, flexDirection: 'row', gap: 4, alignItems: 'center' },
  barTick: { flex: 1, height: 14, borderRadius: 4, backgroundColor: colors.surfaceAlt },
  barTickOn: { backgroundColor: colors.primary },
  tag: {
    fontSize: font.small,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  tagOn: { backgroundColor: '#DDEBD6', color: colors.primaryDark },
  version: { textAlign: 'center' },
});
