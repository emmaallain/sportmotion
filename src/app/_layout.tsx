import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AudioManager } from '@/audio/AudioManager';
import { useGame } from '@/state/gameStore';
import { GameEffects } from '@/ui/GameEffects';
import { Overlays } from '@/ui/Overlays';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  const hydrated = useGame((s) => s.hydrated);
  const hydrate = useGame((s) => s.hydrate);
  const refreshDay = useGame((s) => s.refreshDay);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // The day can change while the app is open or in the background.
  useEffect(() => {
    const timer = setInterval(refreshDay, 60_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshDay();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refreshDay]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {hydrated ? (
          <>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
              <Stack.Screen name="shop" options={{ presentation: 'modal' }} />
              <Stack.Screen name="interior/[id]" />
            </Stack>
            <AudioManager />
            <GameEffects />
            <Overlays />
          </>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
