import { Canvas, Group, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

export default function Smoke() {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        const p = Skia.Paint();
        p.setColor(Skia.Color('#6a9a4a'));
        const path = Skia.Path.Polygon(
          [
            { x: 100, y: 50 },
            { x: 200, y: 100 },
            { x: 100, y: 150 },
            { x: 0, y: 100 },
          ],
          true,
        );
        canvas.drawPath(path, p);
      }),
    [],
  );
  const transform = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }]);
  const pan = Gesture.Pan()
    .onStart(() => {
      sx.set(tx.get());
      sy.set(ty.get());
    })
    .onUpdate((e) => {
      tx.set(sx.get() + e.translationX);
      ty.set(sy.get() + e.translationY);
    });
  return (
    <GestureDetector gesture={pan}>
      <Canvas style={{ width: 400, height: 400 }}>
        <Group transform={transform}>
          <Picture picture={picture} />
        </Group>
      </Canvas>
    </GestureDetector>
  );
}
