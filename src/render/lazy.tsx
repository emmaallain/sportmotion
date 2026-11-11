import { Suspense, forwardRef, lazy } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { IsoMapHandle, IsoMapProps } from './skia/IsoMap';
import { skiaReady } from './skiaReady';

export type { IsoMapHandle, IsoMapProps };

/**
 * Everything that imports `@shopify/react-native-skia` lives under `render/skia/` and is only
 * reached through dynamic imports: on the web, CanvasKit must be initialised first.
 */
const LazyIsoMap = lazy(async () => {
  await skiaReady;
  return import('./skia/IsoMap');
});

export const IsoMap = forwardRef<IsoMapHandle, IsoMapProps>(function IsoMapLoader(props, ref) {
  return (
    <Suspense
      fallback={
        <View style={[styles.fallback, { backgroundColor: props.background ?? '#A9CC8A' }]}>
          <ActivityIndicator color="#FFFFFF" size="large" />
        </View>
      }
    >
      <LazyIsoMap ref={ref} {...props} />
    </Suspense>
  );
});

/** PNG data URI of a sprite, for the shop. Resolves to null when Skia cannot render it. */
export async function spriteThumbnail(
  kind: 'city' | 'furniture',
  spriteId: string,
  size: readonly [number, number],
): Promise<string | null> {
  try {
    await skiaReady;
    const { renderThumbnail } = await import('./skia/thumbnails');
    return renderThumbnail(kind, spriteId, size);
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
