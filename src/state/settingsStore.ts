import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface SettingsState {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  /** Demo only: days added to the device calendar ("Passer au lendemain"). */
  dayOffset: number;
  /** The player connected Apple Health / Health Connect on this device. */
  healthEnabled: boolean;
  healthSyncedAt: number | null;
  /** The player linked a Strava account (online mode). */
  stravaEnabled: boolean;
  setStravaEnabled: (enabled: boolean) => void;
  setHealthEnabled: (enabled: boolean) => void;
  setHealthSyncedAt: (at: number) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setMuted: (muted: boolean) => void;
  shiftDay: (days: number) => void;
  resetDayOffset: () => void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Math.round(v * 10) / 10));

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      musicVolume: 0.5,
      sfxVolume: 0.8,
      muted: false,
      dayOffset: 0,
      healthEnabled: false,
      healthSyncedAt: null,
      stravaEnabled: false,
      setStravaEnabled: (stravaEnabled) => set({ stravaEnabled }),
      setHealthEnabled: (healthEnabled) => set({ healthEnabled }),
      setHealthSyncedAt: (healthSyncedAt) => set({ healthSyncedAt }),
      setMusicVolume: (v) => set({ musicVolume: clamp01(v) }),
      setSfxVolume: (v) => set({ sfxVolume: clamp01(v) }),
      setMuted: (muted) => set({ muted }),
      shiftDay: (days) => set((s) => ({ dayOffset: s.dayOffset + days })),
      resetDayOffset: () => set({ dayOffset: 0 }),
    }),
    { name: 'sportmotion/settings/v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
