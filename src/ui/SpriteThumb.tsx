import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { spriteThumbnail } from '@/render/lazy';

import { colors, radius } from './theme';

/** Small picture of a sprite, rendered once by Skia and cached. Decorative. */
export function SpriteThumb({
  kind,
  spriteId,
  size,
  pixels = 72,
  dimmed = false,
}: {
  kind: 'city' | 'furniture';
  spriteId: string;
  size: readonly [number, number];
  pixels?: number;
  dimmed?: boolean;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [w, h] = size;
  useEffect(() => {
    let alive = true;
    void spriteThumbnail(kind, spriteId, [w, h]).then((result) => {
      if (alive) setUri(result);
    });
    return () => {
      alive = false;
    };
  }, [kind, spriteId, w, h]);

  return (
    <View
      style={[styles.frame, { width: pixels, height: pixels }, dimmed && styles.dimmed]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {uri ? <Image source={{ uri }} style={{ width: pixels - 8, height: pixels - 8 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    backgroundColor: '#DCE9CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.45, backgroundColor: colors.surfaceAlt },
});
