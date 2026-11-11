import { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  addManualActivity,
  addSimulatedFullDay,
  addSimulatedSession,
  addSimulatedSteps,
} from '@/activity/actions';
import { ACTIVITY_TYPES, addDays, evaluateDay } from '@/game/economy';
import type { Activity, ActivityType } from '@/game/economy';
import { selectToday } from '@/game/engine';
import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { Screen } from '@/ui/Screen';
import { Body, Button, Card, Chip, Title } from '@/ui/components';
import { colors, font, icons, radius, spacing } from '@/ui/theme';

/** The simulator is the default activity source of the MVP, so its panel is always shown. */
const SIMULATOR_ENABLED = true;

function formatDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function ActivityRow({ activity, counted }: { activity: Activity; counted: boolean }) {
  const detail =
    activity.steps !== undefined
      ? `${t.common.minutes(activity.durationMin)} · ${t.common.steps(activity.steps)}`
      : t.common.minutes(activity.durationMin);
  return (
    <View style={[styles.activityRow, !counted && styles.notCounted]}>
      <Text style={styles.activityIcon}>{icons.activities[activity.type]}</Text>
      <View style={styles.flex}>
        <Text style={styles.activityName}>{t.activityTypes[activity.type]}</Text>
        <Body muted>{detail}</Body>
      </View>
      <View style={styles.badges}>
        <Text style={styles.badge}>{t.sources[activity.source]}</Text>
        {activity.source === 'manual' ? (
          <Text style={[styles.badge, styles.badgeHalf]}>{t.activities.halfGains}</Text>
        ) : null}
      </View>
    </View>
  );
}

