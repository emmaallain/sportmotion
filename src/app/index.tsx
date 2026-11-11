import { Text, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

export default function Home() {
  return (
    <View style={{ flex: 1 }}>
      <Text>SportMotion</Text>
      <WithSkiaWeb
        opts={{ locateFile: (file: string) => `/${file}` }}
        getComponent={() => import('@/render/Smoke')}
        fallback={<Text>Chargement…</Text>}
      />
    </View>
  );
}
