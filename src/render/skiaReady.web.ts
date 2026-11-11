import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

/** Web: Skia runs on CanvasKit (WebAssembly), served from /canvaskit.wasm. */
export const skiaReady: Promise<void> = LoadSkiaWeb({
  locateFile: (file: string) => `/${file}`,
});