function ManualForm({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [type, setType] = useState<ActivityType>('walk');
  const [duration, setDuration] = useState('30');
  const [steps, setSteps] = useState('');
  const [error, setError] = useState(false);
  const withSteps = type === 'walk' || type === 'run';

  const submit = () => {
    const result = addManualActivity({
      type,
      durationMin: Number(duration.replace(',', '.')),
      steps: withSteps && steps.trim() !== '' ? Number(steps) : undefined,
    });
    if (result === null) {
      setError(true);
      return;
    }
    setError(false);
    if (result.ok) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Title>{t.activities.manualTitle}</Title>
          <Body muted>{t.activities.manualHint}</Body>

          <Text style={styles.fieldLabel}>{t.activities.type}</Text>
          <View style={styles.chips}>
            {ACTIVITY_TYPES.map((a) => (
              <Chip
                key={a}
                icon={icons.activities[a]}
                label={t.activityTypes[a] ?? a}
                selected={type === a}
                onPress={() => setType(a)}
              />
            ))}
          </View>

          <Text style={styles.fieldLabel}>{t.activities.duration}</Text>
          <TextInput
            testID="manual-duration"
            accessibilityLabel={t.activities.duration}
            keyboardType="number-pad"
            value={duration}
            onChangeText={setDuration}
            style={styles.input}
            maxLength={3}
          />
          {withSteps ? (
            <>
              <Text style={styles.fieldLabel}>{t.activities.stepsOptional}</Text>
              <TextInput
                accessibilityLabel={t.activities.stepsOptional}
                keyboardType="number-pad"
                value={steps}
                onChangeText={setSteps}
                style={styles.input}
                maxLength={6}
                placeholder="—"
                placeholderTextColor={colors.locked}
              />
            </>
          ) : null}
          {error ? <Body style={styles.error}>{t.activities.invalidDuration}</Body> : null}

          <View style={styles.sheetActions}>
            <Button
              label={t.common.cancel}
              variant="secondary"
              onPress={onClose}
              style={styles.flex}
            />
            <Button
              testID="manual-save"
              label={t.activities.save}
              onPress={submit}
              style={styles.flex}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SimulatePanel() {
  const online = useGame((s) => s.online);
  const refreshDay = useGame((s) => s.refreshDay);
  const shiftDay = useSettings((s) => s.shiftDay);
  const nextDay = (days: number) => {
    shiftDay(days);
    refreshDay();
    useUi.getState().pushToast(formatDay(useGame.getState().today), 'info');
  };
  const sessions: [ActivityType, number][] = [
    ['strength', 30],
    ['run', 30],
    ['cycling', 45],
    ['stretch', 15],
    ['yoga', 30],
  ];
  return (
    <Card style={styles.simulate}>
      <Text style={styles.sectionTitle}>🧪 {t.activities.simulateTitle}</Text>
      <Body muted>{t.activities.simulateHint}</Body>
      <View style={styles.chips}>
        {[1000, 5000, 10000].map((n) => (
          <Button
            key={n}
            small
            variant="secondary"
            testID={`sim-steps-${n}`}
            label={t.activities.simSteps(n)}
            onPress={() => addSimulatedSteps(n)}
          />
        ))}
        {sessions.map(([type, min]) => (
          <Button
            key={type}
            small
            variant="secondary"
            testID={`sim-${type}`}
            icon={icons.activities[type]}
            label={t.activities.simSession(t.activityTypes[type] ?? type, min)}
            onPress={() => addSimulatedSession(type, min)}
          />
        ))}
      </View>
      <Button
        testID="sim-full-day"
        icon="🎯"
        label={t.activities.simFullDay}
        onPress={addSimulatedFullDay}
      />
      {online ? null : (
        <>
          <Body muted>{t.activities.simNextDayHint}</Body>
          <View style={styles.sheetActions}>
            <Button
              small
              variant="secondary"
              testID="sim-next-day"
              icon="⏭️"
              label={t.activities.simNextDay}
              onPress={() => nextDay(1)}
              style={styles.flex}
            />
            <Button
              small
              variant="secondary"
              testID="sim-skip-day"
              icon={icons.joker}
              label={t.activities.simSkipDay}
              onPress={() => nextDay(2)}
              style={styles.flex}
            />
          </View>
        </>
      )}
    </Card>
  );
}

export default function ActivitiesScreen() {
  const game = useGame((s) => s.game);
  const today = useGame((s) => s.today);
  const [formOpen, setFormOpen] = useState(false);

  const { record, evaluation } = selectToday(game, today);
  const countedIds = new Set(evaluation.accepted.map((a) => a.id));
  const activities = [...record.activities].sort((a, b) => b.startMs - a.startMs);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).map((key) => {
    const day = game.days[key];
    const summary = evaluateDay(day?.activities ?? []);
    return { key, summary, completed: day?.completed ?? false, pulses: day?.granted.pulses ?? 0 };
  });

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Title>{t.activities.title}</Title>
          <Body muted>{formatDay(today)}</Body>
        </View>
        <Button
          testID="add-activity"
          small
          icon="＋"
          label={t.activities.add}
          onPress={() => setFormOpen(true)}
        />
      </View>

      <Card>
        <Text style={styles.sectionTitle}>{t.activities.today}</Text>
        <View style={styles.totals}>
          {(
            [
              [
                icons.activities.walk,
                t.activities.totals.steps,
                t.common.steps(evaluation.totals.steps),
              ],
              [
                icons.activities.strength,
                t.activities.totals.sport,
                t.common.minutes(evaluation.totals.sportMin),
              ],
              [
                icons.activities.yoga,
                t.activities.totals.stretch,
                t.common.minutes(evaluation.totals.stretchMin),
              ],
            ] as const
          ).map(([icon, label, value]) => (
            <View
              key={label}
              style={styles.total}
              accessible
              accessibilityLabel={`${label} : ${value}`}
            >
              <Text style={styles.activityIcon}>{icon}</Text>
              <Text style={styles.totalValue}>{value}</Text>
              <Body muted>{label}</Body>
            </View>
          ))}
        </View>
        {activities.length === 0 ? (
          <Body muted>{t.activities.empty}</Body>
        ) : (
          activities.map((a) => (
            <ActivityRow key={a.id} activity={a} counted={countedIds.has(a.id)} />
          ))
        )}
      </Card>

      {SIMULATOR_ENABLED ? <SimulatePanel /> : null}

      <Card>
        <Text style={styles.sectionTitle}>{t.activities.week}</Text>
        {week.map(({ key, summary, completed, pulses }) => (
          <View key={key} style={styles.weekRow}>
            <Text style={styles.weekDay}>{formatDay(key)}</Text>
            <Body muted style={styles.flex}>
              {t.activities.weekDay(
                summary.totals.steps,
                summary.totals.sportMin + summary.totals.stretchMin,
              )}
            </Body>
            <Text
              style={styles.weekPulses}
              accessibilityLabel={`${t.common.pulses(pulses)}${completed ? `, ${t.activities.complete}` : ''}`}
            >
              {completed ? `${icons.check} ` : ''}
              {pulses > 0 ? `+${pulses}` : '—'}
            </Text>
          </View>
        ))}
      </Card>

      <ManualForm visible={formOpen} onClose={() => setFormOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionTitle: { fontSize: font.label, fontWeight: '700', color: colors.text },
  totals: { flexDirection: 'row', gap: spacing.sm },
  total: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  totalValue: { fontSize: font.label, fontWeight: '800', color: colors.text },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  notCounted: { opacity: 0.5 },
  activityIcon: { fontSize: 26 },
  activityName: { fontSize: font.label, fontWeight: '700', color: colors.text },
  badges: { alignItems: 'flex-end', gap: 4 },
  badge: {
    fontSize: font.small,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  badgeHalf: { color: colors.accent, fontWeight: '700' },
  simulate: { borderStyle: 'dashed', borderColor: colors.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  weekDay: { width: 92, fontSize: font.body, fontWeight: '700', color: colors.text },
  weekPulses: { fontSize: font.body, fontWeight: '700', color: colors.pulse },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    width: '100%',
    maxWidth: 640,
  },
  fieldLabel: { fontSize: font.body, fontWeight: '700', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    fontSize: font.label,
    color: colors.text,
    backgroundColor: '#FFFFFF',
  },
  error: { color: colors.danger, fontWeight: '600' },
  sheetActions: { flexDirection: 'row', gap: spacing.md },
});
