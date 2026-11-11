import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useGame } from '@/state/gameStore';
import { useSettings } from '@/state/settingsStore';

import {
  ambienceForEra,
  refreshAudioSettings,
  resumeAudio,
  setAmbience,
  setAudioPaused,
} from './index';

/** Keeps the ambience in sync with the era, the settings and the app state. */
export function AudioManager() {
  const era = useGame((s) => s.game.era);
  const musicVolume = useSettings((s) => s.musicVolume);
  const muted = useSettings((s) => s.muted);

  useEffect(() => {
    setAmbience(ambienceForEra(era));
  }, [era]);

  useEffect(() => {
    refreshAudioSettings();
  }, [musicVolume, muted]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAudioPaused(state !== 'active'));
    return () => sub.remove();
  }, []);

  // Web autoplay policy: start the ambience on the first click or key press.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const start = () => {
      resumeAudio();
      document.removeEventListener('pointerdown', start);
      document.removeEventListener('keydown', start);
    };
    document.addEventListener('pointerdown', start);
    document.addEventListener('keydown', start);
    return () => {
      document.removeEventListener('pointerdown', start);
      document.removeEventListener('keydown', start);
    };
  }, []);

  return null;
}
