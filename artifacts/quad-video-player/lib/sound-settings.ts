export type Reverb = 'off' | 'room' | 'hall' | 'plate';
export type SoundSettings = { eq: boolean; bands: number[]; reverb: Reverb; echo: boolean };
export const DEFAULT_SOUND: SoundSettings = { eq: false, bands: [0, 0, 0, 0, 0], reverb: 'off', echo: false };
export const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0],
  Bass: [6, 3, 0, -1, -2],
  Voice: [-3, -1, 4, 3, -2],
  Bright: [-2, 0, 1, 3, 5],
};
export function parseSoundSettings(raw: string | null): SoundSettings {
  if (!raw) return { ...DEFAULT_SOUND, bands: [...DEFAULT_SOUND.bands] };
  const value = JSON.parse(raw);
  return {
    eq: value?.eq === true,
    bands: Array.from({ length: 5 }, (_, i) => {
      const band = value?.bands?.[i];
      return typeof band === 'number' && Number.isFinite(band) ? Math.max(-12, Math.min(12, Math.round(band))) : 0;
    }),
    reverb: ['room', 'hall', 'plate'].includes(value?.reverb) ? value.reverb : 'off',
    echo: value?.echo === true,
  };
}
