import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { playSfx } from '@/audio';
import { getCityItem } from '@/game/catalog';
import type { CityItem } from '@/game/catalog';
import {
  EXTRA_PLOT_MIN_ERA,
  MAX_PLOTS,
  canPlace,
  footprint,
  itemAt,
  nextPlotPrice,
  plotRect,
} from '@/game/city';
import type { Rotation } from '@/game/city';
import { ALL_MATERIALS } from '@/game/economy';
import { SELL_REFUND_RATE, canAfford, readyHarvests } from '@/game/engine';
import { t } from '@/i18n';
import { IsoMap } from '@/render/lazy';
import type { IsoMapHandle } from '@/render/lazy';
import { CITY_VIEW, buildCityScene, ghostOps, harvestBadgeOps, selectionOps } from '@/render/scene';
import { useGame } from '@/state/gameStore';
import { useUi } from '@/state/uiStore';
import { CraftDialog } from '@/ui/CraftDialog';
import { Screen } from '@/ui/Screen';
import { Button, CostRow } from '@/ui/components';
import { ConfirmDialog } from '@/ui/dialogs';
import { TOUCH, colors, font, icons, radius, spacing } from '@/ui/theme';

let idCounter = 0;
const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

function ZoomButton({
  glyph,
  label,
  onPress,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.zoomButton}
    >
      <Text style={styles.zoomGlyph}>{glyph}</Text>
    </Pressable>
  );
}

