import { Canvas, Circle, Group, Picture } from '@shopify/react-native-skia';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { ComponentRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import type { DrawOp } from '../draw';
import { clampScale, fitCamera, project, screenToWorld, tileAt, zoomAt } from '../iso';
import type { Camera } from '../iso';
import { picture } from './renderOps';

export interface IsoMapHandle {
  zoomBy: (factor: number) => void;
  recenter: () => void;
}

export interface IsoMapProps {
  /** Static scene (rebuilt only when the data changes). */
  scene: readonly DrawOp[];
  /** Ghost / selection, redrawn often. */
  overlay?: readonly DrawOp[];
  /** Grid rectangle the camera frames initially and on "recenter". */
  view: { x: number; y: number; w: number; h: number };
  onTapTile: (x: number, y: number) => void;
  /** Tile where a "placed" ripple plays; change `key` to replay. */
  pulse?: { x: number; y: number; key: number } | null;
  background?: string;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Pannable / zoomable isometric canvas. The scene is recorded into a Skia picture; pan and
 * zoom only change a transform driven by shared values, so nothing re-renders while moving.
 */
export const IsoMap = forwardRef<IsoMapHandle, IsoMapProps>(function IsoMap(
  { scene, overlay, view, onTapTile, pulse, background = '#A9CC8A', accessibilityLabel, testID },
  ref,
) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const start = useRef<Camera>({ tx: 0, ty: 0, scale: 1 });
  const framed = useRef(false);

  const camera = (): Camera => ({ tx: tx.get(), ty: ty.get(), scale: scale.get() });
  const apply = (c: Camera, animated = false) => {
    if (animated) {
      const config = { duration: 220, easing: Easing.out(Easing.cubic) };
      tx.set(withTiming(c.tx, config));
      ty.set(withTiming(c.ty, config));
      scale.set(withTiming(c.scale, config));
    } else {
      tx.set(c.tx);
      ty.set(c.ty);
      scale.set(c.scale);
    }
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
    if (!framed.current && width > 0 && height > 0) {
      framed.current = true;
      apply(fitCamera(view, width, height));
    }
  };

  useImperativeHandle(ref, () => ({
    zoomBy: (factor) => apply(zoomAt(camera(), factor, size.w / 2, size.h / 2), true),
    recenter: () => apply(fitCamera(view, size.w, size.h), true),
  }));

  const scenePicture = useMemo(() => picture(scene), [scene]);
  const overlayPicture = useMemo(() => (overlay ? picture(overlay) : null), [overlay]);

  // "Placed" ripple: a ring growing and fading on the tile.
  const ripple = useSharedValue(1);
  const pulseKey = pulse?.key;
  useEffect(() => {
    if (pulseKey === undefined) return;
    ripple.set(0);
    ripple.set(withTiming(1, { duration: 550, easing: Easing.out(Easing.quad) }));
  }, [pulseKey, ripple]);
  const rippleCenter = pulse ? project(pulse.x, pulse.y) : { x: 0, y: 0 };
  const rippleRadius = useDerivedValue(() => 10 + ripple.get() * 70);
  const rippleOpacity = useDerivedValue(() => (1 - ripple.get()) * 0.8);

  const transform = useDerivedValue(() => [
    { translateX: tx.get() },
    { translateY: ty.get() },
    { scale: scale.get() },
  ]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(6)
      .onStart(() => {
        start.current = { tx: tx.get(), ty: ty.get(), scale: scale.get() };
      })
      .onUpdate((e) => {
        tx.set(start.current.tx + e.translationX);
        ty.set(start.current.ty + e.translationY);
      });
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => {
        start.current = { tx: tx.get(), ty: ty.get(), scale: scale.get() };
      })
      .onUpdate((e) => {
        const next = zoomAt(start.current, e.scale, e.focalX, e.focalY);
        tx.set(next.tx);
        ty.set(next.ty);
        scale.set(next.scale);
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(8)
      .onEnd((e, success) => {
        if (!success) return;
        const world = screenToWorld({ tx: tx.get(), ty: ty.get(), scale: scale.get() }, e.x, e.y);
        const tile = tileAt(world.x, world.y);
        onTapTile(tile.x, tile.y);
      });
    return Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));
  }, [onTapTile, scale, tx, ty]);

  // Mouse wheel zoom on the web.
  const container = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = container.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0015);
      const current = { tx: tx.get(), ty: ty.get(), scale: scale.get() };
      const next = zoomAt(current, factor, event.clientX - rect.left, event.clientY - rect.top);
      tx.set(next.tx);
      ty.set(next.ty);
      scale.set(clampScale(next.scale));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [scale, tx, ty]);

  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={container}
        style={[styles.fill, { backgroundColor: background }]}
        onLayout={onLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        <Canvas style={styles.fill}>
          <Group transform={transform}>
            <Picture picture={scenePicture} />
            {overlayPicture ? <Picture picture={overlayPicture} /> : null}
            {pulse ? (
              <Circle
                cx={rippleCenter.x}
                cy={rippleCenter.y}
                r={rippleRadius}
                opacity={rippleOpacity}
                color="#FFFFFF"
                style="stroke"
                strokeWidth={5}
              />
            ) : null}
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export default IsoMap;
