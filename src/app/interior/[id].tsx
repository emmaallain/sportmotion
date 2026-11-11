import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { playSfx } from '@/audio';
import { FURNITURE, ROOMS, getCityItem, getFurniture } from '@/game/catalog';
import type { FurnitureItem } from '@/game/catalog';
import {
  EMPTY_INTERIOR,
  ROOM_ORIGINS,
  ROOM_SIZE,
  canPlaceFurniture,
  footprint,
  furnitureAt,
} from '@/game/city';
import type { Interior, Rotation } from '@/game/city';
import { SELL_REFUND_RATE, canAfford } from '@/game/engine';
import { t } from '@/i18n';
import { IsoMap } from '@/render/lazy';
import { INTERIOR_VIEW, buildInteriorScene, furnitureGhostOps, selectionOps } from '@/render/scene';
import { useGame } from '@/state/gameStore';
import { Hud } from '@/ui/Hud';
import { SpriteThumb } from '@/ui/SpriteThumb';
import { Button, Chip, CostRow } from '@/ui/components';
import { colors, font, radius, spacing } from '@/ui/theme';

type Placing =
  | { mode: 'new'; furnitureId: string; rot: Rotation; x: number | null; y: number | null }
  | { mode: 'move'; id: string; furnitureId: string; rot: Rotation; x: number; y: number };

