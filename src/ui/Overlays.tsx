import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  ZoomIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { useUi } from '@/state/uiStore';
import type { Toast } from '@/state/uiStore';

import { Button } from './components';
import { colors, font, icons, radius, spacing } from './theme';

const TOAST_MS = 2600;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUi((s) => s.dismissToast);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);
  const tone = {
    info: colors.text,
    success: colors.primaryDark,
    warning: colors.accent,
  }[toast.tone];
  return (
    <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutUp.duration(180)}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        onPress={() => dismiss(toast.id)}
        style={[styles.toast, { borderLeftColor: tone }]}
      >
        <Text style={styles.toastText}>{toast.text}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** "+54 ❤️" rising from the middle of the screen toward the Pulses counter. */
function Flight({ id, amount }: { id: number; amount: number }) {
  const land = useUi((s) => s.landFlight);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(land)(id);
      }),
    );
  }, [id, land, progress]);
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p < 0.8 ? 1 : (1 - p) * 5,
      transform: [{ translateY: -260 * p }, { translateX: -110 * p * p }, { scale: 1.3 - 0.5 * p }],
    };
  });
  return (
    <Animated.View style={[styles.flight, style]} pointerEvents="none">
      <Text style={styles.flightText}>
        +{amount} {icons.pulses}
      </Text>
    </Animated.View>
  );
}

/** Toasts, flying Pulses and celebration dialogs, above every screen. */
export function Overlays() {
  const toasts = useUi((s) => s.toasts);
  const flights = useUi((s) => s.flights);
  const celebration = useUi((s) => s.celebrations[0]);
  const dismiss = useUi((s) => s.dismissCelebration);
  const insets = useSafeAreaInsets();

  const emoji = { level: '⭐', era: '🏙️', full_day: '🎉', chest: icons.chest };

  return (
    <>
      <View style={[styles.toasts, { top: insets.top + 96 }]} pointerEvents="box-none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </View>
      <View style={styles.flights} pointerEvents="none">
        {flights.map((f) => (
          <Flight key={f.id} id={f.id} amount={f.amount} />
        ))}
      </View>
      <Modal
        visible={celebration !== undefined}
        transparent
        animationType="fade"
        onRequestClose={dismiss}
      >
        <View style={styles.backdrop}>
          {celebration ? (
            <Animated.View
              key={celebration.id}
              entering={ZoomIn.springify().damping(14)}
              style={styles.dialog}
              accessibilityViewIsModal
            >
              <Text style={styles.dialogEmoji}>{emoji[celebration.kind]}</Text>
              <Text accessibilityRole="header" style={styles.dialogTitle}>
                {celebration.title}
              </Text>
              <Text style={styles.dialogBody}>{celebration.body}</Text>
              {celebration.lines?.map((line) => (
                <Text key={line} style={styles.dialogLine}>
                  {line}
                </Text>
              ))}
              <Button label={t.common.ok} onPress={dismiss} testID="celebration-ok" />
            </Animated.View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toasts: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  toast: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: 480,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  toastText: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  flights: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flight: { position: 'absolute' },
  flightText: {
    fontSize: font.hero,
    fontWeight: '800',
    color: colors.pulse,
    textShadowColor: '#FFFFFF',
    textShadowRadius: 6,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
  },
  dialogEmoji: { fontSize: 56 },
  dialogTitle: { fontSize: font.hero, fontWeight: '800', color: colors.text, textAlign: 'center' },
  dialogBody: { fontSize: font.label, color: colors.textMuted, textAlign: 'center' },
  dialogLine: { fontSize: font.label, color: colors.text, fontWeight: '700' },
});
