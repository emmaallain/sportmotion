import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CITY_CATEGORIES, CITY_ITEMS, getCityItem } from '@/game/catalog';
import type { CityCategory, CityItem } from '@/game/catalog';
import { suggestSpot } from '@/game/city';
import { ALL_MATERIALS } from '@/game/economy';
import { canAfford, selectLevel } from '@/game/engine';
import { ERAS, lockReason } from '@/game/progression';
import type { LockReason } from '@/game/progression';
import { t } from '@/i18n';
import { useGame } from '@/state/gameStore';
import { useUi } from '@/state/uiStore';
import { Hud } from '@/ui/Hud';
import { SpriteThumb } from '@/ui/SpriteThumb';
import { Button, Chip, CostRow, Title } from '@/ui/components';
import { colors, font, icons, radius, spacing } from '@/ui/theme';

const CATEGORY_ICONS: Record<CityCategory, string> = {
  roads: '🛣️',
  housing: '🏠',
  farm: '🌾',
  services: '🏫',
  decoration: '🌳',
};

export function lockLabel(lock: LockReason): string {
  switch (lock.type) {
    case 'coming_soon':
      return t.shop.comingSoon;
    case 'era': {
      const key = ERAS.find((e) => e.id === lock.era)?.key ?? 'village';
      return t.shop.lockedEra(t.eras[key]?.short ?? '');
    }
    case 'level':
      return t.shop.lockedLevel(lock.level);
  }
}

function ItemCard({ item }: { item: CityItem }) {
  const game = useGame((s) => s.game);
  const lock = lockReason(item, { era: game.era, level: selectLevel(game).level });
  const affordable = canAfford(game.balances, item.cost);
  const name = t.items[item.id] ?? item.id;

  const choose = () => {
    const spot = suggestSpot(game.city, getCityItem, item);
    useUi.getState().setPlacement({
      mode: 'new',
      itemId: item.id,
      rot: 0,
      x: item.kind === 'road' ? null : (spot?.x ?? null),
      y: item.kind === 'road' ? null : (spot?.y ?? null),
    });
    router.back();
  };

  return (
    <View
      style={[styles.card, lock && styles.cardLocked]}
      testID={`shop-item-${item.id}`}
      accessible={lock !== null}
      accessibilityLabel={lock ? t.shop.a11yItem(name, lockLabel(lock)) : undefined}
    >
      <SpriteThumb kind="city" spriteId={item.sprite} size={item.size} dimmed={lock !== null} />
      <View style={styles.cardBody}>
        <Text style={[styles.name, lock && styles.lockedText]}>{name}</Text>
        {lock ? (
          <Text style={styles.lock}>
            {icons.lock} {lockLabel(lock)}
          </Text>
        ) : (
          <>
            <CostRow cost={item.cost} balances={game.balances} />
            <Text style={styles.meta}>
              {t.shop.size(item.size[0], item.size[1])}
              {item.xp > 0 ? ` · ${t.shop.xpGain(item.xp)}` : ''}
              {item.requiresRoad ? ` · ${t.shop.needsRoad}` : ''}
              {item.maxRooms > 0 ? ` · ${t.shop.rooms(item.maxRooms)}` : ''}
            </Text>
            {item.harvest ? (
              <Text style={styles.harvest}>
                🧺{' '}
                {t.shop.harvest(
                  ALL_MATERIALS.filter((m) => (item.harvest?.yield[m] ?? 0) > 0)
                    .map((m) => `+${item.harvest?.yield[m]} ${icons.materials[m]}`)
                    .join(' '),
                  item.harvest.trigger === 'full_day'
                    ? t.quests.fullDayShort
                    : t.quests[item.harvest.trigger],
                )}
              </Text>
            ) : null}
          </>
        )}
      </View>
      {lock ? null : (
        <Button
          small
          testID={`shop-choose-${item.id}`}
          label={t.shop.choose}
          accessibilityLabel={`${t.shop.choose} : ${name}`}
          accessibilityHint={affordable ? undefined : t.shop.missing}
          disabled={!affordable}
          onPress={choose}
        />
      )}
    </View>
  );
}

export default function ShopScreen() {
  const [category, setCategory] = useState<CityCategory>('housing');
  const items = CITY_ITEMS.filter((i) => i.category === category);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Hud />
      <View style={styles.header}>
        <Title style={styles.flex}>{t.shop.title}</Title>
        <Button
          small
          variant="ghost"
          testID="shop-close"
          label={t.common.close}
          onPress={() => router.back()}
        />
      </View>
      <View style={styles.categories}>
        {CITY_CATEGORIES.map((c) => (
          <Chip
            key={c}
            icon={CATEGORY_ICONS[c]}
            label={t.shop.categories[c] ?? c}
            selected={c === category}
            onPress={() => setCategory(c)}
          />
        ))}
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ItemCard item={item} />}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardLocked: { backgroundColor: colors.surfaceAlt },
  cardBody: { flex: 1, gap: 4 },
  name: { fontSize: font.label, fontWeight: '700', color: colors.text },
  lockedText: { color: colors.textMuted },
  lock: { fontSize: font.body, color: colors.textMuted, fontWeight: '600' },
  meta: { fontSize: font.small, color: colors.textMuted },
  harvest: { fontSize: font.small, color: colors.primaryDark, fontWeight: '600' },
});
