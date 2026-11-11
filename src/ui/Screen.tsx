import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Hud } from './Hud';
import { colors, spacing } from './theme';

/** Standard screen: safe area, HUD on top, scrollable content capped to a readable width. */
export function Screen({
  children,
  scroll = true,
  hud = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  hud?: boolean;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {hud ? <Hud /> : null}
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>{children}</View>
        </ScrollView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, gap: spacing.lg },
});
