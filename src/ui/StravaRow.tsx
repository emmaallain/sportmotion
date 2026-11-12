import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  connectStrava,
  finishStravaConnect,
  syncStrava,
  unlinkStrava,
} from '@/activity/stravaSync';
import type { StravaOutcome } from '@/activity/stravaSync';
import { getStravaConnection, isStravaAvailable } from '@/data/strava';
import type { StravaConnection } from '@/data/strava';
import { t } from '@/i18n';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';

import { Body, Button } from './components';
import { colors, font, radius, spacing } from './theme';

/**
 * Strava in the profile. Needs the online mode: the consent flow and the activity import
 * run on the server. `returned` is the outcome carried by the address when the player comes
 * back from Strava's consent page on the web.
 */
export function StravaRow({ returned }: { returned?: StravaOutcome | null }) {
  const enabled = useSettings((s) => s.stravaEnabled);
  const [connection, setConnection] = useState<StravaConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const available = isStravaAvailable();

  useEffect(() => {
    if (!available) return;
    let alive = true;
    void getStravaConnection().then((next) => {
      if (alive) setConnection(next);
    });
    return () => {
      alive = false;
    };
  }, [available, enabled, revision]);

  const announce = (outcome: StravaOutcome) => {
    const messages = {
      connected: [t.profile.stravaConnected, 'success'],
      denied: [t.profile.stravaDenied, 'info'],
      error: [t.profile.stravaError, 'warning'],
    } as const;
    useUi.getState().pushToast(messages[outcome][0], messages[outcome][1]);
  };

  // Back from Strava on the web: finish the connection once.
  useEffect(() => {
    if (!returned || !available) return;
    void finishStravaConnect(returned).then((outcome) => {
      announce(outcome);
      setRevision((n) => n + 1);
      // drop the marker from the address so it is not handled twice
      router.setParams({ strava: '' });
    });
  }, [returned, available]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    await action().catch(() => undefined);
    setBusy(false);
    setRevision((n) => n + 1);
  };

  const connected = available && enabled && connection !== null;

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Text style={styles.label}>🟧 {t.sources.strava}</Text>
        {connected ? (
          <Text style={[styles.tag, styles.tagOn]}>{t.profile.sourceConnected}</Text>
        ) : available ? (
          <Button
            small
            testID="connect-strava"
            label={t.profile.sourceConnect}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                const outcome = await connectStrava();
                if (outcome !== 'redirecting') announce(outcome);
              })
            }
          />
        ) : (
          <Text style={[styles.tag, styles.tagOff]}>{t.profile.sourceOff}</Text>
        )}
      </View>
      <Body muted>{available ? t.profile.stravaHint : t.profile.stravaLocal}</Body>
      {connected ? (
        <>
          {connection.athleteName ? (
            <Body>{t.profile.stravaConnectedAs(connection.athleteName)}</Body>
          ) : null}
          <View style={styles.actions}>
            <Button
              small
              label={t.profile.sourceSync}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const added = await syncStrava();
                  useUi
                    .getState()
                    .pushToast(
                      added === null ? t.profile.stravaError : t.profile.sourceSynced(added),
                      added === null ? 'warning' : 'info',
                    );
                })
              }
              style={styles.flex}
            />
            <Button
              small
              variant="secondary"
              label={t.profile.sourceDisconnect}
              disabled={busy}
              onPress={() => void run(unlinkStrava)}
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
