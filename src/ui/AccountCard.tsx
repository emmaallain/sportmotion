import { Text } from 'react-native';

import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';

import { Body, Card } from './components';
import { colors, font } from './theme';

/** Account section of the profile. Offline: explains that data stays on the device. */
export function AccountCard() {
  const online = useGame((s) => s.online);
  return (
    <Card>
      <Text style={{ fontSize: font.label, fontWeight: '800', color: colors.text }}>
        👤 {t.profile.account}
      </Text>
      <Body muted>{online ? t.profile.onlineMode : t.profile.localMode}</Body>
    </Card>
  );
}
