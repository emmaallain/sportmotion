import { ImageFormat, Skia } from '@shopify/react-native-skia';

import { opsBounds } from '../draw';
import { citySprite, furnitureSprite } from '../sprites';
import { renderOps } from './renderOps';

const cache = new Map<string, string | null>();

/** Thumbnails are always rendered at this size and scaled by the <Image>. */
const SIDE = 192;

// One shared surface: on the web every offscreen surface owns a WebGL context, and browsers
// only keep ~16 of them alive — creating one per thumbnail would kill the map's own canvas.
let shared: ReturnType<typeof Skia.Surface.MakeOffscreen> | undefined;
function surface() {
  if (shared === undefined) shared = Skia.Surface.MakeOffscreen(SIDE, SIDE);
  return shared;
}

/** Renders a sprite into an offscreen surface and returns it as a PNG data URI. */
export function renderThumbnail(
  kind: 'city' | 'furniture',
  spriteId: string,
  size: readonly [number, number],
): string | null {
  const key = `${kind}:${spriteId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const [w, h] = size;
  const ops = kind === 'city' ? citySprite(spriteId, w, h) : furnitureSprite(spriteId, w, h);
  const bounds = opsBounds(ops);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const side = SIDE;
  const scale = Math.min((side - 8) / width, (side - 8) / height);

  let uri: string | null = null;
  const target = surface();
  if (target) {
    const canvas = target.getCanvas();
    canvas.save();
    canvas.clear(Skia.Color('#00000000'));
    canvas.translate(
      (side - width * scale) / 2 - bounds.minX * scale,
      (side - height * scale) / 2 - bounds.minY * scale,
    );
    canvas.scale(scale, scale);
    renderOps(canvas, ops);
    canvas.restore();
    target.flush();
    const base64 = target.makeImageSnapshot().encodeToBase64(ImageFormat.PNG, 100);
    uri = base64 ? `data:image/png;base64,${base64}` : null;
  }
  cache.set(key, uri);
  return uri;
}