let idCounter = 0;
const newId = () => `f-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** First free spot for a piece of furniture, scanning the purchased rooms. */
function firstFreeSpot(interior: Interior, item: FurnitureItem): { x: number; y: number } | null {
  for (let r = 0; r < interior.rooms.length; r++) {
    const [ox, oy] = ROOM_ORIGINS[r] ?? [0, 0];
    for (let y = oy; y < oy + ROOM_SIZE; y++) {
      for (let x = ox; x < ox + ROOM_SIZE; x++) {
        if (canPlaceFurniture(interior, getFurniture, item, x, y, 0).ok) return { x, y };
      }
    }
  }
  return null;
}

export default function InteriorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const [tab, setTab] = useState<'rooms' | 'furniture'>('rooms');
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pulse, setPulse] = useState<{ x: number; y: number; key: number } | null>(null);

  const house = game.city.items.find((p) => p.id === id);
  const houseItem = house ? getCityItem(house.itemId) : undefined;
  const interior = (house && game.interiors[house.id]) || EMPTY_INTERIOR;
  const maxRooms = houseItem?.maxRooms ?? 0;
  const hiddenId = placing?.mode === 'move' ? placing.id : null;

  const scene = useMemo(
    () =>
      buildInteriorScene(
        hiddenId
          ? { ...interior, furniture: interior.furniture.filter((f) => f.id !== hiddenId) }
          : interior,
        maxRooms,
      ),
    [interior, maxRooms, hiddenId],
  );

  const placingItem = placing ? getFurniture(placing.furnitureId) : undefined;
  const selected = interior.furniture.find((f) => f.id === selectedId);
  const selectedItem = selected ? getFurniture(selected.furnitureId) : undefined;
  const valid =
    placing !== null &&
    placingItem !== undefined &&
    placing.x !== null &&
    placing.y !== null &&
    canPlaceFurniture(
      interior,
      getFurniture,
      placingItem,
      placing.x,
      placing.y,
      placing.rot,
      hiddenId ?? undefined,
    ).ok;

  const overlay = useMemo(() => {
    if (placing && placingItem && placing.x !== null && placing.y !== null) {
      return furnitureGhostOps(
        placingItem.sprite,
        placingItem.size,
        placing.x,
        placing.y,
        placing.rot,
        valid,
      );
    }
    if (selected && selectedItem) {
      const [w, h] = footprint(selectedItem.size, selected.rot);
      return selectionOps(selected.x, selected.y, w, h);
    }
    return undefined;
  }, [placing, placingItem, valid, selected, selectedItem]);

  const onTapTile = useCallback(
    (x: number, y: number) => {
      if (placing) {
        setPlacing({ ...placing, x, y });
        return;
      }
      const hit = furnitureAt(interior, getFurniture, x, y);
      setSelectedId(hit && hit.id !== selectedId ? hit.id : null);
    },
    [placing, interior, selectedId],
  );

  if (!house || !houseItem || maxRooms === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.missing}>
          <Text style={styles.name}>{t.errors.not_found}</Text>
          <Button label={t.common.back} onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const confirm = () => {
    if (!placing || !placingItem || placing.x === null || placing.y === null) return;
    const result =
      placing.mode === 'move'
        ? dispatch({
            type: 'move_furniture',
            houseId: house.id,
            id: placing.id,
            x: placing.x,
            y: placing.y,
            rot: placing.rot,
          })
        : dispatch({
            type: 'place_furniture',
            houseId: house.id,
            id: newId(),
            furnitureId: placingItem.id,
            x: placing.x,
            y: placing.y,
            rot: placing.rot,
          });
    if (!result.ok) return;
    playSfx('place');
    const [w, h] = footprint(placingItem.size, placing.rot);
    setPulse({ x: placing.x + w / 2, y: placing.y + h / 2, key: Date.now() });
    setPlacing(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <Hud />
      <View style={styles.header}>
        <Button
          small
          variant="ghost"
          testID="interior-back"
          label={`‹ ${t.common.back}`}
          onPress={() => router.back()}
        />
        <Text accessibilityRole="header" style={[styles.title, styles.flex]} numberOfLines={1}>
          {t.interior.title(t.items[houseItem.id] ?? '')}
        </Text>
        <Text style={styles.meta}>{t.interior.roomCount(interior.rooms.length, maxRooms)}</Text>
      </View>

      <View style={styles.map}>
        <IsoMap
          scene={scene}
          overlay={overlay}
          view={INTERIOR_VIEW}
          onTapTile={onTapTile}
          pulse={pulse}
          background="#D9D2C2"
          accessibilityLabel={t.interior.mapLabel}
          testID="interior-map"
        />
      </View>

      {placing && placingItem ? (
        <View style={styles.panel} testID="furniture-placement-bar">
          <Text style={styles.name}>{t.city.placing(t.furniture[placingItem.id] ?? '')}</Text>
          <Text style={styles.meta}>{t.interior.placingHint}</Text>
          <View style={styles.actions}>
            <Button
              small
              variant="secondary"
              label={t.common.cancel}
              onPress={() => setPlacing(null)}
              style={styles.flex}
            />
            {placingItem.rotatable ? (
              <Button
                small
                variant="secondary"
                icon="↻"
                label={t.city.rotate}
                onPress={() =>
                  setPlacing({ ...placing, rot: placing.rot === 0 ? 1 : 0 } as Placing)
                }
                style={styles.flex}
              />
            ) : null}
            <Button
              small
              testID="furniture-confirm"
              label={t.city.place}
              disabled={!valid}
              onPress={confirm}
              style={styles.flex}
            />
          </View>
        </View>
      ) : selected && selectedItem ? (
        <View style={styles.panel} testID="furniture-selection-bar">
          <Text style={styles.name}>{t.furniture[selectedItem.id]}</Text>
          <View style={styles.actions}>
            <Button
              small
              variant="ghost"
              label={t.common.close}
              onPress={() => setSelectedId(null)}
              style={styles.flex}
            />
            <Button
              small
              variant="secondary"
              label={t.city.move}
              onPress={() => {
                setPlacing({
                  mode: 'move',
                  id: selected.id,
                  furnitureId: selected.furnitureId,
                  rot: selected.rot,
                  x: selected.x,
                  y: selected.y,
                });
                setSelectedId(null);
              }}
              style={styles.flex}
            />
            <Button
              small
              variant="danger"
              testID="furniture-sell"
              label={`${t.city.sell} (+${Math.floor(selectedItem.cost.pulses * SELL_REFUND_RATE)})`}
              onPress={() => {
                dispatch({ type: 'sell_furniture', houseId: house.id, id: selected.id });
                setSelectedId(null);
              }}
              style={styles.flex}
            />
          </View>
        </View>
      ) : (
        <View style={styles.panel}>
          <View style={styles.tabs}>
            <Chip
              label={t.interior.rooms}
              icon="🚪"
              selected={tab === 'rooms'}
              onPress={() => setTab('rooms')}
            />
            <Chip
              label={t.interior.furniture}
              icon="🛋️"
              selected={tab === 'furniture'}
              onPress={() => setTab('furniture')}
            />
          </View>
          {tab === 'rooms' ? (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {interior.rooms.length >= maxRooms ? (
                <Text style={styles.meta}>{t.interior.full}</Text>
              ) : null}
              {ROOMS.map((room) => {
                const owned = interior.rooms.includes(room.id);
                const full = interior.rooms.length >= maxRooms;
                return (
                  <View key={room.id} style={styles.row}>
                    <View style={styles.flex}>
                      <Text style={styles.name}>{t.rooms[room.id]}</Text>
                      {owned ? (
                        <Text style={styles.owned}>✓ {t.interior.owned}</Text>
                      ) : (
                        <CostRow cost={room.cost} balances={game.balances} />
                      )}
                    </View>
                    {owned ? null : (
                      <Button
                        small
                        testID={`buy-room-${room.id}`}
                        label={t.interior.buyRoom}
                        accessibilityLabel={`${t.interior.buyRoom} : ${t.rooms[room.id]}`}
                        disabled={full || !canAfford(game.balances, room.cost)}
                        onPress={() =>
                          dispatch({ type: 'buy_room', houseId: house.id, room: room.id })
                        }
                      />
                    )}
                  </View>
                );
              })}
            </ScrollView>
          ) : interior.rooms.length === 0 ? (
            <Text style={styles.meta}>{t.interior.noRoom}</Text>
          ) : (
            <ScrollView horizontal style={styles.list} contentContainerStyle={styles.furnitureRow}>
              {FURNITURE.map((item) => {
                const affordable = canAfford(game.balances, item.cost);
                return (
                  <View key={item.id} style={styles.furnitureCard}>
                    <SpriteThumb
                      kind="furniture"
                      spriteId={item.sprite}
                      size={item.size}
                      pixels={56}
                    />
                    <Text style={styles.furnitureName} numberOfLines={1}>
                      {t.furniture[item.id]}
                    </Text>
                    <CostRow
                      cost={item.cost}
                      balances={game.balances}
                      style={styles.furnitureCost}
                    />
                    <Button
                      small
                      testID={`choose-furniture-${item.id}`}
                      label={t.shop.choose}
                      accessibilityLabel={`${t.shop.choose} : ${t.furniture[item.id]}`}
                      disabled={!affordable}
                      onPress={() => {
                        const spot = firstFreeSpot(interior, item);
                        setPlacing({
                          mode: 'new',
                          furnitureId: item.id,
                          rot: 0,
                          x: spot?.x ?? null,
                          y: spot?.y ?? null,
                        });
                      }}
                    />
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: font.label, fontWeight: '800', color: colors.text },
  map: { flex: 1 },
  panel: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    maxHeight: 300,
  },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  name: { fontSize: font.label, fontWeight: '700', color: colors.text },
  meta: { fontSize: font.body, color: colors.textMuted },
  owned: { fontSize: font.body, color: colors.success, fontWeight: '700' },
  furnitureRow: { gap: spacing.md, paddingRight: spacing.md },
  furnitureCard: {
    width: 132,
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  furnitureName: { fontSize: font.body, fontWeight: '700', color: colors.text },
  furnitureCost: { justifyContent: 'center', gap: spacing.sm },
});
