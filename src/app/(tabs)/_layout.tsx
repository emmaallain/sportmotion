import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';

import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';
import { useUi } from '@/state/uiStore';
import { colors, font, icons } from '@/ui/theme';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  const onboardingDone = useGame((s) => s.game.onboardingDone);
  const chestReady = useGame((s) => s.game.days[s.today]?.chest === 'ready');
  const tutorial = useUi((s) => s.tutorial);
  // The guided placement of the first house happens on the city tab, before onboarding ends.
  if (!onboardingDone && tutorial === null) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64 },
        tabBarLabelStyle: { fontSize: font.small - 1, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t.tabs.city, tabBarIcon: icon(icons.tabs.city) }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: t.tabs.quests,
          tabBarIcon: icon(icons.tabs.quests),
          tabBarBadge: chestReady ? icons.chest : undefined,
        }}
      />
      <Tabs.Screen
        name="activities"
        options={{ title: t.tabs.activities, tabBarIcon: icon(icons.tabs.activities) }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: t.tabs.progress, tabBarIcon: icon(icons.tabs.progress) }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t.tabs.profile, tabBarIcon: icon(icons.tabs.profile) }}
      />
    </Tabs>
  );
}
