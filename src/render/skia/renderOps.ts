import { PaintStyle, Skia, createPicture } from '@shopify/react-native-skia';
import type { SkCanvas, SkPicture } from '@shopify/react-native-skia';

import type { DrawOp } from '../draw';

const colorCache = new Map<string, ReturnType<typeof Skia.Color>>();
function color(hex: string) {
  let c = colorCache.get(hex);
  if (!c) {
    c = Skia.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

/** Paints a display list onto a Skia canvas. */
export function renderOps(canvas: SkCanvas, ops: readonly DrawOp[]): void {
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setStyle(PaintStyle.Fill);
  const stroke = Skia.Paint();
  stroke.setAntiAlias(true);
  stroke.setStyle(PaintStyle.Stroke);

  for (const op of ops) {
    if (op.k === 'poly') {
      const points = [];
      for (let i = 0; i < op.pts.length; i += 2) {
        points.push({ x: op.pts[i] ?? 0, y: op.pts[i + 1] ?? 0 });
      }
      const path = Skia.Path.Polygon(points, true);
      fill.setColor(color(op.fill));
      canvas.drawPath(path, fill);
      if (op.stroke) {
        stroke.setColor(color(op.stroke));
        stroke.setStrokeWidth(op.sw ?? 1);
        canvas.drawPath(path, stroke);
      }
    } else if (op.k === 'ellipse') {
      const rect = Skia.XYWHRect(op.cx - op.rx, op.cy - op.ry, op.rx * 2, op.ry * 2);
      fill.setColor(color(op.fill));
      canvas.drawOval(rect, fill);
      if (op.stroke) {
        stroke.setColor(color(op.stroke));
        stroke.setStrokeWidth(1.5);
        canvas.drawOval(rect, stroke);
      }
    } else {
      stroke.setColor(color(op.color));
      stroke.setStrokeWidth(op.w);
      canvas.drawLine(op.x0, op.y0, op.x1, op.y1, stroke);
    }
  }
}

/** Records a display list once; the picture is then replayed cheaply every frame. */
export function picture(ops: readonly DrawOp[]): SkPicture {
  return createPicture((canvas) => renderOps(canvas, ops));
}
