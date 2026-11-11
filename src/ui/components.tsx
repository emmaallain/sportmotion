import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import type { Cost } from '@/game/catalog';
import { ALL_MATERIALS } from '@/game/economy';
import type { Balances } from '@/game/engine';
import { t } from '@/i18n';

import { TOUCH, colors, font, icons, radius, spacing } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[styles.title, style]}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  style,
  testID,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  return (
    <Text testID={testID} style={[styles.body, muted && styles.muted, style]}>
      {children}
    </Text>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  icon?: string;
  small?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  icon,
  small = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const palette = {
    primary: { bg: colors.primary, fg: colors.textOnPrimary, border: colors.primaryDark },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    danger: { bg: colors.surface, fg: colors.danger, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primaryDark, border: 'transparent' },
  }[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? <Text style={styles.buttonIcon}>{icon}</Text> : null}
      <Text style={[styles.buttonLabel, small && styles.buttonLabelSmall, { color: palette.fg }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ProgressBar({
  value,
  color = colors.primary,
  height = 12,
  label,
}: {
  /** 0..1 */
  value: number;
  color?: string;
  height?: number;
  label?: string;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: height / 2 }]}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

/** "❤️ 150  🪵 10  🪨 5" — amounts the player cannot afford are shown in red. */
export function CostRow({
  cost,
  balances,
  style,
}: {
  cost: Cost;
  balances?: Balances;
  style?: StyleProp<ViewStyle>;
}) {
  const parts: { key: string; icon: string; amount: number; label: string; missing: boolean }[] =
    [];
  if (cost.pulses > 0) {
    parts.push({
      key: 'pulses',
      icon: icons.pulses,
      amount: cost.pulses,
      label: t.resources.pulses,
      missing: balances !== undefined && balances.pulses < cost.pulses,
    });
  }
  for (const m of ALL_MATERIALS) {
    const amount = cost.materials?.[m] ?? 0;
    if (amount > 0) {
      parts.push({
        key: m,
        icon: icons.materials[m] ?? '',
        amount,
        label: t.materials[m] ?? m,
        missing: balances !== undefined && balances.materials[m] < amount,
      });
    }
  }
  return (
    <View
      style={[styles.costRow, style]}
      accessible
      accessibilityLabel={parts.map((p) => `${p.amount} ${p.label}`).join(', ')}
    >
      {parts.map((p) => (
        <Text key={p.key} style={[styles.cost, p.missing && styles.costMissing]}>
          {p.icon} {p.amount}
        </Text>
      ))}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {icon ? `${icon} ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  body: { fontSize: font.body, color: colors.text, lineHeight: 21 },
  muted: { color: colors.textMuted },
  button: {
    minHeight: TOUCH + 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonSmall: { minHeight: TOUCH, paddingHorizontal: spacing.md },
  buttonIcon: { fontSize: font.label },
  buttonLabel: { fontSize: font.label, fontWeight: '700' },
  buttonLabelSmall: { fontSize: font.body },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  track: { backgroundColor: colors.surfaceAlt, overflow: 'hidden', width: '100%' },
  costRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cost: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  costMissing: { color: colors.danger },
  chip: {
    minHeight: TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  chipLabel: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  chipLabelSelected: { color: colors.textOnPrimary },
});
