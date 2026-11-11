import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCityItem } from '@/game/catalog';
import { suggestSpot } from '@/game/city';
import { STARTER_BONUS } from '@/game/engine';
import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';
import { useUi } from '@/state/uiStore';
import { SpriteThumb } from '@/ui/SpriteThumb';
import { Button } from '@/ui/components';
import { colors, font, icons, radius, spacing } from '@/ui/theme';

const STEPS = 3;

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const dispatch = useGame((s) => s.dispatch);

  const finish = () => {
    dispatch({ type: 'claim_starter_bonus' });
    dispatch({ type: 'finish_onboarding' });
    router.replace('/');
  };

  /** Hands the starter bonus over and starts the guided placement of the first house. */
  const startTutorial = () => {
    dispatch({ type: 'claim_starter_bonus' });
    const { game } = useGame.getState();
    const house = getCityItem('village_house');
    const alreadyBuilt = game.city.items.some((p) => p.itemId === 'village_house');
    if (!house || alreadyBuilt) {
      finish();
      return;
    }
    const spot = suggestSpot(game.city, getCityItem, house);
    const ui = useUi.getState();
    ui.setTutorial('place_house');
    ui.setPlacement({
      mode: 'new',
      itemId: house.id,
      rot: 0,
      x: spot?.x ?? null,
      y: spot?.y ?? null,
    });
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Text style={styles.brand}>{t.appName}</Text>
        {step < STEPS - 1 ? (
          <Button
            small
            variant="ghost"
            testID="onboarding-skip"
            label={t.onboarding.skip}
            onPress={finish}
          />
        ) : null}
      </View>

      <View style={styles.content}>
        {step === 0 ? (
          <>
            <Text style={styles.hero}>🚶 → {icons.pulses} → 🏡</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {t.onboarding.step1Title}
            </Text>
            <Text style={styles.body}>{t.onboarding.step1Body}</Text>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <Text style={styles.hero}>
              {icons.quests.walk} {icons.quests.sport} {icons.quests.stretch}
            </Text>
            <Text accessibilityRole="header" style={styles.title}>
              {t.onboarding.step2Title}
            </Text>
            <Text style={styles.body}>{t.onboarding.step2Body}</Text>
            <View style={styles.note}>
              <Text style={styles.noteText}>
                {icons.joker} {t.onboarding.step2Rest}
              </Text>
            </View>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <SpriteThumb kind="city" spriteId="village_house" size={[2, 2]} pixels={140} />
            <Text accessibilityRole="header" style={styles.title}>
              {t.onboarding.step3Title}
            </Text>
            <Text style={styles.body}>{t.onboarding.step3Body}</Text>
            <Text style={styles.bonus}>
              {icons.pulses} {STARTER_BONUS.pulses} {icons.materials.wood}{' '}
              {STARTER_BONUS.materials.wood} {icons.materials.stone} {STARTER_BONUS.materials.stone}
            </Text>
          </>
        ) : null}
      </View>

      <View style={styles.footer}>
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={`${step + 1} / ${STEPS}`}
          accessibilityRole="progressbar"
        >
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
        {step < STEPS - 1 ? (
          <Button
            testID="onboarding-next"
            label={t.common.next}
            onPress={() => setStep(step + 1)}
          />
        ) : (
          <Button
            testID="onboarding-start"
            icon="🏡"
            label={t.onboarding.start}
            onPress={startTutorial}
          />
        )}
        {step > 0 ? (
          <Button variant="ghost" label={t.common.back} onPress={() => setStep(step - 1)} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  brand: { fontSize: font.title, fontWeight: '800', color: colors.primaryDark },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  hero: { fontSize: 48, textAlign: 'center' },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: font.label + 1, color: colors.textMuted, textAlign: 'center', lineHeight: 25 },
  note: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  noteText: { fontSize: font.body, color: colors.text, textAlign: 'center', fontWeight: '600' },
  bonus: { fontSize: font.title, fontWeight: '800', color: colors.text },
  footer: {
    padding: spacing.xl,
    gap: spacing.md,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 26 },
});
