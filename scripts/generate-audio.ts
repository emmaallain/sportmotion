/**
 * Synthesises every sound of the game into assets/audio/*.wav.
 *
 * The sounds are generated from scratch (sine waves, filtered noise): no third-party
 * recording is involved, so they can be released as CC0. Deterministic: same output each run.
 *
 *   npm run gen:audio
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 22050;
const TAU = Math.PI * 2;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buffer = (seconds: number) => new Float32Array(Math.round(seconds * RATE));

/** Adds a decaying tone. `sweep` bends the pitch over the note (ratio at the end). */
function tone(
  out: Float32Array,
  start: number,
  duration: number,
  freq: number,
  gain: number,
  options: { sweep?: number; attack?: number; decay?: number; harmonics?: number[] } = {},
): void {
  const { sweep = 1, attack = 0.005, decay = 4, harmonics = [1] } = options;
  const begin = Math.round(start * RATE);
  const length = Math.round(duration * RATE);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    const k = i / length;
    const f = freq * (1 + (sweep - 1) * k);
    phase += (TAU * f) / RATE;
    const envelope = Math.min(1, t / attack) * Math.exp(-decay * k) * (1 - k) ** 0.5;
    let sample = 0;
    harmonics.forEach((h, n) => (sample += Math.sin(phase * (n + 1)) * h));
    const index = (begin + i) % out.length; // wrap: keeps loops seamless
    out[index] = (out[index] ?? 0) + sample * envelope * gain;
  }
}

/** Looping filtered noise (one-pole low-pass), with a slow swell. */
function wind(out: Float32Array, seed: number, cutoff: number, gain: number, swells: number): void {
  const rand = rng(seed);
  // Generate a bit more than needed, then blend the extra tail into the head: the last
  // sample of the loop flows straight into the first one, without a click.
  const fade = Math.round(0.5 * RATE);
  const raw = new Float32Array(out.length + fade);
  let low = 0;
  for (let i = 0; i < raw.length; i++) {
    low += cutoff * (rand() * 2 - 1 - low);
    raw[i] = low;
  }
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    raw[i] = (raw[i] ?? 0) * k + (raw[out.length + i] ?? 0) * (1 - k);
  }
  for (let i = 0; i < out.length; i++) {
    const swell = 0.65 + 0.35 * Math.sin((TAU * swells * i) / out.length);
    out[i] = (out[i] ?? 0) + (raw[i] ?? 0) * gain * swell;
  }
}

function chirp(out: Float32Array, at: number, base: number, gain: number, notes: number): void {
  for (let n = 0; n < notes; n++) {
    tone(out, at + n * 0.09, 0.07, base * (1 + n * 0.06), gain, { sweep: 1.25, decay: 3 });
  }
}

function bell(out: Float32Array, at: number, freq: number, gain: number): void {
  // inharmonic partials of a small bell
  for (const [ratio, level] of [
    [1, 1],
    [2.0, 0.6],
    [2.76, 0.4],
    [5.4, 0.25],
  ] as const) {
    tone(out, at, 2.6, freq * ratio, gain * level, { decay: 5, attack: 0.002 });
  }
}

function normalise(samples: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  if (max === 0) return samples;
  const k = peak / max;
  return samples.map((s) => s * k);
}

function fadeEdges(samples: Float32Array, seconds = 0.01): Float32Array {
  const n = Math.round(seconds * RATE);
  for (let i = 0; i < n; i++) {
    samples[i] = (samples[i] ?? 0) * (i / n);
    const j = samples.length - 1 - i;
    samples[j] = (samples[j] ?? 0) * (i / n);
  }
  return samples;
}

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2),
  );
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// ───────────────────────────── sound effects ─────────────────────────────

function sfxPlace(): Float32Array {
  const out = buffer(0.28);
  tone(out, 0, 0.16, 150, 1, { sweep: 0.5, decay: 5 }); // soft thud
  tone(out, 0.02, 0.2, 620, 0.25, { decay: 7 }); // wooden knock
  return fadeEdges(normalise(out, 0.8));
}

function sfxPurchase(): Float32Array {
  const out = buffer(0.4);
  tone(out, 0, 0.18, 1320, 0.7, { decay: 6 });
  tone(out, 0.07, 0.3, 1760, 0.7, { decay: 6 });
  return fadeEdges(normalise(out, 0.6));
}

function sfxQuest(): Float32Array {
  const out = buffer(0.7);
  [523.25, 659.25, 783.99].forEach((f, i) =>
    tone(out, i * 0.1, 0.45, f, 0.7, { decay: 4, harmonics: [1, 0.3] }),
  );
  return fadeEdges(normalise(out, 0.7));
}