export default function CityScreen() {
  const game = useGame((s) => s.game);
  const today = useGame((s) => s.today);
  const dispatch = useGame((s) => s.dispatch);
  const placement = useUi((s) => s.placement);
  const selectedId = useUi((s) => s.selectedId);
  const tutorial = useUi((s) => s.tutorial);
  const setPlacement = useUi((s) => s.setPlacement);
  const select = useUi((s) => s.select);

  const map = useRef<IsoMapHandle>(null);
  const [pulse, setPulse] = useState<{ x: number; y: number; key: number } | null>(null);
  const [confirmSell, setConfirmSell] = useState(false);
  const [confirmPlot, setConfirmPlot] = useState(false);
  const [crafting, setCrafting] = useState<CityItem | null>(null);

  const city = game.city;
  const placingItem = placement ? getCityItem(placement.itemId) : undefined;
  const selected = city.items.find((p) => p.id === selectedId);
  const selectedItem = selected ? getCityItem(selected.itemId) : undefined;
  const plotPrice = nextPlotPrice(city.plots);
  const canBuyPlot = game.era >= EXTRA_PLOT_MIN_ERA && city.plots < MAX_PLOTS && plotPrice !== null;
  const hiddenId = placement?.mode === 'move' ? placement.id : null;

  const scene = useMemo(
    () => buildCityScene(city, { hiddenId, showNextPlot: canBuyPlot }),
    [city, hiddenId, canBuyPlot],
  );

  const placementCheck =
    placement !== null && placingItem !== undefined && placement.x !== null && placement.y !== null
      ? canPlace(
          city,
          getCityItem,
          placingItem,
          placement.x,
          placement.y,
          placement.rot,
          hiddenId ?? undefined,
        )
      : null;
  const placementValid = placementCheck?.ok === true;
  // Why the ghost is red, in words (colour alone is not enough).
  const placementProblem =
    placementCheck && !placementCheck.ok ? t.errors.placement[placementCheck.reason] : undefined;

  // Buildings whose harvest is ready (their quest is validated today).
  const ready = useMemo(() => readyHarvests(game, today), [game, today]);
  const harvestDay = game.days[today];
  const selectedHarvest = selectedItem?.harvest;
  const selectedReady = selected !== undefined && ready.some((p) => p.id === selected.id);
  const selectedHarvested =
    selected !== undefined && (harvestDay?.harvested ?? []).some((h) => h.id === selected.id);

  const ghostItemId = placement?.itemId;
  const ghostX = placement?.x ?? null;
  const ghostY = placement?.y ?? null;
  const ghostRot = placement?.rot ?? 0;
  const selectedItemId = selected?.itemId;
  const selectedX = selected?.x ?? 0;
  const selectedY = selected?.y ?? 0;
  const selectedRot = selected?.rot ?? 0;
  const overlay = useMemo(() => {
    const ghost = ghostItemId ? getCityItem(ghostItemId) : undefined;
    if (ghost && ghostX !== null && ghostY !== null) {
      return ghostOps(ghost.sprite, ghost.size, ghostX, ghostY, ghostRot, placementValid);
    }
    const badges = ready.flatMap((placed) => {
      const readyItem = getCityItem(placed.itemId);
      if (!readyItem?.harvest) return [];
      const [w, h] = footprint(readyItem.size, placed.rot);
      const material = ALL_MATERIALS.find((m) => (readyItem.harvest?.yield[m] ?? 0) > 0);
      return harvestBadgeOps(placed.x, placed.y, w, h, colors.materials[material ?? 'wood'] ?? '');
    });
    const item = selectedItemId ? getCityItem(selectedItemId) : undefined;
    if (item) {
      const [w, h] = footprint(item.size, selectedRot);
      return [...selectionOps(selectedX, selectedY, w, h), ...badges];
    }
    return badges.length > 0 ? badges : undefined;
  }, [
    ready,
    ghostItemId,
    ghostX,
    ghostY,
    ghostRot,
    placementValid,
    selectedItemId,
    selectedX,
    selectedY,
    selectedRot,
  ]);

  const placeAt = useCallback(
    (x: number, y: number, rot: Rotation): boolean => {
      const current = useUi.getState().placement;
      const item = current ? getCityItem(current.itemId) : undefined;
      if (!current || !item) return false;
      const result =
        current.mode === 'move'
          ? dispatch({ type: 'move_item', id: current.id, x, y, rot })
          : dispatch({ type: 'place_item', id: newId('b'), itemId: item.id, x, y, rot });
      if (!result.ok) return false;
      playSfx('place');
      const [w, h] = footprint(item.size, rot);
      setPulse({ x: x + w / 2, y: y + h / 2, key: Date.now() });
      return true;
    },
    [dispatch],
  );

  const onTapTile = useCallback(
    (x: number, y: number) => {
      const ui = useUi.getState();
      const { game: current } = useGame.getState();
      const active = ui.placement;
      if (active) {
        const item = getCityItem(active.itemId);
        if (item?.kind === 'road' && active.mode === 'new') {
          // roads are traced tile by tile and the mode stays on
          placeAt(x, y, 0);
          return;
        }
        ui.setPlacement({ ...active, x, y });
        return;
      }
      // A building is taller than its footprint: when the tapped tile is empty (or a road),
      // the tap may have landed on the walls of a building standing just in front.
      let hit = itemAt(current.city, getCityItem, x, y);
      if (!hit || getCityItem(hit.itemId)?.kind === 'road') {
        for (const k of [1, 2]) {
          const front = itemAt(current.city, getCityItem, x + k, y + k);
          if (front && getCityItem(front.itemId)?.kind === 'building') {
            hit = front;
            break;
          }
        }
      }
      if (hit) {
        ui.select(hit.id === ui.selectedId ? null : hit.id);
        return;
      }
      ui.select(null);
      if (current.era >= EXTRA_PLOT_MIN_ERA && current.city.plots < MAX_PLOTS) {
        const next = plotRect(current.city.plots);
        if (x >= next.x && x < next.x + next.size && y >= next.y && y < next.y + next.size) {
          setConfirmPlot(true);
        }
      }
    },
    [placeAt],
  );

  const confirmPlacement = () => {
    if (!placement || placement.x === null || placement.y === null) return;
    if (!placeAt(placement.x, placement.y, placement.rot)) return;
    setPlacement(null);
    if (tutorial === 'place_house') {
      dispatch({ type: 'finish_onboarding' });
      useUi.getState().setTutorial(null);
      useUi.getState().pushToast(t.onboarding.tutorialDone, 'success');
    }
  };

  const rotate = () => {
    if (!placement) return;
    setPlacement({ ...placement, rot: placement.rot === 0 ? 1 : 0 } as typeof placement);
  };

  const zoomIn = () => map.current?.zoomBy(1.35);
  const zoomOut = () => map.current?.zoomBy(1 / 1.35);
  const recenter = () => map.current?.recenter();

  const isRoadMode = placement?.mode === 'new' && placingItem?.kind === 'road';
  const refund = selectedItem ? Math.floor(selectedItem.cost.pulses * SELL_REFUND_RATE) : 0;

  return (
    <Screen scroll={false}>
      <View style={styles.fill}>
        <IsoMap
          ref={map}
          scene={scene}
          overlay={overlay}
          view={CITY_VIEW}
          onTapTile={onTapTile}
          pulse={pulse}
          accessibilityLabel={t.city.mapLabel}
          testID="city-map"
        />

        <View style={styles.zoom} pointerEvents="box-none">
          <ZoomButton glyph="＋" label={t.city.zoomIn} onPress={zoomIn} />
          <ZoomButton glyph="－" label={t.city.zoomOut} onPress={zoomOut} />
          <ZoomButton glyph="⌖" label={t.city.recenter} onPress={recenter} />
        </View>

        {canBuyPlot && !placement && !selected ? (
          <View style={styles.plot} pointerEvents="box-none">
            <Button
              small
              variant="secondary"
              testID="buy-plot"
              icon="🗺️"
              label={t.city.buyPlot(plotPrice ?? 0)}
              onPress={() => setConfirmPlot(true)}
            />
          </View>
        ) : null}

        {ready.length > 0 && !placement && !selected ? (
          <View style={styles.harvest} pointerEvents="box-none">
            <Button
              small
              testID="harvest-all"
              icon="🧺"
              label={t.city.harvestAll(ready.length)}
              onPress={() => dispatch({ type: 'harvest_all' })}
            />
          </View>
        ) : null}

        {tutorial === 'place_house' ? (
          <View style={styles.tutorial} pointerEvents="none">
            <Text style={styles.tutorialText}>👆 {t.onboarding.tutorialPlace}</Text>
          </View>
        ) : null}
      </View>

      {placement && placingItem ? (
        <View style={styles.bar} testID="placement-bar">
          <View style={styles.barHeader}>
            <View style={styles.flex}>
              <Text style={styles.barTitle}>{t.city.placing(t.items[placingItem.id] ?? '')}</Text>
              {placementProblem && !isRoadMode ? (
                <Text style={styles.barProblem} accessibilityLiveRegion="polite">
                  ⚠️ {placementProblem}
                </Text>
              ) : (
                <Text style={styles.barHint}>
                  {isRoadMode ? t.city.roadHint : t.city.placingHint}
                </Text>
              )}
            </View>
            {placement.mode === 'new' ? (
              <CostRow cost={placingItem.cost} balances={game.balances} />
            ) : null}
          </View>
          <View style={styles.actions}>
            {tutorial === 'place_house' ? null : (
              <Button
                small
                variant="secondary"
                testID="placement-cancel"
                label={isRoadMode ? t.common.done : t.common.cancel}
                onPress={() => setPlacement(null)}
                style={styles.flex}
              />
            )}
            {placingItem.rotatable ? (
              <Button
                small
                variant="secondary"
                testID="placement-rotate"
                icon="↻"
                label={t.city.rotate}
                onPress={rotate}
                style={styles.flex}
              />
            ) : null}
            {isRoadMode ? null : (
              <Button
                small
                testID="placement-confirm"
                label={t.city.place}
                disabled={
                  !placementValid ||
                  (placement.mode === 'new' && !canAfford(game.balances, placingItem.cost))
                }
                onPress={confirmPlacement}
                style={styles.flex}
              />
            )}
          </View>
        </View>
      ) : selected && selectedItem ? (
        <View style={styles.bar} testID="selection-bar">
          <View style={styles.barHeader}>
            <Text style={[styles.barTitle, styles.flex]} accessibilityLiveRegion="polite">
              {t.items[selectedItem.id]}
            </Text>
            <Button small variant="ghost" label={t.common.close} onPress={() => select(null)} />
          </View>
          {selectedHarvest && !selectedReady ? (
            <Text style={styles.barHint}>
              {selectedHarvested
                ? `✓ ${t.city.harvestDone}`
                : t.city.harvestWaiting(
                    selectedHarvest.trigger === 'full_day'
                      ? t.quests.fullDayShort
                      : t.quests[selectedHarvest.trigger],
                  )}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {selectedReady && selectedHarvest ? (
              <Button
                small
                testID="harvest-item"
                icon="🧺"
                label={`${t.city.harvest} ${ALL_MATERIALS.filter(
                  (m) => (selectedHarvest.yield[m] ?? 0) > 0,
                )
                  .map((m) => `+${selectedHarvest.yield[m]} ${icons.materials[m]}`)
                  .join(' ')}`}
                onPress={() => dispatch({ type: 'harvest', id: selected.id })}
                style={styles.flex}
              />
            ) : null}
            {selectedItem.maxRooms > 0 ? (
              <Button
                small
                testID="enter-house"
                icon="🚪"
                label={t.city.enter}
                onPress={() =>
                  router.push({ pathname: '/interior/[id]', params: { id: selected.id } })
                }
                style={styles.flex}
              />
            ) : null}
            {selectedItem.recipes.length > 0 ? (
              <Button
                small
                testID="open-craft"
                icon="🧱"
                label={t.city.craft}
                onPress={() => setCrafting(selectedItem)}
                style={styles.flex}
              />
            ) : null}
            <Button
              small
              variant="secondary"
              testID="move-item"
              label={t.city.move}
              onPress={() =>
                setPlacement({
                  mode: 'move',
                  id: selected.id,
                  itemId: selected.itemId,
                  rot: selected.rot,
                  x: selected.x,
                  y: selected.y,
                })
              }
              style={styles.flex}
            />
            <Button
              small
              variant="danger"
              testID="sell-item"
              label={t.city.sell}
              onPress={() => setConfirmSell(true)}
              style={styles.flex}
            />
          </View>
        </View>
      ) : (
        <View style={styles.bar}>
          {city.items.length === 0 ? <Text style={styles.barHint}>{t.city.emptyHint}</Text> : null}
          <Button
            testID="open-shop"
            icon="🔨"
            label={t.hud.build}
            onPress={() => router.push('/shop')}
          />
        </View>
      )}

      <ConfirmDialog
        visible={confirmSell && selectedItem !== undefined}
        title={t.city.sellConfirmTitle(selectedItem ? (t.items[selectedItem.id] ?? '') : '')}
        body={`${t.city.sellConfirmBody(refund)}${
          selected && game.interiors[selected.id] ? `\n\n${t.city.sellHouseWarning}` : ''
        }`}
        confirmLabel={t.city.sell}
        danger
        onCancel={() => setConfirmSell(false)}
        onConfirm={() => {
          setConfirmSell(false);
          if (selected) dispatch({ type: 'sell_item', id: selected.id });
          select(null);
        }}
      />
      <ConfirmDialog
        visible={confirmPlot}
        title={t.city.buyPlot(plotPrice ?? 0)}
        body={t.common.pulses(game.balances.pulses)}
        onCancel={() => setConfirmPlot(false)}
        onConfirm={() => {
          setConfirmPlot(false);
          if (dispatch({ type: 'buy_plot' }).ok) {
            useUi.getState().pushToast(t.city.plotBought, 'success');
          }
        }}
      />
      <CraftDialog building={crafting} onClose={() => setCrafting(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  zoom: { position: 'absolute', right: spacing.md, top: spacing.md, gap: spacing.sm },
  zoomButton: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: TOUCH / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomGlyph: { fontSize: 20, fontWeight: '700', color: colors.text },
  plot: { position: 'absolute', left: spacing.md, top: spacing.md },
  harvest: { position: 'absolute', left: spacing.md, bottom: spacing.md },
  tutorial: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.accent,
    padding: spacing.md,
  },
  tutorialText: {
    fontSize: font.label,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  barHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  barTitle: { fontSize: font.label, fontWeight: '800', color: colors.text },
  barHint: { fontSize: font.body, color: colors.textMuted },
  barProblem: { fontSize: font.body, color: colors.danger, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
