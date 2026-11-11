import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { getAccount, linkEmail, signIn, signOut } from '@/data/auth';
import type { Account } from '@/data/auth';
import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';
import { useUi } from '@/state/uiStore';

import { Body, Button, Card } from './components';
import { colors, font, radius, spacing } from './theme';

/**
 * Account section of the profile.
 * Local mode: explains that data stays on the device.
 * Online mode: guest account that can be attached to an e-mail, sign in / sign out.
 */
export function AccountCard() {
  const online = useGame((s) => s.online);
  const hydrate = useGame((s) => s.hydrate);
  const [account, setAccount] = useState<Account | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Bumped after every sign-in / sign-out to re-read the account.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    getAccount()
      .catch(() => null)
      .then((next) => {
        if (alive) setAccount(next);
      });
    return () => {
      alive = false;
    };
  }, [online, revision]);

  if (!online) {
    return (
      <Card>
        <Text style={styles.title}>👤 {t.profile.account}</Text>
        <Body muted>{t.profile.localMode}</Body>
      </Card>
    );
  }

  const run = async (action: () => Promise<{ ok: boolean; needsConfirmation?: boolean }>) => {
    setBusy(true);
    const result = await action().catch(() => ({ ok: false, needsConfirmation: false }));
    setBusy(false);
    const toast = useUi.getState().pushToast;
    if (!result.ok) {
      toast(t.profile.authError, 'warning');
      return;
    }
    if (result.needsConfirmation) toast(t.profile.checkEmail, 'info');
    setPassword('');
    await hydrate();
    setRevision((n) => n + 1);
  };

  const valid = /.+@.+\..+/.test(email) && password.length >= 6;
  const guest = account === null || account.anonymous;

  return (
    <Card>
      <Text style={styles.title}>👤 {t.profile.account}</Text>
      <Body muted>{t.profile.onlineMode}</Body>
      {guest ? (
        <>
          <Body>
            {t.profile.anonymous} — {t.profile.linkEmail}
          </Body>
          <TextInput
            accessibilityLabel={t.profile.email}
            placeholder={t.profile.email}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <TextInput
            accessibilityLabel={t.profile.password}
            placeholder={t.profile.password}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />
          <View style={styles.row}>
            <Button
              small
              label={t.profile.signUp}
              disabled={!valid || busy}
              onPress={() => void run(() => linkEmail(email.trim(), password))}
              style={styles.flex}
            />
            <Button
              small
              variant="secondary"
              label={t.profile.signIn}
              disabled={!valid || busy}
              onPress={() => void run(() => signIn(email.trim(), password))}
              style={styles.flex}
            />
          </View>
        </>
      ) : (
        <>
          <Body>{account.email}</Body>
          <Button
            small
            variant="secondary"
            label={t.profile.signOut}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await signOut();
                return { ok: true };
              })
            }
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontSize: font.label, fontWeight: '800', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
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
});
