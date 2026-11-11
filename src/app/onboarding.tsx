import { router } from 'expo-router';

import { useGame } from '@/state/gameStore';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/components';

export default function Onboarding() {
  const dispatch = useGame((s) => s.dispatch);
  return (
    <Screen hud={false}>
      <Button
        testID="onboarding-start"
        label="Commencer"
        onPress={() => {
          dispatch({ type: 'claim_starter_bonus' });
          dispatch({ type: 'finish_onboarding' });
          router.replace('/');
        }}
      />
    </Screen>
  );
}
