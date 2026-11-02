export type Reverb = 'off' | 'room' | 'chamber' | 'hall' | 'cathedral' | 'plate' | 'spring';
export type SoundSettings = {
  eq: boolean; bands: number[]; reverb: Reverb; reverbMix: number;
  reverbDecay: number; preDelayMs: number; echo: boolean;
};
export const DEFAULT_SOUND: SoundSettings = {
  eq: false, bands: [0, 0, 0, 0, 0], reverb: 'off',
  reverbMix: 22, reverbDecay: 0.68, preDelayMs: 0, echo: false,
};
export const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0],
  Bass: [6, 3, 0, -1, -2],
  Voice: [-3, -1, 4, 3, -2],
  Bright: [-2, 0, 1, 3, 5],
};
export const ADVANCED_EQ_PRESETS = {
  Cinematic: [4, 2, 0, 2, 4],
  'Warm vinyl': [3, 2, -1, -2, -4],
  'Night drive': [2, 0, -1, 2, 4],
  'Soft focus': [-2, 1, 3, 1, -2],
};
function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function parseSoundSettings(raw: string | null): SoundSettings {
  if (!raw) return { ...DEFAULT_SOUND, bands: [...DEFAULT_SOUND.bands] };
  const value = JSON.parse(raw);
  return {
    eq: value?.eq === true,
    bands: Array.from({ length: 5 }, (_, i) => {
      const band = value?.bands?.[i];
      return typeof band === 'number' && Number.isFinite(band) ? Math.max(-12, Math.min(12, Math.round(band))) : 0;
    }),
    reverb: ['room', 'chamber', 'hall', 'cathedral', 'plate', 'spring'].includes(value?.reverb) ? value.reverb : 'off',
    reverbMix: Math.round(bounded(value?.reverbMix, DEFAULT_SOUND.reverbMix, 0, 100)),
    reverbDecay: bounded(value?.reverbDecay, DEFAULT_SOUND.reverbDecay, 0.2, 0.95),
    preDelayMs: Math.round(bounded(value?.preDelayMs, DEFAULT_SOUND.preDelayMs, 0, 120)),
    echo: value?.echo === true,
  };
}
