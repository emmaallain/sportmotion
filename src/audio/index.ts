import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

import type { EraId } from '@/game/progression';
import { useSettings } from '@/state/settingsStore';

export type SfxName = 'place' | 'purchase' | 'quest' | 'level_up' | 'chest';
export type AmbienceName = 'village' | 'bourg' | 'ville';

const SFX_SOURCES: Record<SfxName, number> = {
  place: require('../../assets/audio/sfx-place.wav'),
  purchase: require('../../assets/audio/sfx-purchase.wav'),
  quest: require('../../assets/audio/sfx-quest.wav'),
  level_up: require('../../assets/audio/sfx-level-up.wav'),
  chest: require('../../assets/audio/sfx-chest.wav'),
};

const AMBIENCE_SOURCES: Record<AmbienceName, number> = {
  village: require('../../assets/audio/ambience-village.wav'),
  bourg: require('../../assets/audio/ambience-bourg.wav'),
  ville: require('../../assets/audio/ambience-ville.wav'),
};

/** One ambience per era; the Métropole reuses the city loop for now. */
export function ambienceForEra(era: EraId): AmbienceName {
  if (era <= 1) return 'village';
  if (era === 2) return 'bourg';
  return 'ville';
}

/** Volume actually applied, given the settings. */
export function effectiveVolume(volume: number, muted: boolean): number {
  return muted ? 0 : Math.min(1, Math.max(0, volume));
}

const sfxPlayers = new Map<SfxName, AudioPlayer>();
let ambience: { name: AmbienceName; player: AudioPlayer } | null = null;
let wantedAmbience: AmbienceName | null = null;
let paused = false;
let modeConfigured = false;

/** Audio must never break the game: every call into the native module is guarded. */
function safely(action: () => void): void {
  try {
    action();
  } catch {
    // no audio device, autoplay refused, module unavailable in tests…
  }
}

function configureMode(): void {
  if (modeConfigured) return;
  modeConfigured = true;
  // `playsInSilentMode: false` makes the game respect the phone's silent switch;
  // `mixWithOthers` leaves the player's own music or podcast running.
  void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(
    () => undefined,
  );
}

export function playSfx(name: SfxName): void {
  const { sfxVolume, muted } = useSettings.getState();
  const volume = effectiveVolume(sfxVolume, muted);
  if (volume === 0) return;
  safely(() => {
    configureMode();
    let player = sfxPlayers.get(name);
    if (!player) {
      player = createAudioPlayer(SFX_SOURCES[name]);
      sfxPlayers.set(name, player);
    }
    player.volume = volume;
    void player.seekTo(0).catch(() => undefined);
    player.play();
  });
}

function applyAmbience(): void {
  const { musicVolume, muted } = useSettings.getState();
  const volume = effectiveVolume(musicVolume, muted);
  safely(() => {
    if (ambience && ambience.name !== wantedAmbience) {
      ambience.player.pause();
      ambience.player.remove();
      ambience = null;
    }
    if (!wantedAmbience) return;
    if (!ambience) {
      configureMode();
      const player = createAudioPlayer(AMBIENCE_SOURCES[wantedAmbience]);
      player.loop = true;
      ambience = { name: wantedAmbience, player };
    }
    ambience.player.volume = volume;
    if (volume === 0 || paused) ambience.player.pause();
    else ambience.player.play();
  });
}

/** Switches the looping ambience (no-op when it is already playing). */
export function setAmbience(name: AmbienceName | null): void {
  wantedAmbience = name;
  applyAmbience();
}

/** Re-reads the volume / mute settings. */
export function refreshAudioSettings(): void {
  applyAmbience();
}

/** Pauses the ambience while the app is in the background. */
export function setAudioPaused(value: boolean): void {
  paused = value;
  applyAmbience();
}

/** Browsers only allow audio after a user gesture: call this from the first interaction. */
export function resumeAudio(): void {
  applyAmbience();
}
