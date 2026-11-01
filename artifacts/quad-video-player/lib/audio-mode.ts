/** Sync means shared slider levels; disabling it selects actual loudness DSP. */
export function getVideoAudioMode(
  normalizeEnabled: boolean,
  syncEnabled: boolean,
): 'independent' | 'shared' | 'normalized' {
  if (!normalizeEnabled) return 'independent';
  return syncEnabled ? 'shared' : 'normalized';
}
