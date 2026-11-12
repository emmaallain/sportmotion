import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import type { ProviderStatus } from '@/activity/ActivityProvider';
import {
  connectHealth,
  deviceHealthStatus,
  disconnectHealth,
  syncHealth,
} from '@/activity/healthSync';
import { t } from '@/i18n';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';

import { Body, Button } from './components';
import { colors, font, radius, spacing } from './theme';

/**
 * Apple Health (iOS) or Health Connect (Android) in the profile: explains why it is not
 * available (Expo Go, web, other platform) or lets the player connect, sync and disconnect.
 */
export function HealthSourceRow({ platform }: { platform: 'ios' | 'android' }) {
  const enabled = useSettings((s) => s.healthEnabled);
  const syncedAt = useSettings((s) => s.healthSyncedAt);
  const [status, setStatus] = useState<ProviderStatus>('coming_soon');
  const [busy, setBusy] = useState(false);
  const here = Platform.OS === platform;
  const name = platform === 'ios' ? t.sources.healthkit : t.sources.health_connect;
  const icon = platform === 'ios' ? '🍎' : '💚';

  useEffect(() => {
    if (!here) return;
    let alive = true;
    void deviceHealthStatus().then((next) => {
      if (alive) setStatus(next);
    });
    return () => {
      alive = false;
    };
  }, [here, enabled]);

  const toast = useUi.getState().pushToast;
  const connect = async () => {
    setBusy(true);
    const result = await connectHealth();
    setBusy(false);
    if (result === 'refused') toast(t.profile.sourceRefused, 'warning');
    if (result === 'unavailable') toast(t.profile.sourceNeedsBuild, 'warning');
  };
  const sync = async () => {
    setBusy(true);
    const result = await syncHealth();
    setBusy(false);
    toast(result ? t.profile.sourceSynced(result.added) : t.profile.sourceRefused, 'info');
  };

  const usable = here && status !== 'coming_soon' && status !== 'unavailable';
  const connected = usable && enabled;

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Text style={styles.label}>
          {icon} {name}
        </Text>
        {connected ? (
          <Text style={[styles.tag, styles.tagOn]}>{t.profile.sourceConnected}</Text>
        ) : usable ? (
          <Button
            small
            testID={`connect-${platform}`}
            label={t.profile.sourceConnect}
            disabled={busy}
            onPress={() => void connect()}
          />
        ) : (
          <Text style={[styles.tag, styles.tagOff]}>{t.common.soon}</Text>
        )}
      </View>
      {!here ? (
        <Body muted>{t.profile.sourceOtherPlatform}</Body>
      ) : !usable ? (
        <Body muted>{t.profile.sourceNeedsBuild}</Body>
      ) : (
        <Body muted>{t.profile.healthHint}</Body>
      )}
      {connected ? (
        <>
          {syncedAt ? (
            <Body muted>
              {t.profile.sourceLastSync(
                new Date(syncedAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              )}
            </Body>
          ) : null}
          <View style={styles.actions}>
            <Button
              small
              label={t.profile.sourceSync}
              disabled={busy}
              onPress={() => void sync()}
              style={styles.flex}
            />
            <Button
              small
              variant="secondary"
              label={t.profile.sourceDisconnect}
              onPress={disconnectHealth}
              style={styles.flex}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: spacing.xs, paddingVertical: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 44,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  label: { fontSize: font.body, color: colors.text, fontWeight: '600', flexShrink: 1 },
  tag: {
    fontSize: font.small,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  tagOn: { backgroundColor: '#DDEBD6', color: colors.primaryDark },
  tagOff: { backgroundColor: colors.border, color: colors.text },
});