function sfxLevelUp(): Float32Array {
  const out = buffer(1.3);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone(out, i * 0.13, 0.7, f, 0.7, { decay: 3, harmonics: [1, 0.35, 0.12] }),
  );
  tone(out, 0.52, 0.75, 1318.5, 0.4, { decay: 3 });
  return fadeEdges(normalise(out, 0.75));
}

function sfxChest(): Float32Array {
  const out = buffer(1.0);
  tone(out, 0, 0.12, 220, 0.8, { sweep: 1.6, decay: 4 }); // lid
  const rand = rng(11);
  for (let i = 0; i < 9; i++) {
    tone(out, 0.12 + i * 0.07, 0.3, 1400 + rand() * 1800, 0.35, { decay: 6 }); // sparkles
  }
  return fadeEdges(normalise(out, 0.7));
}

// ───────────────────────────── ambiences (seamless loops) ─────────────────────────────

/** Village: wind in the trees, birds, a distant hen and a cow. */
function ambienceVillage(): Float32Array {
  const out = buffer(12);
  wind(out, 1, 0.02, 0.9, 2);
  const rand = rng(21);
  for (let i = 0; i < 14; i++) {
    chirp(
      out,
      rand() * 11.5,
      2400 + rand() * 1600,
      0.1 + rand() * 0.08,
      2 + Math.floor(rand() * 4),
    );
  }
  for (const at of [3.1, 3.35, 3.6, 8.9, 9.1]) {
    tone(out, at, 0.09, 520, 0.09, { sweep: 1.5, decay: 5, harmonics: [1, 0.6, 0.4] }); // hen
  }
  tone(out, 6.2, 1.1, 150, 0.1, {
    sweep: 0.8,
    decay: 1.5,
    attack: 0.2,
    harmonics: [1, 0.7, 0.5, 0.3],
  }); // cow
  return normalise(out, 0.5);
}

/** Bourg: a little more life — birds, a church bell, a murmur. */
function ambienceBourg(): Float32Array {
  const out = buffer(12);
  wind(out, 2, 0.035, 0.7, 3);
  const rand = rng(22);
  for (let i = 0; i < 8; i++) {
    chirp(
      out,
      rand() * 11.5,
      2600 + rand() * 1200,
      0.08 + rand() * 0.06,
      2 + Math.floor(rand() * 3),
    );
  }
  bell(out, 1.5, 392, 0.16);
  bell(out, 4.5, 392, 0.14);
  bell(out, 7.5, 392, 0.12);
  for (let i = 0; i < 10; i++) {
    tone(out, rand() * 11, 0.25, 180 + rand() * 120, 0.03, {
      decay: 2,
      attack: 0.05,
      harmonics: [1, 0.5],
    });
  }
  return normalise(out, 0.5);
}

/** Ville: a soft urban hum, far-away traffic, a tram bell. */
function ambienceVille(): Float32Array {
  const out = buffer(12);
  wind(out, 3, 0.008, 1.2, 1);
  wind(out, 4, 0.05, 0.25, 4);
  tone(out, 0, 12, 82, 0.05, { decay: 0, attack: 1 });
  tone(out, 5.0, 0.5, 1175, 0.07, { decay: 4 });
  tone(out, 5.3, 0.5, 1175, 0.06, { decay: 4 });
  const rand = rng(23);
  for (let i = 0; i < 4; i++) {
    tone(out, rand() * 10, 2.2, 110 + rand() * 40, 0.06, { sweep: 0.8, decay: 1, attack: 0.8 }); // car passing
  }
  return normalise(out, 0.45);
}

const FILES: Record<string, () => Float32Array> = {
  'sfx-place.wav': sfxPlace,
  'sfx-purchase.wav': sfxPurchase,
  'sfx-quest.wav': sfxQuest,
  'sfx-level-up.wav': sfxLevelUp,
  'sfx-chest.wav': sfxChest,
  'ambience-village.wav': ambienceVillage,
  'ambience-bourg.wav': ambienceBourg,
  'ambience-ville.wav': ambienceVille,
};

const dir = join(__dirname, '..', 'assets', 'audio');
mkdirSync(dir, { recursive: true });
for (const [name, make] of Object.entries(FILES)) {
  const data = wav(make());
  writeFileSync(join(dir, name), data);
  console.log(`${name}  ${(data.length / 1024).toFixed(0)} Ko`);
}
