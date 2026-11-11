import { StyleSheet, Text, View } from 'react-native';

import { getRecipe } from '@/game/catalog';
import type { CityItem } from '@/game/catalog';
import { ALL_MATERIALS } from '@/game/economy';
import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';

import { Button, CostRow } from './components';
import { Dialog } from './dialogs';
import { colors, font, icons, spacing } from './theme';

/** Workshop dialog: turns basic materials into advanced ones (instant in the MVP). */
export function CraftDialog({
  building,
  onClose,
}: {
  building: CityItem | null;
  onClose: () => void;
}) {
  const balances = useGame((s) => s.game.balances);
  const dispatch = useGame((s) => s.dispatch);
  const recipes = (building?.recipes ?? []).map(getRecipe).filter((r) => r !== undefined);

  return (
    <Dialog
      visible={building !== null}
      title={`${t.craft.title} — ${building ? t.items[building.id] : ''}`}
      onClose={onClose}
      actions={
        <Button label={t.common.close} variant="secondary" onPress={onClose} style={styles.flex} />
      }
    >
      {recipes.map((recipe) => {
        const max = Math.min(
          ...ALL_MATERIALS.filter((m) => (recipe.inputs[m] ?? 0) > 0).map((m) =>
            Math.floor(balances.materials[m] / (recipe.inputs[m] ?? 1)),
          ),
        );
        const craft = (quantity: number) =>
          dispatch({ type: 'craft', recipeId: recipe.id, quantity });
        return (
          <View key={recipe.id} style={styles.recipe}>
            <Text style={styles.name}>
              {icons.materials[recipe.output]} {t.materials[recipe.output]}
            </Text>
            <Text style={styles.muted}>{t.craft.stock(balances.materials[recipe.output])}</Text>
            <View style={styles.row}>
              <Text style={styles.muted}>{t.craft.recipe} :</Text>
              <CostRow cost={{ pulses: 0, materials: recipe.inputs }} balances={balances} />
            </View>
            <View style={styles.row}>
              {[1, 5].map((n) => (
                <Button
                  key={n}
                  small
                  testID={`craft-${recipe.id}-${n}`}
                  label={t.craft.make(n)}
                  disabled={max < n}
                  onPress={() => craft(n)}
                  style={styles.flex}
                />
              ))}
              <Button
                small
                testID={`craft-${recipe.id}-max`}
                label={t.craft.make(Math.max(1, max))}
                disabled={max < 1}
                onPress={() => craft(max)}
                style={styles.flex}
              />
            </View>
          </View>
        );
      })}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  recipe: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: font.label, fontWeight: '700', color: colors.text },
  muted: { fontSize: font.body, color: colors.textMuted },
});
